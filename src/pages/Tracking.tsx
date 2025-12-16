import DashboardNav from '@/components/DashboardNav';
import { FleetMap } from '@/components/tracking/FleetMap';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function Tracking() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      
      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">GPS Tracking</h1>
          <p className="text-muted-foreground">Monitor your fleet in real-time</p>
        </div>

        <FleetMap />
      </main>
    </div>
  );
}
