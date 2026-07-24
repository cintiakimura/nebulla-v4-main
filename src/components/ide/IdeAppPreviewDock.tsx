import { useCallback, useEffect, useState } from 'react';
import type { Node as FlowNode } from '@xyflow/react';
import { AppPreviewPanel } from '../AppPreviewPanel';
import { getBrowserProjectName } from '../../lib/nebulaProjectApi';

const PREVIEW_DOCK_LS = 'nebulla_ide_preview_dock_open_v1';
const PREVIEW_WIDTH_PX = 380;

function readDockOpen(): boolean {
  try {
    return localStorage.getItem(PREVIEW_DOCK_LS) === '1';
  } catch {
    return false;
  }
}

function writeDockOpen(open: boolean): void {
  try {
    localStorage.setItem(PREVIEW_DOCK_LS, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Live app preview docked beside the code editor (explorer layout). */
export function IdeAppPreviewDock({
  onOpenSourceControl,
}: {
  onOpenSourceControl?: () => void;
}) {
  const [open, setOpen] = useState(readDockOpen);

  const openPreview = useCallback(() => {
    setOpen(true);
    writeDockOpen(true);
  }, []);

  useEffect(() => {
    const onOpen = () => openPreview();
    const onFilesApplied = () => openPreview();
    window.addEventListener('nebula-open-app-preview', onOpen);
    window.addEventListener('nebula-files-applied', onFilesApplied);
    return () => {
      window.removeEventListener('nebula-open-app-preview', onOpen);
      window.removeEventListener('nebula-files-applied', onFilesApplied);
    };
  }, [openPreview]);

  const pages: FlowNode[] = [
    {
      id: 'preview-root',
      type: 'pageNode',
      position: { x: 0, y: 0 },
      data: { label: getBrowserProjectName().trim() || 'Workspace' },
    },
  ];

  if (!open) {
    return (
      <div className="surface-active flex w-10 shrink-0 flex-col items-center border-l border-border py-3">
        <button
          type="button"
          title="Open app preview"
          className="type-label-sm flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary"
          onClick={openPreview}
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div
      className="surface-active relative hidden min-w-0 shrink-0 overflow-hidden border-l border-border md:flex"
      style={{ width: PREVIEW_WIDTH_PX }}
    >
      <AppPreviewPanel
        pages={pages}
        onOpenSourceControl={onOpenSourceControl}
        defaultPanelOpen
        embeddedInDock
        onCloseDock={() => {
          setOpen(false);
          writeDockOpen(false);
        }}
      />
    </div>
  );
}
