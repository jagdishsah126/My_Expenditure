import { useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db/database";
import {
  exportBackupJson,
  exportTransactionsCsv,
  previewRestore,
  RESTORE_CONFIRMATION,
  restoreBackup,
  type RestorePreview,
} from "./index";

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function BackupPanel() {
  const lastExport = useLiveQuery(
    () => db.settings.get("lastExportInitiated"),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const exportedAt =
    lastExport &&
    typeof lastExport.value === "object" &&
    lastExport.value !== null &&
    "at" in lastExport.value &&
    typeof lastExport.value.at === "string"
      ? lastExport.value.at
      : null;

  async function exportJson() {
    setBusy(true);
    setMessage("");
    try {
      const json = await exportBackupJson(db);
      download(
        `my-finance-backup-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        "application/json",
      );
      setMessage(
        "Backup export initiated. Keep this unencrypted file private.",
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setMessage("");
    try {
      const csv = await exportTransactionsCsv(db);
      download(
        `my-finance-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        "text/csv",
      );
      setMessage("CSV export created for analysis. It is not a full backup.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "CSV export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setRestorePreview(null);
    setConfirmation("");
    setMessage("");
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage("Backup file exceeds the 20 MB safety limit.");
      return;
    }
    setBusy(true);
    try {
      setRestorePreview(await previewRestore(db, await file.text()));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "This backup cannot be used.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!restorePreview) return;
    setBusy(true);
    setMessage("");
    try {
      await restoreBackup(
        db,
        restorePreview,
        confirmation as typeof RESTORE_CONFIRMATION,
      );
      setRestorePreview(null);
      setConfirmation("");
      setMessage("Backup restored. Existing local data was replaced.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-bold">Backup & restore</h2>
      <p className="mt-2 text-sm text-ink/70">
        Last export initiated: <strong>{exportedAt ?? "Never"}</strong>. A JSON
        backup contains sensitive plaintext financial data. Store it privately;
        it is never uploaded.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportJson()}
          className="min-h-12 rounded-xl bg-forest px-4 font-semibold text-white disabled:opacity-50"
        >
          Export full JSON backup
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportCsv()}
          className="min-h-12 rounded-xl border border-forest/20 px-4 font-semibold"
        >
          Export transactions CSV
        </button>
      </div>
      <div className="mt-6 border-t border-forest/10 pt-5">
        <h3 className="font-bold">Restore backup</h3>
        <p className="mt-1 text-sm text-ink/70">
          Restore validates the file, shows what it contains, then replaces all
          local data only after explicit confirmation.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => void chooseRestore(event)}
          className="mt-3 block w-full text-sm"
        />
        {restorePreview && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm">
            <h4 className="font-bold">Restore preview</h4>
            <p className="mt-1">
              Exported: {restorePreview.exportedAt} · Transactions:{" "}
              {restorePreview.incoming.transactions} · Accounts:{" "}
              {restorePreview.incoming.accounts} · Date coverage:{" "}
              {restorePreview.firstTransactionDate ?? "none"} to{" "}
              {restorePreview.lastTransactionDate ?? "none"}
            </p>
            <p className="mt-2 font-semibold">{restorePreview.consequence}</p>
            <label className="mt-3 block font-semibold">
              Type {RESTORE_CONFIRMATION} to continue
              <input
                className="mt-1 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || confirmation !== RESTORE_CONFIRMATION}
              onClick={() => void restore()}
              className="mt-3 min-h-11 rounded-xl bg-red-800 px-4 font-semibold text-white disabled:opacity-50"
            >
              Replace all local data
            </button>
          </div>
        )}
      </div>
      {message && (
        <p role="status" className="mt-4 rounded-xl bg-paper p-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
