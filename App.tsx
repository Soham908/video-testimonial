import { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { Camera, type Face } from 'react-native-vision-camera-face-detector';
import { computeAlignmentSignals, isFullyAligned } from './alignment';

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

  // Log roughly twice a second (every 15th frame) instead of every frame,
  // just to confirm detection + signal computation while wiring this up.
  const frameCount = useRef(0);
  const handleFacesDetected = useCallback(
    (faces: Face[]) => {
      frameCount.current += 1;
      if (frameCount.current % 15 !== 0) return;

      if (faces.length === 0) {
        console.log('[alignment] no face detected');
        return;
      }

      const signals = computeAlignmentSignals(faces[0].bounds, width, height);
      console.log('[alignment]', {
        faces: faces.length,
        bounds: faces[0].bounds,
        ...signals,
        aligned: isFullyAligned(signals),
      });
    },
    [width, height],
  );

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
        runLandmarks
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
