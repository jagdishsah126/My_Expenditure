import { z } from "zod";
import type { FinanceDatabase } from "../../db/database";
import {
  accountSchema,
  accountTypeSchema,
  categorySchema,
  importMappingSchema,
  monthlyConfirmationSchema,
  preferencesSchema,
  tagSchema,
  transactionSchema,
  type Transaction,
} from "../../db/schema";

// This is the backup format version, not the Dexie database version. No older
// backup formats are supported yet; a future format needs an explicit migration.
export const BACKUP_FORMAT = "my-finance-json-backup";
export const BACKUP_VERSION = 1;
export const RESTORE_CONFIRMATION = "REPLACE_ALL_DATA";
export const LAST_EXPORT_KEY = "lastExportInitiated";

const strictTransactions = z.discriminatedUnion("type", [
  transactionSchema.options[0].strict(),
  transactionSchema.options[1].strict(),
  transactionSchema.options[2].strict(),
  transactionSchema.options[3].strict(),
  transactionSchema.options[4].strict(),
]);
const settingSchema = z
  .object({
    key: z.string().min(1),
    value: z.json(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const dataSchema = z
  .object({
    accountTypes: z.array(accountTypeSchema.strict()),
    accounts: z.array(accountSchema.strict()),
    categories: z.array(categorySchema.strict()),
    tags: z.array(tagSchema.strict()),
    transactions: z.array(strictTransactions),
    monthlyConfirmations: z.array(monthlyConfirmationSchema.strict()),
    importMappings: z.array(importMappingSchema.strict()),
    settings: z.array(settingSchema),
  })
  .strict();
const backupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    schemaVersion: z.literal(BACKUP_VERSION),
    exportedAt: z.iso.datetime(),
    data: dataSchema,
  })
  .strict();

export type BackupData = z.infer<typeof dataSchema>;
export type BackupDocument = z.infer<typeof backupSchema>;
export type BackupTable = keyof BackupData;
export type BackupCounts = Record<BackupTable, number>;
export type RestorePreview = Readonly<{
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  incoming: Readonly<BackupCounts>;
  replacing: Readonly<BackupCounts>;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  consequence: "All eight local tables will be replaced; existing records not in this backup will be deleted. No merge is performed.";
}>;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

const tableNames: BackupTable[] = [
  "accountTypes",
  "accounts",
  "categories",
  "tags",
  "transactions",
  "monthlyConfirmations",
  "importMappings",
  "settings",
];

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function unique<T>(items: T[], key: (item: T) => string, name: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) fail(`Duplicate ${name}: ${value}`);
    seen.add(value);
  }
}

