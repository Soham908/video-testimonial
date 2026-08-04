import { ScrollView, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface CarouselProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Plain horizontally-scrolling row - used for Home/My Videos/Help's sample
// video shelves and Review & Trim's takes carousel. Deliberately simple
// (no snap/paging logic): every current use case is "swipe to see more,"
// not a paged carousel.
export function Carousel({ children, style }: CarouselProps) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { gap: spacing.sm }]}
      style={style}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row' },
});
