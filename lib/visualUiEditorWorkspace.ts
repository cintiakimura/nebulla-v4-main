/**
 * Nebula Product — Visual UI Editor safe file layout (cloud workspace).
 *
 * **Immutable first v0 output**
 * - `generated-ui/v0-original-<project>-<timestamp>/` — full v0 bundle copy; never modified after creation.
 * - Contains `manifest.json` with `v0FirstGenerationComplete: true`.
 *
 * **Working / editor-only**
 * - `generated-ui/visual-editor/preview-model.json` — structured preview (mutable; not the v0 bundle).
 * - `generated-ui/v0-base/manifest.json` — optional pointer manifest (`originalV0FolderRel`) for eligibility + legacy unlock.
 * - `generated-ui/editor-state.json` — `originalV0FolderRel`, `lastApplyVersionFolderRel`, etc.
 *
 * **On “Save Changes & Update Code”**
 * - Before writing Grok output to `src/` (etc.), copy **only the files that will be modified** into
 *   `generated-ui/versions/<timestamp>/` (pre-apply backup of those paths).
 * - Never writes into the immutable `v0-original-*` folder.
 */

import fs from "fs";
import path from "path";

export type V0BaseManifest = {
  v0FirstGenerationComplete: boolean;
  completedAt?: string;
  source?: string;
  notes?: string;
  /** New layout: points at immutable folder under generated-ui/. */
  originalV0FolderRel?: string;
};

export type VisualEditorState = {
  /** Grok wrote `app/` / `src/` — studio mock tools available; not a substitute for v0-api. */
  workspaceCodingDetected?: boolean;
  v0FirstGenerationComplete?: boolean;
  /** Immutable v0 output root, e.g. generated-ui/v0-original-myapp-2026-05-14T12-00-00-000Z */
  originalV0FolderRel?: string;
  /** v0.dev live preview URL from the last successful v0 API pass. */
  v0DemoUrl?: string;
  /** Last v0 chat id (resume refine / poll without new charge). */
  v0ChatId?: string;
  /** Last apply: backup folder with only paths Grok touched (pre-apply contents). */
  lastApplyVersionFolderRel?: string;
  /** @deprecated Full-workspace snapshots — no longer written by apply. */
  lastPreApplySnapshotRel?: string;
  lastPostApplySnapshotRel?: string;
  originalV0SnapshotRel?: string;
  updatedAt?: string;
};

const META_SKIP = new Set([
  "manifest.json",
  "snapshot-manifest.json",
  "version-manifest.json",
  "v0-bundle-manifest.json",
]);

export function sanitizeProjectNameForVersions(raw: string): string {
  const s = String(raw || "project")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
  return s || "project";
}

export function v0BaseDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "generated-ui", "v0-base");
}

export function v0ManifestPath(workspaceRoot: string): string {
  return path.join(v0BaseDir(workspaceRoot), "manifest.json");
}

export function visualEditorDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "generated-ui", "visual-editor");
}

export function visualEditorPreviewAbs(workspaceRoot: string): string {
  return path.join(visualEditorDir(workspaceRoot), "preview-model.json");
}

export function editorStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "generated-ui", "editor-state.json");
}

/** ISO folder name safe */
export function versionTimestampFolder(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function relPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * `generated-ui/versions/<timestamp>/` — backup of files about to be overwritten (workspace-relative keys).
 */
export function writeTimestampVersionDir(workspaceRoot: string, files: Record<string, string>): string {
  const folder = versionTimestampFolder();
  const relDir = relPosix(path.join("generated-ui", "versions", folder));
  const absDir = path.join(workspaceRoot, relDir);
  fs.mkdirSync(absDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const safeRel = rel.replace(/^(\.\/)+/, "").replace(/\.\./g, "");
    if (!safeRel) continue;
    const dest = path.join(absDir, safeRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }
  fs.writeFileSync(
    path.join(absDir, "snapshot-manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        files: Object.keys(files).filter((k) => !META_SKIP.has(path.basename(k))),
      },
      null,
      2
    ),
    "utf8"
  );
  return relDir;
}

export function readEditorState(workspaceRoot: string): VisualEditorState {
  const p = editorStatePath(workspaceRoot);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as VisualEditorState;
  } catch {
    return {};
  }
}

export function writeEditorState(workspaceRoot: string, state: VisualEditorState): void {
  const dir = path.join(workspaceRoot, "generated-ui");
  fs.mkdirSync(dir, { recursive: true });
  const prev = readEditorState(workspaceRoot);
  const merged: Record<string, unknown> = { ...prev, ...state };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  merged.updatedAt = new Date().toISOString();
  fs.writeFileSync(editorStatePath(workspaceRoot), JSON.stringify(merged, null, 2), "utf8");
}

