import { getBrowserProjectName, withProjectQuery } from './nebulaProjectApi';

/**
 * Download Markdown technical documentation for the active project (Master Plan export).
 */
export async function downloadTechnicalDocumentation(): Promise<{
  ok: boolean;
  error?: string;
  filename?: string;
}> {
  try {
    const projectName = getBrowserProjectName().trim() || 'Untitled Project';
    const url = withProjectQuery(
      `/api/master-plan/technical-documentation?projectName=${encodeURIComponent(projectName)}`,
    );
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      let msg = `Export failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === 'string' && data.error.trim()) msg = data.error;
      } catch {
        /* keep status msg */
      }
      return { ok: false, error: msg };
    }

    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/i) || cd.match(/filename=([^;]+)/i);
    const filename =
      (match?.[1] || '').trim().replace(/^["']|["']$/g, '') ||
      'technical-documentation.md';

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return { ok: true, filename };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}
