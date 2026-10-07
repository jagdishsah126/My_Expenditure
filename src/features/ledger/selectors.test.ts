import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountSchema,
  transactionSchema,
  type Account,
  type Transaction,
} from "../../db/schema";
import {
  calculateAccountBalance,
  calculateAdjustments,
  calculateExpenses,
  calculateIncome,
  calculateMonthClosing,
  calculateMonthOpening,
  calculateOpeningEntries,
  calculateRangeSummary,
  calculateTotalBalance,
  calculateTransfers,
  transactionEffect,
} from "./selectors";

const stamp = "2026-09-30T18:14:59.000Z";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
function account(n: number, isActive = true): Account {
  return accountSchema.parse({
    id: uuid(n),
    name: `Account ${n}`,
    accountTypeId: uuid(100),
    currency: "NPR",
    isActive,
    createdAt: stamp,
    updatedAt: stamp,
  });
}
function entry(fields: Record<string, unknown>): Transaction {
  return transactionSchema.parse({
    id: uuid(Number(fields.number)),
    date: "2026-09-30",
    tagIds: [],
    source: "manual",
    createdAt: stamp,
    updatedAt: stamp,
    ...fields,
  });
}

const cash = account(1);
const nabil = account(2);
const esewa = account(3);
const khalti = account(4);
const nmb = account(5);
const accounts = [cash, nabil, esewa, khalti, nmb];
const opening: Transaction[] = [
  entry({
    number: 11,
    type: "opening",
    accountId: cash.id,
    amountPaisa: 200_000,
  }),
  entry({
    number: 12,
    type: "opening",
    accountId: nabil.id,
    amountPaisa: 1_500_000,
  }),
  entry({
    number: 13,
    type: "opening",
    accountId: esewa.id,
    amountPaisa: 350_000,
  }),
  entry({
    number: 14,
    type: "opening",
    accountId: khalti.id,
    amountPaisa: 80_000,
  }),
];
const food = entry({
  number: 15,
  type: "expense",
  accountId: esewa.id,
  categoryId: uuid(101),
  amountPaisa: 18_000,
  date: "2026-10-02",
});
const salary = entry({
  number: 16,
  type: "income",
  accountId: nabil.id,
  categoryId: uuid(102),
  amountPaisa: 2_500_000,
  date: "2026-10-03",
});
const topUp = entry({
  number: 17,
  type: "transfer",
  fromAccountId: nabil.id,
  toAccountId: esewa.id,
  amountPaisa: 200_000,
  date: "2026-10-04",
});
const reconcile = entry({
  number: 18,
  type: "adjustment",
  accountId: esewa.id,
  deltaPaisa: -5_000,
  reason: "Balance check",
  calculatedBeforePaisa: 532_000,
  actualAtTimePaisa: 527_000,
  date: "2026-10-05",
});
const newAccount = entry({
  number: 19,
  type: "opening",
  accountId: nmb.id,
  amountPaisa: 50_000,
  date: "2026-10-10",
});
const fullLedger = [...opening, food, salary, topUp, reconcile, newAccount];
const septemberEnd = "2026-10-01";
const octoberEnd = "2026-11-01";

afterEach(() => vi.useRealTimers());

