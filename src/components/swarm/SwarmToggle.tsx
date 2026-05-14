'use client';

import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { useSwarm } from './SwarmProvider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { SwarmIntensity } from '@/types/swarm';

const INTENSITY_OPTIONS: { value: SwarmIntensity; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Reserved — Quality uses Grok 4.1 when Run and Test runs' },
  { value: 'balanced', label: 'Balanced', hint: 'Reserved — manual Quality only' },
  { value: 'full_quality', label: 'Full Quality', hint: 'Default — manual Run and Test on Grok 4.1' },
];

export function SwarmToggle() {
  const { capabilities } = useModelSettings();
  const { isEnabled, toggleSwarm, intensity, setSwarmIntensity } = useSwarm();

  if (!capabilities.agentsEnabled) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-white/10 px-4 py-3 bg-black/20 opacity-70">
        <span className="font-medium text-sm text-slate-400">Swarm Mode</span>
        <p className="text-[11px] text-slate-500 leading-snug">
          Multi-agent swarm is available on the Power plan. Adjust chat model above on Free / Pro.
        </p>
      </div>
    );
  }

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
        <p className="text-[11px] text-muted-foreground max-w-[280px] sm:max-w-xs leading-snug">
          Chat stays a single Grok 4.1 stream (planning and research there). The only support agent is Quality
          (review plus test ideas). It runs only when you click Run and Test in the IDE top bar, scoped to
          recently changed files plus optional{' '}
          <code className="text-[10px]">window.nebulaSwarmFocusPaths</code> /{' '}
          <code className="text-[10px]">nebulaSwarmFocusSnippets</code>.
        </p>
      </div>
    </div>
  );
}
