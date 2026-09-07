import { useSyncExternalStore } from 'react';
import type { LanguageCode } from '../preferences';
import en from './strings.en.json';
import hi from './strings.hi.json';
import mr from './strings.mr.json';

// Runtime-usable shape (the _meta block is editor-only documentation, not
// real app copy - stripped from the type so a missing translation key
// shows up as a type error, not a silent `_meta` lookup).
type Strings = Omit<typeof en, '_meta'>;
const CATALOGS: Record<LanguageCode, Strings> = { en, hi, mr };

// Module-level mirror of AppFlow.tsx's own `language` state/preferences.ts
// - AppFlow remains the single source of truth (it owns loading/persisting
// the real preference); this just makes the resolved value readable from
// any screen via useStrings() without prop-drilling `language` through
// ~25 files. A React Context+Provider was the more usual choice here, but
// AppFlow.tsx has many early `return`s scattered through its render (one
// per screen/phase), not one JSX root to wrap - useSyncExternalStore reads
// this reactively without needing that wrapping at all. Call
// setActiveLanguage() once whenever AppFlow's own `language` state
// resolves or changes; every mounted useStrings() call re-renders
// automatically, same as a Context update would.
let currentLanguage: LanguageCode | null = null;
const listeners = new Set<() => void>();

export function setActiveLanguage(language: LanguageCode | null): void {
  if (language === currentLanguage) return;
  currentLanguage = language;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Strings {
  return CATALOGS[currentLanguage ?? 'en'];
}

function resolvePath(strings: Strings, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node != null && typeof node === 'object' && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, strings);
}

// {{token}} substitution - the only templating these strings ever need
// (see strings.en.json's own _meta note on placeholders).
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export interface UseStringsResult {
  strings: Strings;
  // Dot-path lookup matching the JSON's own nesting (e.g. "home.greetingFirstTime").
  // Falls back to the key itself (and a dev-only console.warn) if the path
  // doesn't resolve to a string - visibly wrong text during development
  // instead of a silent crash or a blank label in front of a distributor.
  t: (path: string, vars?: Record<string, string | number>) => string;
}

function makeT(strings: Strings) {
  return function t(path: string, vars?: Record<string, string | number>): string {
    const value = resolvePath(strings, path);
    if (typeof value !== 'string') {
      if (__DEV__) console.warn(`[i18n] missing string for key "${path}"`);
      return path;
    }
    return interpolate(value, vars);
  };
}

export function useStrings(): UseStringsResult {
  const strings = useSyncExternalStore(subscribe, getSnapshot);
  return { strings, t: makeT(strings) };
}

// Non-hook escape hatch for the handful of plain (non-component) modules
// that also have a user-facing string or two - e.g. upload.ts's error
// messages. Reads the same module-level snapshot useStrings() does, just
// without subscribing to changes (a one-off async function call has no
// "re-render" to trigger anyway).
export function t(path: string, vars?: Record<string, string | number>): string {
  return makeT(getSnapshot())(path, vars);
}
