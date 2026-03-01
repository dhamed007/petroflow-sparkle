import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/erp-auth.ts";

/**
 * Public health-check endpoint — no auth required.
 * Used by UptimeRobot and other external monitors.
 *
 * Returns:
 *   200  { status: "ok",       db: "ok",    ts: "<ISO>" }
 *   503  { status: "degraded", db: "error", ts: "<ISO>" }
 */
serve(async (req) => {
  // Allow CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const ts = new Date().toISOString();
  let dbStatus = "ok";
  let httpStatus = 200;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lightweight connectivity check — reads at most 1 row from profiles.
    // Service role bypasses RLS so this always works regardless of data.
    const { error } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) throw new Error(error.message);
  } catch (err) {
    dbStatus = "error";
    httpStatus = 503;
    console.error("[health] DB check failed:", err instanceof Error ? err.message : err);
  }

  const body = JSON.stringify({
    status: httpStatus === 200 ? "ok" : "degraded",
    db: dbStatus,
    ts,
  });

  return new Response(body, {
    status: httpStatus,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-cache" },
  });
});
