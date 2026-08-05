import { useCallback, useMemo } from 'react';
import { NebullaIDE } from '@/components/ide/NebullaIDE';
import { LandingPage } from '@/components/LandingPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { DpaPage } from './pages/DpaPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PricingPage } from './pages/PricingPage';
import { PaymentPage } from './pages/PaymentPage';
import { goToTryFree } from './lib/authNavigate';

function usePathname(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }, []);
}

export default function App() {
  const path = usePathname();

  /** Always open signup (do not skip to IDE when already signed in). */
  const enterTryFree = useCallback(() => {
    goToTryFree('/app');
  }, []);

  if (path === '/privacy') return <PrivacyPolicyPage />;
  if (path === '/terms') return <TermsOfServicePage />;
  if (path === '/legal/dpa' || path === '/dpa') return <DpaPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/login' || path === '/signup') return <LoginPage />;
  if (path === '/payment') return <PaymentPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/app' || path === '/ide') return <NebullaIDE />;

  return <LandingPage onEnter={enterTryFree} />;
}
