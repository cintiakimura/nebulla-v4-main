/**
 * Shared preview runtime bridge script (no DOM imports).
 * Used by client inject + server bootstrap HTML so capture starts before onload.
 */

export const PREVIEW_RUNTIME_MSG_SOURCE = 'nebulla-preview-runtime';

const INJECT_FLAG = '__nebullaPreviewRuntimeBridge';

/** Marker comment — avoid double-injecting into bootstrap HTML. */
export const PREVIEW_RUNTIME_BOOTSTRAP_MARKER = '<!--nebulla-preview-runtime-bridge-->';

/** Tiny script for same-origin preview documents (error / fetch → parent postMessage). */
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
  var netCount = 0;
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      var method = 'GET';
      var url = '';
      try {
        if (typeof input === 'string') url = input;
        else if (input && typeof input.url === 'string') url = input.url;
        if (init && init.method) method = String(init.method).toUpperCase();
        else if (input && input.method) method = String(input.method).toUpperCase();
      } catch (e) {}
      return origFetch(input, init).then(function(res){
        try {
          if (netCount < 8 && res && !res.ok && res.status >= 400) {
            netCount++;
            var path = String(url || '').slice(0, 180);
            send({
              type: 'network-error',
              message: method + ' ' + path + ' → ' + res.status,
              href: String(location.href||''),
              route: routeOf()
            });
          }
        } catch (e) {}
        return res;
      }).catch(function(err){
        try {
          if (netCount < 8) {
            netCount++;
            var path2 = String(url || '').slice(0, 180);
            var em = err && err.message ? String(err.message) : String(err || 'fetch failed');
            send({
              type: 'network-error',
              message: 'fetch failed: ' + method + ' ' + path2 + ' — ' + em.slice(0, 200),
              href: String(location.href||''),
              route: routeOf()
            });
          }
        } catch (e) {}
        throw err;
      });
    };
  }
})();
`.trim();

/**
 * Inject bridge as the first script in <head> (or before </body> / append).
 * Idempotent via marker comment.
 */
export function wrapHtmlWithPreviewRuntimeBridge(html: string): string {
  const raw = String(html || '');
  if (!raw.trim()) return raw;
  if (raw.includes(PREVIEW_RUNTIME_BOOTSTRAP_MARKER) || raw.includes(INJECT_FLAG)) {
    return raw;
  }
  const tag = `${PREVIEW_RUNTIME_BOOTSTRAP_MARKER}<script>${PREVIEW_RUNTIME_BRIDGE_SCRIPT}</script>`;
  if (/<head([^>]*)>/i.test(raw)) {
    return raw.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  if (/<html([^>]*)>/i.test(raw)) {
    return raw.replace(/<html([^>]*)>/i, `<html$1><head>${tag}</head>`);
  }
  return `${tag}${raw}`;
}

/** Empty-workspace shell that also notifies parent (build). */
export function emptyPreviewHtmlWithBridge(): string {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>No preview</title></head><body style="background:#0a1628;color:#94a3b8;font-family:system-ui;padding:2rem">No <code>index.html</code> in this workspace yet. Use <strong>Go</strong> to generate the app, then open Preview again.<script>
(function(){
  try {
    parent.postMessage({
      source: '${PREVIEW_RUNTIME_MSG_SOURCE}',
      type: 'build-error',
      message: 'No index.html in workspace — preview shell only',
      href: String(location.href||''),
      route: ''
    }, '*');
  } catch (e) {}
})();
</script></body></html>`;
  return wrapHtmlWithPreviewRuntimeBridge(body);
}