function checkReferences(data: BackupData): void {
  unique(data.accountTypes, (item) => item.id, "account type ID");
  unique(data.accounts, (item) => item.id, "account ID");
  unique(data.categories, (item) => item.id, "category ID");
  unique(data.tags, (item) => item.id, "tag ID");
  unique(data.transactions, (item) => item.id, "transaction ID");
  unique(data.monthlyConfirmations, (item) => item.monthKey, "month key");
  unique(data.importMappings, (item) => item.id, "mapping ID");
  unique(data.settings, (item) => item.key, "setting key");
  // IndexedDB also has a unique tag-label index; reject before clearing tables.
  unique(data.tags, (tag) => tag.label, "tag label");

  const types = new Set(data.accountTypes.map((type) => type.id));
  const accounts = new Map(
    data.accounts.map((account) => [account.id, account]),
  );
  const categories = new Map(
    data.categories.map((category) => [category.id, category]),
  );
  const tags = new Set(data.tags.map((tag) => tag.id));
  for (const account of data.accounts) {
    if (!types.has(account.accountTypeId))
      fail(`Account ${account.id} references a missing account type`);
  }
  for (const category of data.categories) {
    if (!category.parentId) continue;
    const parent = categories.get(category.parentId);
    if (!parent) fail(`Category ${category.id} references a missing parent`);
    if (parent.type !== "both" && category.type !== parent.type) {
      fail(`Category ${category.id} is incompatible with its parent`);
    }
    const visited = new Set<string>([category.id]);
    let current: typeof parent | undefined = parent;
    while (current) {
      if (visited.has(current.id))
        fail(`Category ${category.id} has a parent cycle`);
      visited.add(current.id);
      current = current.parentId ? categories.get(current.parentId) : undefined;
    }
  }

  const openings = new Set<string>();
  const balance = new Map<string, bigint>();
  let total = 0n;
  const isUnsafe = (amount: bigint) =>
    amount > BigInt(Number.MAX_SAFE_INTEGER) ||
    amount < BigInt(Number.MIN_SAFE_INTEGER);
  const add = (id: string, delta: bigint, internalTransfer = false) => {
    const next = (balance.get(id) ?? 0n) + delta;
    if (isUnsafe(next))
      fail(`Account ${id} balance exceeds safe integer paisa`);
    balance.set(id, next);
    if (!internalTransfer) {
      total += delta;
      if (isUnsafe(total)) fail("Overall balance exceeds safe integer paisa");
    }
  };
  const requireAccount = (id: string) => {
    if (!accounts.has(id)) fail(`Transaction references missing account ${id}`);
  };
  // Check intermediate ledger sums, not just final balances; records may be future dated.
  const transactions = [...data.transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  for (const entry of transactions) {
    unique(entry.tagIds, (id) => id, `tag in transaction ${entry.id}`);
    for (const tagId of entry.tagIds) {
      if (!tags.has(tagId))
        fail(`Transaction ${entry.id} references missing tag ${tagId}`);
    }
    if (entry.type === "transfer") {
      requireAccount(entry.fromAccountId);
      requireAccount(entry.toAccountId);
      if (entry.fromAccountId === entry.toAccountId)
        fail(`Transfer ${entry.id} has the same source and destination`);
      add(entry.fromAccountId, -BigInt(entry.amountPaisa), true);
      add(entry.toAccountId, BigInt(entry.amountPaisa), true);
    } else {
      requireAccount(entry.accountId);
      if (entry.type === "opening") {
        if (openings.has(entry.accountId))
          fail(`Account ${entry.accountId} has multiple openings`);
        openings.add(entry.accountId);
        add(entry.accountId, BigInt(entry.amountPaisa));
      } else if (entry.type === "adjustment") {
        add(entry.accountId, BigInt(entry.deltaPaisa));
      } else {
        const category = categories.get(entry.categoryId);
        if (
          !category ||
          (category.type !== "both" && category.type !== entry.type)
        ) {
          fail(
            `Transaction ${entry.id} references a missing or incompatible category`,
          );
        }
        if (entry.subcategoryId) {
          const subcategory = categories.get(entry.subcategoryId);
          if (
            !subcategory ||
            subcategory.parentId !== entry.categoryId ||
            (subcategory.type !== "both" && subcategory.type !== entry.type)
          ) {
            fail(
              `Transaction ${entry.id} references an incompatible subcategory`,
            );
          }
        }
        add(
          entry.accountId,
          BigInt(
            entry.type === "income" ? entry.amountPaisa : -entry.amountPaisa,
          ),
        );
      }
    }
  }
  for (const account of data.accounts) {
    if (!openings.has(account.id))
      fail(`Account ${account.id} has no opening transaction`);
  }
  // Other setting keys are intentionally opaque but must be JSON (and preserved).
  for (const setting of data.settings) {
    if (
      setting.key === "preferences" &&
      !preferencesSchema.safeParse(setting).success
    ) {
      fail("Invalid preferences setting");
    }
    if (
      setting.key === LAST_EXPORT_KEY &&
      !z.object({ at: z.iso.datetime() }).strict().safeParse(setting.value)
        .success
    ) {
      fail("Invalid last export initiated setting");
    }
  }
}

function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

function validate(input: unknown): BackupDocument {
  const result = backupSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    fail(
      `Invalid or unsupported backup: ${issue?.path.join(".") || "document"}: ${issue?.message || "invalid value"}`,
    );
  }
  // Shared Zod schemas trim strings. A backup must not silently rewrite a
  // user's stored data while pretending to be a lossless round trip.
  if (canonicalJson(result.data) !== canonicalJson(input)) {
    fail("Backup contains values that would be normalized or dropped");
  }
  checkReferences(result.data.data);
  return result.data;
}

