import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Radius } from '../theme/radius';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { Carousel } from '../components/ui/Carousel';

export interface Take {
  id: string;
  filePath: string;
  durationSeconds: number;
}

interface Props {
  questionNumber: number;
  takes: Take[];
  selectedTakeId: string;
  onSelectTake: (id: string) => void;
  removeLastTwoSeconds: boolean;
  onToggleRemoveLastTwoSeconds: (next: boolean) => void;
  trimStartSeconds: number;
  trimEndSeconds: number;
  onChangeTrim: (start: number, end: number) => void;
  onRecordAnother: () => void;
  onKeep: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// New screen, no current equivalent - review/trim is mandatory after every
// take now (DECISIONS.md), not a conditional "alignment broke" overlay.
// The timeline is plain (no thumbnails/waveform - both need native
// video/audio decode; `ffmpeg-kit-react-native` is retired, not worth a
// forked dependency for this). Trim is metadata only - see recordings.ts -
// no media is actually cut here.
export function ReviewTrimScreen({
  questionNumber,
  takes,
  selectedTakeId,
  onSelectTake,
  removeLastTwoSeconds,
  onToggleRemoveLastTwoSeconds,
  trimStartSeconds,
  trimEndSeconds,
  onChangeTrim,
  onRecordAnother,
  onKeep,
}: Props) {
  const { colors, spacing, radius } = useTheme();
  const styles = useMemo(() => makeStyles(colors, spacing, radius), [colors, spacing, radius]);

  const selected = takes.find((t) => t.id === selectedTakeId) ?? takes[takes.length - 1];
  const player = useVideoPlayer(selected?.filePath ?? null, (p) => {
    p.pause();
  });

  return (
    <View style={styles.container}>
      <View style={styles.videoWrap}>
        {selected && (
          <VideoView style={styles.video} player={player} contentFit="cover" nativeControls />
        )}
      </View>

      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Have a look</Text>
            <Text style={styles.subtitle}>
              Take {takes.findIndex((t) => t.id === selected?.id) + 1} · {formatTime(selected?.durationSeconds ?? 0)}
            </Text>
          </View>
        </View>

        {takes.length > 1 && (
          <Carousel style={styles.takesRow}>
            {takes.map((take, i) => (
              <View
                key={take.id}
                onTouchEnd={() => onSelectTake(take.id)}
                style={[
                  styles.takeThumb,
                  { borderColor: take.id === selected?.id ? colors.accent : colors.border },
                ]}
              >
                {take.id === selected?.id && (
                  <View style={styles.usingBadge}>
                    <Text style={styles.usingBadgeText}>Using</Text>
                  </View>
                )}
                <Text style={styles.takeThumbLabel}>Take {i + 1}</Text>
                <Text style={styles.takeThumbDuration}>{formatTime(take.durationSeconds)}</Text>
              </View>
            ))}
          </Carousel>
        )}

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Remove the last 2 seconds</Text>
            <Text style={styles.toggleReason}>Useful if you fumbled the sign-off</Text>
          </View>
          <Toggle value={removeLastTwoSeconds} onValueChange={onToggleRemoveLastTwoSeconds} />
        </View>

        {selected && (
          <TrimTimeline
            durationSeconds={selected.durationSeconds}
            startSeconds={trimStartSeconds}
            endSeconds={trimEndSeconds}
            onChange={onChangeTrim}
            colors={colors}
          />
        )}

        <View style={styles.actions}>
          <Button label="Keep this take" onPress={onKeep} />
          <Button label="Record another" onPress={onRecordAnother} variant="secondary" />
        </View>
      </View>
    </View>
  );
}

// Plain draggable strip - two handles, no frame thumbnails or waveform.
// PanResponder is built into React Native core, no new dependency.
function TrimTimeline({
  durationSeconds,
  startSeconds,
  endSeconds,
  onChange,
  colors,
}: {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  onChange: (start: number, end: number) => void;
  colors: PaletteColors;
}) {
  const { spacing, radius } = useTheme();
  const trackWidth = useRef(0);
  const [width, setWidth] = useState(0);

  const startResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, gesture) => {
          if (trackWidth.current === 0) return;
          const fraction = Math.max(0, Math.min(1, gesture.moveX / trackWidth.current));
          const next = Math.min(fraction * durationSeconds, endSeconds - 1);
          onChange(Math.max(0, next), endSeconds);
        },
      }),
    [durationSeconds, endSeconds, onChange],
  );

  const endResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, gesture) => {
          if (trackWidth.current === 0) return;
          const fraction = Math.max(0, Math.min(1, gesture.moveX / trackWidth.current));
          const next = Math.max(fraction * durationSeconds, startSeconds + 1);
          onChange(startSeconds, Math.min(durationSeconds, next));
        },
      }),
    [durationSeconds, startSeconds, onChange],
  );

  const startPct = durationSeconds > 0 ? startSeconds / durationSeconds : 0;
  const endPct = durationSeconds > 0 ? endSeconds / durationSeconds : 1;

  return (
    <View style={{ gap: spacing.xs + 2 }}>
      <View
        style={{ height: 34, justifyContent: 'center' }}
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.canvas }} />
        <View
          style={{
            position: 'absolute',
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.accent,
            left: startPct * width,
            width: Math.max(0, (endPct - startPct) * width),
          }}
        />
        <View
          {...startResponder.panHandlers}
          style={{
            position: 'absolute',
            left: startPct * width - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
        <View
          {...endResponder.panHandlers}
          style={{
            position: 'absolute',
            left: endPct * width - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12.5, color: colors.textFaint, fontVariant: ['tabular-nums'] }}>
          {formatTime(startSeconds)}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.textFaint, fontVariant: ['tabular-nums'] }}>
          {formatTime(endSeconds)}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, radius: Radius) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    videoWrap: { height: '38%', backgroundColor: '#000' },
    video: { flex: 1 },
    sheet: { flex: 1, padding: spacing.xl, gap: spacing.md },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
    title: { fontSize: 22, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    takesRow: { flexGrow: 0 },
    takeThumb: {
      width: 84,
      height: 60,
      borderRadius: radius.md,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    usingBadge: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: colors.accent,
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    usingBadgeText: { fontSize: 8, fontWeight: '700', color: colors.accentText },
    takeThumbLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    takeThumbDuration: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    toggleReason: { fontSize: 12.5, color: colors.textFaint, marginTop: 2 },
    actions: { marginTop: 'auto', gap: spacing.sm },
  });
}
