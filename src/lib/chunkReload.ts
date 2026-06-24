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

/** True if an error looks like a missing-chunk failure from a new deploy. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|expected a javascript/i.test(
    msg,
  );
}

function getFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    return false;
  }
}

function setFlag(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
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
 * pick up the latest deploy. A session flag prevents a reload loop if the chunk
 * is genuinely broken rather than just stale.
 */
export async function importChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    const mod = await load();
    clearFlag(); // a successful load means we're on a consistent deploy
    return mod;
  } catch (err) {
    if (isChunkLoadError(err) && !getFlag()) {
      setFlag();
      window.location.reload();
      // The reload tears down the page; never resolve so callers don't proceed.
      return new Promise<T>(() => {});
    }
    throw err;
  }
}
