import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SwarmProvider } from './components/swarm/SwarmProvider';
import { ModelSettingsProvider } from './components/settings/ModelSettingsContext';
import { setBrowserProjectKey, setBrowserProjectName } from './lib/nebulaProjectApi';
import {
  getWorkspaceModePreference,
  restorePersistedCloudProjectHint,
} from './lib/nebulaCloud';
import { readActiveGuestProjectId, readGuestIndex } from './lib/nebulaProjectStore';

/**
 * Restore active project before any API calls.
 * - Guest: active id from nebulaProjectStore
 * - Cloud: last cloud name/key hint (session sync confirms after login)
 * nebulaProjectApi also restores its own key/name from localStorage on import.
 */
const mode = getWorkspaceModePreference();
if (mode === 'cloud' || mode === null) {
  restorePersistedCloudProjectHint();
}
const activeGuestId = readActiveGuestProjectId();
const guestRows = readGuestIndex();
if (
  (mode === 'guest' || !mode) &&
  activeGuestId?.trim() &&
  guestRows.some((e) => e.id === activeGuestId)
) {
  setBrowserProjectKey(activeGuestId);
  const row = guestRows.find((e) => e.id === activeGuestId);
  const n = row?.name?.trim();
  if (n) setBrowserProjectName(n);
}

/**
 * Root: Cosmic Night theme comes from `index.css` (semantic tokens).
 * SwarmProvider holds Inspect (Quality) run state and activity for the status strip.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ModelSettingsProvider billingTier="free">
      <SwarmProvider>
        <App />
      </SwarmProvider>
    </ModelSettingsProvider>
  </React.StrictMode>,
);
