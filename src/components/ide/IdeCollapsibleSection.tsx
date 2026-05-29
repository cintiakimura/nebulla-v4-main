import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cursor-style sidebar section with chevron toggle. */
export function IdeCollapsibleSection({
  title,
  open,
  onToggle,
  count,
  actions,
  children,
  className,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="flex h-7 items-center gap-0.5 pr-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 text-left hover:bg-secondary/60"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="type-label-sm truncate uppercase tracking-[0.1em] text-muted-foreground">
            {title}
          </span>
          {typeof count === 'number' && count > 0 ? (
            <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-foreground/80">
              {count}
            </span>
          ) : null}
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {open ? children : null}
    </section>
  );
}
