import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp",
};

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// HMAC-SHA256 signature verification
async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(signature.toLowerCase(), expectedSignature.toLowerCase());
}

// Validate request timestamp to prevent replay attacks
function isTimestampValid(timestamp: string | null, maxAgeMs: number = 5 * 60 * 1000): boolean {
  if (!timestamp) {
    return true; // Allow requests without timestamp for backward compatibility
  }

  const requestTime = new Date(timestamp).getTime();
  if (isNaN(requestTime)) {
    return false;
  }

  const now = Date.now();
  return Math.abs(now - requestTime) <= maxAgeMs;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read raw body before parsing for signature verification
    const rawBody = await req.text();
    const webhookSignature = req.headers.get("x-webhook-signature");
    const webhookTimestamp = req.headers.get("x-webhook-timestamp");

    // Validate timestamp to prevent replay attacks
    if (!isTimestampValid(webhookTimestamp)) {
      console.error("Webhook timestamp validation failed", {
        received_timestamp: webhookTimestamp,
        current_time: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ error: "Request expired or invalid timestamp" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the request body
    let bodyData;
    try {
      bodyData = JSON.parse(rawBody);
    } catch {
      console.error("Invalid JSON in webhook request body");
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { integration_id, event_type, data } = bodyData;

    if (!integration_id) {
      console.error("Missing integration_id in webhook request");
      return new Response(
        JSON.stringify({ error: "Missing integration_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Webhook received:", { integration_id, event_type });

    // Fetch integration to get webhook secret
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .select("webhook_secret")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      console.error("Integration not found", { integration_id, error: integrationError });
      return new Response(
        JSON.stringify({ error: "Integration not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature using HMAC-SHA256
    if (!webhookSignature) {
      console.error("Missing webhook signature", { integration_id });
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValidSignature = await verifyWebhookSignature(
      rawBody,
      webhookSignature,
      integration.webhook_secret || ""
    );

    if (!isValidSignature) {
      console.error("Invalid webhook signature", {
        integration_id,
        received_signature: webhookSignature?.substring(0, 10) + "...",
      });
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Webhook signature verified successfully", { integration_id, event_type });

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
      entity_type: event_type?.split('.')[0] || 'unknown',
      sync_direction: 'import',
      sync_status: 'completed',
      is_manual: false,
      records_processed: 1,
      records_succeeded: processedData ? 1 : 0,
      sync_metadata: { event_type, webhook: true, verified: true },
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
      status: 500,
    });
  }
});

async function processOrderWebhook(data: any, supabase: any) {
  console.log("Processing order webhook:", data);
  return data;
}

async function processCustomerWebhook(data: any, supabase: any) {
  console.log("Processing customer webhook:", data);
  return data;
}

async function processInvoiceWebhook(data: any, supabase: any) {
  console.log("Processing invoice webhook:", data);
  return data;
}

async function processPaymentWebhook(data: any, supabase: any) {
  console.log("Processing payment webhook:", data);
  return data;
}
