import { useEffect, useState } from 'react';
import { DEFAULT_TTS_VOICE, TTS_VOICE_IDS } from '../../../lib/ttsVoice';
import {
  TTS_VOICE_CHANGED_EVENT,
  hydrateTtsVoiceFromAccount,
  readStoredTtsVoice,
  writeStoredTtsVoice,
  type TtsVoiceId,
} from '../../lib/ttsVoicePrefs';
import { fetchSessionUser } from '../../lib/nebulaCloud';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  label?: string;
};

export function TtsVoicePicker({ className, label = 'Voice' }: Props) {
  const [voice, setVoice] = useState<TtsVoiceId>(() => readStoredTtsVoice());
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await fetchSessionUser().catch(() => null);
      if (cancelled) return;
      const nextUid = session?.uid?.trim() || null;
      setUid(nextUid);
      const hydrated = await hydrateTtsVoiceFromAccount();
      if (!cancelled) setVoice(hydrated);
    })();
    const onChange = () => {
      setVoice(readStoredTtsVoice());
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key.startsWith('nebula-tts-voice-v1')) setVoice(readStoredTtsVoice());
    };
    window.addEventListener(TTS_VOICE_CHANGED_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(TTS_VOICE_CHANGED_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <label
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground',
        className,
      )}
    >
      <span>{label}</span>
      <select
        value={voice}
        aria-label={label}
        onChange={(e) => {
          const next = writeStoredTtsVoice(e.target.value as TtsVoiceId, uid);
          setVoice(next);
        }}
        className="h-6 max-w-[7.5rem] rounded-md border border-border bg-card px-1 text-[10px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
      >
        {TTS_VOICE_IDS.map((id) => (
          <option key={id} value={id}>
            {id === DEFAULT_TTS_VOICE ? `${id} (default)` : id}
          </option>
        ))}
      </select>
    </label>
  );
}
