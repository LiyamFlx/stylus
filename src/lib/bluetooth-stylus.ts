// BluetoothStylus
// Connects via Web Bluetooth to identify pen + monitor battery.
// All drawing is handled by Pointer Events API — unchanged.

import { bluetoothManager, isWebBluetoothSupported } from './bluetooth';
import { toast } from './toast';
import type { PenProfile } from '../types/extensions';

const WACOM_NAMES = ['wacom', 'bamboo', 'intuos', 'cintiq'];
const SAMSUNG_NAMES = ['s pen', 'samsung'];
const APPLE_NAMES = ['apple pencil'];

function identifyPenProfile(deviceName: string): PenProfile {
  const lower = deviceName.toLowerCase();
  if (WACOM_NAMES.some((n) => lower.includes(n))) return 'wacom';
  if (SAMSUNG_NAMES.some((n) => lower.includes(n))) return 'samsung';
  if (APPLE_NAMES.some((n) => lower.includes(n))) return 'apple';
  return 'generic';
}

export class BluetoothStylus {
  private deviceId: string | null = null;
  private cleanupDisconnect: (() => void) | null = null;
  private batteryPollInterval: ReturnType<typeof setInterval> | null = null;

  isConnected = false;
  deviceName: string | null = null;
  battery: number | null = null;
  penProfile: PenProfile = 'generic';

  async connect(): Promise<void> {
    if (!isWebBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    const device = await bluetoothManager.connect('stylus-pen');

    const name = device.name ?? 'Stylus Pen';
    this.deviceId = device.id;
    this.deviceName = name;
    this.penProfile = identifyPenProfile(name);
    this.isConnected = true;

    // Battery poll every 60s
    this.startBatteryPoll();

    // Listen for disconnect
    this.cleanupDisconnect = bluetoothManager.onDisconnect(device.id, () => {
      this.handleDisconnect();
    });
  }

  disconnect(): void {
    if (!this.deviceId) return;
    this.stopBatteryPoll();
    this.cleanupDisconnect?.();
    bluetoothManager.disconnect(this.deviceId);
    this.deviceId = null;
    this.isConnected = false;
    this.deviceName = null;
    this.battery = null;
  }

  async getBattery(): Promise<number> {
    if (!this.deviceId) throw new Error('Not connected.');
    const level = await bluetoothManager.getBattery(this.deviceId);
    this.battery = level;
    return level;
  }

  getDeviceName(): string {
    return this.deviceName ?? 'Unknown Pen';
  }

  private handleDisconnect(): void {
    this.stopBatteryPoll();
    this.cleanupDisconnect = null;
    this.deviceId = null;
    this.isConnected = false;
    toast.warning(`${this.deviceName ?? 'Stylus Pen'} disconnected`);
    this.deviceName = null;
    this.battery = null;
  }

  private startBatteryPoll(): void {
    // Initial read
    this.getBattery().catch(() => {});

    this.batteryPollInterval = setInterval(() => {
      this.getBattery().catch(() => {});
    }, 60_000);
  }

  private stopBatteryPoll(): void {
    if (this.batteryPollInterval !== null) {
      clearInterval(this.batteryPollInterval);
      this.batteryPollInterval = null;
    }
  }
}

export const bluetoothStylus = new BluetoothStylus();
