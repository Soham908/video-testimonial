import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Keyboard, ScrollView, TextInput, type ScrollViewProps } from 'react-native';
import { spacing } from '../../theme/spacing';

// Used by forms and sheets. Resizing the viewport alone doesn't reveal a
// focused field lower in the content; scroll that field above the keyboard.
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView({ onFocus, onLayout, onContentSizeChange, ...props }, ref) {
  const scroll = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useImperativeHandle(ref, () => scroll.current!, []);
  function reveal() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const field = TextInput.State.currentlyFocusedInput();
      if (field && Keyboard.isVisible()) {
        scroll.current?.scrollResponderScrollNativeHandleToKeyboard(field, spacing.footerGap * 2, true);
      }
    }, 100);
  }
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', reveal);
    const changed = Keyboard.addListener('keyboardDidChangeFrame', reveal);
    return () => { shown.remove(); changed.remove(); clearTimeout(timer.current); };
  }, []);
  return <ScrollView {...props} ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    onFocus={event => { onFocus?.(event); reveal(); }}
    onLayout={event => { onLayout?.(event); reveal(); }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); reveal(); }} />;
});
