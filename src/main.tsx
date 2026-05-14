import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SwarmProvider } from './components/swarm/SwarmProvider';
import { setBrowserProjectKey, setBrowserProjectName } from './lib/nebulaProjectApi';
import { readActiveGuestProjectId, readGuestIndex } from './lib/nebulaProjectStore';

/** Guest “create project” persists active id in localStorage; in-memory `projectKey` resets on reload — restore before any API calls. */
const activeGuestId = readActiveGuestProjectId();
const guestRows = readGuestIndex();
if (activeGuestId?.trim() && guestRows.some((e) => e.id === activeGuestId)) {
  setBrowserProjectKey(activeGuestId);
  const row = guestRows.find((e) => e.id === activeGuestId);
  const n = row?.name?.trim();
  if (n) setBrowserProjectName(n);
}

/**
 * Root: Cosmic Night theme comes from `index.css` (semantic tokens).
 * SwarmProvider wraps the tree so status + chat can coordinate agent runs.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SwarmProvider>
      <App />
    </SwarmProvider>
  </React.StrictMode>,
);
