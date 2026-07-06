import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { Camera, type Face } from 'react-native-vision-camera-face-detector';
import { AlignmentGuideOverlay } from './AlignmentGuideOverlay';
import { computeAlignmentSignals, isFullyAligned, type AlignmentSignals } from './alignment';
import { useAlignmentLock } from './useAlignmentLock';

export default function App() {
  const { hasPermission: hasCamera, requestPermission: requestCamera } =
    useCameraPermission();
  const { hasPermission: hasMic, requestPermission: requestMic } =
    useMicrophonePermission();

  // Front camera — this is a selfie testimonial recording flow.
  const device = useCameraDevice('front');
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (!hasCamera) requestCamera();
  }, [hasCamera, requestCamera]);

  useEffect(() => {
    if (!hasMic) requestMic();
  }, [hasMic, requestMic]);

  // Only one question/screen exists so far, so 'initial' is the only mode
  // in play right now — the 'recheck' mode will matter once the 5-question
  // flow exists.
  const { isLocked, goodFrameStreak, requiredFrames, registerFrame } =
    useAlignmentLock('initial');
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

      // Detection callbacks can fire 20-30+ times/sec; re-rendering the
      // overlay at that rate is what was causing the on-device lag, so we
      // throttle the UI-facing state update to ~10/sec instead.
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
    }
    wasLocked.current = isLocked;
  }, [isLocked]);

  if (!hasCamera || !hasMic) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>
          Requesting camera &amp; microphone permission…
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>No camera device found</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        // Landmarks/contours aren't used yet - our alignment checks only
        // read `bounds` - and landmark detection is a meaningfully heavier
        // ML Kit model, so leave both off until something actually needs them.
        performanceMode="fast"
        autoMode
        windowWidth={width}
        windowHeight={height}
        onFacesDetected={handleFacesDetected}
        onError={(error) => console.error('[face detector]', error)}
        // `output` is a required field in this package's own .d.ts, but the
        // runtime component never reads it (it builds its own `outputs`
        // array internally) — passing undefined just satisfies the type.
        output={undefined}
      />
      <AlignmentGuideOverlay
        visible={!isLocked}
        signals={signals}
        goodFrameStreak={goodFrameStreak}
        requiredFrames={requiredFrames}
      />
      <StatusBar style="light" />
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
