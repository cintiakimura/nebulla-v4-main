import type { NebulaSessionUser } from './nebulaCloud';

function parseGithubHandleFromNoreplyEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const withId = /^(\d+)\+([^@]+)@users\.noreply\.github\.com$/i.exec(e);
  if (withId?.[2]) return withId[2];
  const plain = /^([^@+]+)@users\.noreply\.github\.com$/i.exec(e);
  if (plain?.[1]) return plain[1];
  return null;
}

/** One-line status for the My services GitHub card. */
export function formatGithubConnectionStatus(user: NebulaSessionUser): string {
  if (user.provider !== 'github') {
    return 'Not connected to GitHub';
  }
  const email = (user.accountEmail || user.email || '').trim();
  const handle = email ? parseGithubHandleFromNoreplyEmail(email) : null;
  if (handle) return `Connected as @${handle}`;
  const dn = (user.displayName || '').trim();
  if (dn) return `Connected as ${dn}`;
  return 'Connected with GitHub';
}
