import { useEffect, useState } from 'react';

// ============================================================================
// Canlı "şimdi" (Aşama 29)
// Ana sayfadaki duvarlar bileşen ilk açıldığında bir kez hesaplanan tarihi kullanıyordu;
// gece yarısı geçince, sekme arka plandan dönünce ya da telefon uykudan uyanınca
// "bugün" eski kalıyordu. Bu kanca tarihi her 30 saniyede, sekme görünür olunca ve
// pencere odaklanınca kontrol eder. Gün değişmediyse aynı nesne döner (gereksiz yeniden çizim olmaz);
// gün değişince yeni tarih döner ve ona bağlı hesaplar (bugünün hedefi, takvim, haftalık çubuklar) yenilenir.
// ============================================================================

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function useLiveNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () =>
      setNow((prev) => {
        const next = new Date();
        return dayKey(prev) === dayKey(next) ? prev : next;
      });
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [intervalMs]);

  return now;
}
