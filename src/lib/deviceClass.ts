import type { AppMode } from './modes';

/**
 * Device-class detection (Phase 0).
 *
 * Used ONLY to pre-select a suggested mode in the "New document" flow —
 * never to silently force a mode. The user always picks.
 *
 * Kept as pure functions over `matchMedia` so both the hook
 * (`useDeviceClass`) and one-shot call sites (document creation) share one
 * definition. Shared lib, not a Mobile-only component concern.
 */

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

/** Phone: coarse pointer AND narrow viewport. */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 480px)';
/** Tablet: coarse pointer, wider than a phone. */
export const TABLET_QUERY = '(pointer: coarse) and (min-width: 481px)';

export function detectDeviceClass(): DeviceClass {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(PHONE_QUERY).matches) return 'phone';
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
  return 'desktop';
}

/**
 * Suggested default mode per device class — matches the product narrative:
 * phone = quick capture, tablet = classroom, desktop = creative.
 * A suggestion for the creation flow only; the user's explicit pick wins.
 */
export function suggestedMode(deviceClass: DeviceClass = detectDeviceClass()): AppMode {
  switch (deviceClass) {
    case 'phone':
      return 'mobile';
    case 'tablet':
      return 'notebook';
    default:
      return 'canvas';
  }
}
