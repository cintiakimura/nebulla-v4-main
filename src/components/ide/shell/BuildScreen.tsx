import { useEffect } from 'react';
import { AIChat } from '@/components/ide/AIChat';
import { useIdeShellNav } from './IdeShellNavContext';
import { ensurePendingIdeaFromShellGoal } from '../../../lib/landingGoalHandoff';
import { BuildPreviewCanvas } from './previewTools/BuildPreviewCanvas';
import { useChatPreviewSplit } from './previewTools/useChatPreviewSplit';

/**
 * Build page: resizable chat + preview with new preview toolbar.
 * No terminal, explorer, or Preview card chrome.
 */
export function BuildScreen() {
  const { goal } = useIdeShellNav();
  const { chatWidth, onHandleMouseDown } = useChatPreviewSplit();

  useEffect(() => {
    ensurePendingIdeaFromShellGoal();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Preview + toolbar — main stage */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <BuildPreviewCanvas />
      </div>

      {/* Drag handle between preview and chat */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and preview"
        title="Drag to resize"
        onMouseDown={onHandleMouseDown}
        className="ide-resize-hit group relative z-10 w-1 shrink-0 cursor-col-resize bg-border hover:bg-[#3a3a3a]"
      />

      {/* Chat */}
      <aside
        className="ide-glass-chrome flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border"
        style={{ width: chatWidth, minWidth: 260, maxWidth: 560 }}
      >
        <div className="shrink-0 border-b border-border px-4 py-2.5">
          <p className="text-sm text-foreground">Chat</p>
          {goal ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={goal}>
              Goal · {goal}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AIChat />
        </div>
      </aside>
    </div>
  );
}
