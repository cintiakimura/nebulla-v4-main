import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { readResponseJson } from '../lib/apiFetch';
import { PRE_CODING_SUMMARY_KEY } from '../lib/masterPlanSections';
import { withProjectBody, withProjectQuery } from '../lib/nebulaProjectApi';

export function MasterPlan({
  projectKey = 'default',
}: {
  onClose?: () => void;
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
        console.warn('Failed to fetch master plan, status:', res.status);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching master plan:', err);
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

  useEffect(() => {
    (window as any).updateMasterPlanSection = async (tabNumber: number, newText: string) => {
      const title = titles[tabNumber - 1];
      if (!title) return { error: 'Invalid tab number' };

      setPlanData((prev) => ({ ...prev, [title]: newText }));

      try {
        const res = await fetch(withProjectQuery('/api/master-plan/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withProjectBody({ tabIndex: tabNumber, content: newText })),
        });
        return await res.json();
      } catch (err) {
        console.error('Failed to persist master plan update:', err);
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
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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

  const activeSection = visibleSections.find((s) => s.id === activeTab);
  const activeContent = activeSection?.content ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <h2 className="type-section">Master Plan</h2>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2 sm:w-52"
          aria-label="Master Plan sections"
        >
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveTab(section.id)}
              className={`rounded-md border px-2.5 py-2 text-left text-xs tracking-wide transition-colors ${
                activeTab === section.id
                  ? 'border-[var(--shell-border-strong)] text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {section.title}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
          <div className="prose prose-invert prose-sm mx-auto min-h-full max-w-2xl prose-headings:font-medium prose-p:text-muted-foreground prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:p-3">
            {loading ? (
              <p className="type-body-dense not-prose text-muted-foreground">Loading…</p>
            ) : activeContent.trim() ? (
              <ReactMarkdown>{activeContent}</ReactMarkdown>
            ) : (
              <p className="type-body-dense not-prose leading-relaxed text-muted-foreground">
                No content in this section yet. Use the assistant for the guided interview — the Master
                Plan fills as each tab is saved.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
