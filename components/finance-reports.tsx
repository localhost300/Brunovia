"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Download,
  FileClock,
  Landmark,
  Loader2,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import type { FinanceTransactionRow } from "@/components/finance-dashboard";

type ReportKind =
  | "Profit & loss"
  | "Expense detail"
  | "Income detail"
  | "Cash flow"
  | "Payroll costs"
  | "General ledger";
const currency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
const plainCurrency = (value: number) =>
  `NGN ${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(value)}`;
const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export function FinanceReports({
  transactions,
}: {
  transactions: FinanceTransactionRow[];
}) {
  const [kind, setKind] = useState<ReportKind>("Profit & loss");
  const [from, setFrom] = useState("2026-09-01");
  const [to, setTo] = useState("2026-09-30");
  const [downloading, setDownloading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const filtered = useMemo(
    () =>
      transactions.filter(
        (item) =>
          item.date >= from && item.date <= to && item.status === "Approved",
      ),
    [transactions, from, to],
  );
  const income = filtered
    .filter((item) => item.type === "Income")
    .reduce((sum, item) => sum + item.amount, 0);
  const expenses = filtered
    .filter((item) => item.type === "Expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const profit = income - expenses;
  const reportRows = useMemo(() => {
    if (kind === "Expense detail")
      return filtered.filter((item) => item.type === "Expense");
    if (kind === "Income detail")
      return filtered.filter((item) => item.type === "Income");
    if (kind === "Payroll costs")
      return filtered.filter((item) => item.category === "Salaries");
    return filtered;
  }, [filtered, kind]);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = autoTableModule.default;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFillColor(4, 120, 87);
      doc.rect(0, 0, pageWidth, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("BRUNOVIA", 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("FINANCE & AUDIT", 14, 19);
      doc.setFontSize(9);
      doc.text("Management financial statement", pageWidth - 14, 14, {
        align: "right",
      });
      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text(kind, 14, 41);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(82, 82, 91);
      doc.text(
        `Reporting period: ${prettyDate(from)} to ${prettyDate(to)}`,
        14,
        48,
      );
      doc.text(
        `Generated: ${new Date().toLocaleString("en-NG")}`,
        pageWidth - 14,
        48,
        { align: "right" },
      );
      const metrics = [
        ["TOTAL INCOME", plainCurrency(income)],
        ["TOTAL EXPENSES", plainCurrency(expenses)],
        [
          profit >= 0 ? "NET PROFIT" : "NET LOSS",
          plainCurrency(Math.abs(profit)),
        ],
      ];
      metrics.forEach(([label, value], index) => {
        const x = 14 + index * 61;
        doc.setFillColor(247, 248, 247);
        doc.roundedRect(x, 55, 56, 20, 2, 2, "F");
        doc.setFontSize(7);
        doc.setTextColor(113, 113, 122);
        doc.text(label, x + 4, 62);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(
          index === 2 && profit < 0 ? 185 : 24,
          index === 2 && profit < 0 ? 28 : 24,
          index === 2 && profit < 0 ? 28 : 27,
        );
        doc.text(value, x + 4, 69);
        doc.setFont("helvetica", "normal");
      });
      autoTable(doc, {
        startY: 83,
        head: [
          ["Date", "Reference", "Description", "Category", "Type", "Amount"],
        ],
        body: reportRows.map((item) => [
          prettyDate(item.date),
          item.id,
          item.description,
          item.category,
          item.type,
          plainCurrency(item.amount),
        ]),
        theme: "grid",
        headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [39, 39, 42], cellPadding: 2.5 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 5: { halign: "right" } },
        margin: { left: 14, right: 14, bottom: 20 },
        didDrawPage: (data) => {
          const height = doc.internal.pageSize.getHeight();
          doc.setDrawColor(228, 228, 231);
          doc.line(14, height - 14, pageWidth - 14, height - 14);
          doc.setFontSize(7);
          doc.setTextColor(113, 113, 122);
          doc.text(
            "Brunovia Finance - Confidential management report",
            14,
            height - 9,
          );
          doc.text(`Page ${data.pageNumber}`, pageWidth - 14, height - 9, {
            align: "right",
          });
        },
      });
      const finalY =
        (doc as typeof doc & { lastAutoTable?: { finalY: number } })
          .lastAutoTable?.finalY ?? 100;
      if (finalY < 255) {
        doc.setFontSize(9);
        doc.setTextColor(82, 82, 91);
        doc.text("Report summary", 14, finalY + 10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(24, 24, 27);
        doc.text(
          `Income ${plainCurrency(income)}   |   Expenses ${plainCurrency(expenses)}   |   ${profit >= 0 ? "Profit" : "Loss"} ${plainCurrency(Math.abs(profit))}`,
          14,
          finalY + 17,
        );
      }
      doc.save(
        `Brunovia-${kind.toLowerCase().replaceAll(" ", "-")}-${from}-to-${to}.pdf`,
      );
      toast.success(`${kind} PDF downloaded`);
    } catch {
      toast.error("The PDF could not be generated");
    } finally {
      setDownloading(false);
    }
  };

  if (!reportOpen) {
    const cards: {
      title: ReportKind;
      copy: string;
      icon: React.ElementType;
    }[] = [
      {
        title: "Profit & loss",
        copy: "Income, expenses, and net earnings",
        icon: TrendingUp,
      },
      {
        title: "Cash flow",
        copy: "Operating cash movements by period",
        icon: Banknote,
      },
      {
        title: "Expense detail",
        copy: "Costs by date, category, and transaction",
        icon: TrendingDown,
      },
      {
        title: "Payroll costs",
        copy: "Salary and workforce expenditure",
        icon: WalletCards,
      },
      {
        title: "General ledger",
        copy: "Complete financial transaction history",
        icon: Landmark,
      },
      {
        title: "Income detail",
        copy: "Revenue entries and income sources",
        icon: FileClock,
      },
    ];
    return (
      <div
        className="gap-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gridTemplateRows: "repeat(3, auto)",
        }}
      >
        {cards.map(({ title, copy, icon: Icon }) => (
          <div
            key={title}
            className="min-w-0 rounded-lg border bg-white p-5 text-left dark:bg-zinc-950"
          >
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950">
              <Icon size={19} />
            </span>
            <h3 className="mt-4 font-medium">{title}</h3>
            <p className="mt-2 text-sm text-zinc-500">{copy}</p>
            <button
              onClick={() => {
                setKind(title);
                setReportOpen(true);
              }}
              className="mt-5 text-sm font-medium text-emerald-700"
            >
              Open report →
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <button
        onClick={() => setReportOpen(false)}
        className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft size={16} /> Back to reports
      </button>
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 dark:bg-zinc-950 lg:flex-row lg:items-end">
        <label className="text-xs font-medium">
          <span className="mb-1.5 flex items-center gap-1.5">
            <CalendarDays size={14} /> From
          </span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="input min-w-44"
          />
        </label>
        <label className="text-xs font-medium">
          <span className="mb-1.5 flex items-center gap-1.5">
            <CalendarDays size={14} /> To
          </span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
            className="input min-w-44"
          />
        </label>
        <button
          onClick={downloadPdf}
          disabled={downloading || !reportRows.length}
          className="ml-auto flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}{" "}
          Download PDF
        </button>
      </div>
      <article className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-zinc-950">
        <header className="flex flex-col gap-4 bg-emerald-800 px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold">BRUNOVIA</p>
            <p className="text-[10px] uppercase text-emerald-100">
              Finance & Audit
            </p>
          </div>
          <p className="text-sm">Management financial statement</p>
        </header>
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{kind}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {prettyDate(from)} to {prettyDate(to)}
              </p>
            </div>
            <p className="text-xs text-zinc-400">
              Prepared{" "}
              {new Date().toLocaleDateString("en-NG", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="my-5 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Total income"
              value={currency(income)}
              tone="income"
            />
            <Metric
              label="Total expenses"
              value={currency(expenses)}
              tone="expense"
            />
            <Metric
              label={profit >= 0 ? "Net profit" : "Net loss"}
              value={currency(Math.abs(profit))}
              tone={profit >= 0 ? "income" : "expense"}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900">
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Reference</th>
                  <th className="px-3 py-3 font-medium">Description</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="px-3 py-3">{prettyDate(item.date)}</td>
                    <td className="px-3 py-3 text-zinc-500">{item.id}</td>
                    <td className="px-3 py-3 font-medium">
                      {item.description}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">{item.category}</td>
                    <td
                      className={`px-3 py-3 font-medium ${item.type === "Income" ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {item.type}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium ${item.type === "Income" ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {item.type === "Income" ? "+" : "-"}
                      {currency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                  <td colSpan={5} className="px-3 py-3 text-right">
                    Net total
                  </td>
                  <td
                    className={`px-3 py-3 text-right ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {currency(profit)}
                  </td>
                </tr>
              </tfoot>
            </table>
            {!reportRows.length && (
              <p className="py-12 text-center text-sm text-zinc-500">
                No approved entries within this reporting period.
              </p>
            )}
          </div>
          <footer className="mt-8 flex justify-between border-t pt-4 text-[10px] text-zinc-400">
            <span>Brunovia Finance - Confidential</span>
            <span>Generated from approved ledger entries</span>
          </footer>
        </div>
      </article>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
}) {
  return (
    <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
      <p className="text-[10px] font-semibold uppercase text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-2 text-base font-semibold ${tone === "income" ? "text-emerald-700" : "text-red-600"}`}
      >
        {value}
      </p>
    </div>
  );
}
