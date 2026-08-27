/**
 * Refresh must reopen the same project — not re-arm Fast Prototype from a leftover shell goal.
 * Run: npx tsx scripts/test-project-persist.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPreferredCloudProject } from "../src/lib/nebulaCloud.ts";
import { ensurePendingIdeaFromShellGoal } from "../src/lib/landingGoalHandoff.ts";
import {
  listDurableWorkspaceRelPaths,
  projectKeyFromWorkspaceRoot,
} from "../lib/nebulaWorkspaceStorage.ts";
import {
  NEBULA_PENDING_PROJECT_IDEA_KEY,
  NEBULA_START_GUIDED_ON_READY_KEY,
  peekPendingProjectIdea,
} from "../src/lib/ideHomeEvents.ts";
import { writeStoredShellGoal, clearStoredShellGoal } from "../src/lib/ideShellScreens.ts";
import { peekPendingStartMode, NEBULA_PENDING_START_MODE_KEY } from "../src/lib/ideStartMode.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function lsClear() {
  try {
    localStorage.removeItem(NEBULA_PENDING_PROJECT_IDEA_KEY);
    localStorage.removeItem(NEBULA_START_GUIDED_ON_READY_KEY);
    localStorage.removeItem(NEBULA_PENDING_START_MODE_KEY);
    clearStoredShellGoal();
  } catch {
    /* ignore */
  }
}

section("pickPreferredCloudProject prefers saved key/name over Untitled");
{
  const untitled = {
    name: "Untitled Project",
    pages: [],
    edges: [],
    workspace_id: "cfproj_oldempty",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const kids = {
    name: "Project type Mobile App primary",
    pages: [],
    edges: [],
    workspace_id: "cfproj_kidswork",
    updated_at: "2026-08-23T12:00:00.000Z",
  };
  const picked = pickPreferredCloudProject([untitled, kids], {
    preferredName: kids.name,
    preferredKey: "cfproj_kidswork",
  });
  assert.equal(picked?.workspace_id, "cfproj_kidswork");
  const byKey = pickPreferredCloudProject([untitled, kids], {
    preferredName: "name-that-does-not-exist",
    preferredKey: "cfproj_kidswork",
  });
  assert.equal(byKey?.workspace_id, "cfproj_kidswork");
  const noHint = pickPreferredCloudProject([untitled, kids], { allowFallback: false });
  assert.equal(noHint, undefined);
}

section("shell goal alone does not re-queue Fast Prototype");
{
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
  {
    writeStoredShellGoal("privacy-first learning companion for children homework support");
    ensurePendingIdeaFromShellGoal();
    assert.equal(peekPendingProjectIdea(), null);
    assert.equal(peekPendingStartMode(), null);

    localStorage.setItem(NEBULA_START_GUIDED_ON_READY_KEY, "1");
    ensurePendingIdeaFromShellGoal();
    assert.match(String(peekPendingProjectIdea() || ""), /privacy-first/i);
    assert.equal(peekPendingStartMode(), "fast_prototype");
    lsClear();
  }
}

section("AIChat / BuildScreen wiring");
{
  const chat = fs.readFileSync(path.join(root, "src/components/ide/AIChat.tsx"), "utf8");
  const build = fs.readFileSync(path.join(root, "src/components/ide/shell/BuildScreen.tsx"), "utf8");
  const handoff = fs.readFileSync(path.join(root, "src/lib/landingGoalHandoff.ts"), "utf8");
  assert.match(build, /ensurePendingIdeaFromShellGoal/);
  assert.match(handoff, /if \(!armed\) return/);
  assert.match(chat, /if \(!guidedFlag\) return/);
  assert.match(chat, /rememberActiveCloudProject/);
  assert.match(chat, /consumeGuidedStartOnReady\(\);/);
  assert.match(chat, /planRecordHasUsableGoal\(plan\)/);
}

section("durable workspace save/restore (deploy must not start from scratch)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nebulla-durable-"));
  fs.mkdirSync(path.join(tmp, "app"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "app", "page.tsx"), "export default function Page(){return null}\n");
  fs.writeFileSync(path.join(tmp, "package.json"), "{\"name\":\"app\"}\n");
  fs.writeFileSync(path.join(tmp, "node_modules", "x", "index.js"), "1\n");
  const rels = listDurableWorkspaceRelPaths(tmp);
  assert.ok(rels.includes("app/page.tsx"));
  assert.ok(rels.includes("package.json"));
  assert.equal(rels.some((p) => p.includes("node_modules")), false);
  fs.rmSync(tmp, { recursive: true, force: true });

  const cloudRoot = "/var/app/data/cloud-projects/cfproj_abc123";
  assert.equal(projectKeyFromWorkspaceRoot(cloudRoot), "cfproj_abc123");
  assert.equal(projectKeyFromWorkspaceRoot("/tmp/scratch"), null);

  const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
  assert.match(server, /ensureCloudProjectWorkspaceDurable/);
  assert.match(server, /scheduleWorkspaceRelPathsR2Sync/);
  assert.match(server, /scheduleWorkspaceTreeR2Sync/);
  assert.match(server, /deleteWorkspacePrefixFromR2Safe/);
  const cloud = fs.readFileSync(path.join(root, "lib/nebulaCloudProjectRoot.ts"), "utf8");
  assert.match(cloud, /hydrateWorkspaceFromR2/);
  assert.equal(/scheduleWorkspaceFileR2Sync\(projectKey, workspaceRoot, abs\)/.test(cloud), false);
}

console.log("\n✓ project persist passed\n");

function section(name: string) {
  console.log(`\n▸ ${name}`);
}
