import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

/**
 * Public health-check endpoint — no auth required.
 * Fully self-contained: no shared imports, no supabase-js client.
 * Uses a direct fetch to the PostgREST API to verify DB connectivity.
 *
 * Returns:
 *   200  { status: "ok",       db: "ok",    ts: "<ISO>" }
 *   503  { status: "degraded", db: "error", ts: "<ISO>" }
 */
serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const ts = new Date().toISOString();
  let dbOk = false;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    // Direct PostgREST call — no supabase-js needed.
    // SELECT id FROM profiles LIMIT 1 via REST API.
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
    });

    if (!res.ok) throw new Error(`PostgREST returned ${res.status}`);
    dbOk = true;
  } catch (err) {
    console.error("[health] DB check failed:", err instanceof Error ? err.message : String(err));
  }

  return new Response(
    JSON.stringify({ status: dbOk ? "ok" : "degraded", db: dbOk ? "ok" : "error", ts }),
    {
      status: dbOk ? 200 : 503,
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    },
  );
});
