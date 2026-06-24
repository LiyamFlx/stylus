import { useCallback, useEffect, useRef, useState } from 'react';
import { scanmarkerScanner } from '../lib/scanmarker-scanner';
import { isWebHIDSupported } from '../lib/bluetooth';
import { toast } from '../lib/toast';
import type { ScanmarkerConnectionMode } from '../types/extensions';

export interface UseScanmarkerScannerReturn {
  /** Whether WebHID is available in this browser */
  isWebHIDAvailable: boolean;
  isConnected: boolean;
  connectionMode: ScanmarkerConnectionMode;
  deviceName: string | null;
  battery: number | null;
  isScanning: boolean;
  lastScan: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleScanMode: () => void;
}

export function useScanmarkerScanner(
  onScan: (text: string) => void
): UseScanmarkerScannerReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMode, setConnectionMode] =
    useState<ScanmarkerConnectionMode>('disconnected');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const sync = useCallback(() => {
    setIsConnected(scanmarkerScanner.isConnected);
    setConnectionMode(scanmarkerScanner.connectionMode);
    setDeviceName(scanmarkerScanner.deviceName);
    setBattery(scanmarkerScanner.battery);
  }, []);

  useEffect(() => {
    const unsub = scanmarkerScanner.onScan((text) => {
      setLastScan(text);
      setIsScanning(false);
      sync();

      const preview = text.length > 30 ? `${text.slice(0, 30)}…` : text;
      toast.success(`Scanned: ${preview}`);

      onScanRef.current(text);
    });

    return unsub;
  }, [sync]);

  const connect = useCallback(async () => {
    try {
      setIsScanning(false);
      await scanmarkerScanner.connect();
      sync();
      toast.success(`Connected to ${scanmarkerScanner.deviceName ?? 'Scanmarker'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      // User cancelled the picker — don't toast an error
      if (message.toLowerCase().includes('cancelled') || message.toLowerCase().includes('no device')) {
        return;
      }
      toast.error(`Scanmarker: ${message}`);
      sync();
    }
  }, [sync]);

  const disconnect = useCallback(() => {
    scanmarkerScanner.disconnect();
    sync();
  }, [sync]);

  const toggleScanMode = useCallback(() => {
    scanmarkerScanner.toggleScanMode();
    sync();
  }, [sync]);

  return {
    isWebHIDAvailable: isWebHIDSupported(),
    isConnected,
    connectionMode,
    deviceName,
    battery,
    isScanning,
    lastScan,
    connect,
    disconnect,
    toggleScanMode,
  };
}
