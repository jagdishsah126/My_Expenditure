import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../../db/database";
import type { Account, AccountType, Transaction } from "../../db/schema";
import { getKathmanduToday } from "../../utils/dates";
import { addPaisa, formatNpr, parseNprToPaisa } from "../../utils/money";
import { calculateAccountBalance } from "../ledger/selectors";
import { createTransaction } from "../transactions/service";
import {
  archiveAccount,
  createAccount,
  createAccountType,
  deleteAccountType,
  restoreAccount,
  updateAccount,
} from "./service";

const input =
  "min-h-12 w-full rounded-xl border border-forest/20 bg-white px-3 py-2 text-ink";
const section =
  "rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7";

function accountEntries(accountId: string, entries: Transaction[]) {
  return entries
    .filter((entry) =>
      entry.type === "transfer"
        ? entry.fromAccountId === accountId || entry.toAccountId === accountId
        : entry.accountId === accountId,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.time ?? "").localeCompare(a.time ?? "") ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

function NewAccountTypeForm({ types }: { types: AccountType[] }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await createAccountType({ name, icon: icon.trim() || undefined });
      setName("");
      setIcon("");
      setMessage("Account type added.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not add account type.",
      );
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
      <label className="text-sm font-semibold">
        New account type
        <input
          className={input}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Cooperative"
        />
      </label>
      <label className="text-sm font-semibold">
        Icon (optional)
        <input
          className={input}
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
          placeholder="🏦"
        />
      </label>
      <button
        type="submit"
        disabled={!name.trim()}
        className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white disabled:opacity-50"
      >
        Add type
      </button>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <ul className="grid gap-2 text-sm">
        {types.map((type) => (
          <li
            key={type.id}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-paper px-3"
          >
            <span>
              {type.icon && <span aria-hidden="true">{type.icon} </span>}
              {type.name} {type.isBuiltIn && "(built in)"}
            </span>
            {!type.isBuiltIn && (
              <button
                type="button"
                onClick={() =>
                  void deleteAccountType(type.id).catch((cause: unknown) =>
                    setMessage(
                      cause instanceof Error
                        ? cause.message
                        : "Could not delete type.",
                    ),
                  )
                }
                className="font-semibold text-red-800 underline"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </form>
  );
}

function NewAccountForm({ types }: { types: AccountType[] }) {
  const [name, setName] = useState("");
  const [accountTypeId, setAccountTypeId] = useState("");
  const [openingDate, setOpeningDate] = useState(getKathmanduToday());
  const [openingAmount, setOpeningAmount] = useState("0");
  const [icon, setIcon] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const type = accountTypeId || types[0]?.id || "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await createAccount({
        name,
        accountTypeId: type,
        currency: "NPR",
        icon: icon.trim() || undefined,
        notes: notes.trim() || undefined,
        openingDate,
        openingAmountPaisa: parseNprToPaisa(openingAmount, { allowZero: true }),
      });
      setName("");
      setOpeningAmount("0");
      setIcon("");
      setNotes("");
      setMessage("Account created with one opening entry.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not create account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <label className="text-sm font-semibold">
        Account name
        <input
          required
          className={input}
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Nabil Bank"
        />
      </label>
      <label className="text-sm font-semibold">
        Type
        <select
          className={input}
          value={type}
          onChange={(event) => setAccountTypeId(event.target.value)}
        >
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        Icon (optional)
        <input
          className={input}
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
          placeholder="💵"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Opening date
          <input
            required
            type="date"
            max={getKathmanduToday()}
            className={input}
            value={openingDate}
            onChange={(event) => setOpeningDate(event.target.value)}
          />
        </label>
        <label className="text-sm font-semibold">
          Opening balance (NPR)
          <input
            required
            inputMode="decimal"
            className={input}
            value={openingAmount}
            onChange={(event) => setOpeningAmount(event.target.value)}
          />
        </label>
      </div>
      <label className="text-sm font-semibold">
        Notes (optional)
        <input
          className={input}
          value={notes}
          maxLength={300}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <p className="text-sm text-ink/70">
        This one dated opening entry is the account’s only starting balance.
      </p>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <button
        type="submit"
        disabled={busy || !types.length}
        className="min-h-12 rounded-xl bg-forest px-5 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function EditAccountForm({
  account,
  types,
}: {
  account: Account;
  types: AccountType[];
}) {
  const [name, setName] = useState(account.name);
  const [accountTypeId, setAccountTypeId] = useState(account.accountTypeId);
  const [icon, setIcon] = useState(account.icon ?? "");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await updateAccount(account.id, {
        name,
        accountTypeId,
        icon: icon.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setMessage("Account updated.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not update account.",
      );
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <label className="text-sm font-semibold">
        Name
        <input
          required
          className={input}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Type
        <select
          className={input}
          value={accountTypeId}
          onChange={(event) => setAccountTypeId(event.target.value)}
        >
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        Icon
        <input
          className={input}
          value={icon}
          maxLength={8}
          onChange={(event) => setIcon(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Notes
        <input
          className={input}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <button className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white">
        Save account
      </button>
    </form>
  );
}

function ReconcileForm({
  account,
  balance,
}: {
  account: Account;
  balance: number;
}) {
  const [actual, setActual] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(getKathmanduToday());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const actualPaisa = parseNprToPaisa(actual, { allowZero: true });
      const deltaPaisa = addPaisa(actualPaisa, -balance);
      if (deltaPaisa === 0) throw new Error("No adjustment is needed.");
      await createTransaction(db, {
        type: "adjustment",
        accountId: account.id,
        deltaPaisa,
        reason,
        calculatedBeforePaisa: balance,
        actualAtTimePaisa: actualPaisa,
        date,
        source: "manual",
        tagIds: [],
      });
      setActual("");
      setReason("");
      setMessage("Adjustment recorded.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not reconcile account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <p className="text-sm">
        Calculated balance: <strong>{formatNpr(balance)}</strong>
      </p>
      <label className="text-sm font-semibold">
        Actual balance (NPR)
        <input
          required
          inputMode="decimal"
          className={input}
          value={actual}
          onChange={(event) => setActual(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Adjustment date
        <input
          required
          type="date"
          className={input}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold">
        Reason
        <input
          required
          className={input}
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Cash withdrawal not recorded"
        />
      </label>
      <p className="text-sm text-ink/70">
        This creates a signed adjustment entry; it does not rewrite history.
      </p>
      {message && <p className="text-sm text-ink/70">{message}</p>}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Create adjustment"}
      </button>
    </form>
  );
}

function describe(entry: Transaction, names: Map<string, string>) {
  if (entry.type === "transfer") {
    return `${names.get(entry.fromAccountId) ?? "Unknown"} → ${names.get(entry.toAccountId) ?? "Unknown"}`;
  }
  return entry.remark || entry.type;
}

export function AccountsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const types = useLiveQuery(() => db.accountTypes.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const balances = useMemo(
    () =>
      new Map(
        (accounts ?? []).map((account) => [
          account.id,
          calculateAccountBalance(account.id, transactions ?? []),
        ]),
      ),
    [accounts, transactions],
  );
  const selected =
    (accounts ?? []).find((account) => account.id === selectedId) ??
    (accounts ?? []).find((account) => account.isActive) ??
    accounts?.[0];
  const names = new Map((accounts ?? []).map((row) => [row.id, row.name]));
  const active = (accounts ?? []).filter((account) => account.isActive);
  const archived = (accounts ?? []).filter((account) => !account.isActive);

  async function changeArchive(account: Account) {
    setActionError("");
    try {
      if (account.isActive) await archiveAccount(account.id);
      else await restoreAccount(account.id);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Could not change account status.",
      );
    }
  }

  if (!accounts || !types || !transactions)
    return <p role="status">Loading accounts…</p>;

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-forest/70">
          Where your money lives
        </p>
        <h1 className="mt-2 text-3xl font-bold">Accounts</h1>
        <p className="mt-2 text-sm text-ink/70">
          Balances are calculated from the shared ledger. Archived accounts keep
          their history.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-5">
          <section className={section}>
            <h2 className="text-xl font-bold">Your accounts</h2>
            {actionError && (
              <p role="alert" className="mt-3 text-sm text-red-800">
                {actionError}
              </p>
            )}
            <div className="mt-4 grid gap-3">
              {active.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelectedId(account.id)}
                  className={`min-h-14 rounded-2xl border p-4 text-left ${selected?.id === account.id ? "border-forest bg-leaf/50" : "border-forest/10 bg-paper"}`}
                >
                  <span className="flex justify-between gap-3 font-semibold">
                    <span>
                      {account.icon && (
                        <span aria-hidden="true">{account.icon} </span>
                      )}
                      {account.name}
                    </span>
                    <span className="tabular-nums">
                      {formatNpr(balances.get(account.id) ?? 0)}
                    </span>
                  </span>
                  <span className="text-sm text-ink/60">
                    {types.find((type) => type.id === account.accountTypeId)
                      ?.name ?? "Unknown type"}
                  </span>
                </button>
              ))}
              {!active.length && (
                <p className="text-sm text-ink/70">
                  No active accounts yet. Create one below.
                </p>
              )}
            </div>
            {archived.length > 0 && (
              <div className="mt-5">
                <h3 className="font-bold">Archived</h3>
                <div className="mt-2 grid gap-2">
                  {archived.map((account) => {
                    const balance = balances.get(account.id) ?? 0;
                    return (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setSelectedId(account.id)}
                        className="rounded-xl bg-paper p-3 text-left"
                      >
                        <span className="flex justify-between gap-3">
                          <span>
                            {account.icon && (
                              <span aria-hidden="true">{account.icon} </span>
                            )}
                            {account.name}
                          </span>
                          <span className="tabular-nums">
                            {formatNpr(balance)}
                          </span>
                        </span>
                        {balance !== 0 && (
                          <span className="text-sm font-semibold text-amber-900">
                            Archived account became nonzero; resolve this
                            history.
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
          <section className={section}>
            <h2 className="text-xl font-bold">Create account</h2>
            <NewAccountForm types={types} />
          </section>
          <section className={section}>
            <h2 className="text-xl font-bold">Account types</h2>
            <NewAccountTypeForm types={types} />
          </section>
          <Link
            to="/categories"
            className="rounded-2xl bg-leaf/60 p-4 font-semibold text-forest"
          >
            Manage categories, subcategories and tags →
          </Link>
        </div>
        <div className="grid content-start gap-5">
          {selected ? (
            <>
              <section className={section}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold">
                      {selected.icon && (
                        <span aria-hidden="true">{selected.icon} </span>
                      )}
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-sm text-ink/70">
                      {selected.isActive ? "Active" : "Archived"} · Current
                      balance
                    </p>
                    <p className="mt-2 text-3xl font-bold tabular-nums">
                      {formatNpr(balances.get(selected.id) ?? 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void changeArchive(selected)}
                    className="min-h-11 rounded-xl border border-forest/20 px-4 font-semibold"
                  >
                    {selected.isActive ? "Archive" : "Restore"}
                  </button>
                </div>
                {selected.isActive &&
                  (balances.get(selected.id) ?? 0) !== 0 && (
                    <p className="mt-3 rounded-xl bg-leaf/50 p-3 text-sm">
                      To archive, transfer or reconcile the balance to zero
                      first.
                    </p>
                  )}
              </section>
              {selected.isActive && (
                <section className={section}>
                  <h2 className="text-xl font-bold">Reconcile balance</h2>
                  <ReconcileForm
                    key={selected.id}
                    account={selected}
                    balance={balances.get(selected.id) ?? 0}
                  />
                </section>
              )}
              <section className={section}>
                <h2 className="text-xl font-bold">Account details</h2>
                <EditAccountForm
                  key={selected.id}
                  account={selected}
                  types={types}
                />
              </section>
              <section className={section}>
                <h2 className="text-xl font-bold">Account history</h2>
                <div className="mt-4 grid gap-3">
                  {accountEntries(selected.id, transactions)
                    .slice(0, 30)
                    .map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-xl bg-paper p-3 text-sm"
                      >
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
                        <p className="text-ink/70">
                          {entry.date} · {describe(entry, names)}
                        </p>
                        {entry.type === "adjustment" && (
                          <p className="text-xs">Reason: {entry.reason}</p>
                        )}
                      </article>
                    ))}
                  {!accountEntries(selected.id, transactions).length && (
                    <p className="text-sm text-ink/70">No history yet.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className={section}>
              <h2 className="text-xl font-bold">No account selected</h2>
              <p className="mt-2 text-sm text-ink/70">
                Create your first account to begin tracking money.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
