import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Modal as RNModal, Pressable, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { reapplyNavigationBarStyle } from '../../theme/NavigationBarSync';
import { BottomSystemBarBackground } from '../../theme/SystemBarFrame';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';

interface PopupSheetProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Dismiss on backdrop tap. Defaults to true - set false for choices that must be answered explicitly. */
  dismissable?: boolean;
  /** Set false to expose individual controls inside the sheet to assistive technology. */
  groupAccessibility?: boolean;
  onShow?: () => void;
}

// Bottom-anchored sheet used for every "pop-up" in the mockups: upload
// confirmation, Help's tip/contact pop-ups, Profile's edit pop-up, Rehearse's
// "finish practicing" choice.
export function PopupSheet({ visible, onDismiss, children, dismissable = true, groupAccessibility = false, onShow }: PopupSheetProps) {
  const { colors, radius, spacing } = useTheme();
  // Real per-device inset, same BottomTabBar.tsx/ReviewTrimScreen.tsx
  // pattern - without it the sheet's content can sit right at (or behind)
  // Android's 3-button/gesture nav.
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
      onShow={() => { reapplyNavigationBarStyle(); onShow?.(); }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Pressable
        accessible={groupAccessibility}
        style={styles.backdrop}
        onPress={dismissable ? () => { Keyboard.dismiss(); onDismiss(); } : undefined}
      >
        <Pressable
          accessible={groupAccessibility}
          accessibilityViewIsModal={!groupAccessibility}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.xl,
              marginHorizontal: spacing.edgeGap,
              marginBottom: (keyboardOpen ? 0 : insets.bottom) + spacing.edgeGap,
              maxHeight: '90%',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            },
          ]}
          onPress={(e) => {
            e.stopPropagation();
          }}
        >
          <KeyboardAwareScrollView nestedScrollEnabled style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {children}
          </KeyboardAwareScrollView>
        </Pressable>
        {!keyboardOpen && <BottomSystemBarBackground />}
      </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { flexShrink: 1 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
});
