import { useEffect, useRef } from 'react';

// ============================================================================
// Bildirimlerin kendiliğinden kaybolması (Aşama 32)
// Öğretmen ekranına gelen genel bildirimler ("e-posta gönderildi", "kaydedildi" vb.) 15 saniye sonra kaybolur.
// Yeni bir bildirim gelirse süre baştan başlar; eski zamanlayıcı yeni bildirimi erken silmez.
// ============================================================================

/** Bildirimin ekranda kalma süresi (milisaniye) */
export const NOTICE_HIDE_MS = 15_000;

/**
 * `value` doluyken (null / '' / false değilken) NOTICE_HIDE_MS sonra `clear` çağrılır.
 * value değişirse (yeni bildirim) süre yeniden başlar.
 */
export function useAutoDismiss(value: unknown, clear: () => void, ms: number = NOTICE_HIDE_MS): void {
  const clearRef = useRef(clear);
  clearRef.current = clear;
  const key = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  const active = !!value;
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => clearRef.current(), ms);
    return () => window.clearTimeout(t);
  }, [key, active, ms]);
}
