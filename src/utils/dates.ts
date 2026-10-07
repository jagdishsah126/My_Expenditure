const DAY_MS = 86_400_000;
const kathmanduCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A date-only ISO calendar value, independent of the device's time zone. */
export function assertCalendarDate(date: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) {
    throw new RangeError("Invalid YYYY-MM-DD date");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new RangeError("Invalid calendar date");
  }
  return date;
}

export function getKathmanduToday(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid instant");
  const parts = kathmanduCalendar.formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return assertCalendarDate(
    `${part("year")?.padStart(4, "0")}-${part("month")}-${part("day")}`,
  );
}

/** UTC is used only for date-only arithmetic; it does not define a Nepal month. */
export function addCalendarDays(date: string, days: number): string {
  assertCalendarDate(date);
  if (!Number.isSafeInteger(days))
    throw new RangeError("Days must be a safe integer");
  const next = new Date(
    new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS,
  );
  if (!Number.isFinite(next.getTime()))
    throw new RangeError("Date out of range");
  return assertCalendarDate(next.toISOString().slice(0, 10));
}

export function inclusiveEndToExclusive(date: string): string {
  return addCalendarDays(date, 1);
}

export function getMonthKey(date: string): string {
  return assertCalendarDate(date).slice(0, 7);
}

export function getMonthStart(monthKey: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new RangeError("Invalid YYYY-MM month");
  }
  return assertCalendarDate(`${monthKey}-01`);
}

export function getNextMonthStart(monthKey: string): string {
  const start = getMonthStart(monthKey);
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  if (year === 9999 && month === 12) throw new RangeError("Date out of range");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}
