/**
 * One-line haptic tick for destructive confirms (Phase 2 item 10).
 * `navigator.vibrate` is Android-only (iOS Safari never implements it) — the
 * gate makes it a silent no-op elsewhere. Deliberately not an abstraction.
 */
export function buzz(ms = 10): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms);
  }
}
