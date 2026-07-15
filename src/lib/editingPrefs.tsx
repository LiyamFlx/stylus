import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { PenSize, ShapeType, Tool } from '../types';
import { PEN_SIZES, PRESET_COLORS } from '../types';
import type { PenType } from './penProfiles';
import { EditingPrefsContext, type EditingPrefs } from './editingPrefsContext';

/** Provides the transient editing prefs (tool / color / size / pen type /
 *  shape type). */
export function EditingPrefsProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [size, setSize] = useState<PenSize>(PEN_SIZES[1]);
  const [penType, setPenType] = useState<PenType>('fountain');
  const [shapeType, setShapeType] = useState<ShapeType>('rect');

  const value = useMemo<EditingPrefs>(
    () => ({
      tool,
      color,
      size,
      penType,
      shapeType,
      setTool,
      setColor,
      setSize,
      setPenType,
      setShapeType,
    }),
    [tool, color, size, penType, shapeType],
  );

  return <EditingPrefsContext.Provider value={value}>{children}</EditingPrefsContext.Provider>;
}
