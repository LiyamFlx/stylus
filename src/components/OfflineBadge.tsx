import { useEffect, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Persistent "you're offline" reassurance badge — the app already works
 * fully offline (local storage only, no backend), so this never blocks
 * anything; it just tells the user why, if they're wondering. Shows a brief
 * "Back online" confirmation on reconnect, then disappears.
 */
export function OfflineBadge(): React.ReactElement | null {
  const online = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      return;
    }
    if (!wasOffline) return;
    setShowReconnected(true);
    setWasOffline(false);
    const t = setTimeout(() => setShowReconnected(false), 2500);
    return () => clearTimeout(t);
  }, [online, wasOffline]);

  if (online && !showReconnected) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
    >
      <div
        className={[
          'pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-pop backdrop-blur-pill transition-colors',
          online
            ? 'border-green-700 bg-green-900/90 text-green-100'
            : 'border-border-strong bg-bg-muted/90 text-ink-400',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={['h-1.5 w-1.5 rounded-full', online ? 'bg-green-400' : 'bg-ink-400'].join(
            ' ',
          )}
        />
        {online ? 'Back online' : 'Offline — your notes still save locally'}
      </div>
    </div>
  );
}
