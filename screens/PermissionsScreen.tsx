import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onContinue: () => void;
}

// Pre-permission explainer (design screen 1d) - shown only when "Record a
// new testimonial" is tapped, right before the camera screen mounts. Purely
// a static explainer: CameraAlignment already handles the actual OS
// camera/mic permission requests (sequenced there, see HANDOFF.md), so this
// screen doesn't need any permission logic of its own.
export function PermissionsScreen({ onContinue }: Props) {
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
      <Pressable style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  iconLens: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.accentText,
  },
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
  spacer: {
    flex: 1,
  },
  hintBox: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.processingSoft,
    borderRadius: radius.lg,
  },
  hintText: {
    ...typography.caption,
    fontSize: 14,
    color: colors.textFaint,
    lineHeight: 21,
    textAlign: 'left',
  },
  hintTextStrong: {
    fontWeight: '700',
    color: colors.text,
  },
  button: {
    width: '100%',
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
});
