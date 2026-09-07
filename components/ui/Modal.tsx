import { Keyboard, Modal as RNModal, Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { reapplyNavigationBarStyle } from '../../theme/NavigationBarSync';

interface PopupSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Dismiss on backdrop tap. Defaults to true - set false for choices that must be answered explicitly. */
  dismissable?: boolean;
}

// Bottom-anchored sheet used for every "pop-up" in the mockups: upload
// confirmation, Help's tip/contact pop-ups, Profile's edit pop-up, Rehearse's
// "finish practicing" choice.
export function PopupSheet({ visible, onDismiss, children, dismissable = true }: PopupSheetProps) {
  const { colors, radius, spacing } = useTheme();
  // Real per-device inset, same BottomTabBar.tsx/ReviewTrimScreen.tsx
  // pattern - without it the sheet's content can sit right at (or behind)
  // Android's 3-button/gesture nav.
  const insets = useSafeAreaInsets();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      // See reapplyNavigationBarStyle's own comment - Android's Modal
      // opens a separate window that doesn't inherit the Activity's nav
      // bar style. onShow (a native "the modal is actually up now"
      // signal) rather than a useEffect keyed on `visible` - the effect
      // fires the instant React commits the prop, which can be before the
      // native Dialog window itself exists yet, so the reapply could be
      // landing on the wrong window and getting silently overwritten once
      // the Dialog actually takes focus a moment later.
      onShow={reapplyNavigationBarStyle}
    >
      <Pressable
        style={styles.backdrop}
        onPress={dismissable ? onDismiss : undefined}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
              paddingBottom: spacing.xxl + insets.bottom,
            },
          ]}
          onPress={(e) => {
            e.stopPropagation();
            Keyboard.dismiss();
          }}
        >
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { width: '100%' },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
});
