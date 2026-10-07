import { useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/database";
import { formatNpr } from "../../utils/money";
import { parseStatementFile, type ParsedStatement } from "./parser";
import {
  restoreMapping,
  stageStatement,
  suggestMapping,
  type ColumnMapping,
  type StagedRow,
} from "./mapping";
import {
  commitImport,
  previewImport,
  saveColumnMapping,
  type AccountChoice,
  type ImportPreview,
  type ImportResult,
} from "./service";

const inputStyle =
  "min-h-11 w-full rounded-xl border border-forest/25 bg-white px-3 py-2 text-ink";
const sectionStyle =
  "mt-5 rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7";
type ColumnKey = Exclude<keyof ColumnMapping, "dateFormat">;
const fieldNames: { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "debit", label: "Debit (money out)" },
  { key: "credit", label: "Credit (money in)" },
  { key: "signedAmount", label: "Signed amount (+ in / − out)" },
  { key: "reference", label: "Reference (optional)" },
  { key: "balance", label: "Running balance (optional)" },
];

/** Route-ready component. Parent app can render <ImportPage /> without any special provider. */
export function ImportPage() {
  const accounts = useLiveQuery(
    () => db.accounts.filter((row) => row.isActive).toArray(),
    [],
  );
  const accountTypes = useLiveQuery(() => db.accountTypes.toArray(), []);
  const categories = useLiveQuery(
    () => db.categories.filter((row) => row.isActive).toArray(),
    [],
  );
  const savedMappings = useLiveQuery(() => db.importMappings.toArray(), []);
  const [document, setDocument] = useState<ParsedStatement | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [headerIndex, setHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [account, setAccount] = useState<AccountChoice>({
    kind: "existing",
    id: "",
  });
  const [rows, setRows] = useState<StagedRow[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mappingName, setMappingName] = useState("");

  const sheet = document?.sheets.find((value) => value.name === sheetName);
  const headings = sheet?.rows[headerIndex]?.cells ?? [];
  const changeRow = (key: string, changes: Partial<StagedRow>) => {
    setRows(
      (old) =>
        old?.map((row) => (row.key === key ? { ...row, ...changes } : row)) ??
        null,
    );
    setPreview(null);
  };
  const resetFile = () => {
    setRows(null);
    setPreview(null);
    setResult(null);
    setError("");
  };
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    resetFile();
    setDocument(null);
    setMapping(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseStatementFile(file);
      setDocument(parsed);
      setSheetName(parsed.sheets[0]?.name ?? "");
      setHeaderIndex(0);
      setMapping(suggestMapping(parsed.sheets[0]?.rows[0]?.cells ?? []));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read the file.",
      );
    } finally {
      setBusy(false);
    }
  }
  function changeSheet(value: string, index = 0) {
    const selected = document?.sheets.find((item) => item.name === value);
    setSheetName(value);
    setHeaderIndex(index);
    setMapping(suggestMapping(selected?.rows[index]?.cells ?? []));
    setRows(null);
    setPreview(null);
    setResult(null);
  }
  function stage() {
    setError("");
    try {
      if (!document || !mapping)
        throw new Error("Select a statement and mapping.");
      const staged = stageStatement(document, sheetName, headerIndex, mapping);
      if (!staged.length)
        throw new Error("No data rows after the selected header.");
      setRows(staged);
      setPreview(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not map these rows.",
      );
    }
  }
  async function review() {
    if (!document || !rows) return;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(
        await previewImport(db, {
          format: document.format,
          filename: document.filename,
          account,
          rows,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not review the import.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      setResult(await commitImport(db, preview));
      setRows(null);
      setPreview(null);
    } catch (cause) {
      setPreview(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Import failed. No rows were saved. Review again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveMapping() {
    if (!document || !mapping) return;
    setBusy(true);
    setError("");
    try {
      await saveColumnMapping(
        db,
        mappingName,
        document.format,
        mapping,
        headings,
      );
      setMappingName("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save mapping.",
      );
    } finally {
      setBusy(false);
    }
  }
  const chosen = rows?.filter((row) => row.selected).length ?? 0;
  return (
    <>
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-forest">
          Local statement import
        </p>
        <h1 className="mt-2 text-3xl font-bold">Import transactions</h1>
        <p className="mt-2 text-sm">
          Review every row before committing. No statement is uploaded. Imports
          are income/expense only; a statement line cannot prove a transfer.
        </p>
      </header>
      <section className={sectionStyle} aria-label="Choose a statement">
        <label className="block font-semibold" htmlFor="statement-file">
          CSV or XLSX statement
        </label>
        <input
          id="statement-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={busy}
          onChange={(event) => void chooseFile(event)}
          className="mt-2 block min-h-11 w-full text-sm"
        />
        <p className="text-sm text-ink/70">
          CSV up to 2 MB; XLSX up to 4 MB. Up to 2,000 data rows; first
          worksheet header can be chosen.
        </p>
      </section>
      <section
        className={sectionStyle}
        aria-label="PDF import under construction"
      >
        <h2 className="text-lg font-bold">PDF import — Under construction</h2>
        <p className="mt-1 text-sm">
          PDF statements cannot be imported yet. No PDF is read or uploaded.
        </p>
        <button
          disabled
          type="button"
          className="mt-3 rounded-xl border px-4 py-3 opacity-50"
        >
          Choose PDF (unavailable)
        </button>
      </section>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-900">
          {error}
        </p>
      )}
      {result && (
        <section className={sectionStyle} role="status">
          <h2 className="text-xl font-bold">Import complete</h2>
          <p>
            {result.imported} imported; {result.skipped} skipped;{" "}
            {result.failed} failed. Back up your local data regularly.
          </p>
        </section>
      )}
      {document && !result && (
        <section className={sectionStyle}>
          <h2 className="text-xl font-bold">1. Map the statement columns</h2>
          <p className="mt-1 text-sm">
            {document.filename} — nothing has been imported.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              Worksheet
              <select
                className={inputStyle}
                value={sheetName}
                onChange={(e) => changeSheet(e.target.value)}
              >
                {document.sheets.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Header row
              <select
                className={inputStyle}
                value={headerIndex}
                onChange={(e) => changeSheet(sheetName, Number(e.target.value))}
              >
                {sheet?.rows.slice(0, 20).map((row, index) => (
                  <option key={row.rowNumber} value={index}>
                    Row {row.rowNumber}: {row.cells.join(" · ").slice(0, 70)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Saved mapping
              <select
                className={inputStyle}
                defaultValue=""
                onChange={(e) => {
                  const saved = savedMappings?.find(
                    (item) => item.id === e.target.value,
                  );
                  if (saved) {
                    const restored = restoreMapping(saved.columns, headings);
                    if (restored) {
                      setMapping(restored);
                      setRows(null);
                      setPreview(null);
                      setError("");
                    } else
                      setError(
                        "Saved mapping does not match these unique header names.",
                      );
                  }
                }}
              >
                <option value="">Use suggested mapping</option>
                {savedMappings
                  ?.filter((item) => item.format === document.format)
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Date format
              <select
                className={inputStyle}
                value={mapping?.dateFormat ?? "ymd"}
                onChange={(e) => {
                  setMapping(
                    (old) =>
                      old && {
                        ...old,
                        dateFormat: e.target
                          .value as ColumnMapping["dateFormat"],
                      },
                  );
                  setRows(null);
                  setPreview(null);
                }}
              >
                <option value="ymd">YYYY-MM-DD</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="mdy">MM/DD/YYYY</option>
                <option value="excel">Excel serial (1900)</option>
              </select>
            </label>
            {mapping &&
              fieldNames.map(({ key, label }) => (
                <label key={key}>
                  {label}
                  <select
                    className={inputStyle}
                    value={mapping[key] ?? ""}
                    onChange={(e) => {
                      const value =
                        e.target.value === "" ? null : Number(e.target.value);
                      setMapping((old) => old && { ...old, [key]: value });
                      setRows(null);
                      setPreview(null);
                    }}
                  >
                    <option value="">Not mapped</option>
                    {headings.map((heading, index) => (
                      <option key={index} value={index}>
                        {index + 1}: {heading || "(blank)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={stage}
            className="mt-5 min-h-11 rounded-xl bg-forest px-5 text-white"
          >
            Stage rows for review
          </button>
          <p className="mt-2 text-sm">
            Use both Debit and Credit, OR a signed amount. Positive signed
            amounts = income; negative = expense. No automatic transfer
            inference.
          </p>
          {rows && (
            <div className="mt-5 border-t pt-4">
              <label>
                Save mapping name (optional)
                <input
                  className={inputStyle}
                  value={mappingName}
                  maxLength={80}
                  onChange={(e) => setMappingName(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!mappingName.trim() || busy}
                onClick={() => void saveMapping()}
                className="mt-2 min-h-11 rounded-xl border px-4"
              >
                Save column mapping
              </button>
            </div>
          )}
        </section>
      )}
      {rows && document && !result && (
        <section className={sectionStyle}>
          <h2 className="text-xl font-bold">
            2. Choose an account and review rows
          </h2>
          <label className="mt-3 block">
            Statement account
            <select
              className={inputStyle}
              value={account.kind === "existing" ? account.id : "new"}
              onChange={(e) => {
                setAccount(
                  e.target.value === "new"
                    ? {
                        kind: "new",
                        name: "",
                        accountTypeId: accountTypes?.[0]?.id ?? "",
                        openingDate: "",
                        openingAmount: "0",
                      }
                    : { kind: "existing", id: e.target.value },
                );
                setPreview(null);
              }}
            >
              <option value="">Select account</option>
              {accounts?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (NPR)
                </option>
              ))}
              <option value="new">Create a new account on commit…</option>
            </select>
          </label>
          {account.kind === "new" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                Name
                <input
                  className={inputStyle}
                  value={account.name}
                  maxLength={120}
                  onChange={(e) => {
                    setAccount({ ...account, name: e.target.value });
                    setPreview(null);
                  }}
                />
              </label>
              <label>
                Account type
                <select
                  className={inputStyle}
                  value={account.accountTypeId}
                  onChange={(e) => {
                    setAccount({ ...account, accountTypeId: e.target.value });
                    setPreview(null);
                  }}
                >
                  {accountTypes?.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Opening date
                <input
                  type="date"
                  className={inputStyle}
                  value={account.openingDate}
                  onChange={(e) => {
                    setAccount({ ...account, openingDate: e.target.value });
                    setPreview(null);
                  }}
                />
              </label>
              <label>
                Opening balance (Rs; zero allowed)
                <input
                  inputMode="decimal"
                  className={inputStyle}
                  value={account.openingAmount}
                  onChange={(e) => {
                    setAccount({ ...account, openingAmount: e.target.value });
                    setPreview(null);
                  }}
                />
              </label>
              <p className="sm:col-span-2 text-sm">
                A new account and one opening entry will be created only when
                you commit. Do not enter a statement ending balance as its
                opening balance.
              </p>
            </div>
          )}
          <p className="mt-4 text-sm">
            {rows.length} data rows · {chosen} selected. Fix errors or uncheck
            rows. Select categories explicitly; review transfer-like lines
            carefully and skip if needed.
          </p>
          <div className="mt-4 space-y-4">
            {rows.map((row) => {
              const review = preview?.reviews.find(
                (item) => item.row.key === row.key,
              );
              const options = categories?.filter(
                (category) =>
                  !category.parentId &&
                  (category.type === "both" || category.type === row.direction),
              );
              return (
                <article
                  key={row.key}
                  className="rounded-2xl border border-forest/20 p-4"
                >
                  <label className="flex min-h-11 items-center gap-3 font-semibold">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        changeRow(row.key, { selected: e.target.checked })
                      }
                      className="h-5 w-5 accent-forest"
                    />
                    {row.sheet} · source row {row.rowNumber}{" "}
                    {row.selected ? "— include" : "— skip"}
                  </label>
                  {row.selected && (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label>
                        Date
                        <input
                          type="date"
                          className={inputStyle}
                          value={row.date}
                          onChange={(e) =>
                            changeRow(row.key, { date: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Direction
                        <select
                          className={inputStyle}
                          value={row.direction}
                          onChange={(e) =>
                            changeRow(row.key, {
                              direction: e.target
                                .value as StagedRow["direction"],
                              categoryId: "",
                              mappingError: undefined,
                            })
                          }
                        >
                          <option value="expense">Debit → Expense</option>
                          <option value="income">Credit → Income</option>
                        </select>
                      </label>
                      <label>
                        Amount (Rs)
                        <input
                          className={inputStyle}
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) =>
                            changeRow(row.key, {
                              amount: e.target.value,
                              mappingError: undefined,
                            })
                          }
                        />
                      </label>
                      <label>
                        Category
                        <select
                          className={inputStyle}
                          value={row.categoryId}
                          onChange={(e) =>
                            changeRow(row.key, { categoryId: e.target.value })
                          }
                        >
                          <option value="">Choose category</option>
                          {options?.map((category) => (
                            <option value={category.id} key={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sm:col-span-2">
                        Description
                        <input
                          className={inputStyle}
                          maxLength={500}
                          value={row.description}
                          onChange={(e) =>
                            changeRow(row.key, { description: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Reference
                        <input
                          className={inputStyle}
                          maxLength={150}
                          value={row.reference}
                          onChange={(e) =>
                            changeRow(row.key, { reference: e.target.value })
                          }
                        />
                      </label>
                      {row.runningBalance && (
                        <p className="text-sm">
                          Statement running balance: {row.runningBalance}{" "}
                          (advisory only)
                        </p>
                      )}
                      {review?.errors.map((message, i) => (
                        <p
                          key={i}
                          className="sm:col-span-2 text-sm text-red-800"
                        >
                          {message}
                        </p>
                      ))}
                      {!!review?.matches.length && (
                        <div className="sm:col-span-2 rounded-xl bg-amber-50 p-3 text-sm">
                          <strong>Possible duplicate:</strong>
                          <ul className="list-inside list-disc">
                            {review.matches.map((match) => (
                              <li key={match}>{match}</li>
                            ))}
                          </ul>
                          <label className="mt-2 block">
                            Decision
                            <select
                              className={inputStyle}
                              value={row.duplicateResolution}
                              onChange={(e) =>
                                changeRow(row.key, {
                                  duplicateResolution: e.target
                                    .value as StagedRow["duplicateResolution"],
                                })
                              }
                            >
                              <option value="skip">
                                Skip row (uncheck above)
                              </option>
                              <option value="keep-both">
                                Keep both — import anyway
                              </option>
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy || !chosen}
            onClick={() => void review()}
            className="mt-5 min-h-11 rounded-xl bg-forest px-5 text-white"
          >
            Check preview and duplicates
          </button>
          {preview && (
            <div className="mt-5 rounded-2xl bg-leaf/50 p-4" role="status">
              <h3 className="font-bold">
                Ready to confirm? {preview.accountLabel}
              </h3>
              <p>
                {preview.selected} selected; {preview.excluded} skipped;{" "}
                {preview.duplicateCount} possible duplicate rows. Invalid or
                unresolved duplicate rows cannot be committed.
              </p>
              <p className="mt-2 text-sm">{preview.balanceNote}</p>
              <p className="mt-2 text-xs">
                Amounts use integer paisa: e.g. {formatNpr(12500)}. No transfer
                is created.
              </p>
              <button
                disabled={busy}
                type="button"
                onClick={() => void commit()}
                className="mt-4 min-h-11 rounded-xl bg-forest px-5 text-white"
              >
                Commit selected rows atomically
              </button>
              <button
                type="button"
                onClick={() => {
                  setRows(null);
                  setPreview(null);
                }}
                className="ml-2 min-h-11 rounded-xl border px-4"
              >
                Cancel import
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
