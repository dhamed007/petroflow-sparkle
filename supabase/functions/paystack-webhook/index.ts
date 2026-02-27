// deno-lint-ignore-file no-explicit-any
/**
 * paystack-webhook — server-to-server webhook receiver for Paystack events.
 *
 * Security controls:
 *  1. HMAC-SHA512 signature verification (x-paystack-signature header)
 *     using the VisionsEdge Paystack secret key.  Requests with missing or
 *     invalid signatures are rejected 401 before any DB work is done.
 *  2. No CORS headers — this endpoint is server-to-server only.
 *     Browser preflight requests are rejected.
 *  3. Idempotent processing — checks existing transaction status before
 *     updating, so duplicate webhook deliveries are safe.
 *  4. Immediate 200 response pattern — Paystack expects a 200 within 30 s;
 *     heavy processing is kept synchronous but lean.
 *
 * Supported events:
 *  - charge.success  → marks transaction success, activates subscription
 *  - subscription.create  → logged for audit
 *  - (all others)    → acknowledged and logged, not processed
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Timing-safe comparison of two ASCII hex strings.
 * Length-difference short-circuits are acceptable here because Paystack
 * always produces a fixed-length (128-char) SHA-512 hex digest.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies the Paystack webhook signature.
 *
 * Paystack computes: HMAC-SHA512(rawBody, secretKey)
 * and sends the hex-encoded result in the `x-paystack-signature` header.
 */
async function verifyPaystackSignature(
  rawBody: string,
  signature: string,
  secretKey: string,
): Promise<boolean> {
  if (!signature || !secretKey) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );

  const expected = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(signature.toLowerCase(), expected.toLowerCase());
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  // This is a server-to-server endpoint — no CORS, no OPTIONS handling.
  // Any OPTIONS or GET request is invalid.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Read raw body first (needed for signature verification) ────────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Failed to read body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Signature verification ─────────────────────────────────────────────────
  const signature = req.headers.get("x-paystack-signature") ?? "";
  const secretKey = Deno.env.get("VISIONSEDGE_PAYSTACK_SECRET_KEY") ?? "";

  if (!signature) {
    console.warn("[paystack-webhook] Missing x-paystack-signature header");
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isValid = await verifyPaystackSignature(rawBody, signature, secretKey);
  if (!isValid) {
    console.warn("[paystack-webhook] Invalid signature — request rejected");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse event ────────────────────────────────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { event: eventType, data } = event;
  console.log("[paystack-webhook] Received event:", eventType);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Dispatch ───────────────────────────────────────────────────────────────
  try {
    switch (eventType) {
      case "charge.success":
        await handleChargeSuccess(data, supabase);
        break;

      case "subscription.create":
        // Paystack subscription creation event — log for audit only.
        // Our subscription state is managed via charge.success.
        console.log("[paystack-webhook] subscription.create logged:", data?.plan_code);
        break;

      default:
        console.log("[paystack-webhook] Unhandled event type:", eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Always return 200 to prevent Paystack from retrying — log and investigate
    // via Sentry / Supabase edge function logs instead.
    console.error("[paystack-webhook] Processing error:", err.message, { eventType });
    return new Response(JSON.stringify({ received: true, processing_error: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ── charge.success handler ────────────────────────────────────────────────────

async function handleChargeSuccess(data: any, supabase: any): Promise<void> {
  const reference = data?.reference as string | undefined;
  if (!reference) {
    console.error("[paystack-webhook] charge.success missing reference");
    return;
  }

  // ── Idempotency: skip if already processed ────────────────────────────────
  const { data: existingTx, error: txError } = await supabase
    .from("payment_transactions")
    .select("id, status, tenant_id, gateway_response")
    .eq("transaction_reference", reference)
    .maybeSingle();

  if (txError) {
    console.error("[paystack-webhook] DB error fetching transaction:", txError.message);
    throw txError;
  }

  if (!existingTx) {
    // Paystack may send a webhook for a payment we didn't initiate (edge case).
    console.warn("[paystack-webhook] No matching transaction for reference:", reference);
    return;
  }

  if (existingTx.status === "success") {
    console.log("[paystack-webhook] Already processed — skipping:", reference);
    return;
  }

  // ── Mark transaction success ───────────────────────────────────────────────
  await supabase
    .from("payment_transactions")
    .update({
      status: "success",
      paid_at: new Date().toISOString(),
      gateway_response: data,
    })
    .eq("transaction_reference", reference);

  // ── Mark invoice paid (if linked) ─────────────────────────────────────────
  if (existingTx.gateway_response?.invoice_id) {
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_date: new Date().toISOString() })
      .eq("id", existingTx.gateway_response.invoice_id);
  }

  // ── Activate subscription (if this is a SaaS subscription payment) ─────────
  const subMeta = existingTx.gateway_response?.subscription_metadata;
  if (subMeta?.subscription_type === "petroflow_saas" && subMeta?.plan_id) {
    const now = new Date();
    const periodEnd = new Date(now);
    if (subMeta.billing_cycle === "annual") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const { data: existing } = await supabase
      .from("tenant_subscriptions")
      .select("id")
      .eq("tenant_id", subMeta.tenant_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("tenant_subscriptions")
        .update({
          plan_id: subMeta.plan_id,
          status: "active",
          billing_cycle: subMeta.billing_cycle,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("tenant_subscriptions").insert({
        tenant_id: subMeta.tenant_id,
        plan_id: subMeta.plan_id,
        status: "active",
        billing_cycle: subMeta.billing_cycle,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      });
    }
  }

  console.log("[paystack-webhook] charge.success processed:", reference);
}
