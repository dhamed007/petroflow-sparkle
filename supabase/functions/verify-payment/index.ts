import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { reference, gateway_type } = await req.json();

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("transaction_reference", reference)
      .single();

    if (txError || !transaction) {
      console.error("Transaction lookup error:", txError);
      throw new Error("Transaction not found");
    }

    // Server-side rate limit: max 10 verification attempts per tenant per 60 seconds
    const { count: recentCount, error: rateError } = await supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", transaction.tenant_id)
      .gte("updated_at", new Date(Date.now() - 60_000).toISOString());

    if (!rateError && (recentCount ?? 0) >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in 60 seconds." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        status: 429,
      });
    }

    let gateway: GatewayCredentials;

    // Check if this is app-level payment (subscription)
    if (transaction.gateway_response?.subscription_metadata?.payment_level === 'app') {
      // Use VisionsEdge's Paystack configuration
      const secretKey = Deno.env.get("VISIONSEDGE_PAYSTACK_SECRET_KEY");
      
      if (!secretKey) {
        console.error("VisionsEdge Paystack configuration not found");
        throw new Error("Payment configuration not found");
      }
      
      gateway = {
        gateway_type: 'paystack',
        secret_key: secretKey,
        is_sandbox: false,
      };
    } else {
      // Get tenant's payment gateway using secure RPC function
      // This uses server-side decryption of credentials
      const { data: rpcResult, error: gatewayError } = await supabase
        .rpc('get_decrypted_payment_gateway', {
          p_tenant_id: transaction.tenant_id,
          p_gateway_type: gateway_type
        })
        .single();

      const tenantGateway = rpcResult as DecryptedGateway | null;

      if (gatewayError || !tenantGateway) {
        console.error("Payment gateway lookup error:", gatewayError);
        throw new Error("Payment gateway not found");
      }

      if (!tenantGateway.secret_key) {
        console.error("Payment gateway credentials not properly configured");
        throw new Error("Payment gateway credentials not configured");
      }
      
      gateway = {
        gateway_type: tenantGateway.gateway_type,
        secret_key: tenantGateway.secret_key,
        is_sandbox: tenantGateway.is_sandbox,
      };
    }

    let verificationResponse;

    // Verify payment based on gateway type
    switch (gateway_type) {
      case 'paystack':
        verificationResponse = await verifyPaystack(gateway, reference);
        break;
      case 'flutterwave':
        verificationResponse = await verifyFlutterwave(gateway, reference);
        break;
      case 'interswitch':
        verificationResponse = await verifyInterswitch(gateway, reference);
        break;
      default:
        throw new Error("Invalid gateway type");
    }

    // Update transaction status
    const status = verificationResponse.data?.status === "success" ? "success" : "failed";
    await supabase
      .from("payment_transactions")
      .update({
        status,
        paid_at: status === "success" ? new Date().toISOString() : null,
        gateway_response: verificationResponse,
      })
      .eq("transaction_reference", reference);

    // If payment is for invoice, update invoice status
    if (transaction.invoice_id && status === "success") {
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_date: new Date().toISOString() })
        .eq("id", transaction.invoice_id);
    }

    // If payment is for subscription, create or update subscription
    if (status === "success" && transaction.gateway_response?.subscription_metadata) {
      const metadata = transaction.gateway_response.subscription_metadata;
      
      // Calculate subscription period
      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      if (metadata.billing_cycle === 'monthly') {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      } else {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      }

      // Check if subscription exists
      const { data: existingSub } = await supabase
        .from("tenant_subscriptions")
        .select("id")
        .eq("tenant_id", metadata.tenant_id)
        .maybeSingle();

      if (existingSub) {
        // Update existing subscription
        await supabase
          .from("tenant_subscriptions")
          .update({
            plan_id: metadata.plan_id,
            status: "active",
            billing_cycle: metadata.billing_cycle,
            current_period_start: currentPeriodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", existingSub.id);
      } else {
        // Create new subscription
        await supabase
          .from("tenant_subscriptions")
          .insert({
            tenant_id: metadata.tenant_id,
            plan_id: metadata.plan_id,
            status: "active",
            billing_cycle: metadata.billing_cycle,
            current_period_start: currentPeriodStart.toISOString(),
            current_period_end: currentPeriodEnd.toISOString()
          });
      }

      // Link transaction to subscription
      await supabase
        .from("payment_transactions")
        .update({
          subscription_id: existingSub?.id || null
        })
        .eq("transaction_reference", reference);
    }

    console.log("Payment verified successfully for reference:", reference, "status:", status);

    return new Response(JSON.stringify({ status, data: verificationResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Payment verification error:", error.message);
    return new Response(JSON.stringify({ error: "Payment verification failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function verifyPaystack(gateway: GatewayCredentials, reference: string) {
  const url = `https://api.paystack.co/transaction/verify/${reference}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gateway.secret_key}`,
    },
  });

  return await response.json();
}

async function verifyFlutterwave(gateway: GatewayCredentials, reference: string) {
  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gateway.secret_key}`,
    },
  });

  return await response.json();
}

async function verifyInterswitch(gateway: GatewayCredentials, reference: string) {
  // Interswitch verification would go here
  return {
    status: "pending",
    message: "Interswitch verification in progress",
  };
}
