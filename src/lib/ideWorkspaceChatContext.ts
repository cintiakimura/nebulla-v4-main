import { fetchJson } from './apiFetch';
import { formatWorkspaceFileIndexBlock } from '../../lib/ideAiContextBlocks';
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

export type WorkspaceOverviewForChat = {
  paths: string[];
  gitBranch: string | null;
};

export async function fetchWorkspaceOverviewForChat(): Promise<WorkspaceOverviewForChat> {
  try {
    const data = await fetchJson<{
      nebulaFiles?: { relativePath: string }[];
      git?: { branch?: string } | null;
    }>(withProjectQuery('/api/source-control/overview'), { credentials: 'include' });
    const paths = (data.nebulaFiles ?? [])
      .map((f) => f.relativePath.replace(/\\/g, '/'))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const branchRaw = data.git?.branch?.trim();
    const gitBranch =
      branchRaw && branchRaw !== 'unknown' && branchRaw !== '?' ? branchRaw : null;
    return { paths, gitBranch };
  } catch {
    return { paths: [], gitBranch: null };
  }
}

export function formatWorkspaceEnrichmentBlock(overview: WorkspaceOverviewForChat): string {
  if (overview.paths.length === 0 && !overview.gitBranch) {
    return 'WORKSPACE_FILE_INDEX: (empty — no user app files on disk yet; scaffold on BUILD_MODE or Go.)';
  }
  return formatWorkspaceFileIndexBlock(overview.paths, { gitBranch: overview.gitBranch });
}

/** Block injected into every IDE Grok request so the model knows where files live. */
export function formatWorkspaceContextBlock(
  meta: IdeWorkspaceMeta,
  options?: { buildMode?: boolean; enrichment?: string },
): string {
  const lines = [
    'ACTIVE_WORKSPACE (authoritative for this turn):',
    `- projectName: ${meta.projectName}`,
    `- projectKey: ${meta.projectKey}`,
    `- workspaceRoot: ${meta.workspaceRoot}`,
    `- mode: ${meta.mode}`,
    `- persistence: ${meta.mode === 'cloud' ? 'cloud project (saved while signed in)' : meta.mode === 'guest' ? 'local guest only — sign in with email to persist' : 'unknown'}`,
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
  lines.push(
    '- Ground answers in WORKSPACE_FILE_INDEX and Master Plan; do not invent files or features that contradict them.',
  );
  const base = lines.join('\n');
  const enrichment = options?.enrichment?.trim();
  return enrichment ? `${base}\n\n${enrichment}` : base;
}
