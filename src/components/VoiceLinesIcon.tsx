export function VoiceLinesIcon({ className = "w-5 h-5", active = false }: { className?: string, active?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y={active ? "6" : "10"} width="2" height={active ? "12" : "4"} rx="1" className="transition-all duration-300" />
      <rect x="9" y={active ? "3" : "8"} width="2" height={active ? "18" : "8"} rx="1" className="transition-all duration-300" />
      <rect x="13" y={active ? "5" : "7"} width="2" height={active ? "14" : "10"} rx="1" className="transition-all duration-300" />
      <rect x="17" y={active ? "8" : "10"} width="2" height={active ? "8" : "4"} rx="1" className="transition-all duration-300" />
    </svg>
  );
}
