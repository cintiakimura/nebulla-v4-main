import React, { useEffect, useState } from 'react';
import {
  Github,
  FolderOpen,
  Trash2,
  Sparkles,
  Users,
  FileText,
  Upload,
  Save,
  Globe,
  Plus,
  MoreHorizontal,
  Copy,
  Pencil,
  Eye,
  EyeOff,
  History,
  Settings,
  Key,
} from 'lucide-react';
import { VersionHistoryModal } from './VersionHistoryModal';
import {
  loadProjectSecrets,
  saveProjectSecrets,
  newSecretId,
  loadProjectSettings,
  saveProjectSettings,
  type SecretEntry,
  type SecretCategory,
  type ProjectSettingsStored,
} from '../lib/nebulaDashboardStorage';
import { ChatModelSelector, AgentsHandoffPref } from '@/components/settings/ModelSelector';
import { SwarmToggle } from '@/components/swarm/SwarmToggle';

export type DashboardTab = 'projects' | 'project-settings' | 'secrets' | 'dns';

const DASH_TABS: { id: DashboardTab; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'project-settings', label: 'Settings' },
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
          {activeTab === 'project-settings' && (
            <ProjectSettingsTab
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              activeProjectKey={activeProjectKey}
            />
          )}
          {activeTab === 'secrets' && <SecretsTab activeProjectKey={activeProjectKey} />}
          {activeTab === 'dns' && <DnsTab />}
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
              <p className="text-xs text-slate-500">Have a short conversation with Nebula, then we auto-generate the full app</p>
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

function ProjectSettingsTab({
  projectName,
  onProjectNameChange,
  activeProjectKey,
}: {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  activeProjectKey: string;
}) {
  const [fields, setFields] = useState<ProjectSettingsStored>(() => loadProjectSettings(activeProjectKey));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setFields(loadProjectSettings(activeProjectKey));
  }, [activeProjectKey]);

  const setField = <K extends keyof ProjectSettingsStored>(key: K, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveProjectSettings(activeProjectKey, fields);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300 max-w-3xl">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Project Settings</h3>
        <p className="text-sm text-slate-500 mb-6">
          Identity and paths for the active project (<span className="font-mono text-cyan-500/80">{activeProjectKey}</span>
          ). Stored in this browser only until your control plane syncs to Render or your repo.
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-4">
          <h4 className="text-sm font-headline text-cyan-200">Model & agents</h4>
          <ChatModelSelector />
          <AgentsHandoffPref />
          <SwarmToggle />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Project name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="Untitled Project"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
          />
          <p className="text-[11px] text-slate-600 mt-1">Shown in the header and assistant; same as My Projects rename.</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Local folder path</label>
          <input
            type="text"
            value={fields.localFolderPath}
            onChange={(e) => setField('localFolderPath', e.target.value)}
            placeholder="/Users/you/projects/my-app or C:\dev\my-app"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">GitHub repository</label>
          <input
            type="text"
            value={fields.githubRepository}
            onChange={(e) => setField('githubRepository', e.target.value)}
            placeholder="https://github.com/org/repo or org/repo"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
            Client ID (Render workspace ID)
          </label>
          <input
            type="text"
            value={fields.renderWorkspaceId}
            onChange={(e) => setField('renderWorkspaceId', e.target.value)}
            placeholder="Render workspace_id — server-side only in production"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
          <p className="text-[11px] text-slate-600 mt-1">Internal Render workspace identifier for this tenant boundary.</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
            Project ID (Render project / service ID)
          </label>
          <input
            type="text"
            value={fields.renderProjectId}
            onChange={(e) => setField('renderProjectId', e.target.value)}
            placeholder="Nebulla project id or Render service id"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-headline bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25"
          >
            <Save className="w-4 h-4" />
            {savedFlash ? 'Saved' : 'Save project settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DnsTab() {
  const [customDomain, setCustomDomain] = useState('');

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1 flex items-center gap-2">
          <Globe className="w-6 h-6" />
          DNS & domain
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Point your domain at the deployed Render service. Values here are for planning only until your control plane syncs them to Render.
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

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-sm text-slate-300 space-y-3">
        <p className="font-headline text-cyan-200">Typical setup</p>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <strong className="text-slate-300">Apex / root domain:</strong> use Render’s recommended ALIAS/ANAME or flattened CNAME to your service hostname (see Render dashboard for the exact target).
          </li>
          <li>
            <strong className="text-slate-300">Subdomain:</strong> add a <code className="text-cyan-300/90">CNAME</code> from your subdomain to the Render service hostname shown for this project.
          </li>
          <li>
            After DNS propagates, set <code className="text-cyan-300/90">PUBLIC_SITE_URL</code> on the Web Service to the final HTTPS origin and redeploy.
          </li>
        </ul>
      </div>
    </div>
  );
}

function ProjectSecretsEditor({ activeProjectKey }: { activeProjectKey: string }) {
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const persist = (next: SecretEntry[]) => {
    setEntries(next);
    saveProjectSecrets(activeProjectKey, next);
  };

  useEffect(() => {
    setEntries(loadProjectSecrets(activeProjectKey));
    setRevealedId(null);
    setRowMenuId(null);
    setCopiedId(null);
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

  const patchEntry = (id: string, patch: Partial<Pick<SecretEntry, 'name' | 'value'>>) => {
    persist(entries.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const cleanupEmptyRow = (id: string) => {
    const row = entries.find((x) => x.id === id);
    if (!row || row.name.trim() || row.value.trim()) return;
    persist(entries.filter((x) => x.id !== id));
    if (revealedId === id) setRevealedId(null);
  };

  const removeOne = (id: string) => {
    persist(entries.filter((x) => x.id !== id));
    if (revealedId === id) setRevealedId(null);
    setRowMenuId(null);
  };

  const addRow = () => {
    const id = newSecretId();
    persist([
      ...entries,
      {
        id,
        name: '',
        value: '',
        category: 'variable' as SecretCategory,
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
      <ul className="space-y-3">
        {entries.map((e) => (
          <li
            key={e.id}
            className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col sm:flex-row sm:items-center gap-3"
          >
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
                onBlur={() => cleanupEmptyRow(e.id)}
                placeholder="Secret value"
                autoComplete="off"
                className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
              />
              <button
                type="button"
                onClick={() => setRevealedId((prev) => (prev === e.id ? null : e.id))}
                className="shrink-0 p-2 rounded-lg border border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors"
                title={revealedId === e.id ? 'Hide secret' : 'Reveal secret'}
                aria-pressed={revealedId === e.id}
              >
                {revealedId === e.id ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
              </button>
              <div className="relative shrink-0" data-nebulla-secret-menu>
                <button
                  type="button"
                  onClick={() => setRowMenuId((id) => (id === e.id ? null : e.id))}
                  className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-cyan-200 hover:border-cyan-500/30"
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
          </li>
        ))}
      </ul>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-white/10 rounded-lg">
          No secrets yet. Add a row to store API keys or env variables (this browser only).
        </p>
      ) : null}

      <div className="flex justify-start">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-headline border border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add secret
        </button>
      </div>
    </div>
  );
}

function SecretsTab({ activeProjectKey }: { activeProjectKey: string }) {
  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <ProjectSecretsEditor activeProjectKey={activeProjectKey} />
    </div>
  );
}
