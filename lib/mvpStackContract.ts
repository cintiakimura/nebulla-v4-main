/**
 * MVP stack contract — stop inventing Supabase/Firebase/etc. unless the plan or user asks.
 * Authority: nebulaAssistantSystemPrompt default architecture (Render Postgres + Nebulla API).
 */

const VENDOR_ALLOW_RE =
  /\b(supabase|firebase|amplify|appwrite|convex|planetscale|neon\.tech|clerk\.com|auth0)\b/i;

/** Paths Grok invents when §2 mentions RLS + Expo. */
const BLOCKED_VENDOR_PATH_RE =
  /(?:^|\/)(?:lib\/supabase\.(ts|tsx|js|jsx)|supabase\/|firebase\/|lib\/firebase\.(ts|tsx|js|jsx))(?:\/|$)/i;

const BLOCKED_VENDOR_BODY_RE =
  /@supabase\/supabase-js|createClient\s*\(\s*['"`]https?:\/\/[^'"`]*supabase|EXPO_PUBLIC_SUPABASE_|firebase\/app|initializeApp\s*\(/i;

export function planOrNoteAllowsExternalBaaS(planOrNote: string): boolean {
  return VENDOR_ALLOW_RE.test(String(planOrNote || ""));
}

export function isBlockedExternalBaaSPath(relativePath: string): boolean {
  return BLOCKED_VENDOR_PATH_RE.test(String(relativePath || "").replace(/\\/g, "/"));
}

export function bodyLooksLikeBlockedExternalBaaS(body: string): boolean {
  return BLOCKED_VENDOR_BODY_RE.test(String(body || ""));
}

export function shouldSkipUnsolicitedBaaSFile(
  relativePath: string,
  body: string,
  planOrNote: string,
): boolean {
  if (planOrNoteAllowsExternalBaaS(planOrNote)) return false;
  const rel = String(relativePath || "").replace(/\\/g, "/");
  if (isBlockedExternalBaaSPath(rel)) return true;
  if (/^supabase\//i.test(rel) || /^firebase\//i.test(rel)) return true;
  if (/supabase|firebase/i.test(rel) && bodyLooksLikeBlockedExternalBaaS(body)) return true;
  return false;
}

/**
 * Drop unsolicited BaaS files when Master Plan / user note never named the vendor.
 */
export function filterUnsolicitedBaaSBlocks<T extends { relativePath: string; body: string }>(
  blocks: T[],
  planOrNote: string,
): { kept: T[]; skipped: string[]; reason: string | null } {
  if (planOrNoteAllowsExternalBaaS(planOrNote)) {
    return { kept: blocks, skipped: [], reason: null };
  }
  const kept: T[] = [];
  const skipped: string[] = [];
  for (const b of blocks) {
    if (shouldSkipUnsolicitedBaaSFile(b.relativePath, b.body, planOrNote)) {
      skipped.push(b.relativePath.replace(/\\/g, "/"));
      continue;
    }
    kept.push(b);
  }
  return {
    kept,
    skipped,
    reason:
      skipped.length > 0
        ? "Skipped unsolicited Supabase/Firebase files — plan did not name that vendor (use mock/local auth for MVP)."
        : null,
  };
}

export const MVP_STACK_GO_BULLETS = `
STACK / VENDORS (mandatory — stop repeating Supabase by default):
- Default Nebulla MVP stack: Expo/React Native (or plan Project Type) + in-app auth/role gates + local/mock data or Nebulla/Render API — NOT Supabase, Firebase, Clerk, Auth0, Amplify unless Master Plan §2 or the user explicitly names that vendor.
- Security baseline (RLS / roles / deny-by-default) means **enforce authz in app/server code** — it does NOT mean "add @supabase/supabase-js + supabase/migrations".
- Do NOT emit lib/supabase.ts, supabase/**, firebase/**, or EXPO_PUBLIC_SUPABASE_* unless the plan/user explicitly requested that vendor.
- For Login + roles in MVP: simple session/mock role switch or local auth stub is enough; wire a real BaaS only when named.
`.trim();
