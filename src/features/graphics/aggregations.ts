import type { Account, Category, Transaction } from "../../db/schema";
import {
  addCalendarDays,
  assertCalendarDate,
  getKathmanduToday,
  getMonthStart,
  getNextMonthStart,
  inclusiveEndToExclusive,
} from "../../utils/dates";
import {
  calculateAccountBalance,
  calculateExpenses,
  calculateIncome,
} from "../ledger/selectors";

export type RangePreset =
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "last3Months"
  | "last6Months"
  | "custom";
export type DateRange = {
  label: string;
  start: string;
  endExclusive: string;
};

function monthKey(date: string) {
  return assertCalendarDate(date).slice(0, 7);
}
function addMonths(key: string, delta: number) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + delta;
  const nextYear = year + Math.floor(month / 12);
  const nextMonth = ((month % 12) + 12) % 12;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}`;
}

export function resolveRange(
  preset: RangePreset,
  customStart?: string,
  customEnd?: string,
  today = getKathmanduToday(),
): DateRange {
  const endToday = inclusiveEndToExclusive(today);
  const currentMonth = monthKey(today);
  if (preset === "custom") {
    if (!customStart || !customEnd)
      throw new Error("Choose both custom dates.");
    const start = assertCalendarDate(customStart);
    const endExclusive = inclusiveEndToExclusive(assertCalendarDate(customEnd));
    if (start > customEnd) throw new Error("Custom start must be before end.");
    return { label: `${start} to ${customEnd}`, start, endExclusive };
  }
  if (preset === "thisMonth")
    return {
      label: "This month",
      start: getMonthStart(currentMonth),
      endExclusive: endToday,
    };
  if (preset === "lastMonth") {
    const previous = addMonths(currentMonth, -1);
    return {
      label: "Last month",
      start: getMonthStart(previous),
      endExclusive: getMonthStart(currentMonth),
    };
  }
  if (preset === "thisYear")
    return {
      label: "This year",
      start: `${today.slice(0, 4)}-01-01`,
      endExclusive: endToday,
    };
  const months = preset === "last3Months" ? 3 : 6;
  return {
    label: preset === "last3Months" ? "Last 3 months" : "Last 6 months",
    start: getMonthStart(addMonths(currentMonth, -(months - 1))),
    endExclusive: endToday,
  };
}

function inRange(entry: Transaction, range: DateRange) {
  return entry.date >= range.start && entry.date < range.endExclusive;
}
function eachDate(range: DateRange): string[] {
  const dates: string[] = [];
  for (
    let date = range.start;
    date < range.endExclusive;
    date = addCalendarDays(date, 1)
  )
    dates.push(date);
  return dates;
}
function weekKey(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addCalendarDays(date, -((day + 6) % 7));
}

export type Point = { label: string; value: number };
export type IncomeExpensePoint = {
  label: string;
  income: number;
  expense: number;
};

export function dailySpending(
  transactions: Transaction[],
  range: DateRange,
): Point[] {
  const totals = new Map(eachDate(range).map((date) => [date, 0]));
  for (const entry of transactions)
    if (entry.type === "expense" && inRange(entry, range))
      totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.amountPaisa);
  return [...totals].map(([label, value]) => ({ label, value }));
}

export function expenseTrend(
  transactions: Transaction[],
  range: DateRange,
): Point[] {
  const days = eachDate(range).length;
  const group: "daily" | "weekly" | "monthly" =
    days <= 62 ? "daily" : days <= 186 ? "weekly" : "monthly";
  const totals = new Map<string, number>();
  for (const entry of transactions) {
    if (entry.type !== "expense" || !inRange(entry, range)) continue;
    const key =
      group === "daily"
        ? entry.date
        : group === "weekly"
          ? weekKey(entry.date)
          : monthKey(entry.date);
    totals.set(key, (totals.get(key) ?? 0) + entry.amountPaisa);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));
}

export function incomeVsExpense(
  transactions: Transaction[],
  range: DateRange,
): IncomeExpensePoint[] {
  const points: IncomeExpensePoint[] = [];
  for (
    let key = monthKey(range.start);
    getMonthStart(key) < range.endExclusive;
    key = addMonths(key, 1)
  ) {
    const start =
      getMonthStart(key) > range.start ? getMonthStart(key) : range.start;
    const monthEnd = getNextMonthStart(key);
    const end = monthEnd < range.endExclusive ? monthEnd : range.endExclusive;
    points.push({
      label: key,
      income: calculateIncome(transactions, start, end),
      expense: calculateExpenses(transactions, start, end),
    });
  }
  return points;
}

function rootCategory(
  categoryId: string,
  categories: Map<string, Category>,
): Category | undefined {
  const category = categories.get(categoryId);
  if (!category) return undefined;
  return category.parentId ? categories.get(category.parentId) : category;
}

function byCategory(
  transactions: Transaction[],
  categories: Category[],
  range: DateRange,
  type: "expense" | "income",
): Point[] {
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const totals = new Map<string, number>();
  for (const entry of transactions) {
    if (entry.type !== type || !inRange(entry, range)) continue;
    const root = rootCategory(entry.categoryId, categoryMap);
    const label = root?.name ?? "Archived category";
    totals.set(label, (totals.get(label) ?? 0) + entry.amountPaisa);
  }
  return [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export const expenseByCategory = (
  transactions: Transaction[],
  categories: Category[],
  range: DateRange,
) => byCategory(transactions, categories, range, "expense");
export const incomeSources = (
  transactions: Transaction[],
  categories: Category[],
  range: DateRange,
) => byCategory(transactions, categories, range, "income");

export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
): Point[] {
  return accounts
    .map((account) => ({
      label: account.name,
      value: calculateAccountBalance(
        account.id,
        transactions,
        range.endExclusive,
      ),
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function spendingByAccount(
  accounts: Account[],
  transactions: Transaction[],
  range: DateRange,
): Point[] {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const totals = new Map<string, number>();
  for (const entry of transactions) {
    if (entry.type !== "expense" || !inRange(entry, range)) continue;
    const label = names.get(entry.accountId) ?? "Archived account";
    totals.set(label, (totals.get(label) ?? 0) + entry.amountPaisa);
  }
  return [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
