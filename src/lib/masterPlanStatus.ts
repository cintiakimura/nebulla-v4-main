/**
 * Client helpers for GET /api/master-plan/status (Phase F polish).
 */
import { fetchJson } from './apiFetch';
import { withProjectQuery } from './nebulaProjectApi';

export type MasterPlanStatusGap = {
  code: string;
  section: string;
  severity: 'warn' | 'block';
  message: string;
  remediation: string;
};

export type MasterPlanStatus = {
  mode: 'off' | 'warn' | 'strict';
  ok: boolean;
  allowGo: boolean;
  shape: 'complete' | 'legacy' | 'incomplete';
  gaps: MasterPlanStatusGap[];
  sectionLengths?: Record<string, number>;
  uiBriefLength?: number;
  /** True when status sync auto-merged industry security assumptions into §2. */
  securityAutoApplied?: boolean;
  securityProposal?: {
    needed: boolean;
    /** MVP: Accept is optional acknowledgment only — never required for Go. */
    optional?: boolean;
    sectionKey: string;
    draftMarkdown: string;
  } | null;
};

/** Friendly labels — never dump raw gap codes unless debugging. */
const GAP_FRIENDLY: Record<string, string> = {
  GOAL_EMPTY: 'Add a clear goal for the app',
  RESEARCH_THIN: 'Add competitor research in Tech and Research',
  FEATURES_EMPTY: 'List the main features',
  KPI_UNTESTABLE: 'Make success measures more concrete',
  PAGES_EMPTY: 'Add pages with real routes',
  PAGES_THIN: 'Spell out what each page does (actions, access, empty states)',
  PAGE_MISSING_ACTIONS: 'Add actions and access rules on each page',
  UI_TOKENS_MISSING: 'Add colors, fonts, and density in UI/UX design',
  UI_SECTION_TOO_LONG: 'Keep UI/UX design short — page detail belongs in the UI brief',
  SEC_RLS_MISSING: 'Security assumptions will auto-fill in Tech and Research (optional polish)',
  SEC_AUTH_MISSING: 'Sign-in assumptions will auto-fill (does not pause coding)',
  SEC_PII_MISSING: 'Note what personal data you store (harden before deploy)',
  UI_BRIEF_MISSING: 'Save the Master Plan so the UI brief can be generated',
  MINDMAP_EXTRA_ROUTES: 'Mind Map has pages not in the plan — re-sync from Pages',
};

export function friendlyGapLine(gap: MasterPlanStatusGap): string {
  return GAP_FRIENDLY[gap.code] || gap.message;
}

export function summarizeMasterPlanStatus(status: MasterPlanStatus): {
  tone: 'ok' | 'warn' | 'block';
  title: string;
  lines: string[];
} {
  const blockGaps = status.gaps.filter((g) => g.severity === 'block');
  const warnGaps = status.gaps.filter((g) => g.severity === 'warn');

  if (blockGaps.length === 0 && warnGaps.length === 0) {
    return {
      tone: 'ok',
      title: 'Plan looks ready',
      lines: ['Pages, research, and design tokens are in good shape for the next Go slice.'],
    };
  }

  if (blockGaps.length > 0) {
    const blocked =
      status.mode === 'strict' && !status.allowGo
        ? 'Go is paused until these are filled in.'
        : 'Fill these in before building so the app is set up correctly.';
    return {
      tone: 'block',
      title: 'A few planning pieces are still missing',
      lines: [blocked, ...blockGaps.slice(0, 4).map(friendlyGapLine)],
    };
  }

  return {
    tone: 'warn',
    title: 'Plan works — a few polish items',
    lines: warnGaps.slice(0, 3).map(friendlyGapLine),
  };
}

export async function fetchMasterPlanStatus(): Promise<MasterPlanStatus | null> {
  try {
    return await fetchJson<MasterPlanStatus>(withProjectQuery('/api/master-plan/status'), {
      credentials: 'include',
    });
  } catch (e) {
    console.warn('[masterPlanStatus]', e);
    return null;
  }
}

/** User-facing message when Go returns MASTER_PLAN_INCOMPLETE. */
export function formatGoBlockedByPlanMessage(payload: {
  error?: string;
  masterPlanCompleteness?: { gaps?: MasterPlanStatusGap[]; mode?: string };
}): string {
  const gaps = payload.masterPlanCompleteness?.gaps?.filter((g) => g.severity === 'block') ?? [];
  const lines = gaps.slice(0, 4).map(friendlyGapLine);
  if (lines.length === 0) {
    return "We're missing a few planning pieces before Go. Open the Master Plan tab and finish Discovery with the assistant — one question at a time.";
  }
  return [
    "Go is paused until the Master Plan is more complete.",
    ...lines.map((l) => `• ${l}`),
    'Open Master Plan or continue Discovery in chat — then try Go again.',
  ].join('\n');
}
