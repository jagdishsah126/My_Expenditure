import { useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../../db/database";
import { formatNpr } from "../../utils/money";
import {
  accountBalances,
  dailySpending,
  expenseByCategory,
  expenseTrend,
  incomeSources,
  incomeVsExpense,
  resolveRange,
  spendingByAccount,
  type DateRange,
  type Point,
  type RangePreset,
} from "./aggregations";

const input =
  "min-h-11 w-full rounded-xl border border-forest/20 bg-white px-3 py-2 text-ink";
const colors = {
  expense: "#b42318",
  income: "#147a4c",
  neutral: "#276f4f",
  muted: "#7a9188",
};

function shortAmount(value: number) {
  const rupees = value / 100;
  if (Math.abs(rupees) >= 1000) return `Rs ${(rupees / 1000).toFixed(1)}k`;
  return `Rs ${rupees.toFixed(0)}`;
}

function Summary({ points }: { points: Point[] }) {
  const visible = points.filter((point) => point.value !== 0).slice(0, 8);
  if (!visible.length)
    return (
      <p className="mt-3 text-sm text-ink/70">No activity in this range.</p>
    );
  return (
    <table className="mt-3 w-full text-sm">
      <caption className="sr-only">Chart values</caption>
      <tbody>
        {visible.map((point) => (
          <tr key={point.label} className="border-t border-forest/10">
            <th scope="row" className="py-2 text-left font-medium">
              {point.label}
            </th>
            <td className="py-2 text-right tabular-nums">
              {formatNpr(point.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartCard({
  title,
  question,
  range,
  points,
  children,
}: {
  title: string;
  question: string;
  range: DateRange;
  points: Point[];
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-forest/10 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-ink/70">{question}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink/50">
        {range.label} · {range.start} to {range.endExclusive}
      </p>
      <div
        className="mt-4 h-56 w-full"
        role="img"
        aria-label={`${title} chart`}
      >
        {children}
      </div>
      <Summary points={points} />
    </section>
  );
}

function MoneyBarChart({
  data,
  color = colors.neutral,
}: {
  data: Point[];
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis tickFormatter={shortAmount} tick={{ fontSize: 11 }} width={58} />
        <Tooltip formatter={(value) => formatNpr(Number(value))} />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraphicsPage() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const rangeResult = useMemo(() => {
    try {
      return {
        range: resolveRange(preset, customStart, customEnd),
        error: "",
      };
    } catch (cause) {
      return {
        range: resolveRange("thisMonth"),
        error:
          cause instanceof Error ? cause.message : "Choose a valid date range.",
      };
    }
  }, [preset, customStart, customEnd]);
  const { range, error: rangeError } = rangeResult;

  const model = useMemo(() => {
    if (!accounts || !categories || !transactions) return null;
    const trend = expenseTrend(transactions, range);
    const daily = dailySpending(transactions, range);
    const byCategory = expenseByCategory(transactions, categories, range);
    const balances = accountBalances(accounts, transactions, range);
    const sources = incomeSources(transactions, categories, range);
    const byAccount = spendingByAccount(accounts, transactions, range);
    return {
      trend,
      daily,
      byCategory,
      balances,
      sources,
      byAccount,
      comparison: incomeVsExpense(transactions, range),
    };
  }, [accounts, categories, transactions, range]);

  if (!accounts || !categories || !transactions || !model)
    return <p role="status">Loading graphics…</p>;

  const comparisonPoints: Point[] = model.comparison.flatMap((point) => [
    { label: `${point.label} income`, value: point.income },
    { label: `${point.label} expense`, value: point.expense },
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-forest/70">
          Insights
        </p>
        <h1 className="mt-2 text-3xl font-bold">Graphics</h1>
        <p className="mt-2 text-sm text-ink/70">
          Each chart answers one question and uses the same ledger as your
          history. Transfers and adjustments are not operating income or
          expenses.
        </p>
      </header>
      <section
        className="rounded-3xl bg-white p-4 shadow-sm sm:p-6"
        aria-label="Date range"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">
            Range
            <select
              className={input}
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
            >
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="thisYear">This Year</option>
              <option value="last3Months">Last 3 Months</option>
              <option value="last6Months">Last 6 Months</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>
          {preset === "custom" && (
            <>
              <label className="text-sm font-semibold">
                From
                <input
                  type="date"
                  className={input}
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                To
                <input
                  type="date"
                  className={input}
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {rangeError && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {rangeError}
          </p>
        )}
      </section>

      <div className="mt-5 grid gap-5">
        <ChartCard
          title="Expense trend"
          question="How is spending moving over time?"
          range={range}
          points={model.trend}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={model.trend}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={shortAmount}
                tick={{ fontSize: 11 }}
                width={58}
              />
              <Tooltip formatter={(value) => formatNpr(Number(value))} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={colors.expense}
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Income vs expense"
          question="Did operating money come in or go out?"
          range={range}
          points={comparisonPoints}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={model.comparison}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={shortAmount}
                tick={{ fontSize: 11 }}
                width={58}
              />
              <Tooltip formatter={(value) => formatNpr(Number(value))} />
              <Bar
                dataKey="income"
                fill={colors.income}
                radius={[5, 5, 0, 0]}
              />
              <Bar
                dataKey="expense"
                fill={colors.expense}
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Expense by category"
          question="Where did spending go?"
          range={range}
          points={model.byCategory}
        >
          <MoneyBarChart data={model.byCategory} color={colors.expense} />
        </ChartCard>

        <ChartCard
          title="Account balances"
          question="How much is in each account as of the range end?"
          range={range}
          points={model.balances}
        >
          <MoneyBarChart data={model.balances} color={colors.neutral} />
        </ChartCard>

        <ChartCard
          title="Daily spending"
          question="Which days were unusually expensive?"
          range={range}
          points={model.daily}
        >
          <MoneyBarChart data={model.daily} color={colors.expense} />
        </ChartCard>

        <ChartCard
          title="Income sources"
          question="Where did income come from?"
          range={range}
          points={model.sources}
        >
          <MoneyBarChart data={model.sources} color={colors.income} />
        </ChartCard>

        <ChartCard
          title="Spending by account"
          question="Which accounts were used for expenses?"
          range={range}
          points={model.byAccount}
        >
          <MoneyBarChart data={model.byAccount} color={colors.expense} />
        </ChartCard>
      </div>
    </>
  );
}
