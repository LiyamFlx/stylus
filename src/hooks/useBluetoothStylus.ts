import { useCallback, useState } from 'react';
import { bluetoothStylus } from '../lib/bluetooth-stylus';
import { isWebBluetoothSupported } from '../lib/bluetooth';
import { toast } from '../lib/toast';
import type { PenProfile } from '../types/extensions';

export interface UseBluetoothStylusReturn {
  isWebBluetoothAvailable: boolean;
  isConnected: boolean;
  deviceName: string | null;
  battery: number | null;
  penProfile: PenProfile;
  isLowBattery: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useBluetoothStylus(): UseBluetoothStylusReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [penProfile, setPenProfile] = useState<PenProfile>('generic');

  const sync = useCallback(() => {
    setIsConnected(bluetoothStylus.isConnected);
    setDeviceName(bluetoothStylus.deviceName);
    setBattery(bluetoothStylus.battery);
    setPenProfile(bluetoothStylus.penProfile);
  }, []);

  const connect = useCallback(async () => {
    try {
      await bluetoothStylus.connect();
      sync();
      toast.success(
        `Connected to ${bluetoothStylus.deviceName ?? 'Stylus Pen'}`
      );
      if (bluetoothStylus.battery !== null && bluetoothStylus.battery < 20) {
        toast.warning(
          `${bluetoothStylus.deviceName ?? 'Stylus'} battery low: ${bluetoothStylus.battery}%`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      if (
        message.toLowerCase().includes('cancelled') ||
        message.toLowerCase().includes('no device')
      ) {
        return;
      }
      toast.error(`Stylus: ${message}`);
      sync();
    }
  }, [sync]);

  const disconnect = useCallback(() => {
    bluetoothStylus.disconnect();
    sync();
  }, [sync]);

  return {
    isWebBluetoothAvailable: isWebBluetoothSupported(),
    isConnected,
    deviceName,
    battery,
    penProfile,
    isLowBattery: battery !== null && battery < 20,
    connect,
    disconnect,
  };
}
