"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Loader2, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/database";

type Employee = { id: string; employee_id: string; first_name: string; last_name: string; position: string };
type Recognition = { id: string; employee_id: string; category: string; achievement: string; recognition_date: string; points: number; created_at: string };
type Winner = { employee: Employee; month: string; citation: string };

export function RecognitionWorkspace({ user }: { user: AppUser }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null); const client = createClient();
    const [employeeResult, recognitionResult, awardResult] = await Promise.all([
      client.from("employees").select("id,employee_id,first_name,last_name,position").is("deleted_at", null).eq("status", "ACTIVE").order("first_name"),
      client.from("recognitions").select("id,employee_id,category,achievement,recognition_date,points,created_at").order("created_at", { ascending: false }).limit(30),
      client.from("employee_awards").select("employee_id,award_month,citation").not("published_at", "is", null).order("award_month", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failure = employeeResult.error ?? recognitionResult.error ?? awardResult.error;
    if (failure) setError(failure.message);
    else {
      const staff = (employeeResult.data ?? []) as Employee[]; setEmployees(staff); setRecognitions((recognitionResult.data ?? []) as Recognition[]);
      const award = awardResult.data; const employee = award ? staff.find((item) => item.id === award.employee_id) : null;
      setWinner(award && employee ? { employee, month: award.award_month, citation: award.citation } : null);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-emerald-700" /></div>;
  if (error) return <p className="rounded-xl border bg-white p-8 text-sm text-red-600">{error}</p>;
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  return <div><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-semibold">Staff recognition</h1><p className="mt-1 text-sm text-zinc-500">Real appreciation and published employee awards.</p></div><button onClick={() => setCreating(true)} disabled={employees.length === 0} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Plus className="mr-1 inline" size={15} />Recognize employee</button></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="rounded-2xl bg-gradient-to-br from-amber-50 to-white p-6 ring-1 ring-amber-200 dark:from-amber-950/30 dark:to-zinc-950"><div className="flex items-center gap-2 text-amber-700"><Award size={20} /><p className="text-xs font-semibold uppercase tracking-wider">Staff of the month</p></div>{winner ? <div className="mt-7"><div className="grid size-16 place-items-center rounded-2xl bg-amber-500 text-xl font-bold text-white">{winner.employee.first_name[0]}{winner.employee.last_name[0]}</div><h2 className="mt-4 text-xl font-semibold">{winner.employee.first_name} {winner.employee.last_name}</h2><p className="text-sm text-zinc-500">{winner.employee.position}</p><p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{winner.citation}</p><p className="mt-4 text-xs text-amber-700">{new Date(`${winner.month}T12:00:00`).toLocaleDateString("en-NG", { month: "long", year: "numeric" })}</p></div> : <div className="grid min-h-56 place-items-center text-center"><div><Award className="mx-auto text-zinc-300" size={38} /><p className="mt-3 font-medium">No published winner</p><p className="mt-1 text-sm text-zinc-500">A staff member will appear here after an award is published.</p></div></div>}</section>
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950"><div className="flex items-center gap-2"><Star size={18} className="text-emerald-700" /><h2 className="font-semibold">Recognition feed</h2></div>{recognitions.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><div><Star className="mx-auto text-zinc-300" size={34} /><p className="mt-3 font-medium">No recognition yet</p><p className="text-sm text-zinc-500">Recognize real contributions to start the feed.</p></div></div> : <div className="mt-4 divide-y">{recognitions.map((item) => { const employee = employeeMap.get(item.employee_id); return <article key={item.id} className="py-4 first:pt-0"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{employee ? `${employee.first_name} ${employee.last_name}` : "Former employee"}</p><p className="text-xs font-medium text-emerald-700">{item.category}</p></div><span className="text-xs text-zinc-400">{new Date(`${item.recognition_date}T12:00:00`).toLocaleDateString("en-NG", { dateStyle: "medium" })}</span></div><p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.achievement}</p>{item.points > 0 && <p className="mt-2 text-xs text-amber-700">+{item.points} points</p>}</article>; })}</div>}</section></div>
    {creating && <RecognitionForm user={user} employees={employees} close={() => setCreating(false)} saved={async () => { setCreating(false); await load(); }} />}
  </div>;
}

function RecognitionForm({ user, employees, close, saved }: { user: AppUser; employees: Employee[]; close: () => void; saved: () => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState(""); const [category, setCategory] = useState(""); const [achievement, setAchievement] = useState(""); const [saving, setSaving] = useState(false);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true"><form onSubmit={async (event) => { event.preventDefault(); setSaving(true); const { error } = await createClient().from("recognitions").insert({ employee_id: employeeId, recognized_by: user.id, category: category.trim(), achievement: achievement.trim(), visibility: "COMPANY", recognition_date: new Date().toISOString().slice(0,10) }); setSaving(false); if (error) return toast.error(error.message); toast.success("Recognition published"); await saved(); }} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-950"><div className="flex justify-between"><div><h2 className="text-lg font-semibold">Recognize an employee</h2><p className="text-sm text-zinc-500">Publish a genuine contribution to the company feed.</p></div><button type="button" onClick={close}><X size={18} /></button></div><label className="mt-5 block text-xs font-medium">Employee<select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input mt-1"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · {employee.employee_id}</option>)}</select></label><label className="mt-4 block text-xs font-medium">Category<input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Teamwork, leadership, innovation…" className="input mt-1" /></label><label className="mt-4 block text-xs font-medium">Achievement<textarea required minLength={10} value={achievement} onChange={(e) => setAchievement(e.target.value)} className="input mt-1 min-h-28" placeholder="Describe the contribution and its impact." /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60">{saving ? "Publishing…" : "Publish recognition"}</button></div></form></div>;
}
