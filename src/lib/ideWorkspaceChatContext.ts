import { fetchJson } from './apiFetch';
import { getBrowserProjectKey, getBrowserProjectName, withProjectQuery } from './nebulaProjectApi';

export type IdeWorkspaceMeta = {
  projectKey: string;
  projectName: string;
  /** Server disk path label (e.g. data/cloud-projects/{key}). */
  workspaceRoot: string;
  mode: 'cloud' | 'guest' | 'unknown';
  exists: boolean;
};

let cached: IdeWorkspaceMeta | null = null;

/** Heuristic: user wants implementation / files, not casual Q&A. */
export function detectBuildModeIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\bSTART_CODING\b/i.test(t)) return true;
  const buildRe =
    /\b(build|implement|scaffold|create (the |a )?(app|feature|page|api|component)|add (a |the )?(feature|page|route|endpoint)|fix (the |this )?bug|write (the )?code|generate files?|make (the )?changes?|update (the )?code|ship|deploy|run go)\b/i;
  return buildRe.test(t);
}

export async function fetchIdeWorkspaceMeta(force = false): Promise<IdeWorkspaceMeta> {
  if (cached && !force) return cached;
  const projectKey = getBrowserProjectKey();
  const projectName = getBrowserProjectName().trim() || 'Untitled project';
  try {
    const data = await fetchJson<{
      projectKey?: string;
      workspaceRoot?: string;
      mode?: string;
      exists?: boolean;
      projectName?: string;
    }>(withProjectQuery('/api/workspace/active'), { credentials: 'include' });
    cached = {
      projectKey: data.projectKey?.trim() || projectKey,
      projectName: data.projectName?.trim() || projectName,
      workspaceRoot: data.workspaceRoot?.trim() || `data/cloud-projects/${projectKey}`,
      mode: data.mode === 'cloud' ? 'cloud' : data.mode === 'guest' ? 'guest' : 'unknown',
      exists: data.exists !== false,
    };
    return cached;
  } catch {
    cached = {
      projectKey,
      projectName,
      workspaceRoot: `data/cloud-projects/${projectKey}`,
      mode: 'unknown',
      exists: true,
    };
    return cached;
  }
}

export function clearIdeWorkspaceMetaCache(): void {
  cached = null;
}

/** Block injected into every IDE Grok request so the model knows where files live. */
export function formatWorkspaceContextBlock(meta: IdeWorkspaceMeta, options?: { buildMode?: boolean }): string {
  const lines = [
    'ACTIVE_WORKSPACE (authoritative for this turn):',
    `- projectName: ${meta.projectName}`,
    `- projectKey: ${meta.projectKey}`,
    `- workspaceRoot: ${meta.workspaceRoot}`,
    `- mode: ${meta.mode}`,
    `- All file paths in \`\`\`file:…\`\`\` blocks must be relative to workspaceRoot.`,
  ];
  if (options?.buildMode) {
    lines.push(
      '- BUILD_MODE: ON — user wants implementation. Output Master Plan in <START_MASTERPLAN> tags only; code only as ```file:relative/path``` blocks or START_CODING (no ```typescript``` chat dumps).',
    );
  } else {
    lines.push(
      '- CONVERSATION_MODE: ON — reply in short prose only; no markdown code fences or file bodies unless the user explicitly asks to see a snippet.',
    );
  }
  return lines.join('\n');
}
