/** Map server v0 errors to user-facing UI copy (avoid false "add API key" when key works). */
export function formatV0UiError(message: string, hasLocalKey: boolean): string {
  const msg = message.trim();
  if (!msg) return 'v0 generation failed.';

  const missingKey =
    /not set on the server and no client key/i.test(msg) ||
    /no client key was sent/i.test(msg) ||
    msg === 'Add V0_API_KEY in Render Environment, or save your key in My services → v0 API key.';

  if (missingKey) {
    return hasLocalKey
      ? 'Your v0 key is saved in this browser, but the server did not receive it. Re-save in My services or set V0_API_KEY on Render and redeploy.'
      : 'Add your v0 API key in My services (or V0_API_KEY on Render).';
  }

  if (/too short to be valid/i.test(msg)) {
    return 'The v0 API key looks invalid (too short). Paste the full key from v0.dev → Settings → API Keys.';
  }

  return msg;
}
