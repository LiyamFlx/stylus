import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// A tab left open across a deploy never re-checks for a new service worker on
// its own — the default auto-injected registration only checks on load, so an
// already-open session silently keeps running the OLD bundle indefinitely (a
// real deploy shipped with no visible change until the tab was reloaded).
// Poll for an update and, once one is found and activated, reload so an open
// tab converges on the new deploy within a minute instead of never.
const updateSW = registerSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => {
      void registration.update();
    }, 60 * 1000);
  },
  onNeedRefresh() {
    void updateSW(true);
  },
});
