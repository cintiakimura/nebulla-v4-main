import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  Hand,
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

type Props = {
  hasSelection?: boolean;
  onApplyToAll?: (state: PreviewToolbarState) => void;
  /** T2 — guided Done → Code (also used by Apply to all for now). */
  onDone?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  className?: string;
};

/**
 * New preview edit toolbar (Build surface only).
 * Stubs selection apply until a selection bridge exists; controls stay fully visible.
 */
export function PreviewEditToolbar({
  hasSelection = false,
  onApplyToAll,
  onDone,
  onUndo,
  onRedo,
  className,
}: Props) {
  const [mode, setMode] = useState<PreviewToolMode>('grab');
  const [fontFamily, setFontFamily] = useState<string>(FONTS[0]);
  const [fontSize, setFontSize] = useState<string>('16');
  const [thicknessPx, setThicknessPx] = useState('1.5');
  const [opacityPct, setOpacityPct] = useState(100);
  const [colorHex, setColorHex] = useState('#E8E8E8');
  const [colorOpen, setColorOpen] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

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

  const toolBtn = (id: PreviewToolMode, label: string, icon: ReactNode) => (
    <button
      key={id}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={mode === id}
      onClick={() => setMode((m) => (m === id ? null : id))}
      className={cn(
        'btn-secondary-surface inline-flex h-8 w-8 items-center justify-center rounded-md',
        mode === id && 'border border-border bg-[#222]',
      )}
    >
      {icon}
    </button>
  );

  return (
    <div
      className={cn(
        'ide-glass-chrome flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5',
        className,
      )}
      role="toolbar"
      aria-label="Preview edit tools"
    >
      {toolBtn('grab', 'Grab', <Move className="h-3.5 w-3.5" aria-hidden />)}
      {toolBtn('move', 'Move', <Hand className="h-3.5 w-3.5" aria-hidden />)}
      {toolBtn('resize', 'Resize', <Scaling className="h-3.5 w-3.5" aria-hidden />)}

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
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

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
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

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Thickness">
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

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Opacity">
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

      <div className="relative">
        <button
          type="button"
          title="Color"
          aria-label="Color"
          aria-expanded={colorOpen}
          onClick={() => setColorOpen((o) => !o)}
          className="btn-secondary-surface inline-flex h-8 items-center gap-1.5 rounded-md px-2"
        >
          <span
            className="h-4 w-4 rounded-sm border border-border"
            style={{ backgroundColor: colorHex }}
            aria-hidden
          />
          <span className="font-mono text-[10px] text-foreground">{colorHex}</span>
        </button>
        {colorOpen ? (
          <div className="ide-glass-card absolute left-0 top-full z-30 mt-1 w-52 space-y-2 rounded-lg border border-border p-3 shadow-none">
            <input
              ref={colorInputRef}
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#E8E8E8'}
              onChange={(e) => setColorHex(e.target.value.toUpperCase())}
              className="h-28 w-full cursor-pointer rounded border border-border bg-transparent"
              aria-label="Color wheel"
            />
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
            <button
              type="button"
              className="btn-secondary-surface w-full rounded-md px-2 py-1.5 text-[11px]"
              onClick={() => setColorOpen(false)}
            >
              Done
            </button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        title={hasSelection ? 'Apply to all' : 'Apply to all (select an element first)'}
        aria-label="Apply to all"
        onClick={() => {
          noopUnlessSelected(() => onApplyToAll?.(snapshot()));
          onDone?.();
        }}
        className="btn-secondary-surface ml-1 h-8 rounded-md px-2.5 text-[11px]"
      >
        Apply to all
      </button>
      <button
        type="button"
        title="Done — continue to Code"
        aria-label="Done"
        onClick={() => onDone?.()}
        className="btn-cyan h-8 rounded-md px-2.5 text-[11px]"
      >
        Done
      </button>

      <span className="mx-1 h-5 w-px bg-border" aria-hidden />

      <button
        type="button"
        title="Undo"
        aria-label="Undo"
        onClick={() => onUndo?.()}
        className="btn-secondary-surface inline-flex h-8 w-8 items-center justify-center rounded-md"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        title="Redo"
        aria-label="Redo"
        onClick={() => onRedo?.()}
        className="btn-secondary-surface inline-flex h-8 w-8 items-center justify-center rounded-md"
      >
        <Redo2 className="h-3.5 w-3.5" aria-hidden />
      </button>

      {!hasSelection ? (
        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
          No selection
        </span>
      ) : (
        <Maximize2 className="ml-auto hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden />
      )}
    </div>
  );
}
