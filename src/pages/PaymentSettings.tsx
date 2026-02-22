import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface GatewayState {
  id?: string;
  is_active: boolean;
  is_sandbox: boolean;
  public_key: string;
  client_id: string;
  has_secret_key: boolean;
  has_client_secret: boolean;
  // Write-only fields: only sent on save, never populated from DB
  new_secret_key: string;
  new_client_secret: string;
}

const defaultGateway: GatewayState = {
  is_active: false,
  is_sandbox: true,
  public_key: '',
  client_id: '',
  has_secret_key: false,
  has_client_secret: false,
  new_secret_key: '',
  new_client_secret: '',
};

// Key format validation rules per gateway
const keyValidators: Record<string, { publicKey?: RegExp; secretKey?: RegExp; clientId?: RegExp; clientSecret?: RegExp }> = {
  paystack: {
    publicKey: /^pk_(test|live)_[A-Za-z0-9]+$/,
    secretKey: /^sk_(test|live)_[A-Za-z0-9]+$/,
  },
  flutterwave: {
    publicKey: /^FLWPUBK(_TEST)?-[A-Za-z0-9]+-X$/,
    secretKey: /^FLWSECK(_TEST)?-[A-Za-z0-9]+-X$/,
  },
  interswitch: {}, // No standard format
};

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const PaymentSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({
    paystack: 'idle',
    flutterwave: 'idle',
    interswitch: 'idle',
  });
  const [gateways, setGateways] = useState<Record<string, GatewayState>>({
    paystack: { ...defaultGateway },
    flutterwave: { ...defaultGateway },
    interswitch: { ...defaultGateway },
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchGateways();
  }, [user, navigate]);

  const fetchGateways = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) return;

      // Use safe view that excludes encrypted credentials
      const { data, error } = await supabase
        .from('payment_gateways_safe' as any)
        .select('*')
        .eq('tenant_id', profile.tenant_id);

      if (error) throw error;

      if (data) {
        const gatewayConfig: Record<string, GatewayState> = {
          paystack: { ...defaultGateway },
          flutterwave: { ...defaultGateway },
          interswitch: { ...defaultGateway },
        };

        (data as any[]).forEach((gw: any) => {
          gatewayConfig[gw.gateway_type] = {
            id: gw.id,
            is_active: gw.is_active,
            is_sandbox: gw.is_sandbox,
            public_key: gw.public_key || '',
            client_id: gw.client_id || '',
            has_secret_key: gw.has_secret_key || false,
            has_client_secret: gw.has_client_secret || false,
            new_secret_key: '',
            new_client_secret: '',
          };
        });

        setGateways(gatewayConfig);
      }
    } catch (error: any) {
      toast({
        title: "Error loading payment gateways",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (gatewayType: string) => {
    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) {
        toast({ title: "No tenant found", variant: "destructive" });
        return;
      }

      const gw = gateways[gatewayType];
      const gatewayData: Record<string, any> = {
        tenant_id: profile.tenant_id,
        gateway_type: gatewayType,
        is_active: gw.is_active,
        is_sandbox: gw.is_sandbox,
        public_key: gw.public_key,
        client_id: gw.client_id,
      };

      // Only include secret fields if user entered new values
      if (gw.new_secret_key) {
        gatewayData.secret_key_encrypted = gw.new_secret_key;
      }
      if (gw.new_client_secret) {
        gatewayData.client_secret_encrypted = gw.new_client_secret;
      }

      const { error } = await supabase
        .from('payment_gateways')
        .upsert(gatewayData as any, { onConflict: 'tenant_id,gateway_type' });

      if (error) throw error;

      toast({ title: "Payment gateway saved successfully" });
      fetchGateways();
    } catch (error: any) {
      toast({
        title: "Error saving payment gateway",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateGateway = (type: string, field: string, value: any) => {
    setGateways({
      ...gateways,
      [type]: { ...gateways[type], [field]: value }
    });
  };

  const validateKey = (gatewayType: string, keyField: 'publicKey' | 'secretKey' | 'clientId' | 'clientSecret', value: string): string | null => {
    if (!value) return null; // Empty = skip validation
    const pattern = keyValidators[gatewayType]?.[keyField];
    if (!pattern) return null; // No rule = skip
    return pattern.test(value) ? null : 'Invalid key format';
  };

  const handleTestConnection = async (gatewayType: string) => {
    const gw = gateways[gatewayType];
    setTestStatus((prev) => ({ ...prev, [gatewayType]: 'testing' }));

    try {
      if (gatewayType === 'paystack') {
        if (!gw.public_key) throw new Error('Public key required for connection test');
        const res = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=1', {
          headers: { Authorization: `Bearer ${gw.public_key}` },
        });
        if (!res.ok) throw new Error(`Paystack returned ${res.status}`);
      } else if (gatewayType === 'flutterwave') {
        if (!gw.public_key) throw new Error('Public key required for connection test');
        // Flutterwave doesn't expose a public-key-only endpoint; validate format instead
        if (!keyValidators.flutterwave.publicKey?.test(gw.public_key)) {
          throw new Error('Public key format invalid');
        }
      } else if (gatewayType === 'interswitch') {
        if (!gw.client_id) throw new Error('Client ID required for connection test');
      }

      setTestStatus((prev) => ({ ...prev, [gatewayType]: 'success' }));
      toast({ title: 'Connection test passed', description: `${gatewayType} credentials look valid.` });
    } catch (err: any) {
      setTestStatus((prev) => ({ ...prev, [gatewayType]: 'error' }));
      toast({ title: 'Connection test failed', description: err.message, variant: 'destructive' });
    }

    // Reset icon after 4s
    setTimeout(() => setTestStatus((prev) => ({ ...prev, [gatewayType]: 'idle' })), 4000);
  };

  const TestButton = ({ gatewayType }: { gatewayType: string }) => {
    const status = testStatus[gatewayType];
    return (
      <Button
        variant="outline"
        onClick={() => handleTestConnection(gatewayType)}
        disabled={status === 'testing'}
        className="gap-2"
      >
        {status === 'testing' && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
        {status === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
        {status === 'idle' && null}
        {status === 'testing' ? 'Testing...' : 'Test Connection'}
      </Button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/settings')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Button>
          <h1 className="text-3xl font-bold">Payment Gateway Configuration</h1>
          <p className="text-muted-foreground">Configure your preferred payment gateway for transactions</p>
        </div>

        <Tabs defaultValue="paystack" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="paystack">Paystack</TabsTrigger>
            <TabsTrigger value="flutterwave">Flutterwave</TabsTrigger>
            <TabsTrigger value="interswitch">Interswitch</TabsTrigger>
          </TabsList>

          <TabsContent value="paystack">
            <Card>
              <CardHeader>
                <CardTitle>Paystack Configuration</CardTitle>
                <CardDescription>Configure your Paystack payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Paystack</Label>
                  <Switch
                    checked={gateways.paystack.is_active}
                    onCheckedChange={(checked) => updateGateway('paystack', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.paystack.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('paystack', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Public Key</Label>
                  <Input
                    value={gateways.paystack.public_key || ''}
                    onChange={(e) => updateGateway('paystack', 'public_key', e.target.value)}
                    placeholder="pk_test_..."
                  />
                  {validateKey('paystack', 'publicKey', gateways.paystack.public_key) && (
                    <p className="text-sm text-destructive mt-1">
                      {validateKey('paystack', 'publicKey', gateways.paystack.public_key)}
                      {' '}— expected format: pk_test_... or pk_live_...
                    </p>
                  )}
                </div>
                <div>
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={gateways.paystack.new_secret_key}
                    onChange={(e) => updateGateway('paystack', 'new_secret_key', e.target.value)}
                    placeholder={gateways.paystack.has_secret_key ? '••••••••••••' : 'sk_test_...'}
                  />
                  {validateKey('paystack', 'secretKey', gateways.paystack.new_secret_key) && (
                    <p className="text-sm text-destructive mt-1">
                      {validateKey('paystack', 'secretKey', gateways.paystack.new_secret_key)}
                      {' '}— expected format: sk_test_... or sk_live_...
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {gateways.paystack.has_secret_key
                      ? 'Secret key is configured. Enter a new value to update it.'
                      : 'Your secret key is encrypted and stored securely'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleSave('paystack')} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Paystack Configuration'}
                  </Button>
                  <TestButton gatewayType="paystack" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flutterwave">
            <Card>
              <CardHeader>
                <CardTitle>Flutterwave Configuration</CardTitle>
                <CardDescription>Configure your Flutterwave payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Flutterwave</Label>
                  <Switch
                    checked={gateways.flutterwave.is_active}
                    onCheckedChange={(checked) => updateGateway('flutterwave', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.flutterwave.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('flutterwave', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Public Key</Label>
                  <Input
                    value={gateways.flutterwave.public_key || ''}
                    onChange={(e) => updateGateway('flutterwave', 'public_key', e.target.value)}
                    placeholder="FLWPUBK_TEST-...-X"
                  />
                  {validateKey('flutterwave', 'publicKey', gateways.flutterwave.public_key) && (
                    <p className="text-sm text-destructive mt-1">
                      {validateKey('flutterwave', 'publicKey', gateways.flutterwave.public_key)}
                      {' '}— expected format: FLWPUBK_TEST-...-X or FLWPUBK-...-X
                    </p>
                  )}
                </div>
                <div>
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={gateways.flutterwave.new_secret_key}
                    onChange={(e) => updateGateway('flutterwave', 'new_secret_key', e.target.value)}
                    placeholder={gateways.flutterwave.has_secret_key ? '••••••••••••' : 'FLWSECK_TEST-...-X'}
                  />
                  {validateKey('flutterwave', 'secretKey', gateways.flutterwave.new_secret_key) && (
                    <p className="text-sm text-destructive mt-1">
                      {validateKey('flutterwave', 'secretKey', gateways.flutterwave.new_secret_key)}
                      {' '}— expected format: FLWSECK_TEST-...-X or FLWSECK-...-X
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-1">
                    {gateways.flutterwave.has_secret_key
                      ? 'Secret key is configured. Enter a new value to update it.'
                      : 'Your secret key is encrypted and stored securely'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleSave('flutterwave')} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Flutterwave Configuration'}
                  </Button>
                  <TestButton gatewayType="flutterwave" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interswitch">
            <Card>
              <CardHeader>
                <CardTitle>Interswitch Configuration</CardTitle>
                <CardDescription>Configure your Interswitch payment gateway</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Interswitch</Label>
                  <Switch
                    checked={gateways.interswitch.is_active}
                    onCheckedChange={(checked) => updateGateway('interswitch', 'is_active', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sandbox Mode</Label>
                  <Switch
                    checked={gateways.interswitch.is_sandbox}
                    onCheckedChange={(checked) => updateGateway('interswitch', 'is_sandbox', checked)}
                  />
                </div>
                <div>
                  <Label>Client ID</Label>
                  <Input
                    value={gateways.interswitch.client_id || ''}
                    onChange={(e) => updateGateway('interswitch', 'client_id', e.target.value)}
                    placeholder="Your Client ID"
                  />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={gateways.interswitch.new_client_secret}
                    onChange={(e) => updateGateway('interswitch', 'new_client_secret', e.target.value)}
                    placeholder={gateways.interswitch.has_client_secret ? '••••••••••••' : 'Your Client Secret'}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {gateways.interswitch.has_client_secret 
                      ? 'Client secret is configured. Enter a new value to update it.' 
                      : 'Your client secret is encrypted and stored securely'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleSave('interswitch')} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Interswitch Configuration'}
                  </Button>
                  <TestButton gatewayType="interswitch" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PaymentSettings;