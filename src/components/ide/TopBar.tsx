import { useCallback, useRef, useState } from 'react';
import { ChevronDown, Copy, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwarm } from '@/components/swarm/SwarmProvider';
import { Logo } from '@/components/Logo';
import { runNebulaSwarm } from '../../lib/runNebulaSwarm';
import { getBrowserProjectName, withProjectQuery } from '../../lib/nebulaProjectApi';
import { readResponseJson } from '../../lib/apiFetch';
import { useClickOutside } from '../../lib/useClickOutside';
import { type IdeChatModelId, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { buildIdeSwarmFocusFromEditor } from '../../lib/ideSwarmFocus';
import { fetchMasterPlanAndUiStudio } from '../../lib/ideAssistantGrokChat';
import { compactMasterPlanForInspect } from '../../lib/ideMasterPlanSummary';

const models: { id: IdeChatModelId; name: string; badge: string | null }[] = [
  { id: 'grok-4.1', name: 'Grok 4.1', badge: 'Latest' },
];

export function TopBar({
  workspaceLabel,
  onSwitchWorkspace,
  onOpenAccount,
  onOpenSourceControl,
}: {
  /** Active cloud/local project name from workspace gate. */
  workspaceLabel?: string;
  /** Re-open project picker (sign-in / switch project). */
  onSwitchWorkspace?: () => void;
  /** Opens My services (API keys, GitHub, etc.). */
  onOpenAccount?: () => void;
  /** Opens Source Control (git status & workspace files). */
  onOpenSourceControl?: () => void;
}) {
  const swarm = useSwarm();
  const { chatModel, setChatModel, activePath, activeTab, gitBranch } = useIdeWorkspace();
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [runTestBusy, setRunTestBusy] = useState(false);
  const [projectCopied, setProjectCopied] = useState(false);
  const modelWrapRef = useRef<HTMLDivElement>(null);

  const projectName = workspaceLabel?.trim() || getBrowserProjectName().trim() || 'Untitled project';

  const closeModelMenu = useCallback(() => setIsModelOpen(false), []);
  useClickOutside(modelWrapRef, closeModelMenu, isModelOpen);

  const handleRunAndTest = useCallback(async () => {
    if (runTestBusy || swarm.isRunning) return;
    const name = getBrowserProjectName().trim() || 'my-awesome-app';
    let hasServerKey = false;
    try {
      const r = await fetch(withProjectQuery('/api/config'));
      const cfg = (await readResponseJson(r)) as { hasGrokSwarmApiKey?: boolean };
      hasServerKey = r.ok && Boolean(cfg.hasGrokSwarmApiKey);
    } catch {
      hasServerKey = false;
    }
    if (!hasServerKey) {
      swarm.addActivity(
        'Inspect requires GROK_SWARM_API_KEY (20+ characters) in the server .env — normal IDE chat uses GROK_API_KEY_LUMEN only.',
        'error',
      );
      return;
    }

    const grokHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    const runId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `run-test-${Date.now()}`;

    const focus = buildIdeSwarmFocusFromEditor(
      activePath,
      activeTab?.content ?? '',
      Boolean(activeTab?.loading),
    );
    if (!focus.focusPaths?.length) {
      swarm.addActivity('No file open in the editor — open a file so Inspect can scope review to your code.', 'warning');
    }

    let planningSummary = '';
    try {
      const { latestMP } = await fetchMasterPlanAndUiStudio();
      planningSummary = compactMasterPlanForInspect(latestMP).slice(0, 2000);
    } catch {
      /* same as chat: handoff still runs with workspace-only context */
    }

    setRunTestBusy(true);
    swarm.startSwarm(swarm.currentPhase, name);
    try {
      const handoff = await runNebulaSwarm(
        {
          phase: swarm.currentPhase,
          userMessage:
            'Manual Inspect (Quality): analyze recently changed files only; provide code review findings and concrete test suggestions. Do not expand scope beyond the paths/snippets provided.',
          projectName: name,
          runId,
          swarmIntensity: swarm.intensity,
          manualRunAndTest: true,
          ...(planningSummary ? { contextSummary: planningSummary } : {}),
          ...(focus.focusPaths?.length ? { focusPaths: focus.focusPaths } : {}),
          ...(focus.focusSnippets && Object.keys(focus.focusSnippets).length ? { focusSnippets: focus.focusSnippets } : {}),
        },
        grokHeaders,
      );
      swarm.finishSwarm(handoff);
    } catch (e) {
      swarm.cancelSwarmRun();
      swarm.addActivity(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setRunTestBusy(false);
    }
  }, [runTestBusy, swarm, activePath, activeTab?.content, activeTab?.loading]);

  const copyProjectName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(projectName);
      setProjectCopied(true);
      window.setTimeout(() => setProjectCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [projectName]);

  return (
    <div className="surface-active tonal-seam-b flex h-12 flex-col">
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <Logo className="h-[22px] w-[22px] shrink-0 opacity-95" />
            <span className="app-logotype text-foreground">Nebulla.beta</span>
          </div>

          <button
            type="button"
            onClick={() => (onSwitchWorkspace ? onSwitchWorkspace() : void copyProjectName())}
            title={
              onSwitchWorkspace
                ? 'Switch or create project'
                : projectCopied
                  ? 'Copied!'
                  : 'Active project — click to copy name'
            }
            className="btn-secondary-surface type-title-sm hidden max-w-[220px] items-center gap-1.5 truncate rounded-md px-2 py-1 text-muted-foreground sm:flex"
          >
            <span className="truncate">{projectName}</span>
            {onSwitchWorkspace ? (
              <span className="shrink-0 text-[10px] text-primary/80">Switch</span>
            ) : projectCopied ? (
              <span className="shrink-0 text-[10px] text-primary">Copied</span>
            ) : (
              <Copy className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenSourceControl?.()}
            disabled={!onOpenSourceControl}
            title={
              onOpenSourceControl
                ? gitBranch
                  ? `Source control · ${gitBranch}`
                  : 'Source control'
                : undefined
            }
            aria-label="Open source control"
            className="btn-secondary-surface type-label-sm hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:inline-flex"
          >
            <GitBranch className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleRunAndTest}
            disabled={runTestBusy || swarm.isRunning}
            title="Inspect — Quality agent (GROK_SWARM_API_KEY + grok-3-mini by default)"
            aria-busy={runTestBusy || swarm.isRunning}
            className="btn-primary-cta type-label-sm flex h-9 min-w-[5.5rem] shrink-0 items-center justify-center rounded-md px-3 py-0 tracking-wide sm:px-4"
            style={{ fontWeight: 500 }}
          >
            <span>{runTestBusy || swarm.isRunning ? 'Running…' : 'Inspect'}</span>
          </button>

          <div className="relative" ref={modelWrapRef}>
            <button
              type="button"
              onClick={() => setIsModelOpen(!isModelOpen)}
              className="btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              {models.find((m) => m.id === chatModel)?.name}
              <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isModelOpen && 'rotate-180')} />
            </button>

            {isModelOpen && (
              <div className="elevation-popover absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md p-1">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setChatModel(model.id);
                      setIsModelOpen(false);
                    }}
                    className={cn(
                      'btn-secondary-surface type-label-sm flex w-full items-center justify-between rounded px-2.5 py-1.5',
                      chatModel === model.id && 'active-tab-sheen text-primary',
                    )}
                  >
                    <span>{model.name}</span>
                    {model.badge && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] text-primary" style={{ fontWeight: 500 }}>
                        {model.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenAccount}
            title="Account & My services"
            aria-label="Account and My services"
            className="surface-float flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!onOpenAccount}
          >
            <span className="text-[10px] tracking-wide text-foreground" style={{ fontWeight: 500 }}>
              NB
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
