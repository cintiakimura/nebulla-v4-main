'use client';

import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export function ModelSelector() {
  const { capabilities, chatModel, setChatModel, agentsEnabled, setAgentsEnabled } = useModelSettings();
  const power = capabilities.tier === 'power';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">
          Chat model
        </Label>
        <select
          value={chatModel}
          disabled={capabilities.allowedChatModel === 'grok-3'}
          onChange={(e) => setChatModel(e.target.value as 'grok-3' | 'grok-4.1')}
          className="text-xs rounded-md border border-white/10 bg-[#040f1a] px-2 py-1.5 text-slate-200 disabled:opacity-60"
        >
          <option value="grok-3">Grok 3</option>
          <option value="grok-4.1">Grok 4.1</option>
        </select>
        {capabilities.allowedChatModel === 'grok-3' ? (
          <p className="text-[10px] text-slate-500 leading-snug">Free tier uses Grok 3 only.</p>
        ) : (
          <p className="text-[10px] text-slate-500 leading-snug">Pro / Power: choose main Partner model.</p>
        )}
      </div>

      <div
        className={`flex items-center justify-between gap-2 pt-1 border-t border-white/5 ${
          power ? '' : 'opacity-40 pointer-events-none'
        }`}
      >
        <div className="min-w-0">
          <Label className="text-xs text-slate-300">Enable Multi-Agent Swarm</Label>
          <p className="text-[10px] text-slate-500 leading-snug">Power tier only.</p>
        </div>
        <Switch
          checked={power && agentsEnabled}
          disabled={!power}
          onCheckedChange={(c) => setAgentsEnabled(Boolean(c))}
        />
      </div>
    </div>
  );
}
