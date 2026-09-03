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
import { containsDevanagari, devanagariFontFamily } from '../theme/fonts';

interface Props {
  questionNumber: number;
  totalQuestions: number;
  // The current question's own vo_playback_url (API_CONTRACT.md) - a fresh
  // presigned S3 URL fetched from GET /distributors/me/questions, already
  // localized server-side. Not bundled/local and not cached beyond however
  // long the question list itself is cached - `undefined` while questions
  // are still loading, same "no audio" fallback as a question with no
  // clip.
  voPlaybackUrl?: string;
  questionText: string;
  talkingPoints: string[];
  onStartRecording: () => void;
  onRehearse: () => void;
  onBack?: () => void;
}

// Placeholder sample-answer clips (design 2D) - same convention as Home's
// hardcoded HOW_TO_VIDEOS/SAMPLE_VIDEOS, no playback wired yet, no backend
// source for these exists. Cycles across a few company-produced examples so
// it doesn't look identical on every question.
const SAMPLE_ANSWERS: { name: string; business: string; duration: string }[] = [
  { name: 'Suresh', business: 'Patil Enterprises, Kolhapur', duration: '0:38' },
  { name: 'Deepak', business: 'Bansal Hardware, Indore', duration: '0:44' },
  { name: 'Ritu', business: 'Sharma & Sons, Jaipur', duration: '0:41' },
  { name: 'Anil', business: 'Verma Traders, Lucknow', duration: '0:52' },
  { name: 'Kavita', business: 'Joshi Retail, Pune', duration: '0:36' },
];

// Replaces the old QuestionIntroOverlay breather - a real prep screen
// (design 2D) shown before every take, always requiring an explicit tap to
// proceed (either Start recording or Rehearse), never auto-advancing.
export function QuestionBriefScreen({
  questionNumber,
  totalQuestions,
  voPlaybackUrl,
  questionText,
  talkingPoints,
  onStartRecording,
  onRehearse,
  onBack,
}: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius, typography), [colors, spacing, radius, typography]);

  const [readToMe, setReadToMe] = useState(false);
  // undefined (not a missing key in a map) while questions are still
  // loading or a question genuinely has no VO - useVideoPlayer accepts a
  // null/undefined source and stays inert, so that falls back to plain
  // text rather than crashing or blocking anything (CLAUDE.md).
  const audioSource = voPlaybackUrl ?? null;
  const player = useVideoPlayer(audioSource);
  const sampleAnswer = SAMPLE_ANSWERS[(questionNumber - 1) % SAMPLE_ANSWERS.length];

  function toggleReadToMe(next: boolean) {
    if (audioSource == null) return;
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
        <View style={styles.topRowLeft}>
          {onBack && (
            <Text style={styles.backChevron} onPress={onBack}>
              ‹
            </Text>
          )}
          <Text style={styles.eyebrow}>Getting ready</Text>
        </View>
        {audioSource != null && (
          <View style={[styles.readToMe, readToMe && { backgroundColor: colors.accentSoft }]}>
            <Text
              style={[styles.readToMeText, { color: readToMe ? colors.accent : colors.textMuted }]}
              onPress={() => toggleReadToMe(!readToMe)}
            >
              {readToMe ? 'Reading…' : 'Read to me'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.questionNumberLabel}>Question {questionNumber}</Text>
        <Text
          style={[styles.title, containsDevanagari(questionText) && { fontFamily: devanagariFontFamily('700') }]}
        >
          {questionText}
        </Text>

        {talkingPoints.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>A good answer usually covers</Text>
            <View style={styles.pointsList}>
              {talkingPoints.map((point, i) => (
                <View key={point} style={styles.pointRow}>
                  <Text style={styles.pointNumber}>{i + 1}</Text>
                  <Text
                    style={[
                      styles.pointText,
                      containsDevanagari(point) && { fontFamily: devanagariFontFamily('400') },
                    ]}
                  >
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.addPromptRow}>
          <Text style={styles.addPromptText}>+ Add your own prompts</Text>
        </View>

        <View style={styles.sampleRow}>
          <View style={styles.sampleThumb}>
            <View style={styles.sampleThumbPlay}>
              <Text style={styles.sampleThumbPlayGlyph}>▶</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.sampleTitle}>Hear how {sampleAnswer.name} answered</Text>
            <Text style={styles.sampleSubtitle}>
              {sampleAnswer.business} · {sampleAnswer.duration}
            </Text>
          </View>
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
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xl + spacing.topExtra },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    topRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    backChevron: { fontSize: 24, fontWeight: '700', color: colors.text, lineHeight: 24 },
    eyebrow: { fontSize: 15, fontWeight: '600', color: colors.text },
    readToMe: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
    readToMeText: { fontSize: 13, fontWeight: '700' },
    scrollContent: { padding: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
    questionNumberLabel: {
      fontSize: 11.5,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: colors.accent,
      fontWeight: '700',
    },
    title: {
      ...typography.title,
      fontSize: 26,
      color: colors.text,
      lineHeight: 33,
      marginTop: -4,
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
    sampleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    sampleThumb: {
      width: 58,
      height: 76,
      borderRadius: radius.md,
      backgroundColor: '#2B2521',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sampleThumbPlay: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.94)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sampleThumbPlayGlyph: { fontSize: 11, color: '#241E1A', marginLeft: 2 },
    sampleTitle: { ...typography.body, fontSize: 15.5, fontWeight: '600', color: colors.text },
    sampleSubtitle: { ...typography.caption, fontSize: 13, color: colors.textFaint },
    dropdownBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
    actions: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  });
}
