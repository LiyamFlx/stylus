// ScanmarkerScanner
// Primary:  WebHID API  (Chrome/Edge desktop)
// Fallback: always-available "Type Text" button → opens TextBox (handled in UI)
// This file handles only the WebHID connection path.

import { isWebHIDSupported } from './bluetooth';
import { toast } from './toast';

type ScanCallback = (text: string) => void;

// Scanmarker HID usage page / usage IDs (keyboard emulation via HID)
const KB_USAGE_PAGE = 0x0001; // Generic Desktop
const KB_USAGE_ID   = 0x0006; // Keyboard

// HID key code → character map (US layout, unshifted + shifted)
const HID_KEYMAP: Record<number, [string, string]> = {
  0x04: ['a', 'A'], 0x05: ['b', 'B'], 0x06: ['c', 'C'], 0x07: ['d', 'D'],
  0x08: ['e', 'E'], 0x09: ['f', 'F'], 0x0a: ['g', 'G'], 0x0b: ['h', 'H'],
  0x0c: ['i', 'I'], 0x0d: ['j', 'J'], 0x0e: ['k', 'K'], 0x0f: ['l', 'L'],
  0x10: ['m', 'M'], 0x11: ['n', 'N'], 0x12: ['o', 'O'], 0x13: ['p', 'P'],
  0x14: ['q', 'Q'], 0x15: ['r', 'R'], 0x16: ['s', 'S'], 0x17: ['t', 'T'],
  0x18: ['u', 'U'], 0x19: ['v', 'V'], 0x1a: ['w', 'W'], 0x1b: ['x', 'X'],
  0x1c: ['y', 'Y'], 0x1d: ['z', 'Z'],
  0x1e: ['1', '!'], 0x1f: ['2', '@'], 0x20: ['3', '#'], 0x21: ['4', '$'],
  0x22: ['5', '%'], 0x23: ['6', '^'], 0x24: ['7', '&'], 0x25: ['8', '*'],
  0x26: ['9', '('], 0x27: ['0', ')'],
  0x28: ['\n', '\n'], // Enter
  0x2c: [' ', ' '],  // Space
  0x2d: ['-', '_'],  0x2e: ['=', '+'],
  0x2f: ['[', '{'],  0x30: [']', '}'], 0x31: ['\\', '|'],
  0x33: [';', ':'],  0x34: ["'", '"'],
  0x36: [',', '<'],  0x37: ['.', '>'], 0x38: ['/', '?'],
};

const SCAN_PAUSE_MS = 800; // silence threshold for keyboard-mode scan completion

export class ScanmarkerScanner {
  private hidDevice: HIDDevice | null = null;
  private scanCallbacks: Set<ScanCallback> = new Set();
  private buffer = '';
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  // Keyboard emulation capture state
  private keyboardInput: HTMLInputElement | null = null;
  private keyboardActive = false;

  isConnected = false;
  connectionMode: 'webhid' | 'keyboard' | 'disconnected' = 'disconnected';
  deviceName: string | null = null;
  battery: number | null = null;

