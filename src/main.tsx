import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SwarmProvider } from '@/components/swarm/SwarmProvider';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SwarmProvider>
      <App />
    </SwarmProvider>
  </StrictMode>,
);
