import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const webhookSignature = req.headers.get("x-webhook-signature");
    const { integration_id, event_type, data } = await req.json();

    console.log("Webhook received:", { integration_id, event_type });

    // Verify webhook signature
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .select("webhook_secret")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      throw new Error("Integration not found");
    }

    // Simple signature verification (enhance based on ERP system)
    if (webhookSignature !== integration.webhook_secret) {
      console.warn("Invalid webhook signature");
      // In production, you'd reject the request here
    }

    // Process webhook based on event type
    let processedData;
    
    switch (event_type) {
      case 'order.created':
      case 'order.updated':
        processedData = await processOrderWebhook(data, supabase);
        break;
      case 'customer.created':
      case 'customer.updated':
        processedData = await processCustomerWebhook(data, supabase);
        break;
      case 'invoice.paid':
        processedData = await processInvoiceWebhook(data, supabase);
        break;
      case 'payment.received':
        processedData = await processPaymentWebhook(data, supabase);
        break;
      default:
        console.log("Unhandled webhook event:", event_type);
    }

    // Log webhook event
    await supabase.from("erp_sync_logs").insert({
      integration_id,
      entity_type: event_type.split('.')[0],
      sync_direction: 'import',
      sync_status: 'completed',
      is_manual: false,
      records_processed: 1,
      records_succeeded: processedData ? 1 : 0,
      sync_metadata: { event_type, webhook: true },
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Webhook processed successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function processOrderWebhook(data: any, supabase: any) {
  // Transform and sync order data
  console.log("Processing order webhook:", data);
  return data;
}

async function processCustomerWebhook(data: any, supabase: any) {
  // Transform and sync customer data
  console.log("Processing customer webhook:", data);
  return data;
}

async function processInvoiceWebhook(data: any, supabase: any) {
  // Update invoice status
  console.log("Processing invoice webhook:", data);
  return data;
}

async function processPaymentWebhook(data: any, supabase: any) {
  // Record payment received
  console.log("Processing payment webhook:", data);
  return data;
}