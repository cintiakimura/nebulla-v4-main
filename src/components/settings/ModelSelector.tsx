'use client';

import { useModelSettings } from '@/components/settings/ModelSettingsContext';
import { Label } from '@/components/ui/label';
import { AI_CHAT_MODELS, AI_PROVIDER_LABELS, type AiChatModelId } from '../../lib/aiProvider';

/** Compact chat model / provider picker (Settings + assistant). Default remains Grok. */
export function ChatModelSelector() {
  const { chatModel, setChatModel, selection, capabilities } = useModelSettings();

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">
        Chat model / provider
      </Label>
      <select
        value={chatModel}
        onChange={(e) => setChatModel(e.target.value as AiChatModelId)}
        className="h-8 max-w-[16rem] rounded border border-white/10 bg-[#060a14] px-2 py-0.5 text-[11px] text-slate-200"
        aria-label="Chat model and provider"
      >
        {AI_CHAT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {AI_PROVIDER_LABELS[m.provider]} — {m.label}
            {m.badge ? ` (${m.badge})` : ''}
          </option>
        ))}
      </select>
      <p className="text-[9px] text-slate-500 leading-snug">
        Using <span className="text-slate-400">{selection.label}</span> via{' '}
        <span className="text-slate-400">{selection.providerLabel}</span>. Needs a matching server key (
        <code className="text-slate-500">MAIN_API_KEY_GROK</code>,{' '}
        <code className="text-slate-500">CLAUDE_API_KEY</code>, or{' '}
        <code className="text-slate-500">OPENAI_API_KEY</code>). Go Code stays on Grok for now.
        {capabilities.tier === 'free' ? ' Free tier: monthly token cap still applies.' : ''}
      </p>
    </div>
  );
}
