/**
 * Production hard gates for session + at-rest encryption secrets (Phase 1 trust baseline).
 * Call once at server boot before accepting traffic.
 */

const DEV_SESSION = "dev-only-nebula-session-change-me";
const DEV_AT_REST = "dev-only-nebula-at-rest-change-me";

function isWeakSecret(value: string | undefined, forbiddenExact: string[]): boolean {
  const s = value?.trim() || "";
  if (s.length < 16) return true;
  const lower = s.toLowerCase();
  if (forbiddenExact.some((f) => lower === f.toLowerCase())) return true;
  if (lower.includes("change-me") || lower.includes("dev-only")) return true;
  return false;
}

/**
 * In NODE_ENV=production, exit if SESSION_SECRET or NEBULA_SECRETS_ENCRYPTION_KEY
 * are missing, too short, or still a known development default.
 * SESSION_SECRET alone is not enough for at-rest keys in production — require dedicated encryption key.
 */
export function assertProductionSecretsOrExit(): void {
  if (process.env.NODE_ENV !== "production") return;

  const session = process.env.SESSION_SECRET?.trim();
  const atRest = process.env.NEBULA_SECRETS_ENCRYPTION_KEY?.trim();

  const problems: string[] = [];
  if (isWeakSecret(session, [DEV_SESSION])) {
    problems.push(
      "SESSION_SECRET must be set to a strong secret (≥16 chars) and must not be the development default.",
    );
  }
  if (isWeakSecret(atRest, [DEV_AT_REST])) {
    problems.push(
      "NEBULA_SECRETS_ENCRYPTION_KEY must be set to a strong secret (≥16 chars) dedicated to at-rest encryption (do not use the development default).",
    );
  }

  if (problems.length === 0) return;

  console.error("[nebula] Refusing to start in production with weak secrets:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
