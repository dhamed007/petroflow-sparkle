import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import DashboardNav from '@/components/DashboardNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, Shield, UserPlus, Edit2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type UserWithRoles = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string[];
};

export default function UserManagement() {
  const { user } = useAuth();
  const { hasRole, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!roleLoading && !hasRole('tenant_admin') && !hasRole('super_admin')) {
      navigate('/dashboard');
    }
  }, [hasRole, roleLoading, navigate]);

  useEffect(() => {
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    if (!user) return;

    try {
      // Get current user's tenant
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) {
        toast({
          title: 'Error',
          description: 'No tenant found',
          variant: 'destructive',
        });
        return;
      }

      setTenantId(profile.tenant_id);

      // Get all users in this tenant
      const { data: tenantUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at')
        .eq('tenant_id', profile.tenant_id);

      if (usersError) throw usersError;

      // Get roles for each user
      const usersWithRoles = await Promise.all(
        (tenantUsers || []).map(async (u) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', u.id)
            .eq('tenant_id', profile.tenant_id);

          return {
            ...u,
            roles: roleData?.map((r) => r.role) || [],
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: 'Error loading users',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole || !tenantId) return;

    try {
      // Check if user already has this role
      if (selectedUser.roles.includes(selectedRole)) {
        toast({
          title: 'Role already assigned',
          description: `${selectedUser.email} already has the ${selectedRole} role`,
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('user_roles').insert([{
        user_id: selectedUser.id,
        tenant_id: tenantId,
        role: selectedRole as any,
      }]);

      if (error) throw error;

      toast({
        title: 'Role assigned',
        description: `${selectedRole} role assigned to ${selectedUser.email}`,
      });

      setDialogOpen(false);
      setSelectedUser(null);
      setSelectedRole('');
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error assigning role',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    if (!tenantId) return;
    
    if (!confirm(`Are you sure you want to remove the ${role} role?`)) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .eq('role', role as any);

      if (error) throw error;

      toast({
        title: 'Role removed',
        description: `${role} role has been removed`,
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error removing role',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'bg-purple-500',
      tenant_admin: 'bg-blue-500',
      sales_manager: 'bg-green-500',
      sales_rep: 'bg-teal-500',
      dispatch_officer: 'bg-orange-500',
      driver: 'bg-yellow-500',
      client: 'bg-gray-500',
    };
    return colors[role] || 'bg-gray-500';
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen">
        <DashboardNav />
        <div className="container mx-auto p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />

      <main className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="w-8 h-8 text-accent" />
              User Management
            </h1>
            <p className="text-muted-foreground">Manage team members and assign roles</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter((u) => u.roles.includes('tenant_admin')).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drivers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter((u) => u.roles.includes('driver')).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage user roles and permissions for your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {users.map((userItem) => (
                  <Card key={userItem.id} className="border">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{userItem.full_name || 'Unnamed User'}</h3>
                            {userItem.id === user?.id && (
                              <Badge variant="outline">You</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">{userItem.email}</p>
                          
                          <div className="flex flex-wrap gap-2">
                            {userItem.roles.length === 0 ? (
                              <Badge variant="outline" className="bg-gray-100">
                                No roles assigned
                              </Badge>
                            ) : (
                              userItem.roles.map((role) => (
                                <Badge
                                  key={role}
                                  className={`${getRoleBadgeColor(role)} flex items-center gap-1`}
                                >
                                  {role.replace('_', ' ')}
                                  <button
                                    onClick={() => handleRemoveRole(userItem.id, role)}
                                    className="ml-1 hover:opacity-70"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>

                        <Dialog
                          open={dialogOpen && selectedUser?.id === userItem.id}
                          onOpenChange={(open) => {
                            setDialogOpen(open);
                            if (!open) {
                              setSelectedUser(null);
                              setSelectedRole('');
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUser(userItem);
                                setDialogOpen(true);
                              }}
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              Assign Role
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Assign Role</DialogTitle>
                              <DialogDescription>
                                Assign a new role to {userItem.email}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Select Role</Label>
                                <Select value={selectedRole} onValueChange={setSelectedRole}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose a role..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                                    <SelectItem value="sales_manager">Sales Manager</SelectItem>
                                    <SelectItem value="sales_rep">Sales Representative</SelectItem>
                                    <SelectItem value="dispatch_officer">Dispatch Officer</SelectItem>
                                    <SelectItem value="driver">Driver</SelectItem>
                                    <SelectItem value="client">Client</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button onClick={handleAssignRole} className="w-full">
                                Assign Role
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
