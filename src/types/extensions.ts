// ─── Existing types (preserve everything already in src/types.ts) ────────────
// Add these to your existing types.ts / drawing.ts — do not replace the file.

// ─── Text Tool ───────────────────────────────────────────────────────────────

export type FontFamily = 'inter' | 'mono' | 'serif';

export interface TextStyles {
  fontSize: 12 | 16 | 24 | 36 | 48;
  bold: boolean;
  color: string;
  fontFamily: FontFamily;
}

export const DEFAULT_TEXT_STYLES: TextStyles = {
  fontSize: 16,
  bold: false,
  color: '#fafafa',
  fontFamily: 'inter',
};

export const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  inter: 'Inter Variable, Inter, sans-serif',
  mono: 'JetBrains Mono Variable, JetBrains Mono, monospace',
  serif: 'Georgia, Times New Roman, serif',
};

// TextStroke — stored in stroke array, rendered on each paint pass (not flattened)
export interface TextStroke {
  type: 'text';
  id: string;
  x: number;
  y: number;
  content: string;
  styles: TextStyles;
  timestamp: number;
}

// ─── Extend your existing Stroke union ───────────────────────────────────────
// In your types.ts, change:
//   export type Stroke = InkStroke            (or whatever your existing type is)
// To:
//   export type Stroke = InkStroke | TextStroke
//
// If your existing type is just called "Stroke" with InkPoint[], rename the ink
// variant to InkStroke and re-export Stroke as the union.
//
// Minimal addition if your existing Stroke is already defined:

// export type AnyStroke = Stroke | TextStroke;  // use AnyStroke in history/canvas

// ─── Scanmarker ──────────────────────────────────────────────────────────────

export type ScanmarkerConnectionMode = 'webhid' | 'keyboard' | 'disconnected';

export interface ScanmarkerState {
  isConnected: boolean;
  connectionMode: ScanmarkerConnectionMode;
  deviceName: string | null;
  battery: number | null;
  isScanning: boolean;
}

// ─── Bluetooth Stylus ────────────────────────────────────────────────────────

export type PenProfile = 'wacom' | 'samsung' | 'apple' | 'generic';

export interface BluetoothStylusState {
  isConnected: boolean;
  deviceName: string | null;
  battery: number | null;
  penProfile: PenProfile;
}
