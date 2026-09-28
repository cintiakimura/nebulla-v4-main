/**
 * Preview canvas must never show leftover TS/JS source.
 * Client-safe (no fs).
 */

export const PREVIEW_RENDER_FIX_LABEL = "First version on disk — preview needs a render fix";
export const PREVIEW_FAILED_RENDER_LINE = "Preview failed to render";

const SOURCE_LEAK_RE =
  /\b(useState|useEffect|useMemo|useCallback|useRef)\b|\breturn\s*\(|\bexport\s+default\b|\bfrom\s+['"]react['"]|\bimport\s+\{/;

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

/** Replace leaked JS in an iframe document. Returns true if the canvas was rewritten. */
export function scrubPreviewDocumentIfSourceLeaked(
  doc: { body?: { innerText?: string; innerHTML?: string } | null } | null | undefined,
  filePath = "app/page.tsx",
): boolean {
  if (!doc?.body) return false;
  const text = String(doc.body.innerText || "");
  if (!previewTextLooksLikeLeakedSource(text)) return false;
  const rel = String(filePath || "app/page.tsx").replace(/[<>]/g, "");
  doc.body.innerHTML = `<header><strong>Live</strong></header><main><p>${PREVIEW_FAILED_RENDER_LINE}</p><p>${rel}</p></main>`;
  return true;
}
