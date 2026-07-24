import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Lock, Save, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { readResponseJson } from '../lib/apiFetch';
import { PRE_CODING_SUMMARY_KEY } from '../lib/masterPlanSections';
import { getBrowserProjectName, withProjectQuery } from '../lib/nebulaProjectApi';
import { runMasterPlanUiPipelineWithV0 } from '../lib/ideArtifactSync';
import { dispatchOpenUiStudio } from '../lib/nebulaUiStudioEvents';

export function MasterPlan({
  onClose,
  projectKey = 'default',
}: {
  onClose: () => void;
  projectKey?: string;
}) {
  const [planData, setPlanData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [titles] = useState<string[]>([
    '1. Goal of the app',
    '2. Tech and Research',
    '3. Features and KPIs',
    '4. Pages and navigation',
    '5. UI/UX design',
  ]);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(withProjectQuery('/api/master-plan/read'));
      if (res.ok) {
        const data = await readResponseJson<Record<string, string>>(res);
        setPlanData(data);
      } else {
        console.warn("Failed to fetch master plan, status:", res.status);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error fetching master plan:", err);
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    const onRefresh = () => void fetchPlan();
    window.addEventListener('nebula-master-plan-updated', onRefresh);
    return () => window.removeEventListener('nebula-master-plan-updated', onRefresh);
  }, [fetchPlan]);

  // Expose updateSection to window for Grok B to use if needed
  useEffect(() => {
    (window as any).updateMasterPlanSection = async (tabNumber: number, newText: string) => {
      const title = titles[tabNumber - 1];
      if (!title) return { error: "Invalid tab number" };

      // Update local state immediately for instant re-render
      setPlanData(prev => ({ ...prev, [title]: newText }));

      // Persist to backend
      try {
        const res = await fetch(withProjectQuery('/api/master-plan/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ tabIndex: tabNumber, content: newText })),
        });
        return await res.json();
      } catch (err) {
        console.error("Failed to persist master plan update:", err);
        return { error: err };
      }
    };

    return () => {
      delete (window as any).updateMasterPlanSection;
    };
  }, [titles, projectKey]);

  const sectionContent = (title: string): string => {
    const direct = planData[title]?.trim();
    if (direct) return planData[title];
    if (title === '2. Tech and Research') {
      const legacy =
        planData['2. Text & Search']?.trim() ||
        planData['2. Tech & Research']?.trim() ||
        planData['2. Tech Research']?.trim();
      if (legacy) {
        return (
          planData['2. Text & Search'] ||
          planData['2. Tech & Research'] ||
          planData['2. Tech Research'] ||
          ''
        );
      }
    }
    return '';
  };

  const sessionBrief = planData[PRE_CODING_SUMMARY_KEY]?.trim() ?? '';

  const PLAN_SECTIONS = titles.map((title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const content = sectionContent(title);
    return { id, title, content };
  });
  const visibleSections = [
    ...PLAN_SECTIONS.slice(0, 5),
    ...(sessionBrief
      ? [{ id: 'session-brief', title: 'Go session brief', content: sessionBrief }]
      : []),
  ];

  const [activeTab, setActiveTab] = useState(visibleSections[0].id);
  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    const openTabFromNumber = (tabNumber: number) => {
      const section = visibleSections[tabNumber - 1];
      if (section) setActiveTab(section.id);
    };

    try {
      const pending = localStorage.getItem('nebula_master_plan_open_tab');
      if (pending) {
        const tabNumber = Number(pending);
        if (Number.isInteger(tabNumber)) openTabFromNumber(tabNumber);
        localStorage.removeItem('nebula_master_plan_open_tab');
      }
    } catch {
      /* ignore */
    }

    const handleOpenTab = (event: Event) => {
      const customEvent = event as CustomEvent<{ tabNumber?: number }>;
      const tabNumber = customEvent?.detail?.tabNumber;
      if (typeof tabNumber === 'number') openTabFromNumber(tabNumber);
    };

    window.addEventListener('nebula-open-master-plan-tab', handleOpenTab as EventListener);
    return () => {
      window.removeEventListener('nebula-open-master-plan-tab', handleOpenTab as EventListener);
    };
  }, [visibleSections]);

  const activeSection = visibleSections.find(s => s.id === activeTab);
  const activeContent = activeSection?.content ?? '';

  const handleSave = async () => {
    setIsSaved(true);
    try {
      const projectName = getBrowserProjectName().trim() || 'Untitled Project';
      const pipeline = await runMasterPlanUiPipelineWithV0({
        projectName,
        autoV0: false,
      });
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      if (pipeline.v0Ok) {
        window.dispatchEvent(new CustomEvent('nebula-ui-studio-v0-complete'));
        window.dispatchEvent(new CustomEvent('nebula-files-applied'));
        dispatchOpenUiStudio({ tab: 'design' });
      } else if (pipeline.v0PromptWritten) {
        dispatchOpenUiStudio({ tab: 'design' });
      }
    } catch (err) {
      console.warn('Master Plan save pipeline failed:', err);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-black shadow-2xl">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border bg-black px-4">
        <div className="flex items-center gap-3 text-foreground">
          <BookOpen className="h-4 w-4" />
          <span className="font-headline text-sm font-normal tracking-wide">Master Plan</span>
          <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSave}
            className="flex items-center gap-1 rounded-full border border-border px-4 py-1.5 text-xs font-normal text-foreground transition-colors hover:bg-[#111111]"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <div className="h-4 w-px bg-border"></div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#111111] hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="flex w-64 flex-col gap-1 overflow-y-auto border-r border-border bg-black p-3">
          {visibleSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveTab(section.id)}
              className={`rounded-md border px-3 py-2.5 text-left text-13 font-normal tracking-wide transition-all ${
                activeTab === section.id 
                  ? 'border-border bg-[#111111] text-foreground shadow-[inset_2px_0_0_0_var(--primary)]' 
                  : 'border-transparent text-muted-foreground hover:bg-[#111111] hover:text-foreground'
              }`}
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* Content Area (Read-only Doc) */}
        <div className="flex-1 overflow-y-auto bg-black p-8">
          <div className="prose prose-invert prose-sm mx-auto min-h-full max-w-3xl rounded-xl border border-border bg-black p-8 shadow-lg prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-[#0a0a0a] prose-pre:p-2 prose-table:border prose-table:border-border prose-th:bg-[#111111] prose-th:p-2 prose-td:border-t prose-td:border-border prose-td:p-2">
            {loading ? (
              <p className="text-slate-500 text-sm not-prose">Loading…</p>
            ) : activeContent.trim() ? (
              <ReactMarkdown>{activeContent}</ReactMarkdown>
            ) : (
              <p className="text-slate-500 text-sm not-prose leading-relaxed">
                No content in this section yet. Use the <strong className="text-slate-300">assistant</strong> (right
                panel) for the guided interview — the Master Plan fills as Grok saves each tab. You can also paste or edit
                here after generation.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
