"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Loader2,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  canMoveCandidate,
  recruitmentStages,
  type RecruitmentStage,
} from "@/lib/recruitment/rules";

type Job = {
  id: string;
  title: string;
  department_id: string | null;
  employment_type: string;
  location: string | null;
  status: string;
  closing_date: string | null;
  departments?: { name: string } | null;
};
type Candidate = {
  id: string;
  job_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  stage: RecruitmentStage;
  source: string | null;
  applied_at: string;
  jobs?: { title: string } | null;
};
const demoJobs: Job[] = [
  {
    id: "demo-job",
    title: "Senior Software Engineer",
    department_id: null,
    employment_type: "FULL_TIME",
    location: "Lagos · Hybrid",
    status: "OPEN",
    closing_date: null,
    departments: { name: "Engineering" },
  },
];
const demoCandidates: Candidate[] = [
  {
    id: "demo-candidate",
    job_id: "demo-job",
    first_name: "Ada",
    last_name: "Bello",
    email: "ada@example.com",
    phone: "+234 800 000 0000",
    stage: "INTERVIEW",
    source: "Referral",
    applied_at: new Date().toISOString(),
    jobs: { title: "Senior Software Engineer" },
  },
];
const stageLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase());

export function RecruitmentWorkspace() {
  const configured = hasSupabaseConfig();
  const [jobs, setJobs] = useState<Job[]>(configured ? [] : demoJobs);
  const [candidates, setCandidates] = useState<Candidate[]>(
    configured ? [] : demoCandidates,
  );
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [dialog, setDialog] = useState<"job" | "candidate" | null>(null);
  const [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const client = createClient();
      const [jr, cr] = await Promise.all([
        client
          .from("recruitment_jobs")
          .select(
            "id,title,department_id,employment_type,location,status,closing_date,departments(name)",
          )
          .order("created_at", { ascending: false }),
        client
          .from("recruitment_candidates")
          .select(
            "id,job_id,first_name,last_name,email,phone,stage,source,applied_at,jobs:recruitment_jobs(title)",
          )
          .order("applied_at", { ascending: false }),
      ]);
      if (jr.error) throw jr.error;
      if (cr.error) throw cr.error;
      setJobs(jr.data as unknown as Job[]);
      setCandidates(cr.data as unknown as Candidate[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load recruitment");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (!jobFilter || c.job_id === jobFilter) &&
          `${c.first_name} ${c.last_name} ${c.email}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [candidates, jobFilter, query],
  );
  const createJob = async (input: Omit<Job, "id" | "departments">) => {
    setWorking(true);
    try {
      if (configured) {
        const { error: e } = await createClient()
          .from("recruitment_jobs")
          .insert(input);
        if (e) throw e;
        await load();
      } else
        setJobs((v) => [
          { ...input, id: crypto.randomUUID(), departments: null },
          ...v,
        ]);
      setDialog(null);
      toast.success("Job created");
    } finally {
      setWorking(false);
    }
  };
  const createCandidate = async (input: {
    job_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    source: string;
  }) => {
    setWorking(true);
    try {
      if (configured) {
        const { error: e } = await createClient()
          .from("recruitment_candidates")
          .insert({ ...input, stage: "APPLIED" });
        if (e) throw e;
        await load();
      } else
        setCandidates((v) => [
          {
            ...input,
            id: crypto.randomUUID(),
            stage: "APPLIED",
            applied_at: new Date().toISOString(),
            jobs: {
              title: jobs.find((j) => j.id === input.job_id)?.title ?? "Job",
            },
          },
          ...v,
        ]);
      setDialog(null);
      toast.success("Candidate added");
    } finally {
      setWorking(false);
    }
  };
  const move = async (candidate: Candidate, next: RecruitmentStage) => {
    if (!canMoveCandidate(candidate.stage, next))
      return toast.error("That stage transition is not allowed");
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "move_recruitment_candidate",
          { p_candidate_id: candidate.id, p_stage: next, p_note: null },
        );
        if (e) throw e;
        await load();
      } else
        setCandidates((v) =>
          v.map((c) => (c.id === candidate.id ? { ...c, stage: next } : c)),
        );
      toast.success(`Candidate moved to ${stageLabel(next)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to move candidate");
    }
  };
  const hire = async (candidate: Candidate) => {
    const employeeId = window.prompt(
      "Employee ID for the new hire (for example PF-1025)",
    );
    if (!employeeId) return;
    const salary = Number(
      window.prompt("Accepted annual salary (NGN)", "6000000"),
    );
    if (!Number.isFinite(salary) || salary < 0)
      return toast.error("Enter a valid accepted salary");
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "accept_offer_and_convert_candidate",
          {
            p_candidate_id: candidate.id,
            p_employee_code: employeeId,
            p_employment_date: new Date().toISOString().slice(0, 10),
            p_offered_salary: salary,
          },
        );
        if (e) throw e;
        await load();
      } else
        setCandidates((v) =>
          v.map((c) => (c.id === candidate.id ? { ...c, stage: "HIRED" } : c)),
        );
      toast.success(
        "Accepted offer recorded; employee and onboarding plan created",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to hire candidate");
    }
  };
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Recruitment</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Jobs, candidates, interviews, offers, and onboarding conversion.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDialog("candidate")}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            <UserPlus className="mr-2 inline" size={16} />
            Add candidate
          </button>
          <button
            onClick={() => setDialog("job")}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="mr-2 inline" size={16} />
            Create job
          </button>
        </div>
      </div>
      {!configured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Demo mode: recruitment changes are temporary.
        </div>
      )}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Open positions", jobs.filter((j) => j.status === "OPEN").length],
          [
            "Active candidates",
            candidates.filter(
              (c) => !["HIRED", "REJECTED", "WITHDRAWN"].includes(c.stage),
            ).length,
          ],
          ["Offers", candidates.filter((c) => c.stage === "OFFER").length],
        ].map(([a, b]) => (
          <section
            key={a}
            className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{a}</p>
            <p className="mt-2 text-3xl font-semibold">{b}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <div className="grid gap-3 border-b pb-4 sm:grid-cols-[1fr_260px]">
          <label className="flex items-center gap-2 rounded-lg border px-3">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="input"
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="grid min-h-60 place-items-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-red-600">{error}</p>
        ) : visible.length === 0 ? (
          <div className="py-14 text-center">
            <BriefcaseBusiness className="mx-auto text-zinc-300" />
            <p className="mt-3 font-medium">No candidates found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  {["Candidate", "Job", "Applied", "Stage", "Next action"].map(
                    (h) => (
                      <th key={h} className="px-3 py-4 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-3">
                      <p className="font-medium">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {c.email} · {c.source ?? "Direct"}
                      </p>
                    </td>
                    <td className="px-3">{c.jobs?.title}</td>
                    <td className="px-3">
                      {new Date(c.applied_at).toLocaleDateString("en-NG")}
                    </td>
                    <td className="px-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                        {stageLabel(c.stage)}
                      </span>
                    </td>
                    <td className="px-3">
                      <div className="flex gap-2">
                        {c.stage === "OFFER" ? (
                          <button
                            onClick={() => void hire(c)}
                            className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
                          >
                            Hire & onboard
                          </button>
                        ) : (
                          c.stage !== "HIRED" &&
                          !["REJECTED", "WITHDRAWN"].includes(c.stage) && (
                            <select
                              aria-label={`Move ${c.first_name}`}
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value)
                                  void move(
                                    c,
                                    e.target.value as RecruitmentStage,
                                  );
                                e.target.value = "";
                              }}
                              className="rounded border px-2 py-1.5 text-xs"
                            >
                              <option value="">Move stage…</option>
                              {recruitmentStages
                                .filter((s) => canMoveCandidate(c.stage, s))
                                .map((s) => (
                                  <option key={s} value={s}>
                                    {stageLabel(s)}
                                  </option>
                                ))}
                            </select>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog === "job" && (
        <JobDialog
          working={working}
          close={() => setDialog(null)}
          save={createJob}
        />
      )}{" "}
      {dialog === "candidate" && (
        <CandidateDialog
          jobs={jobs.filter((j) => j.status === "OPEN")}
          working={working}
          close={() => setDialog(null)}
          save={createCandidate}
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
      <div
        className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-zinc-950"
        onMouseDown={(e) => e.stopPropagation()}
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
function JobDialog({
  working,
  close,
  save,
}: {
  working: boolean;
  close: () => void;
  save: (v: Omit<Job, "id" | "departments">) => Promise<void>;
}) {
  return (
    <Modal title="Create job" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void save({
            title: String(d.get("title")),
            department_id: null,
            employment_type: String(d.get("type")),
            location: String(d.get("location")),
            status: "OPEN",
            closing_date: String(d.get("closing")) || null,
          });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="text-xs">
          Job title
          <input name="title" required className="input mt-1.5" />
        </label>
        <label className="text-xs">
          Employment type
          <select name="type" className="input mt-1.5">
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </label>
        <label className="text-xs">
          Location
          <input name="location" required className="input mt-1.5" />
        </label>
        <label className="text-xs">
          Closing date
          <input name="closing" type="date" className="input mt-1.5" />
        </label>
        <button
          disabled={working}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white sm:col-span-2"
        >
          Create job
        </button>
      </form>
    </Modal>
  );
}
function CandidateDialog({
  jobs,
  working,
  close,
  save,
}: {
  jobs: Job[];
  working: boolean;
  close: () => void;
  save: (v: {
    job_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    source: string;
  }) => Promise<void>;
}) {
  return (
    <Modal title="Add candidate" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void save({
            job_id: String(d.get("job")),
            first_name: String(d.get("first")),
            last_name: String(d.get("last")),
            email: String(d.get("email")),
            phone: String(d.get("phone")),
            source: String(d.get("source")),
          });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <label className="text-xs sm:col-span-2">
          Job
          <select name="job" required className="input mt-1.5">
            <option value="">Select job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          First name
          <input name="first" required className="input mt-1.5" />
        </label>
        <label className="text-xs">
          Last name
          <input name="last" required className="input mt-1.5" />
        </label>
        <label className="text-xs">
          Email
          <input name="email" type="email" required className="input mt-1.5" />
        </label>
        <label className="text-xs">
          Phone
          <input name="phone" required className="input mt-1.5" />
        </label>
        <label className="text-xs sm:col-span-2">
          Source
          <input
            name="source"
            placeholder="Referral, careers page…"
            className="input mt-1.5"
          />
        </label>
        <button
          disabled={working}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white sm:col-span-2"
        >
          Add candidate
        </button>
      </form>
    </Modal>
  );
}
