import { db, type FinanceDatabase } from "../../db/database";
import { accountTypeSchema, type AccountType } from "../../db/schema";
import { seedDefaultCategories } from "../categories/defaults";

// Stable IDs + a persistent marker mean renaming or deleting a default never recreates it.
export const DEFAULT_ACCOUNT_TYPES = [
  { id: "5b68866a-4301-40ae-8100-000000000001", name: "Cash" },
  { id: "5b68866a-4301-40ae-8100-000000000002", name: "Bank" },
  { id: "5b68866a-4301-40ae-8100-000000000003", name: "Digital Wallet" },
  { id: "5b68866a-4301-40ae-8100-000000000004", name: "Investment" },
  { id: "5b68866a-4301-40ae-8100-000000000005", name: "Other" },
] as const;

const marker = "seed:account-types:v1";

export async function seedDefaultAccountTypes(
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.accountTypes,
    database.settings,
    async () => {
      if (await database.settings.get(marker)) return;
      const now = new Date().toISOString();
      const existing = await database.accountTypes.toArray();
      const names = new Set(
        existing.map((type) => type.name.toLocaleLowerCase()),
      );
      const ids = new Set(existing.map((type) => type.id));
      const records: AccountType[] = DEFAULT_ACCOUNT_TYPES.filter(
        (type) =>
          !names.has(type.name.toLocaleLowerCase()) && !ids.has(type.id),
      ).map((type) =>
        accountTypeSchema.parse({
          ...type,
          isBuiltIn: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
      if (records.length) await database.accountTypes.bulkAdd(records);
      await database.settings.add({ key: marker, value: true, updatedAt: now });
    },
  );
}

/** Seeds both sets once; each set also remains safe to seed separately. */
export async function seedDefaults(
  database: FinanceDatabase = db,
): Promise<void> {
  await seedDefaultAccountTypes(database);
  await seedDefaultCategories(database);
}
