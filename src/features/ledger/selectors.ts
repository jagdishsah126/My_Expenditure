import type { Account, Transaction } from "../../db/schema";
import {
  assertCalendarDate,
  getKathmanduToday,
  getMonthStart,
  getNextMonthStart,
  inclusiveEndToExclusive,
} from "../../utils/dates";
import { addPaisa, assertSafePaisa } from "../../utils/money";

function endDate(exclusiveEndDate?: string): string {
  return exclusiveEndDate === undefined
    ? inclusiveEndToExclusive(getKathmanduToday())
    : assertCalendarDate(exclusiveEndDate);
}

function checkRange(startDate: string, exclusiveEndDate: string): void {
  assertCalendarDate(startDate);
  assertCalendarDate(exclusiveEndDate);
  if (startDate > exclusiveEndDate) {
    throw new RangeError(
      "Range start must not be later than its exclusive end",
    );
  }
}

function inRange(
  date: string,
  startDate: string,
  exclusiveEndDate: string,
): boolean {
  return date >= startDate && date < exclusiveEndDate;
}

function assertDistinctTransfer(
  entry: Extract<Transaction, { type: "transfer" }>,
): void {
  if (entry.fromAccountId === entry.toAccountId) {
    throw new RangeError("A transfer must have distinct accounts");
  }
}

/** The signed effect of one canonical entry on one account. */
export function transactionEffect(
  accountId: string,
  entry: Transaction,
): number {
  switch (entry.type) {
    case "opening":
    case "income":
      return entry.accountId === accountId
        ? assertSafePaisa(entry.amountPaisa)
        : 0;
    case "expense":
      return entry.accountId === accountId
        ? -assertSafePaisa(entry.amountPaisa)
        : 0;
    case "transfer":
      assertDistinctTransfer(entry);
      if (entry.fromAccountId === accountId)
        return -assertSafePaisa(entry.amountPaisa);
      if (entry.toAccountId === accountId)
        return assertSafePaisa(entry.amountPaisa);
      return 0;
    case "adjustment":
      return entry.accountId === accountId
        ? assertSafePaisa(entry.deltaPaisa)
        : 0;
  }
}

/** No end date means right now: include today in Kathmandu but not future entries. */
export function calculateAccountBalance(
  accountId: string,
  transactions: readonly Transaction[],
  exclusiveEndDate?: string,
): number {
  const end = endDate(exclusiveEndDate);
  let balance = 0;
  for (const entry of transactions) {
    if (entry.date < end) {
      balance = addPaisa(balance, transactionEffect(accountId, entry));
    }
  }
  return balance;
}

/** Includes archived accounts, even when a historical change leaves one nonzero. */
export function calculateTotalBalance(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  exclusiveEndDate?: string,
): number {
  const end = endDate(exclusiveEndDate);
  const ids = new Set<string>();
  for (const account of accounts) {
    if (account.currency !== "NPR")
      throw new RangeError("Only NPR accounts can be summed");
    if (ids.has(account.id))
      throw new RangeError(`Duplicate account ID: ${account.id}`);
    ids.add(account.id);
  }
  let balance = 0;
  for (const entry of transactions) {
    if (entry.date >= end) continue;
    if (entry.type === "transfer") {
      assertDistinctTransfer(entry);
      // Net both sides first: a complete internal transfer is exactly zero,
      // even when adding either side separately would briefly overflow.
      const amount = assertSafePaisa(entry.amountPaisa);
      const from = ids.has(entry.fromAccountId) ? -amount : 0;
      const to = ids.has(entry.toAccountId) ? amount : 0;
      balance = addPaisa(balance, from + to);
    } else if (ids.has(entry.accountId)) {
      balance = addPaisa(balance, transactionEffect(entry.accountId, entry));
    }
  }
  return balance;
}

type AmountEntry = Extract<Transaction, { amountPaisa: number }>;

function sumAmounts(
  transactions: readonly Transaction[],
  type: AmountEntry["type"],
  startDate: string,
  exclusiveEndDate: string,
): number {
  checkRange(startDate, exclusiveEndDate);
  let sum = 0;
  for (const entry of transactions) {
    if (
      entry.type === type &&
      inRange(entry.date, startDate, exclusiveEndDate)
    ) {
      if (entry.type === "transfer") assertDistinctTransfer(entry);
      sum = addPaisa(sum, entry.amountPaisa);
    }
  }
  return sum;
}

/** Range boundaries are [startDate, exclusiveEndDate), both Kathmandu calendar dates. */
export function calculateIncome(
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): number {
  return sumAmounts(transactions, "income", startDate, exclusiveEndDate);
}

export function calculateExpenses(
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): number {
  return sumAmounts(transactions, "expense", startDate, exclusiveEndDate);
}

/** Gross internal money moved, counted once per transfer; NOT income, expense, or net worth. */
export function calculateTransfers(
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): number {
  return sumAmounts(transactions, "transfer", startDate, exclusiveEndDate);
}

/** A signed net reconciliation delta, not operating income/expense. */
export function calculateAdjustments(
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): number {
  checkRange(startDate, exclusiveEndDate);
  let sum = 0;
  for (const entry of transactions) {
    if (
      entry.type === "adjustment" &&
      inRange(entry.date, startDate, exclusiveEndDate)
    ) {
      sum = addPaisa(sum, entry.deltaPaisa);
    }
  }
  return sum;
}

/** New accounts' one-time openings in the period, not monthly carry-forward. */
export function calculateOpeningEntries(
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): number {
  return sumAmounts(transactions, "opening", startDate, exclusiveEndDate);
}

export function calculateMonthOpening(
  monthKey: string,
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): number {
  return calculateTotalBalance(accounts, transactions, getMonthStart(monthKey));
}

export function calculateMonthClosing(
  monthKey: string,
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): number {
  return calculateTotalBalance(
    accounts,
    transactions,
    getNextMonthStart(monthKey),
  );
}

export interface RangeSummary {
  openingPaisa: number;
  closingPaisa: number;
  incomePaisa: number;
  expensesPaisa: number;
  /** Gross transfer volume. Internal transfers do not change the total. */
  transfersPaisa: number;
  adjustmentsPaisa: number;
  openingEntriesPaisa: number;
  operatingNetPaisa: number;
  netChangePaisa: number;
}

export function calculateRangeSummary(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  startDate: string,
  exclusiveEndDate: string,
): RangeSummary {
  checkRange(startDate, exclusiveEndDate);
  const openingPaisa = calculateTotalBalance(accounts, transactions, startDate);
  const closingPaisa = calculateTotalBalance(
    accounts,
    transactions,
    exclusiveEndDate,
  );
  const incomePaisa = calculateIncome(
    transactions,
    startDate,
    exclusiveEndDate,
  );
  const expensesPaisa = calculateExpenses(
    transactions,
    startDate,
    exclusiveEndDate,
  );
  return {
    openingPaisa,
    closingPaisa,
    incomePaisa,
    expensesPaisa,
    transfersPaisa: calculateTransfers(
      transactions,
      startDate,
      exclusiveEndDate,
    ),
    adjustmentsPaisa: calculateAdjustments(
      transactions,
      startDate,
      exclusiveEndDate,
    ),
    openingEntriesPaisa: calculateOpeningEntries(
      transactions,
      startDate,
      exclusiveEndDate,
    ),
    operatingNetPaisa: addPaisa(incomePaisa, -expensesPaisa),
    netChangePaisa: addPaisa(closingPaisa, -openingPaisa),
  };
}
