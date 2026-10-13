"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Download,
  FileClock,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
type Tab = "Audit log" | "Security events" | "Retention" | "Service health";
type Audit = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
};
type Event = {
  id: number;
  severity: string;
  event_type: string;
  status: string;
  created_at: string;
  details: Record<string, unknown>;
};
type Retention = {
  id: string;
  data_category: string;
  retention_days: number;
  legal_hold: boolean;
  active: boolean;
};
type Health = {
  id: number;
  service: string;
  status: string;
  latency_ms: number | null;
  checked_at: string;
};
const demoAudit: Audit[] = [
  {
    id: 1,
    action: "MEMBERSHIP_UPDATED",
    entity_type: "organization_membership",
    entity_id: "demo-hr",
    user_id: "demo-super",
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    action: "PAYROLL_APPROVED",
    entity_type: "pay_run",
    entity_id: "SEP-2026",
    user_id: "demo-super",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];
const demoEvents: Event[] = [
  {
    id: 1,
    severity: "MEDIUM",
    event_type: "REPEATED_LOGIN_FAILURE",
    status: "OPEN",
    created_at: new Date().toISOString(),
    details: { attempts: 5 },
  },
];
const demoRetention: Retention[] = [
  {
    id: "r1",
    data_category: "AUDIT_LOGS",
    retention_days: 2555,
    legal_hold: false,
    active: true,
  },
  {
    id: "r2",
    data_category: "PAYROLL",
    retention_days: 2555,
    legal_hold: false,
    active: true,
  },
  {
    id: "r3",
    data_category: "RECRUITMENT",
    retention_days: 730,
    legal_hold: false,
    active: true,
  },
];
const demoHealth: Health[] = [
  {
    id: 1,
    service: "Database",
    status: "OPERATIONAL",
    latency_ms: 42,
    checked_at: new Date().toISOString(),
  },
  {
    id: 2,
    service: "Authentication",
    status: "OPERATIONAL",
    latency_ms: 68,
    checked_at: new Date().toISOString(),
  },
  {
    id: 3,
    service: "Background jobs",
    status: "DEGRADED",
    latency_ms: 412,
    checked_at: new Date().toISOString(),
  },
];
export function ComplianceWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig() && !user.id.startsWith("demo-");
  const [tab, setTab] = useState<Tab>("Audit log"),
    [audit, setAudit] = useState<Audit[]>(configured ? [] : demoAudit),
    [events, setEvents] = useState<Event[]>(configured ? [] : demoEvents),
    [retention, setRetention] = useState<Retention[]>(
      configured ? [] : demoRetention,
    ),
    [health, setHealth] = useState<Health[]>(configured ? [] : demoHealth),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(configured);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    const client = createClient();
    const [a, e, r, h] = await Promise.all([
      client
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,user_id,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      client
        .from("security_events")
        .select("id,severity,event_type,status,created_at,details")
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("data_retention_policies")
        .select("id,data_category,retention_days,legal_hold,active")
        .order("data_category"),
      client
        .from("service_health_checks")
        .select("id,service,status,latency_ms,checked_at")
        .order("checked_at", { ascending: false })
        .limit(50),
    ]);
    if (a.error || e.error || r.error || h.error)
      toast.error("Could not load all compliance records");
    else {
      setAudit(a.data as Audit[]);
      setEvents(e.data as Event[]);
      setRetention(r.data as Retention[]);
      setHealth(h.data as Health[]);
    }
    setLoading(false);
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const resolve = async (item: Event) => {
    if (user.role !== "SUPER_ADMIN")
      return toast.error("Only Super Admins can resolve events");
    if (configured) {
      const { error } = await createClient().rpc("resolve_security_event", {
        p_event_id: item.id,
        p_status: "RESOLVED",
      });
      if (error) return toast.error(error.message);
    }
    setEvents((rows) =>
      rows.map((row) =>
        row.id === item.id ? { ...row, status: "RESOLVED" } : row,
      ),
    );
    toast.success("Security event resolved");
  };
  const saveRetention = async (item: Retention) => {
    if (user.role !== "SUPER_ADMIN")
      return toast.error("Only Super Admins can change retention");
    if (configured) {
      const { error } = await createClient()
        .from("data_retention_policies")
        .update({
          retention_days: item.retention_days,
          legal_hold: item.legal_hold,
          active: item.active,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (error) return toast.error(error.message);
    }
    toast.success("Retention policy saved");
  };
  const exportEvidence = async () => {
    const input = {
      framework: "GENERAL_CONTROLS",
      date_from: new Date(Date.now() - 2592000000).toISOString().slice(0, 10),
      date_to: new Date().toISOString().slice(0, 10),
      format: "CSV",
      requested_by: user.id,
    };
    if (configured) {
      const { error } = await createClient()
        .from("compliance_exports")
        .insert(input);
      if (error) return toast.error(error.message);
    } else {
      const csv =
        "timestamp,action,entity_type,entity_id\n" +
        audit
          .map(
            (row) =>
              `${row.created_at},${row.action},${row.entity_type},${row.entity_id ?? ""}`,
          )
          .join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      link.download = "compliance-evidence.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }
    toast.success(
      configured ? "Evidence export queued" : "Evidence downloaded",
    );
  };
  const filtered = audit.filter((row) =>
    `${row.action} ${row.entity_type} ${row.entity_id ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const summary = [
    ["Open security events", events.filter((item) => item.status === "OPEN").length, ShieldAlert],
    ["Audit records loaded", audit.length, FileClock],
    ["Operational services", health.filter((item) => item.status === "OPERATIONAL").length, Activity],
  ] as const;
  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Governance
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Compliance & observability
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Investigate activity, govern retention, and export audit evidence.
          </p>
        </div>
        <button
          onClick={() => void exportEvidence()}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white"
        >
          <Download size={16} />
          Export evidence
        </button>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {summary.map(([label, value, Icon]) => (
          <div
            key={String(label)}
            className="rounded-xl border bg-white p-4 dark:bg-zinc-950"
          >
            <Icon className="text-emerald-700" size={18} />
            <p className="mt-3 text-2xl font-semibold">{String(value)}</p>
            <p className="text-xs text-zinc-500">{String(label)}</p>
          </div>
        ))}
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b">
        {(
          [
            "Audit log",
            "Security events",
            "Retention",
            "Service health",
          ] as Tab[]
        ).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === item ? "border-emerald-700 font-medium text-emerald-700" : "border-transparent text-zinc-500"}`}
          >
            {item}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="grid min-h-72 place-items-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : tab === "Audit log" ? (
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
          <label className="flex max-w-sm items-center gap-2 rounded-lg border px-3">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Search actions or entities"
            />
          </label>
          <Table headers={["Time", "Action", "Entity", "Reference", "Actor"]}>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t">
                <Cell>{new Date(row.created_at).toLocaleString()}</Cell>
                <Cell>{row.action}</Cell>
                <Cell>{row.entity_type}</Cell>
                <Cell>{row.entity_id ?? "—"}</Cell>
                <Cell>{row.user_id?.slice(0, 8) ?? "System"}</Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : tab === "Security events" ? (
        <section className="rounded-xl border bg-white p-5 dark:bg-zinc-950">
          <Table headers={["Time", "Severity", "Event", "Status", ""]}>
            {events.map((item) => (
              <tr key={item.id} className="border-t">
                <Cell>{new Date(item.created_at).toLocaleString()}</Cell>
                <Cell>
                  <Badge value={item.severity} />
                </Cell>
                <Cell>{item.event_type}</Cell>
                <Cell>{item.status}</Cell>
                <Cell>
                  {item.status !== "RESOLVED" && (
                    <button
                      onClick={() => void resolve(item)}
                      className="text-xs font-medium text-emerald-700"
                    >
                      Resolve
                    </button>
                  )}
                </Cell>
              </tr>
            ))}
          </Table>
        </section>
      ) : tab === "Retention" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {retention.map((item) => (
            <section
              key={item.id}
              className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
            >
              <p className="font-medium">
                {item.data_category.replaceAll("_", " ")}
              </p>
              <label className="mt-4 block text-xs">
                Retention days
                <input
                  type="number"
                  className="input mt-1"
                  value={item.retention_days}
                  onChange={(event) =>
                    setRetention((rows) =>
                      rows.map((row) =>
                        row.id === item.id
                          ? {
                              ...row,
                              retention_days: Number(event.target.value),
                            }
                          : row,
                      ),
                    )
                  }
                />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.legal_hold}
                  onChange={(event) =>
                    setRetention((rows) =>
                      rows.map((row) =>
                        row.id === item.id
                          ? { ...row, legal_hold: event.target.checked }
                          : row,
                      ),
                    )
                  }
                />
                Legal hold
              </label>
              <button
                onClick={() => void saveRetention(item)}
                className="mt-4 rounded border px-3 py-1.5 text-xs"
              >
                Save policy
              </button>
            </section>
          ))}
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {health.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border bg-white p-5 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.service}</p>
                <Badge value={item.status} />
              </div>
              <p className="mt-4 text-2xl font-semibold">
                {item.latency_ms ?? "—"}
                <span className="text-xs font-normal text-zinc-400"> ms</span>
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {new Date(item.checked_at).toLocaleString()}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="px-3 py-3 text-xs font-medium text-zinc-400"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3">{children}</td>;
}
function Badge({ value }: { value: string }) {
  const urgent = ["HIGH", "CRITICAL", "OUTAGE"].includes(value),
    good = ["OPERATIONAL", "RESOLVED", "INFO"].includes(value);
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${urgent ? "bg-red-50 text-red-700" : good ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
    >
      {value}
    </span>
  );
}
