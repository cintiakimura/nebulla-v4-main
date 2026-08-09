/** Shell IA: Landing (`/`) → Dashboard (projects) → Build / Code / Plan / Settings. */

export type IdeShellScreen = 'build' | 'code' | 'plan' | 'settings' | 'dashboard';

export type IdeDashboardPanel =
  | 'projects'
  | 'plan'
  | 'mindmap'
  | 'files'
  | 'studio'
  | 'settings';

export type IdeStartProjectType = 'Web App' | 'Mobile App' | 'Landing Page' | null;

const SCREEN_KEY = 'nebula_shell_screen_v1';
const GOAL_KEY = 'nebula_shell_goal_v1';
const PANEL_KEY = 'nebula_shell_dashboard_panel_v1';
const TYPE_KEY = 'nebula_shell_start_type_v1';

function readLs(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * IDE workspace screens only.
 * Restores last screen when set; first entry / unknown → Dashboard (projects home).
 * Landing goal handoff still writes `'build'` explicitly.
 */
export function readStoredShellScreen(): IdeShellScreen {
  const raw = readLs(SCREEN_KEY);
  if (
    raw === 'dashboard' ||
    raw === 'plan' ||
    raw === 'code' ||
    raw === 'build' ||
    raw === 'settings'
  ) {
    return raw;
  }
  // 'start' | missing → Dashboard
  return 'dashboard';
}

/** Persist Build before reload when opening/starting a project from Dashboard. */
export function markEnterBuildScreen(): void {
  writeStoredShellScreen('build');
}

export function writeStoredShellScreen(screen: IdeShellScreen): void {
  writeLs(SCREEN_KEY, screen);
}

export function readStoredShellGoal(): string {
  return readLs(GOAL_KEY)?.trim() || '';
}

export function writeStoredShellGoal(goal: string): void {
  writeLs(GOAL_KEY, goal.trim());
}

export function clearStoredShellGoal(): void {
  try {
    localStorage.removeItem(GOAL_KEY);
  } catch {
    /* ignore */
  }
}

export function readStoredDashboardPanel(): IdeDashboardPanel {
  const raw = readLs(PANEL_KEY);
  if (
    raw === 'projects' ||
    raw === 'plan' ||
    raw === 'mindmap' ||
    raw === 'files' ||
    raw === 'studio' ||
    raw === 'settings'
  ) {
    return raw;
  }
  return 'projects';
}

export function writeStoredDashboardPanel(panel: IdeDashboardPanel): void {
  writeLs(PANEL_KEY, panel);
}

export function readStoredStartType(): IdeStartProjectType {
  const raw = readLs(TYPE_KEY);
  if (raw === 'Web App' || raw === 'Mobile App' || raw === 'Landing Page') return raw;
  return null;
}

export function writeStoredStartType(t: IdeStartProjectType): void {
  if (!t) {
    try {
      localStorage.removeItem(TYPE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  writeLs(TYPE_KEY, t);
}

/** Persist goal from Landing and mark Build as the next workspace screen. */
export function persistLandingGoalForBuild(
  goal: string,
  startType?: IdeStartProjectType,
): boolean {
  const next = goal.trim();
  if (!next) return false;
  writeStoredShellGoal(next);
  writeStoredShellScreen('build');
  if (startType !== undefined) writeStoredStartType(startType);
  return true;
}
