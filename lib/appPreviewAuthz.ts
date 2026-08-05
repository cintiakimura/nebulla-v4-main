/**
 * App Preview authorization — block anonymous reads of /api/app-preview/p/{key}/*
 * by requiring a short-lived grant cookie (issued after bootstrap) and/or
 * session ownership of a synthetic workspace id (cfproj_*).
 */
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { sanitizeProjectKey } from "./nebulaProjectKey";

export const PREVIEW_GRANT_COOKIE = "nebula_preview_grant";

type GrantPayload = {
  v: 1;
  keys: string[];
};

function sessionSecret(): string {
  const s = (process.env.SESSION_SECRET || "").trim();
  if (s.length >= 16) return s;
  return "dev-only-nebula-session-change-me";
}

function isCfprojKey(projectKey: string): boolean {
  return /^cfproj_[a-zA-Z0-9]+$/i.test(projectKey);
}

/** Merge with existing grant keys from the request cookie before issuing. */
export function issuePreviewGrantCookieMerging(req: Request, res: Response, projectKey: string): void {
  const key = sanitizeProjectKey(projectKey);
  const existing = readGrantKeys(req);
  const keys = [...new Set([key, ...existing])].filter(Boolean).slice(0, 12);
  const token = jwt.sign({ v: 1, keys } satisfies GrantPayload, sessionSecret(), {
    expiresIn: "8h",
  });
  res.cookie(PREVIEW_GRANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function readGrantKeys(req: Request): string[] {
  const raw = req.cookies?.[PREVIEW_GRANT_COOKIE];
  if (!raw || typeof raw !== "string") return [];
  try {
    const p = jwt.verify(raw, sessionSecret()) as GrantPayload;
    if (p?.v !== 1 || !Array.isArray(p.keys)) return [];
    return p.keys.map((k) => sanitizeProjectKey(k)).filter(Boolean);
  } catch {
    return [];
  }
}

export function previewGrantAllows(req: Request, projectKey: string): boolean {
  const key = sanitizeProjectKey(projectKey);
  return readGrantKeys(req).includes(key);
}

export type OwnershipLookup = (uid: string, diskKey: string) => Promise<boolean>;

/**
 * Whether this request may read preview files for projectKey.
 * - Grant cookie (from bootstrap) always sufficient for that key.
 * - cfproj_* keys: also allow if session user owns the workspace_id in DB.
 * - Emergency: APP_PREVIEW_PUBLIC=true disables checks (not for production).
 */
export async function canReadAppPreview(
  req: Request,
  projectKey: string,
  opts: {
    sessionUserId: string | null;
    userOwnsDiskKey?: OwnershipLookup;
  },
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  if ((process.env.APP_PREVIEW_PUBLIC || "").trim() === "true") {
    return { ok: true };
  }

  const key = sanitizeProjectKey(projectKey);
  if (previewGrantAllows(req, key)) {
    return { ok: true };
  }

  if (isCfprojKey(key) && opts.sessionUserId && opts.userOwnsDiskKey) {
    try {
      const owns = await opts.userOwnsDiskKey(opts.sessionUserId, key);
      if (owns) return { ok: true };
    } catch {
      /* treat as deny */
    }
    return { ok: false, status: 403, reason: "Preview access denied for this workspace" };
  }

  // Guest / legacy keys: require grant from bootstrap (same browser session).
  return {
    ok: false,
    status: 401,
    reason: "Preview grant required — open App Preview from the IDE first",
  };
}

export function isSyntheticWorkspaceKey(projectKey: string): boolean {
  return isCfprojKey(sanitizeProjectKey(projectKey));
}
