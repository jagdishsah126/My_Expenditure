import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceDatabase } from "../../db/database";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupValidationError,
  exportBackupJson,
  exportTransactionsCsv,
  LAST_EXPORT_KEY,
  previewRestore,
  RESTORE_CONFIRMATION,
  restoreBackup,
} from "./index";

const openDatabases: FinanceDatabase[] = [];
function database() {
  const instance = new FinanceDatabase(`backup-test-${crypto.randomUUID()}`);
  openDatabases.push(instance);
  return instance;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const instance of openDatabases) {
    instance.close();
    await Dexie.delete(instance.name);
  }
  openDatabases.length = 0;
});

const at = "2026-10-07T07:00:00.000Z";
function id() {
  return crypto.randomUUID();
}

async function seed(database: FinanceDatabase) {
  const accountTypeId = id();
  const firstId = id();
  const secondId = id();
  const parentId = id();
  const childId = id();
  const incomeId = id();
  const tagId = id();
  const base = {
    source: "manual" as const,
    tagIds: [],
    createdAt: at,
    updatedAt: at,
  };
  await database.accountTypes.add({
    id: accountTypeId,
    name: "Wallet",
    isBuiltIn: false,
    createdAt: at,
    updatedAt: at,
  });
  await database.accounts.bulkAdd([
    {
      id: firstId,
      name: "Cash",
      accountTypeId,
      currency: "NPR",
      isActive: true,
      createdAt: at,
      updatedAt: at,
    },
    {
      id: secondId,
      name: "eSewa",
      accountTypeId,
      currency: "NPR",
      isActive: false,
      createdAt: at,
      updatedAt: at,
    },
  ]);
  await database.categories.bulkAdd([
    {
      id: parentId,
      name: "Food",
      type: "expense",
      sortOrder: 0,
      isActive: false,
      createdAt: at,
      updatedAt: at,
    },
    {
      id: childId,
      name: "Lunch",
      type: "expense",
      parentId,
      sortOrder: 1,
      isActive: true,
      createdAt: at,
      updatedAt: at,
    },
    {
      id: incomeId,
      name: "Salary",
      type: "income",
      sortOrder: 2,
      isActive: true,
      createdAt: at,
      updatedAt: at,
    },
  ]);
  await database.tags.add({ id: tagId, label: "work" });
  await database.transactions.bulkAdd([
    {
      ...base,
      id: id(),
      type: "opening",
      date: "2026-09-30",
      accountId: firstId,
      amountPaisa: 30000,
    },
    {
      ...base,
      id: id(),
      type: "opening",
      date: "2026-09-30",
      accountId: secondId,
      amountPaisa: 0,
    },
    {
      ...base,
      id: id(),
      type: "expense",
      date: "2026-10-02",
      accountId: firstId,
      categoryId: parentId,
      subcategoryId: childId,
      amountPaisa: 2000,
      tagIds: [tagId],
      remark: '=HYPERLINK("evil")',
      sourceReference: "+1",
    },
    {
      ...base,
      id: id(),
      type: "income",
      date: "2026-10-03",
      accountId: firstId,
      categoryId: incomeId,
      amountPaisa: 4500,
    },
    {
      ...base,
      id: id(),
      type: "transfer",
      date: "2026-10-04",
      fromAccountId: firstId,
      toAccountId: secondId,
      amountPaisa: 3000,
      remark: "  @SUM(1)",
    },
    {
      ...base,
      id: id(),
      type: "adjustment",
      date: "2026-10-05",
      accountId: secondId,
      deltaPaisa: -500,
      reason: "audit mismatch",
      remark: "\t=CMD()",
      calculatedBeforePaisa: 3000,
      actualAtTimePaisa: 2500,
    },
  ]);
  await database.monthlyConfirmations.add({
    monthKey: "2026-10",
    confirmedAt: at,
    openingChangedSinceConfirmation: false,
  });
  await database.importMappings.add({
    id: id(),
    name: "Bank CSV",
    format: "csv",
    columns: { date: "Date", debit: "Dr" },
    updatedAt: at,
  });
  await database.settings.bulkAdd([
    { key: "preferences", value: { reduceMotion: true }, updatedAt: at },
    { key: "customMetadata", value: { notes: ["private", 42] }, updatedAt: at },
  ]);
  return { firstId, secondId, parentId, tagId };
}