describe("one canonical ledger, hand-checked acceptance fixture", () => {
  it("carries September into October once, and tracks each event without double counting transfers", () => {
    const checkpoints: {
      date: string;
      entries: Transaction[];
      balances: number[];
      total: number;
    }[] = [
      {
        date: septemberEnd,
        entries: opening,
        balances: [200_000, 1_500_000, 350_000, 80_000, 0],
        total: 2_130_000,
      },
      {
        date: "2026-10-03",
        entries: [...opening, food],
        balances: [200_000, 1_500_000, 332_000, 80_000, 0],
        total: 2_112_000,
      },
      {
        date: "2026-10-04",
        entries: [...opening, food, salary],
        balances: [200_000, 4_000_000, 332_000, 80_000, 0],
        total: 4_612_000,
      },
      {
        date: "2026-10-05",
        entries: [...opening, food, salary, topUp],
        balances: [200_000, 3_800_000, 532_000, 80_000, 0],
        total: 4_612_000,
      },
      {
        date: "2026-10-06",
        entries: [...opening, food, salary, topUp, reconcile],
        balances: [200_000, 3_800_000, 527_000, 80_000, 0],
        total: 4_607_000,
      },
      {
        date: "2026-10-11",
        entries: fullLedger,
        balances: [200_000, 3_800_000, 527_000, 80_000, 50_000],
        total: 4_657_000,
      },
    ];
    for (const { date, entries, balances, total } of checkpoints) {
      expect(
        accounts.map((a) => calculateAccountBalance(a.id, entries, date)),
      ).toEqual(balances);
      expect(calculateTotalBalance(accounts, entries, date)).toBe(total);
      // As-of boundaries must not depend on whether the caller filtered the transactions.
      expect(calculateTotalBalance(accounts, fullLedger, date)).toBe(total);
    }
    expect(transactionEffect(nabil.id, topUp)).toBe(-200_000);
    expect(transactionEffect(esewa.id, topUp)).toBe(200_000);
    expect(transactionEffect(cash.id, topUp)).toBe(0);
    expect(calculateMonthOpening("2026-10", accounts, fullLedger)).toBe(
      2_130_000,
    );
    expect(calculateMonthClosing("2026-09", accounts, fullLedger)).toBe(
      2_130_000,
    );
    expect(calculateMonthClosing("2026-10", accounts, fullLedger)).toBe(
      4_657_000,
    );
    expect(calculateMonthOpening("2026-11", accounts, fullLedger)).toBe(
      4_657_000,
    );
    // Confirmation is metadata: it cannot change this immutable ledger or carry money twice.
    expect(calculateMonthOpening("2026-11", accounts, fullLedger)).toBe(
      4_657_000,
    );
  });

  it("separates operating income, expenses, gross transfers, signed adjustments and new-account openings", () => {
    expect(calculateIncome(fullLedger, septemberEnd, octoberEnd)).toBe(
      2_500_000,
    );
    expect(calculateExpenses(fullLedger, septemberEnd, octoberEnd)).toBe(
      18_000,
    );
    expect(calculateTransfers(fullLedger, septemberEnd, octoberEnd)).toBe(
      200_000,
    );
    expect(calculateAdjustments(fullLedger, septemberEnd, octoberEnd)).toBe(
      -5_000,
    );
    expect(calculateOpeningEntries(fullLedger, septemberEnd, octoberEnd)).toBe(
      50_000,
    );
    expect(
      calculateRangeSummary(accounts, fullLedger, septemberEnd, octoberEnd),
    ).toEqual({
      openingPaisa: 2_130_000,
      closingPaisa: 4_657_000,
      incomePaisa: 2_500_000,
      expensesPaisa: 18_000,
      transfersPaisa: 200_000,
      adjustmentsPaisa: -5_000,
      openingEntriesPaisa: 50_000,
      operatingNetPaisa: 2_482_000,
      netChangePaisa: 2_527_000,
    });
    expect(
      calculateRangeSummary(accounts, fullLedger, "2026-10-06", "2026-10-06"),
    ).toMatchObject({
      incomePaisa: 0,
      expensesPaisa: 0,
      netChangePaisa: 0,
    });
    expect(
      calculateRangeSummary(accounts, fullLedger, "2026-11-01", "2026-12-01"),
    ).toMatchObject({
      openingPaisa: 4_657_000,
      closingPaisa: 4_657_000,
      netChangePaisa: 0,
    });
  });

  it("recalculates backdated edits without rewriting adjustment audit data or monthly openings", () => {
    const changedFood = transactionSchema.parse({
      ...food,
      amountPaisa: 20_000,
    });
    const edited = fullLedger.map((record) =>
      record.id === food.id ? changedFood : record,
    );
    expect(calculateAccountBalance(esewa.id, edited, octoberEnd)).toBe(525_000);
    expect(calculateMonthOpening("2026-11", accounts, edited)).toBe(4_655_000);
    expect(calculateMonthOpening("2026-10", accounts, edited)).toBe(2_130_000);
    expect(calculateMonthClosing("2026-10", accounts, edited)).toBe(4_655_000);
    expect(edited.find((record) => record.id === reconcile.id)).toEqual(
      reconcile,
    );
    expect(
      calculateTotalBalance(
        accounts,
        edited.filter((record) => record.id !== topUp.id),
        octoberEnd,
      ),
    ).toBe(4_655_000);
    expect(
      calculateTotalBalance(
        accounts,
        edited.filter((record) => record.id !== changedFood.id),
        octoberEnd,
      ),
    ).toBe(4_675_000);
  });

  it("includes nonzero archived accounts (and negative balances) rather than dropping money", () => {
    const transferAll = entry({
      number: 20,
      type: "transfer",
      fromAccountId: khalti.id,
      toAccountId: cash.id,
      amountPaisa: 80_000,
      date: "2026-10-11",
    });
    const retroactive = entry({
      number: 21,
      type: "expense",
      accountId: khalti.id,
      categoryId: uuid(101),
      amountPaisa: 2_500,
      date: "2026-10-09",
    });
    const archived = accounts.map((a) =>
      a.id === khalti.id ? { ...a, isActive: false } : a,
    );
    const ledger = [...fullLedger, transferAll, retroactive];
    expect(
      calculateAccountBalance(
        khalti.id,
        [...fullLedger, transferAll],
        "2026-10-12",
      ),
    ).toBe(0);
    expect(calculateAccountBalance(khalti.id, ledger, "2026-10-12")).toBe(
      -2_500,
    );
    expect(calculateTotalBalance(archived, ledger, "2026-10-12")).toBe(
      4_654_500,
    );
    expect(
      calculateTotalBalance(
        archived.filter((a) => a.isActive),
        ledger,
        "2026-10-12",
      ),
    ).not.toBe(4_654_500);
  });
});

