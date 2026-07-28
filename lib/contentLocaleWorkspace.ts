/**
 * Persist CONTENT_LOCALE for server-side consumers (v0 prompt builder).
 * Authority: nebulla-project/language-system.md
 */

import fs from 'fs';
import path from 'path';

export const CONTENT_LOCALE_REL = 'nebulla-ide/content-locale.json';

const SUPPORTED = new Set(['en', 'fr', 'it', 'es', 'de']);

export function readWorkspaceContentLocale(workspaceRoot: string): string | undefined {
  try {
    const abs = path.join(workspaceRoot, CONTENT_LOCALE_REL);
    if (!fs.existsSync(abs)) return undefined;
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as { contentLocale?: string };
    const code = String(raw.contentLocale || '').trim().toLowerCase();
    return SUPPORTED.has(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

export function writeWorkspaceContentLocale(
  workspaceRoot: string,
  contentLocale: string,
): void {
  const code = String(contentLocale || '').trim().toLowerCase();
  if (!SUPPORTED.has(code)) return;
  const abs = path.join(workspaceRoot, CONTENT_LOCALE_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    JSON.stringify({ contentLocale: code, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
}