/** Persist v0 live preview URL + chat id after a successful v0 apply (App Preview + UI Studio). */
export function persistV0SessionMeta(
  workspaceRoot: string,
  meta: { demoUrl?: string; chatId?: string },
): void {
  const patch: VisualEditorState = {};
  if (typeof meta.demoUrl === "string" && meta.demoUrl.trim()) {
    patch.v0DemoUrl = meta.demoUrl.trim();
  }
  if (typeof meta.chatId === "string" && meta.chatId.trim()) {
    patch.v0ChatId = meta.chatId.trim();
  }
  if (Object.keys(patch).length === 0) return;
  writeEditorState(workspaceRoot, patch);
}

export function readV0DemoUrl(workspaceRoot: string): string | undefined {
  const url = readEditorState(workspaceRoot).v0DemoUrl?.trim();
  return url || undefined;
}

/** @deprecated Prefer writeTimestampVersionDir */
export function writeSnapshotDir(
  workspaceRoot: string,
  _projectNameSafe: string,
  files: Record<string, string>
): string {
  return writeTimestampVersionDir(workspaceRoot, files);
}

export function readFilesFromSnapshotDir(workspaceRoot: string, relDir: string): Record<string, string> {
  const abs = path.join(workspaceRoot, relDir);
  const out: Record<string, string> = {};
  if (!fs.existsSync(abs)) return out;
  const walk = (dir: string, prefix = "") => {
    for (const name of fs.readdirSync(dir)) {
      if (name === "snapshot-manifest.json" || name === "version-manifest.json") continue;
      const fp = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.statSync(fp);
      if (st.isDirectory()) walk(fp, rel);
      else if (st.size < 2_000_000) out[relPosix(rel)] = fs.readFileSync(fp, "utf8");
    }
  };
  walk(abs);
  return out;
}

export function resolveOriginalV0FolderRel(workspaceRoot: string): string | null {
  const st = readEditorState(workspaceRoot);
  if (typeof st.originalV0FolderRel === "string" && st.originalV0FolderRel.trim()) {
    const rel = st.originalV0FolderRel.trim().replace(/^\/+/, "").replace(/\\/g, "/");
    if (fs.existsSync(path.join(workspaceRoot, rel))) return rel;
  }
  const mp = v0ManifestPath(workspaceRoot);
  if (fs.existsSync(mp)) {
    try {
      const j = JSON.parse(fs.readFileSync(mp, "utf8")) as V0BaseManifest;
      if (typeof j.originalV0FolderRel === "string" && j.originalV0FolderRel.trim()) {
        const r = j.originalV0FolderRel.trim().replace(/^\/+/, "").replace(/\\/g, "/");
        if (fs.existsSync(path.join(workspaceRoot, r))) return r;
      }
    } catch {
      /* */
    }
  }
  const legacy = path.join(workspaceRoot, "generated-ui", "v0-base");
  const legMan = path.join(legacy, "manifest.json");
  if (!fs.existsSync(legMan)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(legMan, "utf8")) as V0BaseManifest;
    if (j?.v0FirstGenerationComplete !== true) return null;
    const names = fs.readdirSync(legacy).filter((n) => !["manifest.json", "preview-model.json"].includes(n));
    if (names.length > 0) return "generated-ui/v0-base";
  } catch {
    return null;
  }
  return null;
}

export function isVisualEditorEligible(workspaceRoot: string): { eligible: boolean; reason?: string } {
  const orig = resolveOriginalV0FolderRel(workspaceRoot);
  if (orig) {
    const innerManifest = path.join(workspaceRoot, orig, "manifest.json");
    if (fs.existsSync(innerManifest)) {
      try {
        const j = JSON.parse(fs.readFileSync(innerManifest, "utf8")) as V0BaseManifest;
        if (j?.v0FirstGenerationComplete === true) return { eligible: true };
      } catch {
        /* */
      }
    }
    if (orig === "generated-ui/v0-base") {
      try {
        const j = JSON.parse(fs.readFileSync(v0ManifestPath(workspaceRoot), "utf8")) as V0BaseManifest;
        if (j?.v0FirstGenerationComplete === true) return { eligible: true };
      } catch {
        /* */
      }
    }
  }
  const mp = v0ManifestPath(workspaceRoot);
  if (!fs.existsSync(mp)) {
    return {
      eligible: false,
      reason:
        "Waiting for the first automatic v0 generation. The pipeline must create generated-ui/v0-original-<project>-<timestamp>/ with manifest.json (v0FirstGenerationComplete: true), or legacy generated-ui/v0-base/manifest.json.",
    };
  }
  try {
    const j = JSON.parse(fs.readFileSync(mp, "utf8")) as V0BaseManifest;
    if (j?.v0FirstGenerationComplete === true) return { eligible: true };
    return { eligible: false, reason: "manifest.json exists but v0FirstGenerationComplete is not true yet." };
  } catch {
    return { eligible: false, reason: "manifest.json is unreadable or invalid JSON." };
  }
}

/** True when the workspace has an app shell from Grok Code (no v0 required). */
export function hasWorkspaceCodingShell(workspaceRoot: string): boolean {
  const st = readEditorState(workspaceRoot);
  if (st.workspaceCodingDetected) return true;
  return (
    fs.existsSync(path.join(workspaceRoot, "app")) ||
    fs.existsSync(path.join(workspaceRoot, "src")) ||
    fs.existsSync(path.join(workspaceRoot, "pages")) ||
    fs.existsSync(path.join(workspaceRoot, "components"))
  );
}

