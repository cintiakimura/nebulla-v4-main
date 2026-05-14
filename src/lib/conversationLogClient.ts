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
