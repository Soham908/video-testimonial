import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import type { Typography } from '../theme/typography';
import { Button } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import { Toggle } from '../components/ui/Toggle';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  questionText: string;
  talkingPoints: string[];
  onStartRecording: () => void;
  onRehearse: () => void;
}

// Static ElevenLabs VO, one file per question - same assets QuestionIntroOverlay
// used to autoplay; here it's opt-in via the "Read to me" toggle instead.
const QUESTION_AUDIO: Record<number, number> = {
  1: require('../assets/audio/question1.mp3'),
  2: require('../assets/audio/question2.mp3'),
  3: require('../assets/audio/question3.mp3'),
  4: require('../assets/audio/question4.mp3'),
  5: require('../assets/audio/question5.mp3'),
};

// Replaces the old QuestionIntroOverlay breather - a real prep screen
// (design 2D) shown before every take, always requiring an explicit tap to
// proceed (either Start recording or Rehearse), never auto-advancing.
export function QuestionBriefScreen({
  questionNumber,
  totalQuestions,
  questionText,
  talkingPoints,
  onStartRecording,
  onRehearse,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [readToMe, setReadToMe] = useState(false);
  const player = useVideoPlayer(QUESTION_AUDIO[questionNumber] ?? QUESTION_AUDIO[1]);

  function toggleReadToMe(next: boolean) {
    setReadToMe(next);
    if (next) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>Question {questionNumber}</Text>
        <View style={[styles.readToMe, readToMe && { backgroundColor: colors.accentSoft }]}>
          <Text
            style={[styles.readToMeText, { color: readToMe ? colors.accent : colors.textMuted }]}
            onPress={() => toggleReadToMe(!readToMe)}
          >
            {readToMe ? 'Reading…' : 'Read to me'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{questionText}</Text>

        <Text style={styles.sectionLabel}>A good answer usually covers</Text>
        <View style={styles.pointsList}>
          {talkingPoints.map((point, i) => (
            <View key={point} style={styles.pointRow}>
              <Text style={styles.pointNumber}>{i + 1}</Text>
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>

        <View style={styles.addPromptRow}>
          <Text style={styles.addPromptText}>+ Add your own prompts</Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Dropdown title="Before you start" subtitle="Light · quiet · 45–60 seconds">
            <Text style={styles.dropdownBody}>
              Face a window or lamp, find a quiet moment, and keep your answer to about
              45-60 seconds - enough to say something real, short enough to hold attention.
            </Text>
          </Dropdown>
          <Dropdown title="Nervous on camera?" subtitle="Three things that help">
            <Text style={styles.dropdownBody}>
              Talk to the camera like a friend, not an audience. Take a breath before you
              start. If you stumble, just keep going - the natural version is the good one.
            </Text>
          </Dropdown>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Start recording" onPress={onStartRecording} />
        <Button label="Rehearse once — nothing is saved" onPress={onRehearse} variant="secondary" />
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius, typography: Typography) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    eyebrow: { fontSize: 15, fontWeight: '600', color: colors.text },
    readToMe: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
    readToMeText: { fontSize: 13, fontWeight: '700' },
    scrollContent: { padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
    title: {
      ...typography.title,
      fontSize: 26,
      color: colors.text,
      lineHeight: 33,
    },
    sectionLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.textFaint,
      fontWeight: '700',
      marginTop: spacing.sm,
    },
    pointsList: {},
    pointRow: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    pointNumber: { fontSize: 13.5, fontWeight: '700', color: colors.accent, width: 16 },
    pointText: { ...typography.body, fontSize: 15.5, color: colors.text, flex: 1, lineHeight: 22 },
    addPromptRow: {
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderStyle: 'dashed',
      borderRadius: radius.lg,
      padding: spacing.md,
      alignItems: 'center',
    },
    addPromptText: { fontSize: 14.5, fontWeight: '700', color: colors.accent },
    dropdownBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
    actions: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  });
}
