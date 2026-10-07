import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../../db/database";
import type { Transaction } from "../../db/schema";
import {
  getKathmanduToday,
  getMonthKey,
  getMonthStart,
  getNextMonthStart,
} from "../../utils/dates";
import { formatNpr } from "../../utils/money";
import {
  calculateAccountBalance,
  calculateRangeSummary,
  calculateTotalBalance,
} from "../ledger/selectors";
import { MonthConfirmation } from "../monthly/MonthConfirmation";

function sortRecent(entries: Transaction[]) {
  return [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.time ?? "").localeCompare(a.time ?? "") ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

function entryTitle(
  entry: Transaction,
  accounts: Map<string, string>,
  categories: Map<string, string>,
) {
  if (entry.type === "transfer")
    return `${accounts.get(entry.fromAccountId) ?? "Unknown"} → ${accounts.get(entry.toAccountId) ?? "Unknown"}`;
  if (entry.type === "opening")
    return `Opening · ${accounts.get(entry.accountId) ?? "Unknown"}`;
  if (entry.type === "adjustment")
    return `Adjustment · ${accounts.get(entry.accountId) ?? "Unknown"}`;
  return `${categories.get(entry.categoryId) ?? "Archived category"} · ${accounts.get(entry.accountId) ?? "Unknown"}`;
}

export function HomePage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const confirmations = useLiveQuery(
    () => db.monthlyConfirmations.toArray(),
    [],
  );
  const today = getKathmanduToday();
  const month = getMonthKey(today);
  const monthStart = getMonthStart(month);
  const nextMonthStart = getNextMonthStart(month);

  const model = useMemo(() => {
    if (!accounts || !transactions) return null;
    const total = calculateTotalBalance(accounts, transactions);
    const summary = calculateRangeSummary(
      accounts,
      transactions,
      monthStart,
      nextMonthStart,
    );
    const balances = new Map(
      accounts.map((account) => [
        account.id,
        calculateAccountBalance(account.id, transactions),
      ]),
    );
    const openingByAccount = new Map(
      transactions
        .filter((entry) => entry.type === "opening")
        .map((entry) => [entry.accountId, entry]),
    );
    const active = accounts.filter((account) => account.isActive);
    const carried = active
      .filter((account) => {
        const opening = openingByAccount.get(account.id);
        return opening && opening.date < monthStart;
      })
      .map((account) => ({
        id: account.id,
        name: account.name,
        amountPaisa: calculateAccountBalance(
          account.id,
          transactions,
          monthStart,
        ),
      }));
    const newAccounts = active
      .filter((account) => {
        const opening = openingByAccount.get(account.id);
        return (
          opening && opening.date >= monthStart && opening.date < nextMonthStart
        );
      })
      .map((account) => {
        const opening = openingByAccount.get(account.id);
        return {
          id: account.id,
          name: account.name,
          amountPaisa: opening?.type === "opening" ? opening.amountPaisa : 0,
        };
      });
    return { total, summary, balances, carried, newAccounts };
  }, [accounts, transactions, monthStart, nextMonthStart]);

  if (!accounts || !categories || !transactions || !confirmations || !model) {
    return <p role="status">Loading your local data…</p>;
  }

  const accountNames = new Map(
    accounts.map((account) => [account.id, account.name]),
  );
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const activeAccounts = accounts.filter((account) => account.isActive);
  const archivedNonzero = accounts.filter(
    (account) =>
      !account.isActive && (model.balances.get(account.id) ?? 0) !== 0,
  );
  const changedMonths = confirmations.filter(
    (row) => row.openingChangedSinceConfirmation,
  );
  const recent = sortRecent(transactions).slice(0, 6);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(new Date());

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-forest/70">
          Welcome
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Your money, in your hands.
        </h1>
        <p className="mt-2 text-sm text-ink/70">
          Private, offline-first tracking in NPR.
        </p>
      </header>

      <MonthConfirmation
        carried={model.carried}
        newAccounts={model.newAccounts}
        formatAmount={formatNpr}
      />

      {changedMonths.length > 0 && (
        <section className="mb-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Previously confirmed opening changed.</strong> Review{" "}
          {changedMonths.map((row) => row.monthKey).join(", ")} after a
          backdated change. Balances remain calculated from the ledger.
        </section>
      )}
      {archivedNonzero.length > 0 && (
        <section className="mb-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Archived account has a nonzero balance:</strong>{" "}
          {archivedNonzero.map((account) => account.name).join(", ")}. It is
          included in the total until resolved.
        </section>
      )}

      {!accounts.length ? (
        <section className="rounded-3xl bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold">Create your first account</h2>
          <p className="mt-3 text-sm leading-6 text-ink/70">
            Add cash, a bank or a wallet with a one-time opening balance. Your
            data stays in this browser.
          </p>
          <Link
            to="/accounts"
            className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-forest px-5 font-semibold text-white"
          >
            Set up accounts
          </Link>
        </section>
      ) : (
        <div className="grid gap-5">
          <section className="rounded-3xl bg-forest p-6 text-white shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-white/70">
              Total balance
            </p>
            <p className="mt-3 text-4xl font-black tabular-nums sm:text-5xl">
              {formatNpr(model.total)}
            </p>
            <p className="mt-3 text-sm text-white/75">
              Right now, using Kathmandu’s {today} calendar date.
            </p>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold">This month · {monthName}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-paper p-4">
                <p className="text-sm text-ink/60">Income</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatNpr(model.summary.incomePaisa)}
                </p>
              </div>
              <div className="rounded-2xl bg-paper p-4">
                <p className="text-sm text-ink/60">Expenses</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatNpr(model.summary.expensesPaisa)}
                </p>
              </div>
              <div className="rounded-2xl bg-paper p-4">
                <p className="text-sm text-ink/60">Operating net</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatNpr(model.summary.operatingNetPaisa)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink/70">
              Transfers move money without changing total. Adjustments:{" "}
              {formatNpr(model.summary.adjustmentsPaisa)}; new account openings:{" "}
              {formatNpr(model.summary.openingEntriesPaisa)}.
            </p>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold">Accounts</h2>
            <div className="mt-3 divide-y divide-forest/10">
              {activeAccounts.map((account) => (
                <Link
                  key={account.id}
                  to="/accounts"
                  className="flex min-h-12 items-center justify-between gap-3 py-2"
                >
                  <span>{account.name}</span>
                  <strong className="tabular-nums">
                    {formatNpr(model.balances.get(account.id) ?? 0)}
                  </strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Recent transactions</h2>
              <Link
                to="/transactions"
                className="font-semibold text-forest underline"
              >
                View all
              </Link>
            </div>
            <div className="mt-3 grid gap-3">
              {recent.map((entry) => (
                <article key={entry.id} className="rounded-2xl bg-paper p-3">
                  <p className="flex justify-between gap-3 font-semibold">
                    <span className="capitalize">{entry.type}</span>
                    <span className="tabular-nums">
                      {formatNpr(
                        "amountPaisa" in entry
                          ? entry.amountPaisa
                          : Math.abs(entry.deltaPaisa),
                      )}
                    </span>
                  </p>
                  <p className="text-sm text-ink/70">
                    {entry.date} ·{" "}
                    {entryTitle(entry, accountNames, categoryNames)}
                  </p>
                </article>
              ))}
              {!recent.length && (
                <p className="text-sm text-ink/70">
                  No transactions yet. Use + after creating an account.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
