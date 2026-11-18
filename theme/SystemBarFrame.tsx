import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './spacing';

export const SYSTEM_BAR_BACKGROUND = '#153B2E';
export const SYSTEM_BAR_TEXT = '#FFFFFF';
export const SYSTEM_BAR_TEXT_MUTED = '#BCCFC6';

// Paint the safe areas ourselves: modern Android system bars are transparent.
// Page/control spacing clears the real insets without resizing the camera
// viewport (its existing alignment calculations use the full window size).
export function BottomSystemBarBackground() {
  const insets = useSafeAreaInsets();
  return insets.bottom > 0
    ? <View pointerEvents="none" style={[styles.bottom, { height: insets.bottom }]} />
    : null;
}

export function SystemBarFrame({ children, immersive }: { children: ReactNode; immersive: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.frame}>
      <View style={styles.content}>{children}</View>
      {insets.top > 0 && (
        <View pointerEvents="none" style={[styles.top, { height: insets.top + spacing.edgeGap }]} />
      )}
      {!immersive && <BottomSystemBarBackground />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: SYSTEM_BAR_BACKGROUND },
  content: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: SYSTEM_BAR_BACKGROUND },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: SYSTEM_BAR_BACKGROUND },
});
