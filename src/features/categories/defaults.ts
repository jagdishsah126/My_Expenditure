import { db, type FinanceDatabase } from "../../db/database";
import { categorySchema, type Category } from "../../db/schema";

type DefaultCategory = { name: string; children?: readonly string[] };

export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Food", children: ["Lunch", "Dinner", "Snacks", "Restaurant"] },
  { name: "Transportation", children: ["Bus", "Taxi", "Fuel"] },
  { name: "Education", children: ["College", "Books", "Stationery"] },
  { name: "Bills", children: ["Internet", "Electricity", "Water", "Phone"] },
  { name: "Shopping" },
  { name: "Technology", children: ["Software", "Hosting", "Domain"] },
  { name: "Entertainment" },
  { name: "Health" },
  { name: "Family" },
  { name: "Travel" },
  { name: "Personal" },
  { name: "Investment" },
  { name: "Other" },
];

export const DEFAULT_INCOME_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Salary" },
  { name: "Allowance" },
  { name: "Freelance" },
  { name: "Business" },
  { name: "Trading" },
  { name: "Gift" },
  { name: "Refund" },
  { name: "Interest" },
  { name: "Other" },
];

const marker = "seed:categories:v1";
const stableId = (index: number) =>
  `5b68866a-4301-40ae-8200-${index.toString(16).padStart(12, "0")}`;

export async function seedDefaultCategories(
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.categories,
    database.settings,
    async () => {
      if (await database.settings.get(marker)) return;
      const now = new Date().toISOString();
      const existing = await database.categories.toArray();
      const created: Category[] = [];
      let nextId = 1;
      for (const [type, groups] of [
        ["expense", DEFAULT_EXPENSE_CATEGORIES],
        ["income", DEFAULT_INCOME_CATEGORIES],
      ] as const) {
        for (const [sortOrder, group] of groups.entries()) {
          const parentId = stableId(nextId++);
          const parent = existing.find(
            (row) =>
              !row.parentId &&
              row.type === type &&
              row.name.toLocaleLowerCase() === group.name.toLocaleLowerCase(),
          );
          if (!parent && !existing.some((row) => row.id === parentId)) {
            created.push(
              categorySchema.parse({
                id: parentId,
                name: group.name,
                type,
                sortOrder,
                isActive: true,
                createdAt: now,
                updatedAt: now,
              }),
            );
          }
          const actualParentId = parent?.id ?? parentId;
          for (const [childOrder, name] of (group.children ?? []).entries()) {
            const id = stableId(nextId++);
            if (
              !existing.some((row) => row.id === id) &&
              !existing.some(
                (row) =>
                  row.parentId === actualParentId &&
                  row.type === type &&
                  row.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
              )
            ) {
              created.push(
                categorySchema.parse({
                  id,
                  name,
                  type,
                  parentId: actualParentId,
                  sortOrder: childOrder,
                  isActive: true,
                  createdAt: now,
                  updatedAt: now,
                }),
              );
            }
          }
        }
      }
      if (created.length) await database.categories.bulkAdd(created);
      await database.settings.add({ key: marker, value: true, updatedAt: now });
    },
  );
}
