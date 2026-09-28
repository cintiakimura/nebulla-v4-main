/**
 * Preview canvas must never show leftover TS/JS source.
 * Client-safe (no fs).
 */

export const PREVIEW_RENDER_FIX_LABEL = "First version on disk — preview needs a render fix";
export const PREVIEW_FAILED_RENDER_LINE = "Preview failed to render";

const SOURCE_LEAK_RE =
  /\b(useState|useEffect|useMemo|useCallback|useRef|useReducer)\b|\breturn\s*\(|\bexport\s+default\b|\bfrom\s+['"]react['"]|\bimport\s+(\{|['"]react)|\b['"]use client['"]|\bconst\s+\[\s*\w+|\bfunction\s+[A-Z]\w*\s*\(|\bclassName=\{/;

export function previewTextLooksLikeLeakedSource(text: string): boolean {
  const t = String(text || "");
  if (!t.trim()) return false;
  return SOURCE_LEAK_RE.test(t);
}

export function previewHtmlHasLeakedSource(html: string): boolean {
  const raw = String(html || "");
  if (!raw.trim()) return false;
  const main = raw.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || raw;
  const text = main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
  return previewTextLooksLikeLeakedSource(text);
}

function scrapePreviewDocumentText(doc: {
  body?: { innerText?: string; textContent?: string | null; innerHTML?: string } | null;
  documentElement?: { innerText?: string; innerHTML?: string } | null;
  querySelectorAll?: (sel: string) => ArrayLike<{ innerText?: string; textContent?: string | null }>;
}): string {
  const bits: string[] = [];
  const body = doc.body;
  if (body) {
    bits.push(String(body.innerText || ""));
    bits.push(String(body.textContent || ""));
    bits.push(String(body.innerHTML || ""));
  }
  const root = doc.documentElement;
  if (root) {
    bits.push(String(root.innerText || ""));
    bits.push(String(root.innerHTML || ""));
  }
  try {
    const nodes = doc.querySelectorAll?.("pre, code, textarea") || [];
    for (let i = 0; i < nodes.length; i++) {
      bits.push(String(nodes[i].innerText || nodes[i].textContent || ""));
    }
  } catch {
    /* ignore */
  }
  return bits.join("\n");
}

function sourcePathFromPreviewDoc(doc: {
  querySelector?: (sel: string) => { getAttribute?: (n: string) => string | null } | null;
}): string {
  try {
    const meta = doc.querySelector?.('meta[name="nebulla-next-source"]');
    const fromMeta = String(meta?.getAttribute?.("content") || "").trim();
    if (fromMeta && !/[<>]/.test(fromMeta)) return fromMeta;
  } catch {
    /* ignore */
  }
  return "app/page.tsx";
}

export function buildPreviewFailedHtml(filePath: string): string {
  const rel = String(filePath || "app/page.tsx").replace(/[<>]/g, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="nebulla-preview" content="next-app-live"/>
<meta name="nebulla-preview-failed" content="1"/>
<title>Preview failed</title>
<style>
html,body{margin:0;background:#0B1220;color:#E8EEF6;font-family:ui-sans-serif,system-ui,sans-serif}
header,main{padding:16px}
</style>
</head>
<body>
<header><strong>Live</strong></header>
<main>
<p>${PREVIEW_FAILED_RENDER_LINE}</p>
<p>${rel}</p>
</main>
</body>
</html>`;
}

function writePreviewFailedBody(
  doc: { body?: { innerHTML?: string } | null; documentElement?: { setAttribute?: (k: string, v: string) => void } | null },
  filePath: string,
): void {
  const rel = String(filePath || "app/page.tsx").replace(/[<>]/g, "");
  try {
    doc.documentElement?.setAttribute?.("data-nebulla-source-scrubbed", "1");
  } catch {
    /* ignore */
  }
  if (doc.body) {
    doc.body.innerHTML = `<header><strong>Live</strong></header><main><p>${PREVIEW_FAILED_RENDER_LINE}</p><p>${rel}</p></main>`;
  }
}

/** Replace leaked JS in an iframe document. Returns true if the canvas was rewritten. */
export function scrubPreviewDocumentIfSourceLeaked(
  doc: {
    body?: { innerText?: string; textContent?: string | null; innerHTML?: string } | null;
    documentElement?: {
      innerText?: string;
      innerHTML?: string;
      getAttribute?: (n: string) => string | null;
      setAttribute?: (k: string, v: string) => void;
    } | null;
    querySelector?: (sel: string) => { getAttribute?: (n: string) => string | null } | null;
    querySelectorAll?: (sel: string) => ArrayLike<{ innerText?: string; textContent?: string | null }>;
  } | null | undefined,
  filePath = "app/page.tsx",
): boolean {
  if (!doc?.body) return false;
  try {
    if (doc.documentElement?.getAttribute?.("data-nebulla-source-scrubbed") === "1") return false;
  } catch {
    /* continue */
  }
  const text = scrapePreviewDocumentText(doc);
  if (!previewTextLooksLikeLeakedSource(text)) return false;
  writePreviewFailedBody(doc, sourcePathFromPreviewDoc(doc) || filePath);
  return true;
}

/** Parent iframe onLoad — same-origin only. Re-runs shortly after paint. */
export function attachPreviewIframeSourceScrub(iframe: HTMLIFrameElement | null | undefined): boolean {
  if (!iframe) return false;
  const run = (): boolean => {
    try {
      return scrubPreviewDocumentIfSourceLeaked(iframe.contentDocument, "app/page.tsx");
    } catch {
      return false;
    }
  };
  const first = run();
  try {
    const w = iframe.contentWindow;
    if (w?.requestAnimationFrame) w.requestAnimationFrame(() => run());
  } catch {
    /* ignore */
  }
  try {
    window.setTimeout(run, 50);
    window.setTimeout(run, 200);
  } catch {
    /* ignore */
  }
  return first;
}

/**
 * Runs inside the preview document (bootstrap inject). Keep in sync with SOURCE_LEAK_RE.
 */
export const PREVIEW_SOURCE_SCRUB_INLINE_SCRIPT = `
(function(){
  if (window.__nebullaPreviewSourceScrub) return;
  window.__nebullaPreviewSourceScrub = true;
  var RE = /\\b(useState|useEffect|useMemo|useCallback|useRef|useReducer)\\b|\\breturn\\s*\\(|\\bexport\\s+default\\b|\\bfrom\\s+['"]react['"]|\\bimport\\s+(\\{|['"]react)|\\b['"]use client['"]|\\bconst\\s+\\[\\s*\\w+|\\bfunction\\s+[A-Z]\\w*\\s*\\(|\\bclassName=\\{/;
  function leaked(t){ return RE.test(String(t||'')); }
  function scrape(){
    try {
      var d = document;
      var bits = [];
      if (d.body) { bits.push(d.body.innerText||'', d.body.textContent||'', d.body.innerHTML||''); }
      if (d.documentElement) { bits.push(d.documentElement.innerText||'', d.documentElement.innerHTML||''); }
      var nodes = d.querySelectorAll('pre,code,textarea');
      for (var i=0;i<nodes.length;i++) bits.push(nodes[i].innerText||nodes[i].textContent||'');
      return bits.join('\\n');
    } catch (e) { return ''; }
  }
  function relPath(){
    try {
      var m = document.querySelector('meta[name="nebulla-next-source"]');
      var c = m && m.getAttribute('content');
      if (c && !/[<>]/.test(c)) return c;
    } catch (e) {}
    return 'app/page.tsx';
  }
  function scrub(){
    try {
      if (!document.body) return;
      if (document.documentElement.getAttribute('data-nebulla-source-scrubbed') === '1') return;
      if (!leaked(scrape())) return;
      document.documentElement.setAttribute('data-nebulla-source-scrubbed','1');
      var rel = String(relPath()).replace(/[<>]/g,'');
      document.body.innerHTML = '<header><strong>Live</strong></header><main><p>Preview failed to render</p><p>'+rel+'</p></main>';
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scrub);
  else scrub();
  setTimeout(scrub, 0);
  setTimeout(scrub, 80);
})();
`.trim();
