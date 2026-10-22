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
    // Capture the email link's intent before Supabase consumes its fragment.
    const emailLinkParams = new URLSearchParams(window.location.hash.slice(1));
    const emailLinkType = emailLinkParams.get("type");
    const emailAccessToken = emailLinkParams.get("access_token");
    const emailRefreshToken = emailLinkParams.get("refresh_token");
    setSettingPassword(
      new URLSearchParams(window.location.search).get("setup") === "password" ||
        emailLinkType === "invite" ||
        emailLinkType === "recovery",
    );
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }
    if (emailLinkParams.has("error") || emailLinkParams.has("error_code")) {
      setAuthError(
        "This password link is invalid or has expired. Ask your administrator to send a new password reset email.",
      );
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
        .select("full_name,role,current_organization_id")
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

      let effectiveRole = profile.role;
      let membershipQuery = supabase
        .from("organization_memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("status", "ACTIVE");
      if (profile.current_organization_id) {
        membershipQuery = membershipQuery.eq(
          "organization_id",
          profile.current_organization_id,
        );
      } else {
        membershipQuery = membershipQuery
          .order("joined_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(1);
      }
      const { data: membership, error: membershipError } =
        await membershipQuery.maybeSingle();

      if (!active || revision !== authRevision.current) return;
      if (membershipError) {
        if (currentUser.current?.id === userId) return;
        currentUser.current = null;
        setUser(null);
        setAuthError(
          "Your account is signed in, but its organization role could not be verified. Ask an administrator to check your organization membership.",
        );
        setLoading(false);
        return;
      }
      if (membership) effectiveRole = membership.role;

      if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
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
        role: effectiveRole,
      };
      currentUser.current = nextUser;
      setUser(nextUser);
      setLoading(false);
    };

    const restore = async () => {
      const revision = ++authRevision.current;
      // Admin-generated invitation/recovery links use token fragments, while
      // the SSR browser client defaults to PKCE. Validate and import the email
      // session explicitly; the recipient has no initiating browser verifier.
      if (
        (emailLinkType === "invite" || emailLinkType === "recovery") &&
        emailAccessToken &&
        emailRefreshToken
      ) {
        const { error } = await supabase.auth.setSession({
          access_token: emailAccessToken,
          refresh_token: emailRefreshToken,
        });
        if (!active) return;
        const cleanUrl = new URL(window.location.href);
        cleanUrl.hash = "";
        window.history.replaceState(window.history.state, "", cleanUrl);
        if (error) {
          if (revision !== authRevision.current) return;
          currentUser.current = null;
          setUser(null);
          setAuthError(
            "This password link is invalid or has expired. Ask your administrator to send a new password reset email.",
          );
          setLoading(false);
          return;
        }
      }
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
