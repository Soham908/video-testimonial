import { Keyboard, Modal as RNModal, Pressable, View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

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

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
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
              paddingBottom: spacing.xxl,
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
