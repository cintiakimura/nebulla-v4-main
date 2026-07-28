import { useMemo } from 'react';
import { NebullaIDE } from '@/components/ide/NebullaIDE';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { DpaPage } from './pages/DpaPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { MarketingLandingPage } from './pages/MarketingLandingPage';
import { LoginPage } from './pages/LoginPage';
import { PricingPage } from './pages/PricingPage';

function usePathname(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }, []);
}

export default function App() {
  const path = usePathname();

  if (path === '/privacy') return <PrivacyPolicyPage />;
  if (path === '/terms') return <TermsOfServicePage />;
  if (path === '/legal/dpa' || path === '/dpa') return <DpaPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/login' || path === '/signup') return <LoginPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/app' || path === '/ide') return <NebullaIDE />;

  // Public marketing home
  return <MarketingLandingPage />;
}
