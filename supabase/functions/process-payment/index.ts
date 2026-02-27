// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/erp-auth.ts";

interface PaymentRequest {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  gateway_type: "paystack" | "flutterwave" | "interswitch";
  metadata?: any;
}

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

// ── IP helpers ─────────────────────────────────────────────────────────────────

/** Returns the most-specific IP from standard forwarding headers. */
function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

/**
 * SHA-256 hash of the raw IP so we never store PII.
 * The hash is used only for rate-limit bucketing.
 */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Main handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── 1. IP-based rate limit (runs BEFORE auth, catches bot floods) ──────────
  // 20 requests per IP per 5 minutes. Fails-open on DB errors.
  const clientIp = getClientIp(req);
  const ipHash = await hashIp(clientIp);

  const { data: ipRlData, error: ipRlError } = await supabase.rpc(
    "rpc_check_payment_ip_rate_limit",
    { p_ip_hash: ipHash },
  );

  if (!ipRlError) {
    const ipRlRow = Array.isArray(ipRlData) ? ipRlData[0] : ipRlData;
    if (ipRlRow && !ipRlRow.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests from this IP. Please slow down." }),
        {
          status: 429,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Retry-After": String(ipRlRow.retry_after_secs ?? 300),
          },
        },
      );
    }
  }
  // If ipRlError (e.g. migration not yet applied) → fail-open, continue

  try {
    // ── 2. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw Object.assign(new Error("No authorization header"), { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }

    // ── 3. Tenant lookup ─────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, email")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      throw Object.assign(new Error("No tenant found"), { status: 403 });
    }

    // ── 4. Per-tenant rate limit (5 initiations / 60 s) ──────────────────────
    const { count: recentCount, error: rateError } = await supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());

    if (!rateError && (recentCount ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again in 60 seconds." }),
        {
          status: 429,
          headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
        },
      );
    }

    // ── 5. Parse body ─────────────────────────────────────────────────────────
    let paymentRequest: PaymentRequest;
    try {
      paymentRequest = await req.json();
    } catch {
      throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
    }

    if (!paymentRequest.reference || typeof paymentRequest.reference !== "string") {
      throw Object.assign(new Error("Missing or invalid reference"), { status: 400 });
    }

    // ── 6. Idempotency: deduplicate on transaction_reference ──────────────────
    //
    // The payment_transactions table has a UNIQUE constraint on
    // transaction_reference (migration 20260225_hardening_indexes.sql).
    // Before calling the gateway, we check if this reference was already
    // initialized. If it was (status=pending), we return the cached
    // gateway_response (authorization_url still valid for 30 min in Paystack).
    // If it was already paid (status=success), we return 200 immediately.
    //
    // This makes POST /process-payment safe to retry on network errors — the
    // client always gets back the same authorization_url for the same reference.
    const { data: existingTx } = await supabase
      .from("payment_transactions")
      .select("status, gateway_response")
      .eq("transaction_reference", paymentRequest.reference)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();

    if (existingTx) {
      if (existingTx.status === "success") {
        return new Response(
          JSON.stringify({ idempotent: true, status: "success", message: "Payment already completed" }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      if (existingTx.status === "pending") {
        console.log("Idempotent replay for reference:", paymentRequest.reference);
        return new Response(
          JSON.stringify({ idempotent: true, ...existingTx.gateway_response }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
    }

    // ── 7. Resolve gateway credentials ────────────────────────────────────────
    let gateway: GatewayCredentials;

    if (paymentRequest.metadata?.payment_level === "app") {
      const secretKey = Deno.env.get("VISIONSEDGE_PAYSTACK_SECRET_KEY");
      if (!secretKey) throw new Error("Payment configuration not found");
      gateway = { gateway_type: "paystack", secret_key: secretKey, is_sandbox: false };
    } else {
      const { data: rpcResult, error: gatewayError } = await supabase
        .rpc("get_decrypted_payment_gateway", {
          p_tenant_id: profile.tenant_id,
          p_gateway_type: paymentRequest.gateway_type,
        })
        .single();

      const tenantGateway = rpcResult as DecryptedGateway | null;
      if (gatewayError || !tenantGateway?.secret_key) {
        throw new Error("Payment gateway not configured or inactive");
      }
      gateway = {
        gateway_type: tenantGateway.gateway_type,
        secret_key: tenantGateway.secret_key,
        is_sandbox: tenantGateway.is_sandbox,
      };
    }

    // ── 8. Call gateway ───────────────────────────────────────────────────────
    let paymentResponse: any;
    switch (paymentRequest.gateway_type) {
      case "paystack":
        paymentResponse = await processPaystack(gateway, paymentRequest);
        break;
      case "flutterwave":
        paymentResponse = await processFlutterwave(gateway, paymentRequest);
        break;
      case "interswitch":
        paymentResponse = await processInterswitch(gateway, paymentRequest);
        break;
      default:
        throw new Error("Invalid gateway type");
    }

    // ── 9. Persist transaction ────────────────────────────────────────────────
    const transactionData: any = {
      tenant_id: profile.tenant_id,
      gateway_type: paymentRequest.gateway_type,
      transaction_reference: paymentRequest.reference,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: "pending",
      gateway_response: paymentResponse,
    };

    if (paymentRequest.metadata?.subscription_type === "petroflow_saas") {
      transactionData.gateway_response = {
        ...paymentResponse,
        subscription_metadata: paymentRequest.metadata,
      };
    }

    if (paymentRequest.metadata?.invoice_id) {
      transactionData.invoice_id = paymentRequest.metadata.invoice_id;
    }

    await supabase.from("payment_transactions").insert(transactionData);

    console.log("Payment initialized for reference:", paymentRequest.reference);

    return new Response(JSON.stringify(paymentResponse), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const status = error.status ?? 400;
    console.error("Payment processing error:", error.message);
    return new Response(
      JSON.stringify({ error: "Payment processing failed" }),
      { status, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

// ── Gateway helpers ────────────────────────────────────────────────────────────

async function processPaystack(gateway: GatewayCredentials, request: PaymentRequest) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gateway.secret_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: request.email,
      amount: request.amount * 100, // kobo
      reference: request.reference,
      currency: request.currency,
      metadata: request.metadata,
    }),
  });
  return await response.json();
}

async function processFlutterwave(gateway: GatewayCredentials, request: PaymentRequest) {
  const response = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gateway.secret_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: request.reference,
      amount: request.amount,
      currency: request.currency,
      redirect_url: request.metadata?.redirect_url,
      customer: { email: request.email },
      customizations: { title: "PetroFlow Payment" },
    }),
  });
  return await response.json();
}

function processInterswitch(_gateway: GatewayCredentials, request: PaymentRequest) {
  return Promise.resolve({
    status: "pending",
    message: "Interswitch integration in progress",
    reference: request.reference,
  });
}
