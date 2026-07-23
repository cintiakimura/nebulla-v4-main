export enum Type {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  INTEGER = 'INTEGER',
  BOOLEAN = 'BOOLEAN',
  ARRAY = 'ARRAY',
  OBJECT = 'OBJECT',
  NULL = 'NULL',
}

export enum Modality {
  MODALITY_UNSPECIFIED = 'MODALITY_UNSPECIFIED',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

import { fetchJson } from './apiFetch';
import { DEFAULT_AI_CHAT_MODEL, resolveAiChatSelection, type AiChatModelId } from './aiProvider';

/**
 * Simple chat client via the multi-provider `/api/grok/chat` façade (default Grok).
 */
export async function sendToGrok(
  message: string,
  opts?: { chatModel?: AiChatModelId | string },
) {
  const selection = resolveAiChatSelection(opts?.chatModel ?? DEFAULT_AI_CHAT_MODEL);
  try {
    const data = await fetchJson<{
      text?: string;
      message?: string;
      choices?: { message?: { content?: string } }[];
    }>('/api/grok/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        chatModel: selection.chatModel,
        aiProvider: selection.aiProvider,
        messages: [{ role: 'user', content: message }],
      }),
    });
    return data.choices?.[0]?.message?.content || data.text || data.message || data;
  } catch (error) {
    console.error('Error calling AI chat API:', error);
    throw error;
  }
}

/** @deprecated Prefer {@link sendToGrok} with an explicit model id. */
export const sendToAiChat = sendToGrok;
