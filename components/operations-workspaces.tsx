"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, Box, Loader2, Plus, X } from "lucide-react";
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
type Asset = {
  id: string;
  asset_tag: string | null;
  name: string;
  category: string;
  serial_number: string | null;
  assigned_employee_id: string | null;
  status: string;
  condition: string | null;
  employees?: Employee | null;
};
const demoEmployee = {
  id: "demo-1",
  employee_id: "PF-1001",
  first_name: "Amara",
  last_name: "Okafor",
};
const demoAssets: Asset[] = [
  {
    id: "asset-1",
    asset_tag: "PF-LAP-001",
    name: "MacBook Pro 14",
    category: "Laptop",
    serial_number: "DEMO-001",
    assigned_employee_id: "demo-1",
    status: "ASSIGNED",
    condition: "GOOD",
    employees: demoEmployee,
  },
];
const label = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (x) => x.toUpperCase());
export function AssetsWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig(),
    canManage = user.role !== "EMPLOYEE";
  const [assets, setAssets] = useState<Asset[]>(configured ? [] : demoAssets),
    [employees, setEmployees] = useState<Employee[]>(
      configured ? [] : [demoEmployee],
    ),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState<string | null>(null),
    [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const c = createClient();
      const [a, e] = await Promise.all([
        c
          .from("assets")
          .select(
            "id,asset_tag,name,category,serial_number,assigned_employee_id,status,condition,employees(id,employee_id,first_name,last_name)",
          )
          .is("deleted_at", null)
          .order("name"),
        c
          .from("employees")
          .select("id,employee_id,first_name,last_name")
          .is("deleted_at", null)
          .eq("status", "ACTIVE"),
      ]);
      if (a.error) throw a.error;
      if (e.error) throw e.error;
      setAssets(a.data as unknown as Asset[]);
      setEmployees(e.data as Employee[]);
      setError(null);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to load assets");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const transfer = async (asset: Asset, employeeId: string) => {
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "transfer_asset_custody",
          {
            p_asset_id: asset.id,
            p_employee_id: employeeId || null,
            p_condition: asset.condition ?? "GOOD",
            p_note: null,
          },
        );
        if (e) throw e;
        await load();
      } else
        setAssets((v) =>
          v.map((a) =>
            a.id === asset.id
              ? {
                  ...a,
                  assigned_employee_id: employeeId || null,
                  status: employeeId ? "ASSIGNED" : "AVAILABLE",
                  employees: employees.find((e) => e.id === employeeId) ?? null,
                }
              : a,
          ),
        );
      toast.success(
        employeeId ? "Asset custody assigned" : "Asset returned to inventory",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update custody");
    }
  };
  const create = async (d: FormData) => {
    const input = {
      asset_tag: String(d.get("tag")),
      name: String(d.get("name")),
      category: String(d.get("category")),
      serial_number: String(d.get("serial")) || null,
      status: "AVAILABLE",
      condition: "NEW",
    };
    try {
      if (configured) {
        const { error: e } = await createClient().from("assets").insert(input);
        if (e) throw e;
        await load();
      } else
        setAssets((v) => [
          {
            ...input,
            id: crypto.randomUUID(),
            assigned_employee_id: null,
            employees: null,
          },
          ...v,
        ]);
      setCreating(false);
      toast.success("Asset registered");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to register asset");
    }
  };
  return (
    <>
      <Top
        title="Assets"
        sub="Inventory, custody, returns, condition, and maintenance history"
        action={
          canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-emerald-700 px-4 py-2 text-sm text-white"
            >
              <Plus className="mr-1 inline" size={15} />
              Register asset
            </button>
          ) : null
        }
      />
      {!configured && <Demo />}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat l="Total assets" v={assets.length} />
        <Stat
          l="Assigned"
          v={assets.filter((a) => a.status === "ASSIGNED").length}
        />
        <Stat
          l="Available"
          v={assets.filter((a) => a.status === "AVAILABLE").length}
        />
      </div>
      <Panel>
        {loading ? (
          <Loading />
        ) : error ? (
          <Err t={error} />
        ) : assets.length === 0 ? (
          <Empty icon={<Box />} text="No assets registered" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Asset",
                    "Tag / serial",
                    "Custodian",
                    "Condition",
                    "Status",
                    "Custody action",
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
                {assets.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-3 font-medium">
                      {a.name}
                      <span className="block text-xs text-zinc-400">
                        {a.category}
                      </span>
                    </td>
                    <td className="px-3">
                      {a.asset_tag}
                      <span className="block text-xs text-zinc-400">
                        {a.serial_number}
                      </span>
                    </td>
                    <td className="px-3">
                      {a.employees
                        ? `${a.employees.first_name} ${a.employees.last_name}`
                        : "Unassigned"}
                    </td>
                    <td className="px-3">{label(a.condition ?? "UNKNOWN")}</td>
                    <td className="px-3">{label(a.status)}</td>
                    <td className="px-3">
                      {canManage && (
                        <select
                          aria-label={`Custodian for ${a.name}`}
                          value={a.assigned_employee_id ?? ""}
                          onChange={(e) => void transfer(a, e.target.value)}
                          className="rounded border px-2 py-1.5 text-xs"
                        >
                          <option value="">Return to inventory</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.first_name} {e.last_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && (
        <Modal title="Register asset" close={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create(new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <input
              name="name"
              required
              placeholder="Asset name"
              className="input"
            />
            <input
              name="tag"
              required
              placeholder="Asset tag"
              className="input"
            />
            <input
              name="category"
              required
              placeholder="Category"
              className="input"
            />
            <input
              name="serial"
              placeholder="Serial number"
              className="input"
            />
            <button className="w-full rounded bg-emerald-700 py-2 text-sm text-white">
              Register asset
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  published_at: string | null;
  publish_at: string | null;
  requires_acknowledgement: boolean;
  acknowledgement_count?: number;
};
const demoAnnouncements: Announcement[] = [
  {
    id: "ann-1",
    title: "Updated workplace policy",
    body: "Please review the updated workplace policy before the end of the month.",
    category: "POLICY",
    audience: "ALL",
    published_at: new Date().toISOString(),
    publish_at: null,
    requires_acknowledgement: true,
    acknowledgement_count: 12,
  },
];
export function AnnouncementsWorkspace({ user }: { user: AppUser }) {
  const configured = hasSupabaseConfig(),
    canManage = user.role !== "EMPLOYEE";
  const [items, setItems] = useState<Announcement[]>(
      configured ? [] : demoAnnouncements,
    ),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState<string | null>(null),
    [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const { data, error: e } = await createClient()
        .from("announcements")
        .select(
          "id,title,body,category,audience,published_at,publish_at,requires_acknowledgement",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (e) throw e;
      setItems(data as Announcement[]);
      setError(null);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Unable to load announcements");
    } finally {
      setLoading(false);
    }
  }, [configured]);
  useEffect(() => {
    void load();
  }, [load]);
  const acknowledge = async (a: Announcement) => {
    try {
      if (configured) {
        const { error: e } = await createClient().rpc(
          "acknowledge_announcement",
          { p_announcement_id: a.id },
        );
        if (e) throw e;
      }
      toast.success("Announcement acknowledged");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to acknowledge");
    }
  };
  const publish = async (d: FormData) => {
    const input = {
      title: String(d.get("title")),
      body: String(d.get("body")),
      category: String(d.get("category")),
      audience: String(d.get("audience")),
      requires_acknowledgement: d.get("ack") === "on",
      publish_at: String(d.get("publish_at")) || null,
      published_at: String(d.get("publish_at"))
        ? null
        : new Date().toISOString(),
    };
    try {
      if (configured) {
        const { data: auth } = await createClient().auth.getUser();
        const { error: e } = await createClient()
          .from("announcements")
          .insert({ ...input, published_by: auth.user?.id });
        if (e) throw e;
        await load();
      } else setItems((v) => [{ ...input, id: crypto.randomUUID() }, ...v]);
      setCreating(false);
      toast.success(
        input.publish_at ? "Announcement scheduled" : "Announcement published",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Unable to publish announcement",
      );
    }
  };
  return (
    <>
      <Top
        title="Announcements"
        sub="Targeted, scheduled internal communications with acknowledgements"
        action={
          canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="rounded bg-emerald-700 px-4 py-2 text-sm text-white"
            >
              <Plus className="mr-1 inline" size={15} />
              New announcement
            </button>
          ) : null
        }
      />
      {!configured && <Demo />}
      <Panel>
        {loading ? (
          <Loading />
        ) : error ? (
          <Err t={error} />
        ) : items.length === 0 ? (
          <Empty icon={<Bell />} text="No announcements" />
        ) : (
          <div className="space-y-4">
            {items.map((a) => (
              <article key={a.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium text-emerald-700">
                      {a.category} · {a.audience}
                    </span>
                    <h2 className="mt-1 font-semibold">{a.title}</h2>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {a.published_at ? "Published" : `Scheduled ${a.publish_at}`}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{a.body}</p>
                {a.requires_acknowledgement && (
                  <button
                    onClick={() => void acknowledge(a)}
                    className="mt-3 rounded border px-3 py-1.5 text-xs"
                  >
                    Acknowledge
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
      {creating && (
        <Modal title="New announcement" close={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void publish(new FormData(e.currentTarget));
            }}
            className="space-y-3"
          >
            <input
              name="title"
              required
              placeholder="Title"
              className="input"
            />
            <textarea
              name="body"
              required
              placeholder="Message"
              className="input min-h-28"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="category" className="input">
                <option>GENERAL</option>
                <option>POLICY</option>
                <option>BENEFITS</option>
                <option>EMERGENCY</option>
              </select>
              <select name="audience" className="input">
                <option>ALL</option>
                <option>MANAGERS</option>
                <option>EMPLOYEES</option>
              </select>
            </div>
            <label className="block text-xs">
              Schedule (optional)
              <input
                name="publish_at"
                type="datetime-local"
                className="input mt-1"
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input name="ack" type="checkbox" />
              Require acknowledgement
            </label>
            <button className="w-full rounded bg-emerald-700 py-2 text-sm text-white">
              Publish or schedule
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Top({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{sub}</p>
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
function Stat({ l, v }: { l: string; v: number }) {
  return (
    <Panel>
      <p className="text-sm text-zinc-500">{l}</p>
      <p className="mt-2 text-3xl font-semibold">{v}</p>
    </Panel>
  );
}
function Demo() {
  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Demo mode: changes are temporary.
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-52 place-items-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
function Err({ t }: { t: string }) {
  return <p className="py-12 text-center text-red-600">{t}</p>;
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-14 text-center text-zinc-400">
      {icon}
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
      onMouseDown={close}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-5 dark:bg-zinc-950"
      >
        <div className="mb-4 flex justify-between">
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
