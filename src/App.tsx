import { useState } from 'react';

function App() {
  const [agentsEnabled, setAgentsEnabled] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Far Left Narrow Rail */}
      <div className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-6">
        {/* Logo */}
        <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white font-bold">N</div>

        {/* Navigation Icons */}
        <div className="flex flex-col gap-6 text-muted-foreground">
          <div className="cursor-pointer hover:text-foreground">📁</div>   {/* Explorer */}
          <div className="cursor-pointer hover:text-foreground">📋</div>   {/* Master Plan */}
          <div className="cursor-pointer hover:text-foreground">🔀</div>   {/* Source Control */}
          <div className="cursor-pointer hover:text-foreground">⚙️</div>   {/* Settings */}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-12 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium">my-awesome-app</span>
            <span className="text-xs text-muted-foreground">main</span>
          </div>

          <div className="flex items-center gap-2">
            <button>Run</button>
            <button>Stop</button>
            <button>Debug</button>
          </div>

          <div className="flex items-center gap-4">
            <select className="bg-transparent border border-border rounded px-2 py-1 text-sm">
              <option>Grok 4.1</option>
              <option>Grok 3</option>
            </select>

            <label className="flex items-center gap-2 text-sm">
              <input 
                type="checkbox" 
                checked={agentsEnabled} 
                onChange={(e) => setAgentsEnabled(e.target.checked)}
              />
              Enable Agents
            </label>

            <div className="w-8 h-8 bg-muted rounded-full"></div>
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 p-4 overflow-auto">
            {/* Your existing content / editor goes here */}
          </div>

          {/* Right Sidebar - Chat */}
          <div className="w-96 border-l border-border bg-card flex flex-col">
            <div className="p-3 border-b border-border font-medium">Chat with Grok</div>
            
            <div className="flex-1 p-4 overflow-auto">
              {/* Chat messages */}
            </div>

            {/* Chat Input */}
            <div className="p-3 border-t border-border">
              <div className="flex gap-2">
                <button>📎</button>
                <button>🎤</button>
                <input 
                  type="text" 
                  className="flex-1 bg-muted border border-border rounded-lg px-4 py-2" 
                  placeholder="Message Nebulla Partner..."
                />
                <button>Send</button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Terminal */}
        <div className="h-64 border-t border-border bg-black text-green-400 font-mono text-sm p-3 overflow-auto">
          Terminal output here...
        </div>
      </div>
    </div>
  );
}

export default App;