import { useEffect, useState } from 'react';
import { IdeGrokActivityPanel } from '@/components/ide/IdeGrokActivityPanel';
import {
  getPublishedGrokActivity,
  grokActivityStripVisible,
  subscribeGrokActivity,
  type GrokActivityBroadcast,
} from '../../../lib/nebulaGrokActivityBus';

/**
 * Persistent coding/Go status under the header — visible on Build, Code, and Plan.
 * Chat's activity panel is Build-only; switching tabs used to look like the job died.
 */
export function ShellGrokActivityStrip() {
  const [snap, setSnap] = useState<GrokActivityBroadcast | null>(getPublishedGrokActivity);

  useEffect(() => subscribeGrokActivity(setSnap), []);

  if (!grokActivityStripVisible(snap) || !snap) return null;

  return (
    <div className="shrink-0 border-b border-border bg-background/90" data-testid="shell-grok-activity">
      <IdeGrokActivityPanel activity={snap.activity} v0Live={Boolean(snap.v0Live)} />
    </div>
  );
}
