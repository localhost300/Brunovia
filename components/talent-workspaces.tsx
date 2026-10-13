"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Loader2, Plus, Target, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";

type Employee = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
};
type Goal = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  actual_value: number | null;
  score: number | null;
  status: string;
  manager_comment: string | null;
  employee_comment: string | null;
  kpis?: {
    title: string;
    category: string;
    target_value: number | null;
    target_unit: string | null;
    weight: number;
  } | null;
  employees?: Employee | null;
};
const demoEmployee = {
  id: "demo-1",
  employee_id: "PF-1001",
  first_name: "Amara",
  last_name: "Okafor",
};
const demoGoals: Goal[] = [
  {
    id: "demo-goal",
    employee_id: "demo-1",
    period_start: "2026-10-01",
    period_end: "2026-12-31",
    actual_value: 82,
    score: 82,
    status: "ACTIVE",
    manager_comment: null,
    employee_comment: null,
    kpis: {
      title: "Customer satisfaction",
      category: "Quality",
      target_value: 95,
      target_unit: "%",
      weight: 30,
    },
    employees: demoEmployee,
  },
];
const nice = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (x) => x.toUpperCase());

export function PerformanceWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig(),
    canManage = user.role !== "EMPLOYEE";
  const [goals, setGoals] = useState<Goal[]>(configured ? [] : demoGoals),
    [employees, setEmployees] = useState<Employee[]>(
      configured ? [] : [demoEmployee],
    ),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [reviewing, setReviewing] = useState<Goal | null>(null);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const c = createClient();
      const [g, e] = await Promise.all([
        c
          .from("employee_kpis")
          .select(
            "id,employee_id,period_start,period_end,actual_value,score,status,manager_comment,employee_comment,kpis(title,category,target_value,target_unit,weight),employees!employee_kpis_employee_id_fkey(id,employee_id,first_name,last_name)",
          )
          .order("period_end", { ascending: false }),
        c
          .from("employees")
          .select("id,employee_id,first_name,last_name")
          .is("deleted_at", null)
          .eq("status", "ACTIVE")
          .order("first_name"),
      ]);
      if (g.error) throw g.error;
      if (e.error) throw e.error;
      setGoals(g.data as unknown as Goal[]);
      setEmployees(e.data as Employee[]);
      setError(null);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to load performance");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const average =
    goals
      .filter((g) => g.score != null)
      .reduce((a, g) => a + Number(g.score), 0) /
    Math.max(1, goals.filter((g) => g.score != null).length);
  const createGoal = async (v: {
    employee_id: string;
    title: string;
    category: string;
    target_value: number;
    target_unit: string;
    weight: number;
    period_start: string;
    period_end: string;
    description: string;
  }) => {
    if (configured) {
      const { error: e } = await createClient().rpc("create_and_assign_kpi", {
        p_employee_id: v.employee_id,
        p_title: v.title,
        p_description: v.description,
        p_category: v.category,
        p_target_value: v.target_value,
        p_target_unit: v.target_unit,
        p_weight: v.weight,
        p_period_start: v.period_start,
        p_period_end: v.period_end,
      });
      if (e) throw e;
      await load();
    } else
      setGoals((x) => [
        {
          ...demoGoals[0],
          id: crypto.randomUUID(),
          employee_id: v.employee_id,
          period_start: v.period_start,
          period_end: v.period_end,
          actual_value: null,
          score: null,
          kpis: {
            title: v.title,
            category: v.category,
            target_value: v.target_value,
            target_unit: v.target_unit,
            weight: v.weight,
          },
          employees: employees.find((e) => e.id === v.employee_id) ?? null,
        },
        ...x,
      ]);
    setCreating(false);
    toast.success("KPI assigned");
  };
  const review = async (
    goal: Goal,
    actual: number,
    score: number,
    comment: string,
    submit: boolean,
  ) => {
    if (configured) {
      const { error: e } = await createClient().rpc("review_employee_kpi", {
        p_employee_kpi_id: goal.id,
        p_actual_value: actual,
        p_score: score,
        p_comment: comment,
        p_submit: submit,
      });
      if (e) throw e;
      await load();
    } else
      setGoals((x) =>
        x.map((g) =>
          g.id === goal.id
            ? {
                ...g,
                actual_value: actual,
                score,
                status: submit ? "SUBMITTED" : "ACTIVE",
                manager_comment: comment,
              }
            : g,
        ),
      );
    setReviewing(null);
    toast.success(
      submit
        ? "Review submitted for employee acknowledgement"
        : "Review draft saved",
    );
  };
  const acknowledge = async (goal: Goal) => {
    const comment = window.prompt("Optional acknowledgement comment") ?? "";
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "acknowledge_employee_kpi",
          { p_employee_kpi_id: goal.id, p_comment: comment },
        );
        if (e) throw e;
        await load();
      } else
        setGoals((x) =>
          x.map((g) =>
            g.id === goal.id
              ? { ...g, status: "ACKNOWLEDGED", employee_comment: comment }
              : g,
          ),
        );
      toast.success("Review acknowledged");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to acknowledge review",
      );
    }
  };
  return (
    <>
      <Header
        title="Performance"
        subtitle="Measurable goals, evidence-based reviews, and employee acknowledgement"
        action={
          canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
            >
              <Plus className="mr-2 inline" size={15} />
              Assign KPI
            </button>
          ) : null
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Active goals", goals.filter((g) => g.status === "ACTIVE").length],
          ["Average score", `${average.toFixed(1)}%`],
          [
            "Awaiting acknowledgement",
            goals.filter((g) => g.status === "SUBMITTED").length,
          ],
        ].map(([a, b]) => (
          <Stat key={a} label={String(a)} value={String(b)} />
        ))}
      </div>
      <Panel>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorText text={error} />
        ) : goals.length === 0 ? (
          <Empty icon={<Target />} text="No performance goals assigned" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  {[
                    "Employee",
                    "Goal",
                    "Period",
                    "Progress",
                    "Score",
                    "Status",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="px-3 py-3 font-medium">
                      {g.employees?.first_name} {g.employees?.last_name}
                      <span className="block text-xs text-zinc-400">
                        {g.employees?.employee_id}
                      </span>
                    </td>
                    <td className="px-3">
                      {g.kpis?.title}
                      <span className="block text-xs text-zinc-400">
                        {g.kpis?.weight}% weight
                      </span>
                    </td>
                    <td className="px-3 text-xs">
                      {g.period_start} – {g.period_end}
                    </td>
                    <td className="px-3">
                      {g.actual_value ?? 0} / {g.kpis?.target_value ?? "—"}{" "}
                      {g.kpis?.target_unit}
                    </td>
                    <td className="px-3 font-semibold">
                      {g.score == null ? "—" : `${g.score}%`}
                    </td>
                    <td className="px-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                        {nice(g.status)}
                      </span>
                    </td>
                    <td className="px-3">
                      {canManage &&
                      !["ACKNOWLEDGED", "COMPLETED"].includes(g.status) ? (
                        <button
                          onClick={() => setReviewing(g)}
                          className="rounded border px-3 py-1.5 text-xs"
                        >
                          Review
                        </button>
                      ) : !canManage && g.status === "SUBMITTED" ? (
                        <button
                          onClick={() => void acknowledge(g)}
                          className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
                        >
                          Acknowledge
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && (
        <GoalDialog
          employees={employees}
          close={() => setCreating(false)}
          save={createGoal}
        />
      )}{" "}
      {reviewing && (
        <ReviewDialog
          goal={reviewing}
          close={() => setReviewing(null)}
          save={review}
        />
      )}
    </>
  );
}

type Course = {
  id: string;
  title: string;
  provider: string | null;
  delivery_mode: string;
  validity_months: number | null;
  active: boolean;
};
type Assignment = {
  id: string;
  employee_id: string;
  course_id: string;
  due_date: string | null;
  status: string;
  score: number | null;
  completed_at: string | null;
  expires_at: string | null;
  employees?: Employee | null;
  training_courses?: { title: string; provider: string | null } | null;
};
const demoCourse: Course = {
  id: "demo-course",
  title: "Information Security Awareness",
  provider: "Brunovia Academy",
  delivery_mode: "ONLINE",
  validity_months: 12,
  active: true,
};
const demoAssignment: Assignment = {
  id: "demo-assignment",
  employee_id: "demo-1",
  course_id: "demo-course",
  due_date: "2026-10-31",
  status: "IN_PROGRESS",
  score: null,
  completed_at: null,
  expires_at: null,
  employees: demoEmployee,
  training_courses: { title: demoCourse.title, provider: demoCourse.provider },
};
export function TrainingWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig(),
    canManage = user.role !== "EMPLOYEE";
  const [courses, setCourses] = useState<Course[]>(
      configured ? [] : [demoCourse],
    ),
    [assignments, setAssignments] = useState<Assignment[]>(
      configured ? [] : [demoAssignment],
    ),
    [employees, setEmployees] = useState<Employee[]>(
      configured ? [] : [demoEmployee],
    ),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState<string | null>(null),
    [dialog, setDialog] = useState(false);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const c = createClient();
      const [cr, ar, er] = await Promise.all([
        c
          .from("training_courses")
          .select("id,title,provider,delivery_mode,validity_months,active")
          .eq("active", true)
          .order("title"),
        c
          .from("training_assignments")
          .select(
            "id,employee_id,course_id,due_date,status,score,completed_at,expires_at,employees(id,employee_id,first_name,last_name),training_courses(title,provider)",
          )
          .order("due_date"),
        c
          .from("employees")
          .select("id,employee_id,first_name,last_name")
          .is("deleted_at", null)
          .eq("status", "ACTIVE"),
      ]);
      if (cr.error) throw cr.error;
      if (ar.error) throw ar.error;
      if (er.error) throw er.error;
      setCourses(cr.data as Course[]);
      setAssignments(ar.data as unknown as Assignment[]);
      setEmployees(er.data as Employee[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load training");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const complete = async (a: Assignment) => {
    const score = Number(window.prompt("Completion score (0–100)", "100"));
    if (!Number.isFinite(score) || score < 0 || score > 100)
      return toast.error("Enter a score from 0 to 100");
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "complete_training_assignment",
          { p_assignment_id: a.id, p_score: score },
        );
        if (e) throw e;
        await load();
      } else
        setAssignments((v) =>
          v.map((x) =>
            x.id === a.id
              ? {
                  ...x,
                  status: "COMPLETED",
                  score,
                  completed_at: new Date().toISOString(),
                }
              : x,
          ),
        );
      toast.success("Training completion recorded");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to complete training",
      );
    }
  };
  const assign = async (
    employee_id: string,
    course_id: string,
    due_date: string,
  ) => {
    if (configured) {
      const { error: e } = await createClient()
        .from("training_assignments")
        .insert({
          employee_id,
          course_id,
          due_date,
          assigned_by: (await createClient().auth.getUser()).data.user?.id,
        });
      if (e) throw e;
      await load();
    } else
      setAssignments((v) => [
        {
          ...demoAssignment,
          id: crypto.randomUUID(),
          employee_id,
          course_id,
          due_date,
          status: "ASSIGNED",
          employees: employees.find((e) => e.id === employee_id) ?? null,
          training_courses: {
            title: courses.find((c) => c.id === course_id)?.title ?? "Course",
            provider: null,
          },
        },
        ...v,
      ]);
    setDialog(false);
    toast.success("Training assigned");
  };
  const expiring = assignments.filter(
    (a) =>
      a.expires_at &&
      new Date(a.expires_at) <= new Date(Date.now() + 30 * 86400000) &&
      a.status === "COMPLETED",
  ).length;
  return (
    <>
      <Header
        title="Training"
        subtitle="Courses, assignments, certifications, and renewal tracking"
        action={
          canManage ? (
            <button
              onClick={() => setDialog(true)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
            >
              <Plus className="mr-2 inline" size={15} />
              Assign training
            </button>
          ) : null
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Available courses" value={String(courses.length)} />
        <Stat
          label="In progress"
          value={String(
            assignments.filter(
              (a) => a.status === "IN_PROGRESS" || a.status === "ASSIGNED",
            ).length,
          )}
        />
        <Stat label="Expiring in 30 days" value={String(expiring)} />
      </div>
      <Panel>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorText text={error} />
        ) : assignments.length === 0 ? (
          <Empty icon={<BookOpen />} text="No training assignments" />
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <article
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <p className="font-medium">{a.training_courses?.title}</p>
                  <p className="text-xs text-zinc-500">
                    {a.employees?.first_name} {a.employees?.last_name} · Due{" "}
                    {a.due_date ?? "not set"} ·{" "}
                    {a.training_courses?.provider ?? "Internal"}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  {nice(a.status)}
                </span>
                {a.status !== "COMPLETED" && (
                  <button
                    onClick={() => void complete(a)}
                    className="rounded border px-3 py-1.5 text-xs"
                  >
                    Record completion
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
      {dialog && (
        <AssignTraining
          employees={employees}
          courses={courses}
          close={() => setDialog(false)}
          save={assign}
        />
      )}
    </>
  );
}

function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
      {children}
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </section>
  );
}
function Loading() {
  return (
    <div className="grid min-h-52 place-items-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
function ErrorText({ text }: { text: string }) {
  return <p className="py-12 text-center text-red-600">{text}</p>;
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-14 text-center text-zinc-400">
      <span className="inline-block">{icon}</span>
      <p className="mt-2">{text}</p>
    </div>
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
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-zinc-950"
      >
        <div className="mb-5 flex justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={close}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function GoalDialog({
  employees,
  close,
  save,
}: {
  employees: Employee[];
  close: () => void;
  save: (v: {
    employee_id: string;
    title: string;
    category: string;
    target_value: number;
    target_unit: string;
    weight: number;
    period_start: string;
    period_end: string;
    description: string;
  }) => Promise<void>;
}) {
  return (
    <Modal title="Assign KPI" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          try {
            await save({
              employee_id: String(d.get("employee")),
              title: String(d.get("title")),
              category: String(d.get("category")),
              target_value: Number(d.get("target")),
              target_unit: String(d.get("unit")),
              weight: Number(d.get("weight")),
              period_start: String(d.get("start")),
              period_end: String(d.get("end")),
              description: String(d.get("description")),
            });
          } catch (x) {
            toast.error(
              x instanceof Error ? x.message : "Unable to assign KPI",
            );
          }
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <select name="employee" required className="input sm:col-span-2">
          <option value="">Select employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
        {[
          ["title", "KPI title"],
          ["category", "Category"],
          ["unit", "Unit"],
        ].map(([n, p]) => (
          <input key={n} name={n} required placeholder={p} className="input" />
        ))}
        <input
          name="target"
          required
          type="number"
          placeholder="Target"
          className="input"
        />
        <input
          name="weight"
          required
          type="number"
          min="1"
          max="100"
          placeholder="Weight %"
          className="input"
        />
        <input name="start" required type="date" className="input" />
        <input name="end" required type="date" className="input" />
        <textarea
          name="description"
          required
          placeholder="Measurement criteria"
          className="input min-h-20 sm:col-span-2"
        />
        <button className="rounded bg-emerald-700 py-2 text-sm text-white sm:col-span-2">
          Assign KPI
        </button>
      </form>
    </Modal>
  );
}
function ReviewDialog({
  goal,
  close,
  save,
}: {
  goal: Goal;
  close: () => void;
  save: (
    g: Goal,
    a: number,
    s: number,
    c: string,
    submit: boolean,
  ) => Promise<void>;
}) {
  const [actual, setActual] = useState(String(goal.actual_value ?? "")),
    [score, setScore] = useState(String(goal.score ?? "")),
    [comment, setComment] = useState(goal.manager_comment ?? "");
  return (
    <Modal title="Review KPI" close={close}>
      <label className="text-xs">
        Actual value
        <input
          type="number"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="mt-3 block text-xs">
        Score (0–100)
        <input
          type="number"
          min="0"
          max="100"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="mt-3 block text-xs">
        Evidence-based feedback
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="input mt-1 min-h-24"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={() =>
            void save(goal, Number(actual), Number(score), comment, false)
          }
          className="rounded border px-4 py-2 text-sm"
        >
          Save draft
        </button>
        <button
          onClick={() =>
            void save(goal, Number(actual), Number(score), comment, true)
          }
          className="rounded bg-emerald-700 px-4 py-2 text-sm text-white"
        >
          Submit review
        </button>
      </div>
    </Modal>
  );
}
function AssignTraining({
  employees,
  courses,
  close,
  save,
}: {
  employees: Employee[];
  courses: Course[];
  close: () => void;
  save: (e: string, c: string, d: string) => Promise<void>;
}) {
  return (
    <Modal title="Assign training" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          try {
            await save(
              String(d.get("employee")),
              String(d.get("course")),
              String(d.get("due")),
            );
          } catch (x) {
            toast.error(
              x instanceof Error ? x.message : "Unable to assign training",
            );
          }
        }}
        className="space-y-3"
      >
        <select name="employee" required className="input">
          <option value="">Select employee</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
        <select name="course" required className="input">
          <option value="">Select course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <input name="due" required type="date" className="input" />
        <button className="w-full rounded bg-emerald-700 py-2 text-sm text-white">
          Assign training
        </button>
      </form>
    </Modal>
  );
}
