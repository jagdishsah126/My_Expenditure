import { assertCalendarDate } from "../../utils/dates";
import { parseNprToPaisa } from "../../utils/money";
import type { ParsedStatement, RawRow } from "./parser";
import { MAX_ROWS } from "./parser";

export type DateFormat = "ymd" | "dmy" | "mdy" | "excel";
export type ColumnMapping = {
  date: number;
  description: number;
  reference: number | null;
  balance: number | null;
  debit: number | null;
  credit: number | null;
  signedAmount: number | null;
  dateFormat: DateFormat;
};
export type Direction = "expense" | "income";
export type StagedRow = {
  key: string;
  sheet: string;
  rowNumber: number;
  raw: string[];
  selected: boolean;
  date: string;
  description: string;
  reference: string;
  amount: string;
  direction: Direction;
  categoryId: string;
  duplicateResolution: "skip" | "keep-both";
  runningBalance: string;
  mappingError?: string;
};

const headers: Record<string, string[]> = {
  date: ["date", "transaction date", "value date", "posted date"],
  description: ["description", "particulars", "details", "narration", "remark"],
  reference: ["reference", "ref", "transaction id"],
  balance: ["balance", "running balance"],
  debit: ["debit", "withdrawal", "withdrawals", "money out"],
  credit: ["credit", "deposit", "deposits", "money in"],
  signedAmount: ["amount", "signed amount"],
};

export function suggestMapping(values: string[]): ColumnMapping {
  const find = (field: string) => {
    const index = values.findIndex((value) =>
      headers[field].includes(value.trim().toLowerCase()),
    );
    return index < 0 ? null : index;
  };
  return {
    date: find("date") ?? 0,
    description: find("description") ?? Math.min(1, values.length - 1),
    reference: find("reference"),
    balance: find("balance"),
    debit: find("debit"),
    credit: find("credit"),
    signedAmount: find("signedAmount"),
    dateFormat: "ymd",
  };
}

export function validateMapping(mapping: ColumnMapping, width: number): void {
  const indexes = [
    mapping.date,
    mapping.description,
    mapping.reference,
    mapping.balance,
    mapping.debit,
    mapping.credit,
    mapping.signedAmount,
  ].filter((value): value is number => value !== null);
  if (
    !indexes.every(
      (value) => Number.isInteger(value) && value >= 0 && value < width,
    ) ||
    new Set(indexes).size !== indexes.length
  )
    throw new Error("Map each field to a distinct available column.");
  if (
    (mapping.debit !== null || mapping.credit !== null) &&
    mapping.signedAmount !== null
  )
    throw new Error(
      "Choose either debit/credit columns or one signed amount column.",
    );
  if (
    mapping.signedAmount === null &&
    (mapping.debit === null || mapping.credit === null)
  )
    throw new Error(
      "Map both Debit and Credit, or map a signed Amount column.",
    );
}

