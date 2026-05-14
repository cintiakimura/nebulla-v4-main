import { useCallback, useEffect, useState } from 'react';
import { NebullaIDE } from '@/components/ide/NebullaIDE';
import { LoginScreen } from '@/components/LoginScreen';
import { MyServicesOnboarding } from '@/components/MyServicesOnboarding';
import { fetchSessionUser, type NebulaSessionUser } from './lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from './lib/nebulaPublicConfig';

type AppRoute = 'boot' | 'login' | 'services' | 'ide';

function onboardingDoneStorageKey(uid: string) {
  return `nebulla_my_services_onboarding_v1_${uid}`;
}

function readOnboardingDone(uid: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(onboardingDoneStorageKey(uid)) === '1';
  } catch {
    return false;
  }
}

function writeOnboardingDone(uid: string) {
  try {
    localStorage.setItem(onboardingDoneStorageKey(uid), '1');
  } catch {
    /* ignore */
  }
}

function resolveRoute(cfg: NebulaPublicConfig, u: NebulaSessionUser | null): AppRoute {
  if (!cfg.cloudStorageReady) return 'ide';
  if (!u) return 'login';
  if (!readOnboardingDone(u.uid)) return 'services';
  return 'ide';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>('boot');
  const [user, setUser] = useState<NebulaSessionUser | null>(null);
  const [config, setConfig] = useState<NebulaPublicConfig | null>(null);

  const refreshSession = useCallback(async () => {
    const cfg = await fetchNebulaPublicConfig();
    setConfig(cfg);
    const u = await fetchSessionUser();
    setUser(u);
    setRoute(resolveRoute(cfg, u));
    return u;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await fetchNebulaPublicConfig();
      if (cancelled) return;
      setConfig(cfg);
      const u = await fetchSessionUser();
      if (cancelled) return;
      setUser(u);
      setRoute(resolveRoute(cfg, u));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === 'OAUTH_AUTH_SUCCESS') void refreshSession();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [refreshSession]);

  if (route === 'boot' || config === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground font-body">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (route === 'ide') {
    return <NebullaIDE />;
  }

  if (route === 'login') {
    return (
      <LoginScreen
        onAuthenticated={() => void refreshSession()}
        onBack={() => {
          window.history.back();
        }}
      />
    );
  }

  if (route === 'services' && user) {
    return (
      <MyServicesOnboarding
        user={user}
        config={config}
        onComplete={() => {
          writeOnboardingDone(user.uid);
          setRoute('ide');
        }}
      />
    );
  }

  return <NebullaIDE />;
}
