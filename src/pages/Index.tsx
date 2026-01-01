import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import Navigation from '@/components/landing/Navigation';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Solutions from '@/components/landing/Solutions';
import LiveDashboard from '@/components/landing/LiveDashboard';
import Pricing from '@/components/landing/Pricing';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/landing/Footer';

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <main className="min-h-screen">
      <Navigation />
      <Hero />
      <Features />
      <Solutions />
      <LiveDashboard />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
};

export default Index;
