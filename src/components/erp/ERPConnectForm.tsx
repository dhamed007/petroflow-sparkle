import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ERPConnectFormProps {
  onSuccess: () => void;
}

export const ERPConnectForm = ({ onSuccess }: ERPConnectFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [erpSystem, setErpSystem] = useState('odoo');
  const [formData, setFormData] = useState({
    name: '',
    api_endpoint: '',
    is_sandbox: true,
    credentials: {} as any,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('erp-connect', {
        body: {
          erp_system: erpSystem,
          ...formData,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({ title: "ERP connected successfully!" });
        onSuccess();
      } else {
        throw new Error(data.message || "Connection failed");
      }
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateCredentials = (key: string, value: any) => {
    setFormData({
      ...formData,
      credentials: { ...formData.credentials, [key]: value }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label>ERP System *</Label>
        <Select value={erpSystem} onValueChange={setErpSystem}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="odoo">Odoo</SelectItem>
            <SelectItem value="sap">SAP Business One</SelectItem>
            <SelectItem value="quickbooks">QuickBooks</SelectItem>
            <SelectItem value="sage">Sage</SelectItem>
            <SelectItem value="dynamics365">Dynamics 365</SelectItem>
            <SelectItem value="custom_api">Custom REST API</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Integration Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="My Production ERP"
          required
        />
      </div>

      <div>
        <Label>API Endpoint *</Label>
        <Input
          value={formData.api_endpoint}
          onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
          placeholder="https://your-erp.example.com/api"
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Sandbox Mode</Label>
        <Switch
          checked={formData.is_sandbox}
          onCheckedChange={(checked) => setFormData({ ...formData, is_sandbox: checked })}
        />
      </div>

      <Tabs defaultValue={erpSystem} value={erpSystem} className="w-full">
        <TabsContent value="odoo" className="space-y-4">
          <div>
            <Label>Database Name</Label>
            <Input
              value={formData.credentials.database || ''}
              onChange={(e) => updateCredentials('database', e.target.value)}
              placeholder="mydatabase"
            />
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={formData.credentials.username || ''}
              onChange={(e) => updateCredentials('username', e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.credentials.password || ''}
              onChange={(e) => updateCredentials('password', e.target.value)}
            />
          </div>
        </TabsContent>

        <TabsContent value="sap" className="space-y-4">
          <div>
            <Label>Company DB</Label>
            <Input
              value={formData.credentials.company_db || ''}
              onChange={(e) => updateCredentials('company_db', e.target.value)}
            />
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={formData.credentials.username || ''}
              onChange={(e) => updateCredentials('username', e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.credentials.password || ''}
              onChange={(e) => updateCredentials('password', e.target.value)}
            />
          </div>
        </TabsContent>

        <TabsContent value="quickbooks" className="space-y-4">
          <div>
            <Label>Realm ID</Label>
            <Input
              value={formData.credentials.realm_id || ''}
              onChange={(e) => updateCredentials('realm_id', e.target.value)}
            />
          </div>
          <div>
            <Label>Access Token</Label>
            <Input
              type="password"
              value={formData.credentials.access_token || ''}
              onChange={(e) => updateCredentials('access_token', e.target.value)}
              placeholder="Obtain from QuickBooks OAuth"
            />
          </div>
        </TabsContent>

        <TabsContent value="sage" className="space-y-4">
          <div>
            <Label>Username</Label>
            <Input
              value={formData.credentials.username || ''}
              onChange={(e) => updateCredentials('username', e.target.value)}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.credentials.password || ''}
              onChange={(e) => updateCredentials('password', e.target.value)}
            />
          </div>
        </TabsContent>

        <TabsContent value="dynamics365" className="space-y-4">
          <div>
            <Label>Access Token</Label>
            <Input
              type="password"
              value={formData.credentials.access_token || ''}
              onChange={(e) => updateCredentials('access_token', e.target.value)}
              placeholder="Obtain from Azure AD"
            />
          </div>
        </TabsContent>

        <TabsContent value="custom_api" className="space-y-4">
          <div>
            <Label>Auth Type</Label>
            <Select 
              value={formData.credentials.auth_type || 'bearer'} 
              onValueChange={(value) => updateCredentials('auth_type', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {formData.credentials.auth_type === 'bearer' && (
            <div>
              <Label>Bearer Token</Label>
              <Input
                type="password"
                value={formData.credentials.token || ''}
                onChange={(e) => updateCredentials('token', e.target.value)}
              />
            </div>
          )}
          
          {formData.credentials.auth_type === 'basic' && (
            <>
              <div>
                <Label>Username</Label>
                <Input
                  value={formData.credentials.username || ''}
                  onChange={(e) => updateCredentials('username', e.target.value)}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  value={formData.credentials.password || ''}
                  onChange={(e) => updateCredentials('password', e.target.value)}
                />
              </div>
            </>
          )}
          
          {formData.credentials.auth_type === 'api_key' && (
            <>
              <div>
                <Label>API Key Header Name</Label>
                <Input
                  value={formData.credentials.api_key_header || 'X-API-Key'}
                  onChange={(e) => updateCredentials('api_key_header', e.target.value)}
                />
              </div>
              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.credentials.api_key || ''}
                  onChange={(e) => updateCredentials('api_key', e.target.value)}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Connecting...' : 'Connect ERP'}
      </Button>
    </form>
  );
};