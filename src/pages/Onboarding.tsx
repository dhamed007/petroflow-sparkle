import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Building2, Users, Copy, Check } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const industries = [
  'Oil & Gas Distribution',
  'Petroleum Refining',
  'Marine Logistics',
  'Fuel Retail',
  'Industrial Supply',
  'Other'
];

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [createdName, setCreatedName] = useState('');
  const [copied, setCopied] = useState(false);

  // Create tenant state
  const [tenantName, setTenantName] = useState('');
  const [industry, setIndustry] = useState('');

  // Join tenant state
  const [tenantSlug, setTenantSlug] = useState('');

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Get the user's JWT token for secure API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No valid session found');
      }

      // Call the secure backend API endpoint using service role
      const { data, error } = await supabase.functions.invoke('create-tenant', {
        body: {
          name: tenantName,
          industry: industry,
          contact_email: user.email || '',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create organization');
      }

      const { tenant_name, tenant_slug } = data;

      // Show organization code dialog
      setCreatedCode(tenant_slug);
      setCreatedName(tenant_name);
      setShowCodeDialog(true);
    } catch (error: any) {
      toast({
        title: 'Failed to create tenant',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Find tenant by slug
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('*')
        .eq('slug', tenantSlug)
        .single();

      if (tenantError || !tenant) {
        throw new Error('Tenant not found. Please check the organization code.');
      }

      // Update user profile with tenant_id
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tenant_id: tenant.id })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Assign client role by default when joining
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          tenant_id: tenant.id,
          role: 'client'
        });

      if (roleError) throw roleError;

      toast({
        title: 'Successfully joined organization',
        description: `Welcome to ${tenant.name}!`
      });

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Failed to join organization',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    setShowCodeDialog(false);
    navigate('/dashboard');
  };

  return (
    <>
      <AlertDialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Organization Created Successfully! 🎉</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>Welcome to <span className="font-semibold text-foreground">{createdName}</span>!</p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm font-medium text-foreground">Your Organization Code:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-background px-3 py-2 rounded border text-foreground font-mono text-sm">
                    {createdCode}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="shrink-0"
                  >
                    {copied ? (
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

              <div className="bg-accent/50 p-3 rounded-lg">
                <p className="text-sm">
                  <strong>Important:</strong> Share this code with team members so they can join your organization. 
                  You can also find this code later in your Settings.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={handleContinue} className="w-full">
              Continue to Dashboard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl mb-2">Welcome to PetroFlow</CardTitle>
          <CardDescription className="text-base">
            Let's get you set up. Choose to create a new organization or join an existing one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">
                <Building2 className="w-4 h-4 mr-2" />
                Create Organization
              </TabsTrigger>
              <TabsTrigger value="join">
                <Users className="w-4 h-4 mr-2" />
                Join Organization
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-6">
              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantName">Organization Name</Label>
                  <Input
                    id="tenantName"
                    placeholder="e.g., Acme Petroleum"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry} required>
                    <SelectTrigger id="industry">
                      <SelectValue placeholder="Select your industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>
                          {ind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-muted p-4 rounded-lg space-y-1">
                  <p className="text-sm font-medium">What you'll get:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Full admin access to your organization</li>
                    <li>• Ability to invite team members</li>
                    <li>• Complete control over settings and data</li>
                    <li>• 30-day free trial of all features</li>
                  </ul>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Organization'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join" className="mt-6">
              <form onSubmit={handleJoinTenant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantSlug">Organization Code</Label>
                  <Input
                    id="tenantSlug"
                    placeholder="e.g., acme-petroleum"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the organization code provided by your administrator
                  </p>
                </div>

                <div className="bg-muted p-4 rounded-lg space-y-1">
                  <p className="text-sm font-medium">Need help?</p>
                  <p className="text-sm text-muted-foreground">
                    Contact your organization administrator to get the organization code. 
                    They can find it in their organization settings.
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Joining...' : 'Join Organization'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
    </>
  );
}
