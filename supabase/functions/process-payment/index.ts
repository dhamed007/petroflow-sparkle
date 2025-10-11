import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  gateway_type: 'paystack' | 'flutterwave' | 'interswitch';
  metadata?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const paymentRequest: PaymentRequest = await req.json();

    // Get payment gateway configuration
    const { data: gateway, error: gatewayError } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .eq("gateway_type", paymentRequest.gateway_type)
      .eq("is_active", true)
      .single();

    if (gatewayError || !gateway) {
      throw new Error("Payment gateway not configured or inactive");
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
    await supabase.from("payment_transactions").insert({
      tenant_id: profile.tenant_id,
      gateway_type: paymentRequest.gateway_type,
      transaction_reference: paymentRequest.reference,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: "pending",
      gateway_response: paymentResponse,
    });

    return new Response(JSON.stringify(paymentResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Payment processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function processPaystack(gateway: any, request: PaymentRequest) {
  const url = gateway.is_sandbox 
    ? "https://api.paystack.co/transaction/initialize"
    : "https://api.paystack.co/transaction/initialize";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gateway.secret_key_encrypted}`,
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

async function processFlutterwave(gateway: any, request: PaymentRequest) {
  const url = gateway.is_sandbox
    ? "https://api.flutterwave.com/v3/payments"
    : "https://api.flutterwave.com/v3/payments";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gateway.secret_key_encrypted}`,
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

async function processInterswitch(gateway: any, request: PaymentRequest) {
  // Interswitch implementation would go here
  // This is a placeholder as Interswitch has a more complex integration
  return {
    status: "pending",
    message: "Interswitch integration in progress",
    reference: request.reference,
  };
}