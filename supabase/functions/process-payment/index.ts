import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/erp-auth.ts";

interface PaymentRequest {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  gateway_type: 'paystack' | 'flutterwave' | 'interswitch';
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

serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Get user's tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      throw new Error("No tenant found");
    }

    // Server-side rate limit: max 5 payment initiations per tenant per 60 seconds
    const { count: recentCount, error: rateError } = await supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());

    if (!rateError && (recentCount ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in 60 seconds." }), {
        headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
        status: 429,
      });
    }

    const paymentRequest: PaymentRequest = await req.json();

    let gateway: GatewayCredentials;

    // Check if this is app-level payment (subscription) or tenant-level payment (customer)
    if (paymentRequest.metadata?.payment_level === 'app') {
      // Use VisionsEdge's Paystack configuration for subscriptions
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
      // Get tenant's payment gateway configuration using secure RPC function
      // This uses server-side decryption of credentials
      const { data: rpcResult, error: gatewayError } = await supabase
        .rpc('get_decrypted_payment_gateway', {
          p_tenant_id: profile.tenant_id,
          p_gateway_type: paymentRequest.gateway_type
        })
        .single();

      const tenantGateway = rpcResult as DecryptedGateway | null;

      if (gatewayError || !tenantGateway) {
        console.error("Payment gateway error:", gatewayError);
        throw new Error("Payment gateway not configured or inactive");
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

    let paymentResponse;

    // Process payment based on gateway type
    switch (paymentRequest.gateway_type) {
      case 'paystack':
        paymentResponse = await processPaystack(gateway, paymentRequest);
        break;
      case 'flutterwave':
        paymentResponse = await processFlutterwave(gateway, paymentRequest);
        break;
      case 'interswitch':
        paymentResponse = await processInterswitch(gateway, paymentRequest);
        break;
      default:
        throw new Error("Invalid gateway type");
    }

    // Record transaction
    const transactionData: any = {
      tenant_id: profile.tenant_id,
      gateway_type: paymentRequest.gateway_type,
      transaction_reference: paymentRequest.reference,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: "pending",
      gateway_response: paymentResponse,
    };

    // Add subscription_id if this is a subscription payment
    if (paymentRequest.metadata?.subscription_type === 'petroflow_saas') {
      // Store metadata for later subscription creation
      transactionData.gateway_response = {
        ...paymentResponse,
        subscription_metadata: paymentRequest.metadata
      };
    }

    // Add invoice_id if provided
    if (paymentRequest.metadata?.invoice_id) {
      transactionData.invoice_id = paymentRequest.metadata.invoice_id;
    }

    await supabase.from("payment_transactions").insert(transactionData);

    console.log("Payment processed successfully for reference:", paymentRequest.reference);

    return new Response(JSON.stringify(paymentResponse), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Payment processing error:", error.message);
    return new Response(JSON.stringify({ error: "Payment processing failed" }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function processPaystack(gateway: GatewayCredentials, request: PaymentRequest) {
  const url = "https://api.paystack.co/transaction/initialize";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gateway.secret_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: request.email,
      amount: request.amount * 100, // Paystack expects amount in kobo
      reference: request.reference,
      currency: request.currency,
      metadata: request.metadata,
    }),
  });

  const data = await response.json();
  return data;
}

async function processFlutterwave(gateway: GatewayCredentials, request: PaymentRequest) {
  const url = "https://api.flutterwave.com/v3/payments";

  const response = await fetch(url, {
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
      customer: {
        email: request.email,
      },
      customizations: {
        title: "PetroFlow Payment",
      },
    }),
  });

  const data = await response.json();
  return data;
}

async function processInterswitch(gateway: GatewayCredentials, request: PaymentRequest) {
  // Interswitch implementation would go here
  // This is a placeholder as Interswitch has a more complex integration
  return {
    status: "pending",
    message: "Interswitch integration in progress",
    reference: request.reference,
  };
}
