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

    const { integration_id } = await req.json();

    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .select("*")
      .eq("id", integration_id)
      .single();

    if (integrationError || !integration) {
      throw new Error("Integration not found");
    }

    // Check if token needs refresh
    const now = new Date();
    const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
    
    if (!expiresAt || now < expiresAt) {
      return new Response(JSON.stringify({
        success: true,
        message: "Token is still valid",
        expires_at: expiresAt,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh token based on ERP system
    let refreshResult;
    switch (integration.erp_system) {
      case 'quickbooks':
        refreshResult = await refreshQuickBooksToken(integration);
        break;
      case 'dynamics365':
        refreshResult = await refreshDynamics365Token(integration);
        break;
      case 'custom_api':
        refreshResult = await refreshCustomAPIToken(integration);
        break;
      default:
        throw new Error(`Token refresh not supported for ${integration.erp_system}`);
    }

    if (!refreshResult.success) {
      throw new Error(refreshResult.error || "Token refresh failed");
    }

    // Update integration with new tokens
    const { error: updateError } = await supabase
      .from("erp_integrations")
      .update({
        access_token_encrypted: refreshResult.access_token,
        refresh_token_encrypted: refreshResult.refresh_token,
        token_expires_at: refreshResult.expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration_id);

    if (updateError) throw updateError;

    console.log(`Token refreshed successfully for integration ${integration_id}`);

    return new Response(JSON.stringify({
      success: true,
      message: "Token refreshed successfully",
      expires_at: refreshResult.expires_at,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Token refresh error:", error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function refreshQuickBooksToken(integration: any) {
  try {
    const oauth_config = integration.oauth_config || {};
    const tokenUrl = oauth_config.token_url || "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    
    const credentials = integration.credentials_encrypted || {};
    const refreshToken = integration.refresh_token_encrypted || credentials.refresh_token;

    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${oauth_config.client_id}:${oauth_config.client_secret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `QuickBooks token refresh failed: ${errorText}` };
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt.toISOString(),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function refreshDynamics365Token(integration: any) {
  try {
    const oauth_config = integration.oauth_config || {};
    const tokenUrl = oauth_config.token_url || `https://login.microsoftonline.com/${oauth_config.tenant_id}/oauth2/v2.0/token`;
    
    const refreshToken = integration.refresh_token_encrypted;

    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: oauth_config.client_id,
        client_secret: oauth_config.client_secret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: oauth_config.scope || "https://org.crm.dynamics.com/.default",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Dynamics 365 token refresh failed: ${errorText}` };
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + (data.expires_in * 1000));

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt.toISOString(),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function refreshCustomAPIToken(integration: any) {
  try {
    const oauth_config = integration.oauth_config || {};
    const tokenUrl = oauth_config.token_url;
    
    if (!tokenUrl) {
      return { success: false, error: "No token refresh URL configured" };
    }

    const refreshToken = integration.refresh_token_encrypted;

    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: oauth_config.client_id,
        client_secret: oauth_config.client_secret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Token refresh failed: ${errorText}` };
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + ((data.expires_in || 3600) * 1000));

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt.toISOString(),
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}