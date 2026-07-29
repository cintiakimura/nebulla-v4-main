import { LoginScreen } from '@/components/LoginScreen';
import { goToLanding, readLoginNextParam } from '../lib/authNavigate';

export function LoginPage() {
  const next = readLoginNextParam();
  const path =
    typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') || '/' : '/login';
  const initialEmailMode = path === '/signup' ? 'signup' : 'signin';

  return (
    <LoginScreen
      initialEmailMode={initialEmailMode}
      onAuthenticated={() => {
        window.location.assign(next.startsWith('/') ? next : '/app');
      }}
      onBack={goToLanding}
    />
  );
}
