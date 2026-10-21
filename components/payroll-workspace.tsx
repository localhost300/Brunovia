"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  calculatePayroll,
  canTransitionPayroll,
  payrollVariance,
} from "@/lib/payroll/calculations";

type PayRun = {
  id: string;
  period: string;
  payment_date: string;
  status: string;
  employee_count: number;
  gross_total: number;
  deduction_total: number;
  net_total: number;
  prepared_by: string | null;
  approved_by: string | null;
  locked_at: string | null;
};
type PayrollRow = {
  id: string;
  employee_id: string;
  period: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  bonuses: number;
  overtime: number;
  tax: number;
  pension: number;
  penalty_fee: number;
  unpaid_leave_deduction: number;
  calculation_inputs: {
    missed_clock_out_days?: number;
    missed_clock_out_deduction?: number;
  } | null;
  net_pay: number;
  payslip_path: string | null;
  employees?: {
    employee_id: string;
    first_name: string;
    last_name: string;
  } | null;
  payroll_compensation_profiles?: {
    bank_name: string | null;
    bank_account_number: string | null;
  } | null;
};

const currentPeriod = new Date().toISOString().slice(0, 7) + "-01";
const demoCalculation = calculatePayroll({
  basicSalary: 420_000,
  allowances: 45_000,
  overtimeHours: 4,
  overtimeRate: 4_500,
  taxRate: 0.075,
  pensionRate: 0.08,
  otherDeductions: 2_500,
});
const demoRun: PayRun = {
  id: "demo-run",
  period: currentPeriod,
  payment_date: `${currentPeriod.slice(0, 7)}-16`,
  status: "DRAFT",
  employee_count: 2,
  gross_total: demoCalculation.grossPay + 350_000,
  deduction_total: demoCalculation.totalDeductions + 50_000,
  net_total: demoCalculation.netPay + 300_000,
  prepared_by: null,
  approved_by: null,
  locked_at: null,
};
const demoRows: PayrollRow[] = [
  {
    id: "demo-payroll",
    employee_id: "demo-1",
    period: currentPeriod,
    basic_salary: demoCalculation.basicSalary,
    allowances: demoCalculation.allowances,
    deductions:
      demoCalculation.otherDeductions + demoCalculation.unpaidLeaveDeduction,
    bonuses: demoCalculation.bonuses,
    overtime: demoCalculation.overtime,
    tax: demoCalculation.tax,
    pension: demoCalculation.pension,
    penalty_fee: 0,
    unpaid_leave_deduction: 0,
    calculation_inputs: null,
    net_pay: demoCalculation.netPay,
    payslip_path: null,
    employees: {
      employee_id: "PF-1001",
      first_name: "Amara",
      last_name: "Okafor",
    },
    payroll_compensation_profiles: {
      bank_name: "Example Bank",
      bank_account_number: "0123456789",
    },
  },
];
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value);
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());

