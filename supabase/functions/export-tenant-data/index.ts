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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Get tenant and verify role is tenant_admin or super_admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", profile.tenant_id)
      .in("role", ["tenant_admin", "super_admin"])
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: tenant_admin role required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const tenantId = profile.tenant_id;

    // Fetch all tenant-scoped tables in parallel
    const [
      orders,
      customers,
      deliveries,
      invoices,
      trucks,
      inventory,
      profiles,
      paymentTransactions,
      erpIntegrations,
      erpSyncLogs,
      auditLogs,
    ] = await Promise.all([
      supabase.from("orders").select("*").eq("tenant_id", tenantId),
      supabase.from("customers").select("*").eq("tenant_id", tenantId),
      supabase.from("deliveries").select("*").eq("tenant_id", tenantId),
      supabase.from("invoices").select("*").eq("tenant_id", tenantId),
      supabase.from("trucks").select("*").eq("tenant_id", tenantId),
      supabase.from("inventory").select("*").eq("tenant_id", tenantId),
      supabase.from("profiles").select("id, full_name, email, phone, avatar_url, created_at").eq("tenant_id", tenantId),
      supabase.from("payment_transactions").select("*").eq("tenant_id", tenantId),
      supabase.from("erp_integrations").select("id, erp_system, connection_status, last_sync_at, created_at").eq("tenant_id", tenantId),
      supabase.from("erp_sync_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000),
      supabase.from("audit_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000),
    ]);

    // Log the export action
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      user_id: user.id,
      action: "data_export",
      entity_type: "tenant",
      entity_id: tenantId,
      new_values: { exported_at: new Date().toISOString(), exported_by: user.id },
    });

    const exportPayload = {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      tables: {
        orders: orders.data ?? [],
        customers: customers.data ?? [],
        deliveries: deliveries.data ?? [],
        invoices: invoices.data ?? [],
        trucks: trucks.data ?? [],
        inventory: inventory.data ?? [],
        profiles: profiles.data ?? [],
        payment_transactions: paymentTransactions.data ?? [],
        erp_integrations: erpIntegrations.data ?? [],
        erp_sync_logs: erpSyncLogs.data ?? [],
        audit_logs: auditLogs.data ?? [],
      },
    };

    return new Response(JSON.stringify(exportPayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Export error:", error.message);
    return new Response(JSON.stringify({ error: "Export failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
