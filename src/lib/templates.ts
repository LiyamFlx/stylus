/**
 * Page templates (Notebook Mode) — pre-designed page backgrounds (planners,
 * trackers, decorative papers) shipped as static assets and referenced BY ID
 * from document data.
 *
 * Three deliberate architecture properties:
 *
 *  1. MANIFEST-DRIVEN, BUNDLED ASSETS. Templates live in
 *     `public/templates/{full,thumb}/*.webp` + `manifest.json`. Adding one is
 *     an asset drop + manifest entry — zero code. Because they're bundled
 *     (not user data), they never enter IndexedDB and are entirely outside
 *     the image-bitmap orphan-cleanup lifecycle: deleting a doc/page needs no
 *     template cleanup.
 *
 *  2. RASTER SOURCE, DECODED ONCE. Unlike the paper guide (vector, must
 *     re-rasterize per size or rules blur — see render.ts's paperCache), a
 *     template is already a bitmap. It's decoded ONCE at native resolution
 *     and drawn through the world transform. Re-rasterizing per zoom bucket
 *     would reintroduce exactly the cache thrash the paper cache work
 *     eliminated, for zero fidelity gain.
 *
 *  3. SYNC READ + ASYNC FILL. renderAll is synchronous; decode is not.
 *     Renderers call `getTemplateBitmap` (sync Map hit or null), fall back to
 *     the plain paper for the frame, and `ensureTemplateBitmap(id, onReady)`
 *     schedules a repaint when the decode lands — the same pattern as the
 *     async page-image loads in Workspace.
 */

export type TemplateCategory =
  | 'paper'
  | 'planner'
  | 'tracker'
  | 'finance'
  | 'list'
  | 'cover';

/** Where a template may be applied. 'cover' entries are doc-cover only and
 *  never offered as page backgrounds (e.g. landscape art). */
export type TemplateUse = 'page' | 'cover' | 'both';

export interface TemplateDef {
  id: string;
  name: string;
  category: TemplateCategory;
  use: TemplateUse;
  orientation: 'portrait' | 'landscape';
  /** Public asset paths (under /templates/). */
  full: string;
  thumb: string;
  /** Normalized asset dimensions (A4 @150dpi: 1240×1754 portrait). */
  width: number;
  height: number;
  /** Original source dimensions before normalization. */
  srcNative: [number, number];
  /** True when the source was below target res (soft at deep zoom). */
  upscaled: boolean;
}

export interface TemplateManifest {
  version: number;
  templates: TemplateDef[];
}

// ─── Manifest registry ───────────────────────────────────────────────────────

let manifestPromise: Promise<TemplateManifest> | null = null;
let byId: Map<string, TemplateDef> | null = null;

export function loadTemplateManifest(): Promise<TemplateManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/templates/manifest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`template manifest: HTTP ${r.status}`);
        return r.json() as Promise<TemplateManifest>;
      })
      .then((m) => {
        byId = new Map(m.templates.map((t) => [t.id, t]));
        return m;
      })
      .catch((err) => {
        manifestPromise = null; // transient failure → allow retry
        throw err;
      });
  }
  return manifestPromise;
}

/** Sync lookup — undefined until the manifest resolves. Render paths treat
 *  "unknown yet" identically to "no template" (plain paper this frame). */
export function getTemplateDef(id: string): TemplateDef | undefined {
  return byId?.get(id);
}

// ─── Decoded bitmap cache ────────────────────────────────────────────────────
//
// LRU keyed by templateId only (see module doc: no size/zoom in the key).
// Cap is small on purpose: a decoded 1240×1754 RGBA bitmap is ~8.7MB, and
// only the on-screen page + rail neighbors are ever warm.

const BITMAP_CACHE_MAX = 6;

const bitmapCache = new Map<string, ImageBitmap>(); // insertion order = LRU
const inflight = new Map<string, Promise<ImageBitmap | null>>();

/** Sync cache read. Refreshes LRU position on hit. */
export function getTemplateBitmap(templateId: string): ImageBitmap | null {
  const hit = bitmapCache.get(templateId);
  if (!hit) return null;
  bitmapCache.delete(templateId);
  bitmapCache.set(templateId, hit);
  return hit;
}

/**
 * Ensure the bitmap is decoded. Resolves null on any failure — the renderer's
 * plain-paper fallback IS the error state; a missing template asset must
 * never block or blank the ink layer. `onReady` fires once per NEW decode so
 * the caller can schedule a repaint; concurrent callers coalesce onto one
 * in-flight decode (only the first caller's onReady fires — by then every
 * subsequent frame reads the cache synchronously anyway).
 */
export function ensureTemplateBitmap(
  templateId: string,
  onReady?: () => void,
): Promise<ImageBitmap | null> {
  const cached = bitmapCache.get(templateId);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(templateId);
  if (pending) return pending;

  // Non-browser / stub environments (jsdom tests): no decode, quiet null.
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') {
    return Promise.resolve(null);
  }

  const p = (async (): Promise<ImageBitmap | null> => {
    try {
      await loadTemplateManifest();
      const def = byId?.get(templateId);
      if (!def) return null;

      const res = await fetch(def.full);
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());

      bitmapCache.set(templateId, bmp);
      while (bitmapCache.size > BITMAP_CACHE_MAX) {
        const oldest = bitmapCache.keys().next().value;
        if (oldest === undefined) break;
        bitmapCache.get(oldest)?.close();
        bitmapCache.delete(oldest);
      }
      onReady?.();
      return bmp;
    } catch {
      return null;
    } finally {
      inflight.delete(templateId);
    }
  })();

  inflight.set(templateId, p);
  return p;
}

/** Eager VRAM release (doc close). Optional — LRU eviction is the norm. */
export function clearTemplateBitmaps(): void {
  for (const bmp of bitmapCache.values()) bmp.close();
  bitmapCache.clear();
}
