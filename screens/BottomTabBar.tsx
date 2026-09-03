import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Typography } from '../theme/typography';

export type MainTab = 'home' | 'myVideos' | 'help' | 'profile';

interface Props {
  activeTab: MainTab;
  onTabPress: (tab: MainTab) => void;
  /** Small dot on My Videos (DECISIONS.md) - e.g. a branded reel came back that hasn't been opened yet. */
  myVideosHasNotification?: boolean;
}

// Plain state-based tab switching, consistent with the rest of the app's
// lightweight screen-state pattern - no navigation library added.
export function BottomTabBar({ activeTab, onTabPress, myVideosHasNotification }: Props) {
  const { colors, spacing, typography } = useTheme();
  // Real per-device inset (Android 3-button/gesture nav, iOS home indicator)
  // - was previously unaccounted for entirely, so the tab bar's own content
  // sat right under/behind the system nav instead of clearing it. Added as
  // extra height, not swapped in for the fixed 74 - the icon/label row
  // keeps its usual size, insets.bottom is blank space (colors.surface)
  // below it, same visual result as apps where the bar sits above the
  // system buttons.
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, spacing, typography, insets.bottom),
    [colors, spacing, typography, insets.bottom],
  );
  const inactive = colors.textDisabled;

  return (
    <View style={styles.container}>
      <TabItem label="Home" active={activeTab === 'home'} onPress={() => onTabPress('home')} styles={styles}>
        <View style={styles.homeIconRoof} />
        <View style={[styles.homeIconBase, activeTab === 'home' && styles.iconActiveBg]} />
      </TabItem>
      <TabItem label="My videos" active={activeTab === 'myVideos'} onPress={() => onTabPress('myVideos')} styles={styles}>
        <View style={[styles.videosIconFrame, activeTab === 'myVideos' && styles.iconActiveBorder]}>
          <View style={[styles.videosIconTriangle, activeTab === 'myVideos' && styles.iconActiveTriangle]} />
        </View>
        {myVideosHasNotification && <View style={styles.notificationDot} />}
      </TabItem>
      <TabItem label="Help" active={activeTab === 'help'} onPress={() => onTabPress('help')} styles={styles}>
        {/* Basic placeholder glyph - real icon treatment lands with the
            Help screen's own build phase, matching the others' style. */}
        <View style={[styles.helpIconCircle, activeTab === 'help' && styles.iconActiveBorder]}>
          <Text style={[styles.helpIconGlyph, { color: activeTab === 'help' ? colors.accent : inactive }]}>?</Text>
        </View>
      </TabItem>
      <TabItem label="Profile" active={activeTab === 'profile'} onPress={() => onTabPress('profile')} styles={styles}>
        <View style={[styles.profileIconHead, activeTab === 'profile' && styles.iconActiveBorder]} />
        <View style={[styles.profileIconBody, activeTab === 'profile' && styles.iconActiveBorder]} />
      </TabItem>
    </View>
  );
}

function TabItem({
  label,
  active,
  onPress,
  children,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable style={styles.item} onPress={onPress}>
      <View style={styles.iconSlot}>{children}</View>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, typography: Typography, bottomInset: number) {
  const inactive = colors.textDisabled;
  return StyleSheet.create({
    container: {
      height: 74 + bottomInset,
      paddingBottom: bottomInset,
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 1 },
    iconSlot: { alignItems: 'center', justifyContent: 'center', height: 18, position: 'relative' },
    notificationDot: {
      position: 'absolute',
      top: -3,
      right: -6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    label: { ...typography.caption, fontSize: 12, fontWeight: '600', color: inactive },
    labelActive: { fontWeight: '700', color: colors.accent },
    homeIconRoof: {
      width: 12,
      height: 12,
      backgroundColor: inactive,
      transform: [{ rotate: '45deg' }],
      borderRadius: 2,
      marginBottom: -6,
    },
    homeIconBase: { width: 15, height: 10, backgroundColor: inactive, borderRadius: 2 },
    iconActiveBg: { backgroundColor: colors.accent },
    videosIconFrame: {
      width: 24,
      height: 17,
      borderWidth: 2,
      borderColor: inactive,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videosIconTriangle: {
      width: 0,
      height: 0,
      borderTopWidth: 4.5,
      borderBottomWidth: 4.5,
      borderLeftWidth: 7,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: inactive,
      marginLeft: 2,
    },
    iconActiveTriangle: { borderLeftColor: colors.accent },
    iconActiveBorder: { borderColor: colors.accent },
    helpIconCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: inactive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helpIconGlyph: { fontSize: 11, fontWeight: '700' },
    profileIconHead: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: inactive, marginBottom: 2 },
    profileIconBody: {
      width: 17,
      height: 7,
      borderWidth: 2,
      borderColor: inactive,
      borderBottomWidth: 0,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
    },
  });
}
