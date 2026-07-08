import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type CameraOutput,
  type Recorder,
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
// sanity check that the person hasn't drifted out of frame. Suspended
// entirely while actually recording (see `recordingActive`) - toggling
// outputs mid-capture risks destabilizing the video pipeline, and running
// continuous detection during recording would reintroduce the lag this was
// built to avoid. CLAUDE.md's "flag mid-answer alignment breaks" is
// deferred as a result - not implemented for real yet.
const RECHECK_INTERVAL_MS = 10_000;
const RECHECK_DURATION_MS = 1_000;

// --- Diagnostic-only: dual-consumer-session hypothesis test -----------
// Flip to true to remove the video-recording output from the session
// entirely (detection-only, recording will not work). Compare the
// on-screen measured fps with this true vs false to see whether the
// camera pipeline is straining under two simultaneous consumer streams
// (recording + analysis) vs. ML Kit inference cost alone. Not meant to
// ship - experiment/face-detection-diagnostics branch only.
const DIAGNOSTIC_DISABLE_VIDEO_OUTPUT = false;
const FPS_WINDOW_MS = 5_000;

export interface CameraAlignmentHandle {
  startRecording: () => Promise<void>;
  // Finalizes the current recording to a file; triggers onRecordingFinished.
  stopRecording: () => Promise<void>;
  // Discards the current (still in-progress) recording and deletes its
  // temp file - only valid before stopRecording() has been called.
  cancelRecording: () => Promise<void>;
}

interface Props {
  lockMode: AlignmentLockMode;
  // Changing this (e.g. to the current question index) starts a fresh
  // lock cycle - used to re-run the (lighter) recheck for each question.
  resetToken: number | string;
  onLocked: () => void;
  // True for the whole window a real recording is in progress (including
  // while the redo-prompt is up, since the recording is still active until
  // the user chooses keep/redo) - suppresses the periodic detection recheck.
  recordingActive: boolean;
  onRecordingFinished: (filePath: string) => void;
  onRecordingError: (error: Error) => void;
}

