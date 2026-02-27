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

    // ── Atomically update transaction + activate subscription (or record failure) ──
    //
    // complete_payment_and_activate_subscription() wraps all DB mutations in a
    // single PL/pgSQL transaction with SELECT FOR UPDATE locking.  This prevents
    // the split-brain state where payment_transactions.status = 'success' but
    // tenant_subscriptions was never updated (or vice-versa).
    //
    // For failed payments we only need a simple status update — no subscription
    // action, no invoice marking, no locking needed.
    if (status === "success") {
      const subMeta = transaction.gateway_response?.subscription_metadata;
      const isSubscription =
        subMeta?.subscription_type === "petroflow_saas" && subMeta?.plan_id;

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "complete_payment_and_activate_subscription",
        {
          p_transaction_reference: reference,
          p_gateway_response:      verificationResponse,
          p_invoice_id:            transaction.invoice_id ?? null,
          p_plan_id:               isSubscription ? subMeta.plan_id      : null,
          p_tenant_id:             isSubscription ? subMeta.tenant_id    : null,
          p_billing_cycle:         isSubscription ? subMeta.billing_cycle : null,
        },
      );

      if (rpcError) {
        console.error("[verify-payment] Atomic activation RPC failed:", rpcError.message);
        throw rpcError;
      }

      const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!result?.success) {
        throw new Error(result?.error ?? "complete_payment_and_activate_subscription returned false");
      }

      if (result.idempotent) {
        console.log("[verify-payment] Already processed (detected under lock):", reference);
      }
    } else {
      // Payment failed — record the failure, no subscription action needed
      await supabase
        .from("payment_transactions")
        .update({ status, gateway_response: verificationResponse })
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
