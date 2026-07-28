import React, { useEffect, useState } from 'react';
import {
  Github,
  FolderOpen,
  Trash2,
  Sparkles,
  Users,
  FileText,
  Upload,
  Globe,
  Plus,
  MoreHorizontal,
  Copy,
  Pencil,
  Eye,
  EyeOff,
  History,
  Key,
} from 'lucide-react';
import { VersionHistoryModal } from './VersionHistoryModal';
import {
  loadProjectSecrets,
  saveProjectSecrets,
  newSecretId,
  type SecretEntry,
  type SecretCategory,
} from '../lib/nebulaDashboardStorage';
import {
  byokProviderFromSecretName,
  deleteByokKeyOnServer,
  dispatchByokUpdated,
  fetchByokStatus,
  saveByokKeyToServer,
} from '../lib/byokClient';
import { clearLocalGrokApiKeyCache } from '../lib/grokUserKey';
import { SecretsKeysConnections } from '@/components/secrets/SecretsKeysConnections';
import type { NebulaSessionUser } from '../lib/nebulaCloud';
import type { NebulaPublicConfig } from '../lib/nebulaPublicConfig';

export type DashboardTab = 'projects' | 'secrets' | 'dns';

/** Internal dashboard tabs (DNS stays here — not a side-nav page). Settings live on Account. */
const DASH_TABS: { id: DashboardTab; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'dns', label: 'DNS' },
];

interface DashboardProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projects: { key: string; name: string; updatedAt: string }[];
  activeProjectKey: string;
  onOpenProject: (key: string) => void;
  onDeleteProject: (key: string) => void;
  onStartFlow: (kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => void;
  sessionUser?: NebulaSessionUser | null;
  publicConfig?: NebulaPublicConfig;
}

export function Dashboard({
  activeTab,
  onTabChange,
  projectName,
  onProjectNameChange,
  projects,
  activeProjectKey,
  onOpenProject,
  onDeleteProject,
  onStartFlow,
  sessionUser = null,
  publicConfig = {},
}: DashboardProps) {
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/30 backdrop-blur-sm relative">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-muted/20 px-2">
        {DASH_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'projects' && (
            <ProjectsTab
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              projects={projects}
              activeProjectKey={activeProjectKey}
              onOpenProject={onOpenProject}
              onDeleteProject={onDeleteProject}
              onStartFlow={onStartFlow}
              onOpenVersionHistory={() => setVersionHistoryOpen(true)}
            />
          )}
          {activeTab === 'secrets' && (
            <SecretsTab
              activeProjectKey={activeProjectKey}
              sessionUser={sessionUser}
              publicConfig={publicConfig}
            />
          )}
          {activeTab === 'dns' && <DnsTab activeProjectKey={activeProjectKey} />}
        </div>
      </div>
      <VersionHistoryModal open={versionHistoryOpen} onClose={() => setVersionHistoryOpen(false)} />
    </div>
  );
}

