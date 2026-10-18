"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- Legacy report adapter retained for rollback compatibility. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  Landmark,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppUser } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { FinanceReports } from "@/components/finance-reports";

type TransactionType = "Income" | "Expense";
type TransactionStatus = "Approved" | "Pending";
export type FinanceTransactionRow = {
  id: string;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  enteredBy: string;
};
type Transaction = FinanceTransactionRow;
type FinanceTab =
  "Overview" | "Transactions" | "Budgets" | "Reports" | "Audit trail";

const cashFlow = [
  { month: "Apr", income: 5.4, expense: 3.7 },
  { month: "May", income: 6.1, expense: 4.2 },
  { month: "Jun", income: 5.8, expense: 4.0 },
  { month: "Jul", income: 7.2, expense: 4.6 },
  { month: "Aug", income: 6.7, expense: 4.4 },
  { month: "Sep", income: 6.8, expense: 3.9 },
];
const spendColors = ["#047857", "#2563eb", "#d97706", "#dc2626", "#7c3aed"];
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export function FinanceDashboard({ user }: { user: AppUser }) {
  const [tab, setTab] = useState<FinanceTab>("Overview");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const hasDatabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "reports")
      setTab("Reports");
  }, []);

  useEffect(() => {
    if (!hasDatabase) return;
    const loadTransactions = async () => {
      const { data, error } = await createClient()
        .from("finance_transactions")
        .select(
          "id,reference,transaction_date,description,amount,status,transaction_type,created_by,finance_categories(name),users!finance_transactions_created_by_fkey(full_name)",
        )
        .order("transaction_date", { ascending: false });
      if (error) return toast.error("Could not load the finance ledger");
      if (data)
        setTransactions(
          data.map((row: any) => ({
            id: row.reference,
            databaseId: row.id,
            date: row.transaction_date,
            description: row.description,
            category: row.finance_categories?.name ?? "Uncategorized",
            type: row.transaction_type === "INCOME" ? "Income" : "Expense",
            amount: Number(row.amount),
            status: row.status === "APPROVED" ? "Approved" : "Pending",
            enteredBy: row.users?.full_name ?? "Finance user",
          })),
        );
    };
    void loadTransactions();
  }, [hasDatabase]);

  const totals = useMemo(() => {
    const approved = transactions.filter((item) => item.status === "Approved");
    const income = approved
      .filter((item) => item.type === "Income")
      .reduce((sum, item) => sum + item.amount, 0);
    const expense = approved
      .filter((item) => item.type === "Expense")
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      income,
      expense,
      profit: income - expense,
      margin: income ? ((income - expense) / income) * 100 : 0,
    };
  }, [transactions]);

  const spend = useMemo(() => {
    const grouped = new Map<string, number>();
    transactions
      .filter((item) => item.type === "Expense" && item.status === "Approved")
      .forEach((item) =>
        grouped.set(
          item.category,
          (grouped.get(item.category) ?? 0) + item.amount,
        ),
      );
    return [...grouped]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const filtered = transactions.filter((item) => {
    const matchesText = `${item.description} ${item.category} ${item.id}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return (
      matchesText &&
      (typeFilter === "All" ||
        item.type === typeFilter ||
        item.status === typeFilter)
    );
  });

  const exportCsv = () => {
    const rows = [
      [
        "Reference",
        "Date",
        "Description",
        "Category",
        "Type",
        "Amount",
        "Status",
      ],
      ...filtered.map((item) => [
        item.id,
        item.date,
        item.description,
        item.category,
        item.type,
        item.amount,
        item.status,
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")],
      { type: "text/csv" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "finance-transactions.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Transaction report exported");
  };

  const approve = async (id: string) => {
    if (hasDatabase) {
      const record = transactions.find((item) => item.id === id) as
        (Transaction & { databaseId?: string }) | undefined;
      const { error } = await createClient()
        .from("finance_transactions")
        .update({
          status: "APPROVED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", record?.databaseId ?? "");
      if (error) return toast.error("Approval could not be saved");
    }
    setTransactions((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status: "Approved" } : item,
      ),
    );
    toast.success(`${id} approved and added to the books`);
  };

  const saveTransaction = async (item: Transaction) => {
    if (hasDatabase) {
      const supabase = createClient();
      const { data: category, error: categoryError } = await supabase
        .from("finance_categories")
        .select("id")
        .eq("name", item.category)
        .single();
      if (categoryError || !category) {
        toast.error("Transaction category is not configured");
        return;
      }
      const { data, error } = await supabase
        .from("finance_transactions")
        .insert({
          reference: item.id,
          transaction_date: item.date,
          transaction_type: item.type.toUpperCase(),
          category_id: category.id,
          description: item.description,
          amount: item.amount,
          status: "PENDING",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) {
        toast.error("Transaction could not be saved");
        return;
      }
      item = Object.assign(item, { databaseId: data.id });
    }
    setTransactions((items) => [item, ...items]);
    setShowEntry(false);
    toast.success("Transaction submitted for approval");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Finance workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Accounting & audit</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Track daily money movement, payroll costs, profitability, and
            financial controls.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-950"
          >
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => setShowEntry(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Add transaction
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {(
          [
            "Overview",
            "Transactions",
            "Budgets",
            "Reports",
            "Audit trail",
          ] as FinanceTab[]
        ).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === item ? "border-emerald-700 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <Overview
          totals={totals}
          spend={spend}
          transactions={transactions}
          approve={approve}
          viewTransaction={setSelectedTransaction}
        />
      )}
      {tab === "Transactions" && (
        <Transactions
          items={filtered}
          query={query}
          setQuery={setQuery}
          filter={typeFilter}
          setFilter={setTypeFilter}
          approve={approve}
          viewTransaction={setSelectedTransaction}
        />
      )}
      {tab === "Budgets" && (
        <Budgets
          user={user}
          transactions={transactions}
          hasDatabase={hasDatabase}
        />
      )}
      {tab === "Reports" && <FinanceReports transactions={transactions} />}
      {tab === "Audit trail" && (
        <AuditTrail user={user} transactions={transactions} />
      )}
      {showEntry && (
        <TransactionModal
          user={user}
          close={() => setShowEntry(false)}
          save={saveTransaction}
        />
      )}
      {selectedTransaction && (
        <TransactionDetails
          transaction={selectedTransaction}
          close={() => setSelectedTransaction(null)}
          approve={async (id) => {
            await approve(id);
            setSelectedTransaction((item) =>
              item ? { ...item, status: "Approved" } : item,
            );
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-zinc-950">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="mt-2 text-xl font-semibold">{value}</p>
        </div>
        <span className={`grid size-9 place-items-center rounded-lg ${tone}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

function Overview({
  totals,
  spend,
  transactions,
  approve,
  viewTransaction,
}: {
  totals: { income: number; expense: number; profit: number; margin: number };
  spend: { name: string; value: number }[];
  transactions: Transaction[];
  approve: (id: string) => void;
  viewTransaction: (item: Transaction) => void;
}) {
  const pending = transactions.filter((item) => item.status === "Pending");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Income this month"
          value={money(totals.income)}
          note="8.4% above last month"
          icon={ArrowUpRight}
          tone="bg-emerald-50 text-emerald-700"
        />
        <Stat
          label="Total expenses"
          value={money(totals.expense)}
          note="Includes payroll and operating costs"
          icon={ArrowDownRight}
          tone="bg-rose-50 text-rose-700"
        />
        <Stat
          label="Net profit"
          value={money(totals.profit)}
          note={`${totals.margin.toFixed(1)}% net margin`}
          icon={TrendingUp}
          tone="bg-blue-50 text-blue-700"
        />
        <Stat
          label="Cash balance"
          value={money(12480000)}
          note="Across 3 tracked accounts"
          icon={Landmark}
          tone="bg-amber-50 text-amber-700"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Panel
          title="Cash flow"
          subtitle="Income and expenses, last six months"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlow}>
                <defs>
                  <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="1" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₦${v}m`}
                />
                <Tooltip formatter={(v) => [`₦${v}m`]} />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#059669"
                  fill="url(#income)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#dc2626"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Expense breakdown"
          subtitle="Where the money went this month"
        >
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={spend}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                >
                  {spend.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={spendColors[index % spendColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {spend.slice(0, 4).map((item, index) => (
              <div key={item.name} className="flex items-center text-xs">
                <span
                  className="mr-2 size-2 rounded-full"
                  style={{ background: spendColors[index] }}
                />
                <span className="text-zinc-500">{item.name}</span>
                <span className="ml-auto font-medium">{money(item.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Panel
          title="Recent transactions"
          subtitle="Latest entries across the business"
        >
          <TransactionTable
            items={transactions.slice(0, 5)}
            approve={approve}
            viewTransaction={viewTransaction}
          />
        </Panel>
        <Panel title="Attention needed" subtitle="Items that need review">
          <div className="space-y-3">
            <Alert
              icon={AlertTriangle}
              title="Software budget exceeded"
              copy="₦60,000 over the September limit"
              tone="text-red-600 bg-red-50"
            />
            <Alert
              icon={FileClock}
              title={`${pending.length} transaction awaiting approval`}
              copy="Review before month-end close"
              tone="text-amber-700 bg-amber-50"
            />
            <Alert
              icon={CheckCircle2}
              title="Bank reconciliation"
              copy="Matched through 23 September"
              tone="text-emerald-700 bg-emerald-50"
            />
          </div>
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 dark:bg-zinc-950">
      <div className="mb-5">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
function Alert({
  icon: Icon,
  title,
  copy,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  copy: string;
  tone: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}
      >
        <Icon size={17} />
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{copy}</p>
      </div>
    </div>
  );
}

function Transactions({
  items,
  query,
  setQuery,
  filter,
  setFilter,
  approve,
  viewTransaction,
}: {
  items: Transaction[];
  query: string;
  setQuery: (v: string) => void;
  filter: string;
  setFilter: (v: string) => void;
  approve: (id: string) => void;
  viewTransaction: (item: Transaction) => void;
}) {
  return (
    <Panel
      title="Transaction ledger"
      subtitle="Search, review, and approve all money movements"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-lg border px-3">
          <Search size={16} className="text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            placeholder="Search description, category, or reference"
          />
        </label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-900"
        >
          <option>All</option>
          <option>Income</option>
          <option>Expense</option>
          <option>Pending</option>
        </select>
      </div>
      <TransactionTable
        items={items}
        approve={approve}
        viewTransaction={viewTransaction}
      />
    </Panel>
  );
}

function TransactionTable({
  items,
  approve,
  viewTransaction,
}: {
  items: Transaction[];
  approve: (id: string) => void;
  viewTransaction: (item: Transaction) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-zinc-500">
            <th className="pb-3 font-medium">Date / reference</th>
            <th className="pb-3 font-medium">Description</th>
            <th className="pb-3 font-medium">Category</th>
            <th className="pb-3 font-medium">Amount</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-3">
                <p>
                  {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                    "en-NG",
                    { day: "2-digit", month: "short" },
                  )}
                </p>
                <p className="text-xs text-zinc-400">{item.id}</p>
              </td>
              <td className="py-3 font-medium">{item.description}</td>
              <td className="py-3 text-zinc-500">{item.category}</td>
              <td
                className={`py-3 font-medium ${item.type === "Income" ? "text-emerald-700" : "text-red-600"}`}
              >
                {item.type === "Income" ? "+" : "-"}
                {money(item.amount)}
              </td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2 py-1 text-xs ${item.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {item.status}
                </span>
              </td>
              <td className="py-3 text-right">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => viewTransaction(item)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-emerald-700"
                  >
                    <Eye size={14} /> View
                  </button>
                  {item.status === "Pending" && (
                    <button
                      onClick={() => approve(item.id)}
                      className="text-xs font-medium text-emerald-700"
                    >
                      Approve
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">
          No matching transactions.
        </p>
      )}
    </div>
  );
}

type BudgetCategory = { id: string; name: string };
type BudgetRecord = {
  id: string;
  category_id: string;
  period: string;
  amount: number;
};

function Budgets({
  user,
  transactions,
  hasDatabase,
}: {
  user: AppUser;
  transactions: Transaction[];
  hasDatabase: boolean;
}) {
  const canManage = user.role === "SUPER_ADMIN" || user.role === "HR_MANAGER";
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [budgetRows, setBudgetRows] = useState<BudgetRecord[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!hasDatabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const client = createClient();
    const [categoryResult, budgetResult] = await Promise.all([
      client
        .from("finance_categories")
        .select("id,name")
        .eq("transaction_type", "EXPENSE")
        .order("name"),
      client
        .from("finance_budgets")
        .select("id,category_id,period,amount")
        .eq("period", `${period}-01`)
        .order("created_at"),
    ]);
    const error = categoryResult.error ?? budgetResult.error;
    if (error) {
      toast.error(`Could not load budgets: ${error.message}`);
    } else {
      setCategories((categoryResult.data ?? []) as BudgetCategory[]);
      setBudgetRows(
        (budgetResult.data ?? []).map((row) => ({
          ...row,
          amount: Number(row.amount),
        })) as BudgetRecord[],
      );
    }
    setLoading(false);
  }, [hasDatabase, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveBudget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(amount);
    if (!categoryId || !Number.isFinite(value) || value < 0) {
      toast.error("Choose a category and enter a valid budget amount");
      return;
    }
    setSaving(true);
    const { error } = await createClient()
      .from("finance_budgets")
      .upsert(
        {
          category_id: categoryId,
          period: `${period}-01`,
          amount: value,
          created_by: user.id,
        },
        { onConflict: "category_id,period" },
      );
    if (error) {
      toast.error(`Budget could not be saved: ${error.message}`);
    } else {
      toast.success("Budget saved");
      setAmount("");
      await load();
    }
    setSaving(false);
  };

  const actualByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.type === "Expense" &&
      transaction.status === "Approved" &&
      transaction.date.startsWith(period)
    ) {
      actualByCategory.set(
        transaction.category,
        (actualByCategory.get(transaction.category) ?? 0) + transaction.amount,
      );
    }
  }

  const chartData = budgetRows.map((budget) => {
    const category = categories.find((item) => item.id === budget.category_id);
    const categoryName = category?.name ?? "Uncategorized";
    return {
      category: categoryName,
      budget: budget.amount,
      actual: actualByCategory.get(categoryName) ?? 0,
    };
  });

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-3 rounded-lg border bg-white p-4 dark:bg-zinc-950 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-semibold">Monthly budgets</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Set expense limits by category and compare them with approved spending.
          </p>
        </div>
        <label className="text-xs font-medium">
          Budget month
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="input mt-1"
          />
        </label>
      </section>

      {!hasDatabase ? (
        <p className="rounded-lg border p-5 text-sm text-zinc-500">
          Connect Supabase to create and view saved budgets.
        </p>
      ) : (
        <>
          {canManage && (
            <Panel
              title="Set a budget"
              subtitle="One amount per expense category and month"
            >
              <form
                onSubmit={(event) => void saveBudget(event)}
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <label className="text-xs font-medium">
                  Expense category
                  <select
                    required
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    className="input mt-1"
                  >
                    <option value="">Choose a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium">
                  Amount
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="input mt-1"
                    placeholder="Enter amount in NGN"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || loading || categories.length === 0}
                  className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save budget"}
                </button>
              </form>
            </Panel>
          )}
          {!canManage && user.role === "MANAGER" && (
            <p className="rounded-lg border p-3 text-sm text-zinc-500">
              You can review budgets; only HR Managers and Super Admins can set them.
            </p>
          )}

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Budget vs actual" subtitle={period}>
              {loading ? (
                <p className="py-12 text-center text-sm text-zinc-500">
                  Loading budgets…
                </p>
              ) : chartData.length === 0 ? (
                <p className="py-12 text-center text-sm text-zinc-500">
                  No budgets set for this month yet.
                </p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => `₦${Number(value) / 1000000}m`}
                      />
                      <YAxis
                        type="category"
                        dataKey="category"
                        width={95}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Bar dataKey="budget" fill="#d4d4d8" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="actual" fill="#059669" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel
              title="Budget health"
              subtitle="Approved spend for selected month"
            >
              {loading ? (
                <p className="text-sm text-zinc-500">Loading budgets…</p>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No budget figures to compare.
                </p>
              ) : (
                <div className="space-y-4">
                  {chartData.map((item) => {
                    const pct = item.budget
                      ? Math.round((item.actual / item.budget) * 100)
                      : 0;
                    return (
                      <div key={item.category}>
                        <div className="flex justify-between gap-3 text-xs">
                          <span className="font-medium">{item.category}</span>
                          <span
                            className={
                              pct > 100 ? "text-red-600" : "text-zinc-500"
                            }
                          >
                            {pct}% used
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 90 ? "bg-amber-500" : "bg-emerald-600"}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {money(item.actual)} of {money(item.budget)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Reports({
  totals,
}: {
  totals: { income: number; expense: number; profit: number; margin: number };
}) {
  const reports = [
    {
      title: "Profit & loss",
      copy: "Income, expenses, and net earnings",
      icon: TrendingUp,
    },
    {
      title: "Cash flow statement",
      copy: "Operating cash movements by period",
      icon: Banknote,
    },
    {
      title: "Expense by category",
      copy: "Cost concentration and trends",
      icon: TrendingDown,
    },
    {
      title: "Payroll cost report",
      copy: "Salary and workforce expenditure",
      icon: WalletCards,
    },
    {
      title: "General ledger",
      copy: "Complete debit and credit history",
      icon: Landmark,
    },
    {
      title: "Audit activity",
      copy: "User actions and record changes",
      icon: FileClock,
    },
  ];
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {reports.map(({ title, copy, icon: Icon }) => (
          <button
            key={title}
            onClick={() => toast.info(`${title} report is ready to export`)}
            className="rounded-lg border bg-white p-5 text-left hover:border-emerald-600 dark:bg-zinc-950"
          >
            <Icon size={20} className="text-emerald-700" />
            <h3 className="mt-4 font-medium">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500">{copy}</p>
            <p className="mt-4 text-xs font-medium text-emerald-700">
              Open report
            </p>
          </button>
        ))}
      </div>
      <Panel title="September profit & loss" subtitle="Management summary">
        <div className="mx-auto max-w-2xl space-y-3 text-sm">
          <ReportLine label="Revenue" value={totals.income} />
          <ReportLine label="Operating expenses" value={-totals.expense} />
          <div className="border-t pt-3">
            <ReportLine label="Net profit" value={totals.profit} strong />
          </div>
          <ReportLine label="Net profit margin" value={totals.margin} percent />
        </div>
      </Panel>
    </>
  );
}
function ReportLine({
  label,
  value,
  strong,
  percent,
}: {
  label: string;
  value: number;
  strong?: boolean;
  percent?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "text-base font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}
    >
      <span>{label}</span>
      <span>{percent ? `${value.toFixed(1)}%` : money(value)}</span>
    </div>
  );
}

function AuditTrail({
  user,
  transactions,
}: {
  user: AppUser;
  transactions: Transaction[];
}) {
  const actions = transactions.slice(0, 6).map((item, index) => ({
    user: item.enteredBy,
    action:
      index === 0
        ? "Created transaction"
        : item.status === "Pending"
          ? "Submitted for approval"
          : "Posted transaction",
    record: `${item.id} · ${item.description}`,
    time: `${index + 1}h ago`,
  }));
  return (
    <Panel
      title="Audit trail"
      subtitle="A permanent record of changes to the books"
    >
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        Financial events record the actor, timestamp, previous values, and new
        values. Entries cannot be edited from this screen.
      </div>
      <div className="divide-y">
        {actions.map((item, index) => (
          <div key={`${item.record}-${index}`} className="flex gap-3 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold">
              {item.user
                .split(" ")
                .map((v) => v[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div>
              <p className="text-sm">
                <span className="font-medium">{item.user}</span>{" "}
                {item.action.toLowerCase()}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{item.record}</p>
            </div>
            <time className="ml-auto text-xs text-zinc-400">{item.time}</time>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-400">
        Viewing as {user.name} · {user.role.replaceAll("_", " ")}
      </p>
    </Panel>
  );
}

function TransactionDetails({
  transaction,
  close,
  approve,
}: {
  transaction: Transaction;
  close: () => void;
  approve: (id: string) => void | Promise<void>;
}) {
  const incoming = transaction.type === "Income";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={close}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-xl rounded-lg bg-white shadow-2xl dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <p className="text-xs font-medium uppercase text-zinc-400">
              Transaction details
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {transaction.description}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{transaction.id}</p>
          </div>
          <button onClick={close} aria-label="Close transaction">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <div
            className={`rounded-lg p-5 ${incoming ? "bg-emerald-50 dark:bg-emerald-950" : "bg-red-50 dark:bg-red-950"}`}
          >
            <p
              className={`text-xs font-semibold uppercase ${incoming ? "text-emerald-700" : "text-red-600"}`}
            >
              {incoming ? "Money received" : "Money paid out"}
            </p>
            <p
              className={`mt-2 text-3xl font-semibold ${incoming ? "text-emerald-700" : "text-red-600"}`}
            >
              {incoming ? "+" : "-"}
              {money(transaction.amount)}
            </p>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
            <div>
              <dt className="text-xs text-zinc-400">Transaction date</dt>
              <dd className="mt-1 font-medium">
                {new Date(`${transaction.date}T12:00:00`).toLocaleDateString(
                  "en-NG",
                  { day: "2-digit", month: "long", year: "numeric" },
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Status</dt>
              <dd className="mt-1">
                <span
                  className={`rounded-full px-2 py-1 text-xs ${transaction.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {transaction.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Category</dt>
              <dd className="mt-1 font-medium">{transaction.category}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">Transaction type</dt>
              <dd
                className={`mt-1 font-medium ${incoming ? "text-emerald-700" : "text-red-600"}`}
              >
                {transaction.type}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400">Entered by</dt>
              <dd className="mt-1 font-medium">{transaction.enteredBy}</dd>
            </div>
          </dl>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button
            onClick={close}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Close
          </button>
          {transaction.status === "Pending" && (
            <button
              onClick={() => void approve(transaction.id)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              Approve transaction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TransactionModal({
  user,
  close,
  save,
}: {
  user: AppUser;
  close: () => void;
  save: (item: Transaction) => void | Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>("Expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Salaries");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!description.trim() || !numeric || numeric <= 0)
      return toast.error("Add a description and valid amount");
    void save({
      id: `TX-${Date.now().toString().slice(-8)}`,
      date: new Date().toISOString().slice(0, 10),
      description: description.trim(),
      category,
      type,
      amount: numeric,
      status: "Pending",
      enteredBy: user.name,
    });
  };
  const categories =
    type === "Income"
      ? ["Service revenue", "Product sales", "Other income"]
      : [
          "Salaries",
          "Rent & facilities",
          "Software & IT",
          "Marketing",
          "Training",
          "Travel",
          "Utilities",
          "Other expense",
        ];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl dark:bg-zinc-950"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add transaction</h2>
            <p className="mt-1 text-xs text-zinc-500">
              New entries are submitted for approval.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {(["Expense", "Income"] as TransactionType[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => {
                setType(item);
                setCategory(item === "Income" ? "Service revenue" : "Salaries");
              }}
              className={`rounded-md py-2 text-sm ${type === item ? "bg-white font-medium shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Amount (NGN)
            <input
              className="input mt-1.5"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="text-xs font-medium">
            Date
            <input
              className="input mt-1.5"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="text-xs font-medium sm:col-span-2">
            Description
            <input
              className="input mt-1.5"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this transaction for?"
            />
          </label>
          <label className="text-xs font-medium sm:col-span-2">
            Category
            <select
              className="input mt-1.5"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
            Submit transaction
          </button>
        </div>
      </form>
    </div>
  );
}
