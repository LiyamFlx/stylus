import { createContext, useContext } from 'react';
import type { PenSize, ShapeType, Tool } from '../types';
import type { PenType } from './penProfiles';

/**
 * Global, transient editing preferences shared by the toolbar and the drawing
 * engine: the active tool, ink color, pen size, pen type, and shape type.
 * Persisted prefs (Night Mode, stabilizer) stay in App; document-scoped
 * state stays in Workspace. Only the cross-cutting, non-persisted prefs
 * live here.
 */
export interface EditingPrefs {
  tool: Tool;
  color: string;
  size: PenSize;
  penType: PenType;
  shapeType: ShapeType;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setSize: (size: PenSize) => void;
  setPenType: (penType: PenType) => void;
  setShapeType: (shapeType: ShapeType) => void;
}

export const EditingPrefsContext = createContext<EditingPrefs | null>(null);

/** Read the editing prefs. Throws if used outside the provider. */
export function useEditingPrefs(): EditingPrefs {
  const ctx = useContext(EditingPrefsContext);
  if (!ctx) throw new Error('useEditingPrefs must be used within EditingPrefsProvider');
  return ctx;
}
