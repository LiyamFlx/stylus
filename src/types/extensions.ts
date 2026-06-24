// Types for the optional hardware input methods (Scanmarker scanner over
// WebHID, and a Bluetooth stylus over Web Bluetooth). Kept separate from the
// core canvas types since they're feature-gated on browser support.

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
