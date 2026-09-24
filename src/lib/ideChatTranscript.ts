/**
 * Durable per-project chat transcript (local). Survives refresh and long turns
 * even if the server log is late or the project label changed.
 */

import type { ConversationLogEntryDTO } from './conversationLogClient';
import { isHiddenBootstrapUserMessage, type IdeChatMessage } from './ideChatBootstrap';

const PREFIX = 'nebula_chat_transcript_v1:';

export type StoredChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  iso?: string;
};

function storageKey(projectKey: string): string {
  const k = String(projectKey || 'default').trim() || 'default';
  return `${PREFIX}${k}`;
}

export function persistIdeChatTranscript(projectKey: string, messages: StoredChatTurn[]): void {
  if (typeof localStorage === 'undefined') return;
  const visible = (messages || []).filter((m) => {
    if (!m?.content?.trim()) return false;
    if (m.role === 'user' && isHiddenBootstrapUserMessage(m.content)) return false;
    return m.role === 'user' || m.role === 'assistant';
  });
  try {
    localStorage.setItem(
      storageKey(projectKey),
      JSON.stringify({
        projectKey,
        updatedAt: new Date().toISOString(),
        messages: visible,
      }),
    );
  } catch {
    /* quota */
  }
}

export function loadIdeChatTranscript(projectKey: string): StoredChatTurn[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(projectKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: StoredChatTurn[] };
    if (!Array.isArray(parsed.messages)) return [];
    return parsed.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content?.trim());
  } catch {
    return [];
  }
}

export function mergeChatTranscripts(
  server: ConversationLogEntryDTO[] | StoredChatTurn[],
  local: StoredChatTurn[],
): IdeChatMessage[] {
  const out: IdeChatMessage[] = [];
  const seen = new Set<string>();
  const push = (m: { id?: string; role: string; content: string; timestamp?: string; iso?: string }) => {
    if (m.role !== 'user' && m.role !== 'assistant') return;
    const content = String(m.content || '').trim();
    if (!content) return;
    if (m.role === 'user' && isHiddenBootstrapUserMessage(content)) return;
    const stamp = m.timestamp || (m.iso ? new Date(m.iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
    const dedupe = `${m.role}:${content.slice(0, 240)}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push({
      id: m.id || `log-${out.length}-${m.iso || stamp}`,
      role: m.role,
      content,
      timestamp: stamp || new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    });
  };
  for (const e of server || []) {
    push({
      id: 'iso' in e && e.iso ? `log-${e.iso}` : undefined,
      role: e.role,
      content: 'body' in e && typeof (e as ConversationLogEntryDTO).body === 'string'
        ? (e as ConversationLogEntryDTO).body
        : (e as StoredChatTurn).content,
      iso: 'iso' in e ? e.iso : (e as StoredChatTurn).iso,
      timestamp: (e as StoredChatTurn).timestamp,
    });
  }
  for (const e of local || []) push(e);
  return out;
}

export function threadHasAssistantBeat(messages: { role?: string; content?: string }[]): boolean {
  return (messages || []).some((m) => m.role === 'assistant' && String(m.content || '').trim());
}
