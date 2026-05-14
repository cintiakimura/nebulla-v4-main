import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Lock, Save, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectBody, withProjectQuery } from '../lib/nebulaProjectApi';

export function MasterPlan({
  onClose,
  projectKey = 'default',
}: {
  onClose: () => void;
  projectKey?: string;
}) {
  const [planData, setPlanData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [titles, setTitles] = useState<string[]>([
    '1. Goal of the app',
    '2. Tech Research',
    '3. Features and KPIs',
    '4. Pages and navigation',
    '5. UI/UX design',
    '6. Environment Setup'
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

  const PLAN_SECTIONS = titles.map((title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const content = planData[title] || '';
    return { id, title, content };
  });
  const visibleSections = PLAN_SECTIONS.slice(0, 5);

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
    // The updateSection already handles persistence, but we can trigger a full save if needed
    console.log("Master Plan saved and locked.");
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-md border border-white/5 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-3 text-cyan-300">
          <BookOpen className="w-4.5 h-4.5" />
          <span className="font-headline text-sm tracking-wide">Master Plan</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSave}
            className="flex items-center gap-1 px-4 py-1.5 bg-primary-container/10 hover:bg-primary-container/20 text-primary rounded text-xs transition-colors border border-primary/20 font-headline"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <div className="w-px h-4 bg-white/10"></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="w-64 border-r border-white/5 bg-black/20 p-3 flex flex-col gap-1 overflow-y-auto">
          {visibleSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveTab(section.id)}
              className={`text-left px-3 py-2.5 rounded-md text-13 transition-all font-headline tracking-wide ${
                activeTab === section.id 
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[inset_2px_0_0_0_rgba(0,255,255,0.5)]' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
              }`}
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* Content Area (Read-only Doc) */}
        <div className="flex-1 bg-[#020810] p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-xl p-8 min-h-full shadow-lg prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md prose-table:border prose-table:border-white/10 prose-th:bg-white/5 prose-th:p-2 prose-td:p-2 prose-td:border-t prose-td:border-white/10">
            {loading ? (
              <p className="text-slate-500 text-sm not-prose">Loading…</p>
            ) : activeContent.trim() ? (
              <ReactMarkdown>{activeContent}</ReactMarkdown>
            ) : (
              <p className="text-slate-500 text-sm not-prose leading-relaxed">
                No content in this section yet. Use <strong className="text-slate-300">Partner chat</strong> (right
                panel on Explorer) for the guided interview — the Master Plan fills as Grok saves each tab. You can also
                paste or edit here after generation.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
