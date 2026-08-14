import { useEffect, useRef, useState } from 'react';
import { withProjectQuery } from '../../../../lib/nebulaProjectApi';
import { tryGuidedDoneToCode } from '../../../../lib/guidedFunnel';
import { installPreviewRuntimeMessageListener } from '../../../../lib/previewRuntimeBridge';
import { PreviewEditToolbar, type PreviewToolbarState } from './PreviewEditToolbar';

/**
 * Preview column for Build: toolbar fixed above canvas, no outer “Preview” frame.
 * New tool surface — does not modify legacy preview modules.
 */
export function BuildPreviewCanvas() {
  const [rev, setRev] = useState(0);
  const [failed, setFailed] = useState(false);
  const retriedLegacyRef = useRef(false);
  const retriedMockShellRef = useRef(false);
  const [hasSelection] = useState(false);
  const src = withProjectQuery(`/api/app-preview/bootstrap?_rev=${rev}`);

  useEffect(() => {
    const bump = () => {
      setFailed(false);
      retriedMockShellRef.current = false;
      setRev((n) => n + 1);
    };
    window.addEventListener('nebula-files-applied', bump);
    window.addEventListener('nebula-reload-app-preview', bump);
    return () => {
      window.removeEventListener('nebula-files-applied', bump);
      window.removeEventListener('nebula-reload-app-preview', bump);
    };
  }, []);

  useEffect(() => installPreviewRuntimeMessageListener(), []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PreviewEditToolbar
        hasSelection={hasSelection}
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
                  return;
                }
                if (
                  !retriedMockShellRef.current &&
                  /interactive-product-preview|Who are you today\?/i.test(html)
                ) {
                  retriedMockShellRef.current = true;
                  setRev((n) => n + 1);
                  return;
                }
                const bodyText = doc?.body?.innerText?.trim() || '';
                if (/no preview|not found|error/i.test(bodyText) && bodyText.length < 200) {
                  setFailed(true);
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