function parseJson(json: string): BackupDocument {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    fail("Backup is not valid JSON");
  }
  return validate(input);
}

async function readData(database: FinanceDatabase) {
  return {
    accountTypes: await database.accountTypes.toArray(),
    accounts: await database.accounts.toArray(),
    categories: await database.categories.toArray(),
    tags: await database.tags.toArray(),
    transactions: await database.transactions.toArray(),
    monthlyConfirmations: await database.monthlyConfirmations.toArray(),
    importMappings: await database.importMappings.toArray(),
    settings: await database.settings.toArray(),
  };
}

function counts(data: Record<BackupTable, readonly unknown[]>): BackupCounts {
  return Object.fromEntries(
    tableNames.map((name) => [name, data[name].length]),
  ) as BackupCounts;
}

function inAllTables<T>(
  database: FinanceDatabase,
  mode: "r" | "rw",
  action: () => Promise<T>,
): Promise<T> {
  return database.transaction(
    mode,
    [
      database.accountTypes,
      database.accounts,
      database.categories,
      database.tags,
      database.transactions,
      database.monthlyConfirmations,
      database.importMappings,
      database.settings,
    ],
    action,
  );
}

/** Returns plaintext sensitive financial data. Caller must download/store it locally; no network is used. */
export async function exportBackupJson(
  database: FinanceDatabase,
): Promise<string> {
  return inAllTables(database, "rw", async () => {
    const exportedAt = new Date().toISOString();
    // This records an attempt, not proof that a browser saved the downloaded file.
    await database.settings.put({
      key: LAST_EXPORT_KEY,
      value: { at: exportedAt },
      updatedAt: exportedAt,
    });
    const document = validate({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      schemaVersion: BACKUP_VERSION,
      exportedAt,
      data: await readData(database),
    });
    return JSON.stringify(document, null, 2);
  });
}

const previews = new WeakMap<
  RestorePreview,
  { database: FinanceDatabase; json: string; existing: string }
>();

/** Validation and existing-data inspection only: never writes to IndexedDB. */
export async function previewRestore(
  database: FinanceDatabase,
  json: string,
): Promise<RestorePreview> {
  const document = parseJson(json);
  const existingData = await inAllTables(database, "r", () =>
    readData(database),
  );
  const dates = document.data.transactions.map((entry) => entry.date).sort();
  const preview: RestorePreview = Object.freeze({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: document.exportedAt,
    incoming: Object.freeze(counts(document.data)),
    replacing: Object.freeze(counts(existingData)),
    firstTransactionDate: dates[0] ?? null,
    lastTransactionDate: dates.at(-1) ?? null,
    consequence:
      "All eight local tables will be replaced; existing records not in this backup will be deleted. No merge is performed.",
  });
  // Keep a private canonical copy: caller mutations to the JSON or preview cannot alter the restore.
  previews.set(preview, {
    database,
    json: JSON.stringify(document),
    existing: JSON.stringify(existingData),
  });
  return preview;
}

