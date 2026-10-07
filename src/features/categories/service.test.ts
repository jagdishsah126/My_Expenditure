import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FinanceDatabase } from "../../db/database";
import {
  seedDefaultCategories,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "./defaults";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  deleteTag,
  getOrCreateTag,
  listCategories,
  normalizeTagLabel,
  renameTag,
  reorderCategories,
  restoreCategory,
  suggestTags,
  updateCategory,
} from "./service";

let database: FinanceDatabase;
beforeEach(() => {
  database = new FinanceDatabase(`categories-${crypto.randomUUID()}`);
});
afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

function income(
  categoryId: string,
  subcategoryId?: string,
  tagIds: string[] = [],
) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "income" as const,
    accountId: crypto.randomUUID(),
    categoryId,
    subcategoryId,
    amountPaisa: 100,
    date: "2026-10-01",
    tagIds,
    source: "manual" as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe("category services", () => {
  it("seeds every named default with proper types, parents and order, without reseeding", async () => {
    await Promise.all([
      seedDefaultCategories(database),
      seedDefaultCategories(database),
    ]);
    const rows = await database.categories.toArray();
    for (const [type, groups] of [
      ["expense", DEFAULT_EXPENSE_CATEGORIES],
      ["income", DEFAULT_INCOME_CATEGORIES],
    ] as const) {
      for (const [index, group] of groups.entries()) {
        const parent = rows.find(
          (row) =>
            row.type === type && !row.parentId && row.name === group.name,
        );
        expect(parent).toBeDefined();
        expect(parent?.sortOrder).toBe(index);
        expect(
          rows
            .filter((row) => row.parentId === parent?.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((row) => row.name),
        ).toEqual(group.children ?? []);
      }
    }
    expect(rows).toHaveLength(39);
    await seedDefaultCategories(database);
    expect(await database.categories.count()).toBe(39);
  });

  it("supports hierarchy, type checking, cycle prevention and reordering", async () => {
    const parent = await createCategory(
      { name: "Shared", type: "income" },
      database,
    );
    const child = await createCategory(
      { name: "Salary", type: "income", parentId: parent.id },
      database,
    );
    const grandchild = await createCategory(
      { name: "Bonus", type: "income", parentId: child.id },
      database,
    );
    await expect(
      updateCategory(parent.id, { parentId: grandchild.id }, database),
    ).rejects.toThrow("cycle");
    await expect(
      updateCategory(parent.id, { type: "expense" }, database),
    ).rejects.toThrow("incompatible");
    const expense = await createCategory(
      { name: "Bills", type: "expense" },
      database,
    );
    await expect(
      updateCategory(child.id, { parentId: expense.id }, database),
    ).rejects.toThrow("incompatible");
    const second = await createCategory(
      { name: "Food", type: "expense" },
      database,
    );
    await expect(
      reorderCategories(undefined, [second.id, parent.id], database),
    ).rejects.toThrow("exactly once");
    await reorderCategories(
      undefined,
      [second.id, expense.id, parent.id],
      database,
    );
    expect(
      (await listCategories({}, database))
        .filter((row) => !row.parentId)
        .map((row) => row.name),
    ).toEqual(["Food", "Bills", "Shared"]);
  });

  it("archives a subtree, retains references, restores parents first and blocks referenced deletion", async () => {
    const parent = await createCategory(
      { name: "Work", type: "both" },
      database,
    );
    const child = await createCategory(
      { name: "Salary", type: "income", parentId: parent.id },
      database,
    );
    const entry = income(parent.id, child.id);
    await database.transactions.add(entry);
    await expect(deleteCategory(parent.id, database)).rejects.toThrow("child");
    await expect(deleteCategory(child.id, database)).rejects.toThrow(
      "referenced",
    );
    await archiveCategory(parent.id, database);
    expect(await listCategories({}, database)).toHaveLength(0);
    expect(
      await listCategories({ includeArchived: true }, database),
    ).toHaveLength(2);
    const historical = await database.transactions.get(entry.id);
    expect(historical?.type).toBe("income");
    if (historical?.type === "income")
      expect(historical.categoryId).toBe(parent.id);
    await expect(restoreCategory(child.id, database)).rejects.toThrow("parent");
    await restoreCategory(parent.id, database);
    expect((await database.categories.get(child.id))?.isActive).toBe(false);
    await restoreCategory(child.id, database);
    await expect(
      updateCategory(child.id, { type: "both" }, database),
    ).rejects.toThrow("type of a referenced");
  });

  it("only deletes an unreferenced leaf, including when referenced as a subcategory", async () => {
    const parent = await createCategory(
      { name: "Income", type: "income" },
      database,
    );
    const child = await createCategory(
      { name: "Bonus", type: "income", parentId: parent.id },
      database,
    );
    const entry = income(parent.id, child.id);
    await database.transactions.add(entry);
    await expect(deleteCategory(child.id, database)).rejects.toThrow(
      "referenced",
    );
    await database.transactions.delete(entry.id);
    await deleteCategory(child.id, database);
    await deleteCategory(parent.id, database);
    expect(await database.categories.count()).toBe(0);
  });

  it("normalizes, deduplicates, suggests and preserves referenced tags", async () => {
    expect(normalizeTagLabel("  ##COLLEGE  ")).toBe("college");
    const tag = await getOrCreateTag("#College", database);
    expect((await getOrCreateTag("  college  ", database)).id).toBe(tag.id);
    await expect(getOrCreateTag("###  ", database)).rejects.toThrow();
    await getOrCreateTag("family", database);
    expect(
      (await suggestTags("CoL", 5, database)).map((row) => row.label),
    ).toEqual(["college"]);
    await expect(renameTag(tag.id, "Family", database)).rejects.toThrow(
      "already exists",
    );
    await database.transactions.add(
      income(crypto.randomUUID(), undefined, [tag.id]),
    );
    await renameTag(tag.id, "school", database);
    await expect(deleteTag(tag.id, database)).rejects.toThrow("referenced");
    expect((await database.tags.get(tag.id))?.label).toBe("school");
  });
});
