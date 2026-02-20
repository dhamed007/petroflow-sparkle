import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardNav from "@/components/DashboardNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Upload, Copy, Check, Download } from "lucide-react";
import { format } from "date-fns";

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [primaryColor, setPrimaryColor] = useState("#ea580c");
  const [secondaryColor, setSecondaryColor] = useState("#1e3a8a");
  const [copiedCode, setCopiedCode] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    fetchTenant();
  }, [user, navigate]);

  const fetchTenant = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user!.id)
        .single();

      if (!profile?.tenant_id) {
        toast({
          title: "No tenant found",
          description: "Your account is not associated with a tenant.",
          variant: "destructive",
        });
        return;
      }

      const { data: tenantData, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile.tenant_id)
        .single();

      if (error) throw error;
      
      setTenant(tenantData);
      setPrimaryColor(tenantData.primary_color || "#ea580c");
      setSecondaryColor(tenantData.secondary_color || "#1e3a8a");
    } catch (error: any) {
      toast({
        title: "Error loading settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG, JPEG, or SVG image',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 2MB',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `${tenant.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', tenant.id);

      if (updateError) throw updateError;

      toast({ title: 'Logo uploaded successfully' });
      await fetchTenant();
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
        })
        .eq('id', tenant.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Your branding settings have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-tenant-data");
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `petroflow-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Backup downloaded", description: "Your tenant data has been exported successfully." });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleCopyCode = async () => {
    if (tenant?.slug) {
      await navigator.clipboard.writeText(tenant.slug);
      setCopiedCode(true);
      toast({ title: 'Organization code copied to clipboard' });
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardNav />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your organization settings</p>
        </div>

        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                Organization Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Organization Name</Label>
                <Input value={tenant?.name || ''} disabled />
              </div>
              <div>
                <Label>Industry</Label>
                <Input value={tenant?.industry || 'N/A'} disabled />
              </div>
              <div>
                <Label>Plan</Label>
                <Input value={tenant?.plan || 'free'} disabled className="capitalize" />
              </div>
              <div>
                <Label>Organization Code</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Share this code with team members to invite them to your organization
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded border font-mono text-sm">
                    {tenant?.slug || 'N/A'}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    disabled={!tenant?.slug}
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="logo">Logo</Label>
                <div className="mt-2 flex items-center gap-4">
                  {tenant?.logo_url && (
                    <img 
                      src={tenant.logo_url} 
                      alt="Logo" 
                      className="w-20 h-20 object-contain border rounded"
                    />
                  )}
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    onClick={() => document.getElementById('logo-upload')?.click()}
                    disabled={saving}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Logo
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#ea580c"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="secondaryColor">Secondary Color</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="secondaryColor"
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#1e3a8a"
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Data & Backup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Export all your organisation's data as a JSON file. Includes orders, deliveries,
                invoices, fleet, inventory, customers, and audit logs.
              </p>
              <Button onClick={handleExportBackup} disabled={exporting} variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                {exporting ? "Exporting..." : "Download Backup (JSON)"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
