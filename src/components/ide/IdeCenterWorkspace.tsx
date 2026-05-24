import { useCallback, useEffect, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import { Code2, MonitorPlay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppPreviewPanel } from '../AppPreviewPanel';
import { CodeEditor } from './CodeEditor';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';

type CenterPane = 'code' | 'preview';

const CENTER_PANE_LS = 'nebulla_ide_center_pane_v1';

function readStoredPane(): CenterPane {
  try {
    return localStorage.getItem(CENTER_PANE_LS) === 'preview' ? 'preview' : 'code';
  } catch {
    return 'code';
  }
}

function storePane(pane: CenterPane): void {
  try {
    localStorage.setItem(CENTER_PANE_LS, pane);
  } catch {
    /* ignore */
  }
}

/** Explorer main area: code editor and live app preview (chat stays in a fixed right column). */
export function IdeCenterWorkspace({
  onOpenSourceControl,
}: {
  onOpenSourceControl?: () => void;
}) {
  const [pane, setPane] = useState<CenterPane>(readStoredPane);

  const selectPane = useCallback((next: CenterPane) => {
    setPane(next);
    storePane(next);
  }, []);

  useEffect(() => {
    const onPreview = () => selectPane('preview');
    const onFilesApplied = () => selectPane('preview');
    window.addEventListener('nebula-open-app-preview', onPreview);
    window.addEventListener('nebula-files-applied', onFilesApplied);
    return () => {
      window.removeEventListener('nebula-open-app-preview', onPreview);
      window.removeEventListener('nebula-files-applied', onFilesApplied);
    };
  }, [selectPane]);

  const pages: FlowNode[] = [
    {
      id: 'preview-root',
      type: 'pageNode',
      position: { x: 0, y: 0 },
      data: { label: getBrowserProjectName().trim() || 'Workspace' },
    },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="surface-active tonal-seam-b flex h-9 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => selectPane('code')}
          className={cn(
            'type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
            pane === 'code'
              ? 'active-tab-sheen text-primary'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden />
          Code
        </button>
        <button
          type="button"
          onClick={() => selectPane('preview')}
          className={cn(
            'type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
            pane === 'preview'
              ? 'active-tab-sheen text-primary'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
          App preview
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden',
            pane === 'code' ? 'z-10' : 'pointer-events-none invisible z-0',
          )}
          aria-hidden={pane !== 'code'}
        >
          <CodeEditor hidePreviewButton />
        </div>
        <div
          className={cn(
            'absolute inset-0 flex flex-col overflow-hidden',
            pane === 'preview' ? 'z-10' : 'pointer-events-none invisible z-0',
          )}
          aria-hidden={pane !== 'preview'}
        >
          <AppPreviewPanel
            pages={pages}
            onOpenSourceControl={onOpenSourceControl}
            defaultPanelOpen
            embeddedInDock
          />
        </div>
      </div>
    </div>
  );
}
