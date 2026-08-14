import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FileDown } from 'lucide-react';
import { downloadTechnicalDocumentation } from '../../../lib/technicalDocumentationDownload';
import {
  dispatchGuidedDocsPrompt,
  downloadGuidedDocsStub,
  guidedFinishToDashboard,
} from '../../../lib/guidedFunnel';
import { useIdeShellNav } from './IdeShellNavContext';

/**
 * T5 live URL popup + T6 docs popup + T7 → Dashboard.
 */
export function GuidedFunnelOverlays() {
  const { goToDashboard } = useIdeShellNav();
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsNote, setDocsNote] = useState<string | null>(null);

  useEffect(() => {
    const onUrl = (ev: Event) => {
      const url = (ev as CustomEvent<{ url?: string }>).detail?.url?.trim();
      if (!url) return;
      setDocsOpen(false);
      setLiveUrl(url);
      setCopied(false);
    };
    const onDocs = () => {
      setLiveUrl(null);
      setDocsOpen(true);
      setDocsNote(null);
    };
    window.addEventListener('nebula-guided-live-url', onUrl);
    window.addEventListener('nebula-guided-docs-prompt', onDocs);
    return () => {
      window.removeEventListener('nebula-guided-live-url', onUrl);
      window.removeEventListener('nebula-guided-docs-prompt', onDocs);
    };
  }, []);

  const finishToDashboard = useCallback(() => {
    setLiveUrl(null);
    setDocsOpen(false);
    guidedFinishToDashboard();
    goToDashboard();
  }, [goToDashboard]);

  const afterUrlStep = useCallback(() => {
    setLiveUrl(null);
    dispatchGuidedDocsPrompt();
    setDocsOpen(true);
  }, []);

  const onCopy = useCallback(async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [liveUrl]);

  const onDownloadDocs = useCallback(async () => {
    setDocsBusy(true);
    setDocsNote(null);
    try {
      const result = await downloadTechnicalDocumentation();
      if (!result.ok) {
        downloadGuidedDocsStub();
        setDocsNote('Used placeholder docs (export API unavailable).');
      }
    } catch {
      downloadGuidedDocsStub();
      setDocsNote('Used placeholder docs (export failed).');
    } finally {
      setDocsBusy(false);
      window.setTimeout(() => finishToDashboard(), 400);
    }
  }, [finishToDashboard]);

  if (!liveUrl && !docsOpen) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4">
      {liveUrl ? (
        <div
          className="ide-glass-card w-full max-w-md rounded-lg border border-border p-5 shadow-none"
          role="dialog"
          aria-modal="true"
          aria-label="Temporary live URL"
        >
          <p className="type-section">Your live URL is ready</p>
          <p className="type-label-sm mt-1">
            Temporary Render hostname until a custom domain is configured.
          </p>
          <div className="mt-4 flex min-w-0 items-center gap-2">
            <a
              href={liveUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-xs text-foreground underline-offset-2 hover:underline"
              title={liveUrl}
            >
              {liveUrl}
            </a>
            <button
              type="button"
              title="Copy URL"
              aria-label="Copy URL"
              onClick={() => void onCopy()}
              className="btn-secondary-surface inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={afterUrlStep}
              className="btn-secondary-surface h-9 rounded-md px-3 text-xs"
            >
              Dismiss
            </button>
            <button type="button" onClick={afterUrlStep} className="btn-cyan h-9 rounded-md px-3 text-xs">
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {docsOpen && !liveUrl ? (
        <div
          className="ide-glass-card w-full max-w-md rounded-lg border border-border p-5 shadow-none"
          role="dialog"
          aria-modal="true"
          aria-label="Download technical documentation"
        >
          <p className="type-section">Download technical documentation?</p>
          <p className="type-label-sm mt-1 leading-relaxed">
            Export a Markdown summary of your Master Plan and stack notes.
          </p>
          {docsNote ? (
            <p className="mt-2 text-[11px] text-muted-foreground" role="status">
              {docsNote}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={docsBusy}
              onClick={finishToDashboard}
              className="btn-secondary-surface h-9 rounded-md px-3 text-xs disabled:opacity-40"
            >
              Skip
            </button>
            <button
              type="button"
              disabled={docsBusy}
              onClick={() => void onDownloadDocs()}
              className="btn-cyan inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs disabled:opacity-40"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              {docsBusy ? 'Preparing…' : 'Download'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
