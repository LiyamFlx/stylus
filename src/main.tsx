import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { CLERK_PUBLISHABLE_KEY, isClerkConfigured } from './lib/clerkConfig';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

// ClerkProvider wraps App here, not inside App.tsx — auth context sits
// outside the document/canvas state tree entirely (ADR 002). When Clerk
// isn't configured (no publishable key), skip the provider rather than
// crash: sign-in is opt-in, so a build with no Clerk env is just a build
// where every sync hook sees "signed out" and the app runs local-only,
// exactly as it always has.
const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

createRoot(rootEl).render(
  <StrictMode>
    {isClerkConfigured ? (
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!}>{app}</ClerkProvider>
    ) : (
      app
    )}
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
