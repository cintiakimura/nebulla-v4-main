/**
 * Preview iframe → App Status bridge.
 * Same-origin workspace bootstrap: inject listeners + postMessage.
 * IDE App Preview is workspace-only (no cross-origin v0 live iframe).
 */

import { reportAppRuntimeIssue, type AppRuntimeIssueSource } from './ideAppRuntimeStatus';
import {
  PREVIEW_RUNTIME_BRIDGE_SCRIPT,
  PREVIEW_RUNTIME_MSG_SOURCE,
  wrapHtmlWithPreviewRuntimeBridge,
} from './previewRuntimeBridgeScript';

export {
  PREVIEW_RUNTIME_BRIDGE_SCRIPT,
  PREVIEW_RUNTIME_MSG_SOURCE,
  wrapHtmlWithPreviewRuntimeBridge,
} from './previewRuntimeBridgeScript';
export { emptyPreviewHtmlWithBridge, PREVIEW_RUNTIME_BOOTSTRAP_MARKER } from './previewRuntimeBridgeScript';

const INJECT_FLAG = '__nebullaPreviewRuntimeBridge';

export function injectPreviewRuntimeBridge(win: Window | null): boolean {
  if (!win) return false;
  try {
    const doc = win.document;
    if (!doc?.documentElement) return false;
    if ((win as unknown as Record<string, unknown>)[INJECT_FLAG]) return true;
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.text = PREVIEW_RUNTIME_BRIDGE_SCRIPT;
    (doc.head || doc.documentElement).appendChild(script);
    return true;
  } catch {
    return false;
  }
}

export type PreviewRuntimeMessage = {
  source: string;
  type?: string;
  message?: string;
  stack?: string;
  href?: string;
  route?: string;
};

export function isPreviewRuntimeMessage(data: unknown): data is PreviewRuntimeMessage {
  return Boolean(
    data &&
      typeof data === 'object' &&
      (data as { source?: string }).source === PREVIEW_RUNTIME_MSG_SOURCE,
  );
}

export function sourceFromPreviewRuntimeType(type?: string): AppRuntimeIssueSource {
  if (type === 'network-error') return 'network';
  if (type === 'build-error') return 'build';
  return 'preview';
}

/** Apply a bridge postMessage payload into App Status (testable without DOM events). */
export function ingestPreviewRuntimeMessage(data: unknown): boolean {
  if (!isPreviewRuntimeMessage(data)) return false;
  const msg = String(data.message || '').trim();
  if (!msg) return false;
  reportAppRuntimeIssue({
    technicalMessage: msg,
    stack: data.stack,
    href: data.href,
    route: data.route,
    source: sourceFromPreviewRuntimeType(data.type),
  });
  return true;
}

/** Parent-window listener; call once from AppPreviewPanel / IDE shell. */
export function installPreviewRuntimeMessageListener(): () => void {
  const onMessage = (event: MessageEvent) => {
    ingestPreviewRuntimeMessage(event.data);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

export function reportPreviewLoadFailure(reason?: string): void {
  reportAppRuntimeIssue({
    technicalMessage: reason?.trim() || 'Preview iframe failed to load',
    source: 'build',
  });
}

/** Bootstrap / meta API non-OK → App Status (deduped by fingerprint). */
export function reportPreviewBootstrapFailure(reason?: string): void {
  reportAppRuntimeIssue({
    technicalMessage: reason?.trim() || 'Preview bootstrap failed',
    source: 'build',
  });
}
