/**
 * Copy text to the clipboard with a fallback for browsers / contexts where the
 * async Clipboard API is unavailable or rejects (Safari focus rules, non-secure
 * contexts, gesture expiry after an await). Returns true on success.
 */
export async function copyText(text: string): Promise<boolean> {
  // Preferred path: the async Clipboard API (Chrome, modern Safari/Firefox).
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  // Legacy fallback: a hidden textarea + execCommand('copy'). Works when the
  // async API is blocked but a (possibly stale) gesture is still active.
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
