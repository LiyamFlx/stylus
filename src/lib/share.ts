/**
 * Native share with graceful fallback (Phase 2 item 7).
 *
 * `navigator.share({ files })` is the phone-native export: the OS share sheet
 * (save to Files/Photos, AirDrop, message it). Not universally supported —
 * callers fall back to the classic download when this returns false.
 *
 * Must run in direct response to a user gesture (iOS enforces gesture-to-share
 * distance): build the file BEFORE any awaits where possible, and call this
 * straight from the tap handler.
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  title = 'Stylus',
): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  const file = new File([blob], filename, { type: blob.type });
  const payload = { files: [file], title };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
    return false;
  }
  try {
    await navigator.share(payload);
    return true;
  } catch (err) {
    // AbortError = the user closed the sheet — that's a completed interaction,
    // not a failure to share; don't dump a download on them.
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}
