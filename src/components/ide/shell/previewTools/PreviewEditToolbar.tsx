import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  Hand,
  Loader2,
  Maximize2,
  Move,
  Redo2,
  Scaling,
  Type,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PreviewToolMode = 'grab' | 'move' | 'resize' | null;

export type PreviewToolbarState = {
  mode: PreviewToolMode;
  fontFamily: string;
  fontSize: string;
  thicknessPx: string;
  opacityPct: number;
  colorHex: string;
};

const FONTS = ['Inter', 'System UI', 'Georgia', 'monospace'] as const;
const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '32'] as const;
const SWATCHES = ['#E8E8E8', '#FFFFFF', '#A3A3A3', '#525252', '#171717', '#EF4444', '#3B82F6', '#22C55E'] as const;

type Props = {
  hasSelection?: boolean;
  onApplyToAll?: (state: PreviewToolbarState) => void;
  /** T2 — guided Done → Code (also used by Apply to all for now). */
  onDone?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Single Generate UI control for the Build preview canvas. */
  onGenerateUi?: () => void;
  generateBusy?: boolean;
  className?: string;
};

/**
 * New preview edit toolbar (Build surface only).
 * Color opens as one floating overlay — never wraps / squeezes the layout.
 */
export function PreviewEditToolbar({
  hasSelection = false,
  onApplyToAll,
  onDone,
  onUndo,
  onRedo,
  onGenerateUi,
  generateBusy = false,
  className,
}: Props) {
  const [mode, setMode] = useState<PreviewToolMode>('grab');
  const [fontFamily, setFontFamily] = useState<string>(FONTS[0]);
  const [fontSize, setFontSize] = useState<string>('16');
  const [thicknessPx, setThicknessPx] = useState('1.5');
  const [opacityPct, setOpacityPct] = useState(100);
  const [colorHex, setColorHex] = useState('#E8E8E8');
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const colorPanelRef = useRef<HTMLDivElement>(null);

  const snapshot = useCallback(
    (): PreviewToolbarState => ({
      mode,
      fontFamily,
      fontSize,
      thicknessPx,
      opacityPct,
      colorHex,
    }),
    [mode, fontFamily, fontSize, thicknessPx, opacityPct, colorHex],
  );

  const noopUnlessSelected = useCallback(
    (action: () => void) => {
      if (!hasSelection) return;
      action();
    },
    [hasSelection],
  );

  const placeColorPanel = useCallback(() => {
    const btn = colorBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const panelW = 220;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - panelW - 8);
    const top = Math.min(r.bottom + 6, window.innerHeight - 280);
    setColorPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!colorOpen) return;
    placeColorPanel();
  }, [colorOpen, placeColorPanel]);

  useEffect(() => {
    if (!colorOpen) return;
    const onReposition = () => placeColorPanel();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setColorOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colorPanelRef.current?.contains(t) || colorBtnRef.current?.contains(t)) return;
      setColorOpen(false);
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [colorOpen, placeColorPanel]);

  const toolBtn = (id: PreviewToolMode, label: string, icon: ReactNode) => (
    <button
      key={id}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={mode === id}
      onClick={() => setMode((m) => (m === id ? null : id))}
      className={cn(
        'btn-secondary-surface btn-icon shrink-0',
        mode === id && 'border-[var(--shell-border-strong)] text-foreground',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn(
        'ide-glass-chrome relative z-20 flex h-10 shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-visible border-b border-border px-2 py-1.5',
        className,
      )}
      role="toolbar"
      aria-label="Preview edit tools"
    >
      {toolBtn('grab', 'Grab', <Move className="h-3.5 w-3.5" aria-hidden />)}
      {toolBtn('move', 'Move', <Hand className="h-3.5 w-3.5" aria-hidden />)}
      {toolBtn('resize', 'Resize', <Scaling className="h-3.5 w-3.5" aria-hidden />)}

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Type className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">Font</span>
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className="btn-secondary-surface h-8 max-w-[7.5rem] rounded-md px-1.5 text-[11px] text-foreground outline-none"
          title="Font"
          aria-label="Font"
        >
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <span className="sr-only">Font size</span>
        <select
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value)}
          className="btn-secondary-surface h-8 w-[3.5rem] rounded-md px-1 text-[11px] text-foreground outline-none"
          title="Font size"
          aria-label="Font size"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Thickness">
        <Bold className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <input
          type="text"
          inputMode="decimal"
          value={thicknessPx}
          onChange={(e) => setThicknessPx(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
          className="ide-glass-input h-8 w-12 rounded-md px-1.5 text-[11px] text-foreground outline-none"
          aria-label="Thickness in pixels"
        />
        <span className="text-[10px]">px</span>
      </label>

      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground" title="Opacity">
        <input
          type="range"
          min={1}
          max={100}
          value={opacityPct}
          onChange={(e) => setOpacityPct(Number(e.target.value))}
          className="h-8 w-16 accent-[#d0d0d0]"
          aria-label="Opacity"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={opacityPct}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            setOpacityPct(Math.min(100, Math.max(1, Math.round(n))));
          }}
          className="ide-glass-input h-8 w-12 rounded-md px-1 text-[11px] text-foreground outline-none"
          aria-label="Opacity percent"
        />
        <span className="text-[10px]">%</span>
      </label>

      <button
        ref={colorBtnRef}
        type="button"
        title="Color"
        aria-label="Color"
        aria-expanded={colorOpen}
        aria-haspopup="dialog"
        onClick={() => setColorOpen((o) => !o)}
        className="btn-secondary-surface inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2"
      >
        <span
          className="h-4 w-4 rounded-sm border border-border"
          style={{ backgroundColor: colorHex }}
          aria-hidden
        />
        <span className="font-mono text-[10px] text-foreground">{colorHex}</span>
      </button>

      {colorOpen && colorPos ? (
        <div
          ref={colorPanelRef}
          role="dialog"
          aria-label="Choose color"
          className="ide-glass-card fixed z-[80] w-[220px] space-y-3 rounded-lg border border-border p-3 shadow-none"
          style={{ top: colorPos.top, left: colorPos.left }}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                title={sw}
                aria-label={`Color ${sw}`}
                onClick={() => setColorHex(sw)}
                className={cn(
                  'h-8 w-full rounded-md border',
                  colorHex.toUpperCase() === sw ? 'border-[var(--shell-border-strong)]' : 'border-border',
                )}
                style={{ backgroundColor: sw }}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Hex</span>
            <input
              type="text"
              value={colorHex}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
                  setColorHex(v.startsWith('#') ? v.toUpperCase() : `#${v}`.toUpperCase());
                }
              }}
              className="ide-glass-input h-8 min-w-0 flex-1 rounded-md px-2 font-mono text-[11px] text-foreground outline-none"
              aria-label="Hex color"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Pick</span>
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#E8E8E8'}
              onChange={(e) => setColorHex(e.target.value.toUpperCase())}
              className="h-8 w-full cursor-pointer rounded border border-border bg-transparent"
              aria-label="Color wheel"
            />
          </label>
          <button
            type="button"
            className="btn-secondary-surface w-full rounded-md px-2 py-1.5 text-[11px]"
            onClick={() => setColorOpen(false)}
          >
            Done
          </button>
        </div>
      ) : null}

      <button
        type="button"
        title="Generate UI from Master Plan + ui-brief"
        aria-label="Generate UI"
        disabled={generateBusy || !onGenerateUi}
        onClick={() => onGenerateUi?.()}
        className="btn-cyan ml-1 h-8 shrink-0 rounded-md px-2.5 text-[11px] disabled:opacity-40"
      >
        {generateBusy ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden /> : null}
        Generate UI
      </button>
      <button
        type="button"
        title={hasSelection ? 'Apply to all' : 'Apply to all (select an element first)'}
        aria-label="Apply to all"
        onClick={() => {
          noopUnlessSelected(() => onApplyToAll?.(snapshot()));
          onDone?.();
        }}
        className="btn-secondary-surface ml-1 h-8 shrink-0 rounded-md px-2.5 text-[11px]"
      >
        Apply to all
      </button>
      <button
        type="button"
        title="Done — continue to Code"
        aria-label="Done"
        onClick={() => onDone?.()}
        className="btn-cyan h-8 shrink-0 rounded-md px-2.5 text-[11px]"
      >
        Done
      </button>

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <button
        type="button"
        title="Undo"
        aria-label="Undo"
        onClick={() => onUndo?.()}
        className="btn-secondary-surface btn-icon shrink-0"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Redo"
        aria-label="Redo"
        onClick={() => onRedo?.()}
        className="btn-secondary-surface btn-icon shrink-0"
      >
        <Redo2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      {!hasSelection ? (
        <span className="ml-auto hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
          No selection
        </span>
      ) : (
        <Maximize2 className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden />
      )}
    </div>
  );
}
