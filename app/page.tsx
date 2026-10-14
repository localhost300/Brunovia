"use client";
import { useEffect, useRef, useState } from "react";
import { Login } from "@/features/auth/login";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
import { ErrorState, PageLoading } from "@/components/app-states";
import { PasswordSetup } from "@/features/auth/password-setup";

export default function Home({
  initialView,
  allowedRoles,
  portalName,
}: {
  initialView?: string;
  allowedRoles?: AppUser["role"][];
  portalName?: string;
} = {}) {
  const [user, setUser] = useState<AppUser | null>(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState<string | null>(null),
    [settingPassword, setSettingPassword] = useState(false);
  const currentUser = useRef<AppUser | null>(null);
  const authRevision = useRef(0);
  useEffect(() => {
    setSettingPassword(
      new URLSearchParams(window.location.search).get("setup") === "password",
    );
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    const loadProfile = async (
      userId: string,
      email: string,
      revision: number,
    ) => {
      if (!active || revision !== authRevision.current) return;
      const { data: profile, error } = await supabase
        .from("users")
        .select("full_name,role")
        .eq("id", userId)
        .single();

      if (!active || revision !== authRevision.current) return;
      if (error) {
        // A temporary failure during a background profile refresh must not
        // discard the signed-in user's open workspace and unsaved form state.
        if (currentUser.current?.id === userId) return;
        currentUser.current = null;
        setUser(null);
        setAuthError(
          "Your account is signed in, but its Brunovia profile could not be loaded. Ask an administrator to verify the database migrations and user profile.",
        );
        setLoading(false);
        return;
      }

      if (allowedRoles && !allowedRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        currentUser.current = null;
        setUser(null);
        setAuthError(
          `This account does not have access to the ${portalName ?? "requested"} portal.`,
        );
        setLoading(false);
        return;
      }

      setAuthError(null);
      const nextUser: AppUser = {
        id: userId,
        email,
        name: profile.full_name,
        role: profile.role,
      };
      currentUser.current = nextUser;
      setUser(nextUser);
      setLoading(false);
    };

    const restore = async () => {
      const revision = ++authRevision.current;
      const { data, error } = await supabase.auth.getUser();
      if (!active || revision !== authRevision.current) return;
      if (error && error.name !== "AuthSessionMissingError") {
        setAuthError(
          "The secure session could not be verified. Please sign in again.",
        );
      }
      if (data.user) {
        await loadProfile(data.user.id, data.user.email ?? "", revision);
      } else {
        currentUser.current = null;
        setUser(null);
        setLoading(false);
      }
    };

    void restore();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || event === "INITIAL_SESSION") return;
        if (!session?.user) {
          ++authRevision.current;
          currentUser.current = null;
          setUser(null);
          setLoading(false);
          return;
        }
        const sameUser = currentUser.current?.id === session.user.id;
        // Supabase emits SIGNED_IN again on tab focus, and refreshes tokens
        // automatically. Neither event should remount an existing workspace.
        if (sameUser && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED"))
          return;
        if (event === "PASSWORD_RECOVERY") setSettingPassword(true);
        const revision = ++authRevision.current;
        if (!sameUser) {
          currentUser.current = null;
          setUser(null);
          setLoading(true);
        }
        // Run Supabase queries after its auth callback has released its lock.
        window.setTimeout(() => {
          void loadProfile(session.user.id, session.user.email ?? "", revision);
        }, 0);
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [allowedRoles, portalName]);
  const signOut = async () => {
    if (hasSupabaseConfig()) await createClient().auth.signOut();
    ++authRevision.current;
    currentUser.current = null;
    setUser(null);
  };
  if (loading) return <PageLoading label="Loading secure workspace…" />;
  if (user && settingPassword)
    return <PasswordSetup onComplete={() => setSettingPassword(false)} />;
  return user ? (
    <AppShell
      key={user.id}
      user={user}
      onSignOut={signOut}
      initialView={initialView}
    />
  ) : (
    <div>
      {authError && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl">
          <ErrorState
            title="Account could not be loaded"
            description={authError}
            retry={() => window.location.reload()}
          />
        </div>
      )}
      <Login
        onSuccess={(signedInUser) => {
          ++authRevision.current;
          currentUser.current = signedInUser;
          setUser(signedInUser);
          setAuthError(null);
          setLoading(false);
        }}
        allowedRoles={allowedRoles}
        portalName={portalName}
      />
    </div>
  );
}
