/** Never return full secret material in scan evidence. */

const SECRETISH =
  /\b((?:sk-|xai-|ghp_|github_pat_|sk_live_|sk_test_|xox[baprs]-|AKIA)[A-Za-z0-9_\-/+=]{8,})\b/g;

const PEM_BLOCK =
  /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]+PRIVATE KEY-----/gi;

const CONN_STRING =
  /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/)([^:@\s\/]+):([^@\s\/]+)@/gi;

export function redactSecretsInText(input: string, maxLen = 160): string {
  let s = String(input || "");
  s = s.replace(PEM_BLOCK, "[REDACTED PRIVATE KEY]");
  s = s.replace(CONN_STRING, "$1$2:***@");
  s = s.replace(SECRETISH, (match) => redactToken(match));
  s = s.replace(/\b[A-Za-z0-9_\-]{40,}\b/g, (m) => {
    if (/^(YOUR_|CHANGEME|EXAMPLE|XXXX|TODO)/i.test(m)) return m;
    if (m.length < 48) return m;
    return redactToken(m);
  });
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

export function redactToken(token: string): string {
  const t = String(token || "");
  if (t.length <= 10) return "[REDACTED]";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
