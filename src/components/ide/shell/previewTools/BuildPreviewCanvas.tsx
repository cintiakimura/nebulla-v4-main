import { useCallback, useEffect, useRef, useState } from 'react';
import { withProjectQuery, getBrowserProjectName } from '../../../../lib/nebulaProjectApi';
import { readResponseJson } from '../../../../lib/apiFetch';
import { tryGuidedDoneToCode } from '../../../../lib/guidedFunnel';
import { installPreviewRuntimeMessageListener } from '../../../../lib/previewRuntimeBridge';
import { PreviewEditToolbar, type PreviewToolbarState } from './PreviewEditToolbar';
import { PreviewWaitingThrobber } from './PreviewWaitingThrobber';
import {
  htmlLooksLikeShowablePreview,
  previewMetaHasProductRoutes,
} from '@/lib/workspaceCodedAppUi';
import {
  applyUiStudioBetaToAppPreview,
  NEBULA_STUDIO_SHOW_LIVE_APP,
  NEBULA_UI_STUDIO_BETA_BUSY,
  NEBULA_UI_STUDIO_BETA_COMPLETE,
  runUiStudioBetaGeneration,
} from '../../../../lib/uiStudioBetaEngine';
import { sanitizeUserFacingCopy } from '../../../../../lib/assistantChatSanitize';

export function buildPreviewBootstrapPath(opts: { rev: number; showDraft: boolean }): string {
  const q = `/api/app-preview/bootstrap?_rev=${opts.rev}`;
  return opts.showDraft ? `${q}&surface=mockup` : q;
}

/**
 * Preview column for Build: toolbar fixed above canvas, no outer “Preview” frame.
 * New tool surface — does not modify legacy preview modules.
 */
