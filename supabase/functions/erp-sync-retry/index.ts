/**
 * erp-sync-retry
 *
 * Scheduled by pg_cron every 5 minutes. Picks up all erp_sync_logs rows
 * with sync_status = 'retrying' and retry_count < max_retries, then
 * re-invokes erp-sync for each using the service role key.
 *
 * Called with: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Only callable with the service role key (pg_cron or admin)
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.replace("Bearer ", "") !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Fetch all logs currently marked as retrying
    const { data: logs, error: logsError } = await supabase
      .from("erp_sync_logs")
      .select("id, integration_id, entity_type, sync_direction, retry_count, max_retries")
      .eq("sync_status", "retrying");

    if (logsError) throw logsError;

    // Filter client-side: only those still under their retry cap
    const eligible = (logs ?? []).filter(
      (log) => log.retry_count < (log.max_retries ?? 3)
    );

    console.log(`[erp-sync-retry] Found ${eligible.length} retryable log(s)`);

    const results = await Promise.allSettled(
      eligible.map(async (log) => {
        // Exponential backoff: 1s, 2s, 4s between attempts
        const backoffMs = Math.pow(2, log.retry_count) * 1000;
        await new Promise((r) => setTimeout(r, backoffMs));

        const response = await fetch(`${supabaseUrl}/functions/v1/erp-sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integration_id: log.integration_id,
            entity_type: log.entity_type,
            direction: log.sync_direction,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: String(response.status) }));
          const newRetryCount = log.retry_count + 1;
          const isDeadLetter = newRetryCount >= (log.max_retries ?? 3);

          await supabase
            .from("erp_sync_logs")
            .update({
              sync_status: isDeadLetter ? "dead_letter" : "retrying",
              retry_count: newRetryCount,
              error_message: `Retry ${newRetryCount} failed: ${err.error ?? response.status}`,
            })
            .eq("id", log.id);

          throw new Error(`Log ${log.id} retry failed (attempt ${newRetryCount})`);
        }

        console.log(`[erp-sync-retry] Successfully retried log ${log.id}`);
        return log.id;
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({ retried: eligible.length, succeeded, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[erp-sync-retry] Fatal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
