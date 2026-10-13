import { createClient } from "@supabase/supabase-js";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const workerId = Deno.env.get("DENO_DEPLOYMENT_ID") ?? crypto.randomUUID();
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

type Job = { id: string; job_type: string; payload: Record<string, unknown>; organization_id: string };

async function sendInvitation(job: Job) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const email = String(job.payload.email ?? "");
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("INVITATION_FROM_EMAIL") ?? "PeopleFlow <noreply@example.com>", to: [email], subject: "You have been invited to PeopleFlow", html: `<p>You have been invited to your organization workspace.</p><p><a href="${appUrl}">Open PeopleFlow</a></p>` }) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${await response.text()}`);
  return { provider: "resend", email };
}

async function completeExport(job: Job) {
  const exportId = String(job.payload.export_id);
  const table = job.job_type === "COMPLIANCE_EXPORT" ? "compliance_exports" : "report_exports";
  const { error } = await supabase.from(table).update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", exportId).eq("organization_id", job.organization_id);
  if (error) throw error;
  return { exportId, table };
}

async function generateScheduledReport(job: Job) {
  const { data, error } = await supabase.from("report_exports").insert({ organization_id: job.organization_id, name: String(job.payload.name ?? "Scheduled report"), report_type: String(job.payload.report_type ?? "WORKFORCE"), format: String(job.payload.format ?? "CSV"), delivery: "EMAIL", status: "QUEUED", created_by: String(job.payload.created_by) }).select("id").single();
  if (error) throw error;
  return { reportExportId: data.id, recipients: job.payload.recipients ?? [] };
}

async function deliverWebhook(job: Job) {
  const endpointId = String(job.payload.endpoint_id), eventType = String(job.payload.event_type), eventId = String(job.payload.event_id);
  const { data: endpoint, error } = await supabase.from("webhook_endpoints").select("url,signing_secret_ref").eq("id", endpointId).eq("active", true).single();
  if (error) throw error;
  const body = JSON.stringify(job.payload.body ?? {}), secret = Deno.env.get(endpoint.signing_secret_ref);
  if (!secret) throw new Error(`Webhook secret ${endpoint.signing_secret_ref} is not configured`);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const started = Date.now();
  const response = await fetch(endpoint.url, { method: "POST", headers: { "Content-Type": "application/json", "X-PeopleFlow-Event": eventType, "X-PeopleFlow-Signature": `sha256=${signature}` }, body });
  const responseBody = (await response.text()).slice(0, 4000);
  await supabase.from("webhook_deliveries").insert({ organization_id: job.organization_id, endpoint_id: endpointId, event_type: eventType, event_id: eventId, request_body: job.payload.body ?? {}, response_status: response.status, response_body: responseBody, duration_ms: Date.now() - started, job_id: job.id, delivered_at: response.ok ? new Date().toISOString() : null });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  return { status: response.status };
}

async function processJob(job: Job) {
  if (job.job_type === "INVITATION_EMAIL") return sendInvitation(job);
  if (["COMPLIANCE_EXPORT", "REPORT_EXPORT"].includes(job.job_type)) return completeExport(job);
  if (job.job_type === "SCHEDULED_REPORT") return generateScheduledReport(job);
  if (job.job_type === "WEBHOOK_DELIVERY") return deliverWebhook(job);
  throw new Error(`Unsupported job type: ${job.job_type}`);
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("WORKER_SECRET");
  if (!expected || request.headers.get("Authorization") !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });
  await supabase.rpc("enqueue_due_report_schedules");
  const { data: jobs, error } = await supabase.rpc("claim_background_jobs", { p_worker: workerId, p_limit: 10 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const job of (jobs ?? []) as Job[]) {
    try { const result = await processJob(job); await supabase.rpc("finish_background_job", { p_job_id: job.id, p_result: result }); results.push({ id: job.id, status: "COMPLETED" }); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); await supabase.rpc("fail_background_job", { p_job_id: job.id, p_error: message }); results.push({ id: job.id, status: "FAILED", error: message }); }
  }
  return Response.json({ workerId, processed: results.length, results });
});
