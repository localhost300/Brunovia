"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps -- Legacy inline modules are isolated here for rollback compatibility while their typed routed replacements are adopted. */
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import type { AppUser, UserRole } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  Activity,
  AlarmClock,
  ArrowLeft,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  BriefcaseBusiness,
  CircleDollarSign,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Fingerprint,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Settings,
  Star,
  Sun,
  Target,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { LiveDashboard } from "@/components/live-dashboard";
import { RoleManagement } from "@/components/role-management";
import { EmptyState } from "@/components/app-states";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { SettingsArchive } from "@/components/settings-archive";
import { WorkforceSetup } from "@/components/workforce-setup";
const moduleLoading = () => (
  <div className="grid min-h-72 place-items-center">
    <Loader2 className="animate-spin text-emerald-700" />
  </div>
);
const EmployeesWorkspace = dynamic(
  () =>
    import("@/components/employees-workspace").then(
      (module) => module.EmployeesWorkspace,
    ),
  { loading: moduleLoading },
);
const AttendanceWorkspace = dynamic(
  () =>
    import("@/components/attendance-workspace").then(
      (module) => module.AttendanceWorkspace,
    ),
  { loading: moduleLoading },
);
const ShiftWorkspace = dynamic(
  () =>
    import("@/components/shift-workspace").then(
      (module) => module.ShiftWorkspace,
    ),
  { loading: moduleLoading },
);
const RecognitionWorkspace = dynamic(
  () =>
    import("@/components/recognition-workspace").then(
      (module) => module.RecognitionWorkspace,
    ),
  { loading: moduleLoading },
);
const LeaveWorkspace = dynamic(
  () =>
    import("@/components/leave-workspace").then(
      (module) => module.LeaveWorkspace,
    ),
  { loading: moduleLoading },
);
const PayrollWorkspace = dynamic(
  () =>
    import("@/components/payroll-workspace").then(
      (module) => module.PayrollWorkspace,
    ),
  { loading: moduleLoading },
);
const RecruitmentWorkspace = dynamic(
  () =>
    import("@/components/recruitment-workspace").then(
      (module) => module.RecruitmentWorkspace,
    ),
  { loading: moduleLoading },
);
const PerformanceWorkspace = dynamic(
  () =>
    import("@/components/talent-workspaces").then(
      (module) => module.PerformanceWorkspace,
    ),
  { loading: moduleLoading },
);
const TrainingWorkspace = dynamic(
  () =>
    import("@/components/talent-workspaces").then(
      (module) => module.TrainingWorkspace,
    ),
  { loading: moduleLoading },
);
const AssetsWorkspace = dynamic(
  () =>
    import("@/components/operations-workspaces").then(
      (module) => module.AssetsWorkspace,
    ),
  { loading: moduleLoading },
);
const AnnouncementsWorkspace = dynamic(
  () =>
    import("@/components/operations-workspaces").then(
      (module) => module.AnnouncementsWorkspace,
    ),
  { loading: moduleLoading },
);
const ReportsWorkspace = dynamic(
  () =>
    import("@/components/reports-workspace").then(
      (module) => module.ReportsWorkspace,
    ),
  { loading: moduleLoading },
);
const ComplianceWorkspace = dynamic(
  () =>
    import("@/components/compliance-workspace").then(
      (module) => module.ComplianceWorkspace,
    ),
  { loading: moduleLoading },
);
const AutomationWorkspace = dynamic(
  () =>
    import("@/components/automation-workspace").then(
      (module) => module.AutomationWorkspace,
    ),
  { loading: moduleLoading },
);
type View =
  | "Dashboard"
  | "Employees"
  | "Attendance"
  | "Leave Management"
  | "Shift Management"
  | "Performance"
  | "Employee Recognition"
  | "Payroll"
  | "Finance"
  | "Recruitment"
  | "Training"
  | "Assets"
  | "Announcements"
  | "Reports"
  | "Compliance"
  | "Automation"
  | "Settings";
type ShiftAssignment =
  "Morning" | "Evening" | "Full Day" | "Off duty" | "Leave";
type WeeklyAssignments = Record<number, Record<string, ShiftAssignment>>;
const shiftHours: Record<ShiftAssignment, string> = {
  Morning: "07:00–15:00",
  Evening: "15:00–23:00",
  "Full Day": "07:00–23:00",
  "Off duty": "No scheduled hours",
  Leave: "Approved leave",
};
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

type NotificationItem = {
  id: string;
  user_id?: string;
  title: string;
  body: string;
  type: string;
  read_at?: string | null;
  created_at?: string | null;
};

function formatNotificationTime(value?: string | null) {
  if (!value) return "just now";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function rosterWeekStart(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + offset * 7);
  return date;
}
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
const nav: [View, React.ElementType][] = [
  ["Dashboard", LayoutDashboard],
  ["Employees", Users],
  ["Attendance", Clock3],
  ["Shift Management", CalendarDays],
  ["Performance", Target],
  ["Employee Recognition", Star],
  ["Leave Management", FileText],
  ["Payroll", BriefcaseBusiness],
  ["Finance", CircleDollarSign],
  ["Recruitment", UserCheck],
  ["Training", Target],
  ["Assets", Building2],
  ["Announcements", Bell],
  ["Reports", BarChart3],
  ["Compliance", ShieldCheck],
  ["Automation", Activity],
  ["Settings", Settings],
];
const roleNavigation: Record<UserRole, View[]> = {
  SUPER_ADMIN: nav.map(([v]) => v),
  HR_MANAGER: nav.map(([v]) => v),
  MANAGER: [
    "Dashboard",
    "Employees",
    "Attendance",
    "Shift Management",
    "Performance",
    "Employee Recognition",
    "Leave Management",
    "Finance",
    "Reports",
  ],
  EMPLOYEE: [
    "Dashboard",
    "Attendance",
    "Performance",
    "Employee Recognition",
    "Leave Management",
    "Payroll",
  ],
};
const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_MANAGER: "HR Manager",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};
const people = [
  {
    id: "PF-1001",
    name: "Amara Okafor",
    role: "Product Designer",
    dept: "Product",
    status: "Active",
    email: "amara@peopleflow.io",
    avatar: "AO",
    color: "bg-violet-100 text-violet-700",
  },
  {
    id: "PF-1002",
    name: "David Chen",
    role: "Senior Engineer",
    dept: "Engineering",
    status: "Active",
    email: "david@peopleflow.io",
    avatar: "DC",
    color: "bg-blue-100 text-blue-700",
  },
  {
    id: "PF-1003",
    name: "Sofia Martinez",
    role: "Marketing Lead",
    dept: "Marketing",
    status: "On leave",
    email: "sofia@peopleflow.io",
    avatar: "SM",
    color: "bg-amber-100 text-amber-700",
  },
  {
    id: "PF-1004",
    name: "James Wilson",
    role: "Finance Analyst",
    dept: "Finance",
    status: "Active",
    email: "james@peopleflow.io",
    avatar: "JW",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "PF-1005",
    name: "Nia Mensah",
    role: "People Partner",
    dept: "People",
    status: "Active",
    email: "nia@peopleflow.io",
    avatar: "NM",
    color: "bg-rose-100 text-rose-700",
  },
  {
    id: "PF-1006",
    name: "Liam Patel",
    role: "Sales Executive",
    dept: "Sales",
    status: "Inactive",
    email: "liam@peopleflow.io",
    avatar: "LP",
    color: "bg-cyan-100 text-cyan-700",
  },
];
const employeeDetails: Record<
  string,
  {
    phone: string;
    address: string;
    emergency: string;
    manager: string;
    joined: string;
    type: string;
    shift: string;
    salary: number;
    bank: string;
    pension: string;
  }
