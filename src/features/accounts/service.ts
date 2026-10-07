import { db, type FinanceDatabase } from "../../db/database";
import { calculateAccountBalance } from "../ledger/selectors";
import { getKathmanduToday, inclusiveEndToExclusive } from "../../utils/dates";
import {
  accountSchema,
  accountTypeSchema,
  transactionSchema,
  type Account,
  type AccountType,
  type Transaction,
} from "../../db/schema";

export type NewAccount = {
  name: string;
  accountTypeId: string;
  currency: "NPR";
  icon?: string;
  notes?: string;
  openingDate: string;
  openingAmountPaisa: number;
};

export async function listAccountTypes(
  database: FinanceDatabase = db,
): Promise<AccountType[]> {
  return database.accountTypes.toArray();
}

export async function createAccountType(
  input: { name: string; icon?: string },
  database: FinanceDatabase = db,
): Promise<AccountType> {
  const now = new Date().toISOString();
  const type = accountTypeSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now,
  });
  await database.transaction("rw", database.accountTypes, async () => {
    if (
      (await database.accountTypes.toArray()).some(
        (row) => row.name.toLocaleLowerCase() === type.name.toLocaleLowerCase(),
      )
    ) {
      throw new Error("An account type with this name already exists");
    }
    await database.accountTypes.add(type);
  });
  return type;
}

export async function updateAccountType(
  id: string,
  changes: Partial<Pick<AccountType, "name" | "icon">>,
  database: FinanceDatabase = db,
): Promise<AccountType> {
  return database.transaction("rw", database.accountTypes, async () => {
    const old = await database.accountTypes.get(id);
    if (!old) throw new Error("Account type not found");
    const updated = accountTypeSchema.parse({
      ...old,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(Object.hasOwn(changes, "icon") ? { icon: changes.icon } : {}),
      updatedAt: new Date().toISOString(),
    });
    if (
      (await database.accountTypes.toArray()).some(
        (row) =>
          row.id !== id &&
          row.name.toLocaleLowerCase() === updated.name.toLocaleLowerCase(),
      )
    ) {
      throw new Error("An account type with this name already exists");
    }
    await database.accountTypes.put(updated);
    return updated;
  });
}

export async function deleteAccountType(
  id: string,
  database: FinanceDatabase = db,
): Promise<void> {
  await database.transaction(
    "rw",
    database.accountTypes,
    database.accounts,
    async () => {
      const type = await database.accountTypes.get(id);
      if (!type) throw new Error("Account type not found");
      if (type.isBuiltIn)
        throw new Error("Built-in account types cannot be deleted");
      if (await database.accounts.where("accountTypeId").equals(id).first()) {
        throw new Error("Account type is referenced by an account");
      }
      await database.accountTypes.delete(id);
    },
  );
}

export async function listAccounts(
  options: { includeArchived?: boolean } = {},
  database: FinanceDatabase = db,
): Promise<Account[]> {
  return options.includeArchived
    ? database.accounts.toArray()
    : database.accounts.filter((account) => account.isActive).toArray();
}

/** Account + exactly one dated opening are committed or rolled back together. */
export async function createAccount(
  input: NewAccount,
  database: FinanceDatabase = db,
): Promise<Account> {
  const now = new Date().toISOString();
  const account = accountSchema.parse({
    id: crypto.randomUUID(),
    name: input.name,
    accountTypeId: input.accountTypeId,
    currency: input.currency,
    icon: input.icon,
    notes: input.notes,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const opening = transactionSchema.parse({
    id: crypto.randomUUID(),
    type: "opening",
    accountId: account.id,
    amountPaisa: input.openingAmountPaisa,
    date: input.openingDate,
    tagIds: [],
    source: "manual",
    createdAt: now,
    updatedAt: now,
  });
  await database.transaction(
    "rw",
    database.accounts,
    database.accountTypes,
    database.transactions,
    database.monthlyConfirmations,
    async () => {
      if (!(await database.accountTypes.get(account.accountTypeId)))
        throw new Error("Account type not found");
      await database.accounts.add(account);
      await database.transactions.add(opening);
      // An opening dated before a previously confirmed month changes its derived opening.
      const confirmations = await database.monthlyConfirmations.toArray();
      const changed = confirmations.filter(
        (row) =>
          opening.date < `${row.monthKey}-01` &&
          !row.openingChangedSinceConfirmation,
      );
      if (changed.length)
        await database.monthlyConfirmations.bulkPut(
          changed.map((row) => ({
            ...row,
            openingChangedSinceConfirmation: true,
          })),
        );
    },
  );
  return account;
}

export async function updateAccount(
  id: string,
  changes: Partial<Pick<Account, "name" | "accountTypeId" | "icon" | "notes">>,
  database: FinanceDatabase = db,
): Promise<Account> {
  return database.transaction(
    "rw",
    database.accounts,
    database.accountTypes,
    async () => {
      const old = await database.accounts.get(id);
      if (!old) throw new Error("Account not found");
      const updated = accountSchema.parse({
        ...old,
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.accountTypeId !== undefined
          ? { accountTypeId: changes.accountTypeId }
          : {}),
        ...(Object.hasOwn(changes, "icon") ? { icon: changes.icon } : {}),
        ...(Object.hasOwn(changes, "notes") ? { notes: changes.notes } : {}),
        updatedAt: new Date().toISOString(),
      });
      if (!(await database.accountTypes.get(updated.accountTypeId)))
        throw new Error("Account type not found");
      await database.accounts.put(updated);
      return updated;
    },
  );
}

export function renameAccount(
  id: string,
  name: string,
  database: FinanceDatabase = db,
): Promise<Account> {
  return updateAccount(id, { name }, database);
}

/** Fetch every entry that can affect this account, then use the shared ledger selector. */
async function accountEntries(
  id: string,
  database: FinanceDatabase,
): Promise<Transaction[]> {
  const [direct, outgoing, incoming] = await Promise.all([
    database.transactions.where("accountId").equals(id).toArray(),
    database.transactions.where("fromAccountId").equals(id).toArray(),
    database.transactions.where("toAccountId").equals(id).toArray(),
  ]);
  return [
    ...new Map(
      [...direct, ...outgoing, ...incoming].map((entry) => [entry.id, entry]),
    ).values(),
  ];
}

export async function archiveAccount(
  id: string,
  database: FinanceDatabase = db,
): Promise<Account> {
  return database.transaction(
    "rw",
    database.accounts,
    database.transactions,
    async () => {
      const account = await database.accounts.get(id);
      if (!account) throw new Error("Account not found");
      if (!account.isActive) return account;
      const today = getKathmanduToday();
      const entries = await accountEntries(id, database);
      if (entries.some((entry) => entry.date > today)) {
        // Even an offsetting future transfer must not change an archived account later.
        throw new Error(
          "Account has future-dated transactions; resolve them before archiving",
        );
      }
      const balance = calculateAccountBalance(
        id,
        entries,
        inclusiveEndToExclusive(today),
      );
      if (balance !== 0)
        throw new Error("Account balance must be zero before archiving");
      const updated = {
        ...account,
        isActive: false,
        updatedAt: new Date().toISOString(),
      };
      await database.accounts.put(updated);
      return updated;
    },
  );
}

export async function restoreAccount(
  id: string,
  database: FinanceDatabase = db,
): Promise<Account> {
  return database.transaction("rw", database.accounts, async () => {
    const account = await database.accounts.get(id);
    if (!account) throw new Error("Account not found");
    if (account.isActive) return account;
    const updated = {
      ...account,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    await database.accounts.put(updated);
    return updated;
  });
}
