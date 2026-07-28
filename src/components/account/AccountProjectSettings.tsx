import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import {
  loadProjectSettings,
  saveProjectSettings,
  type ProjectSettingsStored,
} from '../../lib/nebulaDashboardStorage';
import { resetProjectFromScratch } from '../../lib/ideProjectReset';
import { ChatModelSelector } from '@/components/settings/ModelSelector';

/** Project settings block shared on the Account page (moved from Dashboard Settings tab). */
export function AccountProjectSettings({
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
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

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

  const handleStartFromScratch = async () => {
    if (
      !window.confirm(
        'Start this project from scratch? This cancels all v0/Go jobs, clears generated code, resets Master Plan, and clears chat history for this project.',
      )
    ) {
      return;
    }
    setResetBusy(true);
    setResetMessage(null);
    const result = await resetProjectFromScratch(projectName);
    setResetBusy(false);
    if (result.error) {
      setResetMessage(result.error);
      return;
    }
    setResetMessage('Project reset — discovery can start fresh. Reloading…');
    window.setTimeout(() => window.location.reload(), 800);
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-5">
      <div className="border-b border-white/10 pb-2">
        <h3 className="text-sm font-headline text-slate-200">Project settings</h3>
        <p className="text-xs text-slate-500 mt-1">
          Identity and paths for the active project (
          <span className="font-mono text-cyan-500/80">{activeProjectKey}</span>
          ). Stored in this browser only until your control plane syncs to Render or your repo.
        </p>
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-4">
        <h4 className="text-sm font-headline text-cyan-200">Model</h4>
        <ChatModelSelector />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
          Project name
        </label>
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
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
          Local folder path
        </label>
        <input
          type="text"
          value={fields.localFolderPath}
          onChange={(e) => setField('localFolderPath', e.target.value)}
          placeholder="/Users/you/projects/my-app or C:\dev\my-app"
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
          GitHub repository
        </label>
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

      <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-4 space-y-3">
        <h4 className="text-sm font-headline text-amber-100">Start from scratch</h4>
        <p className="text-xs text-slate-400 leading-relaxed">
          Cancels all open v0 and Grok Code jobs on the server, clears generated app files, and resets Master Plan to
          empty. Use this when discovery or Go left stale polling / partial output.
        </p>
        {resetMessage ? (
          <p className="text-xs text-amber-200/90" role="status">
            {resetMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleStartFromScratch()}
          disabled={resetBusy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-headline border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
        >
          {resetBusy ? 'Resetting…' : 'Reset project & cancel server jobs'}
        </button>
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
    </section>
  );
}
