import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FinanceDatabase } from "../../db/database";
import { seedDefaults, DEFAULT_ACCOUNT_TYPES } from "./defaults";
import {
  archiveAccount,
  createAccount,
  createAccountType,
  deleteAccountType,
  listAccounts,
  renameAccount,
  restoreAccount,
  updateAccount,
  updateAccountType,
} from "./service";

let database: FinanceDatabase;
beforeEach(() => {
  database = new FinanceDatabase(`accounts-${crypto.randomUUID()}`);
});
afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

async function cashType() {
  await seedDefaults(database);
  return (await database.accountTypes.where("name").equals("Cash").first())!.id;
}
const newAccount = (typeId: string, amount = 0, date = "2026-09-30") => ({
  name: "Cash",
  accountTypeId: typeId,
  currency: "NPR" as const,
  openingDate: date,
  openingAmountPaisa: amount,
});

function transfer(
  fromAccountId: string,
  toAccountId: string,
  date: string,
  amountPaisa: number,
) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "transfer" as const,
    fromAccountId,
    toAccountId,
    date,
    amountPaisa,
    tagIds: [],
    source: "manual" as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe("account services", () => {
  it("seeds all account types and categories only once without changing user modifications", async () => {
    await Promise.all([seedDefaults(database), seedDefaults(database)]);
    expect(
      (await database.accountTypes.toArray()).map((row) => row.name),
    ).toEqual(DEFAULT_ACCOUNT_TYPES.map((row) => row.name));
    expect(await database.categories.count()).toBe(39);
    const cash = (await database.accountTypes
      .where("name")
      .equals("Cash")
      .first())!;
    await updateAccountType(cash.id, { name: "My Cash" }, database);
    const food = (await database.categories
      .filter((row) => row.name === "Food")
      .first())!;
    await database.categories.update(food.id, { name: "Meals" });
    await seedDefaults(database);
    expect(await database.accountTypes.count()).toBe(5);
    expect(await database.categories.count()).toBe(39);
    expect((await database.accountTypes.get(cash.id))?.name).toBe("My Cash");
    expect((await database.categories.get(food.id))?.name).toBe("Meals");
    expect(
      (await database.categories.filter((row) => row.name === "Lunch").first())
        ?.parentId,
    ).toBe(food.id);
    expect(
      await database.categories.filter((row) => row.name === "Other").count(),
    ).toBe(2);
  });

  it("creates account and exactly one dated opening atomically, including zero", async () => {
    const typeId = await cashType();
    const account = await createAccount(newAccount(typeId, 0), database);
    const opening = await database.transactions
      .where("accountId")
      .equals(account.id)
      .toArray();
    expect(opening).toMatchObject([
      {
        type: "opening",
        amountPaisa: 0,
        date: "2026-09-30",
        accountId: account.id,
      },
    ]);
    await renameAccount(account.id, "Pocket cash", database);
    await updateAccount(account.id, { notes: "Wallet" }, database);
    await updateAccount(
      account.id,
      { isActive: false, currency: "USD" } as never,
      database,
    );
    expect((await database.accounts.get(account.id))?.isActive).toBe(true);
    expect((await database.accounts.get(account.id))?.currency).toBe("NPR");
    expect(
      await database.transactions.where("accountId").equals(account.id).count(),
    ).toBe(1);
    expect((await database.accounts.get(account.id))?.name).toBe("Pocket cash");
    expect(await listAccounts({}, database)).toHaveLength(1);
    await archiveAccount(account.id, database);
    expect(await listAccounts({}, database)).toHaveLength(0);
    expect(
      await listAccounts({ includeArchived: true }, database),
    ).toHaveLength(1);
    await restoreAccount(account.id, database);
    expect((await database.accounts.get(account.id))?.isActive).toBe(true);
  });

  it("validates amount, date, currency and type before any financial write", async () => {
    const typeId = await cashType();
    for (const input of [
      { openingAmountPaisa: -1 },
      { openingAmountPaisa: 1.5 },
      { openingAmountPaisa: Number.NaN },
      { openingAmountPaisa: Number.MAX_SAFE_INTEGER + 1 },
      { openingDate: "2026-02-30" },
      { currency: "USD" },
      { accountTypeId: crypto.randomUUID() },
    ]) {
      await expect(
        createAccount(
          { ...newAccount(typeId), ...input } as Parameters<
            typeof createAccount
          >[0],
          database,
        ),
      ).rejects.toThrow();
    }
    expect(await database.accounts.count()).toBe(0);
    expect(await database.transactions.count()).toBe(0);
  });

  it("rolls back account when the opening insert fails", async () => {
    const typeId = await cashType();
    const hook = () => {
      throw new Error("opening failed");
    };
    database.transactions.hook("creating", hook);
    await expect(
      createAccount(newAccount(typeId, 300), database),
    ).rejects.toThrow("opening failed");
    database.transactions.hook("creating").unsubscribe(hook);
    expect(await database.accounts.count()).toBe(0);
    expect(await database.transactions.count()).toBe(0);
  });

  it("marks only confirmed months whose opening predates a new account opening", async () => {
    const typeId = await cashType();
    for (const monthKey of ["2026-09", "2026-10", "2026-11"]) {
      await database.monthlyConfirmations.add({
        monthKey,
        confirmedAt: new Date().toISOString(),
        openingChangedSinceConfirmation: false,
      });
    }
    await createAccount(newAccount(typeId, 500, "2026-10-10"), database);
    const flags = (await database.monthlyConfirmations.toArray()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey),
    );
    expect(flags.map((row) => row.openingChangedSinceConfirmation)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("protects built-in and referenced types; permits unreferenced custom type deletion", async () => {
    const typeId = await cashType();
    await expect(deleteAccountType(typeId, database)).rejects.toThrow(
      "Built-in",
    );
    const custom = await createAccountType({ name: "Digital Jar" }, database);
    await expect(
      createAccountType({ name: " digital jar " }, database),
    ).rejects.toThrow("already exists");
    const account = await createAccount(newAccount(custom.id), database);
    await expect(deleteAccountType(custom.id, database)).rejects.toThrow(
      "referenced",
    );
    await updateAccount(account.id, { accountTypeId: typeId }, database);
    await deleteAccountType(custom.id, database);
    expect(await database.accountTypes.get(custom.id)).toBeUndefined();
  });

  it("requires zero current balance and no future-dated entries before archive", async () => {
    const typeId = await cashType();
    const source = await createAccount(newAccount(typeId, 80000), database);
    const target = await createAccount(
      { ...newAccount(typeId), name: "Bank" },
      database,
    );
    await expect(archiveAccount(source.id, database)).rejects.toThrow("zero");
    await database.transactions.add(
      transfer(source.id, target.id, "2026-10-06", 80000),
    );
    await archiveAccount(source.id, database);
    expect((await database.accounts.get(source.id))?.isActive).toBe(false);
    await restoreAccount(source.id, database);
    const future = transfer(target.id, source.id, "2999-10-06", 1);
    await database.transactions.add(future);
    await expect(archiveAccount(source.id, database)).rejects.toThrow(
      "future-dated",
    );
    expect((await database.accounts.get(source.id))?.isActive).toBe(true);
  });
});
