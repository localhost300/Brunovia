"use client";
import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Mail,
  Save,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser, UserRole } from "@/types/database";

type Member = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  status: "ACTIVE" | "SUSPENDED";
};
type Invitation = {
  id: string;
  email: string;
  role: UserRole;
  expires_at: string;
};
type Policy = {
  require_mfa: boolean;
  session_timeout_minutes: number;
  allowed_email_domains: string[];
  sso_enforced: boolean;
  sso_provider: string | null;
};
const labels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_MANAGER: "HR Manager",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};
const defaults: Policy = {
  require_mfa: false,
  session_timeout_minutes: 480,
  allowed_email_domains: [],
  sso_enforced: false,
  sso_provider: null,
};

export function RoleManagement({ user }: { user: AppUser }) {
  const database = hasSupabaseConfig(),
    canManage = user.role === "SUPER_ADMIN";
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<UserRole>("EMPLOYEE"),
    [query, setQuery] = useState(""),
    [policy, setPolicy] = useState(defaults),
    [domains, setDomains] = useState(""),
    [saving, setSaving] = useState(false);
  const currentOrganization = useCallback(async () => {
    const { data } = await createClient()
      .from("users")
      .select("current_organization_id")
      .eq("id", user.id)
      .single();
    return data?.current_organization_id as string | undefined;
  }, [user.id]);
  const load = useCallback(async () => {
    if (!database) return;
    const supabase = createClient(),
      organizationId = await currentOrganization();
    if (!organizationId) return;
    const [memberResult, inviteResult, policyResult] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("user_id,role,status,users(full_name,email)")
        .eq("organization_id", organizationId),
      supabase
        .from("organization_invitations")
        .select("id,email,role,expires_at")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_security_policies")
        .select(
          "require_mfa,session_timeout_minutes,allowed_email_domains,sso_enforced,sso_provider",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);
    if (memberResult.error)
      return toast.error("Could not load organization access controls");
    setMembers(
      (memberResult.data ?? []).map((row) => {
        const profile = row.users as unknown as {
          full_name: string;
          email: string | null;
        } | null;
        return {
          userId: row.user_id,
          name: profile?.full_name ?? "Unknown user",
          email: profile?.email ?? "Email unavailable",
          role: row.role as UserRole,
          status: row.status as Member["status"],
        };
      }),
    );
    setInvitations((inviteResult.data ?? []) as Invitation[]);
    if (policyResult.data) {
      const next = policyResult.data as Policy;
      setPolicy(next);
      setDomains(next.allowed_email_domains.join(", "));
    }
  }, [currentOrganization, database]);
  useEffect(() => {
    void load();
  }, [load]);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!canManage) return toast.error("Only Super Admins can invite members");
    if (!/^\S+@\S+\.\S+$/.test(normalized))
      return toast.error("Enter a valid email address");
    setSaving(true);
    if (database) {
      const { data, error } = await createClient().rpc(
        "invite_organization_member",
        { p_email: normalized, p_role: role },
      );
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      toast.success(
        (data as { status?: string })?.status === "ACTIVE"
          ? "Existing account added"
          : "Invitation recorded for delivery",
      );
      await load();
    } else return toast.error("Supabase is not configured");
    setEmail("");
    setSaving(false);
  };
  const updateMember = async (
    member: Member,
    changes: Partial<Pick<Member, "role" | "status">>,
  ) => {
    const next = { ...member, ...changes };
    if (!canManage) return;
    if (database) {
      const { error } = await createClient().rpc("update_organization_member", {
        p_user_id: member.userId,
        p_role: next.role,
        p_status: next.status,
      });
      if (error) return toast.error(error.message);
    }
    setMembers((items) =>
      items.map((item) => (item.userId === member.userId ? next : item)),
    );
    toast.success("Membership updated");
  };
  const savePolicy = async () => {
    if (!canManage) return;
    const next = {
      ...policy,
      allowed_email_domains: domains
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    };
    setSaving(true);
    if (database) {
      const organizationId = await currentOrganization();
      const { error } = await createClient()
        .from("organization_security_policies")
        .update({
          ...next,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId ?? "");
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    setPolicy(next);
    setSaving(false);
    toast.success("Identity policy saved");
  };
  const visible = members.filter((member) =>
    `${member.name} ${member.email} ${member.role}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase text-emerald-700">
          Identity & access
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Organization access</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Provision members, manage tenant roles, and define authentication
          policy.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.45fr]">
        <section className="h-fit rounded-lg border bg-white p-5 dark:bg-zinc-950">
          <div className="flex items-center gap-3">
            <UserCog className="text-emerald-700" />
            <div>
              <h2 className="font-semibold">Invite a member</h2>
              <p className="text-xs text-zinc-500">
                Registered accounts activate immediately; others remain pending.
              </p>
            </div>
          </div>
          <form onSubmit={invite} className="mt-5 space-y-4">
            <label className="block text-xs font-medium">
              Work email
              <div className="relative mt-1.5">
                <Mail
                  className="absolute left-3 top-3 text-zinc-400"
                  size={16}
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input pl-10"
                  type="email"
                  disabled={!canManage}
                />
              </div>
            </label>
            <label className="block text-xs font-medium">
              Organization role
              <select
                className="input mt-1.5"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
                disabled={!canManage}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!canManage || saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mail size={16} />
              )}
              Invite member
            </button>
          </form>
          {invitations.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-semibold">
                Pending invitations · {invitations.length}
              </p>
              {invitations.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="mt-2 flex justify-between text-xs"
                >
                  <span className="truncate">{item.email}</span>
                  <span className="text-zinc-400">{labels[item.role]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-lg border bg-white p-5 dark:bg-zinc-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Membership directory</h2>
              <p className="text-xs text-zinc-500">
                {members.length} organization members
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-lg border px-3">
              <Search size={15} />
              <input
                className="w-44 bg-transparent py-2 text-xs outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search members"
              />
            </label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-zinc-500">
                  <th className="pb-3">Member</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((member) => (
                  <tr key={member.userId} className="border-b last:border-0">
                    <td className="py-3">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-xs text-zinc-500">{member.email}</p>
                    </td>
                    <td>
                      <select
                        value={member.role}
                        disabled={!canManage}
                        onChange={(event) =>
                          void updateMember(member, {
                            role: event.target.value as UserRole,
                          })
                        }
                        className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                      >
                        {Object.entries(labels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        disabled={!canManage}
                        onClick={() =>
                          void updateMember(member, {
                            status:
                              member.status === "ACTIVE"
                                ? "SUSPENDED"
                                : "ACTIVE",
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${member.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                      >
                        {member.status}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="rounded-lg border bg-white p-5 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <KeyRound className="text-emerald-700" />
          <div>
            <h2 className="font-semibold">Authentication policy</h2>
            <p className="text-xs text-zinc-500">
              Connection secrets remain in your identity provider and Supabase
              configuration.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            Require MFA
            <input
              type="checkbox"
              checked={policy.require_mfa}
              disabled={!canManage}
              onChange={(event) =>
                setPolicy({ ...policy, require_mfa: event.target.checked })
              }
            />
          </label>
          <label className="text-xs font-medium">
            Session timeout (minutes)
            <input
              type="number"
              min={15}
              max={10080}
              className="input mt-1.5"
              value={policy.session_timeout_minutes}
              disabled={!canManage}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  session_timeout_minutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="text-xs font-medium md:col-span-2">
            Allowed email domains
            <input
              className="input mt-1.5"
              value={domains}
              disabled={!canManage}
              onChange={(event) => setDomains(event.target.value)}
              placeholder="company.com, subsidiary.com"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            Enforce configured SSO
            <input
              type="checkbox"
              checked={policy.sso_enforced}
              disabled={!canManage}
              onChange={(event) =>
                setPolicy({ ...policy, sso_enforced: event.target.checked })
              }
            />
          </label>
          <label className="text-xs font-medium">
            SSO provider
            <input
              className="input mt-1.5"
              value={policy.sso_provider ?? ""}
              disabled={!canManage}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  sso_provider: event.target.value || null,
                })
              }
              placeholder="Microsoft Entra ID / Okta"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => void savePolicy()}
            disabled={!canManage || saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save size={16} />
            Save identity policy
          </button>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          Activate SAML SSO and MFA factors in Supabase Auth before enforcing
          these policies for production users.
        </div>
      </section>
    </div>
  );
}
