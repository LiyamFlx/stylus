import { memo, useEffect, useState } from 'react';
import type { ImageItem } from '../types';
import type { ViewTransform } from '../lib/geometry';
import { getImage } from '../lib/imageStore';

interface ImageLayerProps {
  items: ImageItem[];
  view: ViewTransform;
  onRemove: (id: string) => void;
}

/**
 * Reference-image underlay (Phase 3 item 5). Sits BENEATH the ink canvases,
 * mirrors TextLayer's world-space CSS transform. Non-selectable and
 * non-exporting by design — trace over it, then delete it. The only
 * interaction is the per-image remove button.
 *
 * Bitmaps resolve async from IndexedDB into object URLs (revoked on unmount).
 */
const ImageView = memo(function ImageView({
  item,
  onRemove,
}: {
  item: ImageItem;
  onRemove: (id: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let alive = true;
    void getImage(item.imageId).then((blob) => {
      if (!alive || !blob) return;
      revoked = URL.createObjectURL(blob);
      setUrl(revoked);
    });
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [item.imageId]);

  if (!url) return null;

  return (
    <div
      className="group absolute"
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
    >
      <img
        src={url}
        alt=""
        aria-hidden
        draggable={false}
        className="h-full w-full select-none object-contain opacity-60"
      />
      <button
        type="button"
        aria-label="Remove reference image"
        onClick={() => onRemove(item.id)}
        className="pointer-events-auto absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-muted text-[11px] text-ink-400 shadow-pop hover:text-danger group-hover:flex"
      >
        ✕
      </button>
    </div>
  );
});

export function ImageLayer({ items, view, onRemove }: ImageLayerProps) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          transformOrigin: '0 0',
          transform: `scale(${view.scale}) translate(${-view.panX}px, ${-view.panY}px)`,
        }}
      >
        {items.map((item) => (
          <ImageView key={item.id} item={item} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}
