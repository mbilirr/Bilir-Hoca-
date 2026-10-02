import { useSyncExternalStore } from 'react';

// Görünüm teması (Aşama 8): 'light' = Aydınlık ve Sade, 'dark' = Koyu ve Odaklı.
// Seçim yalnızca bu tarayıcıda saklanır (kişisel veri değildir).
export type ThemeName = 'light' | 'dark';

const THEME_KEY = 'edu_ui_theme';

// Varsayılan: açık tema. Kullanıcı üst menüdeki güneş/ay düğmesiyle değiştirebilir.
export const DEFAULT_THEME: ThemeName = 'light';
export const THEME_SWITCH_ENABLED = true;

const listeners = new Set<() => void>();

function readStored(): ThemeName | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function getTheme(): ThemeName {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return readStored() || DEFAULT_THEME;
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1020' : '#f5f6fa');
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): [ThemeName, (t: ThemeName) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
  return [theme, setTheme];
}
