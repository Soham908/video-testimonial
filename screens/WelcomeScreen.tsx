import { StyleSheet, Text, View, Pressable } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoPlaceholder}>
          <Text style={styles.logoPlaceholderText}>LOGO</Text>
        </View>
        <Text style={styles.title}>Share your story in a short video.</Text>
        <Text style={styles.subtitle}>
          Answer 5 simple questions on camera. This app guides you one step
          at a time. It takes about 10 minutes.
        </Text>
      </View>
      <Pressable style={styles.button} onPress={onGetStarted}>
        <Text style={styles.buttonText}>Begin</Text>
      </Pressable>
      <Text style={styles.footer}>
        Only your video will be shared with your company.{'\n'}You can stop
        at any time.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  content: {
    flex: 1,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoPlaceholderText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textDisabled,
  },
  title: {
    ...typography.title,
    fontSize: 30,
    color: colors.text,
    lineHeight: 38,
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textMuted,
    lineHeight: 24,
  },
  button: {
    height: 60,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.button,
    color: colors.accentText,
  },
  footer: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 19,
  },
});
