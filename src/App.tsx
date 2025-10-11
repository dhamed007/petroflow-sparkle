import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import DriverDashboard from "./pages/DriverDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import Orders from "./pages/Orders";
import Deliveries from "./pages/Deliveries";
import Inventory from "./pages/Inventory";
import Invoices from "./pages/Invoices";
import Settings from "./pages/Settings";
import PaymentSettings from "./pages/PaymentSettings";
import Fleet from "./pages/Fleet";
import Subscriptions from "./pages/Subscriptions";
import ERPIntegrations from "./pages/ERPIntegrations";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<AuthGuard><Onboarding /></AuthGuard>} />
            <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/driver" element={<AuthGuard><DriverDashboard /></AuthGuard>} />
            <Route path="/client" element={<AuthGuard><ClientDashboard /></AuthGuard>} />
            <Route path="/orders" element={<AuthGuard><Orders /></AuthGuard>} />
            <Route path="/deliveries" element={<AuthGuard><Deliveries /></AuthGuard>} />
            <Route path="/inventory" element={<AuthGuard><Inventory /></AuthGuard>} />
            <Route path="/invoices" element={<AuthGuard><Invoices /></AuthGuard>} />
            <Route path="/fleet" element={<AuthGuard><Fleet /></AuthGuard>} />
            <Route path="/subscriptions" element={<AuthGuard><Subscriptions /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="/settings/payments" element={<AuthGuard><PaymentSettings /></AuthGuard>} />
            <Route path="/integrations/erp" element={<AuthGuard><ERPIntegrations /></AuthGuard>} />
            <Route path="/admin" element={<AuthGuard><Admin /></AuthGuard>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