async function snapshot(database: FinanceDatabase) {
  const tables = [
    "accountTypes",
    "accounts",
    "categories",
    "tags",
    "transactions",
    "monthlyConfirmations",
    "importMappings",
    "settings",
  ] as const;
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [
        table,
        (await database[table].toArray()).sort((a, b) => {
          const key = (entry: typeof a) =>
            "id" in entry
              ? entry.id
              : "monthKey" in entry
                ? entry.monthKey
                : entry.key;
          return key(a).localeCompare(key(b));
        }),
      ]),
    ),
  );
}

describe("JSON backup and replace-all restore", () => {
  it("round trips every table, IDs, archived entities, transfers, confirmations and opaque settings", async () => {
    const original = database();
    const ids = await seed(original);
    const json = await exportBackupJson(original);
    const document = JSON.parse(json);
    expect(document).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      schemaVersion: 1,
    });
    expect(document.data.transactions).toHaveLength(6);
    expect(document.data.settings).toContainEqual({
      key: LAST_EXPORT_KEY,
      value: { at: document.exportedAt },
      updatedAt: document.exportedAt,
    });
    const expected = await snapshot(original);
    const restored = database();
    await restored.settings.add({ key: "obsolete", value: 1, updatedAt: at });
    const preview = await previewRestore(restored, json);
    expect(preview.incoming).toMatchObject({
      accounts: 2,
      transactions: 6,
      tags: 1,
      settings: 3,
    });
    expect(preview.replacing.settings).toBe(1);
    expect(preview.firstTransactionDate).toBe("2026-09-30");
    expect(preview.lastTransactionDate).toBe("2026-10-05");
    expect(preview.consequence).toContain("No merge");
    expect(await restored.settings.get("obsolete")).toBeDefined();
    await restoreBackup(restored, preview, RESTORE_CONFIRMATION);
    expect(await snapshot(restored)).toEqual(expected);
    expect(await restored.settings.get("obsolete")).toBeUndefined();
    expect(
      (await restored.transactions.where("type").equals("transfer").first())
        ?.type,
    ).toBe("transfer");
    // One transfer has two opposing effects, not two independent transactions.
    const transactions = await restored.transactions.toArray();
    const effects = transactions.reduce((total, entry) => {
      if (entry.type === "opening" || entry.type === "income")
        return total + entry.amountPaisa;
      if (entry.type === "expense") return total - entry.amountPaisa;
      if (entry.type === "adjustment") return total + entry.deltaPaisa;
      return total;
    }, 0);
    expect(effects).toBe(32000);
    expect(
      transactions.find((entry) => entry.type === "transfer"),
    ).toMatchObject({ fromAccountId: ids.firstId, toAccountId: ids.secondId });
  });

  it("rejects invalid JSON, unsupported versions, malformed records and references before any write", async () => {
    const target = database();
    await seed(target);
    const source = database();
    await seed(source);
    const document = JSON.parse(await exportBackupJson(source));
    const initial = await snapshot(target);
    const invalid = [
      "not JSON",
      JSON.stringify({ ...document, version: 2 }),
      JSON.stringify({ ...document, version: 0 }),
      JSON.stringify({ ...document, schemaVersion: 2 }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          transactions: document.data.transactions.map(
            (entry: { type: string; amountPaisa: number }) =>
              entry.type === "opening"
                ? { ...entry, amountPaisa: Number.MAX_SAFE_INTEGER }
                : entry,
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          transactions: document.data.transactions.map(
            (entry: { type: string; date: string }) =>
              entry.type === "expense"
                ? { ...entry, date: "2026-02-30" }
                : entry,
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          accounts: [...document.data.accounts, document.data.accounts[0]],
        },
      }),
      JSON.stringify({
        ...document,
        data: { ...document.data, accountTypes: [] },
      }),
      JSON.stringify({ ...document, data: { ...document.data, tags: [] } }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          transactions: document.data.transactions.map(
            (entry: { type: string; amountPaisa: number }) =>
              entry.type === "transfer" ? { ...entry, amountPaisa: -1 } : entry,
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          transactions: document.data.transactions.map(
            (entry: {
              type: string;
              toAccountId: string;
              fromAccountId: string;
            }) =>
              entry.type === "transfer"
                ? { ...entry, toAccountId: entry.fromAccountId }
                : entry,
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          transactions: document.data.transactions.filter(
            (entry: { type: string }) => entry.type !== "opening",
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          categories: document.data.categories.map(
            (category: { id: string; parentId?: string }) =>
              category.parentId
                ? { ...category, parentId: category.id }
                : category,
          ),
        },
      }),
      JSON.stringify({
        ...document,
        data: {
          ...document.data,
          settings: [
            {
              key: "preferences",
              value: { reduceMotion: "no" },
              updatedAt: at,
            },
          ],
        },
      }),
    ];
    for (const json of invalid) {
      await expect(previewRestore(target, json)).rejects.toBeInstanceOf(
        BackupValidationError,
      );
      expect(await snapshot(target)).toEqual(initial);
    }
  });

  it("requires explicit confirmation and a live preview; detects stale data and rolls back a write failure", async () => {
    const target = database();
    await seed(target);
    const source = database();
    await seed(source);
    const json = await exportBackupJson(source);
    const before = await snapshot(target);
    let preview = await previewRestore(target, json);
    await expect(
      restoreBackup(target, preview, "NO" as typeof RESTORE_CONFIRMATION),
    ).rejects.toThrow("confirmation");
    expect(await snapshot(target)).toEqual(before);
    await target.settings.add({ key: "changed", value: true, updatedAt: at });
    await expect(
      restoreBackup(target, preview, RESTORE_CONFIRMATION),
    ).rejects.toThrow("changed since preview");
    const changed = await snapshot(target);
    expect(changed).not.toEqual(before);
    preview = await previewRestore(target, json);
    vi.spyOn(target.transactions, "bulkAdd").mockRejectedValueOnce(
      new Error("simulated disk failure"),
    );
    await expect(
      restoreBackup(target, preview, RESTORE_CONFIRMATION),
    ).rejects.toThrow("simulated disk failure");
    expect(await snapshot(target)).toEqual(changed);
    vi.restoreAllMocks();
    await restoreBackup(target, preview, RESTORE_CONFIRMATION);
    expect(await target.settings.get("changed")).toBeUndefined();
    await expect(
      restoreBackup(target, preview, RESTORE_CONFIRMATION),
    ).rejects.toThrow("preview");
  });

  it("refuses exports from invalid local records without changing the last export attempt", async () => {
    const instance = database();
    const ids = await seed(instance);
    await instance.accounts.update(ids.firstId, { currency: "USD" as "NPR" });
    const before = await snapshot(instance);
    await expect(exportBackupJson(instance)).rejects.toBeInstanceOf(
      BackupValidationError,
    );
    expect(await snapshot(instance)).toEqual(before);
  });
});

describe("CSV transaction export", () => {
  it("uses explicit transfer columns and escapes formula-like text and RFC4180 quotes", async () => {
    const instance = database();
    const ids = await seed(instance);
    const csv = await exportTransactionsCsv(instance);
    expect(csv).toContain(
      "type,date,time,accountId,fromAccountId,toAccountId,amountPaisa,deltaPaisa",
    );
    expect(csv).toContain(
      `"transfer","2026-10-04","","","${ids.firstId}","${ids.secondId}","3000"`,
    );
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"\'  @SUM(1)"');
    expect(csv).toContain('"\'\t=CMD()"');
    expect(csv).toContain('"\'+1"');
    expect(csv).toContain('"-500"');
    expect(csv.split("\r\n")).toHaveLength(8); // header + 6 records + trailing empty line
  });
});
