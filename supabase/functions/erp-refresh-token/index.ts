/**
 * erp-refresh-token/index.ts
 *
 * Enterprise-hardened OAuth token refresh endpoint.
 *
 * Security controls applied:
 *  1. Server-side role enforcement (tenant_admin | super_admin)
 *     — service-role key accepted for internal calls from erp-sync
 *  2. Cross-tenant ownership guard (integration must belong to caller's tenant)
 *  3. 15-second timeout on upstream OAuth token endpoints
 *  4. Audit log on credential update
 *  5. Error sanitiser — OAuth secrets never leak to caller
 *  6. Standard { success, message, rateLimited, timestamp } response
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CORS_HEADERS,
  erpResponse,
  erpError,
  verifyERPAuth,
  insertAuditLog,
  fetchWithTimeout,
  sanitizeError,
  encryptSecret,
  getDecryptedIntegration,
} from "../_shared/erp-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Auth + role enforcement ─────────────────────────────────────────
    // allowSystemKey: true — erp-sync calls this internally with service-role key
    const auth = await verifyERPAuth(req, supabase, { allowSystemKey: true });

    const { integration_id } = await req.json();
    if (!integration_id) {
      return erpError("Missing required field: integration_id", 400);
    }

    // ── 2. Fetch integration via decryption RPC ────────────────────────────
    // Reads ciphertext from DB and decrypts inside pgsodium — the Edge
    // Function never receives the encryption key.
    const integration = await getDecryptedIntegration(supabase, integration_id);
    if (!integration) {
      return erpError("Integration not found", 404);
    }

    // ── 3. Cross-tenant ownership guard (skip for system calls) ───────────
    if (!auth.isSystem && integration.tenant_id !== auth.tenantId) {
      return erpError("Forbidden: integration does not belong to your tenant", 403);
    }

    const tenantId: string = auth.isSystem ? integration.tenant_id : auth.tenantId;

    // ── 4. Check if token actually needs refresh ───────────────────────────
    const expiresAt = integration.token_expires_at
      ? new Date(integration.token_expires_at)
      : null;

    if (!expiresAt || new Date() < expiresAt) {
      return erpResponse(true, "Token is still valid", {
        expires_at: expiresAt?.toISOString() ?? null,
      });
    }

    // ── 5. Perform refresh with 15-second timeout ──────────────────────────
    let refreshResult: {
      success: boolean;
      access_token?: string;
      refresh_token?: string;
      expires_at?: string;
      error?: string;
    };

    switch (integration.erp_system) {
      case "quickbooks":
        refreshResult = await refreshQuickBooksToken(integration);
        break;
      case "dynamics365":
        refreshResult = await refreshDynamics365Token(integration);
        break;
      case "custom_api":
        refreshResult = await refreshCustomAPIToken(integration);
        break;
      default:
        return erpError(
          `Token refresh not supported for ${integration.erp_system}`,
          400,
        );
    }

    if (!refreshResult.success) {
      // Audit failure without exposing the error detail
      await insertAuditLog(supabase, tenantId, auth.isSystem ? null : auth.userId, "ERP_TOKEN_REFRESH", {
        integration_id,
        erp_system: integration.erp_system,
        status: "failed",
      });
      return erpError("Token refresh failed. Re-connect the integration.", 400);
    }

    // ── 6. Encrypt new tokens before persisting ────────────────────────────
    const [encAccessToken, encRefreshToken] = await Promise.all([
      encryptSecret(supabase, refreshResult.access_token ?? null),
      encryptSecret(supabase, refreshResult.refresh_token ?? null),
    ]);

    const { error: updateError } = await supabase
      .from("erp_integrations")
      .update({
        access_token_encrypted: encAccessToken,   // ciphertext
        refresh_token_encrypted: encRefreshToken, // ciphertext
        token_expires_at: refreshResult.expires_at,
        secrets_encrypted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration_id);

    if (updateError) {
      throw new Error("Failed to persist refreshed tokens");
    }

    // ── 7. Audit log (success) ─────────────────────────────────────────────
    await insertAuditLog(supabase, tenantId, auth.isSystem ? null : auth.userId, "ERP_TOKEN_REFRESH", {
      integration_id,
      erp_system: integration.erp_system,
      status: "success",
      expires_at: refreshResult.expires_at,
    });

    return erpResponse(true, "Token refreshed successfully", {
      expires_at: refreshResult.expires_at,
    });
  } catch (error: any) {
    const status: number = typeof error.status === "number" ? error.status : 400;
    console.error("[erp-refresh-token] error:", error.message);
    return erpError(sanitizeError(error), status);
  }
});

// ─── OAuth refresh implementations (15-second timeout) ────────────────────────

async function refreshQuickBooksToken(integration: any) {
  try {
    const oauthConfig = integration.oauth_config ?? {};
    const tokenUrl =
      oauthConfig.token_url ??
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    // integration.refresh_token is already decrypted by get_decrypted_erp_integration.
    // Fall back to credentials JSON for legacy QuickBooks credential-style storage.
    const creds = integration.credentials
      ? (() => { try { return JSON.parse(integration.credentials); } catch { return {}; } })()
      : {};
    const refreshToken = integration.refresh_token ?? creds?.refresh_token ?? null;

    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(
          `${oauthConfig.client_id}:${oauthConfig.client_secret}`
        )}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return { success: false, error: "QuickBooks token refresh rejected" };
    }

    const data = await response.json();
    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  } catch {
    return { success: false, error: "QuickBooks token refresh timed out" };
  }
}

async function refreshDynamics365Token(integration: any) {
  try {
    const oauthConfig = integration.oauth_config ?? {};
    const tokenUrl =
      oauthConfig.token_url ??
      `https://login.microsoftonline.com/${oauthConfig.tenant_id}/oauth2/v2.0/token`;
    const refreshToken = integration.refresh_token; // decrypted by RPC

    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: oauthConfig.client_id,
        client_secret: oauthConfig.client_secret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: oauthConfig.scope ?? "https://org.crm.dynamics.com/.default",
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Dynamics 365 token refresh rejected" };
    }

    const data = await response.json();
    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  } catch {
    return { success: false, error: "Dynamics 365 token refresh timed out" };
  }
}

async function refreshCustomAPIToken(integration: any) {
  try {
    const oauthConfig = integration.oauth_config ?? {};
    const tokenUrl = oauthConfig.token_url;

    if (!tokenUrl) {
      return { success: false, error: "No token refresh URL configured" };
    }

    const refreshToken = integration.refresh_token; // decrypted by RPC
    if (!refreshToken) {
      return { success: false, error: "No refresh token available" };
    }

    const response = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: oauthConfig.client_id,
        client_secret: oauthConfig.client_secret,
      }),
    });

    if (!response.ok) {
      return { success: false, error: "Custom API token refresh rejected" };
    }

    const data = await response.json();
    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    };
  } catch {
    return { success: false, error: "Custom API token refresh timed out" };
  }
}
