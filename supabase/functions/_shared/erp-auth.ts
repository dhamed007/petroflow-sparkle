/**
 * _shared/erp-auth.ts
 *
 * Enterprise-grade security primitives for all ERP edge functions.
 *
 * Controls implemented:
 *  1. JWT auth + DB role enforcement (tenant_admin | super_admin)
 *  2. Per-tenant rate limiting (1 sync/60 s, 30 syncs/hr)
 *  3. Idempotency key storage & lookup (24-hour window)
 *  4. Audit logging (non-blocking, fire-and-forget)
 *  5. Timeout-wrapped fetch (15 s default)
 *  6. Response format normalisation
 *  7. Error sanitiser — never leaks credentials or stack traces
 */

// deno-lint-ignore-file no-explicit-any
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
};

// ─── Standard response format ─────────────────────────────────────────────────

export function erpResponse(
  success: boolean,
  message: string,
  data: Record<string, unknown> = {},
  status = 200,
  rateLimited = false,
): Response {
  return new Response(
    JSON.stringify({
      success,
      message,
      rateLimited,
      timestamp: new Date().toISOString(),
      ...data,
    }),
    {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    },
  );
}

export function erpError(
  message: string,
  status: number,
  rateLimited = false,
  retryAfter?: number,
): Response {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
  };
  if (retryAfter !== undefined) {
    headers["Retry-After"] = String(retryAfter);
  }
  return new Response(
    JSON.stringify({
      success: false,
      message,
      rateLimited,
      timestamp: new Date().toISOString(),
    }),
    { status, headers },
  );
}

// ─── Auth + Role enforcement ───────────────────────────────────────────────────

export type AuthResult = {
  userId: string;
  tenantId: string;
  isSystem: boolean;
};

/**
 * Verifies the request JWT, derives tenant_id from the DB (never from the
 * request body), and asserts that the user holds tenant_admin or super_admin.
 *
 * Set `allowSystemKey: true` for functions that accept internal cron calls
 * authenticated with the Supabase service-role key.
 */
export async function verifyERPAuth(
  req: Request,
  supabase: SupabaseClient,
  { allowSystemKey = false }: { allowSystemKey?: boolean } = {},
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Internal cron / service-role bypass ──────────────────────────────────
  if (allowSystemKey && token === serviceRoleKey) {
    return { userId: "system", tenantId: "system", isSystem: true };
  }

  // ── JWT validation ────────────────────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  }

  // ── Tenant derivation from DB (never from request body) ──────────────────
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    throw Object.assign(new Error("No tenant found for user"), { status: 403 });
  }

  // ── Role enforcement ──────────────────────────────────────────────────────
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", profile.tenant_id)
    .in("role", ["tenant_admin", "super_admin"]);

  if (roleError || !roles || roles.length === 0) {
    throw Object.assign(
      new Error("Forbidden: requires tenant_admin or super_admin role"),
      { status: 403 },
    );
  }

  return { userId: user.id, tenantId: profile.tenant_id, isSystem: false };
}

// ─── Per-tenant ERP sync rate limiting ────────────────────────────────────────
// Hard limits: 1 sync per 60 seconds, 30 syncs per hour

const WINDOW_60S_MAX = 1;
const WINDOW_60S_MS = 60_000;
const WINDOW_1H_MAX = 30;
const WINDOW_1H_MS = 3_600_000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export async function checkSyncRateLimit(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<RateLimitResult> {
  const now = Date.now();

  // 60-second window
  const { count: recentCount, error: recentErr } = await supabase
    .from("erp_sync_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(now - WINDOW_60S_MS).toISOString());

  if (!recentErr && (recentCount ?? 0) >= WINDOW_60S_MAX) {
    return { allowed: false, retryAfter: 60 };
  }

  // Hourly window
  const { count: hourlyCount, error: hourlyErr } = await supabase
    .from("erp_sync_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", new Date(now - WINDOW_1H_MS).toISOString());

  if (!hourlyErr && (hourlyCount ?? 0) >= WINDOW_1H_MAX) {
    return { allowed: false, retryAfter: 3600 };
  }

  // Fail open on DB errors to avoid blocking legitimate users
  return { allowed: true };
}

// ─── AI cost-protection rate limiting ────────────────────────────────────────
// Uses audit_logs so no new table is needed.
// Limit: 10 AI field-mapping calls per tenant per hour.

const AI_HOURLY_MAX = 10;

export async function checkAIRateLimit(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<RateLimitResult> {
  const { count, error } = await supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("action_type", "ERP_AI_FIELD_MAPPING")
    .gte("created_at", new Date(Date.now() - WINDOW_1H_MS).toISOString());

  if (!error && (count ?? 0) >= AI_HOURLY_MAX) {
    return { allowed: false, retryAfter: 3600 };
  }

  return { allowed: true };
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

/**
 * Returns true if this key has already been processed for this tenant.
 * Keys expire after 24 hours (cleaned by cron).
 */
export async function checkIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("erp_idempotency_keys")
    .select("key")
    .eq("key", key)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}

/** Persists the key so future duplicate requests are detected. */
export async function recordIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  tenantId: string,
): Promise<void> {
  // Ignore insert-conflict; a concurrent request may have raced us.
  await supabase
    .from("erp_idempotency_keys")
    .upsert({ key, tenant_id: tenantId }, { onConflict: "key" });
}

// ─── Audit logging ─────────────────────────────────────────────────────────────

/**
 * Non-blocking: logs but never throws.  A failed audit write must never
 * block or fail the primary operation.
 */
export async function insertAuditLog(
  supabase: SupabaseClient,
  tenantId: string,
  performedBy: string | null,
  actionType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    performed_by: performedBy === "system" ? null : performedBy,
    action_type: actionType,
    metadata,
  });
  if (error) {
    // Fire-and-forget: surface in logs, never bubble up
    console.error(`[audit] Failed to write ${actionType}:`, error.message);
  }
}

// ─── Timeout-wrapped fetch ─────────────────────────────────────────────────────

/**
 * Wraps fetch with an AbortController so upstream ERP calls cannot hang
 * indefinitely.  Default: 15 seconds.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── Error sanitiser ──────────────────────────────────────────────────────────
// Never forward raw error messages to the client — they may contain credentials,
// API keys, or internal SQL errors.

const SAFE_PREFIXES = [
  "Missing Authorization",
  "Invalid or expired",
  "No tenant found",
  "Forbidden:",
  "Integration not found",
  "Entity not found",
  "Token validation failed",
  "Token refresh not supported",
  "Unsupported ERP system",
  "Rate limit exceeded",
  "Idempotency-Key header",
  "Duplicate request",
  "Field mapping rate limit",
  "AI mapping rate limit",
];

export function sanitizeError(err: unknown): string {
  if (!(err instanceof Error)) return "An unexpected error occurred";
  for (const prefix of SAFE_PREFIXES) {
    if (err.message.startsWith(prefix)) return err.message;
  }
  // Anything else (DB errors, network errors, credential errors) → generic
  return "Operation failed. Please try again or contact support.";
}
