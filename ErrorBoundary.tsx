import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from './i18n/useStrings';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Wraps the whole app (App.tsx) - the only global safety net against an
// uncaught render error anywhere in AppFlow.tsx's ~1,800-line state machine
// or any screen it renders. Before this, there was none
// (FRONTEND_AUDIT_2026-09-09.md §3, "None exists" / highest-ranked gap):
// any uncaught exception crashed the entire app with no fallback UI and no
// way back short of force-quitting and reopening.
//
// A class component, not a hook - React error boundaries only work as
// class components (getDerivedStateFromError/componentDidCatch have no
// hook equivalent as of this React version). Can't call useTheme()/
// useStrings() here as a result - styling is a small set of hardcoded,
// theme-independent values (same precedent as App.tsx's own
// pre-ThemeProvider fallback screen), copy goes through i18n's
// useStrings.ts non-hook `t()` escape hatch instead (the same one upload.ts
// uses for its own plain-module error strings), and the retry control is a
// bare Pressable rather than the shared Button component - Button calls
// useTheme(), which throws with no provider mounted. This boundary wraps
// ThemeProvider itself (App.tsx), specifically so a crash originating
// inside ThemeProvider/SafeAreaProvider - not just inside AppFlow - is
// still caught with a working fallback rather than a second, unhandled
// crash from the fallback UI itself depending on the very thing that broke.
//
// "Try again" resets `hasError`, which re-renders `children` from scratch -
// for the common case (App.tsx wraps AppFlow directly), that's a full
// remount of AppFlow, which re-runs its own launch-time restore effect and
// lands back on whatever session.ts already had persisted. This doesn't
// prevent the underlying bug, but it turns "app is dead, force-quit and
// hope" into "one screen broke, tap Try again, back to where you were" -
// directly matching this app's stated top priority (never leave a
// distributor stuck). No crash-reporting SDK exists in this codebase yet
// (confirmed in the same audit) - componentDidCatch logs to console only,
// same visibility level every other native-crash boundary in this app
// already has (useAmbientNoiseCheck.ts, CameraCheckScreen.tsx, etc.).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    console.error('[ErrorBoundary] uncaught render error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{t('errorBoundary.title')}</Text>
          <Text style={styles.subtitle}>{t('errorBoundary.subtitle')}</Text>
          <Pressable style={styles.button} onPress={() => this.setState({ hasError: false })}>
            <Text style={styles.buttonText}>{t('errorBoundary.retryButton')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#241E1A', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 15, color: '#5C6963', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  button: {
    height: 56,
    minWidth: 160,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#C25A34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
