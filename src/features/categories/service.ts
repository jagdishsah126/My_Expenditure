import { db, type FinanceDatabase } from "../../db/database";
import {
  categorySchema,
  tagSchema,
  type Category,
  type Tag,
} from "../../db/schema";

type CategoryInput = Pick<Category, "name" | "type"> & {
  parentId?: string;
  icon?: string;
};
type CategoryChanges = Partial<CategoryInput>;

function compatible(parent: Category, childType: Category["type"]): boolean {
  return parent.type === "both" || parent.type === childType;
}

async function validateParent(
  parentId: string | undefined,
  type: Category["type"],
  id: string | undefined,
  database: FinanceDatabase,
): Promise<void> {
  if (!parentId) return;
  const parent = await database.categories.get(parentId);
  if (!parent) throw new Error("Parent category not found");
  if (!parent.isActive) throw new Error("Parent category is archived");
  const seen = new Set<string>();
  let current: Category | undefined = parent;
  while (current) {
    if (current.id === id || seen.has(current.id))
      throw new Error("Category hierarchy cannot contain a cycle");
    seen.add(current.id);
    current = current.parentId
      ? await database.categories.get(current.parentId)
      : undefined;
  }
  if (!compatible(parent, type))
    throw new Error("Parent category type is incompatible");
}

export async function listCategories(
  options: { includeArchived?: boolean } = {},
  database: FinanceDatabase = db,
): Promise<Category[]> {
  const rows = options.includeArchived
    ? await database.categories.toArray()
    : await database.categories.filter((row) => row.isActive).toArray();
  return rows.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export async function createCategory(
  input: CategoryInput,
  database: FinanceDatabase = db,
): Promise<Category> {
  return database.transaction("rw", database.categories, async () => {
    const now = new Date().toISOString();
    const candidate = categorySchema.parse({
      ...input,
      id: crypto.randomUUID(),
      sortOrder: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await validateParent(
      candidate.parentId,
      candidate.type,
      undefined,
      database,
    );
    // Dexie does not index missing optional keys. Root siblings need a table scan.
    const siblings = candidate.parentId
      ? await database.categories
          .where("parentId")
          .equals(candidate.parentId)
          .toArray()
      : await database.categories.filter((row) => !row.parentId).toArray();
    const order =
      siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const category = { ...candidate, sortOrder: order };
    await database.categories.add(category);
    return category;
  });
}

export async function updateCategory(
  id: string,
  changes: CategoryChanges,
  database: FinanceDatabase = db,
): Promise<Category> {
  return database.transaction(
    "rw",
    database.categories,
    database.transactions,
    async () => {
      const old = await database.categories.get(id);
      if (!old) throw new Error("Category not found");
      const now = new Date().toISOString();
      const updated = categorySchema.parse({
        ...old,
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.type !== undefined ? { type: changes.type } : {}),
        ...(Object.hasOwn(changes, "parentId")
          ? { parentId: changes.parentId }
          : {}),
        ...(Object.hasOwn(changes, "icon") ? { icon: changes.icon } : {}),
        updatedAt: now,
      });
      await validateParent(updated.parentId, updated.type, id, database);
      if (updated.type !== old.type) {
        const descendants = await database.categories
          .where("parentId")
          .equals(id)
          .toArray();
        if (descendants.some((child) => !compatible(updated, child.type))) {
          throw new Error("New type is incompatible with a child category");
        }
        if (await isReferenced(id, database))
          throw new Error("Cannot change the type of a referenced category");
      }
      if (!updated.isActive && updated.parentId !== old.parentId)
        throw new Error("Restore a category before moving it");
      if (updated.parentId !== old.parentId) {
        const siblings = updated.parentId
          ? await database.categories
              .where("parentId")
              .equals(updated.parentId)
              .toArray()
          : await database.categories.filter((row) => !row.parentId).toArray();
        updated.sortOrder =
          siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
      }
      await database.categories.put(updated);
      return updated;
    },
  );
}

/** Provide exactly the sibling IDs (including archived siblings) in the desired order. */
export async function reorderCategories(
  parentId: string | undefined,
  orderedIds: string[],
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction("rw", database.categories, async () => {
    if (parentId && !(await database.categories.get(parentId)))
      throw new Error("Parent category not found");
    const siblings = parentId
      ? await database.categories.where("parentId").equals(parentId).toArray()
      : await database.categories.filter((row) => !row.parentId).toArray();
    if (
      orderedIds.length !== siblings.length ||
      new Set(orderedIds).size !== siblings.length ||
      orderedIds.some((id) => !siblings.some((row) => row.id === id))
    ) {
      throw new Error("Reorder must include each sibling exactly once");
    }
    const byId = new Map(siblings.map((row) => [row.id, row]));
    const now = new Date().toISOString();
    await database.categories.bulkPut(
      orderedIds.map((id, sortOrder) => ({
        ...byId.get(id)!,
        sortOrder,
        updatedAt: now,
      })),
    );
  });
}

async function subtree(
  id: string,
  database: FinanceDatabase,
): Promise<Category[]> {
  const result: Category[] = [];
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) throw new Error("Category hierarchy contains a cycle");
    seen.add(next);
    const category = await database.categories.get(next);
    if (!category) throw new Error("Category not found");
    result.push(category);
    queue.push(
      ...(
        await database.categories.where("parentId").equals(next).toArray()
      ).map((child) => child.id),
    );
  }
  return result;
}

