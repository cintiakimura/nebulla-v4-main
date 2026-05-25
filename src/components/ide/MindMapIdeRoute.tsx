import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { MindMap } from '../MindMap';
import { fetchJson } from '../../lib/apiFetch';
import { getBrowserProjectName, withProjectBody, withProjectQuery } from '../../lib/nebulaProjectApi';

function defaultFlow(): { pages: Node[]; edges: Edge[] } {
  const pages: Node[] = [
    {
      id: 'mm-home',
      type: 'pageNode',
      position: { x: 320, y: 220 },
      data: {
        label: 'Home',
        isCreated: false,
        isCritical: false,
        description: 'Start mapping pages and flows.',
        onDelete: () => {},
      },
    },
  ];
  return { pages, edges: [] };
}

const DEFAULT_MIND_MAP = defaultFlow();

/**
 * Mind map for the IDE shell — load/save graph via `/api/workspace/mind-map`.
 */
export function MindMapIdeRoute() {
  const [pages, setPages] = useState<Node[]>(DEFAULT_MIND_MAP.pages);
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_MIND_MAP.edges);
  const pagesRef = useRef(pages);
  const edgesRef = useRef(edges);
  pagesRef.current = pages;
  edgesRef.current = edges;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadMindMap = useCallback(async () => {
    try {
      const data = await fetchJson<{ pages?: Node[]; edges?: Edge[] }>(
        withProjectQuery('/api/workspace/mind-map'),
      );
      const p = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : DEFAULT_MIND_MAP.pages;
      const e = Array.isArray(data.edges) ? data.edges : [];
      setPages(p);
      setEdges(e);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void reloadMindMap();
  }, [reloadMindMap]);

  const syncFromMasterPlan = useCallback(async () => {
    try {
      await fetchJson(withProjectQuery('/api/workspace/mind-map/sync-from-master-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          withProjectBody({ projectName: getBrowserProjectName().trim() || 'Untitled Project' }),
        ),
      });
      window.dispatchEvent(new CustomEvent('nebula-mind-map-updated'));
      await reloadMindMap();
    } catch (e) {
      console.warn('[mind-map] sync from master plan:', e);
    }
  }, [reloadMindMap]);

  useEffect(() => {
    const onRefresh = () => void reloadMindMap();
    const onMasterPlan = () => void syncFromMasterPlan();
    window.addEventListener('nebula-master-plan-updated', onMasterPlan);
    window.addEventListener('nebula-mind-map-updated', onRefresh);
    window.addEventListener('nebula-files-applied', onRefresh);
    return () => {
      window.removeEventListener('nebula-master-plan-updated', onMasterPlan);
      window.removeEventListener('nebula-mind-map-updated', onRefresh);
      window.removeEventListener('nebula-files-applied', onRefresh);
    };
  }, [reloadMindMap, syncFromMasterPlan]);

  const flushSave = useCallback(async () => {
    try {
      await fetchJson(withProjectQuery('/api/workspace/mind-map'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withProjectBody({
            pages: pagesRef.current,
            edges: edgesRef.current,
          }),
        ),
      });
    } catch (e) {
      console.warn('[mind-map] save failed:', e);
    }
  }, []);

  const onSaveToMasterPlan = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, 600);
  }, [flushSave]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background p-3">
      <MindMap pages={pages} setPages={setPages} edges={edges} setEdges={setEdges} onSaveToMasterPlan={onSaveToMasterPlan} />
    </div>
  );
}
