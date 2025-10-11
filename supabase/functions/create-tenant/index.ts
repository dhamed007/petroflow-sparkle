import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TenantData {
  name: string;
  industry?: string;
  contact_email: string;
}

const MAX_TENANT_NAME_LENGTH = 100;
const MAX_INDUSTRY_LENGTH = 100;

function validateTenantData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string') {
    errors.push('name is required');
  } else if (data.name.trim().length < 2 || data.name.trim().length > MAX_TENANT_NAME_LENGTH) {
    errors.push(`name must be between 2 and ${MAX_TENANT_NAME_LENGTH} characters`);
  }

  if (!data.contact_email || typeof data.contact_email !== 'string') {
    errors.push('contact_email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.contact_email)) {
      errors.push('contact_email must be a valid email address');
    } else if (data.contact_email.length > 255) {
      errors.push('contact_email must be less than 255 characters');
    }
  }

  if (data.industry && (typeof data.industry !== 'string' || data.industry.length > MAX_INDUSTRY_LENGTH)) {
    errors.push(`industry must be less than ${MAX_INDUSTRY_LENGTH} characters`);
  }

  return { valid: errors.length === 0, errors };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the JWT token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Missing authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a Supabase client with the user's JWT for verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT and get the user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Invalid JWT token:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse and validate request body
    const body = await req.json();
    const validation = validateTenantData(body);

    if (!validation.valid) {
      console.error('Validation failed:', validation.errors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a Supabase client with SERVICE ROLE KEY to bypass RLS
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Check if user already has a tenant
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (existingProfile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'User already belongs to a tenant' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantData: TenantData = {
      name: body.name.trim(),
      contact_email: body.contact_email.trim().toLowerCase(),
      industry: body.industry?.trim(),
    };

    console.log('Creating tenant with name:', tenantData.name);

    // Generate slug from tenant name
    let baseSlug = tenantData.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 45); // Leave room for counter suffix

    // Handle slug collisions by appending counter
    let slug = baseSlug;
    let counter = 1;
    let slugExists = true;

    while (slugExists && counter < 100) {
      const { data: existingTenant } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (!existingTenant) {
        slugExists = false;
      } else {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    if (counter >= 100) {
      console.error('Could not generate unique slug after 100 attempts');
      return new Response(
        JSON.stringify({ 
          error: 'Slug Generation Failed', 
          message: 'Unable to generate a unique organization code. Please try a different name.' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generated unique slug:', slug);

    // Insert the tenant using service role (bypasses RLS)
    const { data: tenant, error: insertError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: tenantData.name,
        slug: slug,
        industry: tenantData.industry || null,
        contact_email: tenantData.contact_email,
        is_active: true,
      })
      .select('id, name, slug')
      .single();

    if (insertError) {
      console.error('Error inserting tenant:', insertError);
      return new Response(
        JSON.stringify({ 
          error: 'Database Error', 
          message: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Tenant created successfully:', tenant.id);

    // Update user's profile with the new tenant_id (using service role)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ tenant_id: tenant.id })
      .eq('id', user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      // Note: We don't roll back the tenant creation, just log the error
    }

    // Assign tenant_admin role to the creator (using service role)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: user.id,
        tenant_id: tenant.id,
        role: 'tenant_admin',
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      // Note: We don't roll back, just log the error
    }

    console.log('Tenant setup completed for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
