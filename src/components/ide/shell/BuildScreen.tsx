import { useEffect } from 'react';
import { AIChat } from '@/components/ide/AIChat';
import { useIdeShellNav } from './IdeShellNavContext';
import { ensurePendingIdeaFromShellGoal } from '../../../lib/landingGoalHandoff';
import { BuildPreviewCanvas } from './previewTools/BuildPreviewCanvas';
import { useChatPreviewSplit } from './previewTools/useChatPreviewSplit';

/**
 * Build page: resizable chat + preview with new preview toolbar.
 * Status lives in the chat column (max 50%). Terminal is on Code.
 */
export function BuildScreen() {
  const { goal } = useIdeShellNav();
  const { chatWidth, onHandleMouseDown } = useChatPreviewSplit();

  useEffect(() => {
    ensurePendingIdeaFromShellGoal();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Preview + toolbar — main stage, edge-to-edge */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <BuildPreviewCanvas />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat and preview"
        title="Drag to resize"
        onMouseDown={onHandleMouseDown}
        className="ide-resize-hit group relative z-10 w-px shrink-0 cursor-col-resize bg-border hover:bg-[#3a3a3a]"
      />

      {/* Chat — no “Chat” label; goal only when present */}
      <aside
        className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border"
        style={{ width: chatWidth, minWidth: 280, maxWidth: 560 }}
        aria-label="Chat"
      >
        {goal ? (
          <p className="type-label-sm shrink-0 truncate px-4 pb-1 pt-3 text-muted-foreground" title={goal}>
            Goal · {goal}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          <AIChat />
        </div>
      </aside>
    </div>
  );
}
