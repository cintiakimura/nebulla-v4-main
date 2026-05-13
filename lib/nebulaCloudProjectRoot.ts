import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { sanitizeProjectKey } from "./nebulaProjectKey";

export type CloudProjectPaths = {
  projectKey: string;
  workspaceRoot: string;
  masterPlanPath: string;
  nebulaUiStudioPath: string;
  nebulaUiStudioOutputDir: string;
};

const DEFAULT_UI_STUDIO_MD = `<!--
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
 * Ensures `data/cloud-projects/{key}/` exists on the server (Render disk).
 * Seeds from bundled `nebula-project/` templates when files are missing.
 */
export function ensureCloudProjectWorkspace(
  repoRoot: string,
  legacyTemplateRoot: string,
  rawProjectKey: string
): CloudProjectPaths {
  const projectKey = sanitizeProjectKey(rawProjectKey);
  const workspaceRoot = path.join(repoRoot, "data", "cloud-projects", projectKey);
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const masterPlanPath = path.join(workspaceRoot, "master-plan.json");
  const nebulaUiStudioPath = path.join(workspaceRoot, "nebula-sysh-ui-sysh-studio.md");
  const nebulaUiStudioOutputDir = path.join(workspaceRoot, "nebulla-sysh-ui-sysh-studio");

  copyIfMissing(path.join(legacyTemplateRoot, "master-plan.json"), masterPlanPath);
  if (!fs.existsSync(masterPlanPath)) {
    fs.writeFileSync(masterPlanPath, "{}", "utf8");
  }

  copyIfMissing(path.join(legacyTemplateRoot, "nebula-sysh-ui-sysh-studio.md"), nebulaUiStudioPath);
  if (!fs.existsSync(nebulaUiStudioPath)) {
    fs.writeFileSync(nebulaUiStudioPath, DEFAULT_UI_STUDIO_MD, "utf8");
  }

  copyIfMissing(
    path.join(legacyTemplateRoot, "project-execution-rules.md"),
    path.join(workspaceRoot, "project-execution-rules.md")
  );
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
  if (!fs.existsSync(skillDest)) {
    const repoSkill = path.join(repoRoot, "SKILL.md");
    copyIfMissing(repoSkill, skillDest);
  }

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
