"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Loader2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Metrics = { employees: number; present: number; pendingLeave: number };

export function LiveDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const client = createClient();
      const today = new Date().toISOString().slice(0, 10);
      const [employees, attendance, leave] = await Promise.all([
        client
          .from("employees")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("status", "ACTIVE"),
        client
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("work_date", today),
        client
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["PENDING_MANAGER", "PENDING_HR"]),
      ]);
      const failure = employees.error ?? attendance.error ?? leave.error;
      if (failure) return setError(failure.message);
      setMetrics({
        employees: employees.count ?? 0,
        present: attendance.count ?? 0,
        pendingLeave: leave.count ?? 0,
      });
    };
    void load();
  }, []);

  if (error)
    return (
      <p className="rounded-xl border bg-white p-8 text-sm text-red-600">
        {error}
      </p>
    );
  if (!metrics)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-emerald-700" />
      </div>
    );
  const cards = [
    ["Active employees", metrics.employees, Users],
    ["Attendance today", metrics.present, Clock3],
    ["Pending leave", metrics.pendingLeave, CalendarDays],
  ] as const;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Live organization overview</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map(([label, value, Icon]) => (
          <section
            key={label}
            className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
          >
            <Icon size={19} className="text-emerald-700" />
            <p className="mt-4 text-3xl font-semibold">{value}</p>
            <p className="text-sm text-zinc-500">{label}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
