import { readResponseJson } from './apiFetch';
import { withProjectQuery } from './nebulaProjectApi';

export type R2UploadCategory = 'images' | 'assets' | 'generated';

export type R2UploadOk = {
  ok: true;
  key: string;
  url?: string;
  bucket: string;
  contentType?: string;
  size?: number;
};

export type R2UploadErr = {
  ok: false;
  error: string;
  missing?: string[];
  hint?: string;
};

export type R2StorageStatus = {
  configured: boolean;
  missing?: string[];
  hint?: string;
  bucket?: string;
  reachable?: boolean;
  error?: string;
};

function guessUploadCategory(file: File): R2UploadCategory {
  if (file.type.startsWith('image/')) return 'images';
  return 'assets';
}

/** Upload a file to Cloudflare R2 via `POST /api/storage/upload`. */
export async function uploadFileToR2(
  file: File,
  opts?: { category?: R2UploadCategory; projectKey?: string }
): Promise<R2UploadOk | R2UploadErr> {
  const category = opts?.category ?? guessUploadCategory(file);
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('category', category);
  form.append('filename', file.name);
  if (opts?.projectKey?.trim()) {
    form.append('projectKey', opts.projectKey.trim());
  }

  const url = withProjectQuery('/api/storage/upload');
  try {
    const res = await fetch(url, { method: 'POST', body: form, credentials: 'include' });
    const data = (await readResponseJson(res)) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : `Upload failed (${res.status})`,
        missing: Array.isArray(data.missing) ? (data.missing as string[]) : undefined,
        hint: typeof data.hint === 'string' ? data.hint : undefined,
      };
    }
    return {
      ok: true,
      key: String(data.key ?? ''),
      url: typeof data.url === 'string' ? data.url : undefined,
      bucket: String(data.bucket ?? ''),
      contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
      size: typeof data.size === 'number' ? data.size : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

export async function fetchR2StorageStatus(): Promise<R2StorageStatus> {
  try {
    const res = await fetch('/api/storage/status', { credentials: 'include' });
    const data = (await res.json()) as R2StorageStatus;
    return data && typeof data === 'object' ? data : { configured: false };
  } catch {
    return { configured: false, hint: 'Could not reach storage status endpoint.' };
  }
}
