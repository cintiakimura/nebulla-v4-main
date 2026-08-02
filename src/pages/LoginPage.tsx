import { LoginScreen } from '@/components/LoginScreen';
import { goToLanding, readLoginNextParam } from '../lib/authNavigate';

export function LoginPage() {
  const next = readLoginNextParam();
  const path =
    typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') || '/' : '/login';
  const isSignup = path === '/signup';
  const initialEmailMode = isSignup ? 'signup' : 'signin';
  const heading = isSignup ? 'Create your free account' : undefined;
  const subtitle = isSignup
    ? 'Free includes 1 trial project — UI Studio, Master Plan, and Security Scan. Upgrade later if you need more workspace.'
    : next === '/app'
      ? 'Sign in to open your workspace. Free accounts include 1 trial project.'
      : undefined;

  return (
    <LoginScreen
      initialEmailMode={initialEmailMode}
      heading={heading}
      subtitle={subtitle}
      /** Signup from "Try the App" must show the page even if a cookie session exists. */
      skipExistingSessionRedirect={isSignup}
      onAuthenticated={() => {
        window.location.assign(next.startsWith('/') ? next : '/app');
      }}
      onBack={goToLanding}
    />
  );
}
