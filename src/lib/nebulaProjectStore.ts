/**
 * Guest / local-only multi-project storage (browser).
 * Logged-in users sync projects via `/api/projects` (Render PostgreSQL); active cloud name is tracked in localStorage.
 */

const INDEX_KEY = 'nebula_projects_index_v1';
const ACTIVE_KEY = 'nebula_active_project_id_v1';
const LEGACY_SINGLE = 'nebula_project_default';

export type ProjectIndexEntry = {
  id: string;
  name: string;
  updatedAt: string;
};

export type ProjectPayload = {
  pages: unknown;
  edges: unknown;
  projectName: string;
};

function dataKey(id: string) {
  return `nebula_project_data_${id}`;
}

export function readGuestIndex(): ProjectIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectIndexEntry[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function writeGuestIndex(entries: ProjectIndexEntry[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

export function readGuestProjectData(id: string): ProjectPayload | null {
  try {
    const raw = localStorage.getItem(dataKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as ProjectPayload;
    if (d && typeof d === 'object' && 'pages' in d && 'edges' in d) return d;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeGuestProjectData(id: string, payload: ProjectPayload) {
  localStorage.setItem(dataKey(id), JSON.stringify(payload));
}

export function readActiveGuestProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveGuestProjectId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** If no index exists but legacy single-project blob does, migrate once. */
export function migrateLegacyGuestProject(
  fallbackName: string,
  initialPayload: ProjectPayload
): { index: ProjectIndexEntry[]; activeId: string } {
  const existing = readGuestIndex();
  if (existing.length > 0) {
    const active = readActiveGuestProjectId();
    const id = active && existing.some((e) => e.id === active) ? active : existing[0].id;
    return { index: existing, activeId: id };
  }

  try {
    const leg = localStorage.getItem(LEGACY_SINGLE);
    if (leg) {
      const parsed = JSON.parse(leg) as Partial<ProjectPayload>;
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `proj_${Date.now()}`;
      const name =
        typeof parsed.projectName === 'string' && parsed.projectName.trim()
          ? parsed.projectName.trim()
          : fallbackName;
      const payload: ProjectPayload = {
        pages: parsed.pages ?? initialPayload.pages,
        edges: parsed.edges ?? initialPayload.edges,
        projectName: name,
      };
      writeGuestProjectData(id, payload);
      const entry: ProjectIndexEntry = {
        id,
        name,
        updatedAt: new Date().toISOString(),
      };
      writeGuestIndex([entry]);
      writeActiveGuestProjectId(id);
      return { index: [entry], activeId: id };
    }
  } catch {
    /* ignore */
  }

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `proj_${Date.now()}`;
  writeGuestProjectData(id, initialPayload);
  const entry: ProjectIndexEntry = {
    id,
    name: initialPayload.projectName || fallbackName,
    updatedAt: new Date().toISOString(),
  };
  writeGuestIndex([entry]);
  writeActiveGuestProjectId(id);
  return { index: [entry], activeId: id };
}

export function createGuestProject(initialPayload: ProjectPayload): ProjectIndexEntry {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `proj_${Date.now()}`;
  writeGuestProjectData(id, initialPayload);
  const entry: ProjectIndexEntry = {
    id,
    name: initialPayload.projectName,
    updatedAt: new Date().toISOString(),
  };
  const idx = readGuestIndex();
  writeGuestIndex([entry, ...idx]);
  writeActiveGuestProjectId(id);
  return entry;
}

export function updateGuestIndexMeta(id: string, name: string) {
  const idx = readGuestIndex();
  const next = idx.map((e) =>
    e.id === id ? { ...e, name, updatedAt: new Date().toISOString() } : e
  );
  writeGuestIndex(next);
}

export function removeGuestProject(id: string): ProjectIndexEntry[] {
  const idx = readGuestIndex().filter((e) => e.id !== id);
  writeGuestIndex(idx);
  try {
    localStorage.removeItem(dataKey(id));
  } catch {
    /* ignore */
  }
  if (readActiveGuestProjectId() === id && idx.length > 0) {
    writeActiveGuestProjectId(idx[0].id);
  }
  return idx;
}
