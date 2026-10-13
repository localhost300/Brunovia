"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserMinus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  captureFingerprint,
  ensureBiometricGatewayReady,
  getEnrollmentProgress,
  type EnrollmentProgress,
} from "@/lib/biometrics/gateway";
import type { AppUser } from "@/types/database";

type Department = { id: string; name: string };
type EmployeeRow = {
  id: string;
  employee_id: string;
  user_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  emergency_contact: { name?: string; phone?: string } | null;
  position: string;
  employment_type: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  employment_date: string;
  status: string;
  avatar_url: string | null;
  department?: { name: string } | null;
  manager?: { first_name: string; last_name: string } | null;
};

const employeeSchema = z.object({
  employee_id: z.string().trim().max(40),
  first_name: z.string().trim().min(2, "First name is required").max(80),
  last_name: z.string().trim().min(2, "Last name is required").max(80),
  email: z.string().trim().email("Enter a valid work email").max(254),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  address: z.string().trim().min(5, "Address is required").max(500),
  emergency_name: z
    .string()
    .trim()
    .min(2, "Emergency contact is required")
    .max(120),
  emergency_phone: z
    .string()
    .trim()
    .min(7, "Emergency phone is required")
    .max(30),
  department_id: z.string().uuid("Select a department"),
  manager_id: z.string().uuid().nullable(),
  position: z.string().trim().min(2, "Position is required").max(120),
  employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  employment_date: z.string().date(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
});
type EmployeeInput = z.infer<typeof employeeSchema>;

const PAGE_SIZE = 10;
const statusLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const typeLabel = (value: string) =>
  statusLabel(value)
    .replace("Full time", "Full-time")
    .replace("Part time", "Part-time");
const initials = (employee: EmployeeRow) =>
  `${employee.first_name[0] ?? ""}${employee.last_name[0] ?? ""}`.toUpperCase();

function emptyInput(): EmployeeInput {
  return {
    employee_id: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    emergency_name: "",
    emergency_phone: "",
    department_id: "",
    manager_id: null,
    position: "",
    employment_type: "FULL_TIME",
    employment_date: new Date().toISOString().slice(0, 10),
    status: "ACTIVE",
  } as EmployeeInput;
}

export function EmployeesWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig();
  const canManage = user.role === "SUPER_ADMIN" || user.role === "HR_MANAGER";
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<EmployeeRow[]>([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "create" | "profile">("list");
  const [selected, setSelected] = useState<EmployeeRow | null>(null);
  const [editing, setEditing] = useState(false);

  const loadReferenceData = useCallback(async () => {
    if (!configured) return;
    const client = createClient();
    const [departmentResult, managerResult] = await Promise.all([
      client
        .from("departments")
        .select("id,name")
        .is("deleted_at", null)
        .order("name"),
      client
        .from("employees")
        .select(
          "id,employee_id,user_id,department_id,manager_id,first_name,last_name,email,phone,address,emergency_contact,position,employment_type,employment_date,status,avatar_url",
        )
        .is("deleted_at", null)
        .eq("status", "ACTIVE")
        .order("first_name"),
    ]);
    if (departmentResult.error) throw departmentResult.error;
    if (managerResult.error) throw managerResult.error;
    setDepartments((departmentResult.data ?? []) as Department[]);
    setManagers((managerResult.data ?? []) as EmployeeRow[]);
  }, [configured]);

  const loadEmployees = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setLoadError(null);
    try {
      let request = createClient()
        .from("employees")
        .select(
          "id,employee_id,user_id,department_id,manager_id,first_name,last_name,email,phone,address,emergency_contact,position,employment_type,employment_date,status,avatar_url,department:departments!employees_department_id_fkey(name)",
          { count: "exact" },
        )
        .is("deleted_at", null);
      const search = query.trim().replace(/[,%()]/g, "");
      if (search)
        request = request.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%,position.ilike.%${search}%`,
        );
      if (department) request = request.eq("department_id", department);
      if (status) request = request.eq("status", status);
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await request
        .order("first_name")
        .order("last_name")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setEmployees((data ?? []) as unknown as EmployeeRow[]);
      setTotal(count ?? 0);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load employees",
      );
    } finally {
      setLoading(false);
    }
  }, [configured, department, page, query, status]);

  useEffect(() => {
    void loadReferenceData().catch((error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load employee options",
      ),
    );
  }, [loadReferenceData]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadEmployees(), 250);
    return () => window.clearTimeout(timer);
  }, [loadEmployees]);

  const visibleEmployees = employees;
  const resultTotal = total;
  const pageCount = Math.max(1, Math.ceil(resultTotal / PAGE_SIZE));

  const refresh = async () => {
    await Promise.all([loadReferenceData(), loadEmployees()]);
  };
  const openProfile = (employee: EmployeeRow) => {
    setSelected(employee);
    setEditing(false);
    setMode("profile");
  };
  const saveEmployee = async (input: EmployeeInput, employee?: EmployeeRow) => {
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success)
      throw new Error(
        parsed.error.issues[0]?.message ?? "Check the employee details",
      );
    const { emergency_name, emergency_phone, employee_id, ...fields } =
      parsed.data;
    const payload = {
      ...fields,
      ...(employee ? { employee_id } : {}),
      manager_id: fields.manager_id || null,
      emergency_contact: { name: emergency_name, phone: emergency_phone },
      updated_at: new Date().toISOString(),
    };
    if (configured) {
      const client = createClient();
      const result = employee
        ? await client
            .from("employees")
            .update(payload)
            .eq("id", employee.id)
            .select("id")
            .single()
        : await client.from("employees").insert(payload).select("id").single();
      if (result.error) throw result.error;
      await refresh();
    } else throw new Error("Supabase is not configured");
  };
  const deactivate = async (employee: EmployeeRow) => {
    if (configured) {
      const { error } = await createClient()
        .from("employees")
        .update({
          status: "INACTIVE",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", employee.id);
      if (error) throw error;
      await refresh();
    } else throw new Error("Supabase is not configured");
    setMode("list");
    setSelected(null);
  };

  if (mode === "create")
    return (
      <EmployeeForm
        departments={departments}
        managers={managers}
        onCancel={() => setMode("list")}
        onSave={async (values) => {
          await saveEmployee(values);
          toast.success("Employee created and recorded in the audit log");
          setMode("list");
        }}
      />
    );
  if (mode === "profile" && selected)
    return (
      <EmployeeProfile
        employee={selected}
        departments={departments}
        managers={managers}
        canManage={canManage}
        configured={configured}
        editing={editing}
        setEditing={setEditing}
        onBack={() => setMode("list")}
        onSave={async (values) => {
          await saveEmployee(values, selected);
          toast.success("Employee profile updated");
          setEditing(false);
          setMode("list");
        }}
        onDeactivate={async () => {
          await deactivate(selected);
          toast.success(
            "Employee deactivated; historical records were retained",
          );
        }}
      />
    );

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Search and manage authorized employee records.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setMode("create")}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Add employee
          </button>
        )}
      </div>
      <section className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="grid gap-3 border-b pb-4 md:grid-cols-[1fr_220px_180px_auto]">
          <label className="flex items-center gap-2 rounded-lg border px-3">
            <Search size={16} className="text-zinc-400" />
            <span className="sr-only">Search employees</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Name, email, ID, or position"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </label>
          <select
            aria-label="Department"
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="">All departments</option>
            {departments.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Employment status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button
            aria-label="Refresh employees"
            onClick={() => void refresh()}
            className="rounded-lg border p-2 text-zinc-500"
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {loading ? (
          <div className="grid min-h-56 place-items-center">
            <Loader2 className="animate-spin text-emerald-700" />
          </div>
        ) : loadError ? (
          <div className="py-12 text-center">
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              onClick={() => void loadEmployees()}
              className="mt-3 rounded-lg border px-4 py-2 text-sm"
            >
              Try again
            </button>
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-medium">No employees found</p>
            <p className="mt-1 text-sm text-zinc-500">
              Change the filters or create the first employee.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  {[
                    "Employee",
                    "Employee ID",
                    "Department",
                    "Status",
                    "Contact",
                    "",
                  ].map((heading) => (
                    <th className="px-3 py-4 font-medium" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee) => (
                  <tr className="border-t" key={employee.id}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                          {initials(employee)}
                        </span>
                        <div>
                          <p className="font-medium">
                            {employee.first_name} {employee.last_name}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {employee.position}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-zinc-500">
                      {employee.employee_id}
                    </td>
                    <td className="px-3">
                      {employee.department?.name ?? "Unassigned"}
                    </td>
                    <td className="px-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${employee.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : employee.status === "ON_LEAVE" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}
                      >
                        {statusLabel(employee.status)}
                      </span>
                    </td>
                    <td className="px-3 text-zinc-500">{employee.email}</td>
                    <td className="px-3">
                      <button
                        onClick={() => openProfile(employee)}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                      >
                        View profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-4 text-xs text-zinc-500">
          <span>
            {resultTotal === 0
              ? "No results"
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, resultTotal)} of ${resultTotal}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-md border p-1 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-md border p-1 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function EmployeeForm({
  employee,
  departments,
  managers,
  onCancel,
  onSave,
}: {
  employee?: EmployeeRow;
  departments: Department[];
  managers: EmployeeRow[];
  onCancel: () => void;
  onSave: (values: EmployeeInput) => Promise<void>;
}) {
  const [values, setValues] = useState<EmployeeInput>(() =>
    employee
      ? {
          employee_id: employee.employee_id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          email: employee.email,
          phone: employee.phone ?? "",
          address: employee.address ?? "",
          emergency_name: employee.emergency_contact?.name ?? "",
          emergency_phone: employee.emergency_contact?.phone ?? "",
          department_id: employee.department_id ?? "",
          manager_id: employee.manager_id,
          position: employee.position,
          employment_type: employee.employment_type,
          employment_date: employee.employment_date,
          status: employee.status as EmployeeInput["status"],
        }
      : emptyInput(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof EmployeeInput, value: string | null) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(values);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to save employee";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button
        onClick={onCancel}
        className="mb-5 flex items-center gap-2 text-sm text-zinc-500"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {employee ? "Edit employee" : "Register employee"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Validated identity, contact, and employment information.
        </p>
      </div>
      <form onSubmit={submit} className="max-w-5xl space-y-5">
        <FormCard title="Personal information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input
                required
                value={values.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Last name">
              <input
                required
                value={values.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Work email">
              <input
                required
                type="email"
                value={values.email}
                onChange={(e) => update("email", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Phone">
              <input
                required
                type="tel"
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Address" wide>
              <input
                required
                value={values.address}
                onChange={(e) => update("address", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Emergency contact">
              <input
                required
                value={values.emergency_name}
                onChange={(e) => update("emergency_name", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Emergency phone">
              <input
                required
                type="tel"
                value={values.emergency_phone}
                onChange={(e) => update("emergency_phone", e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </FormCard>
        <FormCard title="Employment information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID">
              <input
                disabled
                value={employee?.employee_id ?? "Generated automatically"}
                className="input opacity-60"
              />
            </Field>
            <Field label="Department">
              <select
                required
                value={values.department_id}
                onChange={(e) => update("department_id", e.target.value)}
                className="input"
              >
                <option value="">Select department</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Position">
              <input
                required
                value={values.position}
                onChange={(e) => update("position", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Manager">
              <select
                value={values.manager_id ?? ""}
                onChange={(e) => update("manager_id", e.target.value || null)}
                className="input"
              >
                <option value="">No manager</option>
                {managers
                  .filter((item) => item.id !== employee?.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.first_name} {item.last_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select
                value={values.employment_type}
                onChange={(e) => update("employment_type", e.target.value)}
                className="input"
              >
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </Field>
            <Field label="Employment date">
              <input
                required
                type="date"
                value={values.employment_date}
                onChange={(e) => update("employment_date", e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Status">
              <select
                value={values.status}
                onChange={(e) => update("status", e.target.value)}
                className="input"
              >
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          </div>
        </FormCard>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-lg border px-5 py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {employee ? "Save changes" : "Create employee"}
          </button>
        </div>
      </form>
    </>
  );
}

function EmployeeProfile({
  employee,
  departments,
  managers,
  canManage,
  configured,
  editing,
  setEditing,
  onBack,
  onSave,
  onDeactivate,
}: {
  employee: EmployeeRow;
  departments: Department[];
  managers: EmployeeRow[];
  canManage: boolean;
  configured: boolean;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onBack: () => void;
  onSave: (values: EmployeeInput) => Promise<void>;
  onDeactivate: () => Promise<void>;
}) {
  const [deactivating, setDeactivating] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invitationSent, setInvitationSent] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [progress, setProgress] = useState<EnrollmentProgress>({
    stage: "IDLE",
    scan: 0,
    message: "Ready to begin",
  });
  useEffect(() => {
    void createClient()
      .from("biometric_enrollments")
      .select("id")
      .eq("employee_id", employee.id)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) setIsEnrolled(Boolean(data));
      });
  }, [employee.id]);
  useEffect(() => {
    if (!enrolling) return;
    const timer = window.setInterval(() => {
      void getEnrollmentProgress(employee.id)
        .then(setProgress)
        .catch(() => undefined);
    }, 350);
    return () => window.clearInterval(timer);
  }, [employee.id, enrolling]);
  const enrollFingerprint = async () => {
    setEnrolling(true);
    setEnrollmentError(null);
    setProgress({
      stage: "PLACE_FINGER",
      scan: 1,
      message: "Place the right index finger on the scanner",
    });
    try {
      await ensureBiometricGatewayReady();
      const capture = await captureFingerprint({
        employeeId: employee.id,
        purpose: "ENROLL",
        deviceId: "SLK20R-0",
      });
      const { error } = await createClient()
        .from("biometric_enrollments")
        .upsert(
          {
            employee_id: employee.id,
            vendor: "ZKTECO",
            device_id: capture.deviceId,
            template_reference: capture.templateReference,
            finger_position: "RIGHT_INDEX",
            enrolled_at: capture.capturedAt,
            revoked_at: null,
          },
          { onConflict: "employee_id,finger_position" },
        );
      if (error) throw error;
      setIsEnrolled(true);
      toast.success(
        `Fingerprint enrolled for ${employee.first_name} ${employee.last_name}`,
      );
    } catch (error) {
      setEnrollmentError(
        error instanceof Error
          ? error.message
          : "Fingerprint enrollment failed",
      );
    } finally {
      setEnrolling(false);
    }
  };
  const inviteEmployee = async () => {
    setInviting(true);
    const redirectTo = `${window.location.origin}/?setup=password`;
    const { data, error } = await createClient().functions.invoke(
      "invite-employee",
      { body: { employeeId: employee.id, redirectTo } },
    );
    setInviting(false);
    if (error) {
      let message = error.message;
      const context = (error as { context?: Response }).context;
      if (context) {
        const payload = (await context.clone().json().catch(() => null)) as {
          error?: string;
        } | null;
        if (payload?.error) message = payload.error;
      }
      return toast.error(message);
    }
    if (data?.error) return toast.error(String(data.error));
    setInvitationSent(true);
    toast.success(`Login invitation sent to ${employee.email}`);
  };
  if (editing)
    return (
      <EmployeeForm
        employee={employee}
        departments={departments}
        managers={managers}
        onCancel={() => setEditing(false)}
        onSave={onSave}
      />
    );
  const manager = managers.find((item) => item.id === employee.manager_id);
  const managerName = manager
    ? `${manager.first_name} ${manager.last_name}`
    : "Not assigned";
  const rows = [
    ["Employee ID", employee.employee_id],
    ["Email", employee.email],
    ["Phone", employee.phone || "Not provided"],
    ["Address", employee.address || "Not provided"],
    ["Department", employee.department?.name || "Unassigned"],
    ["Position", employee.position],
    ["Manager", managerName],
    ["Employment type", typeLabel(employee.employment_type)],
    [
      "Employment date",
      new Date(`${employee.employment_date}T12:00:00`).toLocaleDateString(
        "en-NG",
        { dateStyle: "long" },
      ),
    ],
    [
      "Emergency contact",
      `${employee.emergency_contact?.name ?? "Not provided"}${employee.emergency_contact?.phone ? ` · ${employee.emergency_contact.phone}` : ""}`,
    ],
  ];
  return (
    <>
      <button
        onClick={onBack}
        className="mb-5 flex items-center gap-2 text-sm text-zinc-500"
      >
        <ArrowLeft size={16} /> Back to employees
      </button>
      <section className="max-w-5xl rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-emerald-100 text-lg font-semibold text-emerald-800">
            {initials(employee)}
          </span>
          <div>
            <h1 className="text-xl font-semibold">
              {employee.first_name} {employee.last_name}
            </h1>
            <p className="text-sm text-zinc-500">
              {employee.position} · {employee.department?.name ?? "Unassigned"}
            </p>
            <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {statusLabel(employee.status)}
            </span>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button
                disabled={
                  Boolean(employee.user_id) || inviting || invitationSent
                }
                onClick={() => void inviteEmployee()}
                className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60"
              >
                {employee.user_id
                  ? "Login enabled"
                  : invitationSent
                    ? "Invitation sent"
                    : inviting
                      ? "Sending invitation…"
                      : "Send login invitation"}
              </button>
              {configured && (
                <button
                  disabled={isEnrolled}
                  onClick={() => setShowEnrollment(true)}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-60"
                >
                  <Fingerprint size={14} />
                  {isEnrolled ? "Fingerprint enrolled" : "Enroll fingerprint"}
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg border px-3 py-2 text-xs font-medium"
              >
                Edit profile
              </button>
              <button
                disabled={deactivating}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Deactivate ${employee.first_name} ${employee.last_name}? Historical records will be retained.`,
                    )
                  )
                    return;
                  setDeactivating(true);
                  try {
                    await onDeactivate();
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Unable to deactivate employee",
                    );
                    setDeactivating(false);
                  }
                }}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-60"
              >
                <UserMinus size={14} />
                {deactivating ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          )}
        </div>
        <div className="grid gap-3 pt-5 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900"
            >
              <p className="text-[11px] text-zinc-400">{label}</p>
              <p className="mt-1 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      </section>
      {showEnrollment && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Fingerprint enrollment"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Enroll fingerprint</h2>
                <p className="text-sm text-zinc-500">
                  {employee.first_name} {employee.last_name} · Right index
                  finger
                </p>
              </div>
              <button
                disabled={enrolling}
                onClick={() => setShowEnrollment(false)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <div className="my-6 grid place-items-center rounded-2xl bg-emerald-50 p-8 text-center dark:bg-emerald-950/30">
              <Fingerprint
                className={
                  enrolling
                    ? "animate-pulse text-emerald-700"
                    : "text-emerald-700"
                }
                size={54}
              />
              <p className="mt-4 text-lg font-semibold">{progress.message}</p>
              <p className="mt-2 text-sm text-zinc-500">
                {progress.stage === "IDLE"
                  ? "You will scan the same finger three times."
                  : progress.stage === "COMPLETED"
                    ? "Enrollment saved successfully."
                    : `Scan ${Math.max(progress.scan, 1)} of 3`}
              </p>
            </div>
            <div className="mb-5 flex justify-center gap-2">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`h-2 w-16 rounded-full ${progress.scan >= step ? "bg-emerald-600" : "bg-zinc-200"}`}
                />
              ))}
            </div>
            {enrollmentError && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {enrollmentError}
              </p>
            )}
            {progress.stage === "COMPLETED" ? (
              <button
                onClick={() => setShowEnrollment(false)}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
              >
                Done
              </button>
            ) : (
              <button
                disabled={enrolling}
                onClick={() => void enrollFingerprint()}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {enrolling
                  ? "Enrollment in progress…"
                  : enrollmentError
                    ? "Try again"
                    : "Start enrollment"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FormCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-zinc-950">
      <h2 className="mb-5 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`text-xs font-medium ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
