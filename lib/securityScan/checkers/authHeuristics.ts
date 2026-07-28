import type { SecurityFinding } from "../types";
import { withId } from "../findingId";
import { isAllowlistedPath } from "../allowlists";
import { readFileTextLimited, type WalkedFile } from "../walkWorkspace";

/**
 * Conservative auth-gap heuristics. Prefer precision over volume.
 * Findings are usually medium/low confidence — not proof of a vulnerability.
 */
export function scanAuthHeuristics(files: WalkedFile[]): SecurityFinding[] {
  const out: SecurityFinding[] = [];
  const seen = new Set<string>();

  const candidates = files.filter((f) => {
    const p = f.relPath.replace(/\\/g, "/").toLowerCase();
    if (isAllowlistedPath(f.relPath)) return false;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p)) return false;
    return (
      /(^|\/)(api|routes|server|backend)\//.test(p) ||
      /(route|handler|controller|server)\.(ts|js|mjs)$/.test(p) ||
      p.endsWith("server.ts") ||
      p.includes("/app/api/")
    );
  });

  for (const file of candidates) {
    const text = readFileTextLimited(file.absPath);
    if (text == null || text.length < 40) continue;

    const hasUserIdParam =
      /\b(req\.(body|query|params)\.[a-zA-Z_]*userId|searchParams\.get\(\s*['"]userId['"])/i.test(
        text,
      ) || /\buserId\s*[:=]\s*req\./i.test(text);

    const hasDbMutation =
      /\b(insert|update|delete|upsert|create|destroy|\.query\(|\.execute\()/i.test(text) &&
      /\b(user|account|profile|order|payment|invoice)/i.test(text);

    const hasAuthSignal =
      /\b(req\.session|req\.user|getServerSession|getSession|requireAuth|ensureAuth|isAuthenticated|authorize|authorization|passport\.|clerk|supabase\.auth|getUser\(\)|readNebulaSession|verifyToken|jwt\.verify)/i.test(
        text,
      );

    if (hasUserIdParam && hasDbMutation && !hasAuthSignal) {
      const f = withId({
        rule: "auth.userid_mutation_no_auth",
        path: file.relPath,
        severity: "high",
        category: "auth",
        title: "User-scoped write may lack auth check",
        description:
          "This handler appears to accept a userId and perform a data write/mutation without an obvious session/auth check. This is a heuristic — review the file.",
        recommendation:
          "Require a signed-in session and authorize against the session user (never trust client-supplied userId alone). Add auth middleware before mutations.",
        fixKind: "open-file",
        confidence: "medium",
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
      continue;
    }

    if (hasUserIdParam && !hasAuthSignal && !hasDbMutation) {
      const f = withId({
        rule: "auth.userid_no_auth",
        path: file.relPath,
        severity: "medium",
        category: "auth",
        title: "userId accepted without obvious auth",
        description:
          "A route reads userId from the request without a clear auth/session check nearby. Confirm callers cannot access other users’ data.",
        recommendation:
          "Bind data access to the authenticated user from the session/token. Treat request userId as untrusted input.",
        fixKind: "open-file",
        confidence: "low",
      });
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
  }

  return out;
}
