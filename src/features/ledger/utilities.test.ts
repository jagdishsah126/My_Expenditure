import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  assertCalendarDate,
  getKathmanduToday,
  getMonthKey,
  getMonthStart,
  getNextMonthStart,
  inclusiveEndToExclusive,
} from "../../utils/dates";
import { addPaisa, formatNpr, parseNprToPaisa } from "../../utils/money";

describe("exact NPR paisa input/output", () => {
  it("parses decimal text exactly, without floats or lossy rounding", () => {
    expect(parseNprToPaisa("0.01")).toBe(1);
    expect(parseNprToPaisa(" 00123.4 ")).toBe(12_340);
    expect(parseNprToPaisa("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseNprToPaisa("0", { allowZero: true })).toBe(0);
    expect(parseNprToPaisa("00.00", { allowZero: true })).toBe(0);
    for (const value of [
      "",
      " ",
      "0",
      "0.00",
      "-1",
      "+1",
      "1.001",
      "1.",
      ".5",
      "1,000",
      "1e3",
      "NaN",
      "Infinity",
      "90071992547409.92",
    ]) {
      expect(() => parseNprToPaisa(value)).toThrow(RangeError);
    }
  });

  it("formats exact signed balances and flags arithmetic overflow", () => {
    expect(formatNpr(0)).toBe("Rs 0.00");
    expect(formatNpr(1)).toBe("Rs 0.01");
    expect(formatNpr(-2_001_050)).toBe("-Rs 20,010.50");
    expect(formatNpr(Number.MAX_SAFE_INTEGER)).toBe("Rs 90,071,992,547,409.91");
    expect(formatNpr(-Number.MAX_SAFE_INTEGER)).toBe(
      "-Rs 90,071,992,547,409.91",
    );
    expect(addPaisa(120, -250)).toBe(-130);
    expect(() => addPaisa(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
    expect(() => formatNpr(Number.NaN)).toThrow(RangeError);
    expect(() => formatNpr(1.5)).toThrow(RangeError);
  });
});

describe("Kathmandu calendar days and months", () => {
  it("maps UTC instants to Nepal days rather than device/UTC days", () => {
    expect(getKathmanduToday(new Date("2026-09-30T18:14:59.000Z"))).toBe(
      "2026-09-30",
    );
    expect(getKathmanduToday(new Date("2026-09-30T18:15:00.000Z"))).toBe(
      "2026-10-01",
    );
    expect(getKathmanduToday(new Date("2026-12-31T18:15:00.000Z"))).toBe(
      "2027-01-01",
    );
    expect(() => getKathmanduToday(new Date("invalid"))).toThrow(RangeError);
  });

  it("handles months, year rollover, leap years and inclusive user-facing end dates", () => {
    expect(getMonthKey("2026-10-31")).toBe("2026-10");
    expect(getMonthStart("2026-10")).toBe("2026-10-01");
    expect(getNextMonthStart("2026-10")).toBe("2026-11-01");
    expect(getNextMonthStart("2026-12")).toBe("2027-01-01");
    expect(inclusiveEndToExclusive("2026-10-31")).toBe("2026-11-01");
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addCalendarDays("2026-10-01", 0)).toBe("2026-10-01");
  });

  it("rejects impossible days and out-of-range month arithmetic", () => {
    for (const value of [
      "2026-02-29",
      "2026-04-31",
      "2026-00-01",
      "2026-1-01",
      "tomorrow",
    ]) {
      expect(() => assertCalendarDate(value)).toThrow(RangeError);
    }
    expect(() => getMonthStart("2026-13")).toThrow(RangeError);
    expect(() => getNextMonthStart("9999-12")).toThrow(RangeError);
    expect(() => addCalendarDays("9999-12-31", 1)).toThrow(RangeError);
    expect(() => addCalendarDays("2026-01-01", 1.5)).toThrow(RangeError);
  });
});
