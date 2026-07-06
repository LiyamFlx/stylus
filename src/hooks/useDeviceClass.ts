import { useMediaQuery } from './useMediaQuery';
import { PHONE_QUERY, TABLET_QUERY, suggestedMode } from '../lib/deviceClass';
import type { DeviceClass } from '../lib/deviceClass';
import type { AppMode } from '../lib/modes';

export interface UseDeviceClassResult {
  deviceClass: DeviceClass;
  /** Suggested default for the "New document" mode picker. Never forced. */
  suggestedMode: AppMode;
}

/**
 * Reactive device-class detection. Re-evaluates on viewport changes (e.g.
 * window resize across the phone/tablet breakpoint, foldables).
 */
export function useDeviceClass(): UseDeviceClassResult {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const deviceClass: DeviceClass = isPhone ? 'phone' : isTablet ? 'tablet' : 'desktop';
  return { deviceClass, suggestedMode: suggestedMode(deviceClass) };
}
