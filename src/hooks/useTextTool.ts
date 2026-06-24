import { useCallback, useEffect, useState } from 'react';
import type { TextStyles } from '../types/extensions';
import { DEFAULT_TEXT_STYLES } from '../types/extensions';

export interface PendingTextPosition {
  x: number;
  y: number;
}

export interface UseTextToolReturn {
  isActive: boolean;
  pendingPosition: PendingTextPosition | null;
  styles: TextStyles;
  activate: () => void;
  deactivate: () => void;
  setPosition: (pos: PendingTextPosition) => void;
  commitText: (text: string, styles: TextStyles) => void;
  updateStyles: (patch: Partial<TextStyles>) => void;
}

export function useTextTool(
  onCommit: (
    text: string,
    position: PendingTextPosition,
    styles: TextStyles
  ) => void
): UseTextToolReturn {
  const [isActive, setIsActive] = useState(false);
  const [pendingPosition, setPendingPosition] =
    useState<PendingTextPosition | null>(null);
  const [styles, setStyles] = useState<TextStyles>(DEFAULT_TEXT_STYLES);

  const activate = useCallback(() => {
    setIsActive(true);
    setPendingPosition(null);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setPendingPosition(null);
  }, []);

  const setPosition = useCallback((pos: PendingTextPosition) => {
    setPendingPosition(pos);
  }, []);

  const commitText = useCallback(
    (text: string, committedStyles: TextStyles) => {
      if (!pendingPosition) return;
      onCommit(text, pendingPosition, committedStyles);
      setPendingPosition(null);
      setIsActive(false);
    },
    [pendingPosition, onCommit]
  );

  const updateStyles = useCallback((patch: Partial<TextStyles>) => {
    setStyles((prev) => ({ ...prev, ...patch }));
  }, []);

  // Escape deactivates text tool
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        deactivate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, deactivate]);

  return {
    isActive,
    pendingPosition,
    styles,
    activate,
    deactivate,
    setPosition,
    commitText,
    updateStyles,
  };
}
