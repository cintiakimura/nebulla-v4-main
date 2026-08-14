import { useEffect } from 'react';

/** Legacy /pricing → single Payment page. */
export function PricingPage() {
  useEffect(() => {
    const q = window.location.search || '';
    window.location.replace(`/payment${q}`);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent text-sm text-[#8a8a8a]">
      Redirecting to payment…
    </div>
  );
}
