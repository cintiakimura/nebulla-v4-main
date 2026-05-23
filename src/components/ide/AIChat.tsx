import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Hand, Mic, Paperclip, Rocket, Send, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSessionUser } from '../../lib/nebulaCloud';
import {
  FREE_TIER_MONTHLY_LIMIT_MESSAGE,
  isMonthlyUsageLimitError,
  MAIN_AI_CHAT_SETUP_HINT,
  serverReportsMainAiKey,
} from '../../lib/grokKey';
import { readResponseJson } from '../../lib/apiFetch';
import { getBrowserProjectName, withProjectQuery } from '../../lib/nebulaProjectApi';
import { sendIdeAssistantGrokTurn } from '../../lib/ideAssistantGrokChat';
import {
  handlePostGrokCodingTurn,
  runGoCodeAndApply,
} from '../../lib/nebulaGrokCodingPipeline';
import { syncActiveCloudProjectFromSession } from '../../lib/nebulaCloud';
import { ideContextSnippetForChat, useIdeWorkspace } from '@/components/ide/IdeWorkspaceContext';
import { fetchConversationLogEntries } from '../../lib/conversationLogClient';
import {
  MIC_REENABLE_AFTER_TTS_MS,
  splitTextForTts,
  stripAssistantTagsForVoice,
  TTS_START_DEBOUNCE_MS,
  VOICE_SILENCE_BEFORE_SEND_MS,
} from '../../lib/voiceTtsShared';

/** WebKit speech types (not always present in TS `lib` for this project). */
type IdeSpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type IdeSpeechRecognitionResultList = { length: number; [index: number]: IdeSpeechRecognitionResult };
type IdeSpeechRecognitionEvent = { resultIndex: number; results: IdeSpeechRecognitionResultList };
type IdeSpeechRecognitionErrorEvent = { error: string };
type IdeSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: IdeSpeechRecognitionEvent) => void) | null;
  onerror: ((event: IdeSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

function SoundWaveIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px]', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 9v6" />
      <path d="M12 6v12" />
      <path d="M16 10v4" />
    </svg>
  );
}

function ChatRoundButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[background-color,box-shadow,color] duration-300 ease-out hover:text-foreground hover:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const modelLabel: Record<string, string> = {
  'grok-4.1': 'Grok 4.1',
};

function formatLogTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  } catch {
    /* ignore */
  }
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AIChat() {
  const { chatModel, activePath, activeTab, diskProjectKey } = useIdeWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [accessoryHint, setAccessoryHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [serverHasGrokKey, setServerHasGrokKey] = useState<boolean | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  /** True while TTS audio is playing; mic stays off (project-execution-rules.md). */
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  /** Mic stays off for `MIC_REENABLE_AFTER_TTS_MS` after TTS ends. */
  const [micCooldown, setMicCooldown] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);

  const messagesRef = useRef(messages);
  const inputRef = useRef(input);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const voiceRecognitionRef = useRef<IdeSpeechRecognition | null>(null);
  const voiceDraftRef = useRef('');
  const voiceIdleTimerRef = useRef<number | null>(null);
  const ttsRunIdRef = useRef(0);
  const ttsDebounceTimerRef = useRef<number | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsChunkResolveRef = useRef<(() => void) | null>(null);
  const micCooldownTimerRef = useRef<number | null>(null);
  const liveHandsFreeRecognitionRef = useRef<IdeSpeechRecognition | null>(null);
  const handsFreeIdleTimerRef = useRef<number | null>(null);
  const micInputBlockedRef = useRef(false);
  const sendingRef = useRef(false);
  const isHandsFreeRef = useRef(false);
  const handsFreeResumeAfterTtsRef = useRef(false);

  const micInputBlocked = isTtsPlaying || micCooldown;

  useEffect(() => {
    micInputBlockedRef.current = micInputBlocked;
  }, [micInputBlocked]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  const clearVoiceIdleTimer = () => {
    if (voiceIdleTimerRef.current != null) {
      window.clearTimeout(voiceIdleTimerRef.current);
      voiceIdleTimerRef.current = null;
    }
  };

  const clearMicCooldownTimer = () => {
    if (micCooldownTimerRef.current != null) {
      window.clearTimeout(micCooldownTimerRef.current);
      micCooldownTimerRef.current = null;
    }
  };

  const stopVoiceRecognition = () => {
    clearVoiceIdleTimer();
    const r = voiceRecognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
    voiceDraftRef.current = '';
    setIsRecordingVoice(false);
  };

  const clearHandsFreeIdleTimer = () => {
    if (handsFreeIdleTimerRef.current != null) {
      window.clearTimeout(handsFreeIdleTimerRef.current);
      handsFreeIdleTimerRef.current = null;
    }
  };

  const stopHandsFree = useCallback(() => {
    clearHandsFreeIdleTimer();
    const r = liveHandsFreeRecognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      liveHandsFreeRecognitionRef.current = null;
    }
    isHandsFreeRef.current = false;
    setIsHandsFree(false);
  }, []);

  const interruptVoiceAndTts = useCallback(() => {
    stopVoiceRecognition();
    stopHandsFree();
    handsFreeResumeAfterTtsRef.current = false;
    ttsRunIdRef.current += 1;
    ttsChunkResolveRef.current?.();
    ttsChunkResolveRef.current = null;
    if (ttsDebounceTimerRef.current != null) {
      window.clearTimeout(ttsDebounceTimerRef.current);
      ttsDebounceTimerRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
    const audio = w.nebula_ide_currentAudio;
    w.nebula_ide_currentAudio = null;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
    clearMicCooldownTimer();
    setIsTtsPlaying(false);
    setMicCooldown(false);
  }, [stopHandsFree]);

  const scheduleHandsFreeAutoSend = useCallback(() => {
    clearHandsFreeIdleTimer();
    handsFreeIdleTimerRef.current = window.setTimeout(() => {
      handsFreeIdleTimerRef.current = null;
      const t = inputRef.current.trim();
      if (!t || micInputBlockedRef.current || sendingRef.current) return;
      void sendChatRef.current(t);
    }, VOICE_SILENCE_BEFORE_SEND_MS);
  }, []);

  const startHandsFree = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) {
      setAccessoryHint('Speech recognition is not supported in this browser.');
      window.setTimeout(() => setAccessoryHint(null), 4000);
      return;
    }
    if (micInputBlockedRef.current || sendingRef.current) return;
    stopVoiceRecognition();
    stopHandsFree();
    const SR = (window as unknown as { webkitSpeechRecognition: new () => IdeSpeechRecognition }).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: IdeSpeechRecognitionEvent) => {
      if (!isHandsFreeRef.current || micInputBlockedRef.current || sendingRef.current) return;
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (!finalText) return;
      const next = `${inputRef.current}${inputRef.current ? ' ' : ''}${finalText}`.trim();
      setInput(next);
      inputRef.current = next;
      scheduleHandsFreeAutoSend();
    };

    recognition.onerror = (ev: IdeSpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      console.warn('[AIChat] hands-free speech:', ev.error);
      setAccessoryHint(
        `Open talk: ${ev.error === 'not-allowed' ? 'allow the microphone for this site.' : ev.error}`,
      );
      window.setTimeout(() => setAccessoryHint(null), 4500);
      stopHandsFree();
    };

    recognition.onend = () => {
      if (!isHandsFreeRef.current || micInputBlockedRef.current) return;
      try {
        recognition.start();
      } catch (e) {
        console.warn('[AIChat] hands-free restart', e);
      }
    };

    try {
      recognition.start();
      liveHandsFreeRecognitionRef.current = recognition;
      isHandsFreeRef.current = true;
      setIsHandsFree(true);
      setAccessoryHint('Open talk is on — I listen continuously and send after a short pause when you finish a phrase.');
      window.setTimeout(() => setAccessoryHint(null), 4200);
    } catch (err) {
      console.warn('[AIChat] hands-free start', err);
      setAccessoryHint('Could not start open talk — check browser permissions.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  }, [stopHandsFree, scheduleHandsFreeAutoSend]);

  const toggleHandsFree = useCallback(() => {
    if (isHandsFreeRef.current) {
      stopHandsFree();
      setAccessoryHint('Open talk stopped.');
      window.setTimeout(() => setAccessoryHint(null), 2200);
      return;
    }
    void startHandsFree();
  }, [startHandsFree, stopHandsFree]);

  const startHandsFreeForResumeRef = useRef<() => void>(() => {});

  useEffect(() => {
    startHandsFreeForResumeRef.current = () => {
      void startHandsFree();
    };
  }, [startHandsFree]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        if (!cancelled) setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        if (!cancelled) setServerHasGrokKey(false);
      }
      if (!cancelled) await syncActiveCloudProjectFromSession();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSendError(null);
  }, [activePath]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entries = await fetchConversationLogEntries();
        if (cancelled) return;
        if (entries.length === 0) {
          setMessages([]);
          return;
        }
        setMessages(
          entries.map((e, i) => ({
            id: `log-${i}-${e.iso}`,
            role: e.role === 'user' ? 'user' : 'assistant',
            content: e.role === 'system' ? `[Context]\n${e.body}` : e.body,
            timestamp: formatLogTimestamp(e.iso),
          })),
        );
      } catch (e) {
        console.warn('[AIChat] conversation log load skipped:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diskProjectKey]);

  const scheduleVoiceAutoSend = useCallback((transcript: string) => {
    clearVoiceIdleTimer();
    const t = transcript.trim();
    if (!t) return;
    voiceIdleTimerRef.current = window.setTimeout(() => {
      voiceIdleTimerRef.current = null;
      void sendChatRef.current(t);
    }, VOICE_SILENCE_BEFORE_SEND_MS);
  }, []);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) return;
    const SR = (window as unknown as { webkitSpeechRecognition: new () => IdeSpeechRecognition }).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: IdeSpeechRecognitionEvent) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText) {
        voiceDraftRef.current = `${voiceDraftRef.current}${voiceDraftRef.current ? ' ' : ''}${finalText}`.trim();
        setInput(voiceDraftRef.current);
        inputRef.current = voiceDraftRef.current;
      }
    };

    recognition.onerror = (ev: IdeSpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted') return;
      console.warn('[AIChat] speech recognition:', ev.error);
      setAccessoryHint(`Voice input: ${ev.error === 'not-allowed' ? 'allow the microphone for this site.' : ev.error}`);
      window.setTimeout(() => setAccessoryHint(null), 4500);
      stopVoiceRecognition();
    };

    recognition.onend = () => {
      setIsRecordingVoice(false);
      const draft = voiceDraftRef.current.trim();
      voiceDraftRef.current = '';
      if (isHandsFreeRef.current) return;
      if (draft) {
        scheduleVoiceAutoSend(draft);
      }
    };

    voiceRecognitionRef.current = recognition;
    return () => {
      stopHandsFree();
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      voiceRecognitionRef.current = null;
    };
  }, [scheduleVoiceAutoSend, stopHandsFree]);

  const sendChatRef = useRef<(override?: string) => Promise<void>>(async () => {});

  const sendChat = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? inputRef.current).trim();
    if (!text || sending) return;

    if (micInputBlocked) return;

    if (serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        setServerHasGrokKey(false);
      }
    }

    clearVoiceIdleTimer();
    stopVoiceRecognition();

    const prior = messagesRef.current;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    setMessages((p) => {
      const next = [...p, userMsg];
      messagesRef.current = next;
      return next;
    });
    setInput('');
    inputRef.current = '';
    setSending(true);
    setSendError(null);

    const projectName = getBrowserProjectName().trim() || 'Untitled project';
    const ideAppendix = ideContextSnippetForChat(activePath, activeTab?.content ?? '');

    const historyForApi = [...prior, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    })) as { role: 'user' | 'assistant'; content: string }[];

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';

    try {
      const { assistantContent, planningPhase, claudeFallbackNotice } = await sendIdeAssistantGrokTurn({
        textToSend: text,
        history: historyForApi,
        userId,
        projectName,
        ideAppendix,
      });
      const raw = assistantContent.trim();
      const spoken = stripAssistantTagsForVoice(raw);
      const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const toAppend: Message[] = [];
      if (claudeFallbackNotice?.trim()) {
        toAppend.push({
          id: `fb-${Date.now()}`,
          role: 'assistant',
          content: claudeFallbackNotice.trim(),
          timestamp: ts,
        });
      }
      toAppend.push({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: raw || '(Empty response)',
        timestamp: ts,
      });
      setMessages((p) => {
        const next = [...p, ...toAppend];
        messagesRef.current = next;
        return next;
      });

      try {
        const coding = await handlePostGrokCodingTurn({
          assistantContent: raw,
          planningPhase,
          userId,
          projectName,
          userNote: text,
        });
        if (coding.ran && coding.statusMessage?.trim()) {
          const codeTs = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const statusMsg: Message = {
            id: `code-${Date.now()}`,
            role: 'assistant',
            content: coding.statusMessage.trim(),
            timestamp: codeTs,
          };
          setMessages((p) => {
            const next = [...p, statusMsg];
            messagesRef.current = next;
            return next;
          });
        }
      } catch (codingErr) {
        console.warn('[AIChat] coding apply:', codingErr);
      }

      if (spoken) {
        void playTtsForText(spoken);
      } else {
        handsFreeResumeAfterTtsRef.current = false;
        stopHandsFree();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isKeyHelp =
        msg.includes('Grok API key') ||
        msg.includes('Main AI') ||
        msg.includes('MAIN_AI_API_KEY') ||
        msg.includes('GROK_API_KEY_LUMEN') ||
        msg.includes('GROK_API_KEY') ||
        msg.includes('Grok chat is unavailable') ||
        msg.includes('Please add your Grok') ||
        msg.includes('401') ||
        msg.includes('rejected this API key');
      const isUsageLimit = isMonthlyUsageLimitError(msg);
      setSendError(isKeyHelp || isUsageLimit ? null : msg);
      setMessages((p) => {
        const displayMsg = isUsageLimit ? FREE_TIER_MONTHLY_LIMIT_MESSAGE : msg;
        const next = [
          ...p,
          {
            id: `e-${Date.now()}`,
            role: 'assistant' as const,
            content: isKeyHelp ? displayMsg.replace(/\n\n+/g, '\n\n') : `Something went wrong: ${displayMsg}`,
            timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          },
        ];
        messagesRef.current = next;
        return next;
      });
    } finally {
      setSending(false);
    }
  }, [sending, activePath, activeTab?.content, serverHasGrokKey, micInputBlocked, stopHandsFree]);

  sendChatRef.current = sendChat;

  const playTtsForText = async (plain: string) => {
    if (ttsDebounceTimerRef.current != null) {
      window.clearTimeout(ttsDebounceTimerRef.current);
      ttsDebounceTimerRef.current = null;
    }
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    ttsRunIdRef.current += 1;
    const runId = ttsRunIdRef.current;
    const controller = new AbortController();
    ttsAbortRef.current = controller;

    clearMicCooldownTimer();
    setMicCooldown(false);

    ttsDebounceTimerRef.current = window.setTimeout(async () => {
      ttsDebounceTimerRef.current = null;
      if (runId !== ttsRunIdRef.current) return;

      const chunks = splitTextForTts(plain);
      if (chunks.length === 0) {
        handsFreeResumeAfterTtsRef.current = false;
        return;
      }

      const resumeHandsFree = isHandsFreeRef.current;
      stopVoiceRecognition();
      stopHandsFree();
      handsFreeResumeAfterTtsRef.current = resumeHandsFree;

      setIsTtsPlaying(true);

      const finishPlayback = () => {
        if (runId !== ttsRunIdRef.current) return;
        setIsTtsPlaying(false);
        const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
        w.nebula_ide_currentAudio = null;
        if (ttsObjectUrlRef.current) {
          URL.revokeObjectURL(ttsObjectUrlRef.current);
          ttsObjectUrlRef.current = null;
        }
        setMicCooldown(true);
        clearMicCooldownTimer();
        micCooldownTimerRef.current = window.setTimeout(() => {
          micCooldownTimerRef.current = null;
          setMicCooldown(false);
          if (handsFreeResumeAfterTtsRef.current) {
            handsFreeResumeAfterTtsRef.current = false;
            if (!micInputBlockedRef.current && !sendingRef.current) {
              startHandsFreeForResumeRef.current();
            }
          }
        }, MIC_REENABLE_AFTER_TTS_MS);
      };

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (runId !== ttsRunIdRef.current || controller.signal.aborted) {
            finishPlayback();
            return;
          }
          const speakRes = await fetch(withProjectQuery('/api/speak'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ text: chunks[i] }),
            signal: controller.signal,
          });
          if (!speakRes.ok) {
            const errBody = await speakRes.text();
            throw new Error(`TTS failed (${speakRes.status}): ${errBody.slice(0, 120)}`);
          }
          const audioBlob = await speakRes.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          if (ttsObjectUrlRef.current) URL.revokeObjectURL(ttsObjectUrlRef.current);
          ttsObjectUrlRef.current = audioUrl;

          await new Promise<void>((resolve) => {
            if (runId !== ttsRunIdRef.current) {
              URL.revokeObjectURL(audioUrl);
              resolve();
              return;
            }
            const audio = new Audio(audioUrl);
            const w = window as unknown as { nebula_ide_currentAudio?: HTMLAudioElement | null };
            w.nebula_ide_currentAudio = audio;
            let doneOnce = false;
            const done = () => {
              if (doneOnce) return;
              doneOnce = true;
              ttsChunkResolveRef.current = null;
              try {
                URL.revokeObjectURL(audioUrl);
              } catch {
                /* ignore */
              }
              if (ttsObjectUrlRef.current === audioUrl) ttsObjectUrlRef.current = null;
              resolve();
            };
            ttsChunkResolveRef.current = done;
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch((err) => {
              if ((err as { name?: string })?.name !== 'AbortError') {
                console.warn('[AIChat] TTS playback', err);
              }
              done();
            });
          });
        }
        finishPlayback();
      } catch (e) {
        const aborted = (e as { name?: string })?.name === 'AbortError';
        if (!aborted && runId === ttsRunIdRef.current) {
          console.warn('[AIChat] TTS', e);
        }
        finishPlayback();
      }
    }, TTS_START_DEBOUNCE_MS);
  };

  const toggleVoiceMic = () => {
    if (sending || micInputBlocked) return;
    const r = voiceRecognitionRef.current;
    if (!r) {
      setAccessoryHint('Speech recognition is not supported in this browser.');
      window.setTimeout(() => setAccessoryHint(null), 4000);
      return;
    }
    if (isRecordingVoice) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    stopHandsFree();
    clearVoiceIdleTimer();
    voiceDraftRef.current = '';
    try {
      r.start();
      setIsRecordingVoice(true);
    } catch (err) {
      console.warn('[AIChat] mic start', err);
      setAccessoryHint('Could not start the microphone — check browser permissions.');
      window.setTimeout(() => setAccessoryHint(null), 4500);
    }
  };

  useEffect(() => {
    return () => {
      interruptVoiceAndTts();
    };
  }, [interruptVoiceAndTts]);

  const showGrokKeyBanner = serverHasGrokKey === false;

  const handleGo = useCallback(async () => {
    const userNote = inputRef.current.trim();
    if (sending || micInputBlocked) return;

    if (serverHasGrokKey === null) {
      try {
        const r = await fetch(withProjectQuery('/api/config'), { credentials: 'include' });
        const cfg = (await readResponseJson(r)) as { hasMainAiApiKey?: boolean; hasGrokApiKey?: boolean };
        setServerHasGrokKey(r.ok && serverReportsMainAiKey(cfg));
      } catch {
        setServerHasGrokKey(false);
      }
    }

    clearVoiceIdleTimer();
    stopVoiceRecognition();

    const ts = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const userMsg: Message = {
      id: `go-${Date.now()}`,
      role: 'user',
      content: userNote ? `Go — ${userNote}` : 'Go — implement project',
      timestamp: ts,
    };
    setMessages((p) => {
      const next = [...p, userMsg];
      messagesRef.current = next;
      return next;
    });
    setInput('');
    inputRef.current = '';
    setSending(true);
    setSendError(null);
    setAccessoryHint('Grok 4 summary → Grok Code → writing files to workspace…');

    const session = await fetchSessionUser();
    const userId = session?.uid?.trim() || 'anonymous';
    const projectName = getBrowserProjectName().trim() || 'Untitled project';

    try {
      const go = await runGoCodeAndApply({ userId, projectName, userNote });
      const statusMsg: Message = {
        id: `go-${Date.now()}-status`,
        role: 'assistant',
        content: go.statusMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((p) => {
        const next = [...p, statusMsg];
        messagesRef.current = next;
        return next;
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Go failed');
    } finally {
      setSending(false);
      setAccessoryHint(null);
    }
  }, [micInputBlocked, sending, serverHasGrokKey, stopVoiceRecognition]);

  return (
    <div className="surface-active tonal-seam-l flex h-full flex-col">
      <div className="tonal-seam-b flex h-9 shrink-0 flex-wrap items-center gap-2 px-3">
        <div className="type-label-sm flex items-center gap-1.5 text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
          Model: <span className="text-foreground">{modelLabel[chatModel] ?? chatModel}</span>
          <span className="text-muted-foreground/80">(IDE uses Grok 4.1 + server MAIN_AI_API_KEY)</span>
        </div>
      </div>

      {showGrokKeyBanner ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-amber-500/12 to-transparent px-3 py-3"
          role="status"
        >
          <p className="type-label-sm font-headline text-amber-100">Grok is not configured on the server</p>
          <p className="type-body-md mt-1 leading-relaxed text-amber-50/95">{MAIN_AI_CHAT_SETUP_HINT}</p>
        </div>
      ) : null}

      {accessoryHint ? (
        <p
          className="type-label-sm shrink-0 border-b border-border/70 bg-muted/25 px-3 py-1.5 text-muted-foreground"
          role="status"
        >
          {accessoryHint}
        </p>
      ) : null}

      {sendError ? (
        <p className="type-label-sm border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-red-100/95" role="alert">
          {sendError}
        </p>
      ) : null}

      <div className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && !sending ? (
          <div className="type-body-md text-muted-foreground leading-relaxed space-y-2">
            {serverHasGrokKey === null ? (
              <p>Checking connection to the server…</p>
            ) : serverHasGrokKey ? (
              <>
                <p className="text-foreground/90 font-headline text-sm">IDE chat</p>
                <p>
                  Grok 4.1 is the default model here. Messages use the server <code className="text-foreground/90">MAIN_AI_API_KEY</code>{' '}
                  (per <code className="text-foreground/90">project-execution-rules.md</code>). Your open file, master plan, and UI Studio
                  context are included with each turn.
                </p>
                <p>
                  <strong className="text-foreground/90">Voice</strong> (same doc): tap the <strong className="text-foreground/90">wave</strong>{' '}
                  icon for <strong className="text-foreground/90">open talk</strong> (continuous listen + auto-send after a short pause), or
                  the <strong className="text-foreground/90">microphone</strong> for a single push-to-talk phrase. Grok transcribes your speech,
                  Grok 4.1 replies, then TTS reads the answer aloud. The mic is off while TTS plays; after playback it stays muted for{' '}
                  {MIC_REENABLE_AFTER_TTS_MS / 1000}s, then the mic can turn on again (open talk resumes automatically if it was on before the
                  reply).
                </p>
              </>
            ) : (
              <>
                <p className="text-amber-200/95 font-headline text-sm">Grok is not available on this server</p>
                <p>
                  The API reports no usable <code className="text-foreground/90">MAIN_AI_API_KEY</code>. Set it in the project
                  root <code className="text-foreground/90">.env</code> (key must be at least 20 characters after trimming),
                  restart <code className="text-foreground/90">npm run dev</code>, and reload the page.
                </p>
              </>
            )}
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('flex gap-2', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                message.role === 'user' ? 'surface-float' : 'active-tab-sheen text-primary',
              )}
            >
              {message.role === 'user' ? (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className={cn('max-w-[85%]', message.role === 'user' ? 'text-right' : 'text-left')}>
              <div
                className={cn(
                  'type-body-md inline-block rounded-lg px-3 py-2',
                  message.role === 'user' ? 'surface-float text-primary' : 'surface-active text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              <p className="type-label-sm mt-0.5 opacity-80">{message.timestamp}</p>
            </div>
          </div>
        ))}

        {sending ? (
          <div className="flex gap-2">
            <div className="active-tab-sheen flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="surface-active flex items-center gap-1 rounded-lg px-3 py-2">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="tonal-seam-t shrink-0 p-3">
        <div className="surface-float rounded-lg border border-transparent p-2 ring-1 ring-[color-mix(in_srgb,var(--outline-variant)_12%,transparent)] transition-[box-shadow,background-color] duration-300 ease-out focus-within:ring-[color-mix(in_srgb,var(--outline-variant)_22%,transparent)]">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              inputRef.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendChat();
              }
            }}
            placeholder="Message Grok…"
            rows={3}
            disabled={sending || micInputBlocked}
            className="type-body-md min-h-[4.5rem] w-full resize-y bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label={isHandsFree ? 'Stop open talk (hands-free)' : 'Start open talk (hands-free)'}
                onClick={() => toggleHandsFree()}
                disabled={sending || micInputBlocked}
              >
                <SoundWaveIcon
                  className={cn(isHandsFree ? 'text-primary' : '', micInputBlocked ? 'opacity-50' : '')}
                />
              </ChatRoundButton>
              <ChatRoundButton
                label="Interrupt Grok voice"
                onClick={() => {
                  interruptVoiceAndTts();
                  setAccessoryHint('Stopped voice playback and any pending dictation send.');
                  window.setTimeout(() => setAccessoryHint(null), 3200);
                }}
              >
                <Hand className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <ChatRoundButton
                label={isRecordingVoice ? 'Stop dictation' : 'Speak (push-to-talk)'}
                onClick={() => toggleVoiceMic()}
                disabled={sending || micInputBlocked || isHandsFree}
              >
                <Mic
                  className={cn(
                    'h-[18px] w-[18px]',
                    isRecordingVoice ? 'text-destructive' : '',
                    micInputBlocked || isHandsFree ? 'opacity-50' : '',
                  )}
                />
              </ChatRoundButton>
            </div>

            <div className="flex items-center gap-1.5">
              <ChatRoundButton
                label="Attach file"
                onClick={() => {
                  setAccessoryHint('Attach files in the main Assistant sidebar (stored in Cloudflare R2).');
                  window.setTimeout(() => setAccessoryHint(null), 4200);
                }}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </ChatRoundButton>
              <button
                type="button"
                onClick={handleGo}
                disabled={!input.trim() || sending || micInputBlocked}
                className="btn-primary-cta flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] disabled:opacity-40"
              >
                <Rocket className="h-3.5 w-3.5" />
                Go
              </button>
              <ChatRoundButton
                label="Send message"
                onClick={() => void sendChat()}
                disabled={!input.trim() || sending || micInputBlocked}
              >
                <Send className="h-[18px] w-[18px]" />
              </ChatRoundButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
