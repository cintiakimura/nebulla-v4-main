import { useId } from 'react';

export function Logo({ className = 'w-6 h-6' }: { className?: string }) {
  const raw = useId().replace(/:/g, '');
  const gid = `nebulla-cosmic-${raw}`;
  const fid = `nebulla-ring-${raw}`;
  return (
    <svg className={className} viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#6a0dad', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#00ffff', stopOpacity: 1 }} />
        </linearGradient>
        <filter id={fid} width="200%" height="200%" x="-50%" y="-50%">
          <feGaussianBlur result="blur" stdDeviation="3" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <ellipse
        cx="128"
        cy="128"
        fill="none"
        filter={`url(#${fid})`}
        rx="110"
        ry="35"
        stroke="white"
        strokeWidth="4"
        style={{ opacity: 0.9 }}
        transform="rotate(-15, 128, 128)"
      />
      <path
        d="M128 20 C140 100 160 116 236 128 C160 140 140 156 128 236 C116 156 96 140 20 128 C96 116 116 100 128 20 Z"
        fill={`url(#${gid})`}
      />
      <path
        d="M234.3 104.5 A110 35 -15 0 1 128 163 A110 35 -15 0 1 21.7 151.5"
        fill="none"
        filter={`url(#${fid})`}
        stroke="white"
        strokeWidth="4"
        style={{ opacity: 0.9 }}
      />
    </svg>
  );
}
