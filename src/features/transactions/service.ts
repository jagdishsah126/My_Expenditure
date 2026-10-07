import type { FinanceDatabase } from "../../db/database";
import { transactionSchema, type Transaction } from "../../db/schema";

type FinancialTransaction = Exclude<Transaction, { type: "opening" }>;
export type TransactionDraft = FinancialTransaction extends infer T
  ? T extends FinancialTransaction
    ? Omit<T, "id" | "createdAt" | "updatedAt">
    : never
  : never;

function assertAccountExistsAndActive(
  account: { isActive: boolean } | undefined,
  id: string,
): void {
  if (!account) throw new Error(`Account ${id} was not found.`);
  if (!account.isActive)
    throw new Error("Archived accounts cannot be used for new transactions.");
}

async function checkAccount(
  database: FinanceDatabase,
  accountId: string,
  date: string,
): Promise<void> {
  assertAccountExistsAndActive(
    await database.accounts.get(accountId),
    accountId,
  );
  const openings = await database.transactions
    .where("accountId")
    .equals(accountId)
    .filter((row) => row.type === "opening")
    .toArray();
  if (openings.length !== 1)
    throw new Error(
      "Account has no unique opening entry. Review this account before entering transactions.",
    );
  if (date < openings[0].date)
    throw new Error(
      "This transaction predates the account opening. Review its opening date/balance first.",
    );
}

async function checkCategory(
  database: FinanceDatabase,
  categoryId: string,
  subcategoryId: string | undefined,
  type: "income" | "expense",
) {
  const category = await database.categories.get(categoryId);
  if (
    !category ||
    !category.isActive ||
    (category.type !== type && category.type !== "both") ||
    category.parentId
  ) {
    throw new Error(`Choose an active ${type} category.`);
  }
  if (!subcategoryId) return;
  const subcategory = await database.categories.get(subcategoryId);
  if (
    !subcategory ||
    !subcategory.isActive ||
    subcategory.parentId !== categoryId ||
    (subcategory.type !== type && subcategory.type !== "both")
  ) {
    throw new Error("Choose a compatible subcategory.");
  }
}

async function validateReferences(
  database: FinanceDatabase,
  entry: FinancialTransaction,
): Promise<void> {
  if (entry.type === "transfer") {
    if (entry.fromAccountId === entry.toAccountId)
      throw new Error("Choose two different accounts for a transfer.");
    await checkAccount(database, entry.fromAccountId, entry.date);
    await checkAccount(database, entry.toAccountId, entry.date);
  } else {
    await checkAccount(database, entry.accountId, entry.date);
    if (entry.type === "income" || entry.type === "expense") {
      await checkCategory(
        database,
        entry.categoryId,
        entry.subcategoryId,
        entry.type,
      );
    }
  }
  for (const tagId of entry.tagIds) {
    if (!(await database.tags.get(tagId)))
      throw new Error("A tag no longer exists.");
  }
}

async function flagChangedOpenings(
  database: FinanceDatabase,
  effectiveDates: string[],
): Promise<void> {
  const earliest = effectiveDates.sort()[0];
  if (!earliest) return;
  const affected = await database.monthlyConfirmations
    .where("monthKey")
    .above(earliest.slice(0, 7))
    .toArray();
  for (const confirmation of affected) {
    // Any entry before the month start affects the confirmed carry-forward.
    if (
      !confirmation.openingChangedSinceConfirmation &&
      earliest < `${confirmation.monthKey}-01`
    ) {
      await database.monthlyConfirmations.update(confirmation.monthKey, {
        openingChangedSinceConfirmation: true,
      });
    }
  }
}

export async function createTransaction(
  database: FinanceDatabase,
  draft: TransactionDraft,
): Promise<FinancialTransaction> {
  const now = new Date().toISOString();
  const entry = transactionSchema.parse({
    ...draft,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
  if (entry.type === "opening")
    throw new Error("Use account creation for one-time opening entries.");
  await database.transaction(
    "rw",
    database.accounts,
    database.categories,
    database.tags,
    database.transactions,
    database.monthlyConfirmations,
    async () => {
      await validateReferences(database, entry);
      await database.transactions.add(entry);
      await flagChangedOpenings(database, [entry.date]);
    },
  );
  return entry;
}

export async function updateTransaction(
  database: FinanceDatabase,
  id: string,
  draft: TransactionDraft,
): Promise<FinancialTransaction> {
  const result = await database.transaction(
    "rw",
    database.accounts,
    database.categories,
    database.tags,
    database.transactions,
    database.monthlyConfirmations,
    async () => {
      const previous = await database.transactions.get(id);
      if (!previous) throw new Error("Transaction was not found.");
      if (previous.type === "opening")
        throw new Error(
          "Opening entries can only be corrected through account setup.",
        );
      const entry = transactionSchema.parse({
        ...draft,
        id,
        createdAt: previous.createdAt,
        updatedAt: new Date().toISOString(),
      });
      if (entry.type === "opening")
        throw new Error("Cannot convert a transaction into an opening entry.");
      await validateReferences(database, entry);
      await database.transactions.put(entry);
      await flagChangedOpenings(database, [previous.date, entry.date]);
      return entry;
    },
  );
  return result;
}

export async function deleteTransaction(
  database: FinanceDatabase,
  id: string,
): Promise<void> {
  await database.transaction(
    "rw",
    database.transactions,
    database.monthlyConfirmations,
    async () => {
      const previous = await database.transactions.get(id);
      if (!previous) throw new Error("Transaction was not found.");
      if (previous.type === "opening")
        throw new Error(
          "Opening entries cannot be deleted as ordinary transactions.",
        );
      await database.transactions.delete(id);
      await flagChangedOpenings(database, [previous.date]);
    },
  );
}
