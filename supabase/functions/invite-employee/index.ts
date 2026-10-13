import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Invitation failed for an unknown reason";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Authentication required");
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await caller.auth.getUser();
    if (authError || !auth.user) throw new Error("Authentication required");
    const { data: profile } = await caller.from("users").select("role,current_organization_id").eq("id", auth.user.id).single();
    if (profile?.role !== "SUPER_ADMIN" && profile?.role !== "HR_MANAGER") throw new Error("Only HR administrators can invite employees");
    if (!profile.current_organization_id) throw new Error("Select an active organization before inviting an employee");
    const { employeeId, redirectTo } = await request.json();
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: employee, error: employeeError } = await admin.from("employees").select("id,email,first_name,last_name,user_id,organization_id").eq("id", employeeId).eq("organization_id", profile.current_organization_id).is("deleted_at", null).single();
    if (employeeError) throw employeeError;
    if (employee.user_id) throw new Error("This employee already has a login account");
    const { error: invitationError } = await caller.rpc("invite_employee_member", { p_email: employee.email });
    if (invitationError) throw invitationError;
    const destination = Deno.env.get("APP_URL") ?? String(redirectTo ?? "http://localhost:3000/?setup=password");
    const normalizedEmail = employee.email.toLowerCase();
    const { data: authUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    let authUser = authUsers.users.find((item) => item.email?.toLowerCase() === normalizedEmail) ?? null;
    const existingAuthUser = Boolean(authUser);
    if (!authUser) {
      const { data: invitedAuth, error: inviteError } = await admin.auth.admin.inviteUserByEmail(employee.email, { data: { full_name: `${employee.first_name} ${employee.last_name}`, employee_id: employee.id }, redirectTo: destination });
      if (inviteError) throw inviteError;
      authUser = invitedAuth.user;
    }
    if (!authUser) throw new Error("The login account was not created");
    const userId = authUser.id;
    const { error: profileLinkError } = await admin.from("users").update({
      role: "EMPLOYEE",
      full_name: `${employee.first_name} ${employee.last_name}`,
      email: normalizedEmail,
      current_organization_id: profile.current_organization_id,
    }).eq("id", userId);
    if (profileLinkError) throw profileLinkError;
    const { error: membershipError } = await admin.from("organization_memberships").upsert({
      organization_id: profile.current_organization_id,
      user_id: userId,
      role: "EMPLOYEE",
      status: "ACTIVE",
      joined_at: new Date().toISOString(),
    }, { onConflict: "organization_id,user_id" });
    if (membershipError) throw membershipError;
    const { error: employeeLinkError } = await admin.from("employees").update({
      user_id: userId,
      updated_at: new Date().toISOString(),
    }).eq("id", employee.id).is("user_id", null);
    if (employeeLinkError) throw employeeLinkError;
    const { error: acceptedError } = await admin.from("organization_invitations").update({
      status: "ACCEPTED",
      accepted_at: new Date().toISOString(),
    }).eq("organization_id", profile.current_organization_id).ilike("email", employee.email).eq("status", "PENDING");
    if (acceptedError) throw acceptedError;
    if (existingAuthUser) {
      const { error: recoveryError } = await admin.auth.resetPasswordForEmail(employee.email, { redirectTo: destination });
      if (recoveryError) throw recoveryError;
    }
    return Response.json({ invited: true, email: employee.email, recoveredExistingAccount: existingAuthUser }, { headers: cors });
  } catch (error) {
    console.error("invite-employee failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 400, headers: cors });
  }
});
