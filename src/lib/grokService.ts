/**
 * Chat service for Nebulla — multi-provider via `/api/grok/chat` (default Grok).
 */

import { fetchJson } from './apiFetch';
import { DEFAULT_AI_CHAT_MODEL, resolveAiChatSelection, type AiChatModelId } from './aiProvider';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send messages through the provider-agnostic chat façade.
 */
export async function sendToGROK(
  messages: ChatMessage[],
  opts?: { chatModel?: AiChatModelId | string },
): Promise<string> {
  const selection = resolveAiChatSelection(opts?.chatModel ?? DEFAULT_AI_CHAT_MODEL);
  try {
    const data = await fetchJson<{ choices?: { message?: { content?: string } }[] }>(
      '/api/grok/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages,
          chatModel: selection.chatModel,
          aiProvider: selection.aiProvider,
        }),
      },
    );
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling AI chat:', error);
    throw error;
  }
}

/** Alias — same façade; name clarifies multi-provider support. */
export const sendToAiChat = sendToGROK;
