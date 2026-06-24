// Shared Bluetooth connection manager
// Handles connect/disconnect/battery for all BLE devices in the app

export type BluetoothProfile = 'scanmarker' | 'stylus-pen';

// Feature detection — checked once at module load
export const isWebBluetoothSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator;

// WebHID feature detection
export const isWebHIDSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'hid' in navigator;

interface ManagedDevice {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  disconnectCallbacks: Set<() => void>;
}

class BluetoothDeviceManager {
  private devices = new Map<string, ManagedDevice>();

  async connect(profile: BluetoothProfile): Promise<BluetoothDevice> {
    if (!isWebBluetoothSupported()) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    const options = this.buildRequestOptions(profile);
    const device = await navigator.bluetooth.requestDevice(options);

    if (!device.gatt) {
      throw new Error('GATT server not available on this device.');
    }

    const server = await device.gatt.connect();

    const managed: ManagedDevice = {
      device,
      server,
      disconnectCallbacks: new Set(),
    };

    device.addEventListener('gattserverdisconnected', () => {
      managed.disconnectCallbacks.forEach((cb) => cb());
      this.devices.delete(device.id);
    });

    this.devices.set(device.id, managed);
    return device;
  }

  disconnect(deviceId: string): void {
    const managed = this.devices.get(deviceId);
    if (!managed) return;
    if (managed.server.connected) {
      managed.device.gatt?.disconnect();
    }
    this.devices.delete(deviceId);
  }

  isConnected(deviceId: string): boolean {
    const managed = this.devices.get(deviceId);
    return managed?.server.connected ?? false;
  }

  async getBattery(deviceId: string): Promise<number> {
    const managed = this.devices.get(deviceId);
    if (!managed) throw new Error('Device not connected.');

    const service = await managed.server.getPrimaryService('battery_service');
    const characteristic = await service.getCharacteristic('battery_level');
    const value = await characteristic.readValue();
    return value.getUint8(0);
  }

  onDisconnect(deviceId: string, callback: () => void): () => void {
    const managed = this.devices.get(deviceId);
    if (!managed) return () => {};
    managed.disconnectCallbacks.add(callback);
    return () => managed.disconnectCallbacks.delete(callback);
  }

  private buildRequestOptions(
    profile: BluetoothProfile
  ): RequestDeviceOptions {
    if (profile === 'scanmarker') {
      return {
        filters: [
          { namePrefix: 'ScanMarker' },
          { namePrefix: 'Scanmarker' },
          { namePrefix: 'SM-' },
        ],
        optionalServices: ['battery_service', 'device_information'],
      };
    }

    // stylus-pen — generic HID-class BLE pen
    return {
      filters: [{ services: ['human_interface_device'] }],
      optionalServices: ['battery_service', 'device_information'],
    };
  }
}

export const bluetoothManager = new BluetoothDeviceManager();
