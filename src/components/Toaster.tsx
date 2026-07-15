import { useEffect, useState } from 'react';
import { toast as toastManager, type Toast } from '../lib/toast';

const ICONS: Record<Toast['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const COLORS: Record<Toast['type'], string> = {
  success: 'bg-green-900/90 border-green-700 text-green-100',
  error: 'bg-red-900/90 border-red-700 text-red-100',
  info: 'bg-zinc-800/90 border-zinc-600 text-zinc-100',
  warning: 'bg-amber-900/90 border-amber-700 text-amber-100',
};

export function Toaster(): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => toastManager.subscribe(setToasts), []);

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            flex items-start gap-2 px-4 py-2.5 rounded-lg border text-sm
            shadow-lg backdrop-blur-sm pointer-events-auto
            animate-in fade-in slide-in-from-bottom-2 duration-200
            ${COLORS[t.type]}
          `}
        >
          <span className="font-bold shrink-0">{ICONS[t.type]}</span>
          {/* Was max-w-xs + truncate, which silently clipped anything longer
              than a short one-liner (every prior call site happened to fit —
              the storage-quota warning doesn't). Wrap instead of truncating
              so a longer, actionable message is never silently cut off. */}
          <span className="max-w-sm">{t.message}</span>
          <button
            onClick={() => toastManager.dismiss(t.id)}
            className="ml-2 shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
