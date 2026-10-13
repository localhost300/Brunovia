"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock3, Loader2, Trophy, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";

type Employee = { id: string; department?: { name: string } | null };
type Attendance = { work_date: string; status: string };
type Winner = { first_name: string; last_name: string; position: string };
type DashboardData = {
  employees: Employee[];
  attendance: Attendance[];
  pendingLeave: number;
  winner: Winner | null;
  awardMonth: string | null;
};
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export function LiveDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const client = createClient();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      const [employees, attendance, leave, election] = await Promise.all([
        client.from("employees").select("id,department:departments!employees_department_id_fkey(name)").is("deleted_at", null).eq("status", "ACTIVE"),
        client.from("attendance").select("work_date,status").gte("work_date", dayKey(start)).lte("work_date", dayKey(new Date())),
        client.from("leave_requests").select("id", { count: "exact", head: true }).in("status", ["PENDING_MANAGER", "PENDING_HR"]),
        client.from("recognition_elections").select("award_month,winner_employee_id").eq("status", "PUBLISHED").not("winner_employee_id", "is", null).order("award_month", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const failure = employees.error ?? attendance.error ?? leave.error ?? election.error;
      if (failure) return setError(failure.message);
      let winner: Winner | null = null;
      if (election.data?.winner_employee_id) {
        const result = await client.from("employees").select("first_name,last_name,position").eq("id", election.data.winner_employee_id).maybeSingle();
        if (result.error) return setError(result.error.message);
        winner = result.data as Winner | null;
      }
      setData({
        employees: (employees.data ?? []) as unknown as Employee[],
        attendance: (attendance.data ?? []) as Attendance[],
        pendingLeave: leave.count ?? 0,
        winner,
        awardMonth: election.data?.award_month ?? null,
      });
    };
    void load();
  }, []);

  const attendanceChart = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const daily = (data?.attendance ?? []).filter((row) => row.work_date === dayKey(date));
    return {
      day: date.toLocaleDateString("en-NG", { weekday: "short" }),
      present: daily.filter((row) => row.status === "PRESENT").length,
      late: daily.filter((row) => row.status === "LATE").length,
    };
  }), [data]);
  const departmentChart = useMemo(() => {
    const totals = new Map<string, number>();
    for (const employee of data?.employees ?? []) {
      const name = employee.department?.name ?? "Unassigned";
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
    return [...totals].map(([department, employees]) => ({ department, employees }));
  }, [data]);

  if (error) return <p className="rounded-xl border bg-white p-8 text-sm text-red-600">{error}</p>;
  if (!data) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-emerald-700" /></div>;

  const today = dayKey(new Date());
  const presentToday = data.attendance.filter((row) => row.work_date === today && ["PRESENT", "LATE"].includes(row.status)).length;
  const cards = [
    ["Active employees", data.employees.length, Users],
    ["Attendance today", presentToday, Clock3],
    ["Pending leave", data.pendingLeave, CalendarDays],
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">Live organization overview</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map(([label, value, Icon]) => <section key={label} className="rounded-xl border bg-white p-5 dark:bg-zinc-950"><Icon size={19} className="text-emerald-700" /><p className="mt-4 text-3xl font-semibold">{value}</p><p className="text-sm text-zinc-500">{label}</p></section>)}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartCard title="Seven-day attendance" empty={data.attendance.length === 0} emptyText="No attendance has been recorded in the last seven days.">
          <ResponsiveContainer width="100%" height={260}><BarChart data={attendanceChart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="present" name="Present" fill="#047857" radius={[5, 5, 0, 0]} /><Bar dataKey="late" name="Late" fill="#dc2626" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Employees by department" empty={departmentChart.length === 0} emptyText="No employees or departments are available yet.">
          <ResponsiveContainer width="100%" height={260}><BarChart data={departmentChart} layout="vertical" margin={{ left: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="department" width={100} /><Tooltip /><Bar dataKey="employees" name="Employees" fill="#0f766e" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
      <section className="mt-5 rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <div className="flex items-center gap-2"><Trophy size={19} className="text-amber-600" /><h2 className="font-semibold">Staff of the month</h2></div>
        {data.winner ? <div className="mt-5"><p className="text-lg font-semibold">{data.winner.first_name} {data.winner.last_name}</p><p className="text-sm text-zinc-500">{data.winner.position}</p>{data.awardMonth && <p className="mt-2 text-xs text-zinc-400">Published for {new Date(`${data.awardMonth}T12:00:00`).toLocaleDateString("en-NG", { month: "long", year: "numeric" })}</p>}</div> : <p className="mt-5 rounded-lg bg-zinc-50 p-5 text-sm text-zinc-500 dark:bg-zinc-900">No staff-of-the-month result has been published yet.</p>}
      </section>
    </div>
  );
}

function ChartCard({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return <section className="relative rounded-xl border bg-white p-5 dark:bg-zinc-950"><div className="mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-emerald-700" /><h2 className="font-semibold">{title}</h2></div>{children}{empty && <div className="pointer-events-none absolute inset-x-5 bottom-5 top-14 grid place-items-center rounded-lg bg-white/80 px-6 text-center text-sm text-zinc-500 backdrop-blur-[1px] dark:bg-zinc-950/80">{emptyText}</div>}</section>;
}
