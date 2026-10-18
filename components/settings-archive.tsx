"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";

type ShiftItem = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  deleted_at: string | null;
};

type PolicyItem = {
  id: string;
  name: string;
  kind: "Payroll" | "Leave";
  detail: string;
  active: boolean;
};

export function SettingsArchive({ userRole }: { userRole: UserRole }) {
  const canManage = userRole === "SUPER_ADMIN" || userRole === "HR_MANAGER";
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const client = createClient();
    const [shiftResult, payrollResult, leaveResult] = await Promise.all([
      client
        .from("shifts")
        .select("id,name,start_time,end_time,deleted_at")
        .order("start_time"),
      client
        .from("deduction_policies")
        .select("id,name,adjustment_type,grace_minutes,active")
        .order("name"),
      client
        .from("leave_policies")
        .select("id,name,annual_allowance,active")
        .order("name"),
    ]);
    const error = shiftResult.error ?? payrollResult.error ?? leaveResult.error;
    if (error) {
      toast.error(`Could not load archived settings: ${error.message}`);
    } else {
      setShifts((shiftResult.data ?? []) as ShiftItem[]);
      setPolicies([
        ...(payrollResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          kind: "Payroll" as const,
          detail: `${item.adjustment_type.replaceAll("_", " ")} · ${item.grace_minutes} min grace`,
          active: item.active,
        })),
        ...(leaveResult.data ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          kind: "Leave" as const,
          detail: `${item.annual_allowance} days annual allowance`,
          active: item.active,
        })),
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [canManage, load]);

  const updateShift = async (shift: ShiftItem) => {
    setWorkingId(shift.id);
    const client = createClient();
    if (!shift.deleted_at) {
      if (shift.name === "Morning Shift" || shift.name === "Evening Shift") {
        toast.error("Morning and Evening shifts are required for weekly rotation");
        setWorkingId(null);
        return;
      }
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
      }).format(new Date());
      const { data, error } = await client
        .from("employee_shifts")
        .select("id")
        .eq("shift_id", shift.id)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .limit(1);
      if (error) {
        toast.error(`Could not check shift assignments: ${error.message}`);
        setWorkingId(null);
        return;
      }
      if (data?.length) {
        toast.error("Reassign employees before archiving this shift");
        setWorkingId(null);
        return;
      }
    }
    const { error } = await client
      .from("shifts")
      .update({ deleted_at: shift.deleted_at ? null : new Date().toISOString() })
      .eq("id", shift.id);
    if (error) toast.error(`Could not update shift: ${error.message}`);
    else {
      toast.success(shift.deleted_at ? "Shift restored" : "Shift archived");
      await load();
    }
    setWorkingId(null);
  };

  const updatePolicy = async (policy: PolicyItem) => {
    setWorkingId(policy.id);
    const table =
      policy.kind === "Payroll" ? "deduction_policies" : "leave_policies";
    const { error } = await createClient()
      .from(table)
      .update({ active: !policy.active })
      .eq("id", policy.id);
    if (error) toast.error(`Could not update policy: ${error.message}`);
    else {
      toast.success(policy.active ? "Policy archived" : "Policy restored");
      await load();
    }
    setWorkingId(null);
  };

  if (!canManage)
    return (
      <p className="text-sm text-zinc-500">
        Only Super Admins and HR Managers can archive settings.
      </p>
    );

  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Archived records stay in Supabase and can be restored.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh archived settings"
          className="rounded-md border p-2 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Shifts</h3>
        {loading ? (
          <Loader2 className="animate-spin text-emerald-700" />
        ) : shifts.length ? (
          <div className="divide-y rounded-lg border">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{shift.name}</p>
                  <p className="text-xs text-zinc-500">
                    {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                    {shift.deleted_at ? " · Archived" : " · Active"}
                  </p>
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={workingId === shift.id}
                  onClick={() => void updateShift(shift)}
                >
                  {shift.deleted_at ? <RotateCcw size={14} /> : <Archive size={14} />}
                  {shift.deleted_at ? "Restore" : "Archive"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border p-3 text-sm text-zinc-500">
            No shifts found.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Policies</h3>
        {loading ? (
          <Loader2 className="animate-spin text-emerald-700" />
        ) : policies.length ? (
          <div className="divide-y rounded-lg border">
            {policies.map((policy) => (
              <div
                key={`${policy.kind}-${policy.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{policy.name}</p>
                  <p className="text-xs text-zinc-500">
                    {policy.kind} · {policy.detail} · {policy.active ? "Active" : "Archived"}
                  </p>
                </div>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={workingId === policy.id}
                  onClick={() => void updatePolicy(policy)}
                >
                  {policy.active ? <Archive size={14} /> : <RotateCcw size={14} />}
                  {policy.active ? "Archive" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border p-3 text-sm text-zinc-500">
            No policies found.
          </p>
        )}
      </section>
    </div>
  );
}