/** Explicitly replace ALL data. Invalid/stale previews and failed writes leave the database unchanged. */
export async function restoreBackup(
  database: FinanceDatabase,
  preview: RestorePreview,
  confirmation: typeof RESTORE_CONFIRMATION,
): Promise<void> {
  if (confirmation !== RESTORE_CONFIRMATION)
    fail("Explicit replace-all confirmation is required");
  const staged = previews.get(preview);
  if (!staged || staged.database !== database)
    fail("A validated preview for this database is required");
  // Revalidate at commit; all reads, clears and writes are in a single IndexedDB transaction.
  const document = parseJson(staged.json);
  await inAllTables(database, "rw", async () => {
    if (JSON.stringify(await readData(database)) !== staged.existing) {
      fail(
        "Local data changed since preview; preview the backup again before replacing it",
      );
    }
    for (const name of tableNames) await database[name].clear();
    await database.accountTypes.bulkAdd(document.data.accountTypes);
    await database.accounts.bulkAdd(document.data.accounts);
    await database.categories.bulkAdd(document.data.categories);
    await database.tags.bulkAdd(document.data.tags);
    await database.transactions.bulkAdd(document.data.transactions);
    await database.monthlyConfirmations.bulkAdd(
      document.data.monthlyConfirmations,
    );
    await database.importMappings.bulkAdd(document.data.importMappings);
    await database.settings.bulkAdd(document.data.settings);
  });
  previews.delete(preview);
}

const csvColumns = [
  "id",
  "type",
  "date",
  "time",
  "accountId",
  "fromAccountId",
  "toAccountId",
  "amountPaisa",
  "deltaPaisa",
  "categoryId",
  "subcategoryId",
  "tagIds",
  "remark",
  "reason",
  "source",
  "sourceReference",
  "createdAt",
  "updatedAt",
  "calculatedBeforePaisa",
  "actualAtTimePaisa",
] as const;

// Quote every field, double embedded quotes, and neutralize text that spreadsheets
// might interpret as a formula (including after leading whitespace/control chars).
function csvCell(value: string, numeric = false): string {
  const safe =
    !numeric &&
    (/^[\s\uFEFF\u200B]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value))
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvRow(entry: Transaction): string {
  const fields: Record<(typeof csvColumns)[number], string> = {
    id: entry.id,
    type: entry.type,
    date: entry.date,
    time: entry.time ?? "",
    accountId: "accountId" in entry ? entry.accountId : "",
    fromAccountId: entry.type === "transfer" ? entry.fromAccountId : "",
    toAccountId: entry.type === "transfer" ? entry.toAccountId : "",
    amountPaisa: "amountPaisa" in entry ? String(entry.amountPaisa) : "",
    deltaPaisa: entry.type === "adjustment" ? String(entry.deltaPaisa) : "",
    categoryId: "categoryId" in entry ? entry.categoryId : "",
    subcategoryId: "subcategoryId" in entry ? (entry.subcategoryId ?? "") : "",
    tagIds: entry.tagIds.join(";"),
    remark: entry.remark ?? "",
    reason: entry.type === "adjustment" ? entry.reason : "",
    source: entry.source,
    sourceReference: entry.sourceReference ?? "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    calculatedBeforePaisa:
      entry.type === "adjustment"
        ? String(entry.calculatedBeforePaisa ?? "")
        : "",
    actualAtTimePaisa:
      entry.type === "adjustment" ? String(entry.actualAtTimePaisa ?? "") : "",
  };
  return csvColumns
    .map((column) =>
      csvCell(
        fields[column],
        column === "amountPaisa" ||
          column === "deltaPaisa" ||
          column === "calculatedBeforePaisa" ||
          column === "actualAtTimePaisa",
      ),
    )
    .join(",");
}

/** Analysis-only CSV, NOT a lossless backup. Transfer sides and adjustments are explicit. */
export async function exportTransactionsCsv(
  database: FinanceDatabase,
): Promise<string> {
  const entries = await database.transactions.toArray();
  const validated = entries.map((entry) => {
    const result = strictTransactions.safeParse(entry);
    if (
      !result.success ||
      canonicalJson(result.data) !== canonicalJson(entry)
    ) {
      fail(
        `Invalid transaction ${entry.id}; CSV export would change or lose its values`,
      );
    }
    return result.data;
  });
  return [csvColumns.join(","), ...validated.map(csvRow)].join("\r\n") + "\r\n";
}
