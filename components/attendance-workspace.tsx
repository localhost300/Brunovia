"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  Download,
  Fingerprint,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  captureFingerprint,
  ensureBiometricGatewayReady,
  getEnrollmentProgress,
  type EnrollmentProgress,
} from "@/lib/biometrics/gateway";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { dateKey } from "@/lib/workforce/rules";
import type { AppUser } from "@/types/database";

type AttendanceRow = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  location: string | null;
  device_id: string | null;
  status: string;
  employees?: {
    employee_id: string;
    first_name: string;
    last_name: string;
  } | null;
  shifts?: { name: string } | null;
};
type EmployeeOption = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
};
type ShiftOption = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

export function AttendanceWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig();
  const privileged = user.role !== "EMPLOYEE";
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [day, setDay] = useState(dateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<EnrollmentProgress>({
    stage: "IDLE",
    scan: 0,
    message: "Ready to verify attendance",
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured) {
      setError("Supabase is not configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = createClient();
      const [attendanceResult, employeeResult, shiftResult] = await Promise.all(
        [
          client
            .from("attendance")
            .select(
              "id,employee_id,work_date,clock_in,clock_out,location,device_id,status,employees(employee_id,first_name,last_name),shifts(name)",
            )
            .eq("work_date", day)
            .order("clock_in", { ascending: false }),
          client
            .from("employees")
            .select("id,employee_id,first_name,last_name")
            .is("deleted_at", null)
            .eq("status", "ACTIVE")
            .order("first_name"),
          client
            .from("shifts")
            .select("id,name,start_time,end_time")
            .is("deleted_at", null)
            .order("start_time"),
        ],
      );
      if (attendanceResult.error) throw attendanceResult.error;
      if (employeeResult.error) throw employeeResult.error;
      if (shiftResult.error) throw shiftResult.error;
      setRows((attendanceResult.data ?? []) as unknown as AttendanceRow[]);
      setEmployees((employeeResult.data ?? []) as EmployeeOption[]);
      setShifts((shiftResult.data ?? []) as ShiftOption[]);
      if (!employeeId && employeeResult.data?.length === 1)
        setEmployeeId(employeeResult.data[0].id);
      if (!shiftId && shiftResult.data?.[0]) setShiftId(shiftResult.data[0].id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load attendance",
      );
    } finally {
      setLoading(false);
    }
  }, [configured, day, employeeId, shiftId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!working || !employeeId) return;
    const timer = window.setInterval(() => {
      void getEnrollmentProgress(employeeId)
        .then(setScanProgress)
        .catch(() => undefined);
    }, 350);
    return () => window.clearInterval(timer);
  }, [employeeId, working]);

  const clock = async () => {
    if (!employeeId || !shiftId)
      return toast.error("Select an employee and shift");
    setWorking(true);
    setScanError(null);
    setScanProgress({
      stage: "PLACE_FINGER",
      scan: 1,
      message: "Place the enrolled finger flat on the scanner",
    });
    try {
      await ensureBiometricGatewayReady();
      const capture = await captureFingerprint({
        employeeId,
        purpose: "VERIFY",
        deviceId: "primary-attendance-device",
      });
      if (configured) {
        const { data, error: rpcError } = await createClient().rpc(
          "record_attendance_event",
          {
            p_employee_id: employeeId,
            p_shift_id: shiftId,
            p_device_id: capture.deviceId,
            p_location: "HQ · Lagos",
            p_capture_id: capture.captureId,
          },
        );
        if (rpcError) throw rpcError;
        toast.success(
          String(data)
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/^./, (letter) => letter.toUpperCase()),
        );
        await load();
      } else throw new Error("Supabase is not configured");
    } catch (caught) {
      setScanError(
        caught instanceof Error ? caught.message : "Attendance event failed",
      );
    } finally {
      setWorking(false);
    }
  };
  const exportRows = () => {
    const csv = [
      [
        "Employee ID",
        "Employee",
        "Date",
        "Shift",
        "Clock in",
        "Clock out",
        "Status",
      ],
      ...rows.map((row) => [
        row.employees?.employee_id ?? "",
        `${row.employees?.first_name ?? ""} ${row.employees?.last_name ?? ""}`.trim(),
        row.work_date,
        row.shifts?.name ?? "",
        row.clock_in ?? "",
        row.clock_out ?? "",
        row.status,
      ]),
    ]
      .map((line) =>
        line
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `attendance-${day}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verified clock events with shift-level duplicate protection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">
            Work date
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="input mt-1"
            />
          </label>
          <button
            onClick={exportRows}
            className="self-end rounded-lg border px-3 py-2 text-sm"
          >
            <Download className="mr-2 inline" size={15} />
            Export
          </button>
          <button
            onClick={() => void load()}
            className="self-end rounded-lg border p-2"
            aria-label="Refresh"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ["Present", rows.filter((r) => r.status === "PRESENT").length],
          ["Late", rows.filter((r) => r.status === "LATE").length],
          [
            "Open shifts",
            rows.filter((r) => r.clock_in && !r.clock_out).length,
          ],
        ].map(([label, value]) => (
          <section
            key={label}
            className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
          >
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-white p-4 dark:bg-zinc-950">
        {privileged && (
          <div className="mb-4 grid gap-3 border-b pb-4 md:grid-cols-[1fr_1fr_auto]">
            <select
              aria-label="Employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="input"
            >
              <option value="">Select employee</option>
              {employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.first_name} {item.last_name} · {item.employee_id}
                </option>
              ))}
            </select>
            <select
              aria-label="Shift"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="input"
            >
              <option value="">Select shift</option>
              {shifts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.start_time.slice(0, 5)}–
                  {item.end_time.slice(0, 5)}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!employeeId || !shiftId)
                  return toast.error("Select an employee and shift");
                setScanProgress({
                  stage: "IDLE",
                  scan: 0,
                  message: "Ready to verify attendance",
                });
                setScanError(null);
                setShowScanner(true);
              }}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {working ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Fingerprint size={16} />
              )}
              Record verified event
            </button>
          </div>
        )}
        {loading ? (
          <div className="grid min-h-52 place-items-center">
            <Loader2 className="animate-spin text-emerald-700" />
          </div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <Clock3 className="mx-auto text-zinc-300" />
            <p className="mt-3 font-medium">No attendance records</p>
            <p className="text-sm text-zinc-500">
              No clock events were recorded for this date.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  {[
                    "Employee",
                    "Shift",
                    "Clock in",
                    "Clock out",
                    "Location",
                    "Device",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="px-3 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-3 font-medium">
                      {row.employees?.first_name} {row.employees?.last_name}
                      <span className="block text-xs font-normal text-zinc-400">
                        {row.employees?.employee_id}
                      </span>
                    </td>
                    <td className="px-3">{row.shifts?.name ?? "Unassigned"}</td>
                    <td className="px-3">
                      {row.clock_in
                        ? new Date(row.clock_in).toLocaleTimeString("en-NG", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-3">
                      {row.clock_out
                        ? new Date(row.clock_out).toLocaleTimeString("en-NG", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-3">{row.location ?? "—"}</td>
                    <td className="px-3">{row.device_id ?? "—"}</td>
                    <td className="px-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${row.status === "ABSENT" ? "bg-red-100 font-medium text-red-800" : row.status === "LATE" ? "bg-red-50 text-red-700" : row.status === "PRESENT" ? "bg-emerald-50 text-emerald-700" : row.status === "OVERTIME" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showScanner && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Attendance fingerprint verification"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Verify attendance</h2>
                <p className="text-sm text-zinc-500">
                  {employees.find((item) => item.id === employeeId)?.first_name}{" "}
                  {employees.find((item) => item.id === employeeId)?.last_name}
                </p>
              </div>
              <button
                disabled={working}
                onClick={() => setShowScanner(false)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <div className="my-6 grid place-items-center rounded-2xl bg-emerald-50 p-8 text-center dark:bg-emerald-950/30">
              <Fingerprint
                className={
                  working
                    ? "animate-pulse text-emerald-700"
                    : "text-emerald-700"
                }
                size={54}
              />
              <p className="mt-4 text-lg font-semibold">
                {scanProgress.message}
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Place the same finger that was enrolled. Keep it flat and still
                until verification completes.
              </p>
            </div>
            {scanError && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {scanError}
              </p>
            )}
            {scanProgress.stage === "COMPLETED" && !scanError ? (
              <button
                onClick={() => setShowScanner(false)}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
              >
                Done
              </button>
            ) : (
              <button
                disabled={working}
                onClick={() => void clock()}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {working
                  ? "Verifying…"
                  : scanError
                    ? "Try again"
                    : "Start verification"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
