import { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

/** Chromium's install-prompt event (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const DISMISSED_KEY = 'stylus.installPrompt.dismissed';

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * PWA install banner (Phase 2 item 11) — rendered only for mobile-mode docs,
 * where "install as app" matches intent. Two platform paths:
 * - Chromium: capture `beforeinstallprompt`, offer a real Install button.
 * - iOS Safari: the event never fires — show Share → Add to Home Screen
 *   instructions instead (explicit platform decision, not a bug).
 * Dismissal persists; already-installed (standalone) never shows.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1',
  );
  const [ios] = useState(() => isIOS() && !isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || isStandalone() || (!deferred && !ios)) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      className="pointer-events-auto fixed inset-x-3 z-40 mx-auto flex max-w-sm items-center gap-3 rounded-panel border border-border bg-bg-muted/95 p-3 shadow-pop backdrop-blur-pill"
      // Sit above the bottom toolbar (mobile) so it never covers the mode tabs
      // at the top; safe-area-aware so it clears the home indicator.
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)' }}
    >
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-ink-700">
        {deferred ? (
          <>Install Stylus for quicker capture — works offline.</>
        ) : (
          <>
            Add Stylus to your Home Screen: tap <span className="font-semibold">Share</span> then{' '}
            <span className="font-semibold">Add to Home Screen</span>.
          </>
        )}
      </div>
      {deferred && (
        <button
          type="button"
          onClick={() => {
            void deferred.prompt();
            dismiss();
          }}
          className="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Install
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss install prompt"
        onClick={dismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.06] hover:text-ink-900"
      >
        <CloseIcon size={15} />
      </button>
    </div>
  );
}
