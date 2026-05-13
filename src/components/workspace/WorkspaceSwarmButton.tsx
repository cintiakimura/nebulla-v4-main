import { Network } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  onOpenProjectSettings: () => void;
};

/**
 * Compact header entry to project settings (Swarm / agents live in Dashboard there).
 */
export function WorkspaceSwarmButton({ onOpenProjectSettings }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onOpenProjectSettings}
      className="inline-flex items-center gap-1.5"
      title="Open project settings (Swarm & models)"
    >
      <Network className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Swarm
    </Button>
  );
}
