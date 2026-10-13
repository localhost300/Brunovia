"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock3, Loader2, Trophy, Users } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
          <ResponsiveContainer width="100%" height={260}><AreaChart data={attendanceChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#059669" stopOpacity={0.35} /><stop offset="100%" stopColor="#059669" stopOpacity={0.02} /></linearGradient><linearGradient id="lateFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#e4e4e7" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#71717a" }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#71717a" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 10px 30px rgba(0,0,0,.08)" }} /><Area type="monotone" dataKey="present" name="Present" stroke="#059669" strokeWidth={3} fill="url(#presentFill)" /><Area type="monotone" dataKey="late" name="Late" stroke="#ef4444" strokeWidth={2} fill="url(#lateFill)" /></AreaChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Employees by department" empty={departmentChart.length === 0} emptyText="No employees or departments are available yet.">
          <ResponsiveContainer width="100%" height={260}><BarChart data={departmentChart} layout="vertical" margin={{ left: 18, right: 12 }}><defs><linearGradient id="departmentFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0f766e" /><stop offset="100%" stopColor="#34d399" /></linearGradient></defs><CartesianGrid strokeDasharray="4 6" horizontal={false} stroke="#e4e4e7" /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="department" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#71717a" }} /><Tooltip cursor={{ fill: "rgba(16,185,129,.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 10px 30px rgba(0,0,0,.08)" }} /><Bar dataKey="employees" name="Employees" fill="url(#departmentFill)" radius={[0, 8, 8, 0]} barSize={22} /></BarChart></ResponsiveContainer>
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
  return <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-emerald-50/50 p-5 shadow-sm dark:from-zinc-950 dark:via-zinc-950 dark:to-emerald-950/20"><div className="mb-4 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950"><BarChart3 size={17} /></span><h2 className="font-semibold">{title}</h2></div>{children}{empty && <div className="pointer-events-none absolute inset-x-5 bottom-5 top-16 grid place-items-center rounded-xl bg-white/75 px-6 text-center text-sm text-zinc-500 backdrop-blur-sm dark:bg-zinc-950/75">{emptyText}</div>}</section>;
}
