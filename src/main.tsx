import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { SwarmProvider } from './components/swarm/SwarmProvider';

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
