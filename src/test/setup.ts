// Vitest global setup. Extends `expect` with jest-dom matchers so component
// suites can use toBeInTheDocument(), toBeDisabled(), etc.
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Clerk is opt-in (ADR 002) and no ClerkProvider is mounted in the test tree —
// App.test renders <App/> bare. Vite loads .env.local into import.meta.env for
// Vitest too, so a real VITE_CLERK_PUBLISHABLE_KEY there would flip
// isClerkConfigured true and make useOptionalUser call Clerk's hooks with no
// provider, crashing every test that renders <App/>. Force the key empty for
// the whole suite so the app always boots its local-only, signed-out path (the
// default product experience) regardless of what's in the developer's env.
// This runs before any test file imports lib/clerkConfig, so the module reads
// the stubbed value. Replaces the old `VITE_CLERK_PUBLISHABLE_KEY= vitest`
// invocation dance with a fix that lives in the suite itself.
vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');

// jsdom doesn't implement the canvas 2D context. The drawing code guards a
// null context, so stub getContext to return null silently instead of letting
// jsdom spam "Not implemented" errors during component tests.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  writable: true,
});

// jsdom doesn't implement matchMedia. Components use it to pick a responsive
// variant (e.g. the toolbar's desktop pill vs. mobile tray). Report a match for
// `min-width` queries so tests exercise the desktop layout — the primary
// tablet/desktop canvas UX — with all controls directly visible.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
