import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceDatabase } from "../../db/database";
import type { Account, Category, Transaction } from "../../db/schema";
import {
  confirmMonth,
  kathmanduMonth,
  needsMonthConfirmation,
} from "../monthly/service";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "./service";

const databases: FinanceDatabase[] = [];
afterEach(async () => {
  for (const database of databases) {
    database.close();
    await Dexie.delete(database.name);
  }
  databases.length = 0;
});

async function fixture() {
  const database = new FinanceDatabase(
    `transactions-test-${crypto.randomUUID()}`,
  );
  databases.push(database);
  const now = "2026-09-30T12:00:00.000Z";
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const accounts: Account[] = [first, second].map((id, index) => ({
    id,
    name: index ? "Wallet" : "Bank",
    accountTypeId: crypto.randomUUID(),
    currency: "NPR",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));
  const category: Category = {
    id: categoryId,
    name: "Food",
    type: "expense",
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await database.accounts.bulkAdd(accounts);
  await database.categories.add(category);
  for (const account of accounts) {
    const opening: Transaction = {
      id: crypto.randomUUID(),
      type: "opening",
      accountId: account.id,
      amountPaisa: 10_000,
      date: "2026-09-30",
      source: "manual",
      tagIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await database.transactions.add(opening);
  }
  return { database, first, second, categoryId };
}

describe("transactions and monthly metadata", () => {
  it("keeps one canonical transfer and validates account references", async () => {
    const { database, first, second } = await fixture();
    const entry = await createTransaction(database, {
      type: "transfer",
      date: "2026-10-02",
      fromAccountId: first,
      toAccountId: second,
      amountPaisa: 2_500,
      source: "manual",
      tagIds: [],
    });
    expect(entry.type).toBe("transfer");
    expect(await database.transactions.count()).toBe(3); // two openings, one transfer
    await expect(
      createTransaction(database, {
        type: "transfer",
        date: "2026-10-02",
        fromAccountId: first,
        toAccountId: first,
        amountPaisa: 2_500,
        source: "manual",
        tagIds: [],
      }),
    ).rejects.toThrow("different accounts");
    expect(await database.transactions.count()).toBe(3);
  });

  it("preserves confirmation timestamp and marks openings affected by backdated edits/deletions", async () => {
    const { database, first, categoryId } = await fixture();
    expect(await needsMonthConfirmation(database, "2026-10")).toBe(true);
    const confirmation = await confirmMonth(database, "2026-10");
    expect(await confirmMonth(database, "2026-10")).toEqual(confirmation);
    expect(await database.monthlyConfirmations.count()).toBe(1);
    expect(await database.transactions.count()).toBe(2);
    const entry = await createTransaction(database, {
      type: "expense",
      date: "2026-10-02",
      accountId: first,
      categoryId,
      amountPaisa: 100,
      source: "manual",
      tagIds: [],
    });
    expect(
      (await database.monthlyConfirmations.get("2026-10"))
        ?.openingChangedSinceConfirmation,
    ).toBe(false);
    await updateTransaction(database, entry.id, {
      type: "expense",
      date: "2026-09-30",
      accountId: first,
      categoryId,
      amountPaisa: 100,
      source: "manual",
      tagIds: [],
    });
    expect(await database.monthlyConfirmations.get("2026-10")).toEqual({
      ...confirmation,
      openingChangedSinceConfirmation: true,
    });
    await deleteTransaction(database, entry.id);
    expect(await database.transactions.count()).toBe(2);
  });

  it("rejects a transaction before an account opening, leaving the database untouched", async () => {
    const { database, first, categoryId } = await fixture();
    await expect(
      createTransaction(database, {
        type: "expense",
        date: "2026-09-01",
        accountId: first,
        categoryId,
        amountPaisa: 100,
        source: "manual",
        tagIds: [],
      }),
    ).rejects.toThrow("predates");
    expect(await database.transactions.count()).toBe(2);
  });

  it("uses Kathmandu for the month boundary rather than UTC", () => {
    expect(kathmanduMonth(new Date("2026-09-30T18:15:00.000Z"))).toBe(
      "2026-10",
    );
  });
});
