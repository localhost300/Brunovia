"use client";
/* eslint-disable @typescript-eslint/no-unused-vars -- The AppUser prop documents the RLS authorization boundary. */
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Download, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
type ExportRow = {
  id: string;
  name: string;
  report_type: string;
  date_from: string | null;
  date_to: string | null;
  format: string;
  delivery: string;
  status: string;
  storage_path: string | null;
  created_at: string;
  completed_at: string | null;
};
type Metrics = {
  month: string;
  attendance_records: number;
  late_arrivals: number;
  absences: number;
  active_employees: number;
  hours_worked: number;
};
export function ReportsWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig();
  const [exports, setExports] = useState<ExportRow[]>([]),
    [metrics, setMetrics] = useState<Metrics[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!configured) {
      setError("Supabase is not configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const c = createClient();
      const [e, m] = await Promise.all([
        c
          .from("report_exports")
          .select(
            "id,name,report_type,date_from,date_to,format,delivery,status,storage_path,created_at,completed_at",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        c
          .from("workforce_monthly_metrics")
          .select(
            "month,attendance_records,late_arrivals,absences,active_employees,hours_worked",
          )
          .order("month", { ascending: false })
          .limit(12),
      ]);
      if (e.error) throw e.error;
      if (m.error) throw m.error;
      setExports(e.data as ExportRow[]);
      setMetrics(m.data as Metrics[]);
      setError(null);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const request = async (d: FormData) => {
    try {
      const input = {
        name: String(d.get("name")),
        report_type: String(d.get("type")),
        date_from: String(d.get("from")) || null,
        date_to: String(d.get("to")) || null,
        format: String(d.get("format")),
        delivery: String(d.get("delivery")),
        status: "QUEUED",
      };
      if (configured) {
        const { data: auth } = await createClient().auth.getUser();
        const { error: e } = await createClient()
          .from("report_exports")
          .insert({ ...input, created_by: auth.user?.id });
        if (e) throw e;
        await load();
      } else throw new Error("Supabase is not configured");
      setCreating(false);
      toast.success("Report queued with your authorized data scope");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to request report");
    }
  };
  const download = async (r: ExportRow) => {
    if (configured && r.storage_path) {
      const { data, error: e } = await createClient()
        .storage.from("report-exports")
        .createSignedUrl(r.storage_path, 60);
      if (e) throw e;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const csv = `Report,${r.name}\nType,${r.report_type}\nPeriod,${r.date_from ?? ""} to ${r.date_to ?? ""}\nStatus,${r.status}\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${r.name.replaceAll(" ", "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const latest = metrics[0];
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Authorized workforce analytics, exports, schedules, and delivery
            history.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-emerald-700 px-4 py-2 text-sm text-white"
        >
          <Plus className="mr-1 inline" size={15} />
          Generate report
        </button>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        {[
          ["Active employees", latest?.active_employees ?? 0],
          ["Attendance records", latest?.attendance_records ?? 0],
          ["Late arrivals", latest?.late_arrivals ?? 0],
          ["Hours worked", latest?.hours_worked ?? 0],
        ].map(([a, b]) => (
          <section
            key={a}
            className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{a}</p>
            <p className="mt-2 text-2xl font-semibold">{b}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
        <h2 className="font-semibold">Report history</h2>
        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-red-600">{error}</p>
        ) : exports.length === 0 ? (
          <div className="py-14 text-center text-zinc-400">
            <BarChart3 className="mx-auto" />
            <p className="mt-2">No reports generated</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Report",
                    "Type",
                    "Period",
                    "Format",
                    "Delivery",
                    "Status",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-xs font-medium text-zinc-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exports.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-3 font-medium">
                      {r.name}
                      <span className="block text-xs text-zinc-400">
                        {new Date(r.created_at).toLocaleString("en-NG")}
                      </span>
                    </td>
                    <td className="px-3">{r.report_type}</td>
                    <td className="px-3 text-xs">
                      {r.date_from ?? "All time"}
                      {r.date_to ? ` – ${r.date_to}` : ""}
                    </td>
                    <td className="px-3">{r.format}</td>
                    <td className="px-3">{r.delivery}</td>
                    <td className="px-3">{r.status}</td>
                    <td className="px-3">
                      <button
                        disabled={r.status !== "COMPLETED"}
                        onClick={() => void download(r)}
                        className="rounded border px-2 py-1 disabled:opacity-40"
                      >
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && (
        <Modal close={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void request(new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <input
              name="name"
              required
              placeholder="Report name"
              className="input"
            />
            <select name="type" className="input">
              <option value="WORKFORCE">Workforce summary</option>
              <option value="ATTENDANCE">Attendance</option>
              <option value="LEAVE">Leave</option>
              <option value="PAYROLL">Payroll cost</option>
              <option value="TRAINING">Training compliance</option>
              <option value="RECRUITMENT">Recruitment funnel</option>
              <option value="AUDIT">Audit activity</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input name="from" type="date" className="input" />
              <input name="to" type="date" className="input" />
              <select name="format" className="input">
                <option>CSV</option>
                <option>PDF</option>
                <option>EXCEL</option>
              </select>
              <select name="delivery" className="input">
                <option>DOWNLOAD</option>
                <option>EMAIL</option>
              </select>
            </div>
            <p className="text-xs text-zinc-500">
              Exports are generated asynchronously and remain restricted to your
              database authorization scope.
            </p>
            <button className="w-full rounded bg-emerald-700 py-2 text-sm text-white">
              Queue report
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Modal({
  close,
  children,
}: {
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={close}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-zinc-950"
      >
        <div className="mb-4 flex justify-between">
          <h2 className="font-semibold">Generate report</h2>
          <button onClick={close}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
