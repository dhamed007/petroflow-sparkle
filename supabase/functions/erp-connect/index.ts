import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      throw new Error("No tenant found");
    }

    const connectRequest: ERPConnectRequest = await req.json();

    // Test connection based on ERP system
    let connectionTest;
    switch (connectRequest.erp_system) {
      case 'odoo':
        connectionTest = await testOdooConnection(connectRequest);
        break;
      case 'sap':
        connectionTest = await testSAPConnection(connectRequest);
        break;
      case 'quickbooks':
        connectionTest = await testQuickBooksConnection(connectRequest);
        break;
      case 'sage':
        connectionTest = await testSageConnection(connectRequest);
        break;
      case 'dynamics365':
        connectionTest = await testDynamics365Connection(connectRequest);
        break;
      case 'custom_api':
        connectionTest = await testCustomAPIConnection(connectRequest);
        break;
      default:
        throw new Error("Unsupported ERP system");
    }

    if (!connectionTest.success) {
      return new Response(JSON.stringify({
        success: false,
        error: connectionTest.error,
        message: "Connection test failed"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Save integration
    const { data: integration, error: integrationError } = await supabase
      .from("erp_integrations")
      .upsert({
        tenant_id: profile.tenant_id,
        erp_system: connectRequest.erp_system,
        name: connectRequest.name,
        is_sandbox: connectRequest.is_sandbox,
        credentials_encrypted: connectRequest.credentials,
        api_endpoint: connectRequest.api_endpoint,
        api_version: connectRequest.api_version,
        connection_status: 'connected',
        last_test_at: new Date().toISOString(),
        is_active: true,
      }, {
        onConflict: 'tenant_id,erp_system'
      })
      .select()
      .single();

    if (integrationError) throw integrationError;

    // Create default entities
    const defaultEntities = [
      { entity_type: 'orders', erp_entity_name: connectionTest.entities?.orders },
      { entity_type: 'customers', erp_entity_name: connectionTest.entities?.customers },
      { entity_type: 'products', erp_entity_name: connectionTest.entities?.products },
      { entity_type: 'invoices', erp_entity_name: connectionTest.entities?.invoices },
      { entity_type: 'payments', erp_entity_name: connectionTest.entities?.payments },
    ];

    for (const entity of defaultEntities) {
      if (entity.erp_entity_name) {
        await supabase.from("erp_entities").upsert({
          integration_id: integration.id,
          entity_type: entity.entity_type,
          erp_entity_name: entity.erp_entity_name,
          is_enabled: true,
        }, {
          onConflict: 'integration_id,entity_type'
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      integration,
      message: "ERP connected successfully"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("ERP connection error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function testOdooConnection(config: ERPConnectRequest) {
  try {
    const response = await fetch(`${config.api_endpoint}/web/session/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        params: {
          db: config.credentials.database,
          login: config.credentials.username,
          password: config.credentials.password,
        }
      }),
    });

    const data = await response.json();
    
    if (data.result && data.result.uid) {
      return {
        success: true,
        entities: {
          orders: 'sale.order',
          customers: 'res.partner',
          products: 'product.product',
          invoices: 'account.move',
          payments: 'account.payment',
        }
      };
    }
    
    return { success: false, error: "Authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testSAPConnection(config: ERPConnectRequest) {
  // SAP B1 Service Layer test
  try {
    const response = await fetch(`${config.api_endpoint}/Login`, {
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
          orders: 'Orders',
          customers: 'BusinessPartners',
          products: 'Items',
          invoices: 'Invoices',
          payments: 'IncomingPayments',
        }
      };
    }
    
    return { success: false, error: "SAP authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testQuickBooksConnection(config: ERPConnectRequest) {
  // QuickBooks OAuth test
  try {
    const response = await fetch(
      `${config.api_endpoint}/v3/company/${config.credentials.realm_id}/companyinfo/${config.credentials.realm_id}`,
      {
        headers: {
          "Authorization": `Bearer ${config.credentials.access_token}`,
          "Accept": "application/json",
        },
      }
    );

    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: 'SalesOrder',
          customers: 'Customer',
          products: 'Item',
          invoices: 'Invoice',
          payments: 'Payment',
        }
      };
    }
    
    return { success: false, error: "QuickBooks authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testSageConnection(config: ERPConnectRequest) {
  try {
    const response = await fetch(`${config.api_endpoint}/sdata/accounts50/GCRM/-/`, {
      headers: {
        "Authorization": `Basic ${btoa(config.credentials.username + ':' + config.credentials.password)}`,
      },
    });

    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: 'SalesOrders',
          customers: 'Customers',
          products: 'Commodities',
          invoices: 'SalesInvoices',
          payments: 'CustomerPayments',
        }
      };
    }
    
    return { success: false, error: "Sage authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testDynamics365Connection(config: ERPConnectRequest) {
  try {
    const response = await fetch(`${config.api_endpoint}/api/data/v9.2/WhoAmI`, {
      headers: {
        "Authorization": `Bearer ${config.credentials.access_token}`,
        "OData-Version": "4.0",
      },
    });

    if (response.ok) {
      return {
        success: true,
        entities: {
          orders: 'salesorders',
          customers: 'accounts',
          products: 'products',
          invoices: 'invoices',
          payments: 'payments',
        }
      };
    }
    
    return { success: false, error: "Dynamics 365 authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function testCustomAPIConnection(config: ERPConnectRequest) {
  try {
    const headers: any = { "Content-Type": "application/json" };
    
    if (config.credentials.auth_type === 'bearer') {
      headers.Authorization = `Bearer ${config.credentials.token}`;
    } else if (config.credentials.auth_type === 'basic') {
      headers.Authorization = `Basic ${btoa(config.credentials.username + ':' + config.credentials.password)}`;
    } else if (config.credentials.auth_type === 'api_key') {
      headers[config.credentials.api_key_header || 'X-API-Key'] = config.credentials.api_key;
    }

    const response = await fetch(`${config.api_endpoint}${config.credentials.health_endpoint || '/health'}`, {
      headers,
    });

    if (response.ok) {
      return {
        success: true,
        entities: config.credentials.entities || {},
      };
    }
    
    return { success: false, error: "Custom API authentication failed" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}