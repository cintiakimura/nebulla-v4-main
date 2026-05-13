'use client';

import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

/** Compact chat model picker for tight layouts (e.g. Nebula Partner header). */
export function ChatModelSelector() {
  const { capabilities, chatModel, setChatModel } = useModelSettings();

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">
        Chat model
      </Label>
      <select
        value={chatModel}
        disabled={capabilities.allowedChatModel === 'grok-3'}
        onChange={(e) => setChatModel(e.target.value as 'grok-3' | 'grok-4.1')}
        className="h-7 max-w-[11rem] rounded border border-white/10 bg-[#060a14] px-2 py-0.5 text-[11px] text-slate-200 disabled:opacity-60"
      >
        <option value="grok-3">Grok 3</option>
        <option value="grok-4.1">Grok 4.1</option>
      </select>
      {capabilities.allowedChatModel === 'grok-3' ? (
        <p className="text-[9px] text-slate-500 leading-snug">Free tier: Grok 3 only.</p>
      ) : (
        <p className="text-[9px] text-slate-500 leading-snug">Pro / Power: Partner model.</p>
      )}
    </div>
  );
}

/** Power tier: allow server Swarm handoffs (`agentsEnabled` + runtime Swarm toggle). */
export function AgentsHandoffPref() {
  const { capabilities, agentsEnabled, setAgentsEnabled } = useModelSettings();
  const allowAgents = capabilities.agentsEnabled;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 ${
        allowAgents ? '' : 'opacity-50 pointer-events-none'
      }`}
    >
      <div className="min-w-0">
        <Label className="text-xs text-slate-300">Allow Swarm handoffs</Label>
        <p className="text-[10px] text-slate-500 leading-snug">Power tier — agent API on eligible turns.</p>
      </div>
      <Switch
        checked={allowAgents && agentsEnabled}
        disabled={!allowAgents}
        onCheckedChange={(c) => setAgentsEnabled(Boolean(c))}
      />
    </div>
  );
}
