import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { AlignmentStatusStrip } from './AlignmentStatusStrip';
import { computeAlignmentSignals, isFullyAligned, type AlignmentSignals } from './alignment';
import { useAlignmentLock, type AlignmentLockMode } from './useAlignmentLock';
import { useAmbientNoiseCheck } from './useAmbientNoiseCheck';

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
  // False while the caller is showing something else (e.g. the question
  // intro/VO) that alignment checking shouldn't run underneath - detection
  // stays fully off until this flips true, regardless of `isLocked`.
  alignmentActive: boolean;
  // True for the whole window a real recording is in progress (including
  // while the redo-prompt is up, since the recording is still active until
  // the user chooses keep/redo) - suppresses the periodic detection recheck.
  recordingActive: boolean;
  onRecordingFinished: (filePath: string) => void;
  onRecordingError: (error: Error) => void;
  // Fires once camera or mic permission is confirmed hard-denied (the OS
  // won't show its own dialog again) - the caller should route back to
  // PermissionsScreen's guided denied-state (numbered Settings steps),
  // which is far clearer for a non-technical user than a bare "Open
  // Settings" button with no instructions.
  onPermissionBlocked?: () => void;
}

export const CameraAlignment = forwardRef<CameraAlignmentHandle, Props>(
  function CameraAlignment(
    {
      lockMode,
      resetToken,
      onLocked,
      alignmentActive,
      recordingActive,
      onRecordingFinished,
      onRecordingError,
      onPermissionBlocked,
    },
    ref,
  ) {
    const {
      hasPermission: hasCamera,
      requestPermission: requestCamera,
      canRequestPermission: canRequestCamera,
    } = useCameraPermission();
    const {
      hasPermission: hasMic,
      requestPermission: requestMic,
      canRequestPermission: canRequestMic,
    } = useMicrophonePermission();

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

    // Reports a hard denial (OS won't show its own dialog again) up to the
    // caller so it can route to a screen with real recovery instructions
    // instead of this component's own bare fallback below.
    useEffect(() => {
      const hardDenied = (!hasCamera && !canRequestCamera) || (!hasMic && !canRequestMic);
      if (hardDenied) onPermissionBlocked?.();
    }, [hasCamera, hasMic, canRequestCamera, canRequestMic, onPermissionBlocked]);

    const { isLocked, goodFrameStreak, requiredFrames, registerFrame, reset } =
      useAlignmentLock(lockMode);

    const [signals, setSignals] = useState<AlignmentSignals | null>(null);
    const frameCount = useRef(0);
    // Stable, sticky "have we left the alignment screen for this question"
    // flag - deliberately state, not a ref, because visibility/detection
    // below need to react to it. This is NOT the same thing as
    // `readyToAdvance` further down: readyToAdvance is a live, fluctuating
    // value (noise can flip it back to false later, e.g. if the room gets
    // noisy again during the countdown), whereas `hasAdvanced` only ever
    // goes false->true once per question and then stays put. Using the
    // fluctuating value for visibility/detection-enable was the bug in the
    // previous version of this file: a later noise fluctuation could
    // reopen the guide/status strip and re-enable full detection mid
    // countdown, reconfiguring the camera session right as recording was
    // about to start.
    const [hasAdvanced, setHasAdvanced] = useState(false);

    // Ambient noise only needs sampling up to the moment we've advanced
    // past this screen - stopped during the question intro/VO, stopped for
    // good once advanced (countdown/recording/redo-prompt all have no use
    // for it), so there's no chance of it competing with the video
    // recorder for the mic even for a moment. Also gated on `hasMic`:
    // without this, on question 1 specifically (before mic permission is
    // confirmed granted), expo-audio's own requestRecordingPermissionsAsync()
    // call inside useAmbientNoiseCheck could fire concurrently with
    // VisionCamera's separate requestMic() above - two different libraries
    // independently negotiating the same OS-level RECORD_AUDIO permission
    // at once. That's a real candidate for the intermittent "JPromise was
    // destroyed" error seen only on question 1 (by question 2+, hasMic is
    // already true from question 1, so there's nothing left to race).
    const micCheckActive =
      hasMic && alignmentActive && !recordingActive && !hasAdvanced;
    const noise = useAmbientNoiseCheck(micCheckActive);
    const [noiseOverridden, setNoiseOverridden] = useState(false);

    // Start a fresh lock cycle whenever the mode or reset token changes
    // (e.g. moving to the next question) - the noise override resets the
    // same way, so a bad-noise override from a previous question doesn't
    // silently carry over to the next one.
    useEffect(() => {
      reset();
      setNoiseOverridden(false);
      setHasAdvanced(false);
    }, [lockMode, resetToken, reset]);

    // Live gate for the one-time "fire onLocked()" trigger only - noise
    // only ever *holds* the advance it would otherwise already be
    // triggering, and only in the specific case where it's still bad at
    // that exact moment. Not used for anything else (see `hasAdvanced`).
    const noiseReady = noise.status !== 'noisy' || noiseOverridden;
    const readyToAdvance = isLocked && noiseReady;

    const handleFacesDetected = useCallback(
      (faces: Face[]) => {
        const currentSignals =
          faces.length > 0
            ? computeAlignmentSignals(faces[0].bounds, width, height)
            : null;
        const currentlyAligned =
          currentSignals != null && isFullyAligned(currentSignals);
        registerFrame(currentlyAligned);

        // useAlignmentLock's streak is normally sticky once locked (by
        // design - see its own comments), which was fine when advancing
        // followed locking almost instantly. During a noise hold the
        // screen can now stay up well after that, so without this, moving
        // out of frame while waiting on noise left the streak frozen at
        // "done" (see e.g. "goodFrameStreak": 40 next to "centered":
        // false in the diagnostic log) even though alignment had visibly
        // broken. Explicitly un-locking in just this one case - not the
        // separate post-advance recheck, which is intentionally different
        // - re-requires the full streak, which is fine: detection is cheap
        // enough now (~30fps) that re-accumulating it costs a beat, not a
        // real delay. Guarded on `!hasAdvanced` so this can only ever fire
        // while still genuinely waiting on this screen, never during the
        // separate post-advance recheck.
        if (!hasAdvanced && isLocked && !noiseReady && !currentlyAligned) {
          reset();
        }

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
      [
        width,
        height,
        registerFrame,
        goodFrameStreak,
        requiredFrames,
        isLocked,
        noiseReady,
        reset,
        hasAdvanced,
      ],
    );

    useEffect(() => {
      if (readyToAdvance && !hasAdvanced) {
        console.log('[alignment] LOCKED — ready to record', {
          noiseStatus: noise.status,
          noiseOverridden,
        });
        setHasAdvanced(true);
        onLocked();
      }
    }, [readyToAdvance, onLocked, hasAdvanced, noise.status, noiseOverridden]);

    // Detection stays fully continuous for as long as the alignment UI is
    // still visible - which is `!hasAdvanced`, a stable flag, not the live
    // `readyToAdvance` (see its declaration above for why: a later noise
    // fluctuation must never reopen this). Gating this on raw `isLocked`
    // alone (an earlier version of this fix) froze `signals` at whatever
    // they were the instant the lock completed - so moving out of frame
    // during a noise hold silently stopped being reflected anywhere on
    // screen. Only once actually advanced does detection drop to the
    // periodic-recheck cadence (e.g. during the countdown, where the
    // guide/strip are hidden again anyway) - fully suspended while an
    // actual recording is in progress, and fully suspended whenever the
    // caller says alignment shouldn't be running at all (e.g. the question
    // intro/VO is showing).
    const [detectionEnabled, setDetectionEnabled] = useState(true);
    useEffect(() => {
      if (recordingActive || !alignmentActive) {
        setDetectionEnabled(false);
        return;
      }
      if (!hasAdvanced) {
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
    }, [hasAdvanced, recordingActive, alignmentActive]);

    const faceDetectorOutput = useFaceDetectorOutput({
      onFacesDetected: handleFacesDetected,
      onError: (error) => console.error('[face detector]', error),
      // RE-TESTED (see DEV_NOTES.md's "Resolved investigations"): with the
      // real useMemo bug fixed, re-enabling landmarks was tried again to
      // see if the original "too expensive" call was actually just that
      // same bug in disguise. It wasn't - measured ~19-22fps with
      // landmarks on vs. the confirmed ~29-30fps baseline without, a real
      // ~30% regression. Reverted to false. Our alignment checks only read
      // `bounds` anyway.
      runLandmarks: false,
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
    // face-detector output toggles on/off.
    const outputs = useMemo<CameraOutput[]>(
      () => (detectionEnabled ? [videoOutput, faceDetectorOutput] : [videoOutput]),
      [detectionEnabled, faceDetectorOutput, videoOutput],
    );

    if (!hasCamera || !hasMic) {
      // The auto-request effect above only re-fires when hasCamera/hasMic
      // actually change value - if the OS dialog gets denied, both stay
      // false forever and that effect never runs again, so without this
      // the app was stuck showing a perpetual "requesting..." message that
      // wasn't actually requesting anything any more. canRequestPermission
      // tells us whether a manual retry can still show the OS dialog
      // (soft denial) or whether Settings is the only way out (hard
      // denial/"don't ask again") - offering both covers either case
      // without needing to know which one we're in.
      const canRetry = (!hasCamera && canRequestCamera) || (!hasMic && canRequestMic);
      return (
        <View style={styles.center}>
          <Text style={styles.text}>
            {canRetry
              ? 'Camera & microphone access is needed to continue.'
              : "Camera & microphone access was turned off, and your phone won't ask again here."}
          </Text>
          {canRetry ? (
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                if (!hasCamera) requestCamera();
                if (!hasMic) requestMic();
              }}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.retryButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.retryButtonText}>Open phone settings</Text>
            </Pressable>
          )}
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
          outputs={outputs}
        />
        <AlignmentGuideOverlay
          visible={!hasAdvanced}
          signals={signals}
          goodFrameStreak={goodFrameStreak}
          requiredFrames={requiredFrames}
        />
        <AlignmentStatusStrip
          visible={!hasAdvanced}
          signals={signals}
          noiseStatus={noise.status}
          noiseSustained={noise.sustainedNoisy}
          noiseOverridden={noiseOverridden}
          onOverrideNoise={() => setNoiseOverridden(true)}
        />
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
  retryButton: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
