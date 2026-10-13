"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/database";

type Employee = { id: string; employee_id: string; first_name: string; last_name: string; position: string };
type Shift = { id: string; name: string; start_time: string; end_time: string; color: string | null };
type Assignment = { id: string; employee_id: string; shift_id: string; starts_on: string; ends_on: string | null; is_override: boolean };
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monday = () => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return dateKey(date); };
const weekEnd = (start: string) => { const date = new Date(`${start}T12:00:00`); date.setDate(date.getDate() + 6); return dateKey(date); };

export function ShiftWorkspace({ user }: { user: AppUser }) {
  const canManage = user.role === "SUPER_ADMIN" || user.role === "HR_MANAGER" || user.role === "MANAGER";
  const canCreateShift = user.role === "SUPER_ADMIN" || user.role === "HR_MANAGER";
  const [week, setWeek] = useState(monday());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = createClient();
    const [employeeResult, shiftResult, assignmentResult] = await Promise.all([
      client.from("employees").select("id,employee_id,first_name,last_name,position").is("deleted_at", null).eq("status", "ACTIVE").order("first_name"),
      client.from("shifts").select("id,name,start_time,end_time,color").is("deleted_at", null).order("start_time"),
      client.from("employee_shifts").select("id,employee_id,shift_id,starts_on,ends_on,is_override").eq("starts_on", week),
    ]);
    const failure = employeeResult.error ?? shiftResult.error ?? assignmentResult.error;
    if (failure) setError(failure.message);
    else { setEmployees((employeeResult.data ?? []) as Employee[]); setShifts((shiftResult.data ?? []) as Shift[]); setAssignments((assignmentResult.data ?? []) as Assignment[]); }
    setLoading(false);
  }, [week]);
  useEffect(() => { void load(); }, [load]);
  const assigned = useMemo(() => new Map(assignments.map((item) => [item.employee_id, item.shift_id])), [assignments]);

  const assign = async (employeeId: string, shiftId: string) => {
    const existing = assignments.find((item) => item.employee_id === employeeId);
    const client = createClient();
    const result = existing
      ? await client.from("employee_shifts").update({ shift_id: shiftId, is_override: true, ends_on: weekEnd(week) }).eq("id", existing.id)
      : await client.from("employee_shifts").insert({ employee_id: employeeId, shift_id: shiftId, starts_on: week, ends_on: weekEnd(week), is_override: true, published_at: new Date().toISOString() });
    if (result.error) return toast.error(result.error.message);
    toast.success("Shift assignment saved"); await load();
  };
  const generate = async () => {
    const { error: rpcError } = await createClient().rpc("generate_weekly_shift_roster", { p_week_start: week });
    if (rpcError) return toast.error(rpcError.message);
    toast.success("Weekly roster generated from active employees"); await load();
  };

  return <div>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold">Shift management</h1><p className="mt-1 text-sm text-zinc-500">Live weekly schedules for active Brunovia employees.</p></div><div className="flex flex-wrap gap-2"><label className="text-xs">Week starting<input type="date" value={week} onChange={(event) => setWeek(event.target.value)} className="input mt-1" /></label><button onClick={() => void load()} className="self-end rounded-lg border p-2" aria-label="Refresh"><RefreshCw size={17} /></button>{canManage && <button onClick={() => void generate()} className="self-end rounded-lg border px-3 py-2 text-sm">Generate roster</button>}{canCreateShift && <button onClick={() => setCreating(true)} className="self-end rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white"><Plus className="mr-1 inline" size={15} />New shift</button>}</div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">{shifts.map((shift) => <section key={shift.id} className="rounded-xl border bg-white p-4 dark:bg-zinc-950"><span className="block h-1.5 w-10 rounded-full" style={{ background: shift.color ?? "#047857" }} /><p className="mt-3 font-medium">{shift.name}</p><p className="text-sm text-zinc-500">{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</p></section>)}</div>
    <section className="mt-5 overflow-hidden rounded-xl border bg-white dark:bg-zinc-950">{loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="animate-spin text-emerald-700" /></div> : error ? <p className="p-8 text-sm text-red-600">{error}</p> : employees.length === 0 ? <div className="py-16 text-center"><CalendarDays className="mx-auto text-zinc-300" /><p className="mt-3 font-medium">No active employees</p><p className="text-sm text-zinc-500">Add employees before building a roster.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Assigned shift</th><th className="px-4 py-3">Week</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} className="border-t"><td className="px-4 py-3 font-medium">{employee.first_name} {employee.last_name}<span className="block text-xs font-normal text-zinc-400">{employee.employee_id}</span></td><td className="px-4 py-3 text-zinc-500">{employee.position}</td><td className="px-4 py-3">{canManage ? <select value={assigned.get(employee.id) ?? ""} onChange={(event) => void assign(employee.id, event.target.value)} className="input min-w-44"><option value="" disabled>Not assigned</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select> : shifts.find((shift) => shift.id === assigned.get(employee.id))?.name ?? "Not assigned"}</td><td className="px-4 py-3 text-zinc-500">{week} – {weekEnd(week)}</td></tr>)}</tbody></table></div>}</section>
    {creating && <NewShift close={() => setCreating(false)} saved={async () => { setCreating(false); await load(); }} />}
  </div>;
}

function NewShift({ close, saved }: { close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(""); const [start, setStart] = useState("08:00"); const [end, setEnd] = useState("17:00");
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><form onSubmit={async (event) => { event.preventDefault(); const { error } = await createClient().from("shifts").insert({ name: name.trim(), start_time: start, end_time: end }); if (error) return toast.error(error.message); toast.success("Shift created"); await saved(); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-950"><h2 className="text-lg font-semibold">Create shift</h2><label className="mt-5 block text-xs font-medium">Shift name<input required value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" /></label><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-medium">Starts<input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input mt-1" /></label><label className="text-xs font-medium">Ends<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input mt-1" /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white">Create shift</button></div></form></div>;
}
