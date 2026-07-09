import { useMemo } from 'react';
import type { TextItem } from '../types';
import { computeTextStats } from '../lib/textStats';

interface TextStatsBadgeProps {
  texts: TextItem[];
}

/** Live word/character/reading-time counters (Quick Note Phase 3), shown in
 *  text mode once there's content to count. Mirrors the zoom controls'
 *  bottom-corner pill placement, opposite side. */
export function TextStatsBadge({ texts }: TextStatsBadgeProps) {
  const stats = useMemo(() => computeTextStats(texts), [texts]);
  if (stats.words === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-full border border-border bg-bg-muted/80 px-3 py-1.5 text-xs text-ink-400 shadow-pop backdrop-blur-pill sm:flex">
      <span>{stats.words} words</span>
      <span aria-hidden>·</span>
      <span>{stats.characters} chars</span>
      <span aria-hidden>·</span>
      <span>{stats.readingMinutes} min read</span>
    </div>
  );
}