export function BuildPreviewCanvas() {
  const [rev, setRev] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showMockup, setShowMockup] = useState(true);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [hasVisualPreview, setHasVisualPreview] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [hasMockup, setHasMockup] = useState(false);
  const [liveLoadFailed, setLiveLoadFailed] = useState(false);
  const [waitStatus, setWaitStatus] = useState('Waiting for preview');
  const [previewMode, setPreviewMode] = useState<string | null>(null);
  const retriedLegacyRef = useRef(false);
  const retriedDeniedRef = useRef(false);
  const retriedMockShellRef = useRef(false);
  const keepMockupRef = useRef(false);
  const userPickedDraftRef = useRef(false);
  const [hasSelection] = useState(false);
  const showDraft = showMockup && (hasMockup || userPickedDraftRef.current);
  const src = withProjectQuery(buildPreviewBootstrapPath({ rev, showDraft }));
  const blockingWait = generateBusy || engineBusy;
  const waiting = blockingWait || (!hasVisualPreview && !liveAvailable && !showDraft);

  const bump = useCallback(() => {
    setFailed(false);
    retriedMockShellRef.current = false;
    setRev((n) => n + 1);
  }, []);

  const refreshWaitState = useCallback(async () => {
    try {
      const res = await fetch(withProjectQuery('/api/app-preview/meta'), {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await readResponseJson(res)) as {
        mockupRel?: string | null;
        previewMode?: string;
        previewHonesty?: string;
        previewStatusLabel?: string;
      };
      if (!res.ok) return;
      setPreviewMode(typeof data.previewMode === 'string' ? data.previewMode : null);
      const live = previewMetaHasProductRoutes(data);
      const mockupOnDisk = Boolean(String(data.mockupRel || '').trim());
      setLiveAvailable(live);
      setHasMockup(mockupOnDisk);
      if (live) {
        setHasVisualPreview(true);
        setLiveLoadFailed(false);
        if (!userPickedDraftRef.current) {
          keepMockupRef.current = false;
          setShowMockup(false);
        }
        setWaitStatus(
          sanitizeUserFacingCopy(data.previewStatusLabel || 'App Preview is the coded app'),
        );
        return;
      }
      if (mockupOnDisk) {
        setHasVisualPreview(true);
        if (!userPickedDraftRef.current) setShowMockup(true);
        setWaitStatus('placeholder mockup');
        return;
      }
      if (data.previewMode === 'empty' || data.previewHonesty === 'empty') {
        setHasVisualPreview(false);
      }
      if (data.previewStatusLabel?.trim() && data.previewHonesty !== 'real_routes') {
        setWaitStatus(
          data.previewHonesty === 'mockup_waiting'
            ? 'Waiting for preview'
            : sanitizeUserFacingCopy(data.previewStatusLabel.trim()),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshWaitState();
    const onShowMockup = (ev: Event) => {
      const force = Boolean((ev as CustomEvent<{ force?: boolean }>).detail?.force);
      void (async () => {
        try {
          const res = await fetch(withProjectQuery('/api/app-preview/meta'), {
            credentials: 'include',
            cache: 'no-store',
          });
          const data = (await readResponseJson(res)) as {
            previewHonesty?: string;
            previewMode?: string;
          };
          const live = previewMetaHasProductRoutes(data);
          if (live && !userPickedDraftRef.current) {
            keepMockupRef.current = false;
            setShowMockup(false);
          } else if (!live) {
            if (force) keepMockupRef.current = true;
            setShowMockup(keepMockupRef.current || force || true);
          }
        } catch {
          setShowMockup(!liveAvailable);
        }
        bump();
      })();
    };
    const onShowLive = () => {
      keepMockupRef.current = false;
      userPickedDraftRef.current = false;
      setShowMockup(false);
      setLiveAvailable(true);
      void refreshWaitState().then(() => {
        bump();
      });
    };
    const onBusy = (ev: Event) => {
      const busy = Boolean((ev as CustomEvent<{ busy?: boolean }>).detail?.busy);
      setEngineBusy(busy);
      if (busy) {
        setWaitStatus('Generating UI…');
        setHasVisualPreview(false);
      }
    };
    const onComplete = (ev: Event) => {
      const ok = (ev as CustomEvent<{ ok?: boolean }>).detail?.ok === true;
      setEngineBusy(false);
      if (ok) {
        void refreshWaitState();
        bump();
      }
    };
    const onWaitStatus = (ev: Event) => {
      const status = String((ev as CustomEvent<{ status?: string }>).detail?.status || '').trim();
      if (status) setWaitStatus(status.slice(0, 120));
    };
    window.addEventListener('nebula-files-applied', bump);
    window.addEventListener('nebula-reload-app-preview', bump);
    window.addEventListener('nebula-preview-show-mockup', onShowMockup);
    window.addEventListener(NEBULA_STUDIO_SHOW_LIVE_APP, onShowLive);
    window.addEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
    window.addEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete);
    window.addEventListener('nebula-preview-wait-status', onWaitStatus);
    return () => {
      window.removeEventListener('nebula-files-applied', bump);
      window.removeEventListener('nebula-reload-app-preview', bump);
      window.removeEventListener('nebula-preview-show-mockup', onShowMockup);
      window.removeEventListener(NEBULA_STUDIO_SHOW_LIVE_APP, onShowLive);
      window.removeEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
      window.removeEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete);
      window.removeEventListener('nebula-preview-wait-status', onWaitStatus);
    };
  }, [bump, refreshWaitState]);

  useEffect(() => {
    void refreshWaitState();
  }, [rev, refreshWaitState]);

  useEffect(() => installPreviewRuntimeMessageListener(), []);

  const showLiveApp = useCallback(() => {
    keepMockupRef.current = false;
    userPickedDraftRef.current = false;
    setShowMockup(false);
    setLiveLoadFailed(false);
    setWaitStatus(liveAvailable ? 'App Preview is the coded app' : 'App is not running yet');
    bump();
  }, [bump, liveAvailable]);

  const showCatalogMockup = useCallback(() => {
    userPickedDraftRef.current = true;
    keepMockupRef.current = true;
    setShowMockup(true);
    setWaitStatus(hasMockup ? 'Layout draft' : 'No layout draft yet');
    bump();
  }, [bump, hasMockup]);

  const onGenerateUi = useCallback(async () => {
    if (generateBusy) return;
    setGenerateBusy(true);
    setFailed(false);
    keepMockupRef.current = !liveAvailable;
    userPickedDraftRef.current = false;
    setShowMockup(false);
    setWaitStatus(liveAvailable ? 'Styling the coded app…' : 'Generating UI…');
    if (!liveAvailable) setHasVisualPreview(false);
    try {
      if (liveAvailable) {
        await fetch(withProjectQuery('/api/coded-app/style-pass'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        try {
          window.dispatchEvent(new CustomEvent('nebula-studio-show-live-app'));
        } catch {
          /* ignore */
        }
        await refreshWaitState();
        bump();
        return;
      }
      const result = await runUiStudioBetaGeneration({
        projectName: getBrowserProjectName() || undefined,
        regenerate: true,
        openPane: false,
        uiPhase: 'manual',
        autoTriggered: false,
      });
      if (result.ok) {
        await applyUiStudioBetaToAppPreview(undefined, { preferMockup: true });
      }
      await refreshWaitState();
      bump();
    } finally {
      setGenerateBusy(false);
    }
  }, [bump, generateBusy, liveAvailable, refreshWaitState]);

  const statusLine = generateBusy || engineBusy ? 'Generating UI…' : waitStatus;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PreviewEditToolbar
        hasSelection={hasSelection}
        generateBusy={generateBusy || engineBusy}
        liveAvailable={liveAvailable}
        hasMockup={hasMockup}
        showingMockup={showMockup}
        onGenerateUi={() => void onGenerateUi()}
        onShowLiveApp={showLiveApp}
        onShowCatalogMockup={showCatalogMockup}
        onApplyToAll={(_state: PreviewToolbarState) => {
          /* stub until selection bridge */
        }}
        onDone={() => {
          if (liveAvailable) {
            showLiveApp();
            return;
          }
          tryGuidedDoneToCode();
        }}
        onUndo={() => {
          /* stub */
        }}
        onRedo={() => {
          /* stub */
        }}
      />

      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">
        {!showMockup && (!liveAvailable || liveLoadFailed || failed) && !blockingWait ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background px-6">
            <p className="text-center text-[12px] text-muted-foreground">App is not running yet</p>
            <button
              type="button"
              className="btn-secondary-surface h-8 rounded-md px-3 text-[11px]"
              onClick={() => {
                setFailed(false);
                setLiveLoadFailed(false);
                retriedDeniedRef.current = false;
                void refreshWaitState().then(() => bump());
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {showMockup && !hasMockup && !blockingWait ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background px-6">
            <p className="text-center text-[12px] text-muted-foreground">No layout draft yet</p>
          </div>
        ) : null}
        {waiting ? <PreviewWaitingThrobber status={failed ? "Couldn't load preview" : statusLine} /> : null}
        <iframe
          title={showMockup ? 'Layout draft' : 'Live app'}
          src={src}
          className={waiting ? 'pointer-events-none h-full w-full border-0 bg-transparent opacity-0' : 'h-full w-full border-0 bg-transparent'}
          onError={() => {
            setFailed(true);
            if (!showMockup) setLiveLoadFailed(true);
            setHasVisualPreview(false);
          }}
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              const html = doc?.documentElement?.outerHTML || '';
              if (
                !retriedDeniedRef.current &&
                /Preview access denied|Sign in required for this workspace preview/i.test(html)
              ) {
                retriedDeniedRef.current = true;
                void refreshWaitState().then(() => bump());
                return;
              }
              if (
                !retriedLegacyRef.current &&
                /V0 credits unavailable|basic UI preview/i.test(html)
              ) {
                retriedLegacyRef.current = true;
                setRev((n) => n + 1);
                return;
              }
              const visual = htmlLooksLikeShowablePreview(html);
              setHasVisualPreview(visual);
              if (visual) {
                setFailed(false);
                setLiveLoadFailed(false);
              } else if (!showMockup) {
                setLiveLoadFailed(true);
              }
            } catch {
              if (!showMockup && liveAvailable) setHasVisualPreview(true);
            }
          }}
        />
      </div>
    </div>
  );
}

