import { useCallback, useEffect, useRef, useState } from 'react';
import { MasterPlan } from '@/components/MasterPlan';
import { MindMapIdeRoute } from '@/components/ide/MindMapIdeRoute';
import { getBrowserProjectKey } from '../../../lib/nebulaProjectApi';
import { useIdeShellNav } from './IdeShellNavContext';
import { PlanDeployDnsSection } from './PlanDeployDnsSection';

const SPLIT_KEY = 'nebula_plan_split_pct_v1';
const SPLIT_MIN = 34;
const SPLIT_MAX = 66;

function readSplit(): number {
  try {
    const n = Number(localStorage.getItem(SPLIT_KEY));
    if (Number.isFinite(n)) return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));
  } catch {
    /* ignore */
  }
  return 50;
}

function useIsLarge(): boolean {
  const [large, setLarge] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setLarge(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return large;
}

/**
 * Plan page: scrolls as a whole — Master Plan | Mind Map, then Live URL + DNS.
 */
export function PlanScreen() {
  const { goToBuild } = useIdeShellNav();
  const projectKey = getBrowserProjectKey();
  const isLarge = useIsLarge();
  const [leftPct, setLeftPct] = useState(readSplit);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startPct = useRef(50);
  const rowRef = useRef<HTMLDivElement>(null);

  const onHandleDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isLarge) return;
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startPct.current = leftPct;
      const row = rowRef.current;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current || !row) return;
        const w = row.getBoundingClientRect().width || 1;
        const deltaPct = ((ev.clientX - startX.current) / w) * 100;
        const next = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, startPct.current + deltaPct));
        setLeftPct(next);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setLeftPct((current) => {
          try {
            localStorage.setItem(SPLIT_KEY, String(current));
          } catch {
            /* ignore */
          }
          return current;
        });
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [isLarge, leftPct],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <div className="flex w-full flex-col pb-6">
        <div
          ref={rowRef}
          className="flex min-h-[min(72vh,720px)] w-full shrink-0 flex-col lg:flex-row"
        >
          <section
            className="flex min-h-[24rem] min-w-0 flex-col overflow-hidden border-b border-border lg:min-h-0 lg:border-b-0 lg:border-r"
            style={isLarge ? { width: `${leftPct}%` } : { width: '100%' }}
            aria-label="Master Plan"
          >
            <MasterPlan projectKey={projectKey} onClose={() => goToBuild()} />
          </section>

          {isLarge ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Master Plan and Mind Map"
              title="Drag to resize"
              onMouseDown={onHandleDown}
              className="ide-resize-hit z-10 w-1 shrink-0 cursor-col-resize bg-border hover:bg-[#3a3a3a]"
            />
          ) : null}

          <section
            className="flex min-h-[24rem] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0"
            aria-label="Mind Map"
          >
            <MindMapIdeRoute />
          </section>
        </div>

        <PlanDeployDnsSection />
      </div>
    </div>
  );
}
