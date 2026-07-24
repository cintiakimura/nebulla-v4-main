import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchJson } from '../../lib/apiFetch';
import { seedBasicUiFallback } from '../../lib/ideArtifactSync';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

type VariationSlot = {
  svg: string;
  source?: string;
  loading?: boolean;
};

const EMPTY_SLOT: VariationSlot = { svg: '' };

function SvgPreview({ svg, label }: { svg: string; label: string }) {
  if (!svg.trim()) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/30 text-[11px] text-slate-500">
        {label} — not generated yet
      </div>
    );
  }
  return (
    <div
      className="h-48 overflow-auto rounded-lg border border-white/10 bg-white/95 p-2"
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label={label}
    />
  );
}

export function UiStudioMockupPanel() {
  const projectName = getBrowserProjectName().trim() || 'Untitled project';
  const [slots, setSlots] = useState<VariationSlot[]>([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  const [selected, setSelected] = useState(0);
  const [editedSvg, setEditedSvg] = useState('');
  const [originalSvg, setOriginalSvg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadApproved = useCallback(async () => {
    try {
      const data = await fetchJson<{ code?: string }>(withProjectQuery('/api/nebula-ui-studio/code'), {
        credentials: 'include',
      });
      const code = data.code?.trim() || '';
      if (code && !code.startsWith('No approved')) {
        setEditedSvg(code);
        setOriginalSvg(code);
        setSlots((prev) => {
          const next = [...prev];
          next[0] = { ...next[0], svg: code };
          return next;
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadApproved();
  }, [loadApproved]);

  useEffect(() => {
    const slot = slots[selected];
    if (slot?.svg) {
      setOriginalSvg(slot.svg);
      setEditedSvg(slot.svg);
    }
  }, [selected, slots]);

  const pagesExcerpt = useCallback(async (): Promise<string> => {
    try {
      const mp = await fetchJson<Record<string, string>>(withProjectQuery('/api/master-plan/read'), {
        credentials: 'include',
      });
      const pages =
        mp['4. Pages and navigation'] ||
        mp['4. Pages and Navigation'] ||
        mp['Pages and navigation'] ||
        '';
      return typeof pages === 'string' ? pages.slice(0, 6000) : '';
    } catch {
      return '';
    }
  }, []);

  const generateVariation = async (index: number) => {
    setBusy(true);
    setError('');
    setStatus(`Generating variation ${index + 1}…`);
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], loading: true };
      return next;
    });
    try {
      const pagesText = await pagesExcerpt();
      const data = await fetchJson<{
        svg?: string;
        source?: string;
        error?: string;
        demoMode?: boolean;
      }>(withProjectQuery('/api/nebula-ui-studio/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({
            variationIndex: index,
            pagesText,
            projectDisplayName: projectName,
          }),
        ),
      });
      const svg = data.svg?.trim() || '';
      if (!svg) throw new Error(data.error || 'No SVG returned');
      setSlots((prev) => {
        const next = [...prev];
        next[index] = { svg, source: data.source, loading: false };
        return next;
      });
      if (index === selected) {
        setOriginalSvg(svg);
        setEditedSvg(svg);
      }
      setStatus(`Variation ${index + 1} ready (${data.source ?? 'engine'}).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generate failed';
      const creditsLike = /credit|quota|billing|v0 unavailable/i.test(msg);
      if (creditsLike) {
        const written = await seedBasicUiFallback(projectName);
        if (written.length > 0) {
          window.dispatchEvent(new CustomEvent('nebula-open-app-preview'));
          setStatus(`V0 credits unavailable — basic preview written (${written.join(', ')}).`);
          setError('');
          setSlots((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], loading: false };
            return next;
          });
          setBusy(false);
          return;
        }
      }
      setError(msg);
      setSlots((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], loading: false };
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const runAnalyze = async () => {
    setBusy(true);
    setError('');
    setStatus('Grok analyzing your edits…');
    try {
      const data = await fetchJson<{ warnings?: string[]; summary?: string }>(
        withProjectQuery('/api/nebula-ui-studio/analyze-edit'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(withProjectBody({ originalCode: originalSvg, editedCode: editedSvg })),
        },
      );
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setSummary(data.summary?.trim() || '');
      setStatus('Analysis complete.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyze failed');
    } finally {
      setBusy(false);
    }
  };

  const runAdapt = async () => {
    setBusy(true);
    setError('');
    setStatus('Grok adapting SVG…');
    try {
      const data = await fetchJson<{ svg?: string; error?: string }>(
        withProjectQuery('/api/nebula-ui-studio/adapt-edit'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(
            withProjectBody({
              editedCode: editedSvg,
              warningsSummary: [...warnings, summary].filter(Boolean).join('\n'),
            }),
          ),
        },
      );
      const svg = data.svg?.trim() || '';
      if (!svg) throw new Error(data.error || 'Adapt returned empty SVG');
      setEditedSvg(svg);
      setSlots((prev) => {
        const next = [...prev];
        next[selected] = { ...next[selected], svg, source: 'grok-adapt' };
        return next;
      });
      setStatus('Adapted SVG ready — review then Approve.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adapt failed');
    } finally {
      setBusy(false);
    }
  };

  const runApprove = async () => {
    setBusy(true);
    setError('');
    setStatus('Saving approved UI to project…');
    try {
      await fetchJson(withProjectQuery('/api/nebula-ui-studio/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ code: editedSvg })),
      });
      setOriginalSvg(editedSvg);
      setStatus('Approved UI saved to nebula-ui-studio.md — Grok chat will use it for coding.');
      try {
        window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="surface-active shrink-0 border-b border-border px-3 py-2.5">
        <h2 className="text-xs font-medium text-foreground">SVG mockups</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Generate directions, edit SVG, then Analyze → Adapt → Approve. Saved to{' '}
          <code className="text-primary/90">nebula-ui-studio.md</code>.
        </p>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">{error}</div>
      ) : null}
      {status ? (
        <div className="shrink-0 border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-50">{status}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              onClick={() => setSelected(i)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                selected === i
                  ? 'active-tab-sheen bg-secondary text-primary'
                  : 'btn-secondary-surface text-muted-foreground hover:text-foreground',
              )}
            >
              Variation {i + 1}
              {slots[i]?.source ? ` · ${slots[i].source}` : ''}
              {slots[i]?.svg ? ' ✓' : ''}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void generateVariation(selected)}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
          >
            {slots[selected]?.loading ? (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 inline h-3 w-3" />
            )}
            Generate selected
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              for (let i = 0; i < 3; i++) await generateVariation(i);
            }}
            className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-100 disabled:opacity-40"
          >
            <Sparkles className="mr-1 inline h-3 w-3" />
            Generate all 3
          </button>
        </div>

        <SvgPreview svg={slots[selected]?.svg ?? ''} label={`Variation ${selected + 1}`} />

        <label className="block text-[11px] text-slate-400">
          Manual edits (SVG)
          <textarea
            className="mt-1 h-40 w-full resize-y rounded-lg border border-white/10 bg-[#0a1628] p-2 font-mono text-[11px] text-slate-200"
            value={editedSvg}
            onChange={(e) => setEditedSvg(e.target.value)}
            spellCheck={false}
          />
        </label>

        {warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-100/90">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            disabled={busy || !editedSvg.trim()}
            onClick={() => void runAnalyze()}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40"
          >
            Analyze edits
          </button>
          <button
            type="button"
            disabled={busy || !editedSvg.trim()}
            onClick={() => void runAdapt()}
            className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
          >
            Adapt with Grok
          </button>
          <button
            type="button"
            disabled={busy || !editedSvg.trim()}
            onClick={() => void runApprove()}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-headline text-black disabled:opacity-40"
          >
            <Check className="mr-1 inline h-3.5 w-3.5" />
            Approve &amp; save
          </button>
        </div>
      </div>
    </div>
  );
}
