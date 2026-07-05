// Vitest global setup. Extends `expect` with jest-dom matchers so component
// suites can use toBeInTheDocument(), toBeDisabled(), etc.
import '@testing-library/jest-dom/vitest';

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
