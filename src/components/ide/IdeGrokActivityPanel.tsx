import { Check, Circle, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GrokActivityStatus } from '../../lib/ideGrokActivityStatus';

export function IdeGrokActivityPanel({ activity }: { activity: GrokActivityStatus }) {
  const isWork = activity.tone === 'work';
  const isError = activity.tone === 'error';

  return (
    <div
      className={cn(
        'shrink-0 border-b px-3 py-3',
        isError
          ? 'border-red-500/25 bg-red-500/10'
          : isWork
            ? 'border-primary/20 bg-primary/5'
            : 'border-emerald-500/20 bg-emerald-500/5',
      )}
      role="status"
      aria-live="polite"
      aria-busy={isWork}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            isError ? 'bg-red-500/20 text-red-300' : isWork ? 'bg-primary/15 text-primary' : 'bg-emerald-500/15 text-emerald-300',
          )}
        >
          {isWork ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : isError ? (
            <XCircle className="h-4 w-4" aria-hidden />
          ) : (
            <Check className="h-4 w-4" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p
              className={cn(
                'type-label-sm font-headline tracking-wide',
                isError ? 'text-red-100' : isWork ? 'text-primary' : 'text-emerald-200',
              )}
            >
              {activity.headline}
            </p>
            {activity.subhead ? (
              <p className="type-body-md mt-1 leading-relaxed text-muted-foreground">{activity.subhead}</p>
            ) : null}
          </div>

          {activity.steps.length > 0 ? (
            <ol className="space-y-1.5 rounded-lg border border-white/5 bg-black/20 px-2.5 py-2">
              {activity.steps.map((step, i) => {
                const done = i < activity.activeStepIndex;
                const active = i === activity.activeStepIndex && isWork;
                const failed = isError && i === activity.activeStepIndex;
                return (
                  <li key={`${step.label}-${i}`} className="flex gap-2 text-left">
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {done ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400/90" />
                      ) : active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : failed ? (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/35" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'type-label-sm leading-snug',
                          done
                            ? 'text-muted-foreground'
                            : active
                              ? 'text-foreground'
                              : failed
                                ? 'text-red-100/95'
                                : 'text-muted-foreground/70',
                        )}
                      >
                        {step.label}
                      </p>
                      {step.detail ? (
                        <p className="type-body-md mt-0.5 leading-relaxed text-muted-foreground/90">{step.detail}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {activity.footer ? (
            <p className="type-body-md leading-relaxed text-muted-foreground/90">{activity.footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
