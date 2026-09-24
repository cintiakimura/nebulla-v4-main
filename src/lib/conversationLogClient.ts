/**
 * Client access to persisted chat history (`conversationLog.ts` on the server).
 * Uses `withProjectQuery` so logs are scoped by `projectKey` + optional `projectName` label.
 */

import { fetchJson } from './apiFetch';
import { withProjectQuery } from './nebulaProjectApi';

export type ConversationLogEntryDTO = {
  iso: string;
  role: 'user' | 'assistant' | 'system';
  body: string;
};

export async function fetchConversationLogEntries(): Promise<ConversationLogEntryDTO[]> {
  const data = await fetchJson<{ entries?: ConversationLogEntryDTO[] }>(withProjectQuery('/api/conversation-log'));
  return Array.isArray(data.entries) ? data.entries : [];
}

/** Persist one visible turn immediately so a long generation cannot drop the first half. */
export async function persistConversationTurn(role: 'user' | 'assistant', body: string): Promise<void> {
  const text = String(body || '').trim();
  if (!text) return;
  await fetchJson(withProjectQuery('/api/conversation-log'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, body: text }),
  });
}
