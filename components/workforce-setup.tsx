"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Loader2, Plus, Umbrella, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AppUser } from "@/types/database";

type Department = { id: string; name: string; description: string | null };
type Shift = { id: string; name: string; start_time: string; end_time: string };
type LeavePolicy = { id: string; name: string; annual_allowance: number };

export function WorkforceSetup({ user }: { user: AppUser }) {
  const canManage = user.role === "SUPER_ADMIN" || user.role === "HR_MANAGER";
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const client = createClient();
    const [d, s, p] = await Promise.all([
      client
        .from("departments")
        .select("id,name,description")
        .is("deleted_at", null)
        .order("name"),
      client
        .from("shifts")
        .select("id,name,start_time,end_time")
        .is("deleted_at", null)
        .order("start_time"),
      client
        .from("leave_policies")
        .select("id,name,annual_allowance")
        .eq("active", true)
        .order("name"),
    ]);
    const error = d.error ?? s.error ?? p.error;
    if (error) toast.error(error.message);
    else {
      setDepartments(d.data ?? []);
      setShifts(s.data ?? []);
      setPolicies(p.data ?? []);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (
    table: "departments" | "shifts" | "leave_policies",
    values: Record<string, string | number | boolean>,
  ) => {
    if (!canManage)
      return toast.error(
        "You do not have permission to manage workforce setup",
      );
    const { error } = await createClient().from(table).insert(values);
    if (error) return toast.error(error.message);
    toast.success("Saved successfully");
    await load();
  };

  if (loading)
    return (
      <div className="grid min-h-56 place-items-center">
        <Loader2 className="animate-spin text-emerald-700" />
      </div>
    );
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Workforce setup</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create the records required before adding employees and recording
          attendance.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <SetupCard
          icon={<Users size={18} />}
          title="Departments"
          items={departments.map((x) => ({
            id: x.id,
            label: x.name,
            detail: x.description,
          }))}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit("departments", {
                name: String(f.get("name")).trim(),
                description: String(f.get("description")).trim(),
              });
              e.currentTarget.reset();
            }}
            className="space-y-2"
          >
            <input
              required
              name="name"
              placeholder="Department name"
              className="input"
            />
            <input
              name="description"
              placeholder="Description"
              className="input"
            />
            <SaveButton disabled={!canManage} />
          </form>
        </SetupCard>
        <SetupCard
          icon={<Clock3 size={18} />}
          title="Shifts"
          items={shifts.map((x) => ({
            id: x.id,
            label: x.name,
            detail: `${x.start_time.slice(0, 5)}–${x.end_time.slice(0, 5)}`,
          }))}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit("shifts", {
                name: String(f.get("name")).trim(),
                start_time: String(f.get("start")),
                end_time: String(f.get("end")),
              });
              e.currentTarget.reset();
            }}
            className="space-y-2"
          >
            <input
              required
              name="name"
              placeholder="Shift name"
              className="input"
            />
            <div className="grid grid-cols-2 gap-2">
              <input required name="start" type="time" className="input" />
              <input required name="end" type="time" className="input" />
            </div>
            <SaveButton disabled={!canManage} />
          </form>
        </SetupCard>
        <SetupCard
          icon={<Umbrella size={18} />}
          title="Leave policies"
          items={policies.map((x) => ({
            id: x.id,
            label: x.name,
            detail: `${x.annual_allowance} days/year`,
          }))}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit("leave_policies", {
                name: String(f.get("name")).trim(),
                annual_allowance: Number(f.get("days")),
                active: true,
              });
              e.currentTarget.reset();
            }}
            className="space-y-2"
          >
            <input
              required
              name="name"
              placeholder="Policy name"
              className="input"
            />
            <input
              required
              name="days"
              type="number"
              min="0"
              placeholder="Days per year"
              className="input"
            />
            <SaveButton disabled={!canManage} />
          </form>
        </SetupCard>
      </div>
    </div>
  );
}

function SetupCard({
  icon,
  title,
  items,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  items: { id: string; label: string; detail: string | null }[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
      <div className="flex items-center gap-2 font-semibold text-emerald-700">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="my-4 min-h-20 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900"
            >
              <p className="text-sm font-medium">{item.label}</p>
              {item.detail && (
                <p className="text-xs text-zinc-500">{item.detail}</p>
              )}
            </div>
          ))
        ) : (
          <p className="py-5 text-center text-sm text-zinc-400">
            None created yet
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
function SaveButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      <Plus size={15} />
      Add
    </button>
  );
}
