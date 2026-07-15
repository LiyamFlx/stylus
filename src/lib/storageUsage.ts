/**
 * localStorage usage estimate (Phase 1 item #1 — storage quota warning).
 *
 * `navigator.storage.estimate()` reports origin-wide storage (localStorage +
 * IndexedDB + caches combined, and is unsupported in older Safari), which
 * would conflate the IndexedDB image store with the localStorage quota this
 * warning actually cares about. Measuring the real localStorage byte count
 * directly is simpler and universally supported.
 *
 * There's no API to read a browser's actual localStorage quota — engines
 * differ (mobile Safari has historically been much tighter than desktop
 * Chrome). ASSUMED_QUOTA_BYTES is a conservative floor so the warning fires
 * before the tightest real-world browsers, not the most generous ones.
 */

const ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024; // 5MB — conservative floor
export const STORAGE_WARNING_THRESHOLD = 0.8;

export interface StorageUsage {
  usedBytes: number;
  assumedQuotaBytes: number;
  ratio: number;
}

export function estimateLocalStorageUsage(): StorageUsage {
  let usedBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      // UTF-16 in memory, but browsers persist as UTF-8-ish on disk; length
      // in characters is a fine, cheap proxy — precision to the byte doesn't
      // matter for an 80%-threshold warning.
      usedBytes += key.length + (value?.length ?? 0);
    }
  } catch {
    // Storage disabled (private mode) — report zero rather than throwing;
    // the write-failure toast path already covers that case directly.
  }
  return {
    usedBytes,
    assumedQuotaBytes: ASSUMED_QUOTA_BYTES,
    ratio: usedBytes / ASSUMED_QUOTA_BYTES,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
