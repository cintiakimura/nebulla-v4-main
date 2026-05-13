/**
 * Fetch helpers that read the response body once and detect HTML error pages
 * (common when the SPA is served without the Express API).
 */

function isProbablyHtml(body: string): boolean {
  const t = body.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head");
}

export async function readResponseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!response.ok) {
      if (response.status === 405) {
        throw new Error(
          "API route returned 405 (Method Not Allowed). This usually means the app is not running on the Nebula full-stack server. Run `npm run dev` on port 3000 (or `npm run preview` after `npm run build`)."
        );
      }
      throw new Error(`Request failed (${response.status}) with empty response body`);
    }
    throw new Error("Empty response from server");
  }
  if (isProbablyHtml(trimmed)) {
    throw new Error(
      "Received HTML instead of JSON. Run `npm run dev` for the full stack on port 3000, or `npm run preview` after `npm run build`."
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Invalid JSON (${response.status}): ${trimmed.slice(0, 160)}`);
  }
}

/**
 * POST/GET JSON API: one body read, clear errors for HTML and non-OK JSON.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await readResponseJson<T & { error?: string }>(response);
  if (!response.ok) {
    const msg = (data as { error?: string }).error;
    throw new Error(typeof msg === "string" && msg ? msg : `Request failed: ${response.status}`);
  }
  return data as T;
}
