/** C-major pentatonic across three octaves, low → high. */
const PENTATONIC_SCALE = [
  'C3', 'D3', 'E3', 'G3', 'A3',
  'C4', 'D4', 'E4', 'G4', 'A4',
  'C5', 'D5', 'E5', 'G5', 'A5',
] as const;

/**
 * Maps a shape's center-Y to a pentatonic note. Top of canvas (Y=0) → highest
 * note; bottom (Y=height) → lowest. Clamped; zero/negative height → lowest.
 */
export function pitchForY(centerY: number, canvasHeight: number): string {
  if (canvasHeight <= 0) return PENTATONIC_SCALE[0];
  const normalized = Math.max(0, Math.min(1, centerY / canvasHeight));
  const inverted = 1 - normalized; // top = 1 = highest
  const index = Math.floor(inverted * PENTATONIC_SCALE.length);
  return PENTATONIC_SCALE[Math.min(index, PENTATONIC_SCALE.length - 1)];
}
