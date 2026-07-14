import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';

export type NoiseCheckStatus = 'checking' | 'good' | 'noisy';

export interface NoiseCheckState {
  status: NoiseCheckStatus;
  // True once `status` has been 'noisy' continuously for SUSTAINED_NOISY_MS -
  // i.e. eligible for a "continue anyway" override. A single brief spike
  // (a cough, a door) flips `status` to 'noisy' immediately but won't set
  // this until it's held for a couple of seconds.
  sustainedNoisy: boolean;
}

// Metering reads in dBFS (0 = loudest, more negative = quieter/silence).
// Starting point only, same as alignment.ts's thresholds - expect to tune
// against real device/room conditions.
const NOISY_THRESHOLD_DB = -25;
// Per CLAUDE.md: "mic amplitude sampling before recording starts" - first
// second is a warm-up read before committing to any verdict.
const WARM_UP_MS = 1_000;
const SUSTAINED_NOISY_MS = 2_000;
const POLL_INTERVAL_MS = 200;

// Samples mic amplitude while `active` is true (meant to track the same
// window face-detection runs in - see CameraAlignment's `alignmentActive`)
// and classifies it against a fixed threshold. Never saves or reads back
// the resulting audio - only the live metering level. Resets to 'checking'
// each time `active` transitions from false back to true (a fresh question's
// alignment window), so it re-samples rather than reusing a stale verdict.
export function useAmbientNoiseCheck(active: boolean): NoiseCheckState {
  const recorder = useAudioRecorder({
    ...RecordingPresets.LOW_QUALITY,
    isMeteringEnabled: true,
  });

  const [state, setState] = useState<NoiseCheckState>({
    status: 'checking',
    sustainedNoisy: false,
  });
  const startedAtRef = useRef(0);
  const noisySinceRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);
  // Tracks the current in-flight prepareToRecordAsync()/record() chain, if
  // any. Calling stop() while that's still settling (most likely on the
  // very first question ever, before the mic hardware has warmed up, since
  // that first prepareToRecordAsync() call is genuinely slower) can leave
  // its underlying native promise dangling forever - it doesn't throw
  // immediately, it only surfaces later as an uncaught "JPromise was
  // destroyed" error when the JVM garbage-collects the abandoned promise.
  // Stopping must always wait for this to settle first.
  const startupRef = useRef<Promise<void> | null>(null);

  // The underlying native call ("The 1st argument cannot be cast to type
  // class ...AudioRecorder... Cannot use shared object that was already
  // released") fails at the JSI/JNI argument-marshaling layer, BEFORE the
  // native method body (which has its own internal try/catch) is ever
  // reached - confirmed by reading expo-audio's own Kotlin source, whose
  // stop() already wraps its real work in try/catch. That means the throw
  // can happen SYNCHRONOUSLY at the call site, not just as a promise
  // rejection - `.catch()` alone doesn't protect against it, since a
  // synchronous throw happens before a promise is even returned to attach
  // `.catch()` to. useAudioRecorder's object is released automatically on
  // unmount (its own documented behavior), and there's no ordering
  // guarantee that beats every in-flight call from here, especially the
  // specific case of CameraAlignment unmounting for good at the very end
  // of the question flow. Every real interaction with `recorder` below
  // goes through this or an equivalent inline try/catch - not just `.catch`.
  const safeStop = useCallback(() => {
    try {
      if (recorder.isRecording) {
        recorder.stop().catch((error) => console.warn('[ambient-noise] stop failed', error));
      }
    } catch (error) {
      console.warn('[ambient-noise] stop failed synchronously', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) {
      wasActiveRef.current = false;
      // If a startup chain is still in flight, wait for it to settle
      // before stopping - see startupRef's declaration for why.
      if (startupRef.current) {
        startupRef.current.catch(() => {}).then(safeStop);
      } else {
        safeStop();
      }
      return;
    }

    if (!wasActiveRef.current) {
      startedAtRef.current = Date.now();
      noisySinceRef.current = null;
      setState({ status: 'checking', sustainedNoisy: false });
    }
    wasActiveRef.current = true;

    let cancelled = false;
    const startup = (async () => {
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted || cancelled) return;
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
      } catch (error) {
        // This is a background convenience check, not something that
        // should ever crash the app - e.g. `active` can flip false again
        // (alignment already locked, moving on) while this chain is still
        // in flight, which can throw if the underlying native recorder
        // was released out from under it. Log and move on; `status` just
        // stays wherever it was.
        console.warn('[ambient-noise] failed to start sampling', error);
      }
    })();
    startupRef.current = startup;
    startup.finally(() => {
      if (startupRef.current === startup) startupRef.current = null;
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Live metering has to be actively polled - confirmed by reading
  // expo-audio's own native Android source: it only ever emits a
  // "recordingStatusUpdate" event on stop/error/info, never continuously
  // while actively recording. There's no native push stream for metering
  // to listen for; `getStatus()` has to be called repeatedly to sample it,
  // same as the library's own (separate, unguarded) useAudioRecorderState
  // hook does internally - reimplemented here, gated on `active` so it
  // only ever runs during the window we actually care about, and wrapped
  // in try/catch for the same released-object risk as everything else.
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      let metering: number | undefined;
      try {
        metering = recorder.getStatus().metering;
      } catch (error) {
        console.warn('[ambient-noise] getStatus failed', error);
        return;
      }
      if (metering == null) return;

      const now = Date.now();
      if (now - startedAtRef.current < WARM_UP_MS) return;

      const isNoisy = metering > NOISY_THRESHOLD_DB;
      if (isNoisy) {
        if (noisySinceRef.current == null) noisySinceRef.current = now;
      } else {
        noisySinceRef.current = null;
      }
      const sustainedNoisy =
        noisySinceRef.current != null && now - noisySinceRef.current >= SUSTAINED_NOISY_MS;

      setState({ status: isNoisy ? 'noisy' : 'good', sustainedNoisy });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Stop the recorder if the component unmounts mid-check - same
  // wait-for-startup-to-settle rule as above applies here too.
  useEffect(() => {
    return () => {
      if (startupRef.current) {
        startupRef.current.catch(() => {}).then(safeStop);
      } else {
        safeStop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
