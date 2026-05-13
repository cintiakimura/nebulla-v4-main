import { getGithubOAuthCallbackUrl } from '../lib/authRedirect';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';
import { useEffect, useState } from 'react';

export function LoginOAuthHints() {
  const [publicSiteUrl, setPublicSiteUrl] = useState<string>('');
  const gh = getGithubOAuthCallbackUrl(publicSiteUrl);

  useEffect(() => {
    fetch(withProjectQuery('/api/config'))
      .then((res) => readResponseJson<{ publicSiteUrl?: string }>(res))
      .then((c) => setPublicSiteUrl((c.publicSiteUrl || '').trim()))
      .catch(() => setPublicSiteUrl(''));
  }, []);

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-left space-y-3">
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-headline text-amber-100">Email &amp; password</span> uses the same database as the rest of
        the app (<code className="text-amber-300/90">DATABASE_URL</code>). Passwords are hashed on the server; use a
        strong unique password.
      </p>
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-headline text-amber-100">Password reset emails</span> require{' '}
        <code className="text-amber-300/90">RESEND_API_KEY</code> and <code className="text-amber-300/90">RESEND_FROM_EMAIL</code>{' '}
        on the server (Resend). In development, the server logs a reset link when those are unset.
      </p>
      <p className="text-[11px] text-amber-200/90 leading-relaxed">
        <span className="font-headline text-amber-100">GitHub “redirect_uri_mismatch”?</span> In{' '}
        <a
          className="text-cyan-400 hover:underline"
          href="https://github.com/settings/developers"
          target="_blank"
          rel="noreferrer"
        >
          GitHub → Developer settings → OAuth Apps
        </a>
        , set <b>Authorization callback URL</b> to exactly:
      </p>
      <div>
        <code className="block text-[10px] text-cyan-200/90 break-all bg-black/30 p-2 rounded border border-white/10">
          {gh}
        </code>
      </div>
      <p className="text-[10px] text-slate-500">
        Callback is served by this app (<code className="text-slate-400">/api/auth/github/callback</code>), not a
        separate auth host.
      </p>
    </div>
  );
}
