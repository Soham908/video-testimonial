import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

export type MainTab = 'home' | 'myVideos' | 'profile';

interface Props {
  activeTab: MainTab;
  onTabPress: (tab: MainTab) => void;
}

// Plain state-based tab switching, consistent with the rest of the app's
// lightweight screen-state pattern - no navigation library added.
export function BottomTabBar({ activeTab, onTabPress }: Props) {
  return (
    <View style={styles.container}>
      <TabItem
        label="Home"
        active={activeTab === 'home'}
        onPress={() => onTabPress('home')}
      >
        <View style={styles.homeIconRoof} />
        <View style={[styles.homeIconBase, activeTab === 'home' && styles.iconActiveBg]} />
      </TabItem>
      <TabItem
        label="My videos"
        active={activeTab === 'myVideos'}
        onPress={() => onTabPress('myVideos')}
      >
        <View
          style={[
            styles.videosIconFrame,
            activeTab === 'myVideos' && styles.iconActiveBorder,
          ]}
        >
          <View
            style={[
              styles.videosIconTriangle,
              activeTab === 'myVideos' && styles.iconActiveTriangle,
            ]}
          />
        </View>
      </TabItem>
      <TabItem
        label="Profile"
        active={activeTab === 'profile'}
        onPress={() => onTabPress('profile')}
      >
        <View
          style={[
            styles.profileIconHead,
            activeTab === 'profile' && styles.iconActiveBorder,
          ]}
        />
        <View
          style={[
            styles.profileIconBody,
            activeTab === 'profile' && styles.iconActiveBorder,
          ]}
        />
      </TabItem>
    </View>
  );
}

function TabItem({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable style={styles.item} onPress={onPress}>
      <View style={styles.iconSlot}>{children}</View>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const INACTIVE = colors.textDisabled;

const styles = StyleSheet.create({
  container: {
    height: 74,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 1,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: INACTIVE,
  },
  labelActive: {
    fontWeight: '700',
    color: colors.accent,
  },
  homeIconRoof: {
    width: 12,
    height: 12,
    backgroundColor: INACTIVE,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
    marginBottom: -6,
  },
  homeIconBase: {
    width: 15,
    height: 10,
    backgroundColor: INACTIVE,
    borderRadius: 2,
  },
  iconActiveBg: {
    backgroundColor: colors.accent,
  },
  videosIconFrame: {
    width: 24,
    height: 17,
    borderWidth: 2,
    borderColor: INACTIVE,
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
    borderLeftColor: INACTIVE,
    marginLeft: 2,
  },
  iconActiveTriangle: {
    borderLeftColor: colors.accent,
  },
  iconActiveBorder: {
    borderColor: colors.accent,
  },
  profileIconHead: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: INACTIVE,
    marginBottom: 2,
  },
  profileIconBody: {
    width: 17,
    height: 7,
    borderWidth: 2,
    borderColor: INACTIVE,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
});
