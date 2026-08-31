import { Platform } from 'react-native';

export interface DeviceInfo {
  model: string;
  osVersion: string;
}

// Built entirely from react-native core's own Platform.constants - no new
// native dependency (react-native-device-info / expo-device are not
// installed and adding either would require a native rebuild). Android
// exposes a real manufacturer/model pair and OS version; iOS's Platform
// module has no device-model identifier at all (core RN doesn't expose
// one), so `model` degrades to the interface idiom (e.g. "phone") there -
// a real gap given the constraint, not an oversight.
export function getDeviceInfo(): DeviceInfo {
  if (Platform.OS === 'android') {
    const { Manufacturer, Model, Release } = Platform.constants;
    return {
      model: [Manufacturer, Model].filter(Boolean).join(' ') || 'unknown Android device',
      osVersion: `Android ${Release} (API ${Platform.Version})`,
    };
  }
  if (Platform.OS === 'ios') {
    const { systemName, interfaceIdiom } = Platform.constants;
    return {
      model: interfaceIdiom ?? 'iOS device',
      osVersion: `${systemName ?? 'iOS'} ${Platform.Version}`,
    };
  }
  return { model: 'unknown', osVersion: 'unknown' };
}
