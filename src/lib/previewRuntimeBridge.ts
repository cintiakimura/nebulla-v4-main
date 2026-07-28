/**
 * Preview iframe → App Status bridge.
 * Same-origin / bootstrap previews: inject listeners + postMessage.
 * Cross-origin (e.g. v0 live): parent-only load error reporting.
 */

import { reportAppRuntimeIssue } from './ideAppRuntimeStatus';

export const PREVIEW_RUNTIME_MSG_SOURCE = 'nebulla-preview-runtime';

const INJECT_FLAG = '__nebullaPreviewRuntimeBridge';

/** Tiny script injected into same-origin preview documents. */
export const PREVIEW_RUNTIME_BRIDGE_SCRIPT = `
(function(){
  if (window.${INJECT_FLAG}) return;
  window.${INJECT_FLAG} = true;
  function send(payload){
    try {
      parent.postMessage(Object.assign({ source: '${PREVIEW_RUNTIME_MSG_SOURCE}' }, payload), '*');
    } catch (e) {}
  }
  function routeOf(){
    try {
      return (location.hash || location.pathname || '').slice(0, 200);
    } catch (e) { return ''; }
  }
  window.addEventListener('error', function(ev){
    var msg = (ev && ev.message) ? String(ev.message) : 'Script error';
    var stack = ev && ev.error && ev.error.stack ? String(ev.error.stack) : '';
    send({ type: 'runtime-error', message: msg, stack: stack, href: String(location.href||''), route: routeOf() });
  });
  window.addEventListener('unhandledrejection', function(ev){
    var reason = ev && ev.reason;
    var msg = reason && reason.message ? String(reason.message) : String(reason || 'Unhandled promise rejection');
    var stack = reason && reason.stack ? String(reason.stack) : '';
    send({ type: 'runtime-error', message: msg, stack: stack, href: String(location.href||''), route: routeOf() });
  });
  var errCount = 0;
  var origError = console.error;
  console.error = function(){
    try {
      if (errCount < 8) {
        errCount++;
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          parts.push(a && a.stack ? String(a.stack) : String(a));
        }
        var joined = parts.join(' ').slice(0, 500);
        if (joined && !/Download the React DevTools|third-party|extension/i.test(joined)) {
          send({ type: 'console-error', message: joined, href: String(location.href||''), route: routeOf() });
        }
      }
    } catch (e) {}
    return origError.apply(console, arguments);
  };
})();
`.trim();

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

function isPreviewRuntimeMessage(data: unknown): data is {
  source: string;
  type?: string;
  message?: string;
  stack?: string;
  href?: string;
  route?: string;
} {
  return Boolean(
    data &&
      typeof data === 'object' &&
      (data as { source?: string }).source === PREVIEW_RUNTIME_MSG_SOURCE,
  );
}

/** Parent-window listener; call once from AppPreviewPanel / IDE shell. */
export function installPreviewRuntimeMessageListener(): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isPreviewRuntimeMessage(event.data)) return;
    const msg = String(event.data.message || '').trim();
    if (!msg) return;
    reportAppRuntimeIssue({
      technicalMessage: msg,
      stack: event.data.stack,
      href: event.data.href,
      route: event.data.route,
      source: event.data.type === 'console-error' ? 'preview' : 'preview',
    });
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
