import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';
import { withProjectQuery } from '../lib/nebulaProjectApi';

const DEFAULT_PATH = 'project-execution-rules.md';

export function ExecutionRulesViewer({
  filePath = DEFAULT_PATH,
  projectKey = 'default',
  projectName = '',
}: {
  filePath?: string;
  projectKey?: string;
  projectName?: string;
  onExitCodeMode?: () => void;
}) {
  const [body, setBody] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const q = encodeURIComponent(filePath);
        const res = await fetch(withProjectQuery(`/api/files/content?path=${q}`));
        const data = await readResponseJson<{ content?: string; error?: string }>(res);
        if (!res.ok) {
          throw new Error(data.error || res.statusText);
        }
        if (!cancelled) setBody(typeof data.content === 'string' ? data.content : '');
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath, projectKey, projectName]);

  return (
    <div className="flex flex-col h-full glass-panel rounded-md border border-cyan-500/20 overflow-hidden shadow-2xl bg-[#020810]/90">
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-cyan-950/30 shrink-0">
        <div className="flex items-center gap-2 text-cyan-300">
          <FileText className="w-4 h-4" />
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-200 border border-cyan-500/25">
            {filePath}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : err ? (
          <p className="text-red-400 text-sm">{err}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
