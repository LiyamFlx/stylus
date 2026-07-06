/**
 * IndexedDB blob store for image underlays (Phase 3 item 5).
 *
 * NOT localStorage on purpose: one pasted photo is 2–6MB base64-encoded,
 * which alone approaches the ~5MB localStorage origin quota shared with every
 * document's ink. IndexedDB stores native Blobs (no encoding overhead,
 * effectively unbounded). Aux JSON keeps only ImageItem METADATA
 * ({ imageId, x, y, w, h }); bytes live here.
 */

const DB_NAME = 'stylus-images';
const STORE = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null; // allow retry
        reject(req.error ?? new Error('IndexedDB open failed'));
      };
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putImage(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getImage(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Best-effort cleanup — orphaned blobs are a quota leak, but a failed
 *  delete must never block document/page deletion. */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openDb();
    await Promise.all(
      ids.map(
        (id) =>
          new Promise<void>((resolve) => {
            const req = tx(db, 'readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve(); // best-effort
          }),
      ),
    );
  } catch {
    // storage unavailable — nothing to clean
  }
}
