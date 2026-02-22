/**
 * erp-field-mapping-ai/index.ts
 *
 * Enterprise-hardened AI field-mapping endpoint.
 *
 * Security controls applied:
 *  1. Server-side role enforcement (tenant_admin | super_admin only)
 *  2. AI cost-protection rate limit (10 calls/hr per tenant via audit_logs)
 *  3. Cross-tenant ownership guard (entity → integration → tenant_id === auth.tenantId)
 *  4. Audit log on every AI invocation (success + failure)
 *  5. Error sanitiser — AI API keys never leak to caller
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
  checkAIRateLimit,
  insertAuditLog,
  sanitizeError,
} from "../_shared/erp-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Auth + role enforcement ─────────────────────────────────────────
    const auth = await verifyERPAuth(req, supabase, { allowSystemKey: false });

    // ── 2. AI cost-protection rate limit (10 calls/hr per tenant) ─────────
    const rateLimit = await checkAIRateLimit(supabase, auth.tenantId);
    if (!rateLimit.allowed) {
      const retryAfter = (rateLimit as any).retryAfter ?? 3600;
      return erpError(
        "AI mapping rate limit exceeded (10/hr). Try again later.",
        429,
        true,
        retryAfter,
      );
    }

    const { entity_id, petroflow_fields, erp_fields, erp_system } = await req.json();

    if (!entity_id || !petroflow_fields || !erp_fields || !erp_system) {
      return erpError(
        "Missing required fields: entity_id, petroflow_fields, erp_fields, erp_system",
        400,
      );
    }

    // ── 3. Cross-tenant ownership guard ────────────────────────────────────
    // entity → erp_integrations → tenant_id must match auth.tenantId
    const { data: entity, error: entityError } = await supabase
      .from("erp_entities")
      .select("id, integration_id, erp_integrations(tenant_id)")
      .eq("id", entity_id)
      .single();

    if (entityError || !entity) {
      return erpError("Entity not found", 404);
    }

    const entityTenantId = (entity.erp_integrations as any)?.tenant_id;
    if (entityTenantId !== auth.tenantId) {
      return erpError("Forbidden: entity does not belong to your tenant", 403);
    }

    // ── 4. Call AI model ───────────────────────────────────────────────────
    console.log("[erp-field-mapping-ai] Generating mappings for entity:", entity_id, "system:", erp_system);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an ERP field mapping expert. Your task is to suggest the best field mappings between PetroFlow (a petroleum distribution system) and ${erp_system} ERP system. Consider field names, data types, and common business logic.`,
          },
          {
            role: "user",
            content: `Map these PetroFlow fields to ${erp_system} ERP fields:

PetroFlow fields: ${JSON.stringify(petroflow_fields, null, 2)}

${erp_system} ERP fields: ${JSON.stringify(erp_fields, null, 2)}

For each PetroFlow field, suggest:
1. The best matching ERP field
2. A confidence score (0.0 to 1.0)
3. Any required data transformations
4. Whether the field is required

Return ONLY a JSON array with this structure:
[
  {
    "petroflow_field": "field_name",
    "erp_field": "suggested_erp_field",
    "confidence": 0.95,
    "transform_function": "uppercase|format_date|currency_convert|null",
    "is_required": true|false,
    "reasoning": "brief explanation"
  }
]`,
          },
        ],
        temperature: 0.3,
      }),
    });

    // ── AI-specific error handling ─────────────────────────────────────────
    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        await insertAuditLog(supabase, auth.tenantId, auth.userId, "ERP_AI_FIELD_MAPPING", {
          entity_id,
          erp_system,
          status: "ai_rate_limited",
        });
        return erpError(
          "AI provider rate limit exceeded. Please try again in a few moments.",
          429,
          true,
        );
      }
      if (aiResponse.status === 402) {
        await insertAuditLog(supabase, auth.tenantId, auth.userId, "ERP_AI_FIELD_MAPPING", {
          entity_id,
          erp_system,
          status: "ai_credits_exhausted",
        });
        return erpError(
          "AI usage limit reached. Please add credits to your workspace.",
          402,
        );
      }
      throw new Error("AI request failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;

    // Extract JSON array from AI response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const suggestions = JSON.parse(jsonMatch[0]);

    // ── 5. Persist suggestions ─────────────────────────────────────────────
    for (const suggestion of suggestions) {
      await supabase.from("erp_field_mappings").upsert(
        {
          entity_id,
          petroflow_field: suggestion.petroflow_field,
          erp_field: suggestion.erp_field,
          ai_confidence_score: suggestion.confidence,
          ai_suggested: true,
          is_required: suggestion.is_required,
          transform_function:
            suggestion.transform_function === "null" ? null : suggestion.transform_function,
        },
        { onConflict: "entity_id,petroflow_field" },
      );
    }

    // ── 6. Audit log (counts toward hourly rate limit) ─────────────────────
    await insertAuditLog(supabase, auth.tenantId, auth.userId, "ERP_AI_FIELD_MAPPING", {
      entity_id,
      erp_system,
      status: "success",
      suggestion_count: suggestions.length,
    });

    return erpResponse(true, "AI field mapping suggestions generated successfully", {
      suggestions,
    });
  } catch (error: any) {
    const status: number = typeof error.status === "number" ? error.status : 400;
    console.error("[erp-field-mapping-ai] error:", error.message);
    return erpError(sanitizeError(error), status);
  }
});