function ProjectsTab({
  projectName,
  onProjectNameChange,
  projects,
  activeProjectKey,
  onOpenProject,
  onDeleteProject,
  onStartFlow,
  onOpenVersionHistory,
}: {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projects: { key: string; name: string; updatedAt: string }[];
  activeProjectKey: string;
  onOpenProject: (key: string) => void;
  onDeleteProject: (key: string) => void;
  onStartFlow: (kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => void;
  onOpenVersionHistory: () => void;
}) {
  const formatWhen = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-10 animate-in slide-in-from-right-4 duration-300">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h3 className="text-xl font-headline text-cyan-300">Your projects</h3>
          <button
            type="button"
            onClick={onOpenVersionHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-headline border border-cyan-500/30 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 shrink-0"
          >
            <History className="w-3.5 h-3.5" />
            Version history
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Open a saved workspace, rename the active one below, or remove a project you no longer need.
        </p>
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Active project name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
            />
          </div>
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500 border border-dashed border-white/10 rounded-xl p-6 text-center">
            No saved projects yet. Start a new blank workspace with one of the flows below.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const isActive = p.key === activeProjectKey;
              return (
                <li
                  key={p.key}
                  className={`flex flex-wrap items-center gap-2 justify-between rounded-xl border px-4 py-3 ${
                    isActive ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-headline truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500">Updated {formatWhen(p.updatedAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => onOpenProject(p.key)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-headline bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Open
                      </button>
                    )}
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400/90 font-headline">Active</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteProject(p.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Create new project</h3>
        <p className="text-sm text-slate-500 mb-6">
          Every new project starts as a blank workspace by default. Pick a flow below—Nebulla will use your choice from there.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => void onStartFlow('quick')}
            className="p-6 border border-cyan-500/30 rounded-xl bg-cyan-500/5 hover:bg-cyan-500/10 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Quick generate</h4>
              <p className="text-xs text-slate-500">Have a short conversation with Nebula, then build slice by slice with Go</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('devpartner')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Dev partner</h4>
              <p className="text-xs text-slate-500">Participate and approve every section of the project development</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('github')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-400">
              <Github className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Clone from GitHub</h4>
              <p className="text-xs text-slate-500">Importing an existing repository</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('prompt')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Written prompt</h4>
              <p className="text-xs text-slate-500">Give a detailed written description and we build from it</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('upload')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Upload files</h4>
              <p className="text-xs text-slate-500">Upload your own project files</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV';

type DnsRecordRow = {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: string;
  priority: string;
};

const DNS_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'];

function dnsStorageKey(projectKey: string) {
  return `nebula_dns_planning_${projectKey || 'default'}`;
}

function loadDnsPlanning(projectKey: string): { domain: string; records: DnsRecordRow[] } {
  try {
    const raw = localStorage.getItem(dnsStorageKey(projectKey));
    if (!raw) return { domain: '', records: [] };
    const parsed = JSON.parse(raw) as { domain?: string; records?: DnsRecordRow[] };
    return {
      domain: typeof parsed.domain === 'string' ? parsed.domain : '',
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return { domain: '', records: [] };
  }
}

function saveDnsPlanning(projectKey: string, domain: string, records: DnsRecordRow[]) {
  try {
    localStorage.setItem(dnsStorageKey(projectKey), JSON.stringify({ domain, records }));
  } catch {
    /* ignore */
  }
}

function newDnsRecordId() {
  return `dns_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function DnsTab({ activeProjectKey }: { activeProjectKey: string }) {
  const initial = loadDnsPlanning(activeProjectKey);
  const [customDomain, setCustomDomain] = useState(initial.domain);
  const [records, setRecords] = useState<DnsRecordRow[]>(initial.records);

  useEffect(() => {
    const next = loadDnsPlanning(activeProjectKey);
    setCustomDomain(next.domain);
    setRecords(next.records);
  }, [activeProjectKey]);

  useEffect(() => {
    saveDnsPlanning(activeProjectKey, customDomain, records);
  }, [activeProjectKey, customDomain, records]);

  const updateRecord = (id: string, patch: Partial<DnsRecordRow>) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1 flex items-center gap-2">
          <Globe className="w-6 h-6" />
          DNS & domain
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Point your domain at the deployed Render service. Values here are for planning only until your control plane
          syncs them to Render.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline">Custom domain</label>
        <input
          type="text"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="app.example.com"
          className="mt-1 w-full max-w-md bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
        />
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-headline text-slate-200">DNS records</h4>
          <button
            type="button"
            onClick={() =>
              setRecords((prev) => [
                ...prev,
                {
                  id: newDnsRecordId(),
                  type: 'CNAME',
                  name: '',
                  value: '',
                  ttl: '3600',
                  priority: '',
                },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Add record
          </button>
        </div>

        {records.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-white/10 rounded-lg">
            No records yet. Add A, CNAME, MX, TXT, and other records for planning.
          </p>
        ) : (
          <ul className="space-y-4">
            {records.map((row) => {
              const needsPriority = row.type === 'MX' || row.type === 'SRV';
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-black/20 p-4 sm:grid-cols-2 lg:grid-cols-6"
                >
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                      Type
                    </label>
                    <select
                      value={row.type}
                      onChange={(e) => updateRecord(row.id, { type: e.target.value as DnsRecordType })}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                    >
                      {DNS_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                      Name / Host
                    </label>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => updateRecord(row.id, { name: e.target.value })}
                      placeholder="@ or www"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                      Value / Target
                    </label>
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateRecord(row.id, { value: e.target.value })}
                      placeholder="IP or hostname"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                      TTL
                    </label>
                    <input
                      type="text"
                      value={row.ttl}
                      onChange={(e) => updateRecord(row.id, { ttl: e.target.value })}
                      placeholder="3600"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                    />
                  </div>
                  {needsPriority ? (
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
                        Priority
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={row.priority}
                          onChange={(e) => updateRecord(row.id, { priority: e.target.value })}
                          placeholder="10"
                          className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setRecords((prev) => prev.filter((r) => r.id !== row.id))}
                          className="shrink-0 rounded-lg border border-red-500/30 px-2 text-red-300 hover:bg-red-500/10"
                          aria-label="Delete record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setRecords((prev) => prev.filter((r) => r.id !== row.id))}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-sm text-slate-300 space-y-3">
        <p className="font-headline text-cyan-200">Typical setup</p>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <strong className="text-slate-300">Apex / root domain:</strong> use Render’s recommended ALIAS/ANAME or
            flattened CNAME to your service hostname (see Render dashboard for the exact target).
          </li>
          <li>
            <strong className="text-slate-300">Subdomain:</strong> add a{' '}
            <code className="text-cyan-300/90">CNAME</code> from your subdomain to the Render service hostname shown for
            this project.
          </li>
          <li>
            After DNS propagates, set <code className="text-cyan-300/90">PUBLIC_SITE_URL</code> on the Web Service to the
            final HTTPS origin and redeploy.
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Grok main key is server `.env` only; do not store or edit in browser Secrets (project-execution-rules.md). */
function isServerReservedGrokSecretName(raw: string): boolean {
  const n = raw.trim().toUpperCase();
  return (
    n === 'MAIN_API_KEY_GROK' ||
    n === 'MAIN_AI_API_KEY' ||
    n === 'GROK_API_KEY_LUMEN' ||
    n === 'GROK_API_KEY'
  );
}

const SECRET_CATEGORY_OPTIONS: { id: SecretCategory; label: string }[] = [
  { id: 'api_key', label: 'API key' },
  { id: 'oauth_token', label: 'OAuth token' },
  { id: 'variable', label: 'Env variable' },
  { id: 'generic', label: 'Generic' },
];

function ProjectSecretsEditor({ activeProjectKey }: { activeProjectKey: string }) {
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [byokNote, setByokNote] = useState<string | null>(null);

  const syncByokRowToServer = async (name: string, value: string) => {
    const provider = byokProviderFromSecretName(name);
    if (!provider) return;
    const trimmed = value.trim();
    if (!trimmed) {
      const del = await deleteByokKeyOnServer(provider);
      if (provider === 'xai') clearLocalGrokApiKeyCache();
      setByokNote(
        del.ok
          ? `${name} removed from your account.`
          : del.error || 'Could not remove account key.',
      );
      dispatchByokUpdated();
      return;
    }
    const saved = await saveByokKeyToServer(provider, trimmed);
    if (saved.ok) {
      if (provider === 'xai') clearLocalGrokApiKeyCache();
      setByokNote(
        `${name} saved encrypted on your account${saved.tail ? ` (…${saved.tail})` : ''}. Not written to Render env.`,
      );
      // Demote local raw value after successful server save
      setEntries((prev) => {
        const next = prev.map((e) =>
          e.name.trim().toUpperCase() === name.trim().toUpperCase()
            ? { ...e, value: '', note: e.note || 'Stored on account (encrypted)' }
            : e,
        );
        saveProjectSecrets(activeProjectKey, next);
        return next;
      });
      dispatchByokUpdated();
    } else {
      setByokNote(
        saved.error ||
          'Could not save to account — kept in this browser only. Sign in and try again.',
      );
    }
  };

  const persist = (next: SecretEntry[]) => {
    const cleaned = next.filter((e) => !isServerReservedGrokSecretName(e.name));
    setEntries(cleaned);
    saveProjectSecrets(activeProjectKey, cleaned);
    try {
      const v0 = cleaned.find((e) => e.name.trim().toUpperCase() === 'V0_API_KEY');
      if (v0?.value.trim()) {
        localStorage.setItem('nebulla_v0_api_key', v0.value.trim());
        window.dispatchEvent(new CustomEvent('nebula-v0-key-updated'));
      }
      window.dispatchEvent(new CustomEvent('nebula-secrets-updated'));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const raw = loadProjectSecrets(activeProjectKey);
    const filtered = raw.filter((e) => !isServerReservedGrokSecretName(e.name));
    setEntries(filtered);
    if (filtered.length !== raw.length) {
      saveProjectSecrets(activeProjectKey, filtered);
    }
    setRevealedId(null);
    setRowMenuId(null);
    setCopiedId(null);
    setByokNote(null);
    void (async () => {
      const status = await fetchByokStatus();
      if (!status?.ok) return;
      const ensureRow = (name: string, configured: boolean, tail?: string) => {
        if (!configured) return;
        setEntries((prev) => {
          if (prev.some((e) => e.name.trim().toUpperCase() === name)) return prev;
          const next = [
            ...prev,
            {
              id: newSecretId(),
              name,
              value: '',
              category: 'api_key' as SecretCategory,
              note: tail ? `On account (…${tail})` : 'On account (encrypted)',
            },
          ];
          saveProjectSecrets(activeProjectKey, next);
          return next;
        });
      };
      ensureRow('XAI_API_KEY', status.providers.xai.configured, status.providers.xai.tail);
      ensureRow('ANTHROPIC_API_KEY', status.providers.anthropic.configured, status.providers.anthropic.tail);
      ensureRow('OPENAI_API_KEY', status.providers.openai.configured, status.providers.openai.tail);
    })();
  }, [activeProjectKey]);

  useEffect(() => {
    if (!rowMenuId) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('[data-nebulla-secret-menu]')) return;
      setRowMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [rowMenuId]);

  const patchEntry = (
    id: string,
    patch: Partial<Pick<SecretEntry, 'name' | 'value' | 'category' | 'note'>>,
  ) => {
    if (patch.name !== undefined && isServerReservedGrokSecretName(patch.name)) return;
    persist(entries.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const cleanupEmptyRow = (id: string) => {
    const row = entries.find((x) => x.id === id);
    if (!row || row.name.trim() || row.value.trim()) return;
    persist(entries.filter((x) => x.id !== id));
    if (revealedId === id) setRevealedId(null);
  };

  const commitByokIfNeeded = (id: string) => {
    const row = entries.find((x) => x.id === id);
    if (!row) return;
    if (!byokProviderFromSecretName(row.name)) return;
    void syncByokRowToServer(row.name, row.value);
  };

  const removeOne = (id: string) => {
    const row = entries.find((x) => x.id === id);
    persist(entries.filter((x) => x.id !== id));
    if (revealedId === id) setRevealedId(null);
    setRowMenuId(null);
    if (row && byokProviderFromSecretName(row.name)) {
      void syncByokRowToServer(row.name, '');
    }
  };

  const addRow = (category: SecretCategory = 'api_key') => {
    const id = newSecretId();
    persist([
      ...entries,
      {
        id,
        name: '',
        value: '',
        category,
      },
    ]);
    window.requestAnimationFrame(() => {
      document.getElementById(`secret-name-${id}`)?.focus();
    });
  };

  const focusName = (id: string) => {
    setRowMenuId(null);
    document.getElementById(`secret-name-${id}`)?.focus();
  };

  const copyValue = async (e: SecretEntry) => {
    setRowMenuId(null);
    try {
      await navigator.clipboard.writeText(e.value);
      setCopiedId(e.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <strong className="text-slate-400">AI keys</strong> (
        <code className="text-cyan-300/90">XAI_API_KEY</code>,{' '}
        <code className="text-cyan-300/90">ANTHROPIC_API_KEY</code>,{' '}
        <code className="text-cyan-300/90">OPENAI_API_KEY</code>) save{' '}
        <strong className="text-slate-400">encrypted on your account</strong> — not into Nebulla&apos;s shared
        Render env. Other project secrets stay in this browser for now. Platform fallback{' '}
        <code className="text-cyan-300/90">MAIN_API_KEY_GROK</code> is set only by ops in{' '}
        <code className="text-slate-400">.env</code> / Render.
      </p>
      {byokNote ? (
        <p className="text-xs text-cyan-200/90 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2">
          {byokNote}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addRow('api_key')}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs font-headline text-cyan-200 transition-colors hover:border-cyan-500/35 hover:text-cyan-100"
        >
          <Plus className="w-3.5 h-3.5" />
          Add secret
        </button>
        <button
          type="button"
          onClick={() => addRow('api_key')}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs font-headline text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-200"
        >
          <Key className="w-3.5 h-3.5" />
          Add API key
        </button>
        <button
          type="button"
          onClick={() => addRow('variable')}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs font-headline text-slate-300 transition-colors hover:border-cyan-500/35 hover:text-cyan-200"
        >
          <Plus className="w-3.5 h-3.5" />
          Add env variable
        </button>
      </div>

      <ul className="space-y-3">
        {entries.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col gap-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="sr-only" htmlFor={`secret-name-${e.id}`}>
                Variable name
              </label>
              <input
                id={`secret-name-${e.id}`}
                value={e.name}
                onChange={(ev) => patchEntry(e.id, { name: ev.target.value })}
                onBlur={() => cleanupEmptyRow(e.id)}
                placeholder="VARIABLE_NAME"
                autoComplete="off"
                className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
              />
              <div className="flex flex-1 min-w-0 items-center gap-2">
                <label className="sr-only" htmlFor={`secret-value-${e.id}`}>
                  Secret
                </label>
                <input
                  id={`secret-value-${e.id}`}
                  type={revealedId === e.id ? 'text' : 'password'}
                  value={e.value}
                  onChange={(ev) => patchEntry(e.id, { value: ev.target.value })}
                  onBlur={() => {
                    cleanupEmptyRow(e.id);
                    commitByokIfNeeded(e.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      commitByokIfNeeded(e.id);
                    }
                  }}
                  placeholder="Secret value"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setRevealedId((prev) => (prev === e.id ? null : e.id))}
                  className="shrink-0 p-2 rounded-lg border border-white/10 bg-transparent text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors"
                  title={revealedId === e.id ? 'Hide secret' : 'Reveal secret'}
                  aria-pressed={revealedId === e.id}
                >
                  {revealedId === e.id ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                </button>
                <div className="relative shrink-0" data-nebulla-secret-menu>
                  <button
                    type="button"
                    onClick={() => setRowMenuId((id) => (id === e.id ? null : e.id))}
                    className="p-2 rounded-lg border border-white/10 bg-transparent text-slate-400 hover:text-cyan-200 hover:border-cyan-500/30"
                    title="Actions"
                    aria-haspopup="menu"
                    aria-expanded={rowMenuId === e.id}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {rowMenuId === e.id ? (
                    <div className="absolute right-0 top-full mt-1 z-20 min-w-[10.5rem] rounded-lg border border-white/15 bg-[#061520] py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => focusName(e.id)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => copyValue(e)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        {copiedId === e.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRowMenuId(null);
                          if (window.confirm('Delete this secret?')) removeOne(e.id);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-red-300/90 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <label className="sr-only" htmlFor={`secret-category-${e.id}`}>
                Category
              </label>
              <select
                id={`secret-category-${e.id}`}
                value={e.category}
                onChange={(ev) => patchEntry(e.id, { category: ev.target.value as SecretCategory })}
                className="w-full sm:w-40 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/40 outline-none"
              >
                {SECRET_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`secret-note-${e.id}`}>
                Note
              </label>
              <input
                id={`secret-note-${e.id}`}
                value={e.note ?? ''}
                onChange={(ev) => patchEntry(e.id, { note: ev.target.value })}
                placeholder="Optional note"
                autoComplete="off"
                className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:border-cyan-500/40 outline-none"
              />
            </div>
          </li>
        ))}
      </ul>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-white/10 rounded-lg">
          No secrets yet. Use Add secret to store API keys or env variables (this browser only).
        </p>
      ) : null}
    </div>
  );
}

function SecretsTab({
  activeProjectKey,
  sessionUser,
  publicConfig,
}: {
  activeProjectKey: string;
  sessionUser: NebulaSessionUser | null;
  publicConfig: NebulaPublicConfig;
}) {
  return (
    <div className="space-y-10 animate-in slide-in-from-right-4 duration-300">
      <SecretsKeysConnections user={sessionUser} config={publicConfig} />
      <div className="space-y-6 border-t border-white/10 pt-8">
        <div>
          <h3 className="text-xl font-headline text-cyan-300 mb-1 flex items-center gap-2">
            <Key className="w-6 h-6" aria-hidden />
            My Secrets
          </h3>
          <p className="text-sm text-slate-500 mb-2">
            Browser-stored keys and variables for{' '}
            <span className="font-mono text-cyan-500/80">{activeProjectKey}</span>. Reveal, copy, edit, or delete each
            row.
          </p>
        </div>
        <ProjectSecretsEditor activeProjectKey={activeProjectKey} />
      </div>
    </div>
  );
}
