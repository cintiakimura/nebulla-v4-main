import { useCallback, useEffect, useRef, useState } from 'react';
import { withProjectQuery, getBrowserProjectName } from '../../../../lib/nebulaProjectApi';
import { readResponseJson } from '../../../../lib/apiFetch';
import { tryGuidedDoneToCode } from '../../../../lib/guidedFunnel';
import { installPreviewRuntimeMessageListener } from '../../../../lib/previewRuntimeBridge';
import { PreviewEditToolbar, type PreviewToolbarState } from './PreviewEditToolbar';
import { PreviewWaitingThrobber } from './PreviewWaitingThrobber';
import {
  htmlLooksLikeShowablePreview,
  previewIframeCanRunProduct,
  previewMetaHasProductRoutes,
} from '@/lib/workspaceCodedAppUi';
import {
  applyUiStudioBetaToAppPreview,
  NEBULA_STUDIO_SHOW_LIVE_APP,
  NEBULA_UI_STUDIO_BETA_BUSY,
  NEBULA_UI_STUDIO_BETA_COMPLETE,
  runUiStudioBetaGeneration,
} from '../../../../lib/uiStudioBetaEngine';

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
  const [waitStatus, setWaitStatus] = useState('Waiting for mockup');
  const [previewMode, setPreviewMode] = useState<string | null>(null);
  const retriedLegacyRef = useRef(false);
  const retriedMockShellRef = useRef(false);
  const keepMockupRef = useRef(false);
  const [hasSelection] = useState(false);
  const src = withProjectQuery(
    `/api/app-preview/bootstrap?_rev=${rev}${showMockup ? '&surface=mockup' : ''}`,
  );
  const waiting = !hasVisualPreview || generateBusy || engineBusy;

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
      const iframeRuns = previewIframeCanRunProduct(data);
      const hasMockup = Boolean(String(data.mockupRel || '').trim());
      setLiveAvailable(live);
      if (live) {
        setHasVisualPreview(true);
        if (!iframeRuns || keepMockupRef.current) {
          setShowMockup(true);
          setWaitStatus(
            iframeRuns
              ? 'Catalog mockup — Use app for the clickable practice preview'
              : 'Catalog mockup (Figma/templates). Next/Vite cannot run in this iframe — Open Code for app/.',
          );
          return;
        }
        setWaitStatus('Catalog mockup — Use app for the clickable practice preview');
        return;
      }
      if (hasMockup) {
        setHasVisualPreview(true);
        setShowMockup(true);
        setWaitStatus('Catalog mockup - not the live app');
        return;
      }
      if (data.previewMode === 'empty' || data.previewHonesty === 'empty') {
        setHasVisualPreview(false);
      }
      if (data.previewStatusLabel?.trim() && data.previewHonesty !== 'real_routes') {
        setWaitStatus(
          data.previewHonesty === 'mockup_waiting'
            ? 'Waiting for mockup'
            : data.previewStatusLabel.trim(),
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
      if (force) keepMockupRef.current = true;
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
          setShowMockup(keepMockupRef.current || force || !previewMetaHasProductRoutes(data));
        } catch {
          setShowMockup(true);
        }
        bump();
      })();
    };
    const onShowLive = () => {
      keepMockupRef.current = false;
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
    if (!previewIframeCanRunProduct({ previewMode })) {
      keepMockupRef.current = true;
      setShowMockup(true);
      setWaitStatus(
        'Catalog mockup stays on. This iframe cannot compile Next/Vite — Figma/templates live here, not on Use app.',
      );
      bump();
      return;
    }
    keepMockupRef.current = false;
    setShowMockup(false);
    setWaitStatus('Live app preview');
    bump();
  }, [bump, previewMode]);

  const showCatalogMockup = useCallback(() => {
    keepMockupRef.current = true;
    setShowMockup(true);
    setWaitStatus('Catalog mockup (Figma/templates)');
    bump();
  }, [bump]);

  const onGenerateUi = useCallback(async () => {
    if (generateBusy) return;
    setGenerateBusy(true);
    setFailed(false);
    setHasVisualPreview(false);
    setWaitStatus('Generating UI…');
    keepMockupRef.current = true;
    try {
      const result = await runUiStudioBetaGeneration({
        projectName: getBrowserProjectName() || undefined,
        regenerate: true,
        openPane: false,
        uiPhase: liveAvailable ? 'post_code' : 'manual',
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

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {waiting ? <PreviewWaitingThrobber status={failed ? "Couldn't load preview" : statusLine} /> : null}
        <iframe
          title="App preview"
          src={src}
          className={waiting ? 'pointer-events-none h-full w-full border-0 bg-transparent opacity-0' : 'h-full w-full border-0 bg-transparent'}
          onError={() => {
            setFailed(true);
            setHasVisualPreview(false);
          }}
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              const html = doc?.documentElement?.outerHTML || '';
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
              if (visual) setFailed(false);
            } catch {
              /* cross-origin — keep current wait state */
            }
          }}
        />
      </div>
    </div>
  );
}

