import { useState } from 'react';
import { ChevronDown, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

const LOGO_URL =
  'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/remove_the_white_background_and_make_it_completely_transparent._keep_only_the-1pg6kruCIHQfV8QOCTqPuyHhugp3iJ.png';

const models = [
  { id: 'grok-4.1', name: 'Grok 4.1', badge: 'Latest' as string | null },
  { id: 'grok-3', name: 'Grok 3', badge: null },
];

export function TopBar() {
  const [selectedModel, setSelectedModel] = useState('grok-4.1');
  const [isModelOpen, setIsModelOpen] = useState(false);

  return (
    <div className="surface-active tonal-seam-b flex h-12 items-center justify-between px-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src={LOGO_URL}
            alt=""
            width={22}
            height={22}
            className="object-contain opacity-90"
            style={{ width: 22, height: 22, background: 'transparent' }}
          />
          <span className="kyn-logotype text-foreground">kyn</span>
        </div>

        <button
          type="button"
          className="btn-secondary-surface type-title-sm flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground"
        >
          my-awesome-app
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

        <div className="type-label-sm flex items-center gap-1 tracking-wide">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsModelOpen(!isModelOpen)}
            className="btn-secondary-surface type-label-sm flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
            {models.find((m) => m.id === selectedModel)?.name}
            <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isModelOpen && 'rotate-180')} />
          </button>

          {isModelOpen && (
            <div className="elevation-popover absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md p-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(model.id);
                    setIsModelOpen(false);
                  }}
                  className={cn(
                    'btn-secondary-surface type-label-sm flex w-full items-center justify-between rounded px-2.5 py-1.5',
                    selectedModel === model.id && 'active-tab-sheen text-primary',
                  )}
                >
                  <span>{model.name}</span>
                  {model.badge && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] text-primary" style={{ fontWeight: 500 }}>
                      {model.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="surface-float flex h-7 w-7 items-center justify-center rounded-full">
          <span className="text-[10px] tracking-wide text-foreground" style={{ fontWeight: 500 }}>
            JD
          </span>
        </div>
      </div>
    </div>
  );
}
