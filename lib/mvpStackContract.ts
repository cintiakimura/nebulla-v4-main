/**
 * MVP stack contract — stop inventing Supabase/Firebase/etc. unless the plan or user asks.
 * Authority: nebulaAssistantSystemPrompt default architecture (Render Postgres + Nebulla API).
 */

import fs from "fs";
import path from "path";

const VENDOR = String.raw`supabase|firebase|amplify|appwrite|convex|planetscale|neon\.tech|clerk\.com|auth0`;

/** Affirmative stack choice — not “do not invent Supabase” / “stop repeating Supabase”. */
const AFFIRMATIVE_VENDOR_RE = new RegExp(
  String.raw`\b(?:use|using|used|choose|chosen|chose|adopt|adopted|via|with)\s+[\w\s+/,-]{0,40}\b(?:${VENDOR})\b` +
    String.raw`|\b(?:stack|database|db|baas|auth|backend|vendor)\s*:\s*[^\n]{0,60}\b(?:${VENDOR})\b` +
    String.raw`|\b(?:${VENDOR})\s+(?:auth|postgres|database|client|backend|stack)\b` +
    String.raw`|\b(?:${VENDOR})\s*\+`,
  "gi",
);

/** Paths Grok invents when §2 mentions RLS + Expo. */
const BLOCKED_VENDOR_PATH_RE =
  /(?:^|\/)(?:lib\/supabase(?:\.(ts|tsx|js|jsx)|\/)|supabase\/|firebase\/|lib\/firebase\.(ts|tsx|js|jsx)|supabase\.(ts|tsx|js|jsx))(?:\/|$)?/i;

const BLOCKED_VENDOR_BODY_RE =
  /@supabase\/supabase-js|createClient\s*\(\s*['"`]https?:\/\/[^'"`]*supabase|EXPO_PUBLIC_SUPABASE_|firebase\/app|initializeApp\s*\(/i;

/** Leftovers from a prior apply that treated “do not invent Supabase” as permission. */
export const KNOWN_UNSOLICITED_BAAS_FILES = [
  "lib/supabase.ts",
  "lib/supabase.tsx",
  "lib/supabase.js",
  "src/lib/supabase.ts",
  "src/lib/supabase.tsx",
  "src/lib/supabase.js",
  "src/lib/supabase/client.ts",
  "src/lib/supabase/server.ts",
  "lib/supabase/client.ts",
  "lib/firebase.ts",
  "src/lib/firebase.ts",
];

const KNOWN_UNSOLICITED_BAAS_DIRS = ["supabase", "firebase"];

function vendorMentionIsProhibition(prefix: string, suffix: string): boolean {
  const before = prefix.replace(/\*/g, " ").replace(/\s+/g, " ");
  const around = `${before} ${suffix}`.replace(/\*/g, " ").replace(/\s+/g, " ");
  if (
    /(?:do not|don't|dont|never|not invent|not add|not emit|not push|not mean|not a cue|no forced|no unsolicited|avoid)\b/i.test(
      before.slice(-80),
    )
  ) {
    return true;
  }
  if (/\bNOT\s*$/i.test(before.trim())) return true;
  if (/\bunless\b/i.test(around) && /\b(names?|requested|chosen|explicit)/i.test(around)) {
    return true;
  }
  return false;
}

/**
 * True only when the plan/note *chooses* a vendor.
 * Prohibitions (“do not invent Supabase”) in the security baseline must not count.
 */
export function planOrNoteAllowsExternalBaaS(planOrNote: string): boolean {
  const text = String(planOrNote || "");
  if (!text.trim()) return false;
  AFFIRMATIVE_VENDOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AFFIRMATIVE_VENDOR_RE.exec(text))) {
    const prefix = text.slice(Math.max(0, m.index - 140), m.index);
    const suffix = text.slice(m.index + m[0].length, m.index + m[0].length + 90);
    if (vendorMentionIsProhibition(prefix, suffix)) continue;
    return true;
  }
  return false;
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
  if (/package\.json$|pnpm-lock|yarn\.lock|package-lock|readme/i.test(rel)) return false;
  if (isBlockedExternalBaaSPath(rel)) return true;
  if (/^supabase\//i.test(rel) || /^firebase\//i.test(rel)) return true;
  if (/(^|\/)supabase\.(ts|tsx|js|jsx)$/i.test(rel)) return true;
  if (/\.(ts|tsx|js|jsx)$/i.test(rel) && bodyLooksLikeBlockedExternalBaaS(body)) return true;
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

function safeUnlinkUnderRoot(workspaceRoot: string, rel: string): boolean {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) return false;
  if (!fs.existsSync(target)) return false;
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
    else fs.unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Remove leftover unsolicited vendor files from a prior false-allow apply. */
export function sweepUnsolicitedBaaSFromWorkspace(
  workspaceRoot: string,
  planOrNote: string,
  extraRelPaths: string[] = [],
): string[] {
  if (planOrNoteAllowsExternalBaaS(planOrNote)) return [];
  const removed: string[] = [];
  const seen = new Set<string>();
  for (const rel of [...KNOWN_UNSOLICITED_BAAS_FILES, ...KNOWN_UNSOLICITED_BAAS_DIRS, ...extraRelPaths]) {
    const norm = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!norm || seen.has(norm) || norm.includes("..")) continue;
    seen.add(norm);
    if (safeUnlinkUnderRoot(workspaceRoot, norm)) removed.push(norm);
  }
  return removed;
}

export const MVP_STACK_GO_BULLETS = `
STACK / VENDORS (mandatory — stop repeating Supabase by default):
- Default Nebulla MVP stack: Expo/React Native (or plan Project Type) + in-app auth/role gates + local/mock data or Nebulla/Render API — NOT Supabase, Firebase, Clerk, Auth0, Amplify unless Master Plan §2 or the user explicitly names that vendor.
- Security baseline (RLS / roles / deny-by-default) means **enforce authz in app/server code** — it does NOT mean "add @supabase/supabase-js + supabase/migrations".
- Do NOT emit lib/supabase.ts, supabase/**, firebase/**, or EXPO_PUBLIC_SUPABASE_* unless the plan/user explicitly requested that vendor.
- For Login + roles in MVP: simple session/mock role switch or local auth stub is enough; wire a real BaaS only when named.
`.trim();
