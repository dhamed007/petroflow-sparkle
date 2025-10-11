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

    // Parse the request body
    const body: TenantData = await req.json();
    
    // Validate required fields
    if (!body.name || !body.contact_email) {
      console.error('Missing required fields:', body);
      return new Response(
        JSON.stringify({ 
          error: 'Bad Request', 
          message: 'Missing required fields: name and contact_email are required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a Supabase client with SERVICE ROLE KEY to bypass RLS
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log('Creating tenant with name:', body.name);

    // Generate slug from tenant name
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    // Insert the tenant using service role (bypasses RLS)
    const { data: tenant, error: insertError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: body.name,
        slug: slug,
        industry: body.industry || null,
        contact_email: body.contact_email,
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
