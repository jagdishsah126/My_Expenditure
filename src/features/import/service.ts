import type { FinanceDatabase } from "../../db/database";
import {
  accountSchema,
  importMappingSchema,
  transactionSchema,
  type Transaction,
} from "../../db/schema";
import { assertCalendarDate, addCalendarDays } from "../../utils/dates";
import { parseNprToPaisa } from "../../utils/money";
import type { FileFormat } from "./parser";
import type { ColumnMapping, StagedRow } from "./mapping";
import { mappingColumns } from "./mapping";

export type AccountChoice =
  | { kind: "existing"; id: string }
  | {
      kind: "new";
      name: string;
      accountTypeId: string;
      openingDate: string;
      openingAmount: string;
    };
export type ImportDraft = {
  format: FileFormat;
  filename: string;
  account: AccountChoice;
  rows: StagedRow[];
};
export type RowReview = { row: StagedRow; errors: string[]; matches: string[] };
export type ImportPreview = Readonly<{
  reviews: RowReview[];
  selected: number;
  excluded: number;
  duplicateCount: number;
  accountLabel: string;
  balanceNote: string;
}>;
export type ImportResult = { imported: number; skipped: number; failed: 0 };

type Normalized = {
  row: StagedRow;
  amountPaisa: number;
  date: string;
  description: string;
  reference: string;
};
const previews = new WeakMap<
  ImportPreview,
  { database: FinanceDatabase; draft: ImportDraft; matches: string }
>();
const normalizeText = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "");

function validateRow(row: StagedRow): {
  errors: string[];
  normalized?: Normalized;
} {
  const errors: string[] = [];
  if (row.mappingError) errors.push(row.mappingError);
  let date = row.date;
  let amountPaisa = 0;
  try {
    date = assertCalendarDate(row.date);
  } catch {
    errors.push("Enter a real YYYY-MM-DD date.");
  }
  try {
    amountPaisa = parseNprToPaisa(row.amount.replaceAll(",", ""));
  } catch {
    errors.push("Enter a positive NPR amount (max 2 decimals).");
  }
  if (!row.description.trim() || row.description.length > 500)
    errors.push("Description must be 1–500 characters.");
  if (row.reference.length > 150)
    errors.push("Reference exceeds 150 characters.");
  if (row.direction !== "expense" && row.direction !== "income")
    errors.push("Choose income or expense, not transfer.");
  if (!row.categoryId) errors.push("Choose a category for this row.");
  return {
    errors,
    normalized: errors.length
      ? undefined
      : {
          row,
          date,
          amountPaisa,
          description: row.description.trim(),
          reference: row.reference.trim(),
        },
  };
}

function referenceFromEntry(entry: Transaction): string {
  const stored = entry.sourceReference ?? "";
  const match = /(?:^|\|)ref:([^|]*)/.exec(stored);
  if (!match) return stored;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}
function comparable(
  entry: Normalized,
  other: {
    accountId: string;
    type: string;
    date: string;
    amountPaisa: number;
    remark?: string;
    sourceReference?: string;
  },
  accountId: string,
): string | null {
  if (
    other.accountId !== accountId ||
    other.type !== entry.row.direction ||
    other.amountPaisa !== entry.amountPaisa ||
    other.date < addCalendarDays(entry.date, -1) ||
    other.date > addCalendarDays(entry.date, 1)
  )
    return null;
  const reference = normalizeText(entry.reference);
  const oldReference = normalizeText(referenceFromEntry(other as Transaction));
  const description = normalizeText(entry.description);
  const oldDescription = normalizeText(other.remark ?? "");
  if (reference && oldReference && reference === oldReference)
    return "same reference, amount, direction and nearby date";
  if (description && description === oldDescription)
    return "same description, amount, direction and nearby date";
  if (!description || !oldDescription)
    return "same amount, direction and nearby date (description missing)";
  return null;
}

function duplicateMatches(
  normalized: Normalized[],
  existing: Transaction[],
  accountId: string,
): Map<string, string[]> {
  const matches = new Map<string, string[]>();
  const seen: Normalized[] = [];
  for (const entry of normalized) {
    const found: string[] = [];
    for (const prior of seen) {
      const reason = comparable(
        entry,
        {
          accountId,
          type: prior.row.direction,
          date: prior.date,
          amountPaisa: prior.amountPaisa,
          remark: prior.description,
          sourceReference: prior.reference,
        },
        accountId,
      );
      if (reason) found.push(`File row ${prior.row.rowNumber}: ${reason}`);
    }
    for (const old of existing) {
      if (old.type !== "expense" && old.type !== "income") continue;
      const reason = comparable(entry, old, accountId);
      if (reason) found.push(`Existing ${old.id}: ${reason}`);
    }
    matches.set(entry.row.key, found.sort());
    seen.push(entry);
  }
  return matches;
}