/** Strict, explicit date formats; no Date.parse or device time zone guessing. */
export function parseStatementDate(value: string, format: DateFormat): string {
  const text = value.trim();
  if (format === "excel") {
    const serial = Number(text);
    if (
      !/^\d{1,5}(?:\.0+)?$/.test(text) ||
      !Number.isInteger(serial) ||
      serial < 61 ||
      serial > 2958465
    )
      throw new Error("Invalid Excel date serial (1900 date system only).");
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return assertCalendarDate(date);
  }
  if (format === "ymd") return assertCalendarDate(text);
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!match) throw new Error("Date does not match the selected format.");
  const month = format === "dmy" ? match[2] : match[1];
  const day = format === "dmy" ? match[1] : match[2];
  return assertCalendarDate(
    `${match[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
  );
}

function parseSigned(text: string): { amount: string; direction: Direction } {
  const cleaned = text.trim().replaceAll(",", "");
  const negative = cleaned.startsWith("-");
  const absolute =
    negative || cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  parseNprToPaisa(absolute);
  return { amount: absolute, direction: negative ? "expense" : "income" };
}

function toStage(
  row: RawRow,
  sheet: string,
  mapping: ColumnMapping,
): StagedRow {
  const cell = (index: number | null) =>
    index === null ? "" : (row.cells[index] ?? "").trim();
  let date = cell(mapping.date);
  try {
    date = parseStatementDate(date, mapping.dateFormat);
  } catch {
    /* editable in review */
  }
  let amount = "";
  let mappingError: string | undefined;
  let direction: Direction = "expense";
  if (mapping.signedAmount !== null) {
    try {
      ({ amount, direction } = parseSigned(cell(mapping.signedAmount)));
    } catch {
      amount = cell(mapping.signedAmount);
    }
  } else {
    const debit = cell(mapping.debit).replaceAll(",", "");
    const credit = cell(mapping.credit).replaceAll(",", "");
    if (debit && !credit) {
      amount = debit;
      direction = "expense";
    } else if (credit && !debit) {
      amount = credit;
      direction = "income";
    } else {
      amount = debit || credit;
      mappingError =
        "Both debit and credit are filled, or both are empty. Choose a direction and correct the amount.";
    }
  }
  return {
    key: `${sheet}:${row.rowNumber}`,
    sheet,
    rowNumber: row.rowNumber,
    raw: row.cells,
    selected: true,
    date,
    description: cell(mapping.description),
    reference: cell(mapping.reference),
    amount,
    direction,
    categoryId: "",
    duplicateResolution: "skip",
    runningBalance: cell(mapping.balance),
    mappingError,
  };
}

/** Mapping is a pure staging step. No IndexedDB write occurs here. */
export function stageStatement(
  document: ParsedStatement,
  sheetName: string,
  headerIndex: number,
  mapping: ColumnMapping,
): StagedRow[] {
  const sheet = document.sheets.find((item) => item.name === sheetName);
  if (!sheet) throw new Error("Choose a sheet.");
  if (
    !Number.isInteger(headerIndex) ||
    headerIndex < 0 ||
    headerIndex >= Math.min(sheet.rows.length, 20)
  )
    throw new Error("Choose a header from the first 20 rows.");
  validateMapping(mapping, sheet.rows[headerIndex].cells.length);
  const rows = sheet.rows
    .slice(headerIndex + 1)
    .filter((row) => row.cells.some((value) => value.trim()));
  if (rows.length > MAX_ROWS)
    throw new Error("Too many data rows (limit: 2,000).");
  return rows.map((row) => toStage(row, sheetName, mapping));
}

/** Persist only column NAMES (not data) in the existing importMappings table. */
export function mappingColumns(
  mapping: ColumnMapping,
  headings: string[],
): Record<string, string> {
  const columns: Record<string, string> = { dateFormat: mapping.dateFormat };
  for (const field of [
    "date",
    "description",
    "reference",
    "balance",
    "debit",
    "credit",
    "signedAmount",
  ] as const) {
    const index = mapping[field];
    if (index !== null) columns[field] = headings[index];
  }
  return columns;
}
export function restoreMapping(
  columns: Record<string, string>,
  headings: string[],
): ColumnMapping | null {
  const find = (field: string): number | null => {
    if (!(field in columns)) return null;
    const index = headings.indexOf(columns[field]);
    if (index < 0 || headings.indexOf(columns[field], index + 1) !== -1)
      throw new Error("Column missing or ambiguous.");
    return index;
  };
  try {
    const format = columns.dateFormat;
    if (!["ymd", "dmy", "mdy", "excel"].includes(format)) return null;
    const date = find("date"),
      description = find("description");
    if (date === null || description === null) return null;
    const mapping = {
      date,
      description,
      reference: find("reference"),
      balance: find("balance"),
      debit: find("debit"),
      credit: find("credit"),
      signedAmount: find("signedAmount"),
      dateFormat: format as DateFormat,
    };
    validateMapping(mapping, headings.length);
    return mapping;
  } catch {
    return null;
  }
}
