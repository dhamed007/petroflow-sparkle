/**
 * erp-connect/index.ts
 *
 * Enterprise-hardened ERP connection endpoint.
 *
 * Security controls applied:
 *  1. Server-side role enforcement (tenant_admin | super_admin only)
 *  2. Idempotency key (optional — uses natural DB upsert as fallback)
 *  3. Cross-tenant protection: tenant_id ALWAYS from auth user profile
 *  4. 15-second timeout on external ERP connection tests
 *  5. Audit log on connect (success + failure)
 *  6. Sanitized response — credentials/tokens never returned to caller
 *  7. Error sanitiser — internal details never leak
 *  8. Standard { success, message, rateLimited, timestamp } response
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CORS_HEADERS,
  erpResponse,
  erpError,
  verifyERPAuth,
  checkIdempotencyKey,
  recordIdempotencyKey,
  insertAuditLog,
  fetchWithTimeout,
  sanitizeError,
  encryptSecret,
} from "../_shared/erp-auth.ts";

interface ERPConnectRequest {
  erp_system: string;
  name: string;
  credentials: any;
  api_endpoint?: string;
  api_version?: string;
  is_sandbox: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Auth + role enforcement ─────────────────────────────────────────
    // No service-role bypass — erp-connect is user-only
    const auth = await verifyERPAuth(req, supabase, { allowSystemKey: false });

    // ── 2. Idempotency (optional header) ──────────────────────────────────
    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const alreadySeen = await checkIdempotencyKey(supabase, idempotencyKey, auth.tenantId);
      if (alreadySeen) {
        return erpResponse(true, "Duplicate request — connection already established");
      }
    }

    const connectRequest: ERPConnectRequest = await req.json();

    if (!connectRequest.erp_system || !connectRequest.name || !connectRequest.credentials) {
      return erpError("Missing required fields: erp_system, name, credentials", 400);
    }

    // ── 3. Test connection (15-second timeout on external HTTP) ───────────
    let connectionTest: { success: boolean; error?: string; entities?: any };
    switch (connectRequest.erp_system) {
      case "odoo":
        connectionTest = await testOdooConnection(connectRequest);
        break;
      case "sap":
        connectionTest = await testSAPConnection(connectRequest);
        break;
      case "quickbooks":
        connectionTest = await testQuickBooksConnection(connectRequest);
        break;
      case "sage":
        connectionTest = await testSageConnection(connectRequest);
        break;
      case "dynamics365":
        connectionTest = await testDynamics365Connection(connectRequest);
        break;
      case "custom_api":
        connectionTest = await testCustomAPIConnection(connectRequest);
        break;
      default:
        return erpError(`Unsupported ERP system: ${connectRequest.erp_system}`, 400);
    }

    if (!connectionTest.success) {
      // Audit the failure — do NOT forward connectionTest.error to caller
      await insertAuditLog(supabase, auth.tenantId, auth.userId, "ERP_CONNECT", {
        erp_system: connectRequest.erp_system,
        status: "connection_failed",
      });

      return erpResponse(false, "Connection test failed — check credentials and endpoint", {}, 400);
    }

    // ── 4. Extract token data ──────────────────────────────────────────────
    const tokenData = extractTokenData(connectRequest, connectionTest);

    // ── 5. Encrypt all secrets before writing to DB ────────────────────────
    // Encryption happens via DB-side pgsodium RPC — the Edge Function never
    // touches the key. encryptSecret() throws on failure so plaintext can
    // never fall back to being stored unencrypted.
    const [encCredentials, encAccessToken, encRefreshToken, encOAuthClientSecret] = await Promise.all([
      encryptSecret(supabase, JSON.stringify(connectRequest.credentials)),
      encryptSecret(supabase, tokenData.access_token),
      encryptSecret(supabase, tokenData.refresh_token),
      encryptSecret(supabase, tokenData.oauth_client_secret),
    ]);

    // ── 6. Save integration (tenant_id from auth profile — never from body) ─
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .upsert(
        {
          tenant_id: auth.tenantId,   // ← always from auth, never from request
          erp_system: connectRequest.erp_system,
          name: connectRequest.name,
          is_sandbox: connectRequest.is_sandbox,
          credentials_encrypted: encCredentials,   // ciphertext
          api_endpoint: connectRequest.api_endpoint,
          api_version: connectRequest.api_version,
          connection_status: "connected",
          last_test_at: new Date().toISOString(),
          is_active: true,
          access_token_encrypted: encAccessToken,           // ciphertext
          refresh_token_encrypted: encRefreshToken,          // ciphertext
          token_expires_at: tokenData.expires_at,
          token_type: tokenData.token_type,
          oauth_config: tokenData.oauth_config,              // no client_secret
          oauth_client_secret_encrypted: encOAuthClientSecret, // ciphertext
          secrets_encrypted: true,
        },
        { onConflict: "tenant_id,erp_system" },
      )
      .select("id, erp_system, name, is_sandbox, connection_status, last_test_at, is_active, created_at, updated_at")
      .single();

    if (integrationError) {
      throw new Error("Failed to save integration");
    }

    // ── 7. Create default entity stubs ─────────────────────────────────────
    const defaultEntities = [
      { entity_type: "orders",    erp_entity_name: connectionTest.entities?.orders },
      { entity_type: "customers", erp_entity_name: connectionTest.entities?.customers },
      { entity_type: "products",  erp_entity_name: connectionTest.entities?.products },
      { entity_type: "invoices",  erp_entity_name: connectionTest.entities?.invoices },
      { entity_type: "payments",  erp_entity_name: connectionTest.entities?.payments },
    ];

    for (const entity of defaultEntities) {
      if (entity.erp_entity_name) {
        await supabase.from("erp_entities").upsert(
          {
            integration_id: integration.id,
            entity_type: entity.entity_type,
            erp_entity_name: entity.erp_entity_name,
            is_enabled: true,
          },
          { onConflict: "integration_id,entity_type" },
        );
      }
    }

    // ── 8. Audit log (success) ─────────────────────────────────────────────
    await insertAuditLog(supabase, auth.tenantId, auth.userId, "ERP_CONNECT", {
      erp_system: connectRequest.erp_system,
      integration_id: integration.id,
      status: "success",
    });

    // Record idempotency key after confirmed success
    if (idempotencyKey) {
      await recordIdempotencyKey(supabase, idempotencyKey, auth.tenantId);
    }

    // ── 9. Return sanitized integration (NO credentials/tokens) ───────────
    return erpResponse(true, "ERP connected successfully", { integration });
  } catch (error: any) {
    const status: number = typeof error.status === "number" ? error.status : 400;
    console.error("[erp-connect] error:", error.message);
    return erpError(sanitizeError(error), status);
  }
});

// ─── Connection test helpers (15-second timeout) ──────────────────────────────

async function testOdooConnection(config: ERPConnectRequest) {
  try {
    const response = await fetchWithTimeout(
      `${config.api_endpoint}/web/session/authenticate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          params: {
            db: config.credentials.database,
            login: config.credentials.username,
            password: config.credentials.password,
          },
        }),
      },
    );
    const data = await response.json();
    if (data.result?.uid) {
      return {
        success: true,
        entities: {
          orders: "sale.order",
          customers: "res.partner",
          products: "product.product",
          invoices: "account.move",
          payments: "account.payment",
        },
      };
    }
    return { success: false, error: "Odoo authentication failed" };
  } catch {
    return { success: false, error: "Odoo connection timed out or unreachable" };
  }
}

async function testSAPConnection(config: ERPConnectRequest) {
  try {
    const response = await fetchWithTimeout(`${config.api_endpoint}/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CompanyDB: config.credentials.company_db,
        UserName: config.credentials.username,
        Password: config.credentials.password,
      }),
    });
    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: "Orders",
          customers: "BusinessPartners",
          products: "Items",
          invoices: "Invoices",
          payments: "IncomingPayments",
        },
      };
    }
    return { success: false, error: "SAP authentication failed" };
  } catch {
    return { success: false, error: "SAP connection timed out or unreachable" };
  }
}

async function testQuickBooksConnection(config: ERPConnectRequest) {
  try {
    const response = await fetchWithTimeout(
      `${config.api_endpoint}/v3/company/${config.credentials.realm_id}/companyinfo/${config.credentials.realm_id}`,
      {
        headers: {
          Authorization: `Bearer ${config.credentials.access_token}`,
          Accept: "application/json",
        },
      },
    );
    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: "SalesOrder",
          customers: "Customer",
          products: "Item",
          invoices: "Invoice",
          payments: "Payment",
        },
      };
    }
    return { success: false, error: "QuickBooks authentication failed" };
  } catch {
    return { success: false, error: "QuickBooks connection timed out or unreachable" };
  }
}

async function testSageConnection(config: ERPConnectRequest) {
  try {
    const response = await fetchWithTimeout(
      `${config.api_endpoint}/sdata/accounts50/GCRM/-/`,
      {
        headers: {
          Authorization: `Basic ${btoa(
            config.credentials.username + ":" + config.credentials.password
          )}`,
        },
      },
    );
    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: "SalesOrders",
          customers: "Customers",
          products: "Commodities",
          invoices: "SalesInvoices",
          payments: "CustomerPayments",
        },
      };
    }
    return { success: false, error: "Sage authentication failed" };
  } catch {
    return { success: false, error: "Sage connection timed out or unreachable" };
  }
}

async function testDynamics365Connection(config: ERPConnectRequest) {
  try {
    const response = await fetchWithTimeout(
      `${config.api_endpoint}/api/data/v9.2/WhoAmI`,
      {
        headers: {
          Authorization: `Bearer ${config.credentials.access_token}`,
          "OData-Version": "4.0",
        },
      },
    );
    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: "salesorders",
          customers: "accounts",
          products: "products",
          invoices: "invoices",
          payments: "payments",
        },
      };
    }
    return { success: false, error: "Dynamics 365 authentication failed" };
  } catch {
    return { success: false, error: "Dynamics 365 connection timed out or unreachable" };
  }
}

async function testCustomAPIConnection(config: ERPConnectRequest) {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.credentials.auth_type === "bearer") {
      headers.Authorization = `Bearer ${config.credentials.token}`;
    } else if (config.credentials.auth_type === "basic") {
      headers.Authorization = `Basic ${btoa(
        config.credentials.username + ":" + config.credentials.password
      )}`;
    } else if (config.credentials.auth_type === "api_key") {
      headers[config.credentials.api_key_header ?? "X-API-Key"] = config.credentials.api_key;
    }
    const response = await fetchWithTimeout(
      `${config.api_endpoint}${config.credentials.health_endpoint ?? "/health"}`,
      { headers },
    );
    if (response.ok) {
      return { success: true, entities: config.credentials.entities ?? {} };
    }
    return { success: false, error: "Custom API authentication failed" };
  } catch {
    return { success: false, error: "Custom API connection timed out or unreachable" };
  }
}

// ─── Token extraction ─────────────────────────────────────────────────────────

function extractTokenData(config: ERPConnectRequest, _connectionTest: any) {
  const result: any = {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    token_type: "Bearer",
    oauth_config: {},
    // client_secret is stored encrypted in a dedicated column — never in oauth_config
    oauth_client_secret: null,
  };

  switch (config.erp_system) {
    case "quickbooks":
      result.access_token = config.credentials.access_token;
      result.refresh_token = config.credentials.refresh_token;
      result.oauth_client_secret = config.credentials.client_secret ?? null;
      result.oauth_config = {
        client_id: config.credentials.client_id,
        realm_id: config.credentials.realm_id,
        token_url: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        // client_secret intentionally omitted — stored in oauth_client_secret_encrypted
      };
      if (result.access_token) {
        result.expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
      }
      break;

    case "dynamics365":
      result.access_token = config.credentials.access_token;
      result.refresh_token = config.credentials.refresh_token;
      result.oauth_client_secret = config.credentials.client_secret ?? null;
      result.oauth_config = {
        client_id: config.credentials.client_id,
        tenant_id: config.credentials.tenant_id,
        scope: config.credentials.scope ?? "https://org.crm.dynamics.com/.default",
        token_url: `https://login.microsoftonline.com/${config.credentials.tenant_id}/oauth2/v2.0/token`,
        // client_secret intentionally omitted
      };
      if (result.access_token) {
        result.expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
      }
      break;

    case "custom_api":
      if (config.credentials.auth_type === "bearer") {
        result.access_token = config.credentials.token;
        result.refresh_token = config.credentials.refresh_token;
        result.oauth_client_secret = config.credentials.client_secret ?? null;
        result.oauth_config = {
          client_id: config.credentials.client_id,
          token_url: config.credentials.token_url,
          // client_secret intentionally omitted
        };
        if (config.credentials.expires_in) {
          result.expires_at = new Date(
            Date.now() + config.credentials.expires_in * 1000
          ).toISOString();
        }
      }
      break;
  }

  return result;
}
