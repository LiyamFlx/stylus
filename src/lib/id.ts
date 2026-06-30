/**
 * Stable unique id. Uses the platform UUID when available, falling back to a
 * timestamp + random suffix for older / non-secure contexts.
 *
 * Shared by the drawing engine, documents, text items, and music mode so the
 * fallback logic lives in exactly one place.
 */
export function createId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