export const CameraAlignment = forwardRef<CameraAlignmentHandle, Props>(
  function CameraAlignment(
    { lockMode, resetToken, onLocked, recordingActive, onRecordingFinished, onRecordingError },
    ref,
  ) {
    const { hasPermission: hasCamera, requestPermission: requestCamera } =
      useCameraPermission();
    const { hasPermission: hasMic, requestPermission: requestMic } =
      useMicrophonePermission();

    // Front camera — this is a selfie testimonial recording flow.
    const device = useCameraDevice('front');
    const { width, height } = useWindowDimensions();

    // Requesting both permissions in separate, independent effects fires
    // them concurrently on mount - Android can only show one system
    // permission dialog at a time, so the second request (mic) gets
    // dropped/stuck until the app is reloaded. Sequencing them - only
    // request mic once camera has resolved - fixes it.
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

    // --- Diagnostic-only: measures the real onFacesDetected callback rate
    // over a rolling FPS_WINDOW_MS window, independent of the configured
    // fps cap - so we know the actual throughput, not just the target.
    const callbackTimestamps = useRef<number[]>([]);
    const lastFpsUiUpdate = useRef(0);
    const [measuredFps, setMeasuredFps] = useState(0);
    const [lastCallbackGapMs, setLastCallbackGapMs] = useState(0);

    const handleFacesDetected = useCallback(
      (faces: Face[]) => {
        const now = Date.now();
        const timestamps = callbackTimestamps.current;
        const previous = timestamps[timestamps.length - 1];
        timestamps.push(now);
        const windowStart = now - FPS_WINDOW_MS;
        while (timestamps.length > 0 && timestamps[0] < windowStart) {
          timestamps.shift();
        }

        // Throttle the diagnostic UI/log update itself to 1/sec so the
        // measurement doesn't add its own meaningful render overhead.
        if (now - lastFpsUiUpdate.current > 1000) {
          const spanMs = Math.max(now - timestamps[0], 1);
          const fps = (timestamps.length / spanMs) * 1000;
          setMeasuredFps(fps);
          setLastCallbackGapMs(previous ? now - previous : 0);
          lastFpsUiUpdate.current = now;
          console.log(
            `[fps-diagnostic] detection callback rate: ${fps.toFixed(2)} fps ` +
              `(configured cap: ${ALIGNING_FPS_CONSTRAINT[0].fps} fps, ` +
              `video output attached: ${!DIAGNOSTIC_DISABLE_VIDEO_OUTPUT})`,
          );
        }

        const currentSignals =
          faces.length > 0
            ? computeAlignmentSignals(faces[0].bounds, width, height)
            : null;
        registerFrame(currentSignals != null && isFullyAligned(currentSignals));

        // Detection callbacks can still fire faster than we need to
        // visibly update; throttle the UI-facing state update to ~10/sec.
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
    // recheck window every RECHECK_INTERVAL_MS - fully suspended while an
    // actual recording is in progress.
    const [detectionEnabled, setDetectionEnabled] = useState(true);
    useEffect(() => {
      if (recordingActive) {
        setDetectionEnabled(false);
        return;
      }
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
    }, [isLocked, recordingActive]);

    const faceDetectorOutput = useFaceDetectorOutput({
      onFacesDetected: handleFacesDetected,
      onError: (error) => console.error('[face detector]', error),
      // Landmarks/contours aren't used yet - our alignment checks only
      // read `bounds` - and landmark detection is a meaningfully heavier
      // ML Kit model, so leave both off until something actually needs them.
      performanceMode: 'fast',
      minFaceSize: MIN_FACE_SIZE,
      autoMode: true,
      windowWidth: width,
      windowHeight: height,
    });

    // No filePath given -> records to a temp file within the app's own
    // private storage (not a public gallery, no MediaLibrary permission
    // needed) - matches CLAUDE.md's storage model. The returned path is
    // tracked in JS state by the caller (AppFlow) for later upload/display.
    const videoOutput = useVideoOutput({ enableAudio: true });
    const recorderRef = useRef<Recorder | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        async startRecording() {
          const recorder = await videoOutput.createRecorder({});
          recorderRef.current = recorder;
          await recorder.startRecording(
            (filePath) => onRecordingFinished(filePath),
            (error) => onRecordingError(error),
          );
        },
        async stopRecording() {
          await recorderRef.current?.stopRecording();
        },
        async cancelRecording() {
          await recorderRef.current?.cancelRecording();
          recorderRef.current = null;
        },
      }),
      [videoOutput, onRecordingFinished, onRecordingError],
    );

    // `outputs` must be a stable/memoized array (per VisionCamera's docs)
    // or the session reconfigures on every render. The video output stays
    // connected at all times so recording can start immediately; only the
    // face-detector output toggles on/off. DIAGNOSTIC_DISABLE_VIDEO_OUTPUT
    // strips the video output entirely, for the dual-consumer-session test.
    const outputs = useMemo<CameraOutput[]>(() => {
      if (DIAGNOSTIC_DISABLE_VIDEO_OUTPUT) {
        return detectionEnabled ? [faceDetectorOutput] : [];
      }
      return detectionEnabled ? [videoOutput, faceDetectorOutput] : [videoOutput];
    }, [detectionEnabled, faceDetectorOutput, videoOutput]);
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
        {/* Diagnostic-only panel - experiment/face-detection-diagnostics
            branch only, not meant to ship. */}
        <View style={styles.diagnosticPanel} pointerEvents="none">
          <Text style={styles.diagnosticText}>
            detect: {measuredFps.toFixed(1)} fps (cap {ALIGNING_FPS_CONSTRAINT[0].fps})
          </Text>
          <Text style={styles.diagnosticText}>
            last gap: {lastCallbackGapMs}ms
          </Text>
          <Text style={styles.diagnosticText}>
            video output: {DIAGNOSTIC_DISABLE_VIDEO_OUTPUT ? 'DETACHED' : 'attached'}
          </Text>
        </View>
      </View>
    );
  },
);

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
  diagnosticPanel: {
    position: 'absolute',
    bottom: 110,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    padding: 8,
  },
  diagnosticText: {
    color: '#4ADE80',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
