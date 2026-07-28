import { LoginScreen } from '@/components/LoginScreen';
import { goToLanding, readLoginNextParam } from '../lib/authNavigate';

export function LoginPage() {
  const next = readLoginNextParam();

  return (
    <LoginScreen
      onAuthenticated={() => {
        window.location.assign(next.startsWith('/') ? next : '/app');
      }}
      onBack={goToLanding}
    />
  );
}