function snapshotMatches(matches: Map<string, string[]>): string {
  return JSON.stringify(
    [...matches.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

async function validateAccount(
  database: FinanceDatabase,
  choice: AccountChoice,
  entries: Normalized[],
): Promise<{ id: string; label: string }> {
  if (choice.kind === "existing") {
    const account = await database.accounts.get(choice.id);
    if (!account || !account.isActive || account.currency !== "NPR")
      throw new Error("Choose an active NPR account.");
    const openings = await database.transactions
      .where("accountId")
      .equals(account.id)
      .filter((item) => item.type === "opening")
      .toArray();
    if (openings.length !== 1)
      throw new Error("Account needs exactly one opening entry.");
    if (entries.some((item) => item.date < openings[0].date))
      throw new Error(
        "Import predates the account opening. Correct its opening date/balance deliberately before importing.",
      );
    return { id: account.id, label: account.name };
  }
  if (!(await database.accountTypes.get(choice.accountTypeId)))
    throw new Error("Choose a valid account type.");
  assertCalendarDate(choice.openingDate);
  parseNprToPaisa(choice.openingAmount, { allowZero: true });
  if (!choice.name.trim() || choice.name.length > 120)
    throw new Error("New account name must be 1–120 characters.");
  if (entries.some((item) => item.date < choice.openingDate))
    throw new Error(
      "New account opening date must be on or before every selected transaction.",
    );
  return { id: "new-account", label: `New: ${choice.name.trim()}` };
}

async function evaluate(database: FinanceDatabase, draft: ImportDraft) {
  if (
    draft.rows.length > 2000 ||
    draft.filename.length > 120 ||
    !["csv", "xlsx"].includes(draft.format)
  )
    throw new Error("Invalid import draft.");
  const keys = new Set<string>();
  const reviews = draft.rows.map((row) => {
    if (keys.has(row.key)) throw new Error("Repeated source row key.");
    keys.add(row.key);
    const result = validateRow(row);
    return {
      row,
      errors: row.selected ? result.errors : [],
      matches: [] as string[],
      normalized: row.selected ? result.normalized : undefined,
    };
  });
  const selected = reviews.filter((item) => item.row.selected);
  if (!selected.length) throw new Error("Select at least one row.");
  const account = await validateAccount(
    database,
    draft.account,
    selected.flatMap((item) => (item.normalized ? [item.normalized] : [])),
  );
  const categories = await database.categories.toArray();
  for (const item of selected) {
    const category = categories.find(
      (entry) => entry.id === item.row.categoryId,
    );
    if (
      item.row.categoryId &&
      (!category ||
        !category.isActive ||
        category.parentId ||
        (category.type !== "both" && category.type !== item.row.direction))
    )
      item.errors.push("Choose an active compatible top-level category.");
  }
  const existing =
    draft.account.kind === "existing"
      ? await database.transactions
          .where("accountId")
          .equals(account.id)
          .toArray()
      : [];
  const matches = duplicateMatches(
    selected.flatMap((item) => (item.normalized ? [item.normalized] : [])),
    existing,
    account.id,
  );
  for (const item of selected) item.matches = matches.get(item.row.key) ?? [];
  return { reviews, account, matches };
}

/** Read-only: validates and finds possible duplicates, including in the same file. */
export async function previewImport(
  database: FinanceDatabase,
  draft: ImportDraft,
): Promise<ImportPreview> {
  // Clone so editing the UI draft after preview cannot change what commit writes.
  const copy = structuredClone(draft);
  const evaluated = await database.transaction(
    "r",
    database.accounts,
    database.accountTypes,
    database.categories,
    database.transactions,
    () => evaluate(database, copy),
  );
  const reviews = evaluated.reviews.map(({ row, errors, matches }) => ({
    row,
    errors,
    matches,
  }));
  const preview: ImportPreview = Object.freeze({
    reviews,
    selected: reviews.filter((item) => item.row.selected).length,
    excluded: reviews.filter((item) => !item.row.selected).length,
    duplicateCount: reviews.filter(
      (item) => item.row.selected && item.matches.length,
    ).length,
    accountLabel: evaluated.account.label,
    balanceNote:
      "Running balances are advisory only. Partial/skipped rows and unknown opening balance make reconciliation inconclusive; no balance is forced.",
  });
  previews.set(preview, {
    database,
    draft: copy,
    matches: snapshotMatches(evaluated.matches),
  });
  return preview;
}

/** One transaction: revalidate references/duplicates, add optional account + opening, rows, and month flags. Any error rolls back all writes. */
export async function commitImport(
  database: FinanceDatabase,
  preview: ImportPreview,
): Promise<ImportResult> {
  const stored = previews.get(preview);
  if (!stored || stored.database !== database)
    throw new Error("Preview this import before committing.");
  const draft = stored.draft;
  const result = await database.transaction(
    "rw",
    database.accountTypes,
    database.accounts,
    database.categories,
    database.transactions,
    database.monthlyConfirmations,
    async () => {
      const { reviews, matches } = await evaluate(database, draft);
      if (snapshotMatches(matches) !== stored.matches)
        throw new Error(
          "Transactions changed since preview. Review duplicates again before importing.",
        );
      const chosen = reviews.filter((item) => item.row.selected);
      const invalid = chosen.find((item) => item.errors.length);
      if (invalid)
        throw new Error(
          `Row ${invalid.row.rowNumber}: ${invalid.errors.join(" ")}`,
        );
      const unresolved = chosen.find(
        (item) =>
          item.matches.length && item.row.duplicateResolution !== "keep-both",
      );
      if (unresolved)
        throw new Error(
          `Row ${unresolved.row.rowNumber} may be a duplicate. Skip it or explicitly choose Keep both.`,
        );
      const now = new Date().toISOString();
      const accountId =
        draft.account.kind === "existing"
          ? draft.account.id
          : crypto.randomUUID();
      if (draft.account.kind === "new") {
        const account = accountSchema.parse({
          id: accountId,
          name: draft.account.name.trim(),
          accountTypeId: draft.account.accountTypeId,
          currency: "NPR",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        const opening = transactionSchema.parse({
          id: crypto.randomUUID(),
          type: "opening",
          accountId,
          amountPaisa: parseNprToPaisa(draft.account.openingAmount, {
            allowZero: true,
          }),
          date: draft.account.openingDate,
          tagIds: [],
          source: "manual",
          createdAt: now,
          updatedAt: now,
        });
        await database.accounts.add(account);
        await database.transactions.add(opening);
      }
      const records = chosen.map((item) => {
        const amountPaisa = parseNprToPaisa(
          item.row.amount.replaceAll(",", ""),
        );
        // Reference retains file/sheet/row provenance and original statement reference.
        const provenance = `${draft.filename.replaceAll("|", "_")} | ${item.row.sheet.replaceAll("|", "_")}!${item.row.rowNumber}`;
        return transactionSchema.parse({
          id: crypto.randomUUID(),
          type: item.row.direction,
          accountId,
          amountPaisa,
          date: item.row.date,
          categoryId: item.row.categoryId,
          remark: item.row.description.trim(),
          source: "imported",
          tagIds: [],
          sourceReference: `${provenance}|ref:${encodeURIComponent(item.row.reference.trim())}`,
          createdAt: now,
          updatedAt: now,
        });
      });
      await database.transactions.bulkAdd(records);
      const earliest = [
        draft.account.kind === "new" ? draft.account.openingDate : "9999-12-31",
        ...records.map((item) => item.date),
      ].sort()[0];
      const confirmations = await database.monthlyConfirmations.toArray();
      const changed = confirmations.filter(
        (item) =>
          earliest < `${item.monthKey}-01` &&
          !item.openingChangedSinceConfirmation,
      );
      if (changed.length)
        await database.monthlyConfirmations.bulkPut(
          changed.map((item) => ({
            ...item,
            openingChangedSinceConfirmation: true,
          })),
        );
      return {
        imported: records.length,
        skipped: draft.rows.length - records.length,
        failed: 0 as const,
      };
    },
  );
  previews.delete(preview);
  return result;
}

/** Explicit optional mapping save, independent of preview/commit. No financial write. */
export async function saveColumnMapping(
  database: FinanceDatabase,
  name: string,
  format: FileFormat,
  mapping: ColumnMapping,
  headings: string[],
): Promise<void> {
  const record = importMappingSchema.parse({
    id: crypto.randomUUID(),
    name: name.trim(),
    format,
    columns: mappingColumns(mapping, headings),
    updatedAt: new Date().toISOString(),
  });
  await database.importMappings.add(record);
}
