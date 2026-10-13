"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { businessDaysBetween, dateKey } from "@/lib/workforce/rules";
import type { AppUser } from "@/types/database";

type EmployeeOption = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
};
type Policy = {
  id: string;
  name: string;
  annual_allowance: number;
  requires_document_after_days: number | null;
};
type LeaveRow = {
  id: string;
  employee_id: string;
  leave_policy_id: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  created_at: string;
  employees?: EmployeeOption | null;
  leave_policies?: { name: string } | null;
};

export function LeaveWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig();
  const canReview =
    user.role === "SUPER_ADMIN" ||
    user.role === "HR_MANAGER" ||
    user.role === "MANAGER";
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<LeaveRow | null>(null);

  const load = useCallback(async () => {
    if (!configured) {
      setError("Supabase is not configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = createClient();
      const [requestResult, employeeResult, policyResult] = await Promise.all([
        client
          .from("leave_requests")
          .select(
            "id,employee_id,leave_policy_id,leave_type,start_date,end_date,reason,status,created_at,employees!leave_requests_employee_id_fkey(id,employee_id,first_name,last_name),leave_policies(name)",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        client
          .from("employees")
          .select("id,employee_id,first_name,last_name")
          .is("deleted_at", null)
          .eq("status", "ACTIVE")
          .order("first_name"),
        client
          .from("leave_policies")
          .select("id,name,annual_allowance,requires_document_after_days")
          .eq("active", true)
          .order("name"),
      ]);
      if (requestResult.error) throw requestResult.error;
      if (employeeResult.error) throw employeeResult.error;
      if (policyResult.error) throw policyResult.error;
      setRequests((requestResult.data ?? []) as unknown as LeaveRow[]);
      setEmployees((employeeResult.data ?? []) as EmployeeOption[]);
      setPolicies((policyResult.data ?? []) as Policy[]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load leave requests",
      );
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const metrics = useMemo(
    () => ({
      pending: requests.filter((item) => item.status.startsWith("PENDING"))
        .length,
      approved: requests.filter((item) => item.status === "APPROVED").length,
      away: requests.filter(
        (item) =>
          item.status === "APPROVED" &&
          item.start_date <= dateKey(new Date()) &&
          item.end_date >= dateKey(new Date()),
      ).length,
    }),
    [requests],
  );

  const createRequest = async (input: {
    employee_id: string;
    leave_policy_id: string;
    start_date: string;
    end_date: string;
    reason: string;
  }) => {
    const days = businessDaysBetween(input.start_date, input.end_date);
    if (!input.employee_id || !input.leave_policy_id)
      throw new Error("Select an employee and leave type");
    if (days < 1)
      throw new Error("Select a valid date range containing a working day");
    if (input.reason.trim().length < 5)
      throw new Error("Provide a reason of at least 5 characters");
    const policy = policies.find((item) => item.id === input.leave_policy_id);
    if (!configured) throw new Error("Supabase is not configured");
    const { error: insertError } = await createClient()
      .from("leave_requests")
      .insert({
        ...input,
        leave_type: policy?.name ?? "Leave",
        status: "PENDING_MANAGER",
      });
    if (insertError) throw insertError;
    await load();
    toast.success(
      `${days} working day${days === 1 ? "" : "s"} submitted for approval`,
    );
    setCreating(false);
  };
  const decide = async (
    request: LeaveRow,
    decision: "APPROVE" | "REJECT",
    comment: string,
  ) => {
    if (decision === "REJECT" && comment.trim().length < 3)
      throw new Error("Add a reason for rejection");
    if (!configured) throw new Error("Supabase is not configured");
    const { error: rpcError } = await createClient().rpc(
      "review_leave_request",
      {
        p_request_id: request.id,
        p_decision: decision,
        p_comment: comment.trim() || null,
      },
    );
    if (rpcError) throw rpcError;
    await load();
    toast.success(
      decision === "REJECT"
        ? "Leave request rejected"
        : request.status === "PENDING_MANAGER"
          ? "Request advanced to HR approval"
          : "Leave request approved",
    );
    setReviewing(null);
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leave management</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Policy-aware requests with manager and HR approvals.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} />
          New request
        </button>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Pending approval", metrics.pending],
          ["Approved requests", metrics.approved],
          ["People away today", metrics.away],
        ].map(([label, value]) => (
          <section
            key={label}
            className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <h2 className="font-semibold">Recent requests</h2>
        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="animate-spin text-emerald-700" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-sm text-red-600">{error}</p>
        ) : requests.length === 0 ? (
          <div className="py-14 text-center">
            <CalendarDays className="mx-auto text-zinc-300" />
            <p className="mt-3 font-medium">No leave requests</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <article
                key={request.id}
                className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {request.employees?.first_name}{" "}
                    {request.employees?.last_name}
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      {request.employees?.employee_id}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {request.leave_policies?.name ?? request.leave_type} ·{" "}
                    {new Date(
                      `${request.start_date}T12:00:00`,
                    ).toLocaleDateString("en-NG")}
                    –
                    {new Date(
                      `${request.end_date}T12:00:00`,
                    ).toLocaleDateString("en-NG")}{" "}
                    ·{" "}
                    {businessDaysBetween(request.start_date, request.end_date)}{" "}
                    working days
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs ${request.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : request.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {request.status.replaceAll("_", " ").toLowerCase()}
                </span>
                {canReview && request.status.startsWith("PENDING") && (
                  <button
                    onClick={() => setReviewing(request)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                  >
                    Review
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {creating && (
        <LeaveForm
          employees={employees}
          policies={policies}
          onClose={() => setCreating(false)}
          onSave={createRequest}
        />
      )}{" "}
      {reviewing && (
        <ReviewDialog
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDecision={decide}
        />
      )}
    </>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-950"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function LeaveForm({
  employees,
  policies,
  onClose,
  onSave,
}: {
  employees: EmployeeOption[];
  policies: Policy[];
  onClose: () => void;
  onSave: (input: {
    employee_id: string;
    leave_policy_id: string;
    start_date: string;
    end_date: string;
    reason: string;
  }) => Promise<void>;
}) {
  const [input, setInput] = useState({
    employee_id: employees.length === 1 ? employees[0].id : "",
    leave_policy_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const days = businessDaysBetween(input.start_date, input.end_date);
  return (
    <Dialog title="Create leave request" onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave(input);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Unable to submit request",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Employee
            <select
              required
              value={input.employee_id}
              onChange={(e) =>
                setInput((v) => ({ ...v, employee_id: e.target.value }))
              }
              className="input mt-1.5"
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.first_name} {employee.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Leave type
            <select
              required
              value={input.leave_policy_id}
              onChange={(e) =>
                setInput((v) => ({ ...v, leave_policy_id: e.target.value }))
              }
              className="input mt-1.5"
            >
              <option value="">Select type</option>
              {policies.map((policy) => (
                <option value={policy.id} key={policy.id}>
                  {policy.name} · {policy.annual_allowance} days/year
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Start date
            <input
              required
              type="date"
              value={input.start_date}
              onChange={(e) =>
                setInput((v) => ({ ...v, start_date: e.target.value }))
              }
              className="input mt-1.5"
            />
          </label>
          <label className="text-xs font-medium">
            End date
            <input
              required
              type="date"
              min={input.start_date}
              value={input.end_date}
              onChange={(e) =>
                setInput((v) => ({ ...v, end_date: e.target.value }))
              }
              className="input mt-1.5"
            />
          </label>
        </div>
        <label className="mt-4 block text-xs font-medium">
          Reason
          <textarea
            required
            value={input.reason}
            onChange={(e) =>
              setInput((v) => ({ ...v, reason: e.target.value }))
            }
            className="input mt-1.5 min-h-24"
          />
        </label>
        <p className="mt-3 text-xs text-zinc-500">
          Calculated duration: {days} working day{days === 1 ? "" : "s"}.
        </p>
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
            {saving ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function ReviewDialog({
  request,
  onClose,
  onDecision,
}: {
  request: LeaveRow;
  onClose: () => void;
  onDecision: (
    request: LeaveRow,
    decision: "APPROVE" | "REJECT",
    comment: string,
  ) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const act = async (decision: "APPROVE" | "REJECT") => {
    setSaving(true);
    try {
      await onDecision(request, decision, comment);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to review request",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog title="Review leave request" onClose={onClose}>
      <div className="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
        <p className="font-medium">
          {request.employees?.first_name} {request.employees?.last_name}
        </p>
        <p className="mt-1 text-zinc-500">
          {request.leave_type} ·{" "}
          {businessDaysBetween(request.start_date, request.end_date)} working
          days
        </p>
        <p className="mt-3">{request.reason}</p>
      </div>
      <label className="mt-4 block text-xs font-medium">
        Decision comment
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="input mt-1.5 min-h-20"
          placeholder="Required when rejecting"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button
          disabled={saving}
          onClick={() => void act("REJECT")}
          className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700"
        >
          <X size={15} />
          Reject
        </button>
        <button
          disabled={saving}
          onClick={() => void act("APPROVE")}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
        >
          <Check size={15} />
          Approve
        </button>
      </div>
    </Dialog>
  );
}
