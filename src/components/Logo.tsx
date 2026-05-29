import { cn } from '@/lib/utils';

const LOGO_SRC = '/nebulla-logo.png';

/**
 * Nebulla.beta mark — served from `public/nebulla-logo.png` (transparent PNG).
 */
export function Logo({
  className = 'w-6 h-6',
  alt = 'Nebulla.beta',
}: {
  className?: string;
  /** Use empty string for decorative-only contexts. */
  alt?: string;
}) {
  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      className={cn('block max-h-full max-w-full bg-transparent object-contain', className)}
      draggable={false}
    />
  );
}
