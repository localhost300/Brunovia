"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Webhook,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
type Job = {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
};
type Delivery = {
  id: string;
  event_type: string;
  response_status: number | null;
  duration_ms: number | null;
  delivered_at: string | null;
  created_at: string;
  webhook_endpoints: { name: string } | null;
};
export function AutomationWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig();
  const [jobs, setJobs] = useState<Job[]>([]),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [loading, setLoading] = useState(true),
    [status, setStatus] = useState("ALL");
  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const client = createClient();
    let query = client
      .from("background_jobs")
      .select(
        "id,job_type,status,attempts,max_attempts,run_after,last_error,created_at,completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "ALL") query = query.eq("status", status);
    const [jobResult, deliveryResult] = await Promise.all([
      query,
      client
        .from("webhook_deliveries")
        .select(
          "id,event_type,response_status,duration_ms,delivered_at,created_at,webhook_endpoints(name)",
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (jobResult.error) toast.error("Could not load background jobs");
    else setJobs(jobResult.data as Job[]);
    if (!deliveryResult.error)
      setDeliveries(deliveryResult.data as unknown as Delivery[]);
    setLoading(false);
  }, [configured, status]);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (job: Job, action: "retry" | "cancel") => {
    if (user.role !== "SUPER_ADMIN")
      return toast.error("Only Super Admins can manage jobs");
    if (configured) {
      const { error } = await createClient().rpc(
        action === "retry" ? "retry_background_job" : "cancel_background_job",
        { p_job_id: job.id },
      );
      if (error) return toast.error(error.message);
      await load();
    } else
      setJobs((rows) =>
        rows.map((row) =>
          row.id === job.id
            ? {
                ...row,
                status: action === "retry" ? "QUEUED" : "CANCELLED",
                attempts: action === "retry" ? 0 : row.attempts,
              }
            : row,
        ),
      );
    toast.success(action === "retry" ? "Job requeued" : "Job cancelled");
  };
  const counts = {
    queued: jobs.filter((j) => ["QUEUED", "RETRYING"].includes(j.status))
      .length,
    running: jobs.filter((j) => j.status === "RUNNING").length,
    dead: jobs.filter((j) => j.status === "DEAD_LETTER").length,
    done: jobs.filter((j) => j.status === "COMPLETED").length,
  };
  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Automation & integrations
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Monitor queued work, retries, dead letters, scheduled reports, and
            webhook deliveries.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Queued / retrying", counts.queued],
          ["Running", counts.running],
          ["Dead letter", counts.dead],
          ["Completed", counts.done],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border bg-white p-4 dark:bg-zinc-950"
          >
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
          </div>
        ))}
      </div>
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Background jobs</h2>
            <p className="text-xs text-zinc-500">
              Exponential retry is capped at one hour; exhausted jobs enter the
              dead-letter queue.
            </p>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border bg-transparent px-3 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            {[
              "QUEUED",
              "RUNNING",
              "RETRYING",
              "COMPLETED",
              "DEAD_LETTER",
              "CANCELLED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Created",
                    "Job type",
                    "Status",
                    "Attempts",
                    "Next run / completed",
                    "Last error",
                    "",
                  ].map((head) => (
                    <th
                      key={head}
                      className="px-3 py-3 text-xs font-medium text-zinc-400"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-3 text-xs">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 font-medium">{job.job_type}</td>
                    <td className="px-3">
                      <Status value={job.status} />
                    </td>
                    <td className="px-3">
                      {job.attempts}/{job.max_attempts}
                    </td>
                    <td className="px-3 text-xs">
                      {new Date(
                        job.completed_at ?? job.run_after,
                      ).toLocaleString()}
                    </td>
                    <td
                      className="max-w-64 truncate px-3 text-xs text-red-600"
                      title={job.last_error ?? ""}
                    >
                      {job.last_error ?? "—"}
                    </td>
                    <td className="px-3">
                      <div className="flex gap-2">
                        {["DEAD_LETTER", "CANCELLED"].includes(job.status) && (
                          <button
                            title="Retry"
                            onClick={() => void mutate(job, "retry")}
                            className="rounded border p-1.5"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {["QUEUED", "RETRYING"].includes(job.status) && (
                          <button
                            title="Cancel"
                            onClick={() => void mutate(job, "cancel")}
                            className="rounded border p-1.5 text-red-600"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length === 0 && (
              <p className="py-12 text-center text-sm text-zinc-500">
                No jobs match this status.
              </p>
            )}
          </div>
        )}
      </section>
      <section className="mt-5 rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <Webhook size={18} className="text-emerald-700" />
          <h2 className="font-semibold">Recent webhook deliveries</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No webhook deliveries recorded.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {deliveries.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.webhook_endpoints?.name ?? "Webhook"} ·{" "}
                    {item.event_type}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <span>{item.response_status ?? "Pending"}</span>
                <span className="text-xs text-zinc-400">
                  {item.duration_ms ?? "—"} ms
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = value === "COMPLETED",
    bad = value === "DEAD_LETTER",
    active = value === "RUNNING";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-red-50 text-red-700" : active ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
    >
      {active && <Activity size={11} className="animate-pulse" />}
      {value}
    </span>
  );
}
