"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppUser } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";

type Membership = {
  organization_id: string;
  role: AppUser["role"];
  organizations: { id: string; name: string; slug: string } | null;
};

export function OrganizationSwitcher({
  user,
  collapsed = false,
}: {
  user: AppUser;
  collapsed?: boolean;
}) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setLoadError("Supabase is not configured.");
      setLoaded(true);
      return;
    }
    let active = true;
    const load = async () => {
      const supabase = createClient();
      const [{ data: profile }, { data, error }] = await Promise.all([
        supabase
          .from("users")
          .select("current_organization_id")
          .eq("id", user.id)
          .single(),
        supabase
          .from("organization_memberships")
          .select("organization_id,role,organizations(id,name,slug)")
          .eq("user_id", user.id)
          .eq("status", "ACTIVE"),
      ]);
      if (!active) return;
      if (error) {
        setLoadError(error.message);
        setLoaded(true);
        return;
      }
      setMemberships((data ?? []) as unknown as Membership[]);
      setCurrentId(
        profile?.current_organization_id ?? data?.[0]?.organization_id ?? null,
      );
      setLoaded(true);
    };
    void load();
    return () => {
      active = false;
    };
  }, [user.id, user.role]);

  const switchOrganization = async (organizationId: string) => {
    if (organizationId === currentId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    const { error } = await createClient().rpc("switch_organization", {
      p_organization_id: organizationId,
    });
    if (error) {
      toast.error(`Could not switch organization: ${error.message}`);
      setSwitching(false);
      return;
    }
    window.location.reload();
  };
  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = organizationName.trim(),
      slug = organizationSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (name.length < 2 || !slug)
      return toast.error("Enter an organization name and valid slug");
    setSwitching(true);
    const { error } = await createClient().rpc("create_organization", {
      p_name: name,
      p_slug: slug,
    });
    if (error) {
      setSwitching(false);
      return toast.error(error.message);
    }
    toast.success(`${name} created`);
    window.location.reload();
  };

  const organizationForm = (canClose: boolean) => (
    <form
      onSubmit={createOrganization}
      onMouseDown={(event) => event.stopPropagation()}
      className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-2xl dark:bg-zinc-950"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-4 grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950">
            <Building2 size={22} />
          </div>
          <h2 className="text-xl font-semibold">Create your organization</h2>
          <p className="mt-1.5 text-sm leading-6 text-zinc-500">
            Set up your Brunovia workspace. You will become its first Super
            Admin.
          </p>
        </div>
        {canClose && (
          <button
            type="button"
            onClick={() => setCreating(false)}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <label className="mt-6 block text-xs font-medium">
        Organization name
        <input
          autoFocus
          required
          minLength={2}
          maxLength={120}
          className="input mt-1.5"
          value={organizationName}
          onChange={(event) => {
            const value = event.target.value;
            setOrganizationName(value);
            setOrganizationSlug(
              value
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
            );
          }}
          placeholder="Brunovia Limited"
        />
      </label>
      <label className="mt-4 block text-xs font-medium">
        Workspace slug
        <input
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          maxLength={63}
          className="input mt-1.5"
          value={organizationSlug}
          onChange={(event) =>
            setOrganizationSlug(
              event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
            )
          }
          placeholder="brunovia-limited"
        />
      </label>
      <p className="mt-2 text-xs text-zinc-400">
        The slug is your permanent, unique workspace identifier.
      </p>
      <button
        disabled={switching}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {switching ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Plus size={16} />
        )}
        Create organization
      </button>
    </form>
  );

  if (!loaded) {
    return (
      <div className="grid h-16 place-items-center border-b text-zinc-400">
        <Loader2 size={17} className="animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border-b p-3 text-xs leading-5 text-red-600">
        Could not load organizations: {loadError}
      </div>
    );
  }

  if (!memberships.length) {
    if (user.role !== "SUPER_ADMIN") {
      return (
        <div className="border-b p-3 text-xs leading-5 text-amber-700">
          No organization access. Ask a Super Admin to add you.
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/70 p-4 backdrop-blur-sm">
        {organizationForm(false)}
      </div>
    );
  }

  const current =
    memberships.find(
      (membership) => membership.organization_id === currentId,
    ) ?? memberships[0];

  return (
    <div className="relative border-b p-3">
      <button
        type="button"
        disabled={switching}
        onClick={() => setOpen((value) => !value)}
        title={current.organizations?.name}
        className="flex w-full items-center gap-3 rounded-lg border bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:opacity-60 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        {switching ? (
          <Loader2 size={17} className="shrink-0 animate-spin" />
        ) : (
          <Building2 size={17} className="shrink-0 text-emerald-700" />
        )}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate font-medium">
              {current.organizations?.name ?? "Organization"}
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-zinc-400" />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="absolute left-3 right-3 top-[62px] z-50 rounded-lg border bg-white p-1 shadow-xl dark:bg-zinc-950">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Switch organization
          </p>
          {memberships.map((membership) => (
            <button
              key={membership.organization_id}
              type="button"
              onClick={() =>
                void switchOrganization(membership.organization_id)
              }
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <span className="min-w-0 flex-1 truncate">
                {membership.organizations?.name}
              </span>
              {membership.organization_id === currentId && (
                <Check size={15} className="text-emerald-700" />
              )}
            </button>
          ))}
          {user.role === "SUPER_ADMIN" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="mt-1 flex w-full items-center gap-2 border-t px-2 py-2.5 text-left text-sm font-medium text-emerald-700"
            >
              <Plus size={15} />
              Create organization
            </button>
          )}
        </div>
      )}
      {creating && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4"
          onMouseDown={() => setCreating(false)}
        >
          {organizationForm(true)}
        </div>
      )}
    </div>
  );
}
