import DashboardNav from '@/components/DashboardNav';
import { FleetMap } from '@/components/tracking/FleetMap';
import { GPSSimulator } from '@/components/tracking/GPSSimulator';
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <FleetMap />
          </div>
          <div>
            <GPSSimulator />
          </div>
        </div>
      </main>
    </div>
  );
}
