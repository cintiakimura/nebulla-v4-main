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

type MindMapFidelity = {
  extraRoutes?: string[];
  allowWrite?: boolean;
  mode?: string;
};

/**
 * Mind map for the IDE shell — load/save graph via `/api/workspace/mind-map`.
 */
export function MindMapIdeRoute() {
  const [pages, setPages] = useState<Node[]>(DEFAULT_MIND_MAP.pages);
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_MIND_MAP.edges);
  const [extraRoutes, setExtraRoutes] = useState<string[]>([]);
  const [amendDraft, setAmendDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pagesRef = useRef(pages);
  const edgesRef = useRef(edges);
  pagesRef.current = pages;
  edgesRef.current = edges;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyFidelity = useCallback((fidelity?: MindMapFidelity | null) => {
    const extras = Array.isArray(fidelity?.extraRoutes) ? fidelity!.extraRoutes! : [];
    setExtraRoutes(extras);
  }, []);

  const reloadMindMap = useCallback(async () => {
    try {
      const data = await fetchJson<{
        pages?: Node[];
        edges?: Edge[];
        mindMapFidelity?: MindMapFidelity;
      }>(withProjectQuery('/api/workspace/mind-map'));
      const p = Array.isArray(data.pages) && data.pages.length > 0 ? data.pages : DEFAULT_MIND_MAP.pages;
      const e = Array.isArray(data.edges) ? data.edges : [];
      setPages(p);
      setEdges(e);
      applyFidelity(data.mindMapFidelity);
    } catch {
      /* keep defaults */
    }
  }, [applyFidelity]);

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
      setAmendDraft(null);
      setNote('Mind Map re-synced from Master Plan pages.');
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
      const data = await fetchJson<{
        mindMapFidelity?: MindMapFidelity;
        warning?: boolean;
      }>(withProjectQuery('/api/workspace/mind-map'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          withProjectBody({
            pages: pagesRef.current,
            edges: edgesRef.current,
          }),
        ),
      });
      applyFidelity(data.mindMapFidelity);
    } catch (e) {
      console.warn('[mind-map] save failed:', e);
    }
  }, [applyFidelity]);

  const onSaveToMasterPlan = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, 600);
  }, [flushSave]);

  const proposeAmendment = useCallback(async () => {
    if (!extraRoutes.length) return;
    setBusy(true);
    setNote(null);
    try {
      const data = await fetchJson<{ draftMarkdown?: string }>(
        withProjectQuery('/api/master-plan/propose-section4-amendment'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(withProjectBody({ extraRoutes })),
        },
      );
      setAmendDraft(data.draftMarkdown || null);
      setNote('Draft ready — Accept to add these pages to the Master Plan, or Sync to discard extras.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not draft amendment');
    } finally {
      setBusy(false);
    }
  }, [extraRoutes]);

  const acceptAmendment = useCallback(async () => {
    if (!amendDraft) return;
    setBusy(true);
    try {
      await fetchJson(withProjectQuery('/api/master-plan/accept-section4-amendment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withProjectBody({ draftMarkdown: amendDraft })),
      });
      setAmendDraft(null);
      setExtraRoutes([]);
      setNote('Pages added to Master Plan. Syncing Mind Map…');
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      await syncFromMasterPlan();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Accept failed');
    } finally {
      setBusy(false);
    }
  }, [amendDraft, syncFromMasterPlan]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background p-3">
      {extraRoutes.length > 0 ? (
        <div className="mb-2 shrink-0 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-50/95">
          <p className="font-medium">Mind Map has pages not in the Master Plan</p>
          <p className="mt-0.5 text-[11px] opacity-90">
            Extra routes: {extraRoutes.slice(0, 6).join(', ')}
            {extraRoutes.length > 6 ? '…' : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncFromMasterPlan()}
              className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50"
            >
              Discard extras (sync from plan)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void proposeAmendment()}
              className="rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-500/30 disabled:opacity-50"
            >
              Propose amendment to Pages
            </button>
            {amendDraft ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void acceptAmendment()}
                className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium hover:bg-emerald-500/30 disabled:opacity-50"
              >
                Accept amendment
              </button>
            ) : null}
          </div>
          {note ? <p className="mt-1.5 text-[10px] opacity-80">{note}</p> : null}
        </div>
      ) : note ? (
        <p className="mb-2 shrink-0 text-[11px] text-muted-foreground">{note}</p>
      ) : null}
      <MindMap
        pages={pages}
        setPages={setPages}
        edges={edges}
        setEdges={setEdges}
        onSaveToMasterPlan={onSaveToMasterPlan}
      />
    </div>
  );
}
