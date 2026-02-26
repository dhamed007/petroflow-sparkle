import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { getCorsHeaders } from "../_shared/erp-auth.ts";

const VerifyPaymentSchema = z.object({
  reference: z.string().min(1).max(200),
  gateway_type: z.enum(["paystack", "flutterwave", "interswitch"]),
});

interface GatewayCredentials {
  gateway_type: string;
  secret_key: string;
  is_sandbox: boolean;
}

interface DecryptedGateway {
  id: string;
  tenant_id: string;
  gateway_type: string;
  public_key: string | null;
  secret_key: string | null;
  client_id: string | null;
  client_secret: string | null;
  webhook_url: string | null;
  is_active: boolean;
  is_sandbox: boolean;
}

function jsonError(corsHeaders: Record<string, string>, message: string, status: number, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ success: false, error: message, ...extra }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status },
  );
}

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(cors, "No authorization header", 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) {
      return jsonError(cors, "Unauthorized", 401);
    }

    // ── Input validation (Zod) ─────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(cors, "Invalid JSON body", 400);
    }

    const parsed = VerifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(cors, "Validation failed", 400, {
        details: parsed.error.issues.map((i) => i.message),
      });
    }
    const { reference, gateway_type } = parsed.data;

    // ── Fetch transaction ──────────────────────────────────────────────────
    const { data: transaction, error: txError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("transaction_reference", reference)
      .single();

    if (txError || !transaction) {
      return jsonError(cors, "Transaction not found", 404);
    }

    // ── Idempotency guard — already processed ─────────────────────────────
    // The unique constraint on transaction_reference prevents duplicate rows.
    // This guard prevents re-running downstream side-effects (subscription
    // updates, invoice marking) when a payment gateway retries the webhook.
    if (transaction.status === "success") {
      console.log("Payment already processed for reference:", reference);
      return new Response(
        JSON.stringify({
          success: true,
          status: "success",
          message: "Already processed",
          data: transaction.gateway_response,
        }),
        { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // ── Rate limit: max 10 verification attempts per tenant per 60 seconds ─
    const { count: recentCount, error: rateError } = await supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", transaction.tenant_id)
      .gte("updated_at", new Date(Date.now() - 60_000).toISOString());

    if (!rateError && (recentCount ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded. Try again in 60 seconds." }),
        {
          headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
          status: 429,
        },
      );
    }

    // ── Resolve gateway credentials ────────────────────────────────────────
    let gateway: GatewayCredentials;

    if (transaction.gateway_response?.subscription_metadata?.payment_level === "app") {
      const secretKey = Deno.env.get("VISIONSEDGE_PAYSTACK_SECRET_KEY");
      if (!secretKey) throw new Error("Payment configuration not found");
      gateway = { gateway_type: "paystack", secret_key: secretKey, is_sandbox: false };
    } else {
      const { data: rpcResult, error: gatewayError } = await supabase
        .rpc("get_decrypted_payment_gateway", {
          p_tenant_id: transaction.tenant_id,
          p_gateway_type: gateway_type,
        })
        .single();

      const tenantGateway = rpcResult as DecryptedGateway | null;
      if (gatewayError || !tenantGateway?.secret_key) {
        throw new Error("Payment gateway not configured");
      }
      gateway = {
        gateway_type: tenantGateway.gateway_type,
        secret_key: tenantGateway.secret_key,
        is_sandbox: tenantGateway.is_sandbox,
      };
    }

    // ── Verify with gateway ────────────────────────────────────────────────
    let verificationResponse;
    switch (gateway_type) {
      case "paystack":
        verificationResponse = await verifyPaystack(gateway, reference);
        break;
      case "flutterwave":
        verificationResponse = await verifyFlutterwave(gateway, reference);
        break;
      case "interswitch":
        verificationResponse = await verifyInterswitch(gateway, reference);
        break;
    }

    const status = verificationResponse.data?.status === "success" ? "success" : "failed";

    // ── Update transaction status ──────────────────────────────────────────
    await supabase
      .from("payment_transactions")
      .update({
        status,
        paid_at: status === "success" ? new Date().toISOString() : null,
        gateway_response: verificationResponse,
      })
      .eq("transaction_reference", reference);

    // ── Mark invoice paid ──────────────────────────────────────────────────
    if (transaction.invoice_id && status === "success") {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", transaction.invoice_id);
    }

    // ── Upsert subscription (idempotent — checks for existing record) ──────
    if (status === "success" && transaction.gateway_response?.subscription_metadata) {
      const metadata = transaction.gateway_response.subscription_metadata;
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      if (metadata.billing_cycle === "monthly") {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      } else {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      }

      const { data: existingSub } = await supabase
        .from("tenant_subscriptions")
        .select("id")
        .eq("tenant_id", metadata.tenant_id)
        .maybeSingle();

      if (existingSub) {
        await supabase
          .from("tenant_subscriptions")
          .update({
            plan_id: metadata.plan_id,
            status: "active",
            billing_cycle: metadata.billing_cycle,
            current_period_start: currentPeriodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSub.id);
      } else {
        await supabase.from("tenant_subscriptions").insert({
          tenant_id: metadata.tenant_id,
          plan_id: metadata.plan_id,
          status: "active",
          billing_cycle: metadata.billing_cycle,
          current_period_start: currentPeriodStart.toISOString(),
          current_period_end: currentPeriodEnd.toISOString(),
        });
      }

      await supabase
        .from("payment_transactions")
        .update({ subscription_id: existingSub?.id || null })
        .eq("transaction_reference", reference);
    }

    console.log("Payment verified:", reference, "→", status);

    return new Response(
      JSON.stringify({ success: true, status, data: verificationResponse }),
      { headers: { ...cors, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("Payment verification error:", error.message);
    return jsonError(cors, "Payment verification failed", 400);
  }
});

async function verifyPaystack(gateway: GatewayCredentials, reference: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    { headers: { Authorization: `Bearer ${gateway.secret_key}` } },
  );
  return await response.json();
}

async function verifyFlutterwave(gateway: GatewayCredentials, reference: string) {
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`,
    { headers: { Authorization: `Bearer ${gateway.secret_key}` } },
  );
  return await response.json();
}

async function verifyInterswitch(_gateway: GatewayCredentials, _reference: string) {
  return { status: "pending", message: "Interswitch verification in progress" };
}
