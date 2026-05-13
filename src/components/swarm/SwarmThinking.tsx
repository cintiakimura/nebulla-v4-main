'use client';

import { useState } from 'react';
import { useSwarm } from './SwarmProvider';
import { ChevronDown, ChevronUp, Brain } from 'lucide-react';

export function SwarmThinking() {
  const { lastHandoff, activityLog } = useSwarm();
  const [isOpen, setIsOpen] = useState(false);

  if (!lastHandoff) return null;

  return (
    <div className="mt-4 border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted text-sm font-medium"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          Show Swarm Thinking
        </div>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="p-4 text-sm border-t bg-card max-h-96 overflow-auto">
          <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(lastHandoff, null, 2)}
          </pre>

          {activityLog.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium mb-2">Activity Log</h4>
              {activityLog.slice(-10).map((log, i) => (
                <div key={i} className="text-xs py-1 border-l-2 border-muted pl-3">
                  {new Date(log.timestamp).toLocaleTimeString()} — {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
