"use client";
import { useEffect, useState } from "react";
import { Login } from "@/features/auth/login";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { AppUser } from "@/types/database";
import { ErrorState, PageLoading } from "@/components/app-states";
import { PasswordSetup } from "@/features/auth/password-setup";

export default function Home({ initialView }: { initialView?: string } = {}) {
  const [user, setUser] = useState<AppUser | null>(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState<string | null>(null),
    [settingPassword, setSettingPassword] = useState(false);
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

    const loadProfile = async (userId: string, email = "") => {
      const { data: profile, error } = await supabase
        .from("users")
        .select("full_name,role")
        .eq("id", userId)
        .single();

      if (!active) return;
      if (error) {
        setUser(null);
        setAuthError(
          "Your account is signed in, but its Brunovia profile could not be loaded. Ask an administrator to verify the database migrations and user profile.",
        );
        setLoading(false);
        return;
      }

      setAuthError(null);
      setUser({
        id: userId,
        email,
        name: profile.full_name,
        role: profile.role,
      });
      setLoading(false);
    };

    const restore = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error && error.name !== "AuthSessionMissingError") {
        setAuthError(
          "The secure session could not be verified. Please sign in again.",
        );
      }
      if (data.user) {
        await loadProfile(data.user.id, data.user.email ?? "");
      } else {
        setUser(null);
        setLoading(false);
      }
    };

    void restore();
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active || event === "INITIAL_SESSION") return;
        if (!session?.user) {
          setUser(null);
          setLoading(false);
          return;
        }
        setLoading(true);
        void loadProfile(session.user.id, session.user.email ?? "");
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const signOut = async () => {
    if (hasSupabaseConfig()) await createClient().auth.signOut();
    setUser(null);
  };
  if (loading) return <PageLoading label="Loading secure workspace…" />;
  if (user && settingPassword)
    return <PasswordSetup onComplete={() => setSettingPassword(false)} />;
  return user ? (
    <AppShell user={user} onSignOut={signOut} initialView={initialView} />
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
      <Login onSuccess={setUser} />
    </div>
  );
}
