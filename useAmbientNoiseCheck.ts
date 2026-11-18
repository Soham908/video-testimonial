import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import {
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio';
import { AmbientNoiseSampler, type NoiseCheckState } from './ambientNoise';
export type { NoiseCheckStatus, NoiseCheckState } from './ambientNoise';

export function useAmbientNoiseCheck(active: boolean) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
  });
  const [state, setState] = useState<NoiseCheckState>({ status: 'checking', sustainedNoisy: false });
  const [attempt, setAttempt] = useState(0);
  const sampler = useMemo(() => new AmbientNoiseSampler(recorder, {
    requestPermission: requestRecordingPermissionsAsync,
    configure: async () => {
      if (Platform.OS === 'ios') {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    },
    deleteFile: (uri) => {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
    onState: setState,
  }), [recorder]);

  useEffect(() => {
    if (active) sampler.start().catch((error) => console.warn('[ambient-noise] startup cleanup failed', error));
    const interval = active ? setInterval(() => sampler.sample(), 200) : undefined;
    return () => {
      clearInterval(interval);
      sampler.stop().catch((error) => console.warn('[ambient-noise] stop failed', error));
    };
  }, [active, attempt, sampler]);

  const stop = useCallback(() => sampler.stop(), [sampler]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, stop, retry };
}
