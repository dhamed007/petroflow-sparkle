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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Allow internal calls from erp-sync-retry cron (service role key as bearer)
    let userId: string;
    if (token === serviceRoleKey) {
      userId = "system";
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) throw new Error("Unauthorized");
      userId = user.id;
    }

    const { integration_id, entity_type, direction } = await req.json();

    console.log("Starting sync:", { integration_id, entity_type, direction });

    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      throw new Error("Integration not found");
    }

    // Check if token needs refresh
    const tokenStatus = await checkAndRefreshToken(supabase, integration, authHeader);
    if (!tokenStatus.valid) {
      throw new Error(`Token validation failed: ${tokenStatus.error}`);
    }

    // Use refreshed integration data if token was refreshed
    const activeIntegration = tokenStatus.refreshed_integration || integration;

    // Get entity configuration
    const { data: entity, error: entityError } = await supabase
      .from("erp_entities")
      .select("*")
      .eq("integration_id", integration_id)
      .eq("entity_type", entity_type)
      .single();

    if (entityError || !entity) {
      throw new Error("Entity not found");
    }

    // Get field mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from("erp_field_mappings")
      .select("*")
      .eq("entity_id", entity.id);

    if (mappingsError) {
      throw new Error("Failed to fetch field mappings");
    }

    // Create sync log with retry tracking
    const { data: syncLog, error: logError } = await supabase
      .from("erp_sync_logs")
      .insert({
        integration_id,
        entity_type,
        sync_direction: direction,
        sync_status: 'in_progress',
        triggered_by: userId === "system" ? null : userId,
        is_manual: userId !== "system",
        retry_count: 0,
      })
      .select()
      .single();

    if (logError) {
      throw new Error("Failed to create sync log");
    }

    let syncResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      message: ""
    };
    
    try {
      // Perform sync based on direction
      if (direction === 'import' || direction === 'bidirectional') {
        syncResult = await importFromERP(integration, entity, mappings, supabase);
      }
      
      if (direction === 'export' || direction === 'bidirectional') {
        const exportResult = await exportToERP(integration, entity, mappings, supabase);
        syncResult = { 
          processed: syncResult.processed + exportResult.processed,
          succeeded: syncResult.succeeded + exportResult.succeeded,
          failed: syncResult.failed + exportResult.failed,
          message: `${syncResult.message} ${exportResult.message}`.trim()
        };
      }

      // Update sync log with success
      await supabase
        .from("erp_sync_logs")
        .update({
          sync_status: 'completed',
          completed_at: new Date().toISOString(),
          records_processed: syncResult.processed,
          records_succeeded: syncResult.succeeded,
          records_failed: syncResult.failed,
        })
        .eq("id", syncLog.id);

      // Update integration last sync time
      await supabase
        .from("erp_integrations")
        .update({
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", integration_id);

      return new Response(JSON.stringify({
        success: true,
        sync_log_id: syncLog.id,
        result: syncResult,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (syncError: any) {
      const currentRetryCount = syncLog.retry_count || 0;
      const maxRetries = 3;

      if (currentRetryCount < maxRetries) {
        // Mark as retrying — client can pick up and retry
        await supabase
          .from("erp_sync_logs")
          .update({
            sync_status: 'retrying',
            completed_at: new Date().toISOString(),
            error_message: syncError.message,
            retry_count: currentRetryCount + 1,
          })
          .eq("id", syncLog.id);
      } else {
        // Max retries exceeded — mark as dead_letter
        await supabase
          .from("erp_sync_logs")
          .update({
            sync_status: 'dead_letter',
            completed_at: new Date().toISOString(),
            error_message: `Max retries (${maxRetries}) exceeded. Last error: ${syncError.message}`,
            retry_count: currentRetryCount,
          })
          .eq("id", syncLog.id);
      }

      throw syncError;
    }
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function importFromERP(integration: any, entity: any, mappings: any[], supabase: any) {
  console.log("Importing from ERP:", entity.entity_type);
  
  // This is a placeholder - actual implementation would call the ERP API
  // and transform data based on mappings
  
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    message: "Import functionality ready - configure field mappings first"
  };
}

async function exportToERP(integration: any, entity: any, mappings: any[], supabase: any) {
  console.log("Exporting to ERP:", entity.entity_type);
  
  // This is a placeholder - actual implementation would fetch data from PetroFlow
  // and push to ERP based on mappings
  
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    message: "Export functionality ready - configure field mappings first"
  };
}

async function checkAndRefreshToken(supabase: any, integration: any, authHeader: string) {
  // If no token expiry is set, assume it's valid (e.g., basic auth, API keys)
  if (!integration.token_expires_at) {
    return { valid: true };
  }

  const now = new Date();
  const expiresAt = new Date(integration.token_expires_at);
  
  // If token expires in less than 5 minutes, refresh it proactively
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  if (now.getTime() + bufferTime >= expiresAt.getTime()) {
    console.log(`Token expiring soon for integration ${integration.id}, refreshing...`);
    
    try {
      // Call the refresh token function
      const refreshResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/erp-refresh-token`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integration_id: integration.id,
        }),
      });

      const refreshData = await refreshResponse.json();
      
      if (!refreshData.success) {
        return { 
          valid: false, 
          error: `Token refresh failed: ${refreshData.error}` 
        };
      }

      // Fetch updated integration with new token
      const { data: updatedIntegration } = await supabase
        .from("erp_integrations")
        .select("*")
        .eq("id", integration.id)
        .single();

      console.log(`Token refreshed successfully for integration ${integration.id}`);

      return { 
        valid: true, 
        refreshed: true,
        refreshed_integration: updatedIntegration 
      };
    } catch (error: any) {
      console.error("Token refresh error:", error);
      return { 
        valid: false, 
        error: `Token refresh exception: ${error.message}` 
      };
    }
  }

  return { valid: true };
}