  // ── WebHID connection ──────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (!isWebHIDSupported()) {
      throw new Error('WebHID is not supported in this browser.');
    }

    const devices = await navigator.hid.requestDevice({
      filters: [
        { usagePage: KB_USAGE_PAGE, usage: KB_USAGE_ID },
        // Also match by vendor if known Scanmarker VIDs become available
      ],
    });

    if (devices.length === 0) {
      throw new Error('No device selected.');
    }

    const device = devices[0];
    if (!device.opened) {
      await device.open();
    }

    this.hidDevice = device;
    this.deviceName = device.productName || 'Scanmarker';
    this.isConnected = true;
    this.connectionMode = 'webhid';

    device.addEventListener('inputreport', this.handleHIDReport);
    // Device-disconnect fires on navigator.hid, not the device itself.
    navigator.hid?.addEventListener('disconnect', this.handleDisconnect);

    // Attempt battery read via separate BLE path if available (best-effort)
    this.tryReadBattery();
  }

  disconnect(): void {
    if (this.hidDevice) {
      this.hidDevice.removeEventListener('inputreport', this.handleHIDReport);
      navigator.hid?.removeEventListener('disconnect', this.handleDisconnect);
      this.hidDevice.close().catch(() => {});
      this.hidDevice = null;
    }
    this.stopKeyboardMode();
    this.isConnected = false;
    this.connectionMode = 'disconnected';
    this.deviceName = null;
    this.battery = null;
  }

  onScan(cb: ScanCallback): () => void {
    this.scanCallbacks.add(cb);
    return () => this.scanCallbacks.delete(cb);
  }

  // ── HID report parsing ────────────────────────────────────────────────────

  private handleHIDReport = (event: HIDInputReportEvent): void => {
    const data = event.data;
    if (data.byteLength < 8) return;

    // Standard boot keyboard report: [modifier, reserved, key1..key6]
    const modifier = data.getUint8(0);
    const shift = (modifier & 0x02) !== 0 || (modifier & 0x20) !== 0;

    for (let i = 2; i < Math.min(data.byteLength, 8); i++) {
      const keycode = data.getUint8(i);
      if (keycode === 0) continue;

      const pair = HID_KEYMAP[keycode];
      if (!pair) continue;

      const char = shift ? pair[1] : pair[0];

      if (char === '\n') {
        this.flushBuffer();
      } else {
        this.buffer += char;
        this.schedulePauseFlush();
      }
    }
  };

  private handleDisconnect = (event: HIDConnectionEvent): void => {
    // Ignore unrelated devices disconnecting.
    if (this.hidDevice && event.device !== this.hidDevice) return;
    navigator.hid?.removeEventListener('disconnect', this.handleDisconnect);
    this.isConnected = false;
    this.connectionMode = 'disconnected';
    this.hidDevice = null;
    toast.warning(`${this.deviceName ?? 'Scanmarker'} disconnected`);
  };

  private schedulePauseFlush(): void {
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => this.flushBuffer(), SCAN_PAUSE_MS);
  }

  private flushBuffer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    const text = this.buffer.trim();
    this.buffer = '';
    if (text.length > 0) {
      this.scanCallbacks.forEach((cb) => cb(text));
    }
  }

  // ── Keyboard emulation mode (always available via "Type Text" button) ──────
  // Note: "Type Text" button in toolbar opens TextBox directly.
  // This keyboard capture mode is for Scanmarker units in keyboard-emulation
  // firmware mode — activated by the user toggling "Scan Mode" in the UI.

  startKeyboardMode(): void {
    if (this.keyboardActive) return;
    this.keyboardActive = true;
    this.connectionMode = 'keyboard';
    this.isConnected = true;

    // Hidden input that captures Scanmarker keystrokes
    const input = document.createElement('input');
    input.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
    input.setAttribute('aria-hidden', 'true');
    input.setAttribute('tabindex', '-1');
    document.body.appendChild(input);

    let debounce: ReturnType<typeof setTimeout> | null = null;

    input.addEventListener('input', () => {
      if (debounce !== null) clearTimeout(debounce);
      debounce = setTimeout(() => {
        const text = input.value.trim();
        input.value = '';
        if (text.length > 0) {
          this.scanCallbacks.forEach((cb) => cb(text));
        }
      }, SCAN_PAUSE_MS);
    });

    this.keyboardInput = input;
    input.focus();
  }

  stopKeyboardMode(): void {
    if (!this.keyboardActive) return;
    this.keyboardActive = false;
    this.keyboardInput?.remove();
    this.keyboardInput = null;
    if (this.connectionMode === 'keyboard') {
      this.connectionMode = 'disconnected';
      this.isConnected = false;
    }
  }

  toggleScanMode(): void {
    if (this.keyboardActive) {
      this.stopKeyboardMode();
    } else {
      this.startKeyboardMode();
    }
  }

  // ── Battery (best-effort, WebHID devices don't always expose this) ─────────

  async getBattery(): Promise<number> {
    // WebHID doesn't expose battery_service — this is a stub that returns
    // the cached value if we got it from a BLE pairing, otherwise throws.
    if (this.battery !== null) return this.battery;
    throw new Error('Battery info not available for this connection mode.');
  }

  private tryReadBattery(): void {
    // Best-effort — silently ignore if unavailable
    this.getBattery()
      .then((level) => { this.battery = level; })
      .catch(() => {});
  }
}

export const scanmarkerScanner = new ScanmarkerScanner();
