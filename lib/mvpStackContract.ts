/**
 * MVP stack contract — Render-only by default.
 * Supabase/Firebase are never implied by RLS/roles/security language.
 * Authority: nebulaAssistantSystemPrompt (Render Postgres + Nebulla API).
 */

import fs from "fs";
import path from "path";

const VENDOR = String.raw`supabase|firebase|amplify|appwrite|convex|planetscale|neon\.tech|clerk\.com|auth0`;

/** Affirmative stack choice only — “I want Supabase”, “Use Supabase Auth”, “Stack: Supabase”. */
const AFFIRMATIVE_VENDOR_RE = new RegExp(
  String.raw`\b(?:use|using|used|choose|chosen|chose|adopt|adopted|via|with|i want|we want|we need|please use|required)\s+[\w\s+/,-]{0,40}\b(?:${VENDOR})\b` +
    String.raw`|\b(?:stack|database|db|baas|auth|backend|vendor)\s*:\s*[^\n]{0,60}\b(?:${VENDOR})\b` +
    String.raw`|\b(?:${VENDOR})\s+(?:auth|postgres|database|client|backend|stack)\b` +
    String.raw`|\b(?:${VENDOR})\s*\+`,
  "gi",
);

const BLOCKED_VENDOR_PATH_RE =
  /(?:^|\/)(?:lib\/supabase(?:\.(ts|tsx|js|jsx)|\/)|supabase\/|firebase\/|lib\/firebase\.(ts|tsx|js|jsx)|supabase\.(ts|tsx|js|jsx))(?:\/|$)?/i;

const BLOCKED_VENDOR_BODY_RE =
  /@supabase\/supabase-js|createClient\s*\(\s*['"`]https?:\/\/[^'"`]*supabase|EXPO_PUBLIC_SUPABASE_|SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE|firebase\/app|initializeApp\s*\(/i;

/** Leftovers from a prior apply that treated security language as permission. */
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

export const UNSOLICITED_BAAS_SKIP_REASON =
  "Skipped unsolicited Supabase files — stack is Render-only.";

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
 * True only when the plan/note *chooses* a vendor (e.g. “I want Supabase”).
 * Security baseline / RLS language must not count.
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
  const rel = String(relativePath || "").replace(/\\/g, "/");
  if (/supabase/i.test(rel)) return true;
  return BLOCKED_VENDOR_PATH_RE.test(rel);
}

export function bodyLooksLikeBlockedExternalBaaS(body: string): boolean {
  return BLOCKED_VENDOR_BODY_RE.test(String(body || ""));
}

function stripUnsolicitedVendorFromManifest(relativePath: string, body: string): string {
  const rel = relativePath.replace(/\\/g, "/");
  if (/\.env/i.test(rel)) {
    return body
      .split("\n")
      .filter((line) => !/^\s*(?:EXPO_PUBLIC_)?SUPABASE_/i.test(line))
      .join("\n");
  }
  if (!/package\.json$/i.test(rel)) return body;
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const bag = json[key];
      if (!bag || typeof bag !== "object") continue;
      const next: Record<string, unknown> = { ...(bag as Record<string, unknown>) };
      for (const dep of Object.keys(next)) {
        if (/supabase/i.test(dep)) delete next[dep];
      }
      json[key] = next;
    }
    return `${JSON.stringify(json, null, 2)}\n`;
  } catch {
    return body.replace(/[^\n]*@supabase[^\n]*\n?/gi, "");
  }
}

export function shouldSkipUnsolicitedBaaSFile(
  relativePath: string,
  body: string,
  planOrNote: string,
): boolean {
  if (planOrNoteAllowsExternalBaaS(planOrNote)) return false;
  const rel = String(relativePath || "").replace(/\\/g, "/");
  if (isBlockedExternalBaaSPath(rel)) return true;
  if (/^firebase\//i.test(rel) || /firebase/i.test(rel) && /\.(ts|tsx|js|jsx)$/i.test(rel)) return true;
  if (/\.(ts|tsx|js|jsx)$/i.test(rel) && bodyLooksLikeBlockedExternalBaaS(body)) return true;
  if (/\.env/i.test(rel) && /SUPABASE_/i.test(body)) {
    const leftover = stripUnsolicitedVendorFromManifest(rel, body).trim();
    return leftover.length === 0;
  }
  return false;
}

/**
 * Drop unsolicited BaaS files when Master Plan / user note never named the vendor.
 * package.json keeps other deps; @supabase/* is stripped.
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
  let strippedManifest = false;
  for (const b of blocks) {
    const rel = b.relativePath.replace(/\\/g, "/");
    if (shouldSkipUnsolicitedBaaSFile(b.relativePath, b.body, planOrNote)) {
      skipped.push(rel);
      continue;
    }
    if (/package\.json$/i.test(rel) && /@supabase|supabase-js/i.test(b.body)) {
      kept.push({ ...b, body: stripUnsolicitedVendorFromManifest(rel, b.body) });
      strippedManifest = true;
      continue;
    }
    if (/\.env/i.test(rel) && /SUPABASE_/i.test(b.body)) {
      const next = stripUnsolicitedVendorFromManifest(rel, b.body);
      if (!next.trim()) {
        skipped.push(rel);
        continue;
      }
      kept.push({ ...b, body: next });
      strippedManifest = true;
      continue;
    }
    kept.push(b);
  }
  return {
    kept,
    skipped,
    reason:
      skipped.length > 0 || strippedManifest ? UNSOLICITED_BAAS_SKIP_REASON : null,
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

/** Optional leftover cleanup — apply gate does not call this (new applies only). */
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
STACK (mandatory — Render-only):
- Default product stack: Render PostgreSQL + Render Web Service (Nebulla-hosted API) + in-app / mock / local session auth.
- RLS / roles / deny-by-default = authorization checks in app/server code on that stack — never a hosted BaaS product.
- Do not emit supabase or firebase client files, packages, or SUPABASE_* env vars. Do not put those packages in package.json.
- Login + roles in MVP: mock role switch or local session stub on Render.
`.trim();
