export enum Type {
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  STRING = "STRING",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  BOOLEAN = "BOOLEAN",
  ARRAY = "ARRAY",
  OBJECT = "OBJECT",
  NULL = "NULL",
}

export enum Modality {
  MODALITY_UNSPECIFIED = "MODALITY_UNSPECIFIED",
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
}

import { fetchJson } from './apiFetch';
import { getStoredGrokApiKey } from './grokKey';

/**
 * Simple GROK client
 */
export async function sendToGrok(message: string) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const stored = getStoredGrokApiKey();
    if (stored) headers['X-Grok-Api-Key'] = stored;

    const data = await fetchJson<{ text?: string; message?: string }>('/api/grok/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
    });
    return data.text || data.message || data;
  } catch (error) {
    console.error('Error calling Grok API:', error);
    throw error;
  }
}