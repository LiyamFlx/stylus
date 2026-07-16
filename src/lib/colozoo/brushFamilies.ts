import type { ColozooBrush } from '../penProfiles';

/** Four Colozoo product families; each maps to concrete ColozooBrush members. */
export const BRUSH_FAMILIES: {
  id: string;
  label: string;
  badge?: string;
  primary: ColozooBrush;
  members: ColozooBrush[];
}[] = [
  { id: 'magic-pens', label: 'Magic Pens', badge: 'Washes Out', primary: 'czMarker', members: ['czMarker', 'czMagicMarker', 'czGlow'] },
  { id: 'paint-brushes', label: 'Paint Brushes', primary: 'czPaintbrush', members: ['czPaintbrush', 'czDaub'] },
  { id: 'ceramic-markers', label: 'Ceramic Markers', primary: 'czCeramic', members: ['czCeramic', 'czPorcelain'] },
  { id: 'fabric-paint', label: 'Fabric Paint', badge: '3D Puffy Effect', primary: 'czCrayon', members: ['czCrayon', 'czChalk', 'czPencil', 'czColorPencil'] },
];

/** The family id owning a brush; defaults to magic-pens if unlisted. */
export function familyForBrush(b: ColozooBrush): string {
  return BRUSH_FAMILIES.find((f) => f.members.includes(b))?.id ?? 'magic-pens';
}
