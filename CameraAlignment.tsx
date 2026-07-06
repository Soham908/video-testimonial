import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  type CameraOutput,
} from 'react-native-vision-camera';
import { useFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector';
import { AlignmentGuideOverlay } from './AlignmentGuideOverlay';
import { computeAlignmentSignals, isFullyAligned, type AlignmentSignals } from './alignment';
import { useAlignmentLock, type AlignmentLockMode } from './useAlignmentLock';

// While aligning, ML Kit runs on every frame the session delivers - a lower
// capture fps directly cuts that inference frequency. A release build
// ruled out debug-mode JS overhead as the dominant cause, confirming this
// is genuine inference cost.
const ALIGNING_FPS_CONSTRAINT = [{ fps: 8 }];

// ML Kit searches across a range of face sizes by default (as small as 15%
// of frame width) - raising this shrinks that search space (ML Kit's own
// documented perf tip). Kept below alignment.ts's 0.35 "too far" threshold
// so a too-distant face still gets a "move closer" message.
const MIN_FACE_SIZE = 0.25;

// Once locked, there's no need for continuous detection - just a periodic
// sanity check that the person hasn't drifted out of frame.
const RECHECK_INTERVAL_MS = 10_000;
const RECHECK_DURATION_MS = 1_000;

interface Props {
  lockMode: AlignmentLockMode;
  // Changing this (e.g. to the current question index) starts a fresh
  // lock cycle - used to re-run the (lighter) recheck for each question.
  resetToken: number | string;
  onLocked: () => void;
}

export function CameraAlignment({ lockMode, resetToken, onLocked }: Props) {
  const { hasPermission: hasCamera, requestPermission: requestCamera } =
    useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } =
    useMicrophonePermission();

  // Front camera — this is a selfie testimonial recording flow.
  const device = useCameraDevice('front');
  const { width, height } = useWindowDimensions();

  // Requesting both permissions in separate, independent effects fires them
  // concurrently on mount - Android can only show one system permission
  // dialog at a time, so the second request (mic) gets dropped/stuck until
  // the app is reloaded and the effects re-run with hasCamera already true.
  // Sequencing them - only request mic once camera has resolved - fixes it.
  useEffect(() => {
    if (!hasCamera) {
      requestCamera();
      return;
    }
    if (!hasMic) {
      requestMic();
    }
  }, [hasCamera, hasMic, requestCamera, requestMic]);

  const { isLocked, goodFrameStreak, requiredFrames, registerFrame, reset } =
    useAlignmentLock(lockMode);

  // Start a fresh lock cycle whenever the mode or reset token changes
  // (e.g. moving to the next question).
  useEffect(() => {
    reset();
  }, [lockMode, resetToken, reset]);

  const [signals, setSignals] = useState<AlignmentSignals | null>(null);
  const frameCount = useRef(0);
  const wasLocked = useRef(false);

  const handleFacesDetected = useCallback(
    (faces: Face[]) => {
      const currentSignals =
        faces.length > 0
          ? computeAlignmentSignals(faces[0].bounds, width, height)
          : null;
      registerFrame(currentSignals != null && isFullyAligned(currentSignals));

      // Detection callbacks can still fire faster than we need to visibly
      // update; throttle the UI-facing state update to ~10/sec.
      frameCount.current += 1;
      if (frameCount.current % 3 === 0) {
        setSignals(currentSignals);
      }
      if (frameCount.current % 15 === 0) {
        console.log('[alignment]', {
          faces: faces.length,
          signals: currentSignals,
          goodFrameStreak,
          requiredFrames,
        });
      }
    },
    [width, height, registerFrame, goodFrameStreak, requiredFrames],
  );

  useEffect(() => {
    if (isLocked && !wasLocked.current) {
      console.log('[alignment] LOCKED — ready to record');
      onLocked();
    }
    wasLocked.current = isLocked;
  }, [isLocked, onLocked]);

  // Detection is continuous until locked, then off except for a brief
  // recheck window every RECHECK_INTERVAL_MS.
  const [detectionEnabled, setDetectionEnabled] = useState(true);
  useEffect(() => {
    if (!isLocked) {
      setDetectionEnabled(true);
      return;
    }

    setDetectionEnabled(false);
    let recheckTimeout: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setDetectionEnabled(true);
      recheckTimeout = setTimeout(
        () => setDetectionEnabled(false),
        RECHECK_DURATION_MS,
      );
    }, RECHECK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (recheckTimeout) clearTimeout(recheckTimeout);
    };
  }, [isLocked]);

  const faceDetectorOutput = useFaceDetectorOutput({
    onFacesDetected: handleFacesDetected,
    onError: (error) => console.error('[face detector]', error),
    // Landmarks/contours aren't used yet - our alignment checks only read
    // `bounds` - and landmark detection is a meaningfully heavier ML Kit
    // model, so leave both off until something actually needs them.
    performanceMode: 'fast',
    minFaceSize: MIN_FACE_SIZE,
    autoMode: true,
    windowWidth: width,
    windowHeight: height,
  });

  // `outputs` must be a stable/memoized array (per VisionCamera's docs) or
  // the session reconfigures on every render.
  const outputs = useMemo<CameraOutput[]>(
    () => (detectionEnabled ? [faceDetectorOutput] : []),
    [detectionEnabled, faceDetectorOutput],
  );
  const constraints = useMemo(
    () => (isLocked ? undefined : ALIGNING_FPS_CONSTRAINT),
    [isLocked],
  );

  if (!hasCamera || !hasMic) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>
          Requesting camera &amp; microphone permission…
        </Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>No camera device found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        constraints={constraints}
        outputs={outputs}
      />
      <AlignmentGuideOverlay
        visible={!isLocked}
        signals={signals}
        goodFrameStreak={goodFrameStreak}
        requiredFrames={requiredFrames}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
