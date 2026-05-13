'use client';

import { useSwarm } from './SwarmProvider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { SwarmIntensity } from '@/types/swarm';

const INTENSITY_OPTIONS: { value: SwarmIntensity; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Planner + Researcher' },
  { value: 'balanced', label: 'Balanced', hint: '+ Tester' },
  { value: 'full_quality', label: 'Full Quality', hint: '+ Reviewer (Grok 4.1)' },
];

export function SwarmToggle() {
  const { isEnabled, toggleSwarm, intensity, setSwarmIntensity } = useSwarm();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border rounded-lg px-4 py-3 bg-card">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-sm">Swarm Mode</span>
        </div>

        <Switch checked={isEnabled} onCheckedChange={toggleSwarm} />

        <Label className="text-xs text-muted-foreground cursor-pointer" onClick={toggleSwarm}>
          {isEnabled ? 'ON' : 'OFF'}
        </Label>
      </div>

      <div className="flex flex-col gap-1 sm:items-end min-w-0">
        <Label htmlFor="swarm-intensity" className="text-xs text-muted-foreground">
          Swarm intensity
        </Label>
        <select
          id="swarm-intensity"
          value={intensity}
          disabled={!isEnabled}
          onChange={(e) => setSwarmIntensity(e.target.value as SwarmIntensity)}
          className="text-sm rounded-md border border-input bg-background px-2 py-1.5 max-w-full disabled:opacity-50"
        >
          {INTENSITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} title={o.hint}>
              {o.label} — {o.hint}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
