/**
 * Recovery for stale-deploy dynamic-import failures.
 *
 * Vite splits `recognition` and `export` into hashed chunks loaded on demand.
 * After a new deploy the old hashed files are gone, so a page still running the
 * previous `index.html` requests a chunk that 404s — surfacing as
 * "Failed to fetch dynamically imported module". The fix is to reload once so
 * the browser fetches the fresh `index.html` (and the new chunk names).
 */

const RELOAD_FLAG = 'stylus.chunk-reloaded';
/** Suppress a second reload only within this window — long enough to cover a
 *  real reload + re-render, short enough that a stale flag from a crashed tab
 *  doesn't block retries indefinitely. */
const RELOAD_COOLDOWN_MS = 15_000;

/** True if an error looks like a missing-chunk failure from a new deploy. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|expected a javascript/i.test(
    msg,
  );
}

function recentlyReloaded(): boolean {
  try {
    const ts = sessionStorage.getItem(RELOAD_FLAG);
    if (!ts) return false;
    return Date.now() - Number(ts) < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode) — reload guard is best-effort.
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // ignore
  }
}

/**
 * Run a dynamic `import()`; on a stale-chunk failure, reload the page once to
 * pick up the latest deploy. A time-boxed session flag prevents a reload loop
 * if the chunk is genuinely broken rather than just stale — after the cooldown
 * expires, a fresh failure gets one more reload attempt rather than being
 * permanently stuck throwing for the rest of the tab's session.
 */
export async function importChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    const mod = await load();
    clearFlag(); // a successful load means we're on a consistent deploy
    return mod;
  } catch (err) {
    if (isChunkLoadError(err) && !recentlyReloaded()) {
      markReloaded();
      window.location.reload();
      // The reload tears down the page; never resolve so callers don't proceed.
      return new Promise<T>(() => {});
    }
    throw err;
  }
}
