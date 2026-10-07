import { useState, type FormEvent } from "react";
import type { Account, Category, Tag, Transaction } from "../../db/schema";

export type EntryKind = "expense" | "income" | "transfer";
export type RawTransactionForm = {
  type: EntryKind;
  amount: string;
  date: string;
  time?: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  subcategoryId?: string;
  remark?: string;
  tagIds: string[];
};

function todayInKathmandu(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) =>
    parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function amountText(paisa: number): string {
  const whole = Math.floor(paisa / 100);
  return `${whole}.${String(paisa % 100).padStart(2, "0")}`;
}

export function TransactionForm({
  accounts,
  categories,
  tags,
  initial,
  kind,
  onSave,
  onCancel,
}: {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  initial?: Transaction;
  kind: EntryKind;
  onSave: (values: RawTransactionForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(
    initial && "amountPaisa" in initial ? amountText(initial.amountPaisa) : "",
  );
  const [date, setDate] = useState(initial?.date ?? todayInKathmandu());
  const [time, setTime] = useState(initial?.time ?? "");
  const [accountId, setAccountId] = useState(
    initial && "fromAccountId" in initial
      ? initial.fromAccountId
      : initial && "accountId" in initial
        ? initial.accountId
        : (accounts[0]?.id ?? ""),
  );
  const [toAccountId, setToAccountId] = useState(
    initial && "toAccountId" in initial ? initial.toAccountId : "",
  );
  const [categoryId, setCategoryId] = useState(
    initial && "categoryId" in initial ? initial.categoryId : "",
  );
  const [subcategoryId, setSubcategoryId] = useState(
    initial && "subcategoryId" in initial ? (initial.subcategoryId ?? "") : "",
  );
  const [remark, setRemark] = useState(initial?.remark ?? "");
  const [tagIds, setTagIds] = useState(initial?.tagIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roots = categories.filter(
    (category) =>
      category.isActive &&
      !category.parentId &&
      (category.type === kind || category.type === "both"),
  );
  const children = categories.filter(
    (category) =>
      category.isActive &&
      category.parentId === categoryId &&
      (category.type === kind || category.type === "both"),
  );
  // Archived accounts can still be shown for a historical edit, but cannot be newly selected.
  const availableAccounts = accounts.filter(
    (account) =>
      account.isActive ||
      (initial &&
        (("accountId" in initial && initial.accountId === account.id) ||
          ("fromAccountId" in initial &&
            initial.fromAccountId === account.id) ||
          ("toAccountId" in initial && initial.toAccountId === account.id))),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        type: kind,
        amount,
        date,
        time: time || undefined,
        accountId,
        toAccountId,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        remark: remark.trim() || undefined,
        tagIds,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The transaction could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <label
        className="grid gap-1 text-sm font-semibold"
        htmlFor="entry-amount"
      >
        Amount (NPR)
        <input
          id="entry-amount"
          required
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-h-12 rounded-xl border border-forest/20 px-3 text-lg"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="entry-date">
        Date
        <input
          id="entry-date"
          required
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-12 rounded-xl border border-forest/20 px-3"
        />
      </label>
      <label
        className="grid gap-1 text-sm font-semibold"
        htmlFor="entry-account"
      >
        {kind === "transfer" ? "From account" : "Account"}
        <select
          id="entry-account"
          required
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="min-h-12 rounded-xl border border-forest/20 bg-white px-3"
        >
          <option value="">Choose account</option>
          {availableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.isActive ? "" : " (archived)"}
            </option>
          ))}
        </select>
      </label>
      {kind === "transfer" ? (
        <label className="grid gap-1 text-sm font-semibold" htmlFor="entry-to">
          To account
          <select
            id="entry-to"
            required
            value={toAccountId}
            onChange={(event) => setToAccountId(event.target.value)}
            className="min-h-12 rounded-xl border border-forest/20 bg-white px-3"
          >
            <option value="">Choose account</option>
            {availableAccounts
              .filter((account) => account.id !== accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <>
          <label
            className="grid gap-1 text-sm font-semibold"
            htmlFor="entry-category"
          >
            Category
            <select
              id="entry-category"
              required
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setSubcategoryId("");
              }}
              className="min-h-12 rounded-xl border border-forest/20 bg-white px-3"
            >
              <option value="">Choose category</option>
              {roots.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          {children.length > 0 && (
            <label
              className="grid gap-1 text-sm font-semibold"
              htmlFor="entry-subcategory"
            >
              Subcategory (optional)
              <select
                id="entry-subcategory"
                value={subcategoryId}
                onChange={(event) => setSubcategoryId(event.target.value)}
                className="min-h-12 rounded-xl border border-forest/20 bg-white px-3"
              >
                <option value="">None</option>
                {children.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      <label
        className="grid gap-1 text-sm font-semibold"
        htmlFor="entry-remark"
      >
        Remark (optional)
        <input
          id="entry-remark"
          type="text"
          maxLength={500}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          className="min-h-12 rounded-xl border border-forest/20 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="entry-time">
        Time (optional)
        <input
          id="entry-time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="min-h-12 rounded-xl border border-forest/20 px-3"
        />
      </label>
      {tags.length > 0 && (
        <fieldset className="rounded-xl border border-forest/20 p-3">
          <legend className="px-1 text-sm font-semibold">
            Tags (optional)
          </legend>
          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={(event) =>
                    setTagIds((current) =>
                      event.target.checked
                        ? [...current, tag.id]
                        : current.filter((id) => id !== tag.id),
                    )
                  }
                />
                {tag.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 flex-1 rounded-xl border border-forest/20 font-semibold"
        >
          Cancel
        </button>
        <button
          disabled={saving}
          className="min-h-12 flex-1 rounded-xl bg-forest font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Save"}
        </button>
      </div>
    </form>
  );
}
