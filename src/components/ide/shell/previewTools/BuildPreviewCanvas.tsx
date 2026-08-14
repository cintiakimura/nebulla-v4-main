import { useCallback, useEffect, useRef, useState } from 'react';
import { withProjectQuery, getBrowserProjectName } from '../../../../lib/nebulaProjectApi';
import { readResponseJson } from '../../../../lib/apiFetch';
import { tryGuidedDoneToCode } from '../../../../lib/guidedFunnel';
import { installPreviewRuntimeMessageListener } from '../../../../lib/previewRuntimeBridge';
import { PreviewEditToolbar, type PreviewToolbarState } from './PreviewEditToolbar';
import { PreviewWaitingThrobber } from './PreviewWaitingThrobber';
import {
  applyUiStudioBetaToAppPreview,
  NEBULA_UI_STUDIO_BETA_BUSY,
  NEBULA_UI_STUDIO_BETA_COMPLETE,
  runUiStudioBetaGeneration,
} from '../../../../lib/uiStudioBetaEngine';

function htmlLooksLikeVisualPreview(html: string): boolean {
  const t = String(html || '');
  if (t.length < 80) return false;
  if (/No preview|No index\.html/i.test(t)) return false;
  if (/coded-app-bridge/i.test(t) && !/ui-gen-mockup/i.test(t)) return false;
  return /ui-gen-mockup|shell--phone|data-screen=/i.test(t);
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
  const [waitStatus, setWaitStatus] = useState('Waiting for mockup');
  const retriedLegacyRef = useRef(false);
  const retriedMockShellRef = useRef(false);
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
    const onShowMockup = () => {
      setShowMockup(true);
      bump();
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
        setShowMockup(true);
        bump();
      }
    };
    window.addEventListener('nebula-files-applied', bump);
    window.addEventListener('nebula-reload-app-preview', bump);
    window.addEventListener('nebula-preview-show-mockup', onShowMockup);
    window.addEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
    window.addEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete);
    return () => {
      window.removeEventListener('nebula-files-applied', bump);
      window.removeEventListener('nebula-reload-app-preview', bump);
      window.removeEventListener('nebula-preview-show-mockup', onShowMockup);
      window.removeEventListener(NEBULA_UI_STUDIO_BETA_BUSY, onBusy);
      window.removeEventListener(NEBULA_UI_STUDIO_BETA_COMPLETE, onComplete);
    };
  }, [bump, refreshWaitState]);

  useEffect(() => {
    void refreshWaitState();
  }, [rev, refreshWaitState]);

  useEffect(() => installPreviewRuntimeMessageListener(), []);

  const onGenerateUi = useCallback(async () => {
    if (generateBusy) return;
    setGenerateBusy(true);
    setFailed(false);
    setHasVisualPreview(false);
    setWaitStatus('Generating UI…');
    try {
      const result = await runUiStudioBetaGeneration({
        projectName: getBrowserProjectName() || undefined,
        regenerate: true,
        openPane: false,
        uiPhase: 'manual',
      });
      if (result.ok) {
        await applyUiStudioBetaToAppPreview();
      }
      setShowMockup(true);
      bump();
    } finally {
      setGenerateBusy(false);
    }
  }, [bump, generateBusy]);

  const statusLine = generateBusy || engineBusy ? 'Generating UI…' : waitStatus;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PreviewEditToolbar
        hasSelection={hasSelection}
        generateBusy={generateBusy || engineBusy}
        onGenerateUi={() => void onGenerateUi()}
        onApplyToAll={(_state: PreviewToolbarState) => {
          /* stub until selection bridge */
        }}
        onDone={() => {
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
              const visual = htmlLooksLikeVisualPreview(html);
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