describe("dates, guards and signed arithmetic", () => {
  it("uses today's Nepal calendar date by default, excluding future entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T18:14:59.000Z")); // 23:59:59 on Sep 30 in Kathmandu
    expect(calculateTotalBalance(accounts, [...opening, food])).toBe(2_130_000);
    vi.setSystemTime(new Date("2026-09-30T18:15:00.000Z")); // Oct 1 in Kathmandu
    expect(calculateTotalBalance(accounts, fullLedger)).toBe(2_130_000);
    vi.setSystemTime(new Date("2026-10-01T18:15:00.000Z")); // Oct 2 in Kathmandu
    expect(calculateAccountBalance(esewa.id, fullLedger)).toBe(332_000);
    expect(calculateTotalBalance(accounts, fullLedger)).toBe(2_112_000);
  });

  it("uses inclusive Oct 31 via the exclusive Nov 1 boundary and excludes Nov 1", () => {
    const lastDay = entry({
      number: 22,
      type: "income",
      accountId: cash.id,
      categoryId: uuid(102),
      amountPaisa: 1,
      date: "2026-10-31",
      createdAt: "2026-10-30T18:00:00.000Z",
    });
    const nextMonth = entry({
      number: 23,
      type: "expense",
      accountId: cash.id,
      categoryId: uuid(101),
      amountPaisa: 2,
      date: "2026-11-01",
      createdAt: "2026-10-31T18:00:00.000Z",
    });
    const ledger = [...fullLedger, lastDay, nextMonth];
    expect(calculateMonthClosing("2026-10", accounts, ledger)).toBe(4_657_001);
    expect(calculateMonthOpening("2026-11", accounts, ledger)).toBe(4_657_001);
    expect(calculateExpenses(ledger, septemberEnd, octoberEnd)).toBe(18_000);
    expect(calculateExpenses(ledger, octoberEnd, "2026-11-02")).toBe(2);
  });

  it("rejects duplicate account IDs, mixed currencies, invalid ranges and unsafe sums", () => {
    expect(() =>
      calculateTotalBalance([...accounts, cash], fullLedger, octoberEnd),
    ).toThrow(/Duplicate account ID/);
    expect(() =>
      calculateTotalBalance(
        [{ ...cash, currency: "USD" as "NPR" }],
        opening,
        octoberEnd,
      ),
    ).toThrow(/Only NPR/);
    expect(() =>
      calculateIncome(fullLedger, "2026-10-10", "2026-10-01"),
    ).toThrow(RangeError);
    expect(() =>
      calculateRangeSummary(accounts, fullLedger, "2026-02-30", octoberEnd),
    ).toThrow(RangeError);
    const max = entry({
      number: 24,
      type: "opening",
      accountId: cash.id,
      amountPaisa: Number.MAX_SAFE_INTEGER,
    });
    expect(() =>
      calculateAccountBalance(cash.id, [max, max], octoberEnd),
    ).toThrow(/safe integer/);
    expect(() => calculateTotalBalance([cash], [max, max], octoberEnd)).toThrow(
      /safe integer/,
    );
  });

  it("rejects a self-transfer rather than treating it as two editable records", () => {
    // The schema's write validation is responsible for rejecting it; the account-effect selector also fails closed.
    const malformed = { ...topUp, toAccountId: nabil.id } as Transaction;
    expect(() => transactionEffect(nabil.id, malformed)).toThrow(/distinct/);
    expect(() =>
      calculateTotalBalance(accounts, [malformed], octoberEnd),
    ).toThrow(/distinct/);
    expect(() =>
      calculateTransfers([malformed], septemberEnd, octoberEnd),
    ).toThrow(/distinct/);
  });

  it("nets a transfer before adding to an extreme but safe signed total", () => {
    const negative = entry({
      number: 25,
      type: "adjustment",
      accountId: cash.id,
      deltaPaisa: -Number.MAX_SAFE_INTEGER,
      reason: "Audit",
    });
    const moved = entry({
      number: 26,
      type: "transfer",
      fromAccountId: nabil.id,
      toAccountId: esewa.id,
      amountPaisa: 1,
    });
    expect(
      calculateTotalBalance(accounts, [negative, moved], septemberEnd),
    ).toBe(-Number.MAX_SAFE_INTEGER);
  });
});
