import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { utils, write } from "xlsx";
import { FinanceDatabase } from "../../db/database";
import { parseStatementFile, parseCsv, parseXlsx, MAX_ROWS } from "./parser";
import {
  parseStatementDate,
  stageStatement,
  suggestMapping,
  restoreMapping,
  mappingColumns,
} from "./mapping";
import {
  commitImport,
  previewImport,
  saveColumnMapping,
  type ImportDraft,
} from "./service";

const all: FinanceDatabase[] = [];
afterEach(async () => {
  for (const db of all) {
    db.close();
    await Dexie.delete(db.name);
  }
  all.length = 0;
});
async function fixture() {
  const database = new FinanceDatabase(`import-test-${crypto.randomUUID()}`);
  all.push(database);
  const id = crypto.randomUUID();
  const food = crypto.randomUUID(),
    salary = crypto.randomUUID(),
    type = crypto.randomUUID();
  const now = "2026-10-01T00:00:00.000Z";
  await database.accountTypes.add({
    id: type,
    name: "Bank",
    isBuiltIn: true,
    createdAt: now,
    updatedAt: now,
  });
  await database.accounts.add({
    id,
    name: "Bank",
    accountTypeId: type,
    currency: "NPR",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await database.categories.bulkAdd([
    {
      id: food,
      name: "Food",
      type: "expense",
      sortOrder: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: salary,
      name: "Salary",
      type: "income",
      sortOrder: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await database.transactions.add({
    id: crypto.randomUUID(),
    type: "opening",
    date: "2026-09-01",
    accountId: id,
    amountPaisa: 10000,
    tagIds: [],
    source: "manual",
    createdAt: now,
    updatedAt: now,
  });
  await database.monthlyConfirmations.add({
    monthKey: "2026-11",
    confirmedAt: now,
    openingChangedSinceConfirmation: false,
  });
  const csv = parseCsv(
    'Date,Description,Debit,Credit,Reference,Balance\n2026-10-02,"Food, store",12.50,,R1,87.50\n2026-10-03,Salary,,100,R2,187.50\n2026-10-02,"Food, store",12.50,,R1,175\n',
  );
  const parsed = {
    filename: "bank.csv",
    format: "csv" as const,
    sheets: [csv],
  };
  const mapping = suggestMapping(csv.rows[0].cells);
  const rows = stageStatement(parsed, "CSV", 0, mapping).map((row) => ({
    ...row,
    categoryId: row.direction === "income" ? salary : food,
  }));
  const draft: ImportDraft = {
    filename: parsed.filename,
    format: "csv",
    account: { kind: "existing", id },
    rows,
  };
  return { database, id, type, food, salary, draft, mapping, parsed };
}

describe("bounded local statement parsing and mapping", () => {
  it("handles quoted multiline CSV, CRLF, BOM and strict malformed/oversize input", async () => {
    const file = new File(
      ['\uFEFFDate,Description\r\n2026-10-01,"a,b\nc"\r\n'],
      "bank.csv",
      { type: "text/csv" },
    );
    const parsed = await parseStatementFile(file);
    expect(parsed.sheets[0].rows[1].cells[1]).toBe("a,b\nc");
    expect(() => parseCsv('A,B\n"unterminated')).toThrow("unclosed");
    expect(() => parseCsv('A,B\nabc"def,1')).toThrow("Malformed");
    await expect(
      parseStatementFile(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.csv"),
      ),
    ).rejects.toThrow("size limit");
    await expect(
      parseStatementFile(new File(["%PDF"], "statement.pdf")),
    ).rejects.toThrow("PDF import");
    await expect(
      parseStatementFile(new File([new Uint8Array([0xff])], "invalid.csv")),
    ).rejects.toThrow();
  });

  it("reads a local XLSX worksheet without evaluating formulas and rejects corrupted ZIP / excess rows", async () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ["Date", "Amount"],
      ["2026-10-02", 12.5],
    ]);
    sheet.B3 = { t: "n", f: "1+2", v: 3 };
    utils.book_append_sheet(workbook, sheet, "Bank");
    const bytes = new Uint8Array(
      write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const parsed = await parseStatementFile(
      new File([bytes], "statement.xlsx"),
    );
    expect(parsed.sheets[0].rows[1].cells).toEqual(["2026-10-02", "12.5"]);
    expect(() => parseXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow();
    const huge = utils.book_new();
    utils.book_append_sheet(
      huge,
      utils.aoa_to_sheet(Array.from({ length: MAX_ROWS + 30 }, (_, i) => [i])),
      "Huge",
    );
    const hugeBytes = new Uint8Array(
      write(huge, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    expect(() => parseXlsx(hugeBytes)).toThrow(/row/i);
  });

  it("distinguishes debit vs credit, date formats and invalid mapping", async () => {
    const { parsed, mapping } = await fixture();
    const rows = stageStatement(parsed, "CSV", 0, mapping);
    expect(rows.map((row) => [row.direction, row.amount])).toEqual([
      ["expense", "12.50"],
      ["income", "100"],
      ["expense", "12.50"],
    ]);
    expect(parseStatementDate("03/10/2026", "dmy")).toBe("2026-10-03");
    expect(parseStatementDate("10/03/2026", "mdy")).toBe("2026-10-03");
    expect(() => parseStatementDate("31/02/2026", "dmy")).toThrow();
    expect(() =>
      stageStatement(parsed, "CSV", 0, { ...mapping, credit: null }),
    ).toThrow("Map both");
    expect(
      restoreMapping(
        mappingColumns(mapping, parsed.sheets[0].rows[0].cells),
        parsed.sheets[0].rows[0].cells,
      ),
    ).toEqual(mapping);
  });
});

describe("review then atomic commit", () => {
  it("does not write during preview, requires explicit duplicate decision, writes selected rows and provenance", async () => {
    const { database, draft, id } = await fixture();
    const preview = await previewImport(database, draft);
    expect(preview.duplicateCount).toBe(1);
    expect(preview.reviews[2].matches[0]).toContain("File row 2");
    expect(await database.transactions.count()).toBe(1);
    await expect(commitImport(database, preview)).rejects.toThrow("Skip it");
    expect(await database.transactions.count()).toBe(1);
    draft.rows[2].selected = false;
    const ready = await previewImport(database, draft);
    draft.rows[0].amount = "999"; // staged preview is an independent snapshot
    const result = await commitImport(database, ready);
    expect(result).toEqual({ imported: 2, skipped: 1, failed: 0 });
    const records = (await database.transactions.toArray())
      .filter((row) => row.type !== "opening")
      .sort((a, b) => a.date.localeCompare(b.date));
    expect(
      records.map((row) => [row.type, "amountPaisa" in row && row.amountPaisa]),
    ).toEqual([
      ["expense", 1250],
      ["income", 10000],
    ]);
    expect(records[0].sourceReference).toContain("bank.csv | CSV!2|ref:R1");
    expect(
      records.every(
        (row) =>
          "accountId" in row &&
          row.accountId === id &&
          row.source === "imported",
      ),
    ).toBe(true);
    expect(
      (await database.monthlyConfirmations.get("2026-11"))
        ?.openingChangedSinceConfirmation,
    ).toBe(true);
    const repeated = await previewImport(database, {
      ...draft,
      rows: draft.rows.map((row, i) =>
        i === 0 ? { ...row, amount: "12.50" } : row,
      ),
    });
    expect(repeated.duplicateCount).toBe(2);
  });

  it("rechecks newly added existing records at commit even if keep-both was chosen", async () => {
    const { database, draft, id, food } = await fixture();
    draft.rows = [draft.rows[0]];
    draft.rows[0].duplicateResolution = "keep-both";
    const preview = await previewImport(database, draft);
    const now = "2026-10-01T00:00:00.000Z";
    await database.transactions.add({
      id: crypto.randomUUID(),
      type: "expense",
      accountId: id,
      categoryId: food,
      amountPaisa: 1250,
      date: "2026-10-02",
      remark: "Food, store",
      tagIds: [],
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    await expect(commitImport(database, preview)).rejects.toThrow(
      "changed since preview",
    );
    expect(await database.transactions.count()).toBe(2);
    const refreshed = await previewImport(database, draft);
    expect(refreshed.reviews[0].matches[0]).toContain("Existing");
    await commitImport(database, refreshed);
    expect(await database.transactions.count()).toBe(3);
  });

  it("rejects invalid categories, historical opening and stale account without partial writes", async () => {
    const { database, draft, id } = await fixture();
    draft.rows[1].categoryId = draft.rows[0].categoryId;
    draft.rows[2].selected = false;
    let preview = await previewImport(database, draft);
    await expect(commitImport(database, preview)).rejects.toThrow("compatible");
    draft.rows[1].categoryId = crypto.randomUUID();
    preview = await previewImport(database, draft);
    await expect(commitImport(database, preview)).rejects.toThrow("compatible");
    draft.rows[1].selected = false;
    draft.rows[0].date = "2026-08-31";
    await expect(previewImport(database, draft)).rejects.toThrow("predates");
    draft.rows[0].date = "2026-10-02";
    preview = await previewImport(database, draft);
    await database.accounts.update(id, { isActive: false });
    await expect(commitImport(database, preview)).rejects.toThrow("active NPR");
    expect(await database.transactions.count()).toBe(1);
  });

  it("creates account and opening only during atomic commit; rolls back on write failure", async () => {
    const { database, draft, type } = await fixture();
    draft.rows = [draft.rows[0]];
    draft.account = {
      kind: "new",
      name: "New wallet",
      accountTypeId: type,
      openingDate: "2026-10-01",
      openingAmount: "0",
    };
    const preview = await previewImport(database, draft);
    expect(await database.accounts.count()).toBe(1);
    const result = await commitImport(database, preview);
    expect(result.imported).toBe(1);
    expect(await database.accounts.count()).toBe(2);
    const wallet = (await database.accounts.toArray()).find(
      (row) => row.name === "New wallet",
    )!;
    expect(
      (
        await database.transactions
          .where("accountId")
          .equals(wallet.id)
          .toArray()
      )
        .map((row) => row.type)
        .sort(),
    ).toEqual(["expense", "opening"]);
    const next = await previewImport(database, {
      ...draft,
      account: { kind: "existing", id: wallet.id },
      rows: [
        { ...draft.rows[0], selected: true, duplicateResolution: "keep-both" },
      ],
    });
    vi.spyOn(database.transactions, "bulkAdd").mockRejectedValueOnce(
      new Error("simulated write failure"),
    );
    await expect(commitImport(database, next)).rejects.toThrow(
      "simulated write failure",
    );
    expect(
      await database.transactions.where("accountId").equals(wallet.id).count(),
    ).toBe(2);
  });

  it("stores reusable column names independently of financial records", async () => {
    const { database, mapping, parsed } = await fixture();
    await saveColumnMapping(
      database,
      "Bank format",
      "csv",
      mapping,
      parsed.sheets[0].rows[0].cells,
    );
    expect(await database.transactions.count()).toBe(1);
    const saved = (await database.importMappings.toArray())[0];
    expect(
      restoreMapping(saved.columns, parsed.sheets[0].rows[0].cells),
    ).toEqual(mapping);
  });
});
