'use client';

import { Network } from 'lucide-react';
import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { useSwarm } from '@/components/swarm/SwarmProvider';

type Props = {
  onOpenProjectSettings: () => void;
};

/**
 * Quick access: runtime Swarm on/off (Power). Non‑Power opens Project Settings.
 */
export function WorkspaceSwarmButton({ onOpenProjectSettings }: Props) {
  const { capabilities, agentsEnabled } = useModelSettings();
  const { isEnabled, toggleSwarm } = useSwarm();
  const power = capabilities.agentsEnabled;

  const active = power && agentsEnabled && isEnabled;

  return (
    <button
      type="button"
      onClick={() => {
        if (!power) {
          onOpenProjectSettings();
          return;
        }
        if (!agentsEnabled) {
          onOpenProjectSettings();
          return;
        }
        toggleSwarm();
      }}
      title={
        !power
          ? 'Swarm — open Project Settings (Power tier)'
          : !agentsEnabled
            ? 'Enable “Allow Swarm handoffs” in Project Settings'
            : isEnabled
              ? 'Swarm on — click to pause'
              : 'Swarm paused — click to resume'
      }
      aria-pressed={active}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
          : 'border-white/15 text-slate-400 hover:border-cyan-500/35 hover:text-cyan-200'
      }`}
    >
      <Network className="h-4 w-4" aria-hidden />
    </button>
  );
}
