/**
 * Centered wait line shown only before a live preview exists.
 */
export function PreviewWaitingThrobber({
  status = 'Live app appears here after the first build.',
}: {
  status?: string;
}) {
  const line = (status || 'Live app appears here after the first build.').trim().slice(0, 120);
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="type-body-dense max-w-[18rem] text-center text-[#A3A3A3]">{line}</p>
    </div>
  );
}
