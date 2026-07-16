/**
 * useShakeUndo — "shake the tablet to undo", Colozoo-only.
 *
 * Isolated on purpose: it's a DeviceMotion listener that calls back on a shake
 * and nothing else, so it can't leak into the core drawing engine. iOS 13+
 * gates DeviceMotion behind a permission prompt that MUST be triggered from a
 * user gesture — {@link requestShakePermission} does exactly that and is meant
 * to be called from a tap handler.
 */

import { useEffect, useRef } from 'react';

/** Peak total acceleration (m/s²) that counts as a shake. Resting magnitude is
 *  ~9.8 (gravity); a deliberate shake spikes well past this. */
export const SHAKE_THRESHOLD = 24;
/** Minimum gap between shakes so one wobble doesn't undo a whole page. */
export const SHAKE_COOLDOWN_MS = 1000;

/** Pure shake test — exported for unit testing the threshold/cooldown logic. */
export function isShake(magnitude: number, msSinceLast: number): boolean {
  return magnitude >= SHAKE_THRESHOLD && msSinceLast >= SHAKE_COOLDOWN_MS;
}

type MotionPermissionApi = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/**
 * Ask for DeviceMotion permission if the platform requires it (iOS). No-op and
 * resolves true where no prompt is needed. Call from a user gesture.
 */
export async function requestShakePermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === 'undefined') return false;
  const api = DeviceMotionEvent as unknown as MotionPermissionApi;
  if (typeof api.requestPermission !== 'function') return true; // no prompt needed
  try {
    return (await api.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function useShakeUndo(onShake: () => void, enabled = true): void {
  // Keep the latest callback without re-subscribing the motion listener.
  const cb = useRef(onShake);
  cb.current = onShake;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    let last = 0;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (isShake(magnitude, now - last)) {
        last = now;
        cb.current();
      }
    };
    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [enabled]);
}
