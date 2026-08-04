import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';

interface Props {
  onContinue: () => void;
}

// Pre-permission explainer, shown only when "Record a new testimonial" is
// tapped, right before the camera screen mounts. CameraAlignment already
// handles the actual OS camera/mic permission *requests* (sequenced there,
// see DEV_NOTES.md) - this screen only *reads* status, via the same
// react-native-vision-camera APIs, to decide which of two states to show.
//
// Permissions are detected on every entry, not shown once (DECISIONS.md) -
// the OS won't re-prompt after a denial, so a distributor who denied once
// needs an explicit path to Settings, not a repeat of the same ask.
export function PermissionsScreen({ onContinue }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  // Both hooks already re-check on every AppState 'active' transition (see
  // usePermission.ts), so returning from Settings after granting updates
  // this automatically - no extra polling needed here.
  const camera = useCameraPermission();
  const microphone = useMicrophonePermission();
  const denied =
    (!camera.hasPermission && !camera.canRequestPermission) ||
    (!microphone.hasPermission && !microphone.canRequestPermission);

  if (denied) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
          <View style={[styles.iconCamera, { backgroundColor: colors.danger }]}>
            <View style={styles.iconLens} />
          </View>
        </View>
        <Text style={styles.title}>Camera & microphone are off</Text>
        <Text style={styles.body}>
          You said no to this before, so your phone won't ask again on its own. Turn
          them on in Settings to keep going.
        </Text>
        <View style={styles.spacer} />
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            Settings → Apps → <Text style={styles.hintTextStrong}>Vardaan Paints</Text> →
            Permissions → turn on Camera and Microphone.
          </Text>
        </View>
        <Button label="Open Settings" onPress={() => Linking.openSettings()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <View style={styles.iconCamera}>
          <View style={styles.iconLens} />
        </View>
      </View>
      <Text style={styles.title}>Allow camera & microphone</Text>
      <Text style={styles.body}>
        To record your video, the app needs your phone's camera and mic.
        Nothing is recorded until you see the red dot.
      </Text>
      <View style={styles.spacer} />
      <View style={styles.hintBox}>
        <Text style={styles.hintText}>
          Your phone will ask next — tap{' '}
          <Text style={styles.hintTextStrong}>"While using the app"</Text>.
        </Text>
      </View>
      <Button label="Continue" onPress={onContinue} />
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      padding: spacing.xl,
      paddingTop: spacing.xxl * 1.5,
      paddingBottom: spacing.xxl,
    },
    iconCircle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCamera: {
      width: 46,
      height: 34,
      borderRadius: 9,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconLens: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.accentText },
    title: {
      ...typography.title,
      fontSize: 26,
      color: colors.text,
      textAlign: 'center',
      marginTop: spacing.xl,
      lineHeight: 34,
    },
    body: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      marginTop: spacing.md,
    },
    spacer: { flex: 1 },
    hintBox: {
      width: '100%',
      padding: spacing.md,
      backgroundColor: colors.processingSoft,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    },
    hintText: { ...typography.caption, fontSize: 14, color: colors.textFaint, lineHeight: 21, textAlign: 'left' },
    hintTextStrong: { fontWeight: '700', color: colors.text },
  });
}
