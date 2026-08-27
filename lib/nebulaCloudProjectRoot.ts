import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import {
  getWorkspaceStorageMode,
  hydrateWorkspaceFromR2,
} from "./nebulaWorkspaceStorage";
import { ensureWorkspaceCreatedMarker } from "./masterPlanStrictPolicy";
import { sanitizeProjectKey } from "./nebulaProjectKey";

export type CloudProjectPaths = {
  projectKey: string;
  workspaceRoot: string;
  masterPlanPath: string;
  nebulaUiStudioPath: string;
  nebulaUiStudioOutputDir: string;
};

/** Used only when `nebula-project/nebula-ui-studio.md` is missing from the repo. */
const MINIMAL_UI_STUDIO_FALLBACK = `<!--
NEBULA_UI_STUDIO_PROMPT
No prompt generated yet.
-->

<!--
NEBULA_UI_STUDIO_CODE
No approved UI code yet.
-->
`;

function copyIfMissing(src: string, dest: string) {
  if (fs.existsSync(dest)) return;
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Ensures `data/cloud-projects/{key}/` exists on the server (local working tree).
 * Seeds from bundled `nebula-project/` templates when files are missing.
 * When WORKSPACE_STORAGE=r2|dual, prefer `ensureCloudProjectWorkspaceDurable` in async routes
 * so R2 can restore files onto ephemeral disks.
 */
export function ensureCloudProjectWorkspace(
  repoRoot: string,
  legacyTemplateRoot: string,
  rawProjectKey: string
): CloudProjectPaths {
  const projectKey = sanitizeProjectKey(rawProjectKey);
  const workspaceRoot = path.join(repoRoot, "data", "cloud-projects", projectKey);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  ensureWorkspaceCreatedMarker(workspaceRoot);

  const masterPlanPath = path.join(workspaceRoot, "master-plan.json");
  const nebulaUiStudioPath = path.join(workspaceRoot, "nebula-ui-studio.md");
  const nebulaUiStudioOutputDir = path.join(workspaceRoot, "nebulla-sysh-ui-sysh-studio");

  copyIfMissing(path.join(legacyTemplateRoot, "master-plan.json"), masterPlanPath);
  if (!fs.existsSync(masterPlanPath)) {
    fs.writeFileSync(masterPlanPath, "{}", "utf8");
  }

  const legacyUiStudioMd = path.join(workspaceRoot, "nebula-sysh-ui-sysh-studio.md");
  if (!fs.existsSync(nebulaUiStudioPath) && fs.existsSync(legacyUiStudioMd)) {
    try {
      fs.renameSync(legacyUiStudioMd, nebulaUiStudioPath);
    } catch {
      /* ignore — seed from template below */
    }
  }

  copyIfMissing(path.join(legacyTemplateRoot, "nebula-ui-studio.md"), nebulaUiStudioPath);
  if (!fs.existsSync(nebulaUiStudioPath)) {
    fs.writeFileSync(nebulaUiStudioPath, MINIMAL_UI_STUDIO_FALLBACK, "utf8");
  }

  copyIfMissing(
    path.join(legacyTemplateRoot, "project-workflow.md"),
    path.join(workspaceRoot, "project-workflow.md")
  );
  copyIfMissing(
    path.join(legacyTemplateRoot, "project-execution-rules.md"),
    path.join(workspaceRoot, "project-execution-rules.md")
  );
  copyIfMissing(path.join(legacyTemplateRoot, "ui-studio.md"), path.join(workspaceRoot, "ui-studio.md"));
  copyIfMissing(
    path.join(legacyTemplateRoot, "environment-setup.md"),
    path.join(workspaceRoot, "environment-setup.md")
  );
  copyIfMissing(
    path.join(legacyTemplateRoot, "Nebula Architecture Spec.md"),
    path.join(workspaceRoot, "Nebula Architecture Spec.md")
  );

  const skillDest = path.join(workspaceRoot, "SKILL.md");
  copyIfMissing(path.join(legacyTemplateRoot, "SKILL.md"), skillDest);
  // Do not seed CHANGELOG-methodology.md into user workspaces — platform-only
  // (recovery §7.1: keep methodology out of the user file tree).

  fs.mkdirSync(nebulaUiStudioOutputDir, { recursive: true });

  const gitDir = path.join(workspaceRoot, ".git");
  if (!fs.existsSync(gitDir)) {
    try {
      execFileSync("git", ["init"], { cwd: workspaceRoot, stdio: "ignore" });
    } catch {
      /* optional — source control still lists files without git */
    }
  }

  return {
    projectKey,
    workspaceRoot,
    masterPlanPath,
    nebulaUiStudioPath,
    nebulaUiStudioOutputDir,
  };
}

const hydratedKeys = new Set<string>();
const hydrateLocks = new Map<string, Promise<void>>();

export function invalidateWorkspaceHydrateCache(projectKey: string): void {
  hydratedKeys.delete(sanitizeProjectKey(projectKey));
}

export function resetWorkspaceHydrateCacheForTests(): void {
  hydratedKeys.clear();
  hydrateLocks.clear();
}

/**
 * Restore the last saved workspace from R2 onto empty/ephemeral disk, then seed
 * any still-missing templates. Never uploads templates over a saved product tree.
 */
export async function ensureCloudProjectWorkspaceDurable(
  repoRoot: string,
  legacyTemplateRoot: string,
  rawProjectKey: string,
): Promise<CloudProjectPaths> {
  const projectKey = sanitizeProjectKey(rawProjectKey);
  const mode = getWorkspaceStorageMode();
  if (mode === "local") {
    return ensureCloudProjectWorkspace(repoRoot, legacyTemplateRoot, projectKey);
  }

  if (hydratedKeys.has(projectKey)) {
    return ensureCloudProjectWorkspace(repoRoot, legacyTemplateRoot, projectKey);
  }

  let lock = hydrateLocks.get(projectKey);
  if (!lock) {
    lock = (async () => {
      const workspaceRoot = path.join(repoRoot, "data", "cloud-projects", projectKey);
      fs.mkdirSync(workspaceRoot, { recursive: true });
      const r = await hydrateWorkspaceFromR2(projectKey, workspaceRoot);
      if (r.error) {
        console.warn(`[nebula] workspace R2 hydrate (${projectKey}):`, r.error);
      } else {
        hydratedKeys.add(projectKey);
        if (r.downloaded > 0) {
          console.log(
            `[nebula] workspace R2 hydrate ${projectKey}: downloaded=${r.downloaded} skipped=${r.skipped}`,
          );
        }
      }
    })().finally(() => {
      hydrateLocks.delete(projectKey);
    });
    hydrateLocks.set(projectKey, lock);
  }
  await lock;
  return ensureCloudProjectWorkspace(repoRoot, legacyTemplateRoot, projectKey);
}
