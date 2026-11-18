import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { PaletteColors } from '../theme/palettes';
import type { Spacing } from '../theme/spacing';
import type { Typography } from '../theme/typography';
import { useStrings } from '../i18n/useStrings';
import { TooltipTarget } from '../tooltips/TooltipTarget';
import { SYSTEM_BAR_BACKGROUND, SYSTEM_BAR_TEXT, SYSTEM_BAR_TEXT_MUTED } from '../theme/SystemBarFrame';

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
  // Keep the tab controls above the real device inset. SystemBarFrame
  // paints the same forest green behind Android buttons / iOS home indicator.
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => makeStyles(colors, spacing, typography, insets.bottom),
    [colors, spacing, typography, insets.bottom],
  );
  const inactive = SYSTEM_BAR_TEXT_MUTED;
  const { t } = useStrings();

  return (
    <View style={styles.container}>
      <TabItem label={t('bottomTabBar.home')} active={activeTab === 'home'} onPress={() => onTabPress('home')} styles={styles}>
        <View style={[styles.homeIconRoof, activeTab === 'home' && styles.iconActiveBg]} />
        <View style={[styles.homeIconBase, activeTab === 'home' && styles.iconActiveBg]} />
      </TabItem>
      <TooltipTarget id="bottomTabBar.myVideosTab" active={activeTab === 'home'} style={styles.tooltipTargetFlex}>
        <TabItem
          label={t('bottomTabBar.myVideos')}
          active={activeTab === 'myVideos'}
          onPress={() => onTabPress('myVideos')}
          styles={styles}
        >
          <View style={[styles.videosIconFrame, activeTab === 'myVideos' && styles.iconActiveBorder]}>
            <View style={[styles.videosIconTriangle, activeTab === 'myVideos' && styles.iconActiveTriangle]} />
          </View>
          {myVideosHasNotification && <View style={styles.notificationDot} />}
        </TabItem>
      </TooltipTarget>
      <TabItem label={t('bottomTabBar.help')} active={activeTab === 'help'} onPress={() => onTabPress('help')} styles={styles}>
        {/* Basic placeholder glyph - real icon treatment lands with the
            Help screen's own build phase, matching the others' style. */}
        <View style={[styles.helpIconCircle, activeTab === 'help' && styles.iconActiveBorder]}>
          <Text style={[styles.helpIconGlyph, { color: activeTab === 'help' ? SYSTEM_BAR_TEXT : inactive }]}>?</Text>
        </View>
      </TabItem>
      <TabItem
        label={t('bottomTabBar.profile')}
        active={activeTab === 'profile'}
        onPress={() => onTabPress('profile')}
        styles={styles}
      >
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
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.item, active && styles.itemActive]} onPress={onPress}>
      <View style={styles.iconSlot}>{children}</View>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(colors: PaletteColors, spacing: Spacing, typography: Typography, bottomInset: number) {
  const inactive = SYSTEM_BAR_TEXT_MUTED;
  return StyleSheet.create({
    container: {
      height: 60 + bottomInset,
      paddingBottom: bottomInset,
      marginTop: spacing.edgeGap,
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: '#345A48',
      backgroundColor: SYSTEM_BAR_BACKGROUND,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 1 },
    itemActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
    // Matches `item`'s own flex so wrapping the My Videos TabItem in a
    // TooltipTarget (an extra View in between) doesn't change this tab's
    // width share in the row - see the tooltip target below.
    tooltipTargetFlex: { flex: 1 },
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
    labelActive: { fontWeight: '700', color: SYSTEM_BAR_TEXT },
    homeIconRoof: {
      width: 12,
      height: 12,
      backgroundColor: inactive,
      transform: [{ rotate: '45deg' }],
      borderRadius: 2,
      marginBottom: -6,
    },
    homeIconBase: { width: 15, height: 10, backgroundColor: inactive, borderRadius: 2 },
    iconActiveBg: { backgroundColor: SYSTEM_BAR_TEXT },
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
    iconActiveTriangle: { borderLeftColor: SYSTEM_BAR_TEXT },
    iconActiveBorder: { borderColor: SYSTEM_BAR_TEXT },
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
