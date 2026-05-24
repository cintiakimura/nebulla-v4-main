'use client';

import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { Label } from '@/components/ui/label';

/** Compact chat model picker for tight layouts (e.g. assistant header). */
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
        <option value="grok-4.1">Grok</option>
      </select>
      {capabilities.allowedChatModel === 'grok-3' ? (
        <p className="text-[9px] text-slate-500 leading-snug">Free tier: Grok 3 only.</p>
      ) : (
        <p className="text-[9px] text-slate-500 leading-snug">Pro / Power: default Grok.</p>
      )}
    </div>
  );
}
