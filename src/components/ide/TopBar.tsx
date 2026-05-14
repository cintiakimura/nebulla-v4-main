import { useCallback, useState } from 'react';
import { ChevronDown, FlaskConical, GitBranch, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwarm } from '@/components/swarm/SwarmProvider';
import { getStoredGrokApiKey } from '../../lib/grokKey';
import { runNebulaSwarm } from '../../lib/runNebulaSwarm';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';

const LOGO_URL = '/kyn-logo.png';

const models = [
  { id: 'grok-4.1', name: 'Grok 4.1', badge: 'Latest' as string | null },
  { id: 'grok-3', name: 'Grok 3', badge: null },
];

export function TopBar() {
  const swarm = useSwarm();
  const [selectedModel, setSelectedModel] = useState('grok-4.1');
  const [isModelOpen, setIsModelOpen] = useState(false);
  const [runTestBusy, setRunTestBusy] = useState(false);

  const handleRunAndTest = useCallback(async () => {
    if (runTestBusy || swarm.isRunning) return;
    const projectName = getBrowserProjectName().trim() || 'my-awesome-app';
    const storedGrok = getStoredGrokApiKey();
    const grokHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (storedGrok) grokHeaders['X-Grok-Api-Key'] = storedGrok;

    const runId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `run-test-${Date.now()}`;

    const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
    const rawPaths = w?.nebulaSwarmFocusPaths;
    const focusPaths =
      Array.isArray(rawPaths) && rawPaths.length
        ? (rawPaths as string[]).slice(0, 12)
        : undefined;
    const rawSnip = w?.nebulaSwarmFocusSnippets;
    const focusSnippets =
      rawSnip && typeof rawSnip === 'object' && !Array.isArray(rawSnip)
        ? (rawSnip as Record<string, string>)
        : undefined;

    setRunTestBusy(true);
    swarm.startSwarm(swarm.currentPhase, projectName);
    try {
      const handoff = await runNebulaSwarm(
        {
          phase: swarm.currentPhase,
          userMessage:
            'Manual Run and Test: analyze recently changed files only; provide code review findings and concrete test suggestions. Do not expand scope beyond the paths/snippets provided.',
          projectName,
          runId,
          swarmIntensity: swarm.intensity,
          manualRunAndTest: true,
          ...(focusPaths?.length ? { focusPaths } : {}),
          ...(focusSnippets && Object.keys(focusSnippets).length ? { focusSnippets } : {}),
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
  }, [runTestBusy, swarm]);

  return (
    <div className="surface-active tonal-seam-b flex h-12 flex-col">
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <img
              src={LOGO_URL}
              alt=""
              width={22}
              height={22}
              className="object-contain opacity-90"
              style={{ width: 22, height: 22, background: 'transparent' }}
            />
            <span className="kyn-logotype text-foreground">kyn</span>
          </div>

          <button
            type="button"
            className="btn-secondary-surface type-title-sm hidden items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground sm:flex"
          >
            my-awesome-app
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          <div className="type-label-sm hidden items-center gap-1 tracking-wide md:flex">
            <GitBranch className="h-3 w-3" />
            <span>main</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleRunAndTest}
            disabled={runTestBusy || swarm.isRunning}
            title="Run Quality on recently changed files (manual — one Grok 4.1 call)"
            className="btn-primary-cta type-label-sm flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-0 tracking-wide sm:px-4"
            style={{ fontWeight: 500 }}
          >
            {runTestBusy || swarm.isRunning ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="hidden sm:inline">Run and Test</span>
            <span className="sm:hidden">Test</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelOpen(!isModelOpen)}
              className="btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
              {models.find((m) => m.id === selectedModel)?.name}
              <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isModelOpen && 'rotate-180')} />
            </button>

            {isModelOpen && (
              <div className="elevation-popover absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md p-1">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsModelOpen(false);
                    }}
                    className={cn(
                      'btn-secondary-surface type-label-sm flex w-full items-center justify-between rounded px-2.5 py-1.5',
                      selectedModel === model.id && 'active-tab-sheen text-primary',
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

          <div className="surface-float flex h-7 w-7 items-center justify-center rounded-full">
            <span className="text-[10px] tracking-wide text-foreground" style={{ fontWeight: 500 }}>
              JD
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
