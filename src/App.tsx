import { useCallback, useMemo } from 'react';
import { NebullaIDE } from '@/components/ide/NebullaIDE';
import { LandingPage } from '@/components/LandingPage';
import { AppShell } from '@/components/AppShell';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { DpaPage } from './pages/DpaPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { PricingPage } from './pages/PricingPage';
import { PaymentPage } from './pages/PaymentPage';
import { goToApp, goToTryFree } from './lib/authNavigate';
import { FORCE_GUEST_MODE } from './lib/testingBranch';

function usePathname(): string {
  return useMemo(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname.replace(/\/+$/, '') || '/';
  }, []);
}

function AppRoutes() {
  const path = usePathname();

  /** Try-free CTA — testing branch skips signup and opens the IDE as guest. */
  const enterTryFree = useCallback(() => {
    if (FORCE_GUEST_MODE) {
      goToApp();
      return;
    }
    goToTryFree('/app');
  }, []);

  if (path === '/privacy') return <PrivacyPolicyPage />;
  if (path === '/terms') return <TermsOfServicePage />;
  if (path === '/legal/dpa' || path === '/dpa') return <DpaPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  // Testing branch: no login / signup — always open the IDE in guest mode.
  if (path === '/login' || path === '/signup') {
    if (FORCE_GUEST_MODE) return <NebullaIDE />;
    return <LoginPage />;
  }
  if (path === '/payment') return <PaymentPage />;
  if (path === '/pricing') return <PricingPage />;
  if (path === '/app' || path === '/ide') return <NebullaIDE />;

  return <LandingPage onEnter={enterTryFree} />;
}

export default function App() {
  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}
