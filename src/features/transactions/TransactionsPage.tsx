import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Transaction } from "../../db/schema";
import { db } from "../../db/database";
import { useUiStore } from "../../stores/ui";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "./service";
import { toDraft } from "./draft";
import { TransactionForm, type EntryKind } from "./TransactionForm";

export function TransactionEntry({
  formatAmount,
  parseAmount,
}: {
  formatAmount: (amount: number) => string;
  parseAmount: (input: string) => number;
}) {
  const { addDialogOpen, setAddDialogOpen } = useUiStore();
  const [kind, setKind] = useState<EntryKind | null>(null);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? [];
  const close = () => {
    setKind(null);
    setAddDialogOpen(false);
  };
  useEffect(() => {
    if (!addDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setKind(null);
        setAddDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addDialogOpen, setAddDialogOpen]);
  if (!addDialogOpen) return null;
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-40 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-ink shadow-xl sm:rounded-3xl sm:p-7"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="entry-title" className="text-xl font-bold">
            {kind ? `New ${kind}` : "Add transaction"}
          </h2>
          <button
            type="button"
            aria-label="Close transaction entry"
            onClick={close}
            className="min-h-11 min-w-11 rounded-xl bg-paper text-xl"
          >
            ×
          </button>
        </div>
        {accounts.filter((account) => account.isActive).length === 0 ? (
          <p className="text-sm">
            Create an account in Accounts before recording transactions.
          </p>
        ) : kind ? (
          <TransactionForm
            key={kind}
            kind={kind}
            accounts={accounts}
            categories={categories}
            tags={tags}
            onCancel={() => setKind(null)}
            onSave={async (values) => {
              const amountPaisa = parseAmount(values.amount);
              await createTransaction(db, toDraft(values, amountPaisa));
              close();
            }}
          />
        ) : (
          <div className="grid gap-3">
            {(["expense", "income", "transfer"] as const).map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setKind(option)}
                className="min-h-14 rounded-xl border border-forest/20 px-5 text-left font-semibold capitalize hover:bg-leaf/40"
              >
                {option}
              </button>
            ))}
          </div>
        )}
        <p className="mt-5 text-xs text-ink/60">
          Amounts are in NPR. Your records remain in this browser.{" "}
          {formatAmount(0)} is just an empty value, not an account balance.
        </p>
      </section>
    </div>
  );
}

function describeTransaction(
  entry: Transaction,
  accounts: Map<string, string>,
  categories: Map<string, string>,
): string {
  if (entry.type === "transfer")
    return `${accounts.get(entry.fromAccountId) ?? "Archived account"} → ${accounts.get(entry.toAccountId) ?? "Archived account"}`;
  const account = accounts.get(entry.accountId) ?? "Archived account";
  if (entry.type === "opening") return `Opening · ${account}`;
  if (entry.type === "adjustment") return `Adjustment · ${account}`;
  return `${categories.get(entry.categoryId) ?? "Archived category"} · ${account}`;
}

