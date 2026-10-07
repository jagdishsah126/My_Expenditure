import type { FinanceDatabase } from "../../db/database";
import type { MonthlyConfirmation } from "../../db/schema";

/** Month keys are Kathmandu calendar months, not UTC slices. */
export function kathmanduMonth(date = new Date()): string {
  const pieces = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = pieces.find((part) => part.type === "year")?.value;
  const month = pieces.find((part) => part.type === "month")?.value;
  if (!year || !month)
    throw new Error("Unable to determine Kathmandu calendar month.");
  return `${year}-${month}`;
}

export async function needsMonthConfirmation(
  database: FinanceDatabase,
  currentMonth = kathmanduMonth(),
): Promise<boolean> {
  const firstOpening = await database.transactions
    .where("type")
    .equals("opening")
    .sortBy("date");
  if (!firstOpening.length || firstOpening[0].date.slice(0, 7) >= currentMonth)
    return false;
  return !(await database.monthlyConfirmations.get(currentMonth));
}

export async function confirmMonth(
  database: FinanceDatabase,
  monthKey = kathmanduMonth(),
): Promise<MonthlyConfirmation> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))
    throw new Error("Invalid month.");
  if (monthKey > kathmanduMonth())
    throw new Error("Cannot confirm a future month.");
  if (!(await database.transactions.where("type").equals("opening").count()))
    throw new Error("Create an account before confirming a month.");

  return database.transaction("rw", database.monthlyConfirmations, async () => {
    const existing = await database.monthlyConfirmations.get(monthKey);
    if (existing) return existing;
    const confirmation: MonthlyConfirmation = {
      monthKey,
      confirmedAt: new Date().toISOString(),
      openingChangedSinceConfirmation: false,
    };
    await database.monthlyConfirmations.add(confirmation);
    return confirmation;
  });
}
