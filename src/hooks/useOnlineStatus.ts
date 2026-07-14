import { useEffect, useState } from 'react';

/**
 * Reactive `navigator.onLine` (Mobile UX Phase 3). The app is already
 * offline-first (local storage, no backend — see documents.ts), so this is
 * reassurance UI only: nothing here gates functionality.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
