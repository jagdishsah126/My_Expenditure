import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../../db/database";
import { confirmMonth, kathmanduMonth } from "./service";

type PreviewAccount = { id: string; name: string; amountPaisa: number };

export function MonthConfirmation({
  carried,
  newAccounts,
  formatAmount,
}: {
  carried: PreviewAccount[];
  newAccounts: PreviewAccount[];
  formatAmount: (amount: number) => string;
}) {
  const month = kathmanduMonth();
  const confirmation = useLiveQuery(
    () => db.monthlyConfirmations.get(month).then((value) => value ?? null),
    [month],
  );
  const openingEntries = useLiveQuery(
    () => db.transactions.where("type").equals("opening").toArray(),
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  if (
    !openingEntries?.length ||
    openingEntries.every((entry) => entry.date.slice(0, 7) >= month) ||
    confirmation === undefined ||
    confirmation !== null
  )
    return null;

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      await confirmMonth(db, month);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm this month.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      aria-labelledby="month-heading"
      className="mb-6 rounded-3xl border border-forest/15 bg-leaf/55 p-5 sm:p-7"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-forest">
        A new month is ready
      </p>
      <h2 id="month-heading" className="mt-2 text-xl font-bold">
        Start{" "}
        {new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "long",
          timeZone: "Asia/Kathmandu",
        }).format(new Date())}
        ?
      </h2>
      <p className="mt-2 text-sm text-ink/70">
        These balances carry forward automatically. No re-entry or extra opening
        transaction is needed.
      </p>
      <ul className="mt-4 divide-y divide-forest/10 rounded-xl bg-white px-4">
        {carried.map((account) => (
          <li
            key={account.id}
            className="flex justify-between gap-4 py-3 text-sm"
          >
            <span>{account.name}</span>
            <strong className="tabular-nums">
              {formatAmount(account.amountPaisa)}
            </strong>
          </li>
        ))}
      </ul>
      {newAccounts.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-semibold">New this month (not carried forward)</p>
          <ul>
            {newAccounts.map((account) => (
              <li key={account.id}>
                {account.name} · starting {formatAmount(account.amountPaisa)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={working}
          onClick={() => void confirm()}
          className="min-h-12 rounded-xl bg-forest px-5 font-semibold text-white disabled:opacity-50"
        >
          {working ? "Confirming…" : "Confirm month"}
        </button>
        <Link
          to="/accounts"
          className="inline-flex min-h-12 items-center rounded-xl px-4 font-semibold text-forest underline"
        >
          Review / edit balances
        </Link>
      </div>
    </section>
  );
}