export function PayrollWorkspace() {
  const configured = hasSupabaseConfig();
  const [period, setPeriod] = useState(currentPeriod);
  const [run, setRun] = useState<PayRun | null>(configured ? null : demoRun);
  const [rows, setRows] = useState<PayrollRow[]>(configured ? [] : demoRows);
  const [previousNet, setPreviousNet] = useState(0);
  const [loading, setLoading] = useState(configured);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [adjusting, setAdjusting] = useState<PayrollRow | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const client = createClient();
      const start = period.slice(0, 7) + "-01";
      const [runResult, payrollResult, previousResult, profileResult] =
        await Promise.all([
          client
            .from("pay_runs")
            .select(
              "id,period,payment_date,status,employee_count,gross_total,deduction_total,net_total,prepared_by,approved_by,locked_at",
            )
            .eq("period", start)
            .maybeSingle(),
          client
            .from("payroll")
            .select(
              "id,employee_id,period,basic_salary,allowances,deductions,bonuses,overtime,tax,pension,penalty_fee,unpaid_leave_deduction,calculation_inputs,net_pay,payslip_path,employees(employee_id,first_name,last_name)",
            )
            .eq("period", start)
            .order("created_at"),
          client
            .from("pay_runs")
            .select("net_total")
            .lt("period", start)
            .order("period", { ascending: false })
            .limit(1)
            .maybeSingle(),
          client
            .from("payroll_compensation_profiles")
            .select("employee_id,bank_name,bank_account_number")
            .is("effective_to", null),
        ]);
      if (runResult.error) throw runResult.error;
      if (payrollResult.error) throw payrollResult.error;
      setRun(runResult.data as PayRun | null);
      if (profileResult.error) throw profileResult.error;
      const profiles = new Map(
        (profileResult.data ?? []).map((profile) => [
          profile.employee_id,
          {
            bank_name: profile.bank_name,
            bank_account_number: profile.bank_account_number,
          },
        ]),
      );
      setRows(
        (payrollResult.data ?? []).map((row) => ({
          ...row,
          payroll_compensation_profiles: profiles.get(row.employee_id) ?? null,
        })) as unknown as PayrollRow[],
      );
      setPreviousNet(Number(previousResult.data?.net_total ?? 0));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load payroll",
      );
    } finally {
      setLoading(false);
    }
  }, [configured, period]);
  useEffect(() => {
    void load();
  }, [load]);
  const variance = payrollVariance(Number(run?.net_total ?? 0), previousNet);
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          gross:
            sum.gross +
            Number(row.basic_salary) +
            Number(row.allowances) +
            Number(row.bonuses) +
            Number(row.overtime),
          deductions:
            sum.deductions +
            Number(row.deductions) +
            Number(row.tax) +
            Number(row.pension) +
            Number(row.penalty_fee),
          net: sum.net + Number(row.net_pay),
        }),
        { gross: 0, deductions: 0, net: 0 },
      ),
    [rows],
  );

  const createRun = async (paymentDate: string) => {
    setWorking(true);
    try {
      if (configured) {
        const { error: rpcError } = await createClient().rpc(
          "calculate_payroll_run",
          { p_period: period, p_payment_date: paymentDate },
        );
        if (rpcError) throw rpcError;
        await load();
      } else setRun({ ...demoRun, period, payment_date: paymentDate });
      setCreating(false);
      toast.success(
        "Payroll calculated from compensation, attendance, and approved leave",
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Unable to calculate payroll",
      );
    } finally {
      setWorking(false);
    }
  };
  const transition = async (next: string, reason?: string) => {
    if (!run || !canTransitionPayroll(run.status, next))
      return toast.error("That payroll transition is not allowed");
    setWorking(true);
    try {
      if (configured) {
        const { error: rpcError } = await createClient().rpc(
          "transition_pay_run",
          { p_pay_run_id: run.id, p_status: next, p_reason: reason ?? null },
        );
        if (rpcError) throw rpcError;
        await load();
      } else
        setRun({
          ...run,
          status: next,
          locked_at:
            next === "LOCKED" ? new Date().toISOString() : run.locked_at,
        });
      toast.success(`Payroll moved to ${label(next)}`);
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Unable to change payroll status",
      );
    } finally {
      setWorking(false);
    }
  };
  const bankExport = () => {
    if (!run || !["LOCKED", "PAID"].includes(run.status))
      return toast.error("Lock payroll before exporting payment instructions");
    const lines = [
      [
        "Employee ID",
        "Employee",
        "Bank",
        "Account number",
        "Amount",
        "Reference",
      ],
      ...rows.map((row) => [
        row.employees?.employee_id ?? "",
        `${row.employees?.first_name ?? ""} ${row.employees?.last_name ?? ""}`.trim(),
        row.payroll_compensation_profiles?.bank_name ?? "",
        row.payroll_compensation_profiles?.bank_account_number ?? "",
        Number(row.net_pay).toFixed(2),
        `PAY-${period.slice(0, 7)}-${row.employees?.employee_id ?? row.employee_id}`,
      ]),
    ];
    const csv = lines
      .map((line) =>
        line
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `bank-payments-${period.slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Authorized bank-payment file exported");
  };
  const payslip = async (row: PayrollRow) => {
    const { jsPDF } = await import("jspdf");
    const document = new jsPDF();
    const name =
      `${row.employees?.first_name ?? ""} ${row.employees?.last_name ?? ""}`.trim();
    document.setFontSize(18);
    document.text("Brunovia Payslip", 20, 22);
    document.setFontSize(10);
    document.text(`${name} · ${row.employees?.employee_id ?? ""}`, 20, 34);
    document.text(`Period: ${period.slice(0, 7)}`, 20, 42);
    [
      ["Basic salary", row.basic_salary],
      ["Allowances", row.allowances],
      ["Bonuses", row.bonuses],
      ["Overtime", row.overtime],
      ["Tax", -row.tax],
      ["Pension", -row.pension],
      ["Other deductions", -(Number(row.deductions) + Number(row.penalty_fee))],
      ["Net pay", row.net_pay],
    ].forEach(([title, value], index) =>
      document.text(`${title}: ${money(Number(value))}`, 20, 58 + index * 9),
    );
    document.text("Confidential · Generated by Brunovia", 20, 140);
    document.save(
      `payslip-${row.employees?.employee_id ?? row.employee_id}-${period.slice(0, 7)}.pdf`,
    );
  };

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Calculated, approved, locked, and auditable pay runs.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Pay period
            <input
              type="month"
              value={period.slice(0, 7)}
              onChange={(e) => setPeriod(`${e.target.value}-01`)}
              className="input mt-1"
            />
          </label>
          <button
            onClick={() => void load()}
            aria-label="Refresh payroll"
            className="rounded-lg border p-2"
          >
            <RefreshCw size={17} />
          </button>
          {!run && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} />
              Create pay run
            </button>
          )}
        </div>
      </div>
      {!configured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Demo mode: payroll actions are temporary and no payment instructions
          are sent.
        </div>
      )}
      {loading ? (
        <div className="grid min-h-72 place-items-center">
          <Loader2 className="animate-spin text-emerald-700" />
        </div>
      ) : error ? (
        <p className="rounded-xl border bg-white py-14 text-center text-sm text-red-600">
          {error}
        </p>
      ) : !run ? (
        <section className="rounded-xl border bg-white py-16 text-center dark:bg-zinc-950">
          <FileText className="mx-auto text-zinc-300" />
          <p className="mt-3 font-medium">No payroll for this period</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create a run to synchronize compensation, attendance, and leave.
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Gross payroll", money(Number(run.gross_total || totals.gross))],
              [
                "Deductions",
                money(Number(run.deduction_total || totals.deductions)),
              ],
              ["Net payroll", money(Number(run.net_total || totals.net))],
              [
                "Period variance",
                previousNet
                  ? `${variance.amount >= 0 ? "+" : ""}${money(variance.amount)} (${variance.percentage}%)`
                  : "No prior period",
              ],
            ].map(([title, value]) => (
              <section
                key={title}
                className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
              >
                <p className="text-sm text-zinc-500">{title}</p>
                <p className="mt-2 text-xl font-semibold">{value}</p>
              </section>
            ))}
          </div>
          <section className="mt-5 rounded-xl border bg-white p-5 dark:bg-zinc-950">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="font-semibold">Approval workflow</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Draft → Awaiting approval → Approved → Locked → Paid
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {label(run.status)}
                </span>
                {run.status === "DRAFT" && (
                  <button
                    disabled={working}
                    onClick={() => void transition("AWAITING_APPROVAL")}
                    className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white"
                  >
                    Submit
                  </button>
                )}
                {run.status === "AWAITING_APPROVAL" && (
                  <>
                    <button
                      disabled={working}
                      onClick={() => void transition("DRAFT")}
                      className="rounded-lg border px-3 py-2 text-xs"
                    >
                      Return to draft
                    </button>
                    <button
                      disabled={working}
                      onClick={() => void transition("APPROVED")}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white"
                    >
                      Approve
                    </button>
                  </>
                )}
                {run.status === "APPROVED" && (
                  <button
                    disabled={working}
                    onClick={() => void transition("LOCKED")}
                    className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white"
                  >
                    <LockKeyhole size={14} />
                    Lock payroll
                  </button>
                )}
                {run.status === "LOCKED" && (
                  <button
                    disabled={working}
                    onClick={() => void transition("PAID")}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs text-white"
                  >
                    Mark paid
                  </button>
                )}
                <button
                  onClick={bankExport}
                  className="rounded-lg border px-3 py-2 text-xs"
                >
                  <Download className="mr-1 inline" size={14} />
                  Bank CSV
                </button>
              </div>
            </div>
          </section>
          <section className="mt-5 rounded-xl border bg-white p-5 dark:bg-zinc-950">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Payroll register</h2>
                <p className="text-xs text-zinc-500">
                  {rows.length} employees · sensitive payment details are masked
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="text-zinc-400">
                  <tr>
                    {[
                      "Employee",
                      "Basic",
                      "Allowances",
                      "Overtime",
                      "Tax",
                      "Pension",
                      "Salary deductions",
                      "Net pay",
                      "Actions",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="border-b px-3 py-3 font-medium"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <p className="font-medium">
                          {row.employees?.first_name} {row.employees?.last_name}
                        </p>
                        <p className="text-zinc-400">
                          {row.employees?.employee_id} ·{" "}
                          {row.payroll_compensation_profiles?.bank_name ??
                            "Bank pending"}{" "}
                          · ••••
                          {row.payroll_compensation_profiles?.bank_account_number?.slice(
                            -4,
                          ) ?? "----"}
                        </p>
                        {Number(
                          row.calculation_inputs?.missed_clock_out_days ?? 0,
                        ) > 0 && (
                          <p className="mt-1 text-[11px] text-red-600">
                            {Number(
                              row.calculation_inputs?.missed_clock_out_days,
                            )} missed clock-out
                            {Number(
                              row.calculation_inputs?.missed_clock_out_days,
                            ) === 1
                              ? ""
                              : "s"}{" "}
                            · {money(Number(row.calculation_inputs?.missed_clock_out_deduction ?? 0))} deducted
                          </p>
                        )}
                      </td>
                      {[
                        row.basic_salary,
                        row.allowances,
                        row.overtime,
                        row.tax,
                        row.pension,
                        Number(row.deductions) + Number(row.penalty_fee),
                        row.net_pay,
                      ].map((value, index) => (
                        <td
                          key={index}
                          className={`px-3 tabular-nums ${index >= 3 && index <= 5 ? "text-red-600" : index === 6 ? "font-semibold text-emerald-700" : ""}`}
                        >
                          {money(Number(value))}
                        </td>
                      ))}
                      <td className="px-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => void payslip(row)}
                            className="rounded border px-2 py-1"
                          >
                            Payslip
                          </button>
                          {run.status === "DRAFT" && (
                            <button
                              onClick={() => setAdjusting(row)}
                              className="rounded border px-2 py-1 text-red-600"
                            >
                              Adjust
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {creating && (
        <CreateRunDialog
          period={period}
          working={working}
          onClose={() => setCreating(false)}
          onCreate={createRun}
        />
      )}{" "}
      {adjusting && (
        <AdjustmentDialog
          row={adjusting}
          configured={configured}
          onClose={() => setAdjusting(null)}
          onSaved={async () => {
            setAdjusting(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={close}
    >
      <section
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-950"
      >
        <div className="mb-5 flex justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function CreateRunDialog({
  period,
  working,
  onClose,
  onCreate,
}: {
  period: string;
  working: boolean;
  onClose: () => void;
  onCreate: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(`${period.slice(0, 7)}-16`);
  return (
    <Modal title="Create payroll" close={onClose}>
      <p className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
        This snapshots active compensation profiles and synchronizes attendance,
        overtime, approved unpaid leave, and payroll adjustments.
      </p>
      <label className="mt-4 block text-xs font-medium">
        Payment date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input mt-1.5"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          disabled={working || !date}
          onClick={() => void onCreate(date)}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {working ? "Calculating…" : "Calculate payroll"}
        </button>
      </div>
    </Modal>
  );
}
function AdjustmentDialog({
  row,
  configured,
  onClose,
  onSaved,
}: {
  row: PayrollRow;
  configured: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Add payroll adjustment" close={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (Number(amount) <= 0 || reason.trim().length < 5)
            return toast.error("Enter a positive amount and a clear reason");
          setSaving(true);
          try {
            if (configured) {
              const { data: auth } = await createClient().auth.getUser();
              const { error } = await createClient()
                .from("payroll_adjustments")
                .insert({
                  payroll_id: row.id,
                  employee_id: row.employee_id,
                  adjustment_type: "OTHER",
                  amount: Number(amount),
                  reason: reason.trim(),
                  created_by: auth.user?.id,
                });
              if (error) throw error;
            }
            toast.success(
              "Deduction saved and reflected in the payroll totals",
            );
            await onSaved();
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Unable to save adjustment",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-xs font-medium">
          Amount (NGN)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input mt-1.5"
          />
        </label>
        <label className="mt-4 block text-xs font-medium">
          Reason
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input mt-1.5 min-h-24"
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save adjustment
          </button>
        </div>
      </form>
    </Modal>
  );
}
