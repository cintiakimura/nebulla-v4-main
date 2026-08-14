import { Logo } from '@/components/Logo';

/**
 * Centered Nebulla logo throbber shown only before a mockup / preview exists.
 */
export function PreviewWaitingThrobber({
  status = 'Waiting for mockup',
}: {
  status?: string;
}) {
  const line = (status || 'Waiting for mockup').trim().slice(0, 120);
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="nebulla-throbber inline-flex h-16 w-16 items-center justify-center" aria-hidden>
        <Logo className="h-14 w-14" alt="" />
      </span>
      <p className="max-w-[16rem] text-center text-[11px] leading-snug text-muted-foreground">{line}</p>
    </div>
  );
}
