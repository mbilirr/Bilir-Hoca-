import { useSyncExternalStore } from 'react';

// Görünüm teması (Aşama 8): 'light' = Aydınlık ve Sade, 'dark' = Koyu ve Odaklı.
// Aşama 340: kullanıcı SEÇİMİ üç türlü: 'auto' (cihazın açık/koyu ayarına uyar), 'light', 'dark'.
// Varsayılan 'auto'. Seçim yalnızca bu tarayıcıda saklanır (kişisel veri değildir).
// index.html'deki başlangıç betiği aynı kuralı sayfa çizilmeden önce uygular (açılışta yanıp sönme olmaz).
export type ThemeName = 'light' | 'dark';
export type ThemeChoice = 'auto' | ThemeName;

const THEME_KEY = 'edu_ui_theme';

export const DEFAULT_CHOICE: ThemeChoice = 'auto';
export const THEME_SWITCH_ENABLED = true;

const META_COLOR: Record<ThemeName, string> = { light: '#f5f6fa', dark: '#0b1020' };
export const themeColorFor = (t: ThemeName) => META_COLOR[t];

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const mq: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

const systemTheme = (): ThemeName => (mq?.matches ? 'dark' : 'light');

function readChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' || t === 'auto' ? t : DEFAULT_CHOICE;
  } catch {
    return DEFAULT_CHOICE;
  }
}

let choice: ThemeChoice = readChoice();

const resolve = (c: ThemeChoice): ThemeName => (c === 'auto' ? systemTheme() : c);

function apply(): void {
  if (typeof document === 'undefined') return;
  const t = resolve(choice);
  const root = document.documentElement;
  if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[t]);
}

// Cihaz ayarı değişince (ör. telefon akşam koyuya geçince) 'auto' seçiliyse site de anında geçer.
if (mq) {
  const onSystem = () => {
    if (choice !== 'auto') return;
    apply();
    notify();
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSystem);
  else if (typeof (mq as any).addListener === 'function') (mq as any).addListener(onSystem);
}

apply(); // eski önbellekli index.html ile açılsa da seçim doğru uygulanır

// Başka sekmede seçim değişirse bu sekme de uyar.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY) return;
    choice = readChoice();
    apply();
    notify();
  });
}

/** Ekranda şu an geçerli tema (açık/koyu). */
export function getTheme(): ThemeName {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return resolve(choice);
}

/** Kullanıcının seçimi (otomatik/açık/koyu). */
export function getThemeChoice(): ThemeChoice {
  return choice;
}

export function setThemeChoice(c: ThemeChoice): void {
  choice = c;
  try {
    localStorage.setItem(THEME_KEY, c);
  } catch {}
  apply();
  notify();
}

/** Eski çağrılarla uyum: doğrudan açık ya da koyu seçer. */
export function setTheme(theme: ThemeName): void {
  setThemeChoice(theme);
}

export function toggleTheme(): void {
  setThemeChoice(getTheme() === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): [ThemeName, (t: ThemeName) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as ThemeName);
  return [theme, setTheme];
}

export function useThemeChoice(): [ThemeChoice, ThemeName, (c: ThemeChoice) => void] {
  const c = useSyncExternalStore(subscribe, getThemeChoice, () => DEFAULT_CHOICE);
  const t = useSyncExternalStore(subscribe, getTheme, () => 'light' as ThemeName);
  return [c, t, setThemeChoice];
}
