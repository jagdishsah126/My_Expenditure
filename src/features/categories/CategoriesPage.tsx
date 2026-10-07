import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import type { Category, Tag } from "../../db/schema";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  deleteTag,
  getOrCreateTag,
  listCategories,
  listTags,
  renameTag,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from "./service";

const input =
  "min-h-11 w-full rounded-xl border border-forest/20 bg-white px-3 py-2 text-ink";
const section =
  "rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7";
const typeLabel: Record<Category["type"], string> = {
  expense: "Expense",
  income: "Income",
  both: "Both",
};

function CreateCategoryForm({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Category["type"]>("expense");
  const [parentId, setParentId] = useState("");
  const [icon, setIcon] = useState("");
  const [message, setMessage] = useState("");
  const roots = categories.filter(
    (category) =>
      category.isActive &&
      !category.parentId &&
      (category.type === type || category.type === "both"),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await createCategory({
        name,
        type,
        parentId: parentId || undefined,
        icon: icon.trim() || undefined,
      });
      setName("");
      setParentId("");
      setIcon("");
      setMessage("Category added.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not add category.",
      );
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
      <label className="text-sm font-semibold">
        Name
        <input
          required
          className={input}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Used for
        <select
          className={input}
          value={type}
          onChange={(event) => {
            setType(event.target.value as Category["type"]);
            setParentId("");
          }}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="both">Both</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Icon (optional)
        <input
          className={input}
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
          placeholder="🍜"
        />
      </label>
      <label className="text-sm font-semibold">
        Parent category (optional)
        <select
          className={input}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">No parent — top level</option>
          {roots.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <button className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white">
        Add category
      </button>
    </form>
  );
}

function EditCategoryForm({
  category,
  categories,
}: {
  category: Category;
  categories: Category[];
}) {
  const [name, setName] = useState(category.name);
  const [type, setType] = useState(category.type);
  const [parentId, setParentId] = useState(category.parentId ?? "");
  const [icon, setIcon] = useState(category.icon ?? "");
  const [message, setMessage] = useState("");
  const descendants = new Set<string>();
  const collect = (id: string) => {
    descendants.add(id);
    categories
      .filter((item) => item.parentId === id)
      .forEach((item) => collect(item.id));
  };
  collect(category.id);
  const parentOptions = categories.filter(
    (item) =>
      item.isActive &&
      !item.parentId &&
      !descendants.has(item.id) &&
      (item.type === type || item.type === "both"),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await updateCategory(category.id, {
        name,
        type,
        parentId: parentId || undefined,
        icon: icon.trim() || undefined,
      });
      setMessage("Category updated.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not update category.",
      );
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <label className="text-sm font-semibold">
        Name
        <input
          required
          className={input}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Used for
        <select
          className={input}
          value={type}
          onChange={(event) => {
            setType(event.target.value as Category["type"]);
            setParentId("");
          }}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="both">Both</option>
        </select>
      </label>
      <label className="text-sm font-semibold">
        Icon
        <input
          className={input}
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Parent
        <select
          className={input}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">No parent</option>
          {parentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <button className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white">
        Save category
      </button>
    </form>
  );
}

function CategoryRow({
  category,
  siblings,
  selected,
  onSelect,
  onMessage,
}: {
  category: Category;
  siblings: Category[];
  selected: boolean;
  onSelect: () => void;
  onMessage: (message: string) => void;
}) {
  const index = siblings.findIndex((item) => item.id === category.id);
  async function move(direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const ordered = siblings.map((item) => item.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await reorderCategories(category.parentId, ordered);
    } catch (cause) {
      onMessage(
        cause instanceof Error ? cause.message : "Could not reorder category.",
      );
    }
  }
  return (
    <div
      className={`rounded-xl border p-3 ${selected ? "border-forest bg-leaf/40" : "border-forest/10 bg-paper"}`}
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 text-left font-semibold"
        >
          {category.icon && <span aria-hidden="true">{category.icon} </span>}
          {category.name}
          <span className="ml-2 text-xs font-normal text-ink/60">
            {typeLabel[category.type]}
            {category.isActive ? "" : " · archived"}
          </span>
        </button>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Move ${category.name} up`}
            disabled={index <= 0}
            onClick={() => void move(-1)}
            className="min-h-10 min-w-10 rounded-lg border disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${category.name} down`}
            disabled={index === siblings.length - 1}
            onClick={() => void move(1)}
            className="min-h-10 min-w-10 rounded-lg border disabled:opacity-30"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}

function TagsPanel({ tags }: { tags: Tag[] }) {
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await getOrCreateTag(label);
      setLabel("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not add tag.");
    }
  }
  return (
    <section className={section}>
      <h2 className="text-xl font-bold">Tags</h2>
      <form onSubmit={(event) => void add(event)} className="mt-4 flex gap-2">
        <input
          aria-label="New tag"
          className={input}
          value={label}
          maxLength={40}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="#college"
        />
        <button className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white">
          Add
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-red-800">{message}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-paper px-3 text-sm"
          >
            #{tag.label}
            <button
              type="button"
              onClick={() => {
                const next = window.prompt("Rename tag", tag.label);
                if (next)
                  void renameTag(tag.id, next).catch((cause: unknown) =>
                    setMessage(
                      cause instanceof Error
                        ? cause.message
                        : "Could not rename tag.",
                    ),
                  );
              }}
              className="font-semibold text-forest underline"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() =>
                void deleteTag(tag.id).catch((cause: unknown) =>
                  setMessage(
                    cause instanceof Error
                      ? cause.message
                      : "Could not delete tag.",
                  ),
                )
              }
              className="font-semibold text-red-800 underline"
            >
              Delete
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}

export function CategoriesPage() {
  const categories = useLiveQuery(
    () => listCategories({ includeArchived: true }),
    [],
  );
  const tags = useLiveQuery(() => listTags(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const roots = useMemo(
    () =>
      (categories ?? [])
        .filter((category) => !category.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const selected = categories?.find((category) => category.id === selectedId);

  if (!categories || !tags) return <p role="status">Loading categories…</p>;

  async function categoryAction(
    category: Category,
    action: "archive" | "restore" | "delete",
  ) {
    setMessage("");
    try {
      if (action === "archive") await archiveCategory(category.id);
      if (action === "restore") await restoreCategory(category.id);
      if (action === "delete") await deleteCategory(category.id);
      if (action === "delete") setSelectedId(null);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not update category.",
      );
    }
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-forest/70">
          Organize money
        </p>
        <h1 className="mt-2 text-3xl font-bold">Categories</h1>
        <p className="mt-2 text-sm text-ink/70">
          Create, reorder, archive and restore categories. Historical records
          keep archived names.
        </p>
      </header>
      {message && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-900">
          {message}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section className={section}>
          <h2 className="text-xl font-bold">Category order</h2>
          <div className="mt-4 grid gap-4">
            {roots.map((root) => {
              const rootSiblings = roots;
              const children = categories
                .filter((item) => item.parentId === root.id)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <div key={root.id}>
                  <CategoryRow
                    category={root}
                    siblings={rootSiblings}
                    selected={selected?.id === root.id}
                    onSelect={() => setSelectedId(root.id)}
                    onMessage={setMessage}
                  />
                  {children.length > 0 && (
                    <div className="ml-5 mt-2 grid gap-2 border-l-2 border-forest/10 pl-3">
                      {children.map((child) => (
                        <CategoryRow
                          key={child.id}
                          category={child}
                          siblings={children}
                          selected={selected?.id === child.id}
                          onSelect={() => setSelectedId(child.id)}
                          onMessage={setMessage}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="grid content-start gap-5">
          <section className={section}>
            <h2 className="text-xl font-bold">Add category</h2>
            <CreateCategoryForm categories={categories} />
          </section>
          {selected && (
            <section className={section}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Edit {selected.name}</h2>
                  <p className="text-sm text-ink/70">
                    {selected.isActive ? "Active" : "Archived"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.isActive ? (
                    <button
                      type="button"
                      onClick={() => void categoryAction(selected, "archive")}
                      className="min-h-10 rounded-lg border px-3 font-semibold"
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void categoryAction(selected, "restore")}
                      className="min-h-10 rounded-lg border px-3 font-semibold"
                    >
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void categoryAction(selected, "delete")}
                    className="min-h-10 rounded-lg border border-red-200 px-3 font-semibold text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <EditCategoryForm
                key={selected.id}
                category={selected}
                categories={categories}
              />
              <p className="mt-3 text-sm text-ink/70">
                Delete is available only for an unreferenced leaf; archive is
                safer for used categories.
              </p>
            </section>
          )}
          <TagsPanel tags={tags} />
          <Link
            to="/accounts"
            className="rounded-2xl bg-leaf/60 p-4 font-semibold text-forest"
          >
            ← Back to accounts
          </Link>
        </div>
      </div>
    </>
  );
}
