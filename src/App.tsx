import { useCallback, useMemo } from 'react';
import { NebullaIDE } from '@/components/ide/NebullaIDE';
import { LandingPage } from '@/components/LandingPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { DpaPage } from './pages/DpaPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PricingPage } from './pages/PricingPage';
import { goToApp, goToTryFree } from './lib/authNavigate';
import { fetchSessionUser } from './lib/nebulaCloud';

function usePathname(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }, []);
}

export default function App() {
  const path = usePathname();

  /** Signed-in → IDE; otherwise create a free account (1 trial project). */
  const enterTryFree = useCallback(() => {
    void fetchSessionUser().then((u) => {
      if (u) goToApp();
      else goToTryFree('/app');
    });
  }, []);

  if (path === '/privacy') return <PrivacyPolicyPage />;
  if (path === '/terms') return <TermsOfServicePage />;
  if (path === '/legal/dpa' || path === '/dpa') return <DpaPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/login' || path === '/signup') return <LoginPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/app' || path === '/ide') return <NebullaIDE />;

  return <LandingPage onTryFree={enterTryFree} />;
}
