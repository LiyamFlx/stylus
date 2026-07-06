import { useEffect } from 'react';

/**
 * Track the REAL visible viewport height into a CSS var (Phase 2 item 4).
 *
 * iOS keyboards overlay the page without shrinking 100vh/100%; layouts sized
 * with viewport units end up half-hidden behind the keyboard. `visualViewport`
 * reports the truth — we mirror it into `--vvh` (a px length) and mobile-mode
 * layouts consume `height: var(--vvh, 100%)`.
 *
 * No-op (and cleans up) when disabled or unsupported.
 */
export function useVisualViewport(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--vvh');
    };
  }, [enabled]);
}
