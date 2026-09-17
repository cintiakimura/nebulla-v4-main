import { cn } from '@/lib/utils';

const LOGO_SRC = '/images/nebulla-mark.png?v=2';

/**
 * Nebulla mark — tight crop from `public/images/nebulla-mark.png`.
 */
export function Logo({
  className = 'h-[24px] w-[24px]',
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
