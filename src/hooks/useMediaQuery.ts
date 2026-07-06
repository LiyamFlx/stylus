import { useEffect, useState } from 'react';

/**
 * Reactive `matchMedia` subscription. SSR-safe (defaults to false when
 * `window` is unavailable). Listed as a Phase 2 prerequisite — Toolbar
 * position/variant branching and orientation enforcement both consume it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync in case query changed between render and effect
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
