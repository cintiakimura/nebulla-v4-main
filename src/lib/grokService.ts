/**
 * GROK Service for Nebulla
 * Handles communication with GROK 4.1 (The unified reasoning model)
 */

import { fetchJson } from './apiFetch';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Send a message to GROK 4.1
 */
export async function sendToGROK(messages: ChatMessage[]): Promise<string> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const data = await fetchJson<{ choices?: { message?: { content?: string } }[] }>(
      '/api/grok/chat',
      {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          messages,
          model: 'grok-4-1-fast-reasoning',
        }),
      }
    );
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Error calling GROK 4.1:', error);
    throw error;
  }
}
