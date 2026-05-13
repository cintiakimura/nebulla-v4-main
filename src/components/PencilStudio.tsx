import React, { useEffect, useRef, useState } from 'react';
import {
  Rocket,
  ArrowRight,
  CheckCircle,
  Palette,
  Check,
  Type,
  Image as ImageIcon,
  MousePointer2,
  Layers,
  Maximize2,
  Move,
  Loader2,
  AlertTriangle,
  Save,
  Sparkles,
} from 'lucide-react';
import { getStoredGrokApiKey } from '../lib/grokKey';
import { withProjectBody, withProjectQuery } from '../lib/nebulaProjectApi';

type Step = 'branding' | 'generating' | 'review' | 'pencil' | 'final';

/** One mockup slot: image URL for preview + raw SVG for approve (no shared mutable state). */
type GenerationSlot = { dataUrl: string; svg: string; demoMode?: boolean };

interface Branding {
  appName: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  style: string;
}

function svgToDataUrl(svgCode: string): string {
  const svg = svgCode.trim();
  const base64Svg = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64Svg}`;
}

export function PencilStudio({
  onLock,
  pagesText,
  onBeforeGenerate,
  pencilMockupsReady = false,
  nebulaUiStudioDemo = false,
}: {
  onLock: () => void;
  pagesText: string;
  /** Optional hook when the user starts generation (e.g. open related docs in the IDE). */
  onBeforeGenerate?: () => void;
  /** From /api/config — live Pencil.dev API key present on server. */
  pencilMockupsReady?: boolean;
  /** From /api/config — server will return bundled demo SVGs (no external Pencil call). */
  nebulaUiStudioDemo?: boolean;
}) {
  const [step, setStep] = useState<Step>('branding');
  const [generations, setGenerations] = useState<GenerationSlot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');
  const [branding, setBranding] = useState<Branding>({
    appName: '',
    logo: null,
    primaryColor: '#00ffff',
    secondaryColor: '#60009f',
    style: 'Modern & Minimal',
  });
  const [pencilElements] = useState<{ id: string; x: number; y: number; label: string }[]>([
    { id: '1', x: 100, y: 100, label: 'Header' },
    { id: '2', x: 100, y: 200, label: 'Hero Section' },
    { id: '3', x: 100, y: 400, label: 'Feature Grid' },
    { id: '4', x: 100, y: 600, label: 'Footer' },
  ]);
  const [regenerateCount, setRegenerateCount] = useState(0);
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [codeSaved, setCodeSaved] = useState('');
  const [firstGenComplete, setFirstGenComplete] = useState(false);
  const [saveModal, setSaveModal] = useState<{
    warnings: string[];
    summary: string;
    analyzing: boolean;
  } | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [editorHeight, setEditorHeight] = useState(260);
  const editorDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = codeDraft !== codeSaved;
  const grokKey = typeof localStorage !== 'undefined' ? getStoredGrokApiKey() : undefined;
  const manualToolsEnabled = firstGenComplete && step === 'pencil';

  const persistHeaders = (): Record<string, string> => {
    const k = getStoredGrokApiKey();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (k) h['x-grok-api-key'] = k;
    return h;
  };

  const generateMockup = async (variationIndex: number): Promise<GenerationSlot> => {
    setError('');
    const response = await fetch(withProjectQuery('/api/nebula-ui-studio/generate'), {
      method: 'POST',
      headers: persistHeaders(),
      body: JSON.stringify(
        withProjectBody({
          pagesText,
          branding,
          variationIndex,
          grokApiKey: getStoredGrokApiKey(),
        }),
      ),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nebulla UI Studio Engine Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const demoMode = Boolean(data.demoMode);
    let svgCode = data.svg || data.choices?.[0]?.message?.content || '';
    svgCode = String(svgCode)
      .replace(/```xml/g, '')
      .replace(/```svg/g, '')
      .replace(/```/g, '')
      .trim();
    const svgMatch = svgCode.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) svgCode = svgMatch[0];
    if (!svgCode || !/<svg/i.test(svgCode)) {
      svgCode = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect fill="#0e273d" width="400" height="280"/><text x="50%" y="50%" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle" dominant-baseline="middle">Preview unavailable — configure GROK_API_KEY or PENCIL_API_KEY on the server.</text></svg>`;
    }
    return { dataUrl: svgToDataUrl(svgCode), svg: svgCode, demoMode };
  };

  const startInitialGenerations = async () => {
    onBeforeGenerate?.();
    setStep('generating');
    setFirstGenComplete(false);
    try {
      const results = await Promise.all([generateMockup(0), generateMockup(1), generateMockup(2)]);
      setGenerations(results);
      setRegenerateCount(0);
      setFirstGenComplete(true);
      setStep('review');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate mockups. Please try again.');
      setGenerations([]);
      setFirstGenComplete(false);
      setStep('review');
    }
  };

  const handleChooseDesign = (index: number) => {
    setCurrentIndex(index);
    const slot = generations[index];
    if (slot?.svg) {
      setGeneratedCode(slot.svg);
      setCodeDraft(slot.svg);
      setCodeSaved(slot.svg);
    }
    setStep('pencil');
  };

  const handleBrandingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startInitialGenerations();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return alert('Only PNG and JPG files are accepted.');
    if (file.size > 5 * 1024 * 1024) return alert('File size must be less than 5MB.');
    const reader = new FileReader();
    reader.onload = (event) => setBranding({ ...branding, logo: event.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleFinalApproval = () => {
    if (dirty) {
      setError('Save your manual edits (Save changes) before approving the UI.');
      return;
    }
    setError('');
    fetch(withProjectQuery('/api/nebula-ui-studio/approve'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withProjectBody({ code: codeSaved || generatedCode })),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || 'Failed to save approved code');
        }
        setStep('final');
        setTimeout(() => onLock(), 2000);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to save approved code'));
  };

  const handleRegenerate = async () => {
    if (!firstGenComplete) return;
    if (regenerateCount >= 3) return;
    try {
      const regenerated = await generateMockup(currentIndex);
      setGenerations((prev) => {
        const next = [...prev];
        next[currentIndex] = regenerated;
        return next;
      });
      setGeneratedCode(regenerated.svg);
      setCodeDraft(regenerated.svg);
      setCodeSaved(regenerated.svg);
      setRegenerateCount((v) => v + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate design');
    }
  };

  const requestSaveAnalysis = async () => {
    if (!dirty) return;
    setSaveModal({ warnings: [], summary: '', analyzing: true });
    try {
      const res = await fetch(withProjectQuery('/api/nebula-ui-studio/analyze-edit'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            originalCode: codeSaved,
            editedCode: codeDraft,
            grokApiKey: getStoredGrokApiKey(),
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setSaveModal({
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        summary: typeof data.summary === 'string' ? data.summary : '',
        analyzing: false,
      });
    } catch (e: unknown) {
      setSaveModal({
        warnings: [e instanceof Error ? e.message : 'Analysis failed'],
        summary: '',
        analyzing: false,
      });
    }
  };

  const applyDraft = (finalSvg: string) => {
    const trimmed = finalSvg.trim();
    setCodeSaved(trimmed);
    setCodeDraft(trimmed);
    setGeneratedCode(trimmed);
    setGenerations((prev) => {
      const next = [...prev];
      if (next[currentIndex]) {
        next[currentIndex] = { ...next[currentIndex], svg: trimmed, dataUrl: svgToDataUrl(trimmed) };
      }
      return next;
    });
    setSaveModal(null);
    setError('');
  };

  const handleApplySavedUseRaw = () => {
    applyDraft(codeDraft);
  };

  const handleApplySavedWithAdapt = async () => {
    setApplyBusy(true);
    try {
      const warnText = saveModal ? [...saveModal.warnings, saveModal.summary].filter(Boolean).join('\n') : '';
      const res = await fetch(withProjectQuery('/api/nebula-ui-studio/adapt-edit'), {
        method: 'POST',
        headers: persistHeaders(),
        body: JSON.stringify(
          withProjectBody({
            editedCode: codeDraft,
            warningsSummary: warnText,
            grokApiKey: getStoredGrokApiKey(),
          }),
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Adapt failed');
      if (typeof data.svg === 'string' && data.svg.trim()) {
        applyDraft(data.svg);
      } else {
        applyDraft(codeDraft);
      }
    } catch {
      applyDraft(codeDraft);
    } finally {
      setApplyBusy(false);
    }
  };

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const d = editorDragRef.current;
      if (!d) return;
      const delta = ev.clientY - d.startY;
      const next = Math.min(520, Math.max(180, d.startHeight + delta));
      setEditorHeight(next);
    };
    const onUp = () => {
      if (!editorDragRef.current) return;
      editorDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-0 h-full w-full bg-[#020810] overflow-hidden">
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-8 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Palette className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-headline text-cyan-100">Nebulla UI Studio</h2>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center relative">
        {step === 'branding' && (
          <div className="w-full max-w-2xl flex flex-col gap-8">
            <form onSubmit={handleBrandingSubmit} className="flex flex-col gap-6 glass-panel p-8 rounded-2xl border border-white/10">
              {nebulaUiStudioDemo && !pencilMockupsReady ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-100/95 leading-relaxed">
                  <span className="font-headline text-amber-50">Demo layouts.</span> You&apos;re seeing sample screens. Add{' '}
                  <code className="text-amber-200/90">GROK_API_KEY</code> on the server or save your key under Dashboard → Secrets for
                  real AI mockups.
                </div>
              ) : pencilMockupsReady && !grokKey && !nebulaUiStudioDemo ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[12px] text-slate-300 leading-relaxed">
                  Optional: add <code className="text-cyan-300/90">GROK_API_KEY</code> (server or Dashboard → Secrets) so layouts are
                  generated with AI first; Pencil stays available as a fallback.
                </div>
              ) : null}
              <p className="text-sm text-slate-400 leading-relaxed">
                <strong className="text-cyan-300/90">Nebulla UI Studio</strong> drafts screen mockups from your app name, optional
                logo, and mind-map flow. You get three variations to compare—then you can fine-tune and approve one for your project.
              </p>
              <input
                required
                value={branding.appName}
                onChange={(e) => setBranding({ ...branding, appName: e.target.value })}
                placeholder="App name"
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-200"
              />
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept=".png,.jpg,.jpeg" className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-cyan-400">
                {branding.logo ? 'Change Logo' : 'Upload Logo'}
              </button>
              <button type="submit" className="mt-4 w-full py-4 bg-cyan-500 text-black rounded-xl font-headline flex items-center justify-center gap-2">
                Generate 3 layouts <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md text-center">
            <div className="w-24 h-24 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <Rocket className="w-8 h-8 text-cyan-400" />
            <p className="text-sm text-slate-400">Creating three layout options…</p>
          </div>
        )}
        {step === 'review' && (
          <div className="w-full max-w-6xl flex flex-col gap-8">
            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">{error}</div>}
            {generations.length === 0 && (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-slate-400 text-sm text-center max-w-md">
                  No mockups were generated. Ensure <code className="text-cyan-400">GROK_API_KEY</code> (recommended) or{' '}
                  <code className="text-cyan-400">PENCIL_API_KEY</code> is set on the server, or enable demo SVGs. Then retry.
                </p>
                <button
                  type="button"
                  onClick={() => setStep('branding')}
                  className="px-6 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-sm font-headline"
                >
                  Back to branding
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {generations.map((gen, idx) => (
                <div key={idx} className="p-4 rounded-2xl border border-white/5" onClick={() => setCurrentIndex(idx)}>
                  <img src={gen.dataUrl} alt={`Variation ${idx + 1}`} className="w-full min-h-[160px] object-contain bg-[#0a1628]/60 rounded-lg" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChooseDesign(idx);
                    }}
                    className="w-full mt-3 py-3 rounded-xl font-headline text-sm flex items-center justify-center gap-2 bg-cyan-500 text-black"
                  >
                    <CheckCircle className="w-4 h-4" /> Choose this design
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={!firstGenComplete || regenerateCount >= 3 || generations.length === 0}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                title={!firstGenComplete ? 'Wait for the first generation to finish' : undefined}
              >
                Regenerate active slot ({regenerateCount}/3)
              </button>
            </div>
          </div>
        )}
        {step === 'pencil' && (
          <div className="w-full max-w-[1200px] flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
              <div>
                <h2 className="text-xl font-headline text-slate-100">Refine your mockup</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Edit the SVG, use <strong className="text-slate-400">Save changes</strong> to refresh the preview, then approve when
                  ready.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void requestSaveAnalysis()}
                  disabled={!manualToolsEnabled || !dirty || Boolean(saveModal?.analyzing)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-headline border border-cyan-500/35 text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saveModal?.analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={handleFinalApproval}
                  disabled={dirty || !codeSaved.trim()}
                  className="px-6 py-2 bg-emerald-500 text-black rounded-full font-headline inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" /> Approve UI/UX
                </button>
              </div>
            </div>

            {error && <div className="p-3 bg-amber-500/10 border border-amber-500/25 text-amber-100 text-sm rounded-lg">{error}</div>}

            <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
              <div
                className={`w-full lg:w-14 bg-white/5 border border-white/10 rounded-2xl flex lg:flex-col items-center justify-center lg:justify-start p-2 lg:py-6 gap-2 lg:gap-4 shrink-0 ${
                  !manualToolsEnabled ? 'opacity-40 pointer-events-none' : ''
                }`}
                title={!manualToolsEnabled ? 'Available after the first Grok generation completes' : undefined}
              >
                <button type="button" className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300 pointer-events-none" disabled={!manualToolsEnabled}>
                  <MousePointer2 className="w-5 h-5" />
                </button>
                <button type="button" className="p-2 rounded-lg text-slate-500 pointer-events-none" disabled={!manualToolsEnabled}>
                  <Move className="w-5 h-5" />
                </button>
                <button type="button" className="p-2 rounded-lg text-slate-500 pointer-events-none" disabled={!manualToolsEnabled}>
                  <Type className="w-5 h-5" />
                </button>
                <button type="button" className="p-2 rounded-lg text-slate-500 pointer-events-none" disabled={!manualToolsEnabled}>
                  <Layers className="w-5 h-5" />
                </button>
                <button type="button" className="p-2 rounded-lg text-slate-500 pointer-events-none" disabled={!manualToolsEnabled}>
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {dirty && <span className="text-amber-300/90 font-headline">Unsaved edits — save before approving.</span>}
                  {!dirty && <span className="text-emerald-400/90">Draft matches saved preview.</span>}
                </div>
                <textarea
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  disabled={!manualToolsEnabled}
                  spellCheck={false}
                  className="w-full font-mono text-[11px] leading-relaxed bg-[#0a1628]/95 border border-white/10 rounded-xl p-4 text-slate-200 focus:border-cyan-500/40 outline-none resize-none disabled:opacity-40"
                  style={{ height: `${editorHeight}px` }}
                  placeholder="SVG for this screen — edit here, then Save changes."
                />
                <div
                  className="h-1.5 -mt-1 -mb-1 rounded bg-white/10 hover:bg-cyan-500/40 cursor-row-resize transition-colors"
                  onMouseDown={(ev) => {
                    editorDragRef.current = { startY: ev.clientY, startHeight: editorHeight };
                    document.body.style.cursor = 'row-resize';
                    document.body.style.userSelect = 'none';
                  }}
                  title="Drag to resize editor and preview"
                />
                <div className="flex-1 bg-[#0a1628]/90 rounded-2xl border border-white/5 overflow-hidden relative min-h-[220px]">
                  {generations[currentIndex] ? (
                    <img
                      src={generations[currentIndex].dataUrl}
                      alt="Refining Design"
                      className="w-full h-full object-contain opacity-95 max-h-[min(55vh,520px)]"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm p-6">No preview</div>
                  )}
                  {manualToolsEnabled &&
                    pencilElements.map((el) => (
                      <div
                        key={el.id}
                        className="absolute border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 rounded text-[10px] text-cyan-300 pointer-events-none"
                        style={{ left: el.x, top: el.y }}
                      >
                        {el.label}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleRegenerate()}
                disabled={!manualToolsEnabled || regenerateCount >= 3}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm text-slate-300 disabled:opacity-40"
              >
                Regenerate this variation (Grok / fallback) ({regenerateCount}/3)
              </button>
            </div>
          </div>
        )}
        {step === 'final' && (
          <div className="flex flex-col items-center justify-center gap-6 py-16 max-w-lg mx-auto text-center">
            <CheckCircle className="w-16 h-16 text-emerald-400" />
            <h3 className="text-xl font-headline text-slate-100">UI/UX approved</h3>
            <p className="text-sm text-slate-400">Your choice is saved for the build. Returning to Master Plan…</p>
          </div>
        )}

        {saveModal && (
          <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#061520] shadow-2xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-headline text-slate-100">Review manual changes</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    We scan for malformed SVG, risky tags, and architectural inconsistencies before updating the preview.
                  </p>
                </div>
              </div>
              {saveModal.analyzing ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  Analysing edit…
                </div>
              ) : (
                <>
                  {saveModal.summary ? <p className="text-sm text-slate-300">{saveModal.summary}</p> : null}
                  {saveModal.warnings.length > 0 ? (
                    <ul className="text-sm text-amber-100/95 space-y-2 max-h-48 overflow-y-auto border border-amber-500/20 rounded-lg p-3 bg-amber-500/5">
                      {saveModal.warnings.map((w, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-amber-400 shrink-0">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-emerald-400/90">No structural issues flagged — safe to apply.</p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setSaveModal(null)}
                      className="px-4 py-2 rounded-lg border border-white/15 text-sm text-slate-300 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplySavedUseRaw}
                      disabled={applyBusy}
                      className="px-4 py-2 rounded-lg border border-cyan-500/35 text-sm font-headline text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40"
                    >
                      Apply my edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApplySavedWithAdapt()}
                      disabled={applyBusy || !grokKey}
                      title={!grokKey ? 'Requires GROK_API_KEY (server or stored browser key)' : 'Let Grok reconcile structure while keeping your intent'}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-headline border border-violet-500/35 text-violet-100 bg-violet-500/15 hover:bg-violet-500/25 disabled:opacity-40"
                    >
                      {applyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Adapt with Grok &amp; apply
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