/**
 * Preview-model persist gate for visual-ui-editor PUT.
 * Allows v0-eligible projects OR Grok-coded app shells (UI Studio Beta / post-Go).
 * Does not unlock restore-original-v0 (still requires real v0).
 */
export function canPersistVisualPreviewModel(workspaceRoot: string): {
  ok: boolean;
  reason?: string;
} {
  if (process.env.NEBULA_VISUAL_EDITOR_DEV_UNLOCK === "true") return { ok: true };
  if (isVisualEditorEligible(workspaceRoot).eligible) return { ok: true };
  if (hasWorkspaceCodingShell(workspaceRoot)) return { ok: true };
  return {
    ok: false,
    reason:
      "Preview save needs a first v0 generation or Grok-coded app/src/pages/components files in the project.",
  };
}

const isAllowedWorkspaceUiRel = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n || n.includes("..")) return false;
  const prefixes = ["src/", "app/", "pages/", "components/", "public/"];
  return prefixes.some((p) => n.startsWith(p));
};

/**
 * Copy immutable v0 tree into workspace (only allowed UI prefixes). Skips meta files.
 */
export function restoreImmutableV0IntoWorkspace(workspaceRoot: string, originalRelDir: string): { restored: string[] } {
  const files = readFilesFromSnapshotDir(workspaceRoot, originalRelDir);
  const restored: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const base = path.basename(rel);
    if (META_SKIP.has(base)) continue;
    if (!isAllowedWorkspaceUiRel(rel)) continue;
    const dest = path.join(workspaceRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
    restored.push(rel);
  }
  return { restored };
}

/** Restore files from a version backup folder (partial undo of last apply). */
export function restoreVersionBackupIntoWorkspace(workspaceRoot: string, relBackupDir: string): { restored: string[] } {
  const files = readFilesFromSnapshotDir(workspaceRoot, relBackupDir);
  const restored: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const base = path.basename(rel);
    if (base === "version-manifest.json") continue;
    if (!isAllowedWorkspaceUiRel(rel)) continue;
    const dest = path.join(workspaceRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
    restored.push(rel);
  }
  return { restored };
}

/** @deprecated Use restoreImmutableV0IntoWorkspace or restoreVersionBackupIntoWorkspace */
export function restoreSnapshotIntoWorkspace(
  workspaceRoot: string,
  relSnapshotDir: string,
  onlyPaths?: Set<string>
): { restored: string[] } {
  const files = readFilesFromSnapshotDir(workspaceRoot, relSnapshotDir);
  const restored: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    if (onlyPaths && !onlyPaths.has(rel)) continue;
    const dest = path.join(workspaceRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
    restored.push(rel);
  }
  return { restored };
}

/**
 * Writes the full v0 output into an immutable folder and registers pointers in editor-state + v0-base/manifest.json.
 */
export function markV0FirstGenerationComplete(
  workspaceRoot: string,
  projectNameSafe: string,
  opts: { files?: Record<string, string>; source?: string; notes?: string }
): void {
  const ts = versionTimestampFolder();
  const folderName = `v0-original-${projectNameSafe}-${ts}`;
  const relRoot = relPosix(path.join("generated-ui", folderName));
  const absRoot = path.join(workspaceRoot, relRoot);
  fs.mkdirSync(absRoot, { recursive: true });

  const payload =
    opts.files && Object.keys(opts.files).length > 0
      ? opts.files
      : { "README.txt": "v0 original placeholder (no files payload in request).\n" };

  for (const [rel, content] of Object.entries(payload)) {
    const safeRel = rel.replace(/^(\.\/)+/, "").replace(/\.\./g, "");
    if (!safeRel) continue;
    const dest = path.join(absRoot, safeRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }

  const innerManifest: V0BaseManifest = {
    v0FirstGenerationComplete: true,
    completedAt: new Date().toISOString(),
    source: opts.source || "api",
    notes: opts.notes,
  };
  fs.writeFileSync(path.join(absRoot, "manifest.json"), JSON.stringify(innerManifest, null, 2), "utf8");

  const pointerManifest: V0BaseManifest = {
    v0FirstGenerationComplete: true,
    completedAt: innerManifest.completedAt,
    source: opts.source || "api",
    notes: opts.notes,
    originalV0FolderRel: relRoot,
  };
  fs.mkdirSync(v0BaseDir(workspaceRoot), { recursive: true });
  fs.writeFileSync(v0ManifestPath(workspaceRoot), JSON.stringify(pointerManifest, null, 2), "utf8");

  const st = readEditorState(workspaceRoot);
  writeEditorState(workspaceRoot, {
    ...st,
    v0FirstGenerationComplete: true,
    originalV0FolderRel: relRoot,
    lastPreApplySnapshotRel: undefined,
    lastPostApplySnapshotRel: undefined,
    originalV0SnapshotRel: undefined,
  });
}
