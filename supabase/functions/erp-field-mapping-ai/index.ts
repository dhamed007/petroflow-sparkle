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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
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

    const { entity_id, petroflow_fields, erp_fields, erp_system } = await req.json();

    console.log("Generating AI field mappings for:", { entity_id, erp_system });

    // Use AI to suggest field mappings
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an ERP field mapping expert. Your task is to suggest the best field mappings between PetroFlow (a petroleum distribution system) and ${erp_system} ERP system. Consider field names, data types, and common business logic.`
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
]`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again in a few moments." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI usage limit reached. Please add credits to your workspace." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI request failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;
    
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }
    
    const suggestions = JSON.parse(jsonMatch[0]);

    // Save AI suggestions to database
    for (const suggestion of suggestions) {
      await supabase.from("erp_field_mappings").upsert({
        entity_id,
        petroflow_field: suggestion.petroflow_field,
        erp_field: suggestion.erp_field,
        ai_confidence_score: suggestion.confidence,
        ai_suggested: true,
        is_required: suggestion.is_required,
        transform_function: suggestion.transform_function === 'null' ? null : suggestion.transform_function,
      }, {
        onConflict: 'entity_id,petroflow_field'
      });
    }

    return new Response(JSON.stringify({
      success: true,
      suggestions,
      message: "AI field mapping suggestions generated successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("AI field mapping error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});