> = {
  "PF-1001": {
    phone: "+234 803 441 2098",
    address: "12 Admiralty Way, Lagos",
    emergency: "Chidi Okafor · +234 802 111 4433",
    manager: "Maya Thompson",
    joined: "12 Feb 2022",
    type: "Full-time",
    shift: "Morning · 07:00–15:00",
    salary: 620000,
    bank: "GTBank · •••• 4821",
    pension: "PEN1002841",
  },
  "PF-1002": {
    phone: "+234 806 330 8821",
    address: "8 Victoria Island, Lagos",
    emergency: "Lin Chen · +234 808 442 1190",
    manager: "Eric Mensah",
    joined: "04 Jul 2021",
    type: "Full-time",
    shift: "Evening · 15:00–23:00",
    salary: 780000,
    bank: "Access · •••• 1892",
    pension: "PEN1002914",
  },
  "PF-1003": {
    phone: "+234 701 992 4021",
    address: "Lekki Phase 1, Lagos",
    emergency: "Mateo Martinez · +234 703 312 9088",
    manager: "Helen Cole",
    joined: "18 Sep 2023",
    type: "Full-time",
    shift: "Morning · 07:00–15:00",
    salary: 590000,
    bank: "UBA · •••• 7310",
    pension: "PEN1003182",
  },
  "PF-1004": {
    phone: "+234 809 221 5477",
    address: "Yaba, Lagos",
    emergency: "Sarah Wilson · +234 805 220 9001",
    manager: "Ada Bello",
    joined: "11 Jan 2024",
    type: "Full-time",
    shift: "Morning · 07:00–15:00",
    salary: 510000,
    bank: "Zenith · •••• 6204",
    pension: "PEN1003298",
  },
  "PF-1005": {
    phone: "+234 812 303 7782",
    address: "Ikeja GRA, Lagos",
    emergency: "Kojo Mensah · +234 812 337 1010",
    manager: "Admin User",
    joined: "03 Mar 2020",
    type: "Full-time",
    shift: "Evening · 15:00–23:00",
    salary: 680000,
    bank: "FirstBank · •••• 0281",
    pension: "PEN1002440",
  },
  "PF-1006": {
    phone: "+234 704 880 1132",
    address: "Surulere, Lagos",
    emergency: "Priya Patel · +234 706 550 8181",
    manager: "Owen James",
    joined: "23 May 2024",
    type: "Contract",
    shift: "Evening · 15:00–23:00",
    salary: 440000,
    bank: "Stanbic · •••• 9134",
    pension: "PEN1003521",
  },
};
const attendance = [
  { name: "Mon", present: 232, late: 12 },
  { name: "Tue", present: 238, late: 8 },
  { name: "Wed", present: 229, late: 17 },
  { name: "Thu", present: 241, late: 6 },
  { name: "Fri", present: 235, late: 10 },
  { name: "Sat", present: 82, late: 3 },
  { name: "Sun", present: 45, late: 1 },
];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export function AppShell({
  user,
  onSignOut,
  initialView,
}: {
  user: AppUser;
  onSignOut: () => void;
  initialView?: string;
}) {
  const initialMatch = nav.find(
    ([label]) =>
      label.toLowerCase().replaceAll(" ", "-") === initialView?.toLowerCase(),
  );
  const [view, setView] = useState<View>(initialMatch?.[0] ?? "Dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [searchQuery, setSearchQuery] = useState(""),
    [notifications, setNotifications] = useState<NotificationItem[]>([]),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false),
    [weeklyAssignments, setWeeklyAssignments] = useState<WeeklyAssignments>(
      () => {
        if (typeof window === "undefined") return {};
        try {
          return JSON.parse(
            window.localStorage.getItem("peopleflow-weekly-shifts") ?? "{}",
          );
        } catch {
          return {};
        }
      },
    );
  const { theme, setTheme } = useTheme();
  const visibleNav = useMemo(
    () => nav.filter(([label]) => roleNavigation[user.role].includes(label)),
    [user.role],
  );
  const navigate = (next: View, replace = false) => {
    if (!roleNavigation[user.role].includes(next)) return;
    setView(next);
    const path =
      next === "Dashboard"
        ? "/"
        : `/${next.toLowerCase().replaceAll(" ", "-")}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  };
  useEffect(() => {
    const onPopState = () => {
      const slug = window.location.pathname.slice(1).toLowerCase();
      const match = visibleNav.find(
        ([label]) => label.toLowerCase().replaceAll(" ", "-") === slug,
      );
      setView(match?.[0] ?? "Dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [visibleNav]);
  useEffect(() => {
    const expected =
      view === "Dashboard"
        ? "/"
        : `/${view.toLowerCase().replaceAll(" ", "-")}`;
    if (window.location.pathname !== expected)
      window.history.replaceState({}, "", expected);
  }, [view]);
  useEffect(() => {
    window.localStorage.setItem(
      "peopleflow-weekly-shifts",
      JSON.stringify(weeklyAssignments),
    );
  }, [weeklyAssignments]);
  useEffect(() => {
    if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
      setNotifications([]);
      return;
    }
    const supabase = createClient();
    let active = true;
    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,type,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (!active) return;
      if (error) {
        setNotifications([]);
        return;
      }
      setNotifications((data ?? []) as NotificationItem[]);
    };
    void loadNotifications();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const item = payload.new as NotificationItem | undefined;
          setNotifications((current) => {
            if (payload.eventType === "INSERT" && item) {
              return [item, ...current.filter((row) => row.id !== item.id)];
            }
            if (payload.eventType === "UPDATE" && item) {
              return current.map((row) => (row.id === item.id ? item : row));
            }
            if (payload.eventType === "DELETE") {
              return current.filter((row) => row.id !== payload.old?.id);
            }
            return current;
          });
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user.id]);
  const markAllNotificationsRead = async () => {
    if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? new Date().toISOString(),
        })),
      );
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast.error("Could not mark notifications as read");
      return;
    }
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? new Date().toISOString(),
      })),
    );
    setNotificationsOpen(false);
    toast.success("All notifications marked as read");
  };
  useEffect(() => {
    if (!hasSupabaseConfig() || user.id.startsWith("demo-")) return;
    const supabase = createClient();
    let active = true;
    const loadRoster = async () => {
      const [
        { data: employees, error: employeeError },
        { data: assignments, error: rosterError },
      ] = await Promise.all([
        supabase
          .from("employees")
          .select("id,employee_id")
          .is("deleted_at", null),
        supabase
          .from("employee_shifts")
          .select("employee_id,starts_on,assignment_type,shifts(name)")
          .gte("starts_on", localDateKey(rosterWeekStart(-12))),
      ]);
      if (!active || employeeError || rosterError) {
        if (active && (employeeError || rosterError))
          toast.error("Could not load the shared shift roster");
        return;
      }
      const employeeCodes = new Map(
        (employees ?? []).map((employee: any) => [
          employee.id,
          employee.employee_id,
        ]),
      );
      const loaded: WeeklyAssignments = {};
      for (const row of assignments ?? []) {
        const code = employeeCodes.get((row as any).employee_id);
        if (!code) continue;
        const offset = Math.round(
          (new Date(`${(row as any).starts_on}T00:00:00`).getTime() -
            rosterWeekStart(0).getTime()) /
            604800000,
        );
        const assignmentType = (row as any).assignment_type;
        const shiftName = (row as any).shifts?.name;
        const assignment: ShiftAssignment =
          assignmentType === "OFF_DUTY"
            ? "Off duty"
            : assignmentType === "LEAVE"
              ? "Leave"
              : shiftName === "Morning Shift"
                ? "Morning"
                : shiftName === "Evening Shift"
                  ? "Evening"
                  : "Full Day";
        loaded[offset] = { ...(loaded[offset] ?? {}), [code]: assignment };
      }
      if (active) setWeeklyAssignments(loaded);
    };
    void loadRoster();
    const channel = supabase
      .channel("employee-shift-roster")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_shifts" },
        () => {
          void loadRoster();
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user.id]);

  const saveShiftAssignment = async (
    employeeCode: string,
    weekOffset: number,
    assignment: ShiftAssignment,
  ) => {
    if (
      hasSupabaseConfig() &&
      !user.id.startsWith("demo-") &&
      !navigator.onLine
    ) {
      toast.error(
        "You’re offline. Reconnect before changing the shared roster.",
      );
      return;
    }
    const previous = weeklyAssignments[weekOffset]?.[employeeCode];
    setWeeklyAssignments((weeks) => ({
      ...weeks,
      [weekOffset]: {
        ...(weeks[weekOffset] ?? {}),
        [employeeCode]: assignment,
      },
    }));
    if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
      toast.success("Shift assignment saved locally");
      return;
    }
    const supabase = createClient();
    const shiftName =
      assignment === "Morning"
        ? "Morning Shift"
        : assignment === "Evening"
          ? "Evening Shift"
          : assignment === "Full Day"
            ? "Full Day"
            : null;
    const [{ data: employee }, shiftResult] = await Promise.all([
      supabase
        .from("employees")
        .select("id")
        .eq("employee_id", employeeCode)
        .single(),
      shiftName
        ? supabase
            .from("shifts")
            .select("id")
            .eq("name", shiftName)
            .is("deleted_at", null)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (!employee || (shiftName && !shiftResult.data)) {
      setWeeklyAssignments((weeks) => ({
        ...weeks,
        [weekOffset]: {
          ...(weeks[weekOffset] ?? {}),
          ...(previous ? { [employeeCode]: previous } : {}),
        },
      }));
      toast.error("The employee or shift is not configured in Supabase");
      return;
    }
    const startsOn = rosterWeekStart(weekOffset);
    const endsOn = new Date(startsOn);
    endsOn.setDate(endsOn.getDate() + 6);
    const { error } = await supabase.from("employee_shifts").upsert(
      {
        employee_id: employee.id,
        shift_id: shiftResult.data?.id ?? null,
        starts_on: localDateKey(startsOn),
        ends_on: localDateKey(endsOn),
        assignment_type:
          assignment === "Off duty"
            ? "OFF_DUTY"
            : assignment === "Leave"
              ? "LEAVE"
              : "SHIFT",
        is_override: true,
        published_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,starts_on" },
    );
    if (error) {
      setWeeklyAssignments((weeks) => ({
        ...weeks,
        [weekOffset]: {
          ...(weeks[weekOffset] ?? {}),
          ...(previous ? { [employeeCode]: previous } : {}),
        },
      }));
      toast.error(`Could not save shift: ${error.message}`);
      return;
    }
    toast.success("Shift assignment saved to Supabase");
  };
  return (
    <div className="min-h-screen">
      <aside
        className={`${mobile ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-white transition-all dark:bg-zinc-950 lg:translate-x-0 ${collapsed ? "lg:w-[76px]" : "lg:w-64"}`}
      >
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-50 p-0.5 dark:bg-emerald-950">
            <Image
              src="/brunovia-logo.png"
              alt="Brunovia"
              width={34}
              height={34}
              priority
            />
          </span>
          {!collapsed && (
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight">
                Brunovia
              </span>
              <span className="block text-[10px] text-zinc-400">
                Built for better business
              </span>
            </span>
          )}
          <button
            onClick={() => setMobile(false)}
            className="ml-auto lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <OrganizationSwitcher user={user} collapsed={collapsed} />
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map(([label, Icon]) => (
            <button
              key={label}
              title={label}
              onClick={() => {
                navigate(label);
                setMobile(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${view === label ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900"}`}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <>
                <PanelLeftClose size={18} /> Collapse sidebar
              </>
            )}
          </button>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>
      {mobile && (
        <div
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <div
        className={`transition-all ${collapsed ? "lg:ml-[76px]" : "lg:ml-64"}`}
      >
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-white/90 px-4 backdrop-blur dark:bg-zinc-950/90 sm:px-6">
          <button
            onClick={() => setMobile(true)}
            className="lg:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-400 sm:flex sm:w-72 dark:bg-zinc-900"
          >
            <Search size={16} /> Search anything...{" "}
            <kbd className="ml-auto text-xs">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                }}
                aria-label="Notifications"
                className="relative rounded-lg p-2 hover:bg-zinc-100"
              >
                <Bell size={19} />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" />
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-50 w-80 rounded-lg border bg-white p-2 shadow-xl dark:bg-zinc-950">
                  <div className="flex items-center justify-between px-2 py-2">
                    <p className="font-semibold">Notifications</p>
                    {notifications.some((item) => !item.read_at) && (
                      <button
                        onClick={() => void markAllNotificationsRead()}
                        className="text-xs text-emerald-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-zinc-500">
                      No new notifications yet.
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          if (notification.type === "finance") setView("Finance");
                          if (notification.type === "payroll") setView("Payroll");
                          if (notification.type === "leave") setView("Leave Management");
                        }}
                        className="flex w-full gap-3 rounded-md px-2 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <span
                          className={`mt-1 size-2 shrink-0 rounded-full ${notification.read_at ? "bg-zinc-300" : "bg-emerald-600"}`}
                        />
                        <span>
                          <span className="block text-sm font-medium">
                            {notification.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {notification.body}
                          </span>
                        </span>
                        <span className="ml-auto text-[10px] text-zinc-400">
                          {formatNotificationTime(notification.created_at)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <span className="mx-1 h-7 border-l" />
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
              className="grid size-8 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800"
              aria-label="Open profile menu"
            >
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </button>
            <button
              onClick={() => {
                setProfileOpen(!profileOpen);
                setNotificationsOpen(false);
              }}
              className="hidden text-left sm:block"
            >
              <p className="text-xs font-medium">{user.name}</p>
              <p className="text-[10px] text-zinc-400">
                {roleLabels[user.role]}
              </p>
            </button>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Profile options"
            >
              <ChevronDown size={14} />
            </button>
            {profileOpen && (
              <div className="absolute right-4 top-14 z-50 w-56 rounded-lg border bg-white p-2 shadow-xl dark:bg-zinc-950">
                <div className="border-b px-2 py-2">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                </div>
                <button
                  onClick={() => {
                    setView("Settings");
                    setProfileOpen(false);
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <Settings size={16} /> Profile settings
                </button>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}{" "}
                  Appearance
                </button>
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        {searchOpen && (
          <div
            className="fixed inset-0 z-50 flex justify-center bg-black/40 px-4 pt-24"
            onMouseDown={() => setSearchOpen(false)}
          >
            <div
              onMouseDown={(event) => event.stopPropagation()}
              className="h-fit w-full max-w-xl rounded-lg border bg-white p-3 shadow-2xl dark:bg-zinc-950"
            >
              <label className="flex items-center gap-3 border-b px-2">
                <Search size={18} className="text-zinc-400" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full bg-transparent py-3 text-sm outline-none"
                  placeholder="Search Brunovia modules"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                >
                  <X size={18} />
                </button>
              </label>
              <div className="mt-2 max-h-80 overflow-y-auto">
                <p className="px-2 py-2 text-[10px] font-semibold uppercase text-zinc-400">
                  Available modules
                </p>
                {visibleNav
                  .filter(([label]) =>
                    label.toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                  .map(([label, Icon]) => (
                    <button
                      key={label}
                      onClick={() => {
                        setView(label);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <Icon size={17} className="text-zinc-400" />
                      <span>{label}</span>
                      <span className="ml-auto text-xs text-zinc-400">
                        Open
                      </span>
                    </button>
                  ))}
                {visibleNav.filter(([label]) =>
                  label.toLowerCase().includes(searchQuery.toLowerCase()),
                ).length === 0 && (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    No matching module found.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8">
          {view === "Dashboard" && user.role === "EMPLOYEE" ? (
            <EmployeeDashboard
              user={user}
              onNavigate={navigate}
              weeklyAssignments={weeklyAssignments}
            />
          ) : view === "Dashboard" ? (
            <LiveDashboard />
          ) : view === "Employees" ? (
            <EmployeesWorkspace user={user} />
          ) : view === "Attendance" ? (
            <AttendanceWorkspace user={user} />
          ) : view === "Shift Management" ? (
            <ShiftWorkspace user={user} />
          ) : view === "Employee Recognition" ? (
            <RecognitionWorkspace user={user} />
          ) : view === "Leave Management" ? (
            <LeaveWorkspace user={user} />
          ) : view === "Payroll" && user.role === "EMPLOYEE" ? (
            <EmployeePayroll user={user} />
          ) : view === "Payroll" ? (
            <PayrollWorkspace />
          ) : view === "Finance" ? (
            <FinanceDashboard user={user} />
          ) : view === "Recruitment" ? (
            <RecruitmentWorkspace />
          ) : view === "Settings" ? (
            <SettingsWorkspace
              user={user}
              weeklyAssignments={weeklyAssignments}
              setWeeklyAssignments={setWeeklyAssignments}
              saveShiftAssignment={saveShiftAssignment}
            />
          ) : view === "Performance" ? (
            <PerformanceWorkspace user={user} />
          ) : view === "Training" ? (
            <TrainingWorkspace user={user} />
          ) : view === "Assets" ? (
            <AssetsWorkspace user={user} />
          ) : view === "Announcements" ? (
            <AnnouncementsWorkspace user={user} />
          ) : view === "Reports" ? (
            <ReportsWorkspace user={user} />
          ) : view === "Compliance" ? (
            <ComplianceWorkspace user={user} />
          ) : view === "Automation" ? (
            <AutomationWorkspace user={user} />
          ) : (
            <Module
              view={view}
              userRole={user.role}
              weeklyAssignments={weeklyAssignments}
              setWeeklyAssignments={setWeeklyAssignments}
              saveShiftAssignment={saveShiftAssignment}
            />
          )}
        </main>
      </div>
    </div>
  );
}
function Header({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function SettingsWorkspace({
  user,
  weeklyAssignments,
  setWeeklyAssignments,
  saveShiftAssignment,
}: {
  user: AppUser;
  weeklyAssignments: WeeklyAssignments;
  setWeeklyAssignments: React.Dispatch<React.SetStateAction<WeeklyAssignments>>;
  saveShiftAssignment: (
    employeeCode: string,
    weekOffset: number,
    assignment: ShiftAssignment,
  ) => Promise<void>;
}) {
  const [section, setSection] = useState<"Setup" | "General" | "Roles">(
    "Setup",
  );
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        <button
          onClick={() => setSection("Setup")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm ${section === "Setup" ? "border-emerald-700 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}
        >
          <Building2 size={16} /> Workforce setup
        </button>
        <button
          onClick={() => setSection("General")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm ${section === "General" ? "border-emerald-700 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}
        >
          <SlidersHorizontal size={16} /> General settings
        </button>
        <button
          onClick={() => setSection("Roles")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm ${section === "Roles" ? "border-emerald-700 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}
        >
          <ShieldCheck size={16} /> Roles & permissions
        </button>
      </div>
      {section === "Setup" ? (
        <WorkforceSetup user={user} />
      ) : section === "General" ? (
        <Module
          view="Settings"
          userRole={user.role}
          weeklyAssignments={weeklyAssignments}
          setWeeklyAssignments={setWeeklyAssignments}
          saveShiftAssignment={saveShiftAssignment}
        />
      ) : (
        <RoleManagement user={user} />
      )}
    </div>
  );
}
const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-2xl border bg-white p-5 shadow-soft dark:bg-zinc-950 ${className}`}
  >
    {children}
  </div>
);
type EmployeePaySummary = {
  salary: number | null;
  deductions: number | null;
  netPay: number | null;
  period: string | null;
  loading: boolean;
  error: string | null;
};
function useEmployeePaySummary(user: AppUser): EmployeePaySummary {
  const [summary, setSummary] = useState<EmployeePaySummary>({
    salary: null,
    deductions: null,
    netPay: null,
    period: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    let active = true;
    const loadPaySummary = async () => {
      setSummary({
        salary: null,
        deductions: null,
        netPay: null,
        period: null,
        loading: true,
        error: null,
      });
      if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
        if (active) {
          setSummary({
            salary: null,
            deductions: null,
            netPay: null,
            period: null,
            loading: false,
            error: "Salary data is unavailable for demo accounts.",
          });
        }
        return;
      }
      try {
        const supabase = createClient();
        const { data: employeeRecord, error: employeeError } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (employeeError) throw employeeError;
        if (!employeeRecord) {
          throw new Error("No staff profile is linked to this account.");
        }
        const [compensationRequest, payrollRequest] = await Promise.all([
          supabase
            .from("payroll_compensation_profiles")
            .select("basic_salary")
            .eq("employee_id", employeeRecord.id)
            .is("effective_to", null)
            .maybeSingle(),
          supabase
            .from("payroll")
            .select(
              "basic_salary,deductions,tax,pension,penalty_fee,net_pay,period",
            )
            .eq("employee_id", employeeRecord.id)
            .eq("status", "PAID")
            .order("period", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (compensationRequest.error) throw compensationRequest.error;
        if (payrollRequest.error) throw payrollRequest.error;
        const compensation = compensationRequest.data;
        const payrollRow = payrollRequest.data;
        if (!compensation && !payrollRow) {
          throw new Error("No salary or finalized payroll records are available yet.");
        }
        if (active) {
          setSummary({
            salary: Number(
              compensation?.basic_salary ?? payrollRow?.basic_salary,
            ),
            deductions: payrollRow
              ? Number(payrollRow.deductions ?? 0) +
                Number(payrollRow.tax ?? 0) +
                Number(payrollRow.pension ?? 0) +
                Number(payrollRow.penalty_fee ?? 0)
              : null,
            netPay: payrollRow ? Number(payrollRow.net_pay) : null,
            period: payrollRow?.period ?? null,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (active) {
          setSummary({
            salary: null,
            deductions: null,
            netPay: null,
            period: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load salary and deduction details.",
          });
        }
      }
    };
    void loadPaySummary();
    return () => {
      active = false;
    };
  }, [user.id]);
  return summary;
}
function PaySummaryValue({ value }: { value: number | null }) {
  return value === null ? "—" : `₦${value.toLocaleString()}`;
}
function EmployeeDashboard({
  user,
  onNavigate,
  weeklyAssignments,
}: {
  user: AppUser;
  onNavigate: (view: View) => void;
  weeklyAssignments: WeeklyAssignments;
}) {
  const employee =
    people.find(
      (person) =>
        person.email.toLowerCase() === user.email.toLowerCase() ||
        person.name === user.name,
    ) ?? people[0];
  const paySummary = useEmployeePaySummary(user);
  const [leaveSummary, setLeaveSummary] = useState({
    available: 0,
    pending: 0,
    approved: 0,
  });
  useEffect(() => {
    let active = true;
    const loadDashboardDetails = async () => {
      if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
        if (active) {
          setLeaveSummary({ available: 12, pending: 0, approved: 0 });
        }
        return;
      }
      const supabase = createClient();
      const { data: employeeRecord, error: employeeError } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || employeeError || !employeeRecord) {
        if (active) {
          setLeaveSummary({ available: 12, pending: 0, approved: 0 });
        }
        return;
      }
      const [leaveBalancesRequest, leaveRequestsRequest] = await Promise.all([
        supabase
          .from("leave_balances")
          .select("allowance,adjustment")
          .eq("employee_id", employeeRecord.id)
          .eq("balance_year", new Date().getFullYear()),
        supabase
          .from("leave_requests")
          .select("id,status")
          .eq("employee_id", employeeRecord.id),
      ]);
      if (!active) return;
      const availableLeave = (leaveBalancesRequest.data ?? []).reduce(
        (total: number, row: any) => total + Number(row.allowance ?? 0) + Number(row.adjustment ?? 0),
        0,
      );
      const pendingLeaves = (leaveRequestsRequest.data ?? []).filter((row: any) =>
        ["PENDING_MANAGER", "PENDING_HR"].includes(row.status),
      ).length;
      const approvedLeaves = (leaveRequestsRequest.data ?? []).filter((row: any) =>
        row.status === "APPROVED",
      ).length;
      setLeaveSummary({
        available: availableLeave || 12,
        pending: pendingLeaves,
        approved: approvedLeaves,
      });
    };
    void loadDashboardDetails();
    return () => {
      active = false;
    };
  }, [employee.id, user.id]);
  const employeeIndex = people.findIndex((person) => person.id === employee.id);
  const currentShift =
    weeklyAssignments[0]?.[employee.id] ??
    (employeeIndex % 2 === 0 ? "Morning" : "Evening");
  const nextShift =
    weeklyAssignments[1]?.[employee.id] ??
    ((employeeIndex + 1) % 2 === 0 ? "Morning" : "Evening");
  const actions: { label: string; view: View }[] = [
    { label: "Request leave", view: "Leave Management" },
    { label: "View payslip", view: "Payroll" },
    { label: "Review KPIs", view: "Performance" },
    { label: "Vote now", view: "Employee Recognition" },
  ];
  return (
    <>
      <Header
        title={`Good morning, ${user.name.split(" ")[0]} 👋`}
        desc="Your personal workday and pay summary."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-zinc-400">Total salary</p>
          <p className="mt-2 text-lg font-semibold">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.salary} />}
          </p>
          <p className="text-xs text-zinc-400">Paid on the 16th of each month</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Deductions</p>
          <p className="mt-2 text-lg font-semibold">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.deductions} />}
          </p>
          <p className="text-xs text-zinc-400">
            {paySummary.period ? `Latest paid payroll · ${paySummary.period.slice(0, 7)}` : "Latest paid payroll deductions"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Amount left</p>
          <p className="mt-2 text-lg font-semibold text-emerald-700">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.netPay} />}
          </p>
          <p className="text-xs text-zinc-400">Latest paid net pay</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Leave balance</p>
          <p className="mt-2 text-lg font-semibold">{leaveSummary.available} days</p>
          <p className="text-xs text-zinc-400">
            {leaveSummary.pending} pending · {leaveSummary.approved} approved
          </p>
        </Card>
      </div>
      {paySummary.error && (
        <p className="mt-3 text-sm text-amber-700">{paySummary.error}</p>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">My upcoming schedule</h2>
          <div className="mt-4 space-y-3">
            {[
              ["This week", `${currentShift} · ${shiftHours[currentShift]}`],
              ["Next week", `${nextShift} · ${shiftHours[nextShift]}`],
              ["Every 16th", "Salary payment date"],
            ].map(([a, b]) => (
              <div
                key={a}
                className="flex justify-between border-b pb-3 text-sm"
              >
                <span>{a}</span>
                <span className="text-zinc-500">{b}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">My actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {actions.map(({ label, view }) => (
              <button
                key={label}
                onClick={() => onNavigate(view)}
                className="rounded-xl border p-3 text-left text-sm font-medium hover:bg-zinc-50"
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
function EmployeeAttendance({
  user,
  weeklyAssignments,
}: {
  user: AppUser;
  weeklyAssignments: WeeklyAssignments;
}) {
  const employee =
    people.find(
      (person) =>
        person.email.toLowerCase() === user.email.toLowerCase() ||
        person.name === user.name,
    ) ?? people[0];
  const employeeIndex = people.findIndex((person) => person.id === employee.id);
  const currentShift =
    weeklyAssignments[0]?.[employee.id] ??
    (employeeIndex % 2 === 0 ? "Morning" : "Evening");
  return (
    <>
      <Header
        title="My attendance"
        desc="Your personal clock records and weekly shift assignment. Biometric clocking is completed on an authorized workplace device."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-zinc-400">Current assigned shift</p>
          <p className="mt-2 text-2xl font-semibold">{currentShift}</p>
          <p className="text-xs text-zinc-400">{shiftHours[currentShift]}</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Present this month</p>
          <p className="mt-2 text-2xl font-semibold">19 days</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Late arrivals</p>
          <p className="mt-2 text-2xl font-semibold">2</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Hours worked</p>
          <p className="mt-2 text-2xl font-semibold">151.4h</p>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="font-semibold">My recent attendance</h2>
        <EmployeeRecordTab tab="Attendance" employee={employee} />
      </Card>
    </>
  );
}
function EmployeePayroll({ user }: { user: AppUser }) {
  const [disputing, setDisputing] = useState(false);
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const employee =
    people.find(
      (person) =>
        person.email.toLowerCase() === user.email.toLowerCase() ||
        person.name === user.name,
    ) ?? people[0];
  const paySummary = useEmployeePaySummary(user);
  const [leaveSummary, setLeaveSummary] = useState({
    available: 0,
    pending: 0,
    approved: 0,
  });
  useEffect(() => {
    let active = true;
    const loadPayrollDetails = async () => {
      if (!hasSupabaseConfig() || user.id.startsWith("demo-")) {
        if (active) {
          setLeaveSummary({ available: 12, pending: 0, approved: 0 });
        }
        return;
      }
      const supabase = createClient();
      const { data: employeeRecord, error: employeeError } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || employeeError || !employeeRecord) {
        if (active) {
          setLeaveSummary({ available: 12, pending: 0, approved: 0 });
        }
        return;
      }
      const [leaveBalancesRequest, leaveRequestsRequest] = await Promise.all([
        supabase
          .from("leave_balances")
          .select("allowance,adjustment")
          .eq("employee_id", employeeRecord.id)
          .eq("balance_year", new Date().getFullYear()),
        supabase
          .from("leave_requests")
          .select("id,status")
          .eq("employee_id", employeeRecord.id),
      ]);
      if (!active) return;
      const availableLeave = (leaveBalancesRequest.data ?? []).reduce(
        (total: number, row: any) => total + Number(row.allowance ?? 0) + Number(row.adjustment ?? 0),
        0,
      );
      const pendingLeaves = (leaveRequestsRequest.data ?? []).filter((row: any) =>
        ["PENDING_MANAGER", "PENDING_HR"].includes(row.status),
      ).length;
      const approvedLeaves = (leaveRequestsRequest.data ?? []).filter((row: any) =>
        row.status === "APPROVED",
      ).length;
      setLeaveSummary({
        available: availableLeave || 12,
        pending: pendingLeaves,
        approved: approvedLeaves,
      });
    };
    void loadPayrollDetails();
    return () => {
      active = false;
    };
  }, [employee.id, user.id]);

  const submitDispute = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      hasSupabaseConfig() &&
      !user.id.startsWith("demo-") &&
      !navigator.onLine
    ) {
      toast.error("You’re offline. Reconnect before submitting this dispute.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    setSubmittingDispute(true);
    try {
      if (hasSupabaseConfig() && !user.id.startsWith("demo-")) {
        const supabase = createClient();
        const { data: employeeRecord, error: employeeError } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .single();
        if (employeeError) throw employeeError;
        const { data: payrollRecord, error: payrollError } = await supabase
          .from("payroll")
          .select("id")
          .eq("employee_id", employeeRecord.id)
          .order("period", { ascending: false })
          .limit(1)
          .single();
        if (payrollError) throw payrollError;
        const { error } = await supabase.from("payroll_disputes").insert({
          payroll_id: payrollRecord.id,
          employee_id: employeeRecord.id,
          reason,
          created_by: user.id,
        });
        if (error) throw error;
      }
      setDisputing(false);
      toast.success("Your dispute was submitted to HR for review");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The dispute could not be submitted",
      );
    } finally {
      setSubmittingDispute(false);
    }
  };
  return (
    <>
      <Header
        title="My pay"
        desc="Your current salary and latest finalized payroll. Salary is paid on the 16th of each month."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-zinc-400">Total salary</p>
          <p className="mt-2 text-2xl font-semibold">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.salary} />}
          </p>
          <p className="text-xs text-zinc-400">Monthly basic salary</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Deductions</p>
          <p className="mt-2 text-2xl font-semibold">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.deductions} />}
          </p>
          <p className="text-xs text-zinc-400">
            {paySummary.period ? `Latest paid payroll · ${paySummary.period.slice(0, 7)}` : "Latest paid payroll deductions"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Amount left</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">
            {paySummary.loading ? "Loading…" : <PaySummaryValue value={paySummary.netPay} />}
          </p>
          <p className="text-xs text-zinc-400">Latest paid net pay</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Leave balance</p>
          <p className="mt-2 text-2xl font-semibold">{leaveSummary.available} days</p>
          <p className="text-xs text-zinc-400">
            {leaveSummary.pending} pending · {leaveSummary.approved} approved
          </p>
        </Card>
      </div>
      {paySummary.error && (
        <p className="mt-3 text-sm text-amber-700">{paySummary.error}</p>
      )}
      <Card className="mt-5">
        <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Payslips and deductions</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Download your payslip or report a deduction you believe is
              incorrect.
            </p>
          </div>
          <button
            onClick={() => setDisputing(true)}
            className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700"
          >
            Dispute a deduction
          </button>
        </div>
        <EmployeeRecordTab tab="Payslips" employee={employee} />
      </Card>
      {disputing && (
        <Modal
          title="Dispute a payroll deduction"
          close={() => setDisputing(false)}
        >
          <form
            onSubmit={(event) => void submitDispute(event)}
            className="space-y-4"
          >
            <label className="block text-xs font-medium">
              Reason for dispute
              <textarea
                name="reason"
                required
                minLength={10}
                rows={5}
                className="input mt-1.5 resize-none"
                placeholder="Explain which deduction is incorrect and why."
              />
            </label>
            <label className="block text-xs font-medium">
              Supporting evidence (optional)
              <input
                name="evidence"
                type="file"
                accept="image/*,.pdf"
                className="mt-1.5 block w-full rounded-lg border p-2 text-xs"
              />
            </label>
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              HR will review your attendance, payroll adjustment, and any
              supporting evidence before responding.
            </p>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setDisputing(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={submittingDispute}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submittingDispute ? "Submitting…" : "Submit dispute"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function EmployeePerformance() {
  return (
    <>
      <Header
        title="My performance"
        desc="Your assigned KPIs, progress, and review feedback."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-zinc-400">Overall score</p>
          <p className="mt-2 text-2xl font-semibold">4.8/5</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">KPI completion</p>
          <p className="mt-2 text-2xl font-semibold">94%</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Active goals</p>
          <p className="mt-2 text-2xl font-semibold">5</p>
        </Card>
      </div>
      <Card className="mt-5">
        <EmployeeRecordTab tab="Performance" employee={people[0]} />
      </Card>
    </>
  );
}
function EmployeeLeave() {
  const [requesting, setRequesting] = useState(false);
  const [requests, setRequests] = useState([
    {
      type: "Annual leave",
      dates: "02-06 Sep 2026",
      days: 5,
      status: "Approved",
    },
    { type: "Sick leave", dates: "14 Aug 2026", days: 1, status: "Approved" },
  ]);
  const [leaveType, setLeaveType] = useState("Annual leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const submitRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!startDate || !endDate || !reason.trim())
      return toast.error("Complete all leave request fields");
    if (endDate < startDate)
      return toast.error("End date cannot be before the start date");
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) /
          86400000,
      ) + 1,
    );
    setRequests((items) => [
      {
        type: leaveType,
        dates: `${new Date(`${startDate}T12:00:00`).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })} - ${new Date(`${endDate}T12:00:00`).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}`,
        days,
        status: "Pending manager",
      },
      ...items,
    ]);
    setRequesting(false);
    setStartDate("");
    setEndDate("");
    setReason("");
    toast.success("Leave request submitted to your manager");
  };
  return (
    <>
      <Header
        title="My leave"
        desc="Your balances, requests, and approvals."
        action={
          <button
            onClick={() => setRequesting(true)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Request leave
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-zinc-400">Annual leave</p>
          <p className="mt-2 text-2xl font-semibold">14.5 days</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Sick leave</p>
          <p className="mt-2 text-2xl font-semibold">5 days</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Pending requests</p>
          <p className="mt-2 text-2xl font-semibold">
            {
              requests.filter((item) => item.status.startsWith("Pending"))
                .length
            }
          </p>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="font-semibold">My leave requests</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-zinc-500">
                <th className="pb-3 font-medium">Leave type</th>
                <th className="pb-3 font-medium">Dates</th>
                <th className="pb-3 font-medium">Days</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item, index) => (
                <tr
                  key={`${item.dates}-${index}`}
                  className="border-b last:border-0"
                >
                  <td className="py-3 font-medium">{item.type}</td>
                  <td className="py-3 text-zinc-500">{item.dates}</td>
                  <td className="py-3">{item.days}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${item.status === "Approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {requesting && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onMouseDown={() => setRequesting(false)}
        >
          <form
            onSubmit={submitRequest}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl dark:bg-zinc-950"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Request leave</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Your manager will be notified for approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequesting(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs font-medium">
                Leave type
                <select
                  value={leaveType}
                  onChange={(event) => setLeaveType(event.target.value)}
                  className="input mt-1.5"
                >
                  <option>Annual leave</option>
                  <option>Sick leave</option>
                  <option>Compassionate leave</option>
                  <option>Unpaid leave</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs font-medium">
                  Start date
                  <input
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    type="date"
                    className="input mt-1.5"
                  />
                </label>
                <label className="text-xs font-medium">
                  End date
                  <input
                    value={endDate}
                    min={startDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    type="date"
                    className="input mt-1.5"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium">
                Reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="input mt-1.5 min-h-24"
                  placeholder="Briefly explain your request"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequesting(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                Submit request
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function EmployeeSelfModule({ view }: { view: View }) {
  const map: Record<string, [string, string, string]> = {
    Training: [
      "My training",
      "Courses, certifications, and assigned development.",
      "Training",
    ],
    Assets: [
      "My assets",
      "Company equipment currently assigned to you.",
      "Assets",
    ],
    Announcements: [
      "Announcements",
      "Company news, policies, events, and recognition.",
      "Documents",
    ],
  };
  const [t, d, tab] = map[view];
  return (
    <>
      <Header title={t} desc={d} />
      <Card>
        <EmployeeRecordTab tab={tab} employee={people[0]} />
      </Card>
    </>
  );
}
function Dashboard() {
  const [attendancePeriod, setAttendancePeriod] = useState("This week");
  const [showActivity, setShowActivity] = useState(false);
  const stats: [string, string, string, React.ElementType, string][] = [
    [
      "Total employees",
      "248",
      "+12 this month",
      Users,
      "bg-emerald-50 text-emerald-600",
    ],
    [
      "Present today",
      "221",
      "89.1% attendance",
      UserCheck,
      "bg-blue-50 text-blue-600",
    ],
    ["Absent", "9", "3.6% of workforce", UserMinus, "bg-rose-50 text-rose-600"],
    [
      "Late arrivals",
      "7",
      "2 fewer than yesterday",
      AlarmClock,
      "bg-amber-50 text-amber-600",
    ],
    [
      "On leave",
      "11",
      "4 return tomorrow",
      CalendarDays,
      "bg-violet-50 text-violet-600",
    ],
  ];
  return (
    <>
      <Header
        title="Good morning, Admin 👋"
        desc="Here’s what’s happening with your workforce today."
        action={
          <button
            onClick={() => toast.success("Report downloaded")}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium dark:bg-zinc-950"
          >
            <Download size={16} /> Export report
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([a, b, c, I, color]) => (
          <Card key={a}>
            <div className="flex justify-between">
              <span
                className={`grid size-10 place-items-center rounded-xl ${color}`}
              >
                <I size={19} />
              </span>
              <MoreHorizontal size={18} className="text-zinc-300" />
            </div>
            <p className="mt-4 text-sm text-zinc-500">{a}</p>
            <p className="mt-1 text-2xl font-semibold">{b}</p>
            <p className="mt-1 text-xs text-zinc-400">{c}</p>
          </Card>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">Attendance overview</h2>
              <p className="text-xs text-zinc-400">
                Daily attendance for this week
              </p>
            </div>
            <select
              value={attendancePeriod}
              onChange={(event) => setAttendancePeriod(event.target.value)}
              aria-label="Attendance reporting period"
              className="rounded-lg border bg-transparent px-3 py-1.5 text-xs"
            >
              <option>This week</option>
              <option>Last week</option>
              <option>This month</option>
            </select>
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendance}>
                <defs>
                  <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#12845b" stopOpacity={0.3} />
                    <stop offset="1" stopColor="#12845b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="#e4e4e7"
                  strokeDasharray="4 4"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                />
                <YAxis axisLine={false} tickLine={false} fontSize={12} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="present"
                  stroke="#12845b"
                  strokeWidth={2.5}
                  fill="url(#fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold">Employee of the month</h2>
              <p className="text-xs text-zinc-400">September 2026</p>
            </div>
            <Star size={19} className="fill-amber-400 text-amber-400" />
          </div>
          <div className="mt-5 rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-white/15 text-lg font-semibold">
                AO
              </span>
              <div>
                <h3 className="font-semibold">Amara Okafor</h3>
                <p className="text-xs text-emerald-100">
                  Product Designer · Product
                </p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-emerald-50/85">
              “For exceptional ownership and customer-focused design
              leadership.”
            </p>
            <div className="mt-4 flex gap-5 text-xs">
              <span>98% attendance</span>
              <span>4.9 rating</span>
            </div>
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Department headcount</h2>
          <div className="mt-5 h-52">
            <ResponsiveContainer>
              <BarChart
                data={[
                  { n: "Engineering", v: 72 },
                  { n: "Sales", v: 48 },
                  { n: "Product", v: 39 },
                  { n: "Marketing", v: 34 },
                  { n: "People", v: 23 },
                ]}
                layout="vertical"
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="n"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={78}
                  fontSize={11}
                />
                <Tooltip />
                <Bar
                  dataKey="v"
                  fill="#12845b"
                  radius={[0, 6, 6, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="flex justify-between">
            <h2 className="font-semibold">Recent activity</h2>
            <button
              onClick={() => setShowActivity(true)}
              className="text-xs font-medium text-emerald-700"
            >
              View all
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {[
              [
                "Nia approved Sofia’s leave request",
                "12 min ago",
                "bg-emerald-500",
              ],
              ["David clocked in from HQ", "28 min ago", "bg-blue-500"],
              [
                "Quarterly review cycle was created",
                "1 hr ago",
                "bg-violet-500",
              ],
              ["New employee James was onboarded", "3 hrs ago", "bg-amber-500"],
            ].map(([a, b, c]) => (
              <div className="flex gap-3" key={a}>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${c}`} />
                <div>
                  <p className="text-sm">{a}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{b}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {showActivity && (
        <Modal
          title="Recent workforce activity"
          close={() => setShowActivity(false)}
        >
          <div className="space-y-4">
            {[
              "Nia approved Sofia's leave request",
              "David clocked in from HQ",
              "Quarterly review cycle was created",
              "New employee James was onboarded",
              "September payroll was approved",
              "Two employee documents were updated",
            ].map((event, index) => (
              <div
                key={event}
                className="flex gap-3 border-b pb-4 last:border-0 last:pb-0"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${index % 2 ? "bg-blue-500" : "bg-emerald-500"}`}
                />
                <div>
                  <p className="text-sm">{event}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {index < 2
                      ? `${12 + index * 16} min ago`
                      : index < 4
                        ? `${index - 1} hrs ago`
                        : "Yesterday"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function Employees() {
  const [q, setQ] = useState(""),
    [employeeList, setEmployeeList] = useState(people),
    [department, setDepartment] = useState("All departments"),
    [status, setStatus] = useState("All statuses"),
    [page, setPage] = useState(1),
    [add, setAdd] = useState(false),
    [enrolling, setEnrolling] = useState(false),
    [pendingEmployeeName, setPendingEmployeeName] = useState("New employee"),
    [selected, setSelected] = useState<(typeof people)[number] | null>(null);
  const filtered = useMemo(
    () =>
      employeeList.filter(
        (p) =>
          (p.name + p.role + p.dept).toLowerCase().includes(q.toLowerCase()) &&
          (department === "All departments" || p.dept === department) &&
          (status === "All statuses" || p.status === status),
      ),
    [q, department, status, employeeList],
  );
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleEmployees = filtered.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const deleteEmployee = async (employee: (typeof people)[number]) => {
    if (hasSupabaseConfig()) {
      const { error } = await createClient()
        .from("employees")
        .update({ deleted_at: new Date().toISOString(), status: "INACTIVE" })
        .eq("employee_id", employee.id);
      if (error) {
        toast.error(`Could not delete employee: ${error.message}`);
        return false;
      }
    }
    setEmployeeList((employees) =>
      employees.filter((item) => item.id !== employee.id),
    );
    setSelected(null);
    toast.success(
      `${employee.name} was removed from the active employee directory`,
    );
    return true;
  };
  if (add)
    return (
      <>
        <button
          onClick={() => setAdd(false)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} /> Back to employees
        </button>
        <Header
          title="Register new employee"
          desc="Complete the employee record first. Fingerprint registration will open automatically as the next step."
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name =
              `${data.get("firstName")} ${data.get("lastName")}`.trim();
            setPendingEmployeeName(name || "New employee");
            setAdd(false);
            setEnrolling(true);
            toast.success(
              "Employee details registered. Continue with fingerprint enrollment.",
            );
          }}
          className="max-w-5xl space-y-5"
        >
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Personal information</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Identity, contact details, address, and emergency contact.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                First name
                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Last name
                <input
                  name="lastName"
                  required
                  autoComplete="family-name"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Work email
                <input
                  name="email"
                  required
                  type="email"
                  autoComplete="email"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Phone number
                <input
                  name="phone"
                  required
                  type="tel"
                  autoComplete="tel"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium sm:col-span-2">
                Residential address
                <input
                  name="address"
                  required
                  autoComplete="street-address"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Emergency contact name
                <input name="emergencyName" required className="input mt-1.5" />
              </label>
              <label className="text-xs font-medium">
                Emergency contact phone
                <input
                  name="emergencyPhone"
                  required
                  type="tel"
                  className="input mt-1.5"
                />
              </label>
            </div>
          </Card>
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Employment information</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Organization placement and employment terms. Shift assignment is
                managed separately in Shift Management.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Employee ID
                <input
                  name="employeeId"
                  required
                  placeholder="PF-1007"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Department
                <select name="department" required className="input mt-1.5">
                  <option value="">Select department</option>
                  {[...new Set(people.map((person) => person.dept))].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-xs font-medium">
                Position
                <input name="position" required className="input mt-1.5" />
              </label>
              <label className="text-xs font-medium">
                Manager
                <select name="manager" required className="input mt-1.5">
                  <option value="">Select manager</option>
                  {people.map((person) => (
                    <option key={person.id}>{person.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Employment type
                <select name="employmentType" required className="input mt-1.5">
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Contract</option>
                  <option>Intern</option>
                </select>
              </label>
              <label className="text-xs font-medium">
                Employment date
                <input
                  name="employmentDate"
                  required
                  type="date"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Employment status
                <select name="status" required className="input mt-1.5">
                  <option>Active</option>
                  <option>On leave</option>
                  <option>Inactive</option>
                </select>
              </label>
            </div>
          </Card>
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Payroll & compliance</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Compensation and payment information used for payroll
                processing.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Monthly base salary (NGN)
                <input
                  name="salary"
                  required
                  type="number"
                  min="1"
                  step="100"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Bank name
                <input
                  name="bankName"
                  required
                  placeholder="e.g. GTBank"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Bank account number
                <input
                  name="accountNumber"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  placeholder="10-digit account number"
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Pension ID
                <input name="pensionId" required className="input mt-1.5" />
              </label>
            </div>
          </Card>
          <Card>
            <div className="flex items-start gap-3">
              <Fingerprint
                className="mt-0.5 shrink-0 text-emerald-700"
                size={20}
              />
              <div>
                <p className="text-sm font-medium">
                  Next step: fingerprint registration
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  After you save this employee record, the fingerprint capture
                  screen opens automatically. The employee should be present at
                  an authorized biometric device.
                </p>
              </div>
            </div>
          </Card>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-[#f7f8f7]/95 py-4 backdrop-blur dark:bg-[#0b0c0c]/95">
            <button
              type="button"
              onClick={() => setAdd(false)}
              className="rounded-lg border bg-white px-5 py-2.5 text-sm dark:bg-zinc-950"
            >
              Cancel
            </button>
            <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white">
              Register and continue to fingerprint
            </button>
          </div>
        </form>
      </>
    );
  if (selected)
    return (
      <EmployeeProfile
        employee={selected}
        close={() => setSelected(null)}
        onDelete={deleteEmployee}
      />
    );
  return (
    <>
      <Header
        title="Employees"
        desc="Manage your team and their employment information."
        action={
          <button
            onClick={() => setAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} /> Add employee
          </button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-lg border px-3">
            <Search size={16} className="text-zinc-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search employees..."
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
            aria-label="Filter employees by department"
            className="rounded-lg border bg-transparent px-3 py-2 text-sm text-zinc-600"
          >
            <option>All departments</option>
            {[...new Set(employeeList.map((person) => person.dept))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter employees by status"
            className="rounded-lg border bg-transparent px-3 py-2 text-sm text-zinc-600"
          >
            <option>All statuses</option>
            {[...new Set(people.map((person) => person.status))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr>
                {[
                  "Employee",
                  "Employee ID",
                  "Department",
                  "Status",
                  "Contact",
                  "",
                ].map((x) => (
                  <th key={x} className="px-3 py-4 font-medium">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((p) => (
                <tr
                  key={p.id}
                  className="border-t hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid size-9 place-items-center rounded-full text-xs font-semibold ${p.color}`}
                      >
                        {p.avatar}
                      </span>
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-zinc-400">{p.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{p.id}</td>
                  <td className="px-3 py-3">{p.dept}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${p.status === "Active" ? "bg-emerald-50 text-emerald-700" : p.status === "On leave" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-zinc-500">{p.email}</td>
                  <td>
                    <button
                      onClick={() => setSelected(p)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      View profile
                    </button>
                  </td>
                </tr>
              ))}
              {visibleEmployees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6">
                    <EmptyState
                      title="No employees found"
                      description="Try clearing the search or changing the department and status filters."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t pt-4 text-xs text-zinc-400">
          <span>
            Showing {visibleEmployees.length} of {filtered.length} matching
            employees
          </span>
          <div className="flex gap-1">
            <button
              aria-label="Previous employee page"
              disabled={page === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-md border p-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-2 py-1">
              {page} / {pageCount}
            </span>
            <button
              aria-label="Next employee page"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              className="rounded-md border p-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </Card>
      {enrolling && (
        <BiometricPrompt
          mode="enroll"
          employee={pendingEmployeeName}
          onClose={() => setEnrolling(false)}
          onSuccess={() => {
            setEnrolling(false);
            toast.success(
              `${pendingEmployeeName} registered and fingerprint enrolled`,
            );
          }}
        />
      )}
    </>
  );
}
function Attendance({
  weeklyAssignments,
}: {
  weeklyAssignments: WeeklyAssignments;
}) {
  const [scanning, setScanning] = useState(false),
    [shift, setShift] = useState<"Morning" | "Evening" | "Full Day">("Morning"),
    [historyOpen, setHistoryOpen] = useState(false),
    [historyEmployee, setHistoryEmployee] = useState("All employees"),
    [historyShift, setHistoryShift] = useState("All shifts"),
    [historyStatus, setHistoryStatus] = useState("All statuses"),
    [historyDate, setHistoryDate] = useState("All dates"),
    [historyLoading, setHistoryLoading] = useState(false),
    [historyRows, setHistoryRows] = useState<
      {
        employee: string;
        employeeId: string;
        date: Date;
        shift: string;
        status: string;
        clockIn: string;
        clockOut: string;
      }[]
    >([]);
  const todayLabel = new Date().toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const shiftPeople = people.filter((person, index) => {
    const assignment =
      weeklyAssignments[0]?.[person.id] ??
      (index % 2 === 0 ? "Morning" : "Evening");
    return assignment === shift;
  });
  const exportAttendance = () => {
    const workDate = new Date().toLocaleDateString("en-CA");
    const rows = [
      ["Employee", "Shift", "Date", "Status"],
      ...shiftPeople.map((person, index) => [
        person.name,
        shift,
        workDate,
        index === 1 ? "Late" : "Present",
      ]),
    ];
    downloadCsv(`attendance-${shift.toLowerCase()}-${workDate}.csv`, rows);
    toast.success(`${shift} shift attendance exported`);
  };
  useEffect(() => {
    if (!historyOpen) return;
    if (!hasSupabaseConfig()) {
      setHistoryRows(
        people.flatMap((person, personIndex) =>
          Array.from({ length: 7 }, (_, dayIndex) => {
            const date = new Date();
            date.setDate(date.getDate() - dayIndex);
            const assignment =
              weeklyAssignments[0]?.[person.id] ??
              (personIndex % 2 === 0 ? "Morning" : "Evening");
            const status =
              dayIndex === 2 && personIndex % 2 === 0
                ? "Late"
                : dayIndex === 5 && personIndex === 2
                  ? "Absent"
                  : "Present";
            return {
              employee: person.name,
              employeeId: person.id,
              date,
              shift: assignment,
              status,
              clockIn:
                status === "Absent"
                  ? "—"
                  : assignment === "Evening"
                    ? "14:56"
                    : "06:54",
              clockOut:
                status === "Absent"
                  ? "—"
                  : assignment === "Morning"
                    ? "15:04"
                    : "23:02",
            };
          }),
        ),
      );
      return;
    }
    let active = true;
    setHistoryLoading(true);
    void createClient()
      .from("attendance")
      .select(
        "work_date,clock_in,clock_out,status,employees(employee_id,first_name,last_name),shifts(name)",
      )
      .order("work_date", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        setHistoryLoading(false);
        if (error) return toast.error("Could not load attendance history");
        setHistoryRows(
          (data ?? []).map((row: any) => ({
            employee:
              `${row.employees?.first_name ?? ""} ${row.employees?.last_name ?? ""}`.trim() ||
              "Unknown employee",
            employeeId: row.employees?.employee_id ?? "",
            date: new Date(`${row.work_date}T12:00:00`),
            shift: row.shifts?.name?.replace(" Shift", "") ?? "Unassigned",
            status: String(row.status)
              .replaceAll("_", " ")
              .toLowerCase()
              .replace(/^./, (value) => value.toUpperCase()),
            clockIn: row.clock_in
              ? new Date(row.clock_in).toLocaleTimeString("en-NG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            clockOut: row.clock_out
              ? new Date(row.clock_out).toLocaleTimeString("en-NG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
          })),
        );
      });
    return () => {
      active = false;
    };
  }, [historyOpen, weeklyAssignments]);
  const visibleHistory = historyRows.filter(
    (row) =>
      (historyEmployee === "All employees" ||
        row.employeeId === historyEmployee) &&
      (historyShift === "All shifts" || row.shift === historyShift) &&
      (historyStatus === "All statuses" || row.status === historyStatus) &&
      (historyDate === "All dates" || localDateKey(row.date) === historyDate),
  );
  const historyByDay = Object.entries(
    visibleHistory.reduce<Record<string, typeof visibleHistory>>(
      (days, row) => {
        const date = localDateKey(row.date);
        (days[date] ??= []).push(row);
        return days;
      },
      {},
    ),
  ).sort(([a], [b]) => b.localeCompare(a));
  if (historyOpen)
    return (
      <>
        <button
          onClick={() => setHistoryOpen(false)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} /> Back to today’s attendance
        </button>
        <Header
          title="Attendance history"
          desc="Review previous clock records by employee, shift, and attendance status."
          action={
            <button
              onClick={() => {
                downloadCsv("attendance-history.csv", [
                  [
                    "Employee",
                    "Date",
                    "Shift",
                    "Clock in",
                    "Clock out",
                    "Status",
                  ],
                  ...visibleHistory.map((row) => [
                    row.employee,
                    localDateKey(row.date),
                    row.shift,
                    row.clockIn,
                    row.clockOut,
                    row.status,
                  ]),
                ]);
                toast.success("Attendance history exported");
              }}
              className="rounded-lg border bg-white px-4 py-2 text-sm font-medium dark:bg-zinc-950"
            >
              <Download className="mr-2 inline" size={15} />
              Export history
            </button>
          }
        />
        <Card>
          <div className="mb-5 grid gap-3 border-b pb-5 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium">
              Employee
              <select
                value={historyEmployee}
                onChange={(event) => setHistoryEmployee(event.target.value)}
                className="input mt-1.5"
              >
                <option>All employees</option>
                {[
                  ...new Map(
                    historyRows.map((row) => [row.employeeId, row.employee]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Day
              <select
                value={historyDate}
                onChange={(event) => setHistoryDate(event.target.value)}
                className="input mt-1.5"
              >
                <option>All dates</option>
                {[...new Set(historyRows.map((row) => localDateKey(row.date)))]
                  .sort((a, b) => b.localeCompare(a))
                  .map((date) => (
                    <option key={date} value={date}>
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        "en-NG",
                        {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        },
                      )}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Shift
              <select
                value={historyShift}
                onChange={(event) => setHistoryShift(event.target.value)}
                className="input mt-1.5"
              >
                <option>All shifts</option>
                <option>Morning</option>
                <option>Evening</option>
                <option>Full Day</option>
                <option>Off duty</option>
                <option>Leave</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Status
              <select
                value={historyStatus}
                onChange={(event) => setHistoryStatus(event.target.value)}
                className="input mt-1.5"
              >
                <option>All statuses</option>
                <option>Present</option>
                <option>Late</option>
                <option>Absent</option>
              </select>
            </label>
          </div>
          {historyLoading ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Loading attendance history…
            </p>
          ) : historyByDay.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              No attendance records match these filters.
            </p>
          ) : (
            <div className="space-y-6">
              {historyByDay.map(([date, rows]) => (
                <section
                  key={date}
                  className="overflow-hidden rounded-xl border"
                >
                  <div className="flex items-center justify-between bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {new Date(`${date}T12:00:00`).toLocaleDateString(
                          "en-NG",
                          {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        {rows?.length ?? 0} attendance records
                      </p>
                    </div>
                    <CalendarDays size={18} className="text-emerald-700" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs text-zinc-500">
                          {[
                            "Employee",
                            "Shift",
                            "Clock in",
                            "Clock out",
                            "Status",
                          ].map((heading) => (
                            <th key={heading} className="px-4 py-3 font-medium">
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(rows ?? []).map((row) => (
                          <tr
                            key={`${row.employeeId}-${row.date.toISOString()}`}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-3 font-medium">
                              {row.employee}
                            </td>
                            <td className="px-4">{row.shift}</td>
                            <td className="px-4">{row.clockIn}</td>
                            <td className="px-4">{row.clockOut}</td>
                            <td className="px-4">
                              <span
                                className={`rounded-full px-2 py-1 text-xs ${row.status === "Present" ? "bg-emerald-50 text-emerald-700" : row.status === "Late" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>
      </>
    );
  return (
    <>
      <Header
        title="Attendance"
        desc="Real-time time and attendance across all locations."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-950"
            >
              <Clock3 className="mr-2 inline" size={15} />
              History
            </button>
            <button
              onClick={() => setScanning(true)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              <Fingerprint className="mr-2 inline" size={16} /> Scan fingerprint
            </button>
            <button
              onClick={exportAttendance}
              className="rounded-lg border bg-white px-3 py-2 text-sm dark:bg-zinc-950"
            >
              <Download className="mr-2 inline" size={15} />
              Export
            </button>
            <button
              onClick={() => toast.success("Attendance synced from 4 devices")}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
            >
              Sync devices
            </button>
          </div>
        }
      />
      <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl border bg-white p-1 dark:bg-zinc-950 sm:w-fit">
        {(["Morning", "Evening", "Full Day"] as const).map((name) => (
          <button
            key={name}
            onClick={() => setShift(name)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${shift === name ? "bg-emerald-700 text-white" : "text-zinc-500"}`}
          >
            {name} shift{" "}
            <span className="ml-1 text-xs opacity-70">{shiftHours[name]}</span>
          </button>
        ))}
      </div>
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950">
        <Fingerprint size={18} className="shrink-0" />
        <p>
          <b>Individual smart clock:</b> the scanner identifies the employee
          first. If that employee has no open record for this shift, it clocks
          them in. If they already clocked in, it clocks them out. Another
          employee can scan immediately afterward and will be handled
          independently.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Checked in", String(shiftPeople.length), "Assigned today"],
          [
            "On time",
            String(
              Math.max(
                0,
                shiftPeople.length - (shiftPeople.length > 1 ? 1 : 0),
              ),
            ),
            shiftPeople.length ? "Current records" : "No records",
          ],
          ["Late", shiftPeople.length > 1 ? "1" : "0", "Current records"],
          [
            "Shift starts",
            shift === "Evening" ? "15:00" : "07:00",
            shift === "Full Day"
              ? "ends 23:00"
              : shift === "Morning"
                ? "ends 15:00"
                : "ends 23:00",
          ],
        ].map((x) => (
          <Card key={x[0]}>
            <p className="text-xs text-zinc-400">{x[0]}</p>
            <p className="mt-2 text-2xl font-semibold">
              {x[1]}{" "}
              <span className="text-xs font-normal text-zinc-400">{x[2]}</span>
            </p>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{shift} shift attendance</h2>
            <p className="text-xs text-zinc-400">
              Only employees assigned to this shift are shown
            </p>
          </div>
          <span className="flex items-center gap-2 text-xs text-emerald-700">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Realtime connected
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr>
                {[
                  "Employee",
                  "Date",
                  "Clock in",
                  "Clock out",
                  "Location",
                  "Device",
                  "Status",
                ].map((x) => (
                  <th className="py-3" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shiftPeople.map((p, i) => (
                <tr className="border-t" key={p.id}>
                  <td className="py-3 font-medium">{p.name}</td>
                  <td>{todayLabel}</td>
                  <td>
                    {["7:52 AM", "8:16 AM", "7:58 AM", "8:01 AM", "7:47 AM"][i]}
                  </td>
                  <td className="text-zinc-400">
                    {i === 0
                      ? shift === "Morning"
                        ? "3:03 PM"
                        : "11:02 PM"
                      : "—"}
                  </td>
                  <td>HQ · Lagos</td>
                  <td className="text-zinc-500">ZK-{101 + i}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${i === 1 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {i === 1 ? "Late" : "Present"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shiftPeople.length === 0 && (
            <EmptyState
              title={`No ${shift.toLowerCase()} shift employees`}
              description={`No employees are assigned to the ${shift} shift for this week.`}
            />
          )}
        </div>
      </Card>
      {scanning && (
        <BiometricPrompt
          mode="verify"
          employee={`${shift} shift · employee identified by fingerprint`}
          onClose={() => setScanning(false)}
          onSuccess={() => {
            setScanning(false);
            toast.success(
              `Identity verified — this employee’s next ${shift} shift clock event was recorded`,
            );
          }}
        />
      )}
    </>
  );
}
function Leave() {
  const [newRequest, setNewRequest] = useState(false);
  const [reviewing, setReviewing] = useState<(typeof people)[number] | null>(
    null,
  );
  return (
    <>
      <Header
        title="Leave management"
        desc="Review requests, balances, and team availability."
        action={
          <button
            onClick={() => setNewRequest(true)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            New request
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-zinc-500">Pending approval</p>
          <p className="mt-2 text-3xl font-semibold">8</p>
          <p className="mt-2 text-xs text-amber-600">3 need your attention</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">People on leave</p>
          <p className="mt-2 text-3xl font-semibold">11</p>
          <p className="mt-2 text-xs text-zinc-400">4 return tomorrow</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Avg. balance</p>
          <p className="mt-2 text-3xl font-semibold">
            14.5 <small className="text-sm">days</small>
          </p>
          <p className="mt-2 text-xs text-emerald-600">Healthy utilization</p>
        </Card>
      </div>
      <Card className="mt-5">
        <h2 className="font-semibold">Recent requests</h2>
        <div className="mt-4 space-y-3">
          {people.slice(0, 4).map((p, i) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
            >
              <span
                className={`grid size-10 place-items-center rounded-full text-xs font-semibold ${p.color}`}
              >
                {p.avatar}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-zinc-400">
                  {i % 2 ? "Sick leave" : "Annual leave"} · Sep {25 + i} –{" "}
                  {27 + i}
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                Pending manager
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => toast.success("Request approved")}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => setReviewing(p)}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs"
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {newRequest && (
        <Modal title="Create leave request" close={() => setNewRequest(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setNewRequest(false);
              toast.success("Leave request submitted for approval");
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Employee
                <select required className="input mt-1.5">
                  <option value="">Select employee</option>
                  {people.map((person) => (
                    <option key={person.id}>{person.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                Leave type
                <select required className="input mt-1.5">
                  <option>Annual leave</option>
                  <option>Sick leave</option>
                  <option>Compassionate leave</option>
                  <option>Unpaid leave</option>
                </select>
              </label>
              <label className="text-xs font-medium">
                Start date
                <input required type="date" className="input mt-1.5" />
              </label>
              <label className="text-xs font-medium">
                End date
                <input required type="date" className="input mt-1.5" />
              </label>
            </div>
            <label className="mt-4 block text-xs font-medium">
              Reason
              <textarea required className="input mt-1.5 min-h-24" />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewRequest(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                Submit request
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reviewing && (
        <Modal title="Review leave request" close={() => setReviewing(null)}>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
              <p className="font-medium">{reviewing.name}</p>
              <p className="mt-1 text-zinc-500">
                Annual leave · 25–27 September 2026
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-zinc-400">
                Reason
              </p>
              <p className="mt-1">
                Personal leave requested in accordance with the annual leave
                policy.
              </p>
            </div>
            <label className="block text-xs font-medium">
              Manager comment
              <textarea
                className="input mt-1.5 min-h-20"
                placeholder="Add an optional decision note"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setReviewing(null);
                  toast.info("Leave request rejected");
                }}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Reject
              </button>
              <button
                onClick={() => {
                  setReviewing(null);
                  toast.success("Leave request approved");
                }}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
              >
                Approve
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function EmployeeProfile({
  employee,
  close,
  onDelete,
}: {
  employee: (typeof people)[number];
  close: () => void;
  onDelete: (employee: (typeof people)[number]) => Promise<boolean>;
}) {
  const d = employeeDetails[employee.id];
  const [tab, setTab] = useState("Overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState({
    name: employee.name,
    email: employee.email,
    phone: d.phone,
    address: d.address,
    emergency: d.emergency,
    department: employee.dept,
    position: employee.role,
    manager: d.manager,
    employmentType: d.type,
    status: employee.status,
    salary: d.salary,
    bankName: d.bank.split(" · ")[0],
    bank: d.bank.split(" · ")[1] ?? d.bank,
    pension: d.pension,
    biometric: "Enrolled · Right index",
  });
  const [draft, setDraft] = useState(profile);

  if (editing) {
    return (
      <>
        <button
          onClick={() => setEditing(false)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} /> Back to employee profile
        </button>
        <Header
          title={`Edit ${profile.name}`}
          desc="Update personal, employment, payroll, and compliance information."
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setProfile(draft);
            setEditing(false);
            toast.success("Employee profile updated");
          }}
          className="max-w-5xl space-y-5"
        >
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Personal information</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Contact details and emergency information.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Full name
                <input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Work email
                <input
                  required
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      email: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Phone
                <input
                  required
                  type="tel"
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      phone: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Emergency contact
                <input
                  required
                  value={draft.emergency}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      emergency: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
            </div>
            <label className="mt-4 block text-xs font-medium">
              Address
              <input
                required
                value={draft.address}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    address: event.target.value,
                  }))
                }
                className="input mt-1.5"
              />
            </label>
          </Card>
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Employment information</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Role, reporting line, work arrangement, and employment status.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Department
                <select
                  value={draft.department}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      department: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                >
                  {[...new Set(people.map((person) => person.dept))].map(
                    (department) => (
                      <option key={department}>{department}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="text-xs font-medium">
                Position
                <input
                  required
                  value={draft.position}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      position: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Manager
                <input
                  required
                  value={draft.manager}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      manager: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Employment type
                <select
                  value={draft.employmentType}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      employmentType: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                >
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Contract</option>
                  <option>Intern</option>
                </select>
              </label>
              <label className="text-xs font-medium">
                Status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      status: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                >
                  <option>Active</option>
                  <option>On leave</option>
                  <option>Inactive</option>
                </select>
              </label>
            </div>
          </Card>
          <Card>
            <div className="mb-5">
              <h2 className="font-semibold">Payroll & compliance</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Sensitive compensation, payment, pension, and biometric details.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Monthly base salary (NGN)
                <input
                  required
                  min="1"
                  step="100"
                  type="number"
                  value={draft.salary}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      salary: Number(event.target.value),
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Bank name
                <input
                  required
                  value={draft.bankName}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      bankName: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                  placeholder="e.g. GTBank"
                />
              </label>
              <label className="text-xs font-medium">
                Bank account
                <input
                  required
                  value={draft.bank}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      bank: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                  placeholder="Account number or masked ending"
                />
              </label>
              <label className="text-xs font-medium">
                Pension ID
                <input
                  required
                  value={draft.pension}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      pension: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                />
              </label>
              <label className="text-xs font-medium">
                Biometric status
                <select
                  value={draft.biometric}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      biometric: event.target.value,
                    }))
                  }
                  className="input mt-1.5"
                >
                  <option>Enrolled · Right index</option>
                  <option>Enrolled · Left index</option>
                  <option>Enrollment pending</option>
                  <option>Not enrolled</option>
                </select>
              </label>
            </div>
          </Card>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-[#f7f8f7]/95 py-4 backdrop-blur dark:bg-[#0b0c0c]/95">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border bg-white px-5 py-2.5 text-sm dark:bg-zinc-950"
            >
              Cancel
            </button>
            <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white">
              Save profile
            </button>
          </div>
        </form>
      </>
    );
  }
  const sections = [
    [
      "Personal information",
      [
        ["Email", profile.email],
        ["Phone", profile.phone],
        ["Address", profile.address],
        ["Emergency contact", profile.emergency],
      ],
    ],
    [
      "Employment information",
      [
        ["Employee ID", employee.id],
        ["Department", profile.department],
        ["Position", profile.position],
        ["Manager", profile.manager],
        ["Employment date", d.joined],
        ["Employment type", profile.employmentType],
      ],
    ],
    [
      "Payroll & compliance",
      [
        ["Base salary", `₦${profile.salary.toLocaleString()} / month`],
        ["Bank name", profile.bankName],
        ["Bank account", profile.bank],
        ["Pension ID", profile.pension],
        ["Biometric", profile.biometric],
      ],
    ],
  ] as const;
  return (
    <>
      <button
        onClick={close}
        className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
      >
        <ArrowLeft size={16} />
        Back to employees
      </button>
      <Header
        title="Employee profile"
        desc="Personal, employment, payroll, attendance, and compliance record."
      />
      <Card className="max-w-5xl">
        <div className="flex items-center gap-4 border-b pb-5">
          <span
            className={`grid size-16 place-items-center rounded-2xl text-lg font-semibold ${employee.color}`}
          >
            {employee.avatar}
          </span>
          <div>
            <h3 className="text-xl font-semibold">{profile.name}</h3>
            <p className="text-sm text-zinc-500">
              {profile.position} · {profile.department}
            </p>
            <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {profile.status}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                setDraft(profile);
                setEditing(true);
              }}
              className="rounded-lg border px-3 py-2 text-xs font-medium"
            >
              Edit profile
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Delete employee
            </button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b py-3">
          {[
            "Overview",
            "Attendance",
            "Leave",
            "Payslips",
            "Documents",
            "Training",
            "Assets",
            "Performance",
          ].map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${tab === name ? "bg-emerald-50 text-emerald-800" : "text-zinc-500"}`}
            >
              {name}
            </button>
          ))}
        </div>
        {tab === "Overview" && (
          <div className="space-y-6 pt-5">
            {sections.map(([title, fields]) => (
              <section key={title}>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {title}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map(([label, value]) => (
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
            ))}
          </div>
        )}
        {tab !== "Overview" && (
          <EmployeeRecordTab tab={tab} employee={employee} />
        )}
      </Card>
      {confirmDelete && (
        <Modal title="Delete employee" close={() => setConfirmDelete(false)}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <p className="font-semibold">Remove {profile.name}?</p>
            <p className="mt-2 leading-6">
              This removes the employee from the active directory while
              retaining historical payroll, attendance, leave, and audit
              records. This action should only be used after offboarding.
            </p>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              required
              type="checkbox"
              className="mt-1 size-4 accent-red-600"
              id={`confirm-delete-${employee.id}`}
            />
            <span>
              I confirm this employee should be removed from active employment.
            </span>
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <button
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              disabled={deleting}
              onClick={async () => {
                const checkbox = document.getElementById(
                  `confirm-delete-${employee.id}`,
                ) as HTMLInputElement | null;
                if (!checkbox?.checked)
                  return toast.error("Confirm the employee deletion first");
                setDeleting(true);
                const deleted = await onDelete(employee);
                setDeleting(false);
                if (deleted) setConfirmDelete(false);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete employee"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function EmployeeRecordTab({
  tab,
  employee,
  onAction,
}: {
  tab: string;
  employee: (typeof people)[number];
  onAction?: () => void;
}) {
  const records: Record<
    string,
    { summary: string; headers: string[]; rows: string[][]; action: string }
  > = {
    Attendance: {
      summary: "September 2026 · 19 present · 2 late · 1 absence",
      headers: ["Date", "Shift", "Clock in", "Clock out", "Status"],
      rows: [
        ["23 Sep", "Morning", "07:52", "15:03", "Present"],
        ["22 Sep", "Evening", "15:06", "23:01", "Present"],
        ["21 Sep", "Morning", "07:14", "15:00", "Late"],
      ],
      action: "Export attendance",
    },
    Leave: {
      summary: "Annual balance: 14.5 days · Sick balance: 5 days",
      headers: ["Type", "Dates", "Days", "Status", "Approved by"],
      rows: [
        ["Annual leave", "02–06 Sep", "5", "Approved", "Nia Mensah"],
        ["Sick leave", "14 Aug", "1", "Approved", "Maya Thompson"],
      ],
      action: "Create leave request",
    },
    Payslips: {
      summary: `Current base salary: ₦${employeeDetails[employee.id].salary.toLocaleString()} per month`,
      headers: ["Period", "Gross", "Deductions", "Net pay", "Status"],
      rows: [
        ["August 2026", "₦710,000", "₦112,500", "₦597,500", "Paid"],
        ["July 2026", "₦690,000", "₦109,200", "₦580,800", "Paid"],
      ],
      action: "Download latest payslip",
    },
    Documents: {
      summary: "Employment and compliance documents",
      headers: ["Document", "Category", "Uploaded", "Expiry", "Status"],
      rows: [
        ["Employment contract", "Contract", "12 Feb 2022", "—", "Verified"],
        ["National ID", "Identity", "12 Feb 2022", "11 Feb 2032", "Verified"],
        ["Tax form", "Compliance", "05 Jan 2026", "31 Dec 2026", "Current"],
      ],
      action: "Upload document",
    },
    Training: {
      summary: "4 completed courses · 2 active certifications",
      headers: ["Course", "Provider", "Completed", "Score", "Certificate"],
      rows: [
        ["Data privacy essentials", "Internal", "18 Aug 2026", "96%", "Valid"],
        [
          "Leadership foundations",
          "People Academy",
          "04 Jun 2026",
          "89%",
          "Valid",
        ],
      ],
      action: "Assign training",
    },
    Assets: {
      summary: "2 company assets currently assigned",
      headers: ["Asset", "Serial number", "Assigned", "Condition", "Status"],
      rows: [
        ["MacBook Pro 14", "PF-MBP-1042", "12 Feb 2022", "Good", "Assigned"],
        ["iPhone 15", "PF-MOB-291", "20 Jan 2025", "Good", "Assigned"],
      ],
      action: "Assign asset",
    },
    Performance: {
      summary: "Q3 2026 · Overall score 4.8/5 · KPI completion 94%",
      headers: ["KPI", "Target", "Actual", "Weight", "Score"],
      rows: [
        ["Role deliverables", "90%", "94%", "30%", "4.8/5"],
        ["Quality of work", "90%", "92%", "25%", "4.7/5"],
        ["Collaboration", "85%", "96%", "20%", "4.9/5"],
      ],
      action: "Open full review",
    },
  };
  const r = records[tab];
  const runAction = async () => {
    if (onAction) return onAction();
    if (tab === "Attendance") {
      const csv = [r.headers, ...r.rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-attendance.csv";
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (tab === "Payslips") {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      doc.setFillColor(4, 120, 87);
      doc.rect(0, 0, 210, 28, "F");
      doc.setTextColor(255);
      doc.setFontSize(18);
      doc.text("BRUNOVIA PAYSLIP", 14, 17);
      doc.setTextColor(30);
      doc.setFontSize(12);
      doc.text(employee.name, 14, 43);
      doc.setFontSize(10);
      doc.text("Pay period: August 2026", 14, 51);
      doc.text("Gross pay: NGN 710,000", 14, 67);
      doc.text("Deductions: NGN 112,500", 14, 76);
      doc.setFont("helvetica", "bold");
      doc.text("Net pay: NGN 597,500", 14, 90);
      doc.save("Brunovia-payslip-August-2026.pdf");
      return;
    }
    if (tab === "Performance") {
      const review = window.open("", "_blank", "width=820,height=700");
      review?.document.write(
        `<html><head><title>Performance review</title><style>body{font-family:Arial;padding:32px;color:#18181b}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th{background:#f4f4f5}</style></head><body><h1>${employee.name} - Q3 Performance Review</h1><p>${r.summary}</p><table><thead><tr>${r.headers.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`,
      );
      review?.document.close();
      return;
    }
    toast.info(`${r.action} is not available for this record`);
  };
  return (
    <div className="pt-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-500">{r.summary}</p>
        <button
          onClick={() => void runAction()}
          className="rounded-lg border px-3 py-2 text-xs font-medium"
        >
          {r.action}
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-xs">
          <thead className="text-zinc-400">
            <tr>
              {r.headers.map((h) => (
                <th key={h} className="border-b py-3 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`py-3 pr-4 ${j === 0 ? "font-medium text-zinc-900 dark:text-zinc-100" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BiometricPrompt({
  mode,
  employee,
  onClose,
  onSuccess,
}: {
  mode: "enroll" | "verify";
  employee: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, setState] = useState<"ready" | "scanning" | "success">("ready");
  const scan = () => {
    setState("scanning");
    setTimeout(() => setState("success"), 1800);
  };
  return (
    <Modal
      title={mode === "enroll" ? "Enroll fingerprint" : "Biometric attendance"}
      close={onClose}
    >
      <div className="text-center">
        <div
          className={`relative mx-auto grid size-32 place-items-center rounded-full border-8 ${state === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-zinc-100 bg-zinc-50 text-emerald-700 dark:border-zinc-800 dark:bg-zinc-900"}`}
        >
          {state === "scanning" && (
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-emerald-500" />
          )}
          {state === "scanning" ? (
            <Loader2 className="animate-spin" size={52} />
          ) : state === "success" ? (
            <BadgeCheck size={56} />
          ) : (
            <Fingerprint size={56} />
          )}
        </div>
        <h3 className="mt-5 text-lg font-semibold">
          {state === "ready"
            ? "Place finger on the scanner"
            : state === "scanning"
              ? "Keep your finger still…"
              : "Fingerprint captured"}
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
          {state === "success"
            ? `${employee} was matched with 98.7% confidence.`
            : "Use the connected biometric reader. The fingerprint image never enters the browser; only a protected device template reference is stored."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <span className="size-2 rounded-full bg-emerald-500" /> Device gateway
          connected · ZK-101
        </div>
        {state === "ready" && (
          <button
            onClick={scan}
            className="mt-6 w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
          >
            Start scan
          </button>
        )}
        {state === "scanning" && (
          <button
            disabled
            className="mt-6 w-full rounded-lg bg-zinc-100 py-2.5 text-sm text-zinc-400"
          >
            Waiting for scanner…
          </button>
        )}
        {state === "success" && (
          <button
            onClick={onSuccess}
            className="mt-6 w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
          >
            {mode === "enroll" ? "Use this fingerprint" : "Complete attendance"}
          </button>
        )}
      </div>
    </Modal>
  );
}

type LateDeductionTier = {
  fromMinutes: number;
  toMinutes: number | null;
  amount: number;
};
type LateDeductionRule = {
  graceMinutes: number;
  deductionAmount: number;
  active: boolean;
  tiers: LateDeductionTier[];
};

function Payroll() {
  const [creating, setCreating] = useState(false),
    [step, setStep] = useState(0),
    [payrollExporting, setPayrollExporting] = useState(false),
    [deducting, setDeducting] = useState<(typeof people)[number] | null>(null),
    [editingLateRule, setEditingLateRule] = useState(false),
    [editingAbsenceRule, setEditingAbsenceRule] = useState(false),
    [lateRuleId, setLateRuleId] = useState<string | null>(null),
    [absenceRuleId, setAbsenceRuleId] = useState<string | null>(null),
    [savingLateRule, setSavingLateRule] = useState(false),
    [savingAbsenceRule, setSavingAbsenceRule] = useState(false),
    [payrollStatus, setPayrollStatus] = useState("DRAFT"),
    [changingPayrollStatus, setChangingPayrollStatus] = useState(false),
    [ruleHistory, setRuleHistory] = useState<
      Array<{ summary: string; at: string }>
    >([]),
    [lateRule, setLateRule] = useState<LateDeductionRule>({
      graceMinutes: 10,
      deductionAmount: 1000,
      active: true,
      tiers: [
        { fromMinutes: 11, toMinutes: 30, amount: 1000 },
        { fromMinutes: 31, toMinutes: 60, amount: 2000 },
        { fromMinutes: 61, toMinutes: null, amount: 3000 },
      ],
    }),
    [absenceRuleAmount, setAbsenceRuleAmount] = useState(2000),
    [manualDeductions, setManualDeductions] = useState<Record<string, number>>(
      {},
    );

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("deduction_policies")
        .select("id,grace_minutes,amount_per_occurrence,active,tiers")
        .eq("adjustment_type", "LATE_PENALTY")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("deduction_policies")
        .select("id,amount_per_occurrence,active")
        .eq("adjustment_type", "ABSENCE")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payroll")
        .select("status")
        .gte("period", "2026-09-01")
        .lte("period", "2026-09-30")
        .limit(1)
        .maybeSingle(),
    ]).then(([policyResult, absencePolicyResult, payrollResult]) => {
      if (policyResult.data) {
        setLateRuleId(policyResult.data.id);
        const storedTiers = Array.isArray(policyResult.data.tiers)
          ? policyResult.data.tiers.map((tier: Record<string, unknown>) => ({
              fromMinutes: Number(tier.from_minutes),
              toMinutes:
                tier.to_minutes == null ? null : Number(tier.to_minutes),
              amount: Number(tier.amount),
            }))
          : lateRule.tiers;
        setLateRule({
          graceMinutes: policyResult.data.grace_minutes,
          deductionAmount: Number(policyResult.data.amount_per_occurrence),
          active: policyResult.data.active,
          tiers: storedTiers,
        });
      }
      if (absencePolicyResult.data) {
        setAbsenceRuleId(absencePolicyResult.data.id);
        setAbsenceRuleAmount(Number(absencePolicyResult.data.amount_per_occurrence));
      }
      if (payrollResult.data?.status)
        setPayrollStatus(payrollResult.data.status);
    });
  }, []);

  const persistLateRule = async (rule: LateDeductionRule) => {
    if (hasSupabaseConfig() && !navigator.onLine) {
      toast.error("You’re offline. Reconnect before changing a payroll rule.");
      return;
    }
    setSavingLateRule(true);
    try {
      if (hasSupabaseConfig() && lateRuleId) {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("deduction_policies")
          .update({
            grace_minutes: rule.graceMinutes,
            amount_per_occurrence: rule.deductionAmount,
            active: rule.active,
            tiers: rule.tiers.map((tier) => ({
              from_minutes: tier.fromMinutes,
              to_minutes: tier.toMinutes,
              amount: tier.amount,
            })),
            updated_by: authData.user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", lateRuleId);
        if (error) throw error;
      }
      setLateRule(rule);
      setRuleHistory((current) =>
        [
          {
            summary: `${rule.active ? "Enabled" : "Disabled"}; ${rule.graceMinutes}-minute grace period; ${rule.tiers.length} deduction tiers`,
            at: new Date().toLocaleString("en-NG"),
          },
          ...current,
        ].slice(0, 5),
      );
      setEditingLateRule(false);
      toast.success(
        "Lateness deduction rule updated and recorded in the audit log",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The rule could not be saved",
      );
    } finally {
      setSavingLateRule(false);
    }
  };

  const persistAbsenceRule = async (amount: number) => {
    if (hasSupabaseConfig() && !navigator.onLine) {
      toast.error("You’re offline. Reconnect before changing a payroll rule.");
      return;
    }
    setSavingAbsenceRule(true);
    try {
      if (hasSupabaseConfig()) {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const payload = {
          adjustment_type: "ABSENCE",
          grace_minutes: 0,
          amount_per_occurrence: amount,
          active: true,
          updated_by: authData.user?.id ?? null,
          updated_at: new Date().toISOString(),
          name: "Standard absence penalty",
        };

        if (absenceRuleId) {
          const { error } = await supabase
            .from("deduction_policies")
            .update(payload)
            .eq("id", absenceRuleId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from("deduction_policies")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          setAbsenceRuleId(data.id);
        }
      }
      setAbsenceRuleAmount(amount);
      setEditingAbsenceRule(false);
      toast.success("Absence deduction policy updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The absence rule could not be saved",
      );
    } finally {
      setSavingAbsenceRule(false);
    }
  };

  const changePayrollStatus = async (status: string) => {
    if (hasSupabaseConfig() && !navigator.onLine) {
      toast.error("You’re offline. Reconnect before changing payroll status.");
      return;
    }
    setChangingPayrollStatus(true);
    try {
      if (hasSupabaseConfig()) {
        const { error } = await createClient().rpc("change_payroll_status", {
          p_period: "2026-09-01",
          p_status: status,
          p_reason: null,
        });
        if (error) throw error;
      }
      setPayrollStatus(status);
      toast.success(
        `Payroll moved to ${status.replaceAll("_", " ").toLowerCase()}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Payroll status could not be changed",
      );
    } finally {
      setChangingPayrollStatus(false);
    }
  };
  const payrollRows = people.map((p, i) => {
    const details = employeeDetails[p.id],
      [bankName, accountNumber = "Not provided"] = details.bank.split(" · "),
      base = details.salary,
      allowance = 45000 + i * 5000,
      overtime = i % 2 ? 18000 : 0,
      tax = Math.round(base * 0.075),
      pension = Math.round(base * 0.08),
      lateMinutes = i === 1 ? [14, 38, 70, 22, 45] : i === 4 ? [18, 34] : [],
      lateCount = lateMinutes.length,
      latePenalty = lateRule.active
        ? lateMinutes.reduce((sum, minutes) => {
            const tier = lateRule.tiers.find(
              (item) =>
                minutes >= item.fromMinutes &&
                (item.toMinutes === null || minutes <= item.toMinutes),
            );
            return sum + (tier?.amount ?? lateRule.deductionAmount);
          }, 0)
        : 0,
      manualPenalty = manualDeductions[p.id] ?? 0,
      penalty = latePenalty + manualPenalty,
      gross = base + allowance + overtime,
      statutoryDeductions = tax + pension,
      totalDeductions = statutoryDeductions + penalty;
    return {
      ...p,
      bankName,
      accountNumber,
      base,
      allowance,
      overtime,
      gross,
      tax,
      pension,
      statutoryDeductions,
      lateCount,
      latePenalty,
      manualPenalty,
      penalty,
      totalDeductions,
      net: gross - totalDeductions,
    };
  });
  const total = payrollRows.reduce((sum, row) => sum + row.net, 0);
  const totalGross = payrollRows.reduce((sum, row) => sum + row.gross, 0);
  const totalDeductions = payrollRows.reduce(
    (sum, row) => sum + row.totalDeductions,
    0,
  );
  const exportPayroll = async () => {
    setPayrollExporting(true);
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const autoTable = autoTableModule.default;
      const width = doc.internal.pageSize.getWidth();
      const ngn = (value: number) => `NGN ${value.toLocaleString("en-NG")}`;
      doc.setFillColor(4, 120, 87);
      doc.rect(0, 0, width, 30, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text("BRUNOVIA", 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("CONFIDENTIAL PAYROLL REGISTER", 14, 20);
      doc.setFontSize(10);
      doc.text("September 2026", width - 14, 14, { align: "right" });
      doc.setFontSize(8);
      doc.text(
        `Generated ${new Date().toLocaleString("en-NG")}`,
        width - 14,
        21,
        { align: "right" },
      );
      const metrics = [
        ["EMPLOYEES", String(payrollRows.length)],
        ["GROSS PAYROLL", ngn(totalGross)],
        ["TOTAL DEDUCTIONS", ngn(totalDeductions)],
        ["FINAL NET PAY", ngn(total)],
      ];
      metrics.forEach(([label, value], index) => {
        const x = 14 + index * 68;
        doc.setFillColor(247, 248, 247);
        doc.roundedRect(x, 38, 63, 19, 2, 2, "F");
        doc.setTextColor(113, 113, 122);
        doc.setFontSize(7);
        doc.text(label, x + 4, 45);
        doc.setTextColor(24, 24, 27);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(value, x + 4, 52);
        doc.setFont("helvetica", "normal");
      });
      autoTable(doc, {
        startY: 65,
        head: [
          [
            "Employee",
            "Bank",
            "Account number",
            "Base salary",
            "Overtime",
            "Gross earnings",
            "Penalty fee",
            "Total deductions",
            "Final net pay",
          ],
        ],
        body: payrollRows.map((row) => [
          `${row.name}\n${row.id}`,
          row.bankName,
          row.accountNumber,
          ngn(row.base),
          ngn(row.overtime),
          ngn(row.gross),
          ngn(row.penalty),
          ngn(row.totalDeductions),
          ngn(row.net),
        ]),
        foot: [
          [
            "PAYROLL TOTALS",
            "",
            "",
            ngn(payrollRows.reduce((sum, row) => sum + row.base, 0)),
            ngn(payrollRows.reduce((sum, row) => sum + row.overtime, 0)),
            ngn(totalGross),
            ngn(payrollRows.reduce((sum, row) => sum + row.penalty, 0)),
            ngn(totalDeductions),
            ngn(total),
          ],
        ],
        theme: "grid",
        headStyles: {
          fillColor: [4, 120, 87],
          textColor: 255,
          fontSize: 7.5,
          cellPadding: 2.5,
        },
        bodyStyles: {
          fontSize: 7.2,
          cellPadding: 2.3,
          textColor: [39, 39, 42],
        },
        footStyles: {
          fillColor: [236, 253, 245],
          textColor: [6, 95, 70],
          fontStyle: "bold",
          fontSize: 7.2,
          halign: "right",
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 31, fontStyle: "bold" },
          1: { cellWidth: 23 },
          2: { cellWidth: 25 },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right", fontStyle: "bold", textColor: [4, 120, 87] },
        },
        margin: { left: 10, right: 10, bottom: 16 },
        didDrawPage: (data) => {
          const height = doc.internal.pageSize.getHeight();
          doc.setDrawColor(228, 228, 231);
          doc.line(10, height - 11, width - 10, height - 11);
          doc.setTextColor(113, 113, 122);
          doc.setFontSize(7);
          doc.text(
            "Brunovia Payroll · Strictly confidential · Authorized HR and finance use only",
            10,
            height - 6,
          );
          doc.text(`Page ${data.pageNumber}`, width - 10, height - 6, {
            align: "right",
          });
        },
      });
      doc.save("Brunovia-payroll-register-September-2026.pdf");
      toast.success("Payroll PDF downloaded");
    } catch {
      toast.error("The payroll PDF could not be generated");
    } finally {
      setPayrollExporting(false);
    }
  };
  if (creating)
    return (
      <>
        <button
          onClick={() => setCreating(false)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to payroll
        </button>
        <Header
          title="Create September payroll"
          desc={
            step === 0
              ? "Confirm the pay period and synchronized workforce inputs."
              : "Review every employee calculation before submitting for approval."
          }
        />
        <Card className="max-w-5xl">
          {step === 0 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Pay period" placeholder="September 2026" />
                <label className="text-xs font-medium">
                  Payment date
                  <input
                    className="input mt-1.5"
                    type="date"
                    defaultValue="2026-09-30"
                  />
                </label>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Employees included", "248"],
                  ["Attendance & overtime", "Synced"],
                  ["Approved leave", "Synced"],
                ].map(([a, b]) => (
                  <div
                    key={a}
                    className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900"
                  >
                    <p className="text-xs text-zinc-400">{a}</p>
                    <p className="mt-1 font-semibold text-emerald-700">{b}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white"
                >
                  Calculate and review payroll
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="text-zinc-400">
                      {[
                        "Employee",
                        "Gross earnings",
                        "Deductions",
                        "Penalty",
                        "Net pay",
                      ].map((h) => (
                        <th key={h} className="border-b py-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="py-3 font-medium">{p.name}</td>
                        <td>
                          ₦
                          {(p.base + p.allowance + p.overtime).toLocaleString()}
                        </td>
                        <td>₦{(p.tax + p.pension).toLocaleString()}</td>
                        <td className="text-red-600">
                          ₦{p.penalty.toLocaleString()}
                        </td>
                        <td className="font-semibold text-emerald-700">
                          ₦{p.net.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-emerald-50 p-4">
                <span className="font-medium">Total net payroll</span>
                <b className="text-lg text-emerald-800">
                  ₦{total.toLocaleString()}
                </b>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setStep(0)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    void changePayrollStatus("AWAITING_APPROVAL");
                    setCreating(false);
                  }}
                  className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white"
                >
                  Submit for approval
                </button>
              </div>
            </>
          )}
        </Card>
      </>
    );
  return (
    <>
      <Header
        title="Payroll"
        desc="Create, review, approve, and pay your workforce."
        action={
          <button
            onClick={() => {
              setStep(0);
              setCreating(true);
            }}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Create payroll
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-zinc-500">Salary payment date</p>
          <p className="mt-2 text-2xl font-semibold">16th of each month</p>
          <p className="mt-2 text-xs text-zinc-400">
            Next payroll follows this schedule
          </p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">September gross</p>
          <p className="mt-2 text-2xl font-semibold">
            ₦{totalGross.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            {payrollRows.length} employees
          </p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Approval status</p>
          <p className="mt-2 text-2xl font-semibold capitalize">
            {payrollStatus.replaceAll("_", " ").toLowerCase()}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Every status change is recorded and employees are notified.
          </p>
        </Card>
      </div>
      <Card className="mt-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold">Payroll approval workflow</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Draft → Awaiting approval → Approved → Paid
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {payrollStatus === "DRAFT" && (
              <button
                disabled={changingPayrollStatus}
                onClick={() => void changePayrollStatus("AWAITING_APPROVAL")}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Submit for approval
              </button>
            )}
            {payrollStatus === "AWAITING_APPROVAL" && (
              <button
                disabled={changingPayrollStatus}
                onClick={() => void changePayrollStatus("APPROVED")}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Approve payroll
              </button>
            )}
            {payrollStatus === "APPROVED" && (
              <button
                disabled={changingPayrollStatus}
                onClick={() => void changePayrollStatus("PAID")}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                Mark as paid
              </button>
            )}
            {payrollStatus !== "DRAFT" && payrollStatus !== "PAID" && (
              <button
                disabled={changingPayrollStatus}
                onClick={() => void changePayrollStatus("DRAFT")}
                className="rounded-lg border px-4 py-2 text-xs font-medium disabled:opacity-50"
              >
                Return to draft
              </button>
            )}
            {payrollStatus === "PAID" && (
              <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                Payment completed
              </span>
            )}
          </div>
        </div>
      </Card>
      <Card className="mt-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">September staff payroll</h2>
            <p className="text-xs text-zinc-400">
              Itemized earnings, statutory deductions, and penalties
            </p>
          </div>
          <button
            onClick={() => void exportPayroll()}
            disabled={payrollExporting}
            className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
          >
            <Download className="mr-1 inline" size={14} />
            {payrollExporting ? "Preparing PDF…" : "Export PDF"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                {[
                  "Employee",
                  "Bank",
                  "Account number",
                  "Base salary",
                  "Overtime",
                  "Gross earnings",
                  "Penalty fee",
                  "Total deductions",
                  "Net pay",
                  "Action",
                ].map((h, index) => (
                  <th
                    key={h}
                    className={`border-b py-3 pr-5 font-medium ${index >= 3 && index <= 8 ? "text-right" : ""} ${index === 9 ? "text-center" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payrollRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-5">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {row.name}
                    </p>
                    <p className="text-zinc-400">{row.id}</p>
                  </td>
                  <td className="py-3 pr-5">{row.bankName}</td>
                  <td className="py-3 pr-5 font-mono">{row.accountNumber}</td>
                  {[row.base, row.overtime, row.gross].map((v, i) => (
                    <td key={i} className="py-3 pr-5 text-right tabular-nums">
                      ₦{v.toLocaleString()}
                    </td>
                  ))}
                  <td
                    className={`py-3 pr-5 text-right tabular-nums ${row.penalty ? "font-medium text-red-600" : "text-zinc-400"}`}
                  >
                    <span
                      title={`${row.lateCount} late arrivals: ₦${row.latePenalty.toLocaleString()}; manual: ₦${row.manualPenalty.toLocaleString()}`}
                    >
                      ₦{row.penalty.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 pr-5 text-right font-medium tabular-nums text-red-600">
                    ₦{row.totalDeductions.toLocaleString()}
                  </td>
                  <td className="py-3 pr-5 text-right font-semibold tabular-nums text-emerald-700">
                    ₦{row.net.toLocaleString()}
                  </td>
                  <td className="py-3 text-center">
                    <button
                      onClick={() => setDeducting(row)}
                      className="whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
                    >
                      Deduct salary
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-emerald-700 bg-emerald-50/70 font-semibold dark:bg-emerald-950/30">
                <td className="p-3 pr-5 text-right" colSpan={5}>
                  Payroll totals
                </td>
                <td className="p-3 pr-5 text-right tabular-nums">
                  ₦{totalGross.toLocaleString()}
                </td>
                <td className="p-3 pr-5 text-right tabular-nums text-red-600">
                  ₦
                  {payrollRows
                    .reduce((sum, row) => sum + row.penalty, 0)
                    .toLocaleString()}
                </td>
                <td className="p-3 pr-5 text-right tabular-nums text-red-600">
                  ₦{totalDeductions.toLocaleString()}
                </td>
                <td className="p-3 pr-5 text-right tabular-nums text-emerald-700">
                  ₦{total.toLocaleString()}
                </td>
                <td className="p-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <Card className="mt-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Automatic late-arrival deduction</h2>
            <p className="mt-1 text-xs text-zinc-400">
              {lateRule.active
                ? `After a ${lateRule.graceMinutes}-minute grace period, deductions increase by how late the employee arrives. The first tier starts at ₦${lateRule.tiers[0]?.amount.toLocaleString() ?? lateRule.deductionAmount.toLocaleString()}.`
                : "Late-arrival deductions are currently disabled."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${lateRule.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
            >
              {lateRule.active ? "Active" : "Inactive"}
            </span>
            <button
              type="button"
              onClick={() => setEditingLateRule(true)}
              className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              Edit rule
            </button>
          </div>
        </div>
      </Card>
      <Card className="mt-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Default unapproved absence deduction</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Employees without a valid leave or off-duty status will be charged {money(absenceRuleAmount)} per absence.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingAbsenceRule(true)}
            className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Edit absence rule
          </button>
        </div>
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Rule audit history</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Every policy edit is retained in the secure database audit log.
          </p>
          <div className="mt-4 space-y-3">
            {ruleHistory.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 p-4 text-xs text-zinc-500 dark:bg-zinc-900">
                No rule changes in this session.
              </p>
            ) : (
              ruleHistory.map((entry) => (
                <div key={entry.at} className="rounded-xl border p-3">
                  <p className="text-xs font-medium">{entry.summary}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">{entry.at}</p>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Deduction disputes</h2>
              <p className="mt-1 text-xs text-zinc-400">
                Employee requests waiting for HR review.
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              1 open
            </span>
          </div>
          <div className="mt-4 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">David Chen</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Late deduction disputed · September payroll
                </p>
              </div>
              <button
                onClick={() => toast.info("Dispute review opened")}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
              >
                Review
              </button>
            </div>
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <div className="flex justify-between">
          <div>
            <h2 className="font-semibold">Payroll history</h2>
            <p className="text-xs text-zinc-400">
              Completed and active pay runs
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {[
            ["August 2026", "₦81.7M", "Paid"],
            ["July 2026", "₦80.4M", "Paid"],
            ["June 2026", "₦78.9M", "Paid"],
          ].map((x) => (
            <div
              key={x[0]}
              className="flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="text-sm font-medium">{x[0]}</p>
                <p className="text-xs text-zinc-400">248 payslips</p>
              </div>
              <p className="font-medium">{x[1]}</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                {x[2]}
              </span>
            </div>
          ))}
        </div>
      </Card>
      {creating && (
        <Modal
          title="Create September payroll"
          close={() => setCreating(false)}
        >
          {step === 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  Pay period
                  <input
                    className="input mt-1.5"
                    value="September 2026"
                    readOnly
                  />
                </label>
                <label className="text-xs font-medium">
                  Payment date
                  <input
                    className="input mt-1.5"
                    type="date"
                    defaultValue="2026-09-30"
                  />
                </label>
              </div>
              <div className="mt-5 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
                <div className="flex justify-between">
                  <span>Employees included</span>
                  <b>248</b>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Attendance & overtime</span>
                  <span className="text-emerald-600">Synced</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>Approved leave</span>
                  <span className="text-emerald-600">Synced</span>
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="mt-5 w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
              >
                Calculate payroll
              </button>
            </>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto">
                {payrollRows.map((p) => (
                  <div
                    className="flex items-center justify-between border-b py-3"
                    key={p.id}
                  >
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-zinc-400">
                        Base ₦{p.base.toLocaleString()} + allowance ₦
                        {p.allowance.toLocaleString()} − deductions ₦
                        {(p.tax + p.pension + p.penalty).toLocaleString()}
                      </p>
                    </div>
                    <b className="text-sm">₦{p.net.toLocaleString()}</b>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between rounded-xl bg-emerald-50 p-4 text-emerald-900">
                <span>Preview subtotal</span>
                <b>₦{total.toLocaleString()}</b>
              </div>
              <button
                onClick={() => {
                  setCreating(false);
                  void changePayrollStatus("AWAITING_APPROVAL");
                }}
                className="mt-5 w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white"
              >
                Create and submit for approval
              </button>
            </>
          )}
        </Modal>
      )}
      {deducting && (
        <DeductionModal
          employee={deducting}
          existing={manualDeductions[deducting.id] ?? 0}
          close={() => setDeducting(null)}
          defaultAbsenceAmount={absenceRuleAmount}
          save={(amount) => {
            setManualDeductions((current) => ({
              ...current,
              [deducting.id]: (current[deducting.id] ?? 0) + amount,
            }));
            setDeducting(null);
            toast.success(
              `₦${amount.toLocaleString()} deduction added for ${deducting.name}`,
            );
          }}
        />
      )}
      {editingLateRule && (
        <LateDeductionRuleModal
          rule={lateRule}
          close={() => setEditingLateRule(false)}
          save={(rule) => {
            void persistLateRule(rule);
          }}
          saving={savingLateRule}
        />
      )}
      {editingAbsenceRule && (
        <AbsenceDeductionRuleModal
          amount={absenceRuleAmount}
          close={() => setEditingAbsenceRule(false)}
          save={(amount) => {
            void persistAbsenceRule(amount);
          }}
          saving={savingAbsenceRule}
        />
      )}
    </>
  );
}

function AbsenceDeductionRuleModal({
  amount,
  close,
  save,
  saving,
}: {
  amount: number;
  close: () => void;
  save: (amount: number) => void;
  saving: boolean;
}) {
  const [value, setValue] = useState(String(amount));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid absence deduction amount");
      return;
    }
    save(next);
  };

  return (
    <Modal title="Edit absence deduction rule" close={close}>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          <p className="font-medium">Default absence charge</p>
          <p className="mt-1 text-xs text-zinc-500">
            This amount is used when an employee is absent without leave or off-duty status.
          </p>
        </div>
        <label className="block text-xs font-medium">
          Amount per unapproved absence (₦)
          <input
            className="input mt-1.5"
            type="number"
            min="0"
            step="100"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function LateDeductionRuleModal({
  rule,
  close,
  save,
  saving,
}: {
  rule: LateDeductionRule;
  close: () => void;
  save: (rule: LateDeductionRule) => void;
  saving: boolean;
}) {
  const [graceMinutes, setGraceMinutes] = useState(String(rule.graceMinutes));
  const [deductionAmount, setDeductionAmount] = useState(
    String(rule.deductionAmount),
  );
  const [active, setActive] = useState(rule.active);
  const [tiers, setTiers] = useState(rule.tiers);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const grace = Number(graceMinutes);
    const amount = Number(deductionAmount);
    if (
      !Number.isFinite(grace) ||
      grace < 0 ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      toast.error("Enter a valid grace period and deduction amount");
      return;
    }
    if (
      tiers.some((tier) => !Number.isFinite(tier.amount) || tier.amount < 0)
    ) {
      toast.error("Enter a valid amount for every lateness tier");
      return;
    }
    save({ graceMinutes: grace, deductionAmount: amount, active, tiers });
  };

  return (
    <Modal title="Edit lateness deduction rule" close={close}>
      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border bg-zinc-50 p-4 dark:bg-zinc-900">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">
                Automatic deduction
              </span>
              <span className="mt-1 block text-xs text-zinc-500">
                Apply this rule whenever an employee arrives late.
              </span>
            </span>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="size-5 accent-emerald-700"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Grace period (minutes)
            <input
              className="input mt-1.5"
              type="number"
              min="0"
              step="1"
              required
              value={graceMinutes}
              onChange={(event) => setGraceMinutes(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium">
            Deduction per late arrival (₦)
            <input
              className="input mt-1.5"
              type="number"
              min="0"
              step="100"
              required
              value={deductionAmount}
              onChange={(event) => setDeductionAmount(event.target.value)}
            />
          </label>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Tiered deduction amounts</h3>
          <p className="mt-1 text-xs text-zinc-500">
            A longer delay can carry a larger deduction.
          </p>
          <div className="mt-3 space-y-3">
            {tiers.map((tier, index) => (
              <label
                key={tier.fromMinutes}
                className="grid items-center gap-2 rounded-xl border p-3 text-xs sm:grid-cols-[1fr_180px]"
              >
                <span>
                  {tier.fromMinutes}–{tier.toMinutes ?? "more"} minutes late
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-zinc-500">₦</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    className="input"
                    value={tier.amount}
                    onChange={(event) =>
                      setTiers((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, amount: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
        <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          The updated amount is applied immediately to every late-arrival
          penalty in the current payroll.
        </p>
        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeductionModal({
  employee,
  existing,
  close,
  save,
  defaultAbsenceAmount = 2000,
}: {
  employee: (typeof people)[number];
  existing: number;
  close: () => void;
  save: (amount: number) => void;
  defaultAbsenceAmount?: number;
}) {
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [deductionType, setDeductionType] = useState("DISCIPLINARY"),
    [confirmed, setConfirmed] = useState(false);
  const value = Number(amount);

  useEffect(() => {
    if (deductionType === "ABSENCE") {
      setAmount(String(defaultAbsenceAmount));
    } else if (!amount) {
      setAmount("");
    }
  }, [deductionType, defaultAbsenceAmount]);
  const valid = value > 0 && reason.trim().length >= 5 && confirmed;
  return (
    <Modal title="Add salary deduction" close={close}>
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">
          {employee.name} · {employee.id}
        </p>
        <p className="mt-1 text-xs">
          This action is restricted to Managers, HR Managers, and Super Admins.
          It will be written to the audit log.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Deduction amount (₦)
          <input
            className="input mt-1.5"
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={deductionType === "ABSENCE" ? "2000" : "e.g. 10000"}
          />
        </label>
        <label className="text-xs font-medium">
          Deduction type
          <select
            className="input mt-1.5"
            value={deductionType}
            onChange={(event) => setDeductionType(event.target.value)}
          >
            <option value="DISCIPLINARY">Disciplinary</option>
            <option value="LOAN">Loan repayment</option>
            <option value="DAMAGE">Asset damage</option>
            <option value="ABSENCE">Unapproved absence</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>
      <label className="mt-4 block text-xs font-medium">
        Reason
        <textarea
          className="input mt-1.5 min-h-24"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Required: explain why this deduction is being applied"
        />
      </label>
      {existing > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          Existing manual deductions this period: ₦{existing.toLocaleString()}
        </p>
      )}
      <label className="mt-4 flex gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="accent-emerald-700"
        />
        <span>
          I confirm this deduction is authorized and supported by company
          policy.
        </span>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={close} className="rounded-lg border px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => save(value)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Apply deduction
        </button>
      </div>
    </Modal>
  );
}

function Performance() {
  const [page, setPage] = useState<"overview" | "create" | "review">(
      "overview",
    ),
    [staff, setStaff] = useState<(typeof people)[number] | null>(null),
    [department, setDepartment] = useState("All departments");
  const performanceRows = people.map((p, i) => ({
    ...p,
    score: [4.8, 4.5, 4.2, 3.9, 4.7, 3.6][i],
    progress: [94, 88, 82, 76, 91, 68][i],
    goals: [5, 6, 4, 5, 7, 4][i],
    review: i < 3 ? "Completed" : "Pending",
  }));
  if (page === "create")
    return (
      <>
        <button
          onClick={() => setPage("overview")}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to performance
        </button>
        <Header
          title="Create and assign KPI"
          desc="Define a measurable goal, weighting, owner, and review period."
        />
        <Card className="max-w-4xl">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="KPI title"
              placeholder="e.g. Customer response time"
            />
            <FormField
              label="Assign to"
              placeholder="Select employee or department"
            />
            <FormField
              label="Category"
              placeholder="Productivity, quality, leadership…"
            />
            <FormField label="Review period" placeholder="Q4 2026" />
            <FormField label="Target value" placeholder="e.g. 95%" />
            <FormField label="Weight (%)" placeholder="e.g. 25" />
          </div>
          <label className="mt-5 block text-xs font-medium">
            Description and measurement criteria
            <textarea
              className="input mt-1.5 min-h-28"
              placeholder="Describe how this KPI is measured and what success looks like…"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setPage("overview")}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Save draft
            </button>
            <button
              onClick={() => {
                toast.success("KPI created and assigned");
                setPage("overview");
              }}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              Create and assign KPI
            </button>
          </div>
        </Card>
      </>
    );
  if (page === "review" && staff) {
    const row = performanceRows.find((p) => p.id === staff.id)!;
    return (
      <>
        <button
          onClick={() => setPage("overview")}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to staff performance
        </button>
        <Header
          title={`${staff.name} · Performance review`}
          desc={`${staff.role} · Q3 2026 review cycle`}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs text-zinc-400">Overall score</p>
            <p className="mt-2 text-3xl font-semibold">
              {row.score}
              <span className="text-sm text-zinc-400">/5</span>
            </p>
          </Card>
          <Card>
            <p className="text-xs text-zinc-400">KPI completion</p>
            <p className="mt-2 text-3xl font-semibold">{row.progress}%</p>
          </Card>
          <Card>
            <p className="text-xs text-zinc-400">Assigned goals</p>
            <p className="mt-2 text-3xl font-semibold">{row.goals}</p>
          </Card>
        </div>
        <Card className="mt-5">
          <h2 className="font-semibold">KPI scorecard</h2>
          <div className="mt-4 space-y-4">
            {[
              ["Role deliverables", 92, 30],
              ["Quality of work", 88, 25],
              ["Collaboration", 95, 20],
              ["Innovation and growth", 84, 25],
            ].map(([name, score, weight]) => (
              <div key={name as string}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>
                    {name as string}{" "}
                    <small className="text-zinc-400">({weight}% weight)</small>
                  </span>
                  <b>{score}%</b>
                </div>
                <div className="h-2 rounded-full bg-zinc-100">
                  <div
                    className="h-2 rounded-full bg-emerald-600"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <label className="mt-6 block text-xs font-medium">
            Manager feedback
            <textarea
              className="input mt-1.5 min-h-28"
              placeholder="Add evidence-based feedback and development recommendations…"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => {
                toast.success("Performance review draft saved");
                setPage("overview");
              }}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Save draft
            </button>
            <button
              onClick={() => {
                toast.success("Performance review submitted");
                setPage("overview");
              }}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              Submit review
            </button>
          </div>
        </Card>
      </>
    );
  }
  return (
    <>
      <Header
        title="Performance"
        desc="Track staff KPIs, goals, feedback, and appraisal cycles."
        action={
          <button
            onClick={() => setPage("create")}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Create KPI
          </button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Active KPIs", "42", "Across 6 departments"],
          ["Average score", "4.3/5", "+0.2 from Q2"],
          ["Reviews complete", "78%", "194 of 248 staff"],
          ["Goals at risk", "9", "Require manager action"],
        ].map(([a, b, c]) => (
          <Card key={a}>
            <p className="text-xs text-zinc-400">{a}</p>
            <p className="mt-2 text-2xl font-semibold">{b}</p>
            <p className="mt-1 text-xs text-zinc-400">{c}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Staff performance</h2>
            <p className="text-xs text-zinc-400">
              Current review period · Q3 2026
            </p>
          </div>
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            aria-label="Filter performance by department"
            className="rounded-lg border bg-transparent px-3 py-2 text-xs"
          >
            <option>All departments</option>
            {[...new Set(people.map((person) => person.dept))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                {[
                  "Employee",
                  "Department",
                  "KPIs",
                  "Progress",
                  "Score",
                  "Review status",
                  "",
                ].map((h) => (
                  <th key={h} className="border-b py-3 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {performanceRows
                .filter(
                  (row) =>
                    department === "All departments" || row.dept === department,
                )
                .map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {row.name}
                      </p>
                      <p className="text-zinc-400">{row.role}</p>
                    </td>
                    <td>{row.dept}</td>
                    <td>{row.goals} goals</td>
                    <td className="pr-5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-zinc-100">
                          <div
                            className="h-1.5 rounded-full bg-emerald-600"
                            style={{ width: `${row.progress}%` }}
                          />
                        </div>
                        {row.progress}%
                      </div>
                    </td>
                    <td className="font-semibold">{row.score}/5</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-1 ${row.review === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {row.review}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setStaff(row);
                          setPage("review");
                        }}
                        className="rounded-lg border px-3 py-1.5 font-medium"
                      >
                        {row.review === "Completed"
                          ? "View review"
                          : "Review staff"}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function FormField({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <label className="text-xs font-medium">
      {label}
      <input className="input mt-1.5" placeholder={placeholder} />
    </label>
  );
}

function ShiftManagement({
  weeklyAssignments,
  saveShiftAssignment,
}: {
  weeklyAssignments: WeeklyAssignments;
  saveShiftAssignment: (
    employeeCode: string,
    weekOffset: number,
    assignment: ShiftAssignment,
  ) => Promise<void>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const weekStart = new Date(today);
  const dayFromMonday = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const label = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  const savedRoster = weeklyAssignments[weekOffset] ?? {};
  const nextSavedRoster = weeklyAssignments[weekOffset + 1] ?? {};
  const roster = people.map((p, i) => ({
    ...p,
    current:
      savedRoster[p.id] ??
      (((i + weekOffset) % 2 === 0 ? "Morning" : "Evening") as ShiftAssignment),
    next:
      nextSavedRoster[p.id] ??
      (((i + weekOffset + 1) % 2 === 0
        ? "Morning"
        : "Evening") as ShiftAssignment),
  }));
  const updateAssignment = (employeeId: string, shift: ShiftAssignment) => {
    void saveShiftAssignment(employeeId, weekOffset, shift);
  };
  return (
    <>
      <Header
        title="Shift management"
        desc="Select a shift beside any employee. Each change is saved immediately for the selected week."
      />
      <div className="mb-5 flex items-center justify-between rounded-xl border bg-white p-3 dark:bg-zinc-950">
        <button
          onClick={() => setWeekOffset((v) => v - 1)}
          className="rounded-lg border p-2"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-xs text-zinc-400">
            {weekOffset === 0
              ? "Current roster week"
              : weekOffset > 0
                ? `Future week +${weekOffset}`
                : `Previous week ${Math.abs(weekOffset)}`}
          </p>
          <p className="font-semibold">{label}</p>
          {weekOffset === 0 && (
            <p className="mt-1 text-[11px] text-emerald-700">
              Today:{" "}
              {today.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((v) => v + 1)}
          className="rounded-lg border p-2"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-zinc-400">Full Day shift</p>
          <p className="mt-2 text-2xl font-semibold">
            {roster.filter((p) => p.current === "Full Day").length}
          </p>
          <p className="text-xs text-zinc-400">07:00–23:00</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Morning shift</p>
          <p className="mt-2 text-2xl font-semibold">
            {roster.filter((p) => p.current === "Morning").length}
          </p>
          <p className="text-xs text-zinc-400">07:00–15:00</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Evening shift</p>
          <p className="mt-2 text-2xl font-semibold">
            {roster.filter((p) => p.current === "Evening").length}
          </p>
          <p className="text-xs text-zinc-400">15:00–23:00</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Rotation pattern</p>
          <p className="mt-2 text-lg font-semibold">Weekly alternating</p>
          <p className="text-xs text-emerald-600">Next rotation: Monday</p>
        </Card>
      </div>
      <Card className="mt-5">
        <div className="mb-4">
          <h2 className="font-semibold">Weekly employee roster</h2>
          <p className="text-xs text-zinc-400">
            Use the Assignment menu in each row. Changes save immediately and
            override the automatic weekly rotation.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                {[
                  "Employee",
                  "Department",
                  "Assignment",
                  "Hours",
                  "Next week",
                  "Status",
                ].map((h) => (
                  <th key={h} className="border-b py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.name}
                    </p>
                    <p className="text-zinc-400">{p.role}</p>
                  </td>
                  <td>{p.dept}</td>
                  <td>
                    <select
                      aria-label={`Shift assignment for ${p.name}`}
                      value={p.current}
                      onChange={(event) =>
                        updateAssignment(
                          p.id,
                          event.target.value as ShiftAssignment,
                        )
                      }
                      className="rounded-lg border bg-transparent px-2 py-2 text-xs font-medium"
                    >
                      <option>Morning</option>
                      <option>Evening</option>
                      <option>Full Day</option>
                      <option>Off duty</option>
                      <option>Leave</option>
                    </select>
                  </td>
                  <td>{shiftHours[p.current]}</td>
                  <td>{p.next}</td>
                  <td>
                    <span className="text-emerald-600">Saved</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Recognition({ role }: { role: UserRole }) {
  const [page, setPage] = useState<"overview" | "nominate" | "select" | "vote">(
      "overview",
    ),
    [voted, setVoted] = useState(false),
    [published, setPublished] = useState(false);
  const ranking = people.slice(0, 5).map((p, i) => ({
    ...p,
    points: [945, 912, 889, 862, 841][i],
    attendance: [98, 96, 94, 93, 91][i],
    score: [4.9, 4.7, 4.6, 4.4, 4.3][i],
  }));
  if (page === "vote")
    return (
      <>
        <button
          onClick={() => setPage("overview")}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to recognition
        </button>
        <Header
          title="Vote for employee of the month"
          desc="Choose one shortlisted colleague. Vote totals stay private until an admin publishes the result."
        />
        <Card className="max-w-4xl">
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
            <b>Private ballot</b>
            <p className="mt-1 text-xs">
              You can vote once. Candidates and employees cannot see vote totals
              or the winner before publication.
            </p>
          </div>
          <div className="mt-5 space-y-3">
            {ranking.slice(0, 3).map((p, i) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-4 rounded-xl border p-4 hover:border-emerald-500"
              >
                <input
                  type="radio"
                  name="employee-vote"
                  defaultChecked={i === 0}
                  disabled={voted}
                  className="accent-emerald-700"
                />
                <span
                  className={`grid size-11 place-items-center rounded-full text-xs font-semibold ${p.color}`}
                >
                  {p.avatar}
                </span>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-zinc-400">
                    {p.dept} · Shortlisted for company impact
                  </p>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              disabled={voted}
              onClick={() => {
                setVoted(true);
                toast.success("Your private vote was recorded");
              }}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {voted ? "Vote submitted" : "Submit private vote"}
            </button>
          </div>
        </Card>
      </>
    );
  if (page !== "overview")
    return (
      <>
        <button
          onClick={() => setPage("overview")}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to recognition
        </button>
        <Header
          title={
            page === "nominate"
              ? "Recognize an employee"
              : "Select employee of the month"
          }
          desc={
            page === "nominate"
              ? "Celebrate a specific contribution and share it with the company."
              : "Review evidence and confirm this month’s award winner."
          }
        />
        <Card className="max-w-4xl">
          {page === "nominate" ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label="Employee" placeholder="Search employee" />
                <FormField
                  label="Recognition category"
                  placeholder="Teamwork, innovation, leadership…"
                />
                <FormField label="Visibility" placeholder="Company-wide" />
                <FormField
                  label="Recognition date"
                  placeholder="23 September 2026"
                />
              </div>
              <label className="mt-5 block text-xs font-medium">
                Achievement
                <textarea
                  className="input mt-1.5 min-h-28"
                  placeholder="Describe what the employee accomplished and its impact…"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => {
                    toast.success("Recognition draft saved");
                    setPage("overview");
                  }}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Save draft
                </button>
                <button
                  onClick={() => {
                    toast.success("Recognition published to the company feed");
                    setPage("overview");
                  }}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                >
                  Publish recognition
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {ranking.slice(0, 3).map((p, i) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-4 rounded-xl border p-4 hover:border-emerald-500"
                  >
                    <input
                      type="radio"
                      name="winner"
                      defaultChecked={i === 0}
                      className="accent-emerald-700"
                    />
                    <span
                      className={`grid size-11 place-items-center rounded-full text-xs font-semibold ${p.color}`}
                    >
                      {p.avatar}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-zinc-400">
                        {p.dept} · {p.attendance}% attendance · {p.score}/5
                        performance
                      </p>
                    </div>
                    <b className="text-emerald-700">{p.points} pts</b>
                  </label>
                ))}
              </div>
              <label className="mt-5 block text-xs font-medium">
                Award citation
                <textarea
                  className="input mt-1.5 min-h-24"
                  defaultValue="For exceptional ownership, collaboration, and measurable impact this month."
                />
              </label>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    toast.success(
                      "Employee of the month confirmed and announced",
                    );
                    setPage("overview");
                  }}
                  className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white"
                >
                  Confirm winner and publish
                </button>
              </div>
            </>
          )}
        </Card>
      </>
    );
  return (
    <>
      <Header
        title="Employee recognition"
        desc="Celebrate impact, peer appreciation, and outstanding performance."
        action={
          <button
            onClick={() => setPage("nominate")}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Recognize employee
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <Card>
          <div className="flex justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-600">
                Employee of the month
              </p>
              <h2 className="mt-1 text-lg font-semibold">September 2026</h2>
            </div>
            <Award className="text-amber-500" />
          </div>
          <div className="mt-6 flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-violet-100 text-lg font-semibold text-violet-700">
              AO
            </span>
            <div>
              <h3 className="font-semibold">Amara Okafor</h3>
              <p className="text-xs text-zinc-400">
                Product Designer · Product
              </p>
              <p className="mt-2 text-xs text-emerald-700">
                945 recognition points
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-zinc-500">
            Recognized for leading the new employee experience redesign and
            mentoring two junior designers.
          </p>
          <button
            onClick={() => setPage("select")}
            className="mt-5 w-full rounded-lg border py-2 text-sm font-medium"
          >
            Select next month’s winner
          </button>
        </Card>
        <Card>
          <div className="flex justify-between">
            <div>
              <h2 className="font-semibold">Recognition feed</h2>
              <p className="text-xs text-zinc-400">
                Recent appreciation across the company
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {[
              [
                "Nia recognized David",
                "Outstanding support during the platform migration.",
                "2h",
              ],
              [
                "Maya recognized Amara",
                "Customer-first thinking on the onboarding redesign.",
                "1d",
              ],
              [
                "James recognized Sofia",
                "Campaign delivery exceeded the quarterly target.",
                "2d",
              ],
            ].map(([a, b, c]) => (
              <div key={a} className="border-b pb-4 last:border-0">
                <div className="flex justify-between">
                  <p className="text-sm font-medium">{a}</p>
                  <span className="text-xs text-zinc-400">{c}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">{b}</p>
                <button
                  onClick={() => toast.success("Appreciation added")}
                  className="mt-2 text-xs text-emerald-700"
                >
                  👏 12 appreciations
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">
                October Employee of the Month vote
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                Voting open
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Employees may vote once. Results remain private until a Super
              Admin or HR Manager publishes the winner.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage("vote")}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              {voted ? "Vote submitted" : "Cast your vote"}
            </button>
            {(role === "SUPER_ADMIN" || role === "HR_MANAGER") && (
              <button
                onClick={() => {
                  setPublished(true);
                  toast.success("Admin published the voting result");
                }}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
              >
                {published ? "Result published" : "Admin: publish result"}
              </button>
            )}
          </div>
        </div>
        {!published && (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-900">
            🔒 Vote totals and provisional winner are hidden.
          </div>
        )}
        {published && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <b>Published winner: Amara Okafor</b> · 43 verified employee votes
          </div>
        )}
      </Card>
      <Card className="mt-5">
        <h2 className="font-semibold">Performance and recognition ranking</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                {[
                  "Rank",
                  "Employee",
                  "Department",
                  "Attendance",
                  "Performance",
                  "Points",
                ].map((h) => (
                  <th key={h} className="border-b py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-3 font-semibold">#{i + 1}</td>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.dept}</td>
                  <td>{p.attendance}%</td>
                  <td>{p.score}/5</td>
                  <td className="font-semibold text-emerald-700">{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Reports() {
  const [creating, setCreating] = useState(false);
  if (creating)
    return (
      <>
        <button
          onClick={() => setCreating(false)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500"
        >
          <ArrowLeft size={16} />
          Back to reports
        </button>
        <Header
          title="Generate workforce report"
          desc="Choose the dataset, scope, date range, and output format."
        />
        <Card className="max-w-4xl">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Report type
              <select className="input mt-1.5">
                <option>Attendance summary</option>
                <option>Payroll variance</option>
                <option>Headcount movement</option>
                <option>Leave utilization</option>
                <option>Performance analysis</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Department
              <select className="input mt-1.5">
                <option>All departments</option>
                <option>Engineering</option>
                <option>Product</option>
                <option>Sales</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Date from
              <input className="input mt-1.5" type="date" />
            </label>
            <label className="text-xs font-medium">
              Date to
              <input className="input mt-1.5" type="date" />
            </label>
            <label className="text-xs font-medium">
              Format
              <select className="input mt-1.5">
                <option>PDF</option>
                <option>Excel</option>
                <option>CSV</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Delivery
              <select className="input mt-1.5">
                <option>Download now</option>
                <option>Email to me</option>
                <option>Schedule monthly</option>
              </select>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.success("Report generated and ready to download");
                setCreating(false);
              }}
              className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white"
            >
              Generate report
            </button>
          </div>
        </Card>
      </>
    );
  return (
    <>
      <Header
        title="Reports"
        desc="Create, schedule, and export decision-ready workforce reports."
        action={
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Generate report
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "Attendance summary",
            "Attendance, lateness, overtime, and shift coverage",
          ],
          [
            "Payroll variance",
            "Earnings, deductions, penalties, and month-over-month change",
          ],
          [
            "Workforce overview",
            "Headcount, departments, hiring, turnover, and leave",
          ],
        ].map(([a, b]) => (
          <Card key={a}>
            <BarChart3 className="text-emerald-700" size={20} />
            <h3 className="mt-4 font-semibold">{a}</h3>
            <p className="mt-2 text-sm text-zinc-400">{b}</p>
            <button
              onClick={() => setCreating(true)}
              className="mt-5 text-sm font-medium text-emerald-700"
            >
              Configure report →
            </button>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <div className="flex justify-between">
          <div>
            <h2 className="font-semibold">Generated reports</h2>
            <p className="text-xs text-zinc-400">
              Download history and scheduled reports
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="text-zinc-400">
              <tr>
                {["Report", "Period", "Created by", "Format", "Status", ""].map(
                  (h) => (
                    <th key={h} className="border-b py-3">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[
                ["September attendance", "1–23 Sep 2026", "Admin User", "PDF"],
                ["August payroll variance", "Aug 2026", "Nia Mensah", "Excel"],
                ["Q3 headcount movement", "Jul–Sep 2026", "Admin User", "PDF"],
              ].map((r) => (
                <tr key={r[0]} className="border-b">
                  <td className="py-3 font-medium">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>
                    <span className="text-emerald-600">Ready</span>
                  </td>
                  <td>
                    <button
                      onClick={() => toast.success(`${r[0]} downloaded`)}
                      className="rounded-lg border p-2"
                    >
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function SettingsPage({ userRole }: { userRole: UserRole }) {
  const [tab, setTab] = useState("Organization");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const tabs = [
    "Organization",
    "Roles & permissions",
    "Attendance policy",
    "Payroll policy",
    "Devices & integrations",
    "Archive & restore",
  ];
  return (
    <>
      <Header
        title="Settings"
        desc="Manage organization details, access, policies, and connected systems."
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${tab === t ? "bg-emerald-50 font-medium text-emerald-800" : "text-zinc-500 hover:bg-zinc-50"}`}
            >
              {t}
            </button>
          ))}
        </Card>
        <Card>
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="font-semibold">{tab}</h2>
              <p className="mt-1 text-xs text-zinc-400">
                {tab === "Organization"
                  ? "Company identity and regional configuration."
                  : tab === "Roles & permissions"
                    ? "Control access for each workforce role."
                    : tab === "Attendance policy"
                      ? "Shift timing, grace periods, and clock rules."
                      : tab === "Payroll policy"
                        ? "Deductions, approvals, and pay-cycle defaults."
                        : tab === "Archive & restore"
                          ? "Archive and restore shifts and policy records."
                          : "Biometric readers and external integrations."}
              </p>
            </div>
            {tab === "Devices & integrations" ? (
              <Fingerprint className="text-emerald-700" />
            ) : tab === "Roles & permissions" ? (
              <ShieldCheck className="text-emerald-700" />
            ) : (
              <SlidersHorizontal className="text-emerald-700" />
            )}
          </div>
          {tab === "Archive & restore" ? (
            <SettingsArchive userRole={userRole} />
          ) : tab === "Organization" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Organization name"
                placeholder="Brunovia Technologies"
              />
              <FormField
                label="Legal name"
                placeholder="Brunovia Technologies Ltd"
              />
              <FormField label="Timezone" placeholder="Africa/Lagos" />
              <FormField label="Currency" placeholder="NGN — Nigerian Naira" />
              <FormField label="Work week starts" placeholder="Monday" />
              <FormField
                label="HR contact email"
                placeholder="people@company.com"
              />
            </div>
          ) : null}
          {tab === "Roles & permissions" && (
            <div className="space-y-3">
              {[
                ["Super Admin", "Full system, security, and billing access"],
                [
                  "HR Manager",
                  "Employees, payroll, attendance, leave, and recruitment",
                ],
                [
                  "Manager",
                  "Assigned department, reviews, leave, and deductions",
                ],
                [
                  "Employee",
                  "Own profile, attendance, payslips, leave, and training",
                ],
              ].map(([a, b]) => (
                <div
                  key={a}
                  className="flex items-center justify-between rounded-xl border p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{a}</p>
                    <p className="text-xs text-zinc-400">{b}</p>
                  </div>
                  <button
                    onClick={() => setEditingRole(a)}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                  >
                    Edit permissions
                  </button>
                </div>
              ))}
            </div>
          )}
          {tab === "Attendance policy" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Morning shift" placeholder="07:00 – 15:00" />
              <FormField label="Evening shift" placeholder="15:00 – 23:00" />
              <FormField label="Late grace period" placeholder="10 minutes" />
              <FormField label="Weekly rotation day" placeholder="Monday" />
              <FormField
                label="Early departure threshold"
                placeholder="15 minutes"
              />
              <FormField
                label="Overtime begins after"
                placeholder="30 minutes"
              />
            </div>
          )}
          {tab === "Payroll policy" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Pay day" placeholder="Last working day" />
              <FormField
                label="Late penalty"
                placeholder="₦2,500 per occurrence"
              />
              <FormField label="Pension rate" placeholder="8%" />
              <FormField
                label="Approval workflow"
                placeholder="HR Manager → Super Admin"
              />
            </div>
          )}
          {tab === "Devices & integrations" && (
            <div className="space-y-3">
              {[
                ["ZK-101 · Reception", "ZKTeco", "Online"],
                ["ZK-102 · Staff entrance", "ZKTeco", "Online"],
                ["Payroll banking API", "Payment integration", "Connected"],
              ].map(([a, b, c]) => (
                <div
                  key={a}
                  className="flex items-center justify-between rounded-xl border p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{a}</p>
                    <p className="text-xs text-zinc-400">{b}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    {c}
                  </span>
                </div>
              ))}
              <button
                onClick={() => setConnecting(true)}
                className="w-full rounded-lg border border-dashed py-3 text-sm font-medium text-emerald-700"
              >
                <Plus className="mr-2 inline" size={15} />
                Connect device or integration
              </button>
            </div>
          )}
          {tab !== "Archive & restore" && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => toast.success(`${tab} settings saved`)}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white"
              >
                Save changes
              </button>
            </div>
          )}
        </Card>
      </div>
      {editingRole && (
        <Modal
          title={`Edit ${editingRole} permissions`}
          close={() => setEditingRole(null)}
        >
          <div className="space-y-3">
            {[
              "View employee records",
              "Manage attendance and leave",
              "Access payroll",
              "Manage organization settings",
            ].map((permission, index) => (
              <label
                key={permission}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <span>{permission}</span>
                <input
                  type="checkbox"
                  defaultChecked={editingRole === "Super Admin" || index < 2}
                  className="size-4 accent-emerald-700"
                />
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={() => setEditingRole(null)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.success(`${editingRole} permissions updated`);
                setEditingRole(null);
              }}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            >
              Save permissions
            </button>
          </div>
        </Modal>
      )}
      {connecting && (
        <Modal
          title="Connect device or integration"
          close={() => setConnecting(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setConnecting(false);
              toast.success("Connection saved for verification");
            }}
          >
            <div className="space-y-4">
              <label className="block text-xs font-medium">
                Integration type
                <select className="input mt-1.5">
                  <option>Biometric attendance device</option>
                  <option>Payroll banking API</option>
                  <option>Identity provider</option>
                  <option>Webhook</option>
                </select>
              </label>
              <label className="block text-xs font-medium">
                Display name
                <input
                  required
                  className="input mt-1.5"
                  placeholder="Reception attendance reader"
                />
              </label>
              <label className="block text-xs font-medium">
                Secure endpoint
                <input
                  required
                  type="url"
                  className="input mt-1.5"
                  placeholder="https://device-gateway.example.com"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConnecting(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                Test and connect
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Module({
  view,
  userRole,
  weeklyAssignments,
  setWeeklyAssignments,
  saveShiftAssignment,
}: {
  view: View;
  userRole: UserRole;
  weeklyAssignments: WeeklyAssignments;
  setWeeklyAssignments: React.Dispatch<React.SetStateAction<WeeklyAssignments>>;
  saveShiftAssignment: (
    employeeCode: string,
    weekOffset: number,
    assignment: ShiftAssignment,
  ) => Promise<void>;
}) {
  const [workflow, setWorkflow] = useState<string | null>(null);
  if (view === "Payroll") return <Payroll />;
  if (view === "Performance") return <Performance />;
  if (view === "Shift Management")
    return (
      <ShiftManagement
        weeklyAssignments={weeklyAssignments}
        saveShiftAssignment={saveShiftAssignment}
      />
    );
  if (view === "Employee Recognition") return <Recognition role={userRole} />;
  if (view === "Reports") return <Reports />;
  if (view === "Settings") return <SettingsPage userRole={userRole} />;
  const meta: Record<string, [string, string, string[]]> = {
    "Shift Management": [
      "Shift management",
      "Build schedules and keep every location covered.",
      [
        "Morning shift · 07:00–15:00",
        "Evening shift · 15:00–23:00",
        "Weekly shift assignments",
      ],
    ],
    Performance: [
      "Performance",
      "Align goals, feedback, and review cycles.",
      [
        "Q3 review cycle · 78% complete",
        "42 active KPIs",
        "18 reviews awaiting managers",
      ],
    ],
    "Employee Recognition": [
      "Recognition",
      "Celebrate work that moves the company forward.",
      ["Employee of the month", "Peer recognition feed", "Performance ranking"],
    ],
    Payroll: [
      "Payroll",
      "Accurate, secure compensation operations.",
      [
        "September payroll · Draft",
        "248 employee records",
        "₦84.2M estimated gross",
      ],
    ],
    Recruitment: [
      "Recruitment",
      "Move exceptional candidates through your pipeline.",
      ["8 open positions", "126 active candidates", "14 interviews this week"],
    ],
    Training: [
      "Training",
      "Build capability across every team.",
      [
        "12 active courses",
        "84% completion rate",
        "31 certifications expiring",
      ],
    ],
    Assets: [
      "Asset management",
      "Track equipment throughout its lifecycle.",
      ["312 assigned assets", "18 in maintenance", "7 overdue returns"],
    ],
    Announcements: [
      "Announcements",
      "Keep everyone informed and connected.",
      [
        "Quarterly town hall",
        "Updated remote work policy",
        "September birthdays",
      ],
    ],
    Reports: [
      "Reports",
      "Turn workforce data into clear decisions.",
      ["Attendance summary", "Headcount movement", "Payroll variance"],
    ],
    Settings: [
      "Settings",
      "Configure your workspace and security.",
      ["Organization profile", "Roles & permissions", "Integrations & devices"],
    ],
  };
  const [title, desc, items] = meta[view];
  if (workflow)
    return (
      <ModuleWorkflow
        module={view}
        title={workflow}
        close={() => setWorkflow(null)}
      />
    );
  return (
    <>
      <Header
        title={title}
        desc={desc}
        action={
          <button
            onClick={() => setWorkflow(`Create ${view}`)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
          >
            <Plus className="mr-2 inline" size={15} />
            Create
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((x, i) => (
          <Card key={x}>
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              {i === 0 ? (
                <Activity size={19} />
              ) : i === 1 ? (
                <TrendingUp size={19} />
              ) : (
                <FileText size={19} />
              )}
            </span>
            <h3 className="mt-4 font-medium">{x}</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Open details, assign owners, and track progress from this
              workspace.
            </p>
            <button
              onClick={() => setWorkflow(x)}
              className="mt-5 text-sm font-medium text-emerald-700"
            >
              View details →
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}

function ModuleWorkflow({
  module,
  title,
  close,
}: {
  module: View;
  title: string;
  close: () => void;
}) {
  const fields: Record<string, string[]> = {
    "Shift Management": [
      "Shift name",
      "Start time",
      "End time",
      "Assigned employees",
    ],
    Performance: ["Employee", "Review period", "KPI / goal", "Target score"],
    "Employee Recognition": [
      "Employee",
      "Award month",
      "Achievement",
      "Manager recommendation",
    ],
    Recruitment: ["Job title", "Department", "Employment type", "Closing date"],
    Training: ["Course name", "Provider", "Participants", "Completion date"],
    Assets: ["Asset name", "Serial number", "Assigned employee", "Status"],
    Announcements: ["Title", "Category", "Audience", "Publish date"],
    Reports: ["Report type", "Date from", "Date to", "Department"],
    Settings: ["Setting name", "Value", "Access role", "Effective date"],
  };
  const inputs = fields[module] ?? ["Name", "Owner", "Start date", "Status"];
  return (
    <>
      <button
        onClick={close}
        className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft size={16} />
        Back to {module}
      </button>
      <Header
        title={title}
        desc={`Complete the ${module.toLowerCase()} workflow and save it to the workspace.`}
      />
      <Card className="max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2">
          {inputs.map((field) => (
            <label key={field} className="text-xs font-medium">
              {field}
              <input
                className="input mt-1.5"
                placeholder={`Enter ${field.toLowerCase()}`}
                type={
                  field.toLowerCase().includes("date")
                    ? "date"
                    : field.toLowerCase().includes("time")
                      ? "time"
                      : "text"
                }
              />
            </label>
          ))}
        </div>
        {module === "Announcements" && (
          <label className="mt-4 block text-xs font-medium">
            Message
            <textarea
              className="input mt-1.5 min-h-24"
              placeholder="Write the announcement…"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              close();
              toast.success(`${module} record saved successfully`);
            }}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            Save and continue
          </button>
        </div>
      </Card>
    </>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:items-center sm:p-4"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
        className={`my-2 flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl bg-white shadow-2xl dark:bg-zinc-950 sm:my-0 sm:max-h-[calc(100dvh-2rem)]`}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 sm:px-6">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${title}`}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
