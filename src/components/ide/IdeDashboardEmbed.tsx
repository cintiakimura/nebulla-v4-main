import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dashboard, type DashboardTab } from '../Dashboard';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
} from '../../lib/nebulaProjectApi';
import {
  createGuestProject,
  readGuestIndex,
  removeGuestProject,
  updateGuestIndexMeta,
  writeActiveGuestProjectId,
  clearActiveGuestProjectId,
  type ProjectPayload,
} from '../../lib/nebulaProjectStore';

export function IdeDashboardEmbed({
  initialTab,
}: {
  initialTab: DashboardTab;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [projectName, setProjectNameState] = useState(
    () => getBrowserProjectName().trim() || 'Untitled project',
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const name = getBrowserProjectName().trim();
    if (name) setProjectNameState(name);
  }, [initialTab]);

  const projects = useMemo(() => {
    const guest = readGuestIndex().map((e) => ({
      key: e.id,
      name: e.name,
      updatedAt: e.updatedAt,
    }));
    const ck = getBrowserProjectKey();
    const displayName = projectName.trim() || ck;
    if (!guest.some((p) => p.key === ck)) {
      return [{ key: ck, name: displayName, updatedAt: new Date().toISOString() }, ...guest];
    }
    return guest.map((p) => (p.key === ck ? { ...p, name: displayName } : p));
  }, [projectName]);

  const activeProjectKey = getBrowserProjectKey();

  const onProjectNameChange = useCallback((name: string) => {
    setProjectNameState(name);
    setBrowserProjectName(name);
    const key = getBrowserProjectKey();
    if (readGuestIndex().some((e) => e.id === key)) {
      updateGuestIndexMeta(key, name);
    }
  }, []);

  const onOpenProject = useCallback((key: string) => {
    setBrowserProjectKey(key);
    if (readGuestIndex().some((e) => e.id === key)) {
      writeActiveGuestProjectId(key);
    } else {
      clearActiveGuestProjectId();
    }
    const meta = readGuestIndex().find((e) => e.id === key);
    setBrowserProjectName(meta?.name?.trim() || key);
    window.location.reload();
  }, []);

  const onDeleteProject = useCallback((key: string) => {
    const cloud = getBrowserProjectKey();
    if (key === cloud) return;
    removeGuestProject(key);
    window.location.reload();
  }, []);

  const onStartFlow = useCallback((kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => {
    const label =
      kind === 'github'
        ? 'GitHub project'
        : kind === 'upload'
          ? 'Upload project'
          : kind === 'prompt'
            ? 'Prompt project'
            : 'New project';
    const payload: ProjectPayload = {
      pages: [],
      edges: [],
      projectName: label,
    };
    createGuestProject(payload);
    window.location.reload();
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
      <Dashboard
        activeTab={activeTab}
        onTabChange={setActiveTab}
        projectName={projectName}
        onProjectNameChange={onProjectNameChange}
        projects={projects}
        activeProjectKey={activeProjectKey}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
        onStartFlow={onStartFlow}
      />
    </div>
  );
}
