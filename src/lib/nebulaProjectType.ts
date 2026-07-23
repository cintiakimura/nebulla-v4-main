/**
 * Durable project type (Web App / Mobile App / Landing Page) for UI Studio + App Preview framing.
 * Pending localStorage is still used once for discovery bootstrap; this key survives consume().
 */

import { getBrowserProjectKey, withProjectQuery } from './nebulaProjectApi';

export type NebulaProjectType = 'Web App' | 'Mobile App' | 'Landing Page';

export type StudioDeviceMode = 'desktop' | 'mobile';

const PROJECT_TYPE_STORAGE_PREFIX = 'nebula_project_type_v1:';

export function isNebulaProjectType(v: unknown): v is NebulaProjectType {
  return v === 'Web App' || v === 'Mobile App' || v === 'Landing Page';
}

function storageKey(projectKey?: string): string {
  const key = (projectKey || getBrowserProjectKey() || 'default').trim() || 'default';
  return `${PROJECT_TYPE_STORAGE_PREFIX}${key}`;
}

/** Persist type for the active (or given) project key. */
export function setStoredProjectType(type: NebulaProjectType, projectKey?: string): void {
  try {
    localStorage.setItem(storageKey(projectKey), type);
  } catch {
    /* ignore */
  }
}

export function getStoredProjectType(projectKey?: string): NebulaProjectType | null {
  try {
    const v = localStorage.getItem(storageKey(projectKey))?.trim();
    return isNebulaProjectType(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearStoredProjectType(projectKey?: string): void {
  try {
    localStorage.removeItem(storageKey(projectKey));
  } catch {
    /* ignore */
  }
}

/** Mobile App → phone frame; Web App + Landing Page → desktop. */
export function studioDeviceModeForType(type: NebulaProjectType | null | undefined): StudioDeviceMode {
  return type === 'Mobile App' ? 'mobile' : 'desktop';
}

/** Pull Project Type from Master Plan §1 text when local storage is empty. */
export function parseProjectTypeFromText(text: string): NebulaProjectType | null {
  const raw = text || '';
  if (!raw.trim()) return null;

  // Prefer an explicit "Project Type: …" / "Project type — …" line.
  const labeled = raw.match(
    /project\s*type\s*[:\-–—]\s*(web\s*app|mobile\s*app|landing\s*page)/i,
  );
  if (labeled?.[1]) {
    const n = labeled[1].toLowerCase().replace(/\s+/g, ' ').trim();
    if (n === 'web app') return 'Web App';
    if (n === 'mobile app') return 'Mobile App';
    if (n === 'landing page') return 'Landing Page';
  }

  // Fallback: first clear mention in goal / discovery text.
  if (/\bmobile\s*app\b/i.test(raw)) return 'Mobile App';
  if (/\blanding\s*page\b/i.test(raw)) return 'Landing Page';
  if (/\bweb\s*app\b/i.test(raw)) return 'Web App';
  return null;
}

/**
 * Resolve type: stored → master-plan §1 → null (defaults to desktop framing).
 */
export async function resolveProjectType(projectKey?: string): Promise<NebulaProjectType | null> {
  const stored = getStoredProjectType(projectKey);
  if (stored) return stored;

  try {
    const r = await fetch(withProjectQuery('/api/master-plan/read'), { credentials: 'include' });
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, unknown>;
    const goalKeys = ['1. Goal of the app', '1. Goal', 'goal'];
    let blob = '';
    for (const k of goalKeys) {
      if (typeof data[k] === 'string' && (data[k] as string).trim()) {
        blob = data[k] as string;
        break;
      }
    }
    if (!blob) {
      blob = Object.values(data)
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
    }
    const parsed = parseProjectTypeFromText(blob);
    if (parsed) {
      setStoredProjectType(parsed, projectKey);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}