export function TransactionsPage({
  formatAmount,
  parseAmount,
}: {
  formatAmount: (amount: number) => string;
  parseAmount: (input: string) => number;
}) {
  const liveEntries = useLiveQuery(() => db.transactions.toArray(), []);
  const liveAccounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liveCategories = useLiveQuery(() => db.categories.toArray(), []);
  const liveTags = useLiveQuery(() => db.tags.toArray(), []);
  const entries = useMemo(() => liveEntries ?? [], [liveEntries]);
  const accounts = useMemo(() => liveAccounts ?? [], [liveAccounts]);
  const categories = useMemo(() => liveCategories ?? [], [liveCategories]);
  const tags = useMemo(() => liveTags ?? [], [liveTags]);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const tagNames = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.label])),
    [tags],
  );
  const visible = useMemo(
    () =>
      entries
        .filter((entry) => {
          if (
            (type && entry.type !== type) ||
            (source && entry.source !== source)
          )
            return false;
          if (
            (fromDate && entry.date < fromDate) ||
            (toDate && entry.date > toDate)
          )
            return false;
          if (
            accountId &&
            (entry.type === "transfer"
              ? entry.fromAccountId !== accountId &&
                entry.toAccountId !== accountId
              : entry.accountId !== accountId)
          )
            return false;
          if (
            categoryId &&
            !(
              "categoryId" in entry &&
              (entry.categoryId === categoryId ||
                entry.subcategoryId === categoryId)
            )
          )
            return false;
          if (tagId && !entry.tagIds.includes(tagId)) return false;
          const absoluteAmount =
            "amountPaisa" in entry
              ? entry.amountPaisa
              : Math.abs(entry.deltaPaisa);
          try {
            if (
              (minAmount && absoluteAmount < parseAmount(minAmount)) ||
              (maxAmount && absoluteAmount > parseAmount(maxAmount))
            )
              return false;
          } catch {
            return false;
          }
          const search = [
            entry.remark,
            entry.sourceReference,
            entry.type,
            describeTransaction(entry, names, categoryNames),
            ...entry.tagIds.map((id) => tagNames.get(id)),
          ]
            .join(" ")
            .toLowerCase();
          return search.includes(query.trim().toLowerCase());
        })
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            (b.time ?? "").localeCompare(a.time ?? "") ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [
      entries,
      query,
      accountId,
      categoryId,
      tagId,
      type,
      source,
      fromDate,
      toDate,
      minAmount,
      maxAmount,
      parseAmount,
      names,
      categoryNames,
      tagNames,
    ],
  );

  async function remove(id: string) {
    if (
      !window.confirm(
        "Delete this transaction? Balances and reports will update. This cannot be undone.",
      )
    )
      return;
    setError(null);
    try {
      await deleteTransaction(db, id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete transaction.",
      );
    }
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-forest/70">
          History
        </p>
        <h1 className="mt-2 text-3xl font-bold">Transactions</h1>
        <p className="mt-2 text-sm text-ink/70">
          Search and review every movement, including transfers and adjustments.
        </p>
      </header>
      <section
        aria-label="Transaction filters"
        className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <label className="grid gap-1 text-sm">
          Search remark, tags or name
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Account
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 bg-white px-3"
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 bg-white px-3"
          >
            <option value="">All types</option>
            {["expense", "income", "transfer", "opening", "adjustment"].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Category
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 bg-white px-3"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Tag
          <select
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 bg-white px-3"
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                #{tag.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="min-h-11 rounded-lg border border-forest/20 bg-white px-3"
          >
            <option value="">All sources</option>
            {["manual", "bank_statement", "wallet_statement", "imported"].map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-forest/20 px-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-forest/20 px-2"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm">
            Min NPR
            <input
              inputMode="decimal"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-forest/20 px-2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Max NPR
            <input
              inputMode="decimal"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-forest/20 px-2"
            />
          </label>
        </div>
      </section>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-800">
          {error}
        </p>
      )}
      <p className="my-4 text-sm text-ink/70">
        {visible.length} transaction{visible.length === 1 ? "" : "s"}
      </p>
      <div className="grid gap-3">
        {visible.map((entry) => (
          <article
            key={entry.id}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold capitalize">{entry.type}</p>
                <p className="truncate text-sm text-ink/70">
                  {describeTransaction(entry, names, categoryNames)}
                </p>
                <p className="mt-1 text-xs text-ink/60">
                  {entry.date}
                  {entry.time ? ` · ${entry.time}` : ""} · {entry.source}
                </p>
              </div>
              <p className="shrink-0 font-bold tabular-nums">
                {entry.type === "expense" ||
                (entry.type === "adjustment" && entry.deltaPaisa < 0)
                  ? "−"
                  : entry.type === "income"
                    ? "+"
                    : ""}
                {formatAmount(
                  "amountPaisa" in entry
                    ? entry.amountPaisa
                    : Math.abs(entry.deltaPaisa),
                )}
              </p>
            </div>
            {entry.remark && <p className="mt-2 text-sm">{entry.remark}</p>}
            {entry.tagIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {entry.tagIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full bg-paper px-2 py-1 text-xs"
                  >
                    #{tagNames.get(id) ?? "archived"}
                  </span>
                ))}
              </div>
            )}
            {entry.type === "adjustment" && (
              <p className="mt-1 text-xs">Reason: {entry.reason}</p>
            )}
            <div className="mt-3 flex gap-3 text-sm">
              {(entry.type === "income" ||
                entry.type === "expense" ||
                entry.type === "transfer") && (
                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  className="min-h-11 rounded-lg px-2 font-semibold text-forest underline"
                >
                  Edit
                </button>
              )}
              {entry.type !== "opening" && (
                <button
                  type="button"
                  onClick={() => void remove(entry.id)}
                  className="min-h-11 rounded-lg px-2 font-semibold text-red-800 underline"
                >
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-sm text-ink/70">
            No matching transactions yet. Use + to record your first one after
            creating an account.
          </p>
        )}
      </div>
      {editing &&
        (editing.type === "income" ||
          editing.type === "expense" ||
          editing.type === "transfer") && (
          <div
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setEditing(null);
            }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-forest/60 sm:items-center"
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Edit transaction"
              className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-7"
            >
              <h2 className="mb-4 text-xl font-bold">Edit transaction</h2>
              <TransactionForm
                key={editing.id}
                kind={editing.type}
                initial={editing}
                accounts={accounts}
                categories={categories}
                tags={tags}
                onCancel={() => setEditing(null)}
                onSave={async (values) => {
                  await updateTransaction(
                    db,
                    editing.id,
                    toDraft(values, parseAmount(values.amount), editing),
                  );
                  setEditing(null);
                }}
              />
            </section>
          </div>
        )}
    </>
  );
}
