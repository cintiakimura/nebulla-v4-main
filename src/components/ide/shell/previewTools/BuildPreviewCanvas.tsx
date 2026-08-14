import { useCallback, useEffect, useRef, useState } from 'react';
import { withProjectQuery, getBrowserProjectName } from '../../../../lib/nebulaProjectApi';
import { tryGuidedDoneToCode } from '../../../../lib/guidedFunnel';
import { installPreviewRuntimeMessageListener } from '../../../../lib/previewRuntimeBridge';
import { PreviewEditToolbar, type PreviewToolbarState } from './PreviewEditToolbar';
import {
  applyUiStudioBetaToAppPreview,
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
  const retriedLegacyRef = useRef(false);
  const retriedMockShellRef = useRef(false);
  const [hasSelection] = useState(false);
  const src = withProjectQuery(
    `/api/app-preview/bootstrap?_rev=${rev}${showMockup ? '&surface=mockup' : ''}`,
  );

  const bump = useCallback(() => {
    setFailed(false);
    retriedMockShellRef.current = false;
    setRev((n) => n + 1);
  }, []);

  useEffect(() => {
    const onShowMockup = () => {
      setShowMockup(true);
      bump();
    };
    window.addEventListener('nebula-files-applied', bump);
    window.addEventListener('nebula-reload-app-preview', bump);
    window.addEventListener('nebula-preview-show-mockup', onShowMockup);
    return () => {
      window.removeEventListener('nebula-files-applied', bump);
      window.removeEventListener('nebula-reload-app-preview', bump);
      window.removeEventListener('nebula-preview-show-mockup', onShowMockup);
    };
  }, [bump]);

  useEffect(() => installPreviewRuntimeMessageListener(), []);

  const onGenerateUi = useCallback(async () => {
    if (generateBusy) return;
    setGenerateBusy(true);
    setFailed(false);
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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PreviewEditToolbar
        hasSelection={hasSelection}
        generateBusy={generateBusy}
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
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-sm text-muted-foreground">No live preview yet</p>
            <button
              type="button"
              className="btn-secondary-surface rounded-md px-3 py-1.5 text-xs"
              onClick={() => {
                setFailed(false);
                setRev((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <iframe
            title="App preview"
            src={src}
            className="h-full w-full border-0 bg-transparent"
            onError={() => setFailed(true)}
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
                }
              } catch {
                /* cross-origin */
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
