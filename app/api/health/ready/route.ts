import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";
export const dynamic = "force-dynamic";
export async function GET() {
  const started = Date.now(), url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ status: "not_ready", checks: { database: "not_configured" }, timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!response.ok) throw new Error(`Dependency returned ${response.status}`);
    return NextResponse.json({ status: "ready", checks: { supabase: "ok" }, latencyMs: Date.now()-started, timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("Readiness dependency failed",error,{latencyMs:Date.now()-started});
    return NextResponse.json({ status: "not_ready", checks: { supabase: "unavailable" }, timestamp: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