/** Archives the entire subtree; historical transaction references remain intact. */
export async function archiveCategory(
  id: string,
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction("rw", database.categories, async () => {
    const nodes = await subtree(id, database);
    const now = new Date().toISOString();
    await database.categories.bulkPut(
      nodes.map((row) => ({ ...row, isActive: false, updatedAt: now })),
    );
  });
}

/** Restores this category only; previously archived descendants remain archived. */
export async function restoreCategory(
  id: string,
  database: FinanceDatabase = db,
): Promise<Category> {
  return database.transaction("rw", database.categories, async () => {
    const category = await database.categories.get(id);
    if (!category) throw new Error("Category not found");
    if (category.parentId) {
      const parent = await database.categories.get(category.parentId);
      if (!parent?.isActive)
        throw new Error("Restore the parent category first");
    }
    if (category.isActive) return category;
    const updated = {
      ...category,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    await database.categories.put(updated);
    return updated;
  });
}

async function isReferenced(
  id: string,
  database: FinanceDatabase,
): Promise<boolean> {
  if (await database.transactions.where("categoryId").equals(id).first())
    return true;
  return Boolean(
    await database.transactions
      .filter(
        (entry) =>
          (entry.type === "income" || entry.type === "expense") &&
          entry.subcategoryId === id,
      )
      .first(),
  );
}

/** Only an unreferenced leaf can be permanently deleted. Archive instead to keep history. */
export async function deleteCategory(
  id: string,
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.categories,
    database.transactions,
    async () => {
      if (!(await database.categories.get(id)))
        throw new Error("Category not found");
      if (await database.categories.where("parentId").equals(id).first())
        throw new Error("Delete child categories first");
      if (await isReferenced(id, database))
        throw new Error("Category is referenced by a transaction");
      await database.categories.delete(id);
    },
  );
}

export function normalizeTagLabel(label: string): string {
  return label
    .normalize("NFKC")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export async function listTags(database: FinanceDatabase = db): Promise<Tag[]> {
  return (await database.tags.toArray()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export async function suggestTags(
  query: string,
  limit = 10,
  database: FinanceDatabase = db,
): Promise<Tag[]> {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new Error("Invalid suggestion limit");
  const prefix = normalizeTagLabel(query);
  return (await listTags(database))
    .filter((tag) => tag.label.startsWith(prefix))
    .slice(0, limit);
}

/** Returns an existing ID for the same normalized label. */
export async function getOrCreateTag(
  label: string,
  database: FinanceDatabase = db,
): Promise<Tag> {
  const normalized = normalizeTagLabel(label);
  const tag = tagSchema.parse({ id: crypto.randomUUID(), label: normalized });
  return database.transaction("rw", database.tags, async () => {
    const existing = await database.tags
      .where("label")
      .equals(normalized)
      .first();
    if (existing) return existing;
    await database.tags.add(tag);
    return tag;
  });
}

export async function renameTag(
  id: string,
  label: string,
  database: FinanceDatabase = db,
): Promise<Tag> {
  const normalized = normalizeTagLabel(label);
  return database.transaction("rw", database.tags, async () => {
    const old = await database.tags.get(id);
    if (!old) throw new Error("Tag not found");
    const updated = tagSchema.parse({ ...old, label: normalized });
    const existing = await database.tags
      .where("label")
      .equals(normalized)
      .first();
    if (existing && existing.id !== id)
      throw new Error("Tag label already exists");
    await database.tags.put(updated);
    return updated;
  });
}

export async function deleteTag(
  id: string,
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.tags,
    database.transactions,
    async () => {
      if (!(await database.tags.get(id))) throw new Error("Tag not found");
      if (
        await database.transactions
          .filter((entry) => entry.tagIds.includes(id))
          .first()
      ) {
        throw new Error("Tag is referenced by a transaction");
      }
      await database.tags.delete(id);
    },
  );
}
