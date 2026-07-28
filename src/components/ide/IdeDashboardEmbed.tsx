import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dashboard, type DashboardTab } from '../Dashboard';
import {
  getBrowserProjectKey,
  getBrowserProjectName,
  setBrowserProjectKey,
  setBrowserProjectName,
} from '../../lib/nebulaProjectApi';
import {
  readGuestIndex,
  removeGuestProject,
  updateGuestIndexMeta,
  writeActiveGuestProjectId,
  clearActiveGuestProjectId,
} from '../../lib/nebulaProjectStore';
import { createProjectForCurrentSession, fetchSessionUser, type NebulaSessionUser } from '../../lib/nebulaCloud';
import { fetchNebulaPublicConfig, type NebulaPublicConfig } from '../../lib/nebulaPublicConfig';
import { resetProjectFromScratch } from '../../lib/ideProjectReset';

function normalizeTab(tab: DashboardTab | 'project-settings'): DashboardTab {
  if (tab === 'project-settings') return 'secrets';
  return tab;
}

export function IdeDashboardEmbed({
  initialTab,
}: {
  initialTab: DashboardTab | 'project-settings';
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => normalizeTab(initialTab));
  const [projectName, setProjectNameState] = useState(
    () => getBrowserProjectName().trim() || 'Untitled project',
  );
  const [sessionUser, setSessionUser] = useState<NebulaSessionUser | null>(null);
  const [publicConfig, setPublicConfig] = useState<NebulaPublicConfig>({});

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    const name = getBrowserProjectName().trim();
    if (name) setProjectNameState(name);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cfg, u] = await Promise.all([fetchNebulaPublicConfig(), fetchSessionUser()]);
      if (cancelled) return;
      setPublicConfig(cfg);
      setSessionUser(u);
    })();
    const onOAuth = (ev: MessageEvent) => {
      if (ev.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
      void fetchSessionUser().then((u) => {
        if (!cancelled) setSessionUser(u);
      });
    };
    window.addEventListener('message', onOAuth);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onOAuth);
    };
  }, [activeTab]);

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
    void (async () => {
      await resetProjectFromScratch(label);
      await createProjectForCurrentSession(label);
      window.location.reload();
    })();
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
        sessionUser={sessionUser}
        publicConfig={publicConfig}
      />
    </div>
  );
}
