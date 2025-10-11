import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderData {
  customer_id: string;
  product_type: string;
  quantity: number;
  unit: string;
  delivery_address: string;
  delivery_city?: string;
  delivery_region?: string;
  requested_delivery_date?: string;
  priority?: string;
  notes?: string;
}

const VALID_PRODUCT_TYPES = ['Diesel', 'Petrol', 'Kerosene', 'Jet Fuel', 'Lubricants'];
const VALID_UNITS = ['liters', 'gallons', 'barrels', 'tons'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function validateOrderData(data: any): { valid: boolean; errors: string[]; data?: OrderData } {
  const errors: string[] = [];

  if (!data.customer_id || typeof data.customer_id !== 'string') {
    errors.push('customer_id is required and must be a valid UUID');
  }

  if (!data.product_type || !VALID_PRODUCT_TYPES.includes(data.product_type)) {
    errors.push(`product_type must be one of: ${VALID_PRODUCT_TYPES.join(', ')}`);
  }

  if (typeof data.quantity !== 'number' || data.quantity <= 0 || data.quantity > 1000000) {
    errors.push('quantity must be a positive number between 1 and 1,000,000');
  }

  if (!data.unit || !VALID_UNITS.includes(data.unit)) {
    errors.push(`unit must be one of: ${VALID_UNITS.join(', ')}`);
  }

  if (!data.delivery_address || data.delivery_address.trim().length < 5 || data.delivery_address.trim().length > 500) {
    errors.push('delivery_address must be between 5 and 500 characters');
  }

  if (data.delivery_city && data.delivery_city.length > 100) {
    errors.push('delivery_city must be less than 100 characters');
  }

  if (data.delivery_region && data.delivery_region.length > 100) {
    errors.push('delivery_region must be less than 100 characters');
  }

  if (data.priority && !VALID_PRIORITIES.includes(data.priority)) {
    errors.push(`priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (data.notes && data.notes.length > 2000) {
    errors.push('notes must be less than 2000 characters');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      customer_id: data.customer_id,
      product_type: data.product_type,
      quantity: data.quantity,
      unit: data.unit,
      delivery_address: data.delivery_address.trim(),
      delivery_city: data.delivery_city?.trim(),
      delivery_region: data.delivery_region?.trim(),
      requested_delivery_date: data.requested_delivery_date,
      priority: data.priority || 'normal',
      notes: data.notes?.trim(),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const validation = validateOrderData(body);

    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant_id
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: 'User not assigned to a tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Insert order with validated data
    const { data: order, error: insertError } = await supabaseClient
      .from('orders')
      .insert({
        ...validation.data,
        tenant_id: profile.tenant_id,
        created_by: user.id,
        order_number: orderNumber,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create order', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create audit log
    await supabaseClient.rpc('create_audit_log', {
      p_action: 'CREATE',
      p_entity_type: 'order',
      p_entity_id: order.id,
      p_new_values: order,
    });

    return new Response(
      JSON.stringify({ success: true, order }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
