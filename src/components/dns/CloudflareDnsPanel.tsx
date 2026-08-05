import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';

type CfRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  zoneId: string;
  zoneName?: string;
};

type CfZone = { id: string; name: string; status?: string };

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'];

export function CloudflareDnsPanel({ activeProjectKey }: { activeProjectKey: string }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [hint, setHint] = useState('');
  const [domain, setDomain] = useState('');
  const [renderTarget, setRenderTarget] = useState('');
  const [zone, setZone] = useState<CfZone | null>(null);
  const [records, setRecords] = useState<CfRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [draftType, setDraftType] = useState<DnsRecordType>('CNAME');
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftTtl, setDraftTtl] = useState('1');
  const [draftPriority, setDraftPriority] = useState('10');
  const [draftProxied, setDraftProxied] = useState(false);

  const loadStatusAndPref = useCallback(async () => {
    setError(null);
    try {
      const [stRes, prefRes] = await Promise.all([
        fetch('/api/dns/status'),
        fetch(withProjectQuery('/api/dns/preference')),
      ]);
      const st = await stRes.json();
      const isReady = Boolean(st?.ready);
      setReady(isReady);
      setHint(typeof st?.hint === 'string' ? st.hint : '');

      if (prefRes.ok) {
        const prefBody = await prefRes.json();
        const pref = prefBody?.preference;
        if (pref?.domain) setDomain(String(pref.domain));
        if (pref?.renderTargetHint) setRenderTarget(String(pref.renderTargetHint));
        if (pref?.zoneId && isReady) {
          const z = { id: String(pref.zoneId), name: String(pref.zoneName || pref.domain || '') };
          setZone(z);
          try {
            const recRes = await fetch(
              withProjectQuery(`/api/dns/records?zoneId=${encodeURIComponent(z.id)}`),
            );
            const recBody = await recRes.json();
            if (recRes.ok && recBody?.ok) {
              setRecords(Array.isArray(recBody.records) ? recBody.records : []);
            }
          } catch {
            /* ignore — user can Refresh */
          }
        }
      }
    } catch (e) {
      setReady(false);
      setError(e instanceof Error ? e.message : 'Failed to load DNS status');
    }
  }, []);

  useEffect(() => {
    void loadStatusAndPref();
  }, [activeProjectKey, loadStatusAndPref]);

  const connectDomain = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withProjectQuery('/api/dns/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withProjectBody({
            domain,
            renderTargetHint: renderTarget || undefined,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Connect failed (${res.status})`);
      setZone(data.zone);
      setRecords(Array.isArray(data.records) ? data.records : []);
      setMessage(`Connected zone ${data.zone?.name || ''}. Loaded ${data.records?.length ?? 0} records from Cloudflare.`);
      if (!draftName && domain) setDraftName(domain);
      if (!draftValue && renderTarget) setDraftValue(renderTarget);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect domain');
      setZone(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshRecords = async () => {
    if (!zone?.id && !domain) return;
    setLoading(true);
    setError(null);
    try {
      const q = zone?.id
        ? withProjectQuery(`/api/dns/records?zoneId=${encodeURIComponent(zone.id)}`)
        : withProjectQuery(`/api/dns/records?domain=${encodeURIComponent(domain)}`);
      const res = await fetch(q);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to list records');
      setRecords(Array.isArray(data.records) ? data.records : []);
      if (!zone && data.zoneId) setZone({ id: data.zoneId, name: domain });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh records');
    } finally {
      setLoading(false);
    }
  };

  const createRecord = async () => {
    if (!zone?.id) {
      setError('Connect a domain / zone first.');
      return;
    }
    setBusyId('create');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withProjectQuery('/api/dns/records'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withProjectBody({
            zoneId: zone.id,
            domain,
            type: draftType,
            name: draftName || domain,
            content: draftValue,
            value: draftValue,
            ttl: Number(draftTtl) || 1,
            priority: draftType === 'MX' || draftType === 'SRV' ? Number(draftPriority) || 10 : undefined,
            proxied: draftProxied,
            renderTargetHint: renderTarget || undefined,
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Create failed');
      setMessage(`Created ${data.record?.type} ${data.record?.name}`);
      await refreshRecords();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create record');
    } finally {
      setBusyId(null);
    }
  };

  const removeRecord = async (rec: CfRecord) => {
    if (!confirm(`Delete ${rec.type} ${rec.name}?`)) return;
    setBusyId(rec.id);
    setError(null);
    try {
      const res = await fetch(
        withProjectQuery(
          `/api/dns/records/${encodeURIComponent(rec.id)}?zoneId=${encodeURIComponent(rec.zoneId || zone?.id || '')}`,
        ),
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Delete failed');
      setRecords((prev) => prev.filter((r) => r.id !== rec.id));
      setMessage(`Deleted ${rec.type} ${rec.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete record');
    } finally {
      setBusyId(null);
    }
  };

  const suggestCname = () => {
    setDraftType('CNAME');
    setDraftName(domain || '');
    setDraftValue(renderTarget || '');
    setDraftProxied(false);
    setDraftTtl('1');
  };

  if (ready === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading DNS…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <Header />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90 space-y-2">
          <p className="font-medium">Cloudflare DNS is not configured on this server</p>
          <p className="text-amber-100/70 text-xs leading-relaxed">{hint}</p>
          <p className="text-amber-100/70 text-xs leading-relaxed">
            Create an API token with <strong>Zone → Zone → Read</strong> and{' '}
            <strong>Zone → DNS → Edit</strong>, set <code className="text-amber-50">CLOUDFLARE_API_TOKEN</code> (and
            optionally <code className="text-amber-50">CLOUDFLARE_ZONE_ID</code>), then restart Nebulla.
          </p>
        </div>
        <PlanningFallback activeProjectKey={activeProjectKey} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <Header />

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-100/90">
        Cloudflare DNS API connected. Records you create here are written to your Cloudflare zone (not only saved
        locally).
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card/30 p-5">
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">Custom domain</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="app.example.com"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={() => void connectDomain()}
            disabled={loading || !domain.trim()}
            className="btn-cyan inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Connect zone
          </button>
        </div>
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
          Render service hostname (CNAME target)
        </label>
        <input
          type="text"
          value={renderTarget}
          onChange={(e) => setRenderTarget(e.target.value)}
          placeholder="your-service.onrender.com"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary/40"
        />
        {zone ? (
          <p className="text-xs text-muted-foreground">
            Zone: <span className="text-foreground">{zone.name}</span> ({zone.id.slice(0, 8)}…)
            {zone.status ? ` · ${zone.status}` : ''}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-border bg-card/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Cloudflare DNS records</h4>
          <button
            type="button"
            onClick={() => void refreshRecords()}
            disabled={loading || !zone}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
            {zone ? 'No records in this zone (or none loaded yet).' : 'Connect a domain to load records from Cloudflare.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {records.map((rec) => (
              <li
                key={rec.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-background/50 px-3 py-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-border px-1.5 py-0.5 font-medium uppercase">
                      {rec.type}
                    </span>
                    {rec.proxied ? (
                      <span className="text-[10px] text-orange-300">proxied</span>
                    ) : null}
                    {rec.priority != null ? (
                      <span className="text-muted-foreground">prio {rec.priority}</span>
                    ) : null}
                  </div>
                  <p className="font-mono text-foreground break-all">{rec.name}</p>
                  <p className="font-mono text-muted-foreground break-all">→ {rec.content}</p>
                  <p className="text-muted-foreground">TTL {rec.ttl === 1 ? 'auto' : rec.ttl}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeRecord(rec)}
                  disabled={busyId === rec.id}
                  className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  {busyId === rec.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Add record</h4>
          <button
            type="button"
            onClick={suggestCname}
            className="text-xs text-primary hover:underline"
          >
            Prefill CNAME → Render
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Type">
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as DnsRecordType)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {DNS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name / Host">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={domain || 'app.example.com'}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="Value / Target">
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              placeholder={renderTarget || 'hostname or IP'}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="TTL (1 = auto)">
            <input
              value={draftTtl}
              onChange={(e) => setDraftTtl(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            />
          </Field>
          {(draftType === 'MX' || draftType === 'SRV') && (
            <Field label="Priority">
              <input
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
              />
            </Field>
          )}
          {(draftType === 'A' || draftType === 'AAAA' || draftType === 'CNAME') && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
              <input
                type="checkbox"
                checked={draftProxied}
                onChange={(e) => setDraftProxied(e.target.checked)}
              />
              Cloudflare proxy (orange cloud) — usually off for Render CNAMEs
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={() => void createRecord()}
          disabled={!zone || !draftValue.trim() || busyId === 'create'}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground hover:bg-primary/20 disabled:opacity-50"
        >
          {busyId === 'create' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Create in Cloudflare
        </button>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground space-y-2">
        <p className="text-foreground/90 font-medium">Typical Render + Cloudflare setup</p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
          <li>
            Subdomain: CNAME <code className="text-foreground/80">app</code> (or FQDN) → your{' '}
            <code className="text-foreground/80">*.onrender.com</code> hostname. Keep proxy <strong>DNS only</strong>{' '}
            unless you know you need Cloudflare in front.
          </li>
          <li>
            Apex/root: use Cloudflare CNAME flattening to the Render hostname, or follow Render’s ALIAS docs.
          </li>
          <li>
            After DNS propagates, set <code className="text-foreground/80">PUBLIC_SITE_URL</code> on the web service and
            redeploy.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h3 className="text-xl font-medium text-foreground mb-1 flex items-center gap-2">
        <Globe className="w-6 h-6 text-primary" />
        DNS & domain
      </h3>
      <p className="text-sm text-muted-foreground">
        Point your Cloudflare zone at the deployed Render service. Live records sync through the Cloudflare API.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

/** Offline planning notepad when Cloudflare token is missing. */
function PlanningFallback({ activeProjectKey }: { activeProjectKey: string }) {
  const key = `nebula_dns_planning_${activeProjectKey || 'default'}`;
  const [domain, setDomain] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { domain?: string; notes?: string };
      setDomain(parsed.domain || '');
      setNotes(parsed.notes || '');
    } catch {
      /* ignore */
    }
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ domain, notes }));
    } catch {
      /* ignore */
    }
  }, [key, domain, notes]);

  return (
    <div className="rounded-xl border border-border bg-card/30 p-5 space-y-3">
      <p className="text-sm text-muted-foreground">
        Local planning only (not written to Cloudflare). Configure the API token to manage live DNS.
      </p>
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="app.example.com"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes: CNAME app → xxx.onrender.com …"
        rows={4}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
      />
    </div>
  );
}
