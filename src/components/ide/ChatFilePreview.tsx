import { FileCode2, Github, FolderOpen } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import type { SmartChatFilePreview } from '../../lib/smartChatHandler';

function mapLanguage(lang: string): string {
  const l = String(lang || 'plaintext').toLowerCase();
  if (l === 'typescript' || l === 'ts' || l === 'tsx') return 'tsx';
  if (l === 'javascript' || l === 'js' || l === 'jsx') return 'jsx';
  if (l === 'markdown' || l === 'md') return 'markdown';
  if (l === 'json') return 'json';
  if (l === 'css') return 'css';
  if (l === 'html') return 'markup';
  return 'text';
}

type Props = {
  preview: SmartChatFilePreview;
  className?: string;
};

/** Rich file preview card for IDE chat (syntax highlighted). */
export function ChatFilePreview({ preview, className }: Props) {
  const code = preview.content.length > 12_000
    ? `${preview.content.slice(0, 12_000)}\n\n/* … truncated for preview … */`
    : preview.content;

  return (
    <div
      className={cn(
        'mt-2 overflow-hidden rounded-lg border border-border bg-[var(--surface-bright)] text-left shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        {preview.source === 'github' ? (
          <Github className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
        ) : (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        )}
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-slate-100">{preview.title}</p>
          <p className="truncate text-[10px] text-slate-500" title={preview.pathOrUrl}>
            {preview.source === 'github' ? 'GitHub' : 'Local'} · {preview.language}
          </p>
        </div>
      </div>
      <div className="max-h-72 overflow-auto">
        <SyntaxHighlighter
          language={mapLanguage(preview.language)}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '0.75rem',
            background: 'transparent',
            fontSize: '11px',
            lineHeight: 1.45,
          }}
          wrapLongLines
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
