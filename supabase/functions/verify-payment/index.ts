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

    const { reference, gateway_type } = await req.json();

    // Get transaction
    const { data: transaction, error: txError } = await supabase
      .from("payment_transactions")
      .select("*, payment_gateways(*)")
      .eq("transaction_reference", reference)
      .single();

    if (txError || !transaction) {
      throw new Error("Transaction not found");
    }

    let verificationResponse;

    // Verify payment based on gateway type
    switch (gateway_type) {
      case 'paystack':
        verificationResponse = await verifyPaystack(transaction.payment_gateways, reference);
        break;
      case 'flutterwave':
        verificationResponse = await verifyFlutterwave(transaction.payment_gateways, reference);
        break;
      case 'interswitch':
        verificationResponse = await verifyInterswitch(transaction.payment_gateways, reference);
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
        .single();

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

    return new Response(JSON.stringify({ status, data: verificationResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Payment verification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function verifyPaystack(gateway: any, reference: string) {
  const url = `https://api.paystack.co/transaction/verify/${reference}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gateway.secret_key_encrypted}`,
    },
  });

  return await response.json();
}

async function verifyFlutterwave(gateway: any, reference: string) {
  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gateway.secret_key_encrypted}`,
    },
  });

  return await response.json();
}

async function verifyInterswitch(gateway: any, reference: string) {
  // Interswitch verification would go here
  return {
    status: "pending",
    message: "Interswitch verification in progress",
  };
}