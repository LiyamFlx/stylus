import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level crash guard. If rendering, OCR, or export throws, we show a calm
 * fallback instead of a white screen — and reassure the user their drawing is
 * safe, since strokes are auto-saved to localStorage on every commit.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[stylus] unhandled error', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <h1 className="text-lg font-semibold text-ink-900">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-ink-400">
          Your drawing is saved automatically — reloading should bring it back.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
        >
          Reload
        </button>
      </div>
    );
  }
}
