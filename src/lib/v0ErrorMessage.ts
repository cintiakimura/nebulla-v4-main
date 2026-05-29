/** Map server v0 errors to user-facing UI copy (avoid false "add API key" when key works). */
export function formatV0UiError(message: string, hasLocalKey: boolean): string {
  const msg = message.trim();
  if (!msg) return 'v0 generation failed.';

  if (/fetch failed|failed to fetch|networkerror|load failed/i.test(msg)) {
    return (
      'Connection to Nebula timed out while v0 was still running. Your v0 credits may already have been used. ' +
      'Open UI Studio and click Generate v0 again — it will resume the existing chat without starting a new charge.'
    );
  }

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
