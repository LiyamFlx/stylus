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
