import { lazy, Suspense } from "react";
import * as Sentry from "@sentry/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import { RoleGuard } from "./components/RoleGuard";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const Tracking = lazy(() => import("./pages/Tracking"));
const Orders = lazy(() => import("./pages/Orders"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Settings = lazy(() => import("./pages/Settings"));
const PaymentSettings = lazy(() => import("./pages/PaymentSettings"));
const Fleet = lazy(() => import("./pages/Fleet"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const ERPIntegrations = lazy(() => import("./pages/ERPIntegrations"));
const Admin = lazy(() => import("./pages/Admin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Profile = lazy(() => import("./pages/Profile"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Customers = lazy(() => import("./pages/Customers"));
const Reports = lazy(() => import("./pages/Reports"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const SentryFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center space-y-2">
      <p className="text-lg font-semibold">Something went wrong.</p>
      <p className="text-muted-foreground text-sm">Our team has been notified. Please refresh the page.</p>
      <button className="mt-4 underline text-sm" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  </div>
);

const App = () => (
  <Sentry.ErrorBoundary fallback={<SentryFallback />} showDialog={false}>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
              <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
              <Route path="/driver" element={<AuthGuard><RoleGuard allowedRoles={['driver']}><DriverDashboard /></RoleGuard></AuthGuard>} />
              <Route path="/client" element={<AuthGuard><RoleGuard allowedRoles={['client']}><ClientDashboard /></RoleGuard></AuthGuard>} />
              <Route path="/orders" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'sales_manager', 'sales_rep', 'dispatch_officer', 'super_admin']}><Orders /></RoleGuard></AuthGuard>} />
              <Route path="/deliveries" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'sales_manager', 'sales_rep', 'dispatch_officer', 'client', 'super_admin']}><Deliveries /></RoleGuard></AuthGuard>} />
              <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
              <Route path="/invoices" element={<AuthGuard><Invoices /></AuthGuard>} />
              <Route path="/fleet" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'dispatch_officer', 'super_admin']}><Fleet /></RoleGuard></AuthGuard>} />
              <Route path="/tracking" element={<AuthGuard><Tracking /></AuthGuard>} />
              <Route path="/subscriptions" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'super_admin']}><Subscriptions /></RoleGuard></AuthGuard>} />
              <Route path="/settings" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'super_admin']}><Settings /></RoleGuard></AuthGuard>} />
              <Route path="/settings/payments" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'super_admin']}><PaymentSettings /></RoleGuard></AuthGuard>} />
              <Route path="/settings/users" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'super_admin']}><UserManagement /></RoleGuard></AuthGuard>} />
              <Route path="/integrations/erp" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'super_admin']}><ERPIntegrations /></RoleGuard></AuthGuard>} />
              <Route path="/admin" element={<AuthGuard><RoleGuard allowedRoles={['super_admin']}><Admin /></RoleGuard></AuthGuard>} />
              <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
              <Route path="/analytics" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'sales_manager', 'super_admin']}><Analytics /></RoleGuard></AuthGuard>} />
              <Route path="/customers" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'sales_manager', 'sales_rep', 'dispatch_officer', 'super_admin']}><Customers /></RoleGuard></AuthGuard>} />
              <Route path="/reports" element={<AuthGuard><RoleGuard allowedRoles={['tenant_admin', 'sales_manager', 'super_admin']}><Reports /></RoleGuard></AuthGuard>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </Sentry.ErrorBoundary>
);

export default Sentry.withProfiler(App);
