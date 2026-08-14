/** Last known product live URL from workspace deploy (client cache). */

const LIVE_URL_KEY = 'nebula_workspace_live_url_v1';
const DOMAIN_KEY_PREFIX = 'nebula_workspace_custom_domain_v1:';
const REPO_KEY_PREFIX = 'nebula_workspace_repo_url_v1:';
const DNS_RECORDS_KEY_PREFIX = 'nebula_workspace_dns_records_v1:';

export type DnsDomainStatus = 'not_configured' | 'pending' | 'active';

export type StoredCustomDomain = {
  domain: string;
  status: DnsDomainStatus;
  savedAt: string;
};

/** Stub DNS rows for Plan page (local until provider wiring). */
export type StoredDnsRecord = {
  type: 'A' | 'CNAME' | 'TXT';
  host: string;
  value: string;
  ttl: string;
};

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readStoredWorkspaceLiveUrl(): string {
  const v = readLs(LIVE_URL_KEY)?.trim() || '';
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) return '';
  return v;
}

export function writeStoredWorkspaceLiveUrl(url: string | null | undefined): void {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return;
  writeLs(LIVE_URL_KEY, trimmed);
  try {
    window.dispatchEvent(new CustomEvent('nebula-workspace-live-url', { detail: { url: trimmed } }));
  } catch {
    /* ignore */
  }
}

export function readStoredCustomDomain(projectKey: string): StoredCustomDomain | null {
  const raw = readLs(`${DOMAIN_KEY_PREFIX}${projectKey || 'default'}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCustomDomain;
    if (!parsed?.domain?.trim()) return null;
    const status =
      parsed.status === 'pending' || parsed.status === 'active' || parsed.status === 'not_configured'
        ? parsed.status
        : 'not_configured';
    return { domain: parsed.domain.trim(), status, savedAt: parsed.savedAt || '' };
  } catch {
    return null;
  }
}

/** Stub save — local only until a real DNS API exists. */
export function writeStoredCustomDomain(
  projectKey: string,
  domain: string,
  status: DnsDomainStatus = 'pending',
): StoredCustomDomain {
  const next: StoredCustomDomain = {
    domain: domain.trim(),
    status: domain.trim() ? status : 'not_configured',
    savedAt: new Date().toISOString(),
  };
  writeLs(`${DOMAIN_KEY_PREFIX}${projectKey || 'default'}`, JSON.stringify(next));
  return next;
}

export function readStoredRepoUrl(projectKey: string): string {
  return readLs(`${REPO_KEY_PREFIX}${projectKey || 'default'}`)?.trim() || '';
}

export function writeStoredRepoUrl(projectKey: string, url: string): string {
  const trimmed = url.trim();
  const key = `${REPO_KEY_PREFIX}${projectKey || 'default'}`;
  if (!trimmed) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return '';
  }
  writeLs(key, trimmed);
  return trimmed;
}

const DEFAULT_DNS_RECORDS: StoredDnsRecord[] = [
  { type: 'A', host: '@', value: '', ttl: '3600' },
  { type: 'CNAME', host: 'www', value: '', ttl: '3600' },
  { type: 'TXT', host: '@', value: '', ttl: '3600' },
];

export function readStoredDnsRecords(projectKey: string): StoredDnsRecord[] {
  const raw = readLs(`${DNS_RECORDS_KEY_PREFIX}${projectKey || 'default'}`);
  if (!raw) return DEFAULT_DNS_RECORDS.map((r) => ({ ...r }));
  try {
    const parsed = JSON.parse(raw) as StoredDnsRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_DNS_RECORDS.map((r) => ({ ...r }));
    }
    return parsed.map((r) => ({
      type: r.type === 'CNAME' || r.type === 'TXT' ? r.type : 'A',
      host: String(r.host || ''),
      value: String(r.value || ''),
      ttl: String(r.ttl || '3600'),
    }));
  } catch {
    return DEFAULT_DNS_RECORDS.map((r) => ({ ...r }));
  }
}

export function writeStoredDnsRecords(projectKey: string, records: StoredDnsRecord[]): StoredDnsRecord[] {
  const next = records.map((r) => ({
    type: r.type === 'CNAME' || r.type === 'TXT' ? r.type : ('A' as const),
    host: r.host.trim(),
    value: r.value.trim(),
    ttl: r.ttl.trim() || '3600',
  }));
  writeLs(`${DNS_RECORDS_KEY_PREFIX}${projectKey || 'default'}`, JSON.stringify(next));
  return next;
}
