import { useEffect, useRef, useState } from 'react';

// ============================================================================
// "Yeni bilgi az önce geldi" parlaması (Aşama 29)
// Sayı ARTTIĞINDA (sayfa açıkken yeni bir kayıt geldiğinde) true döner ve süre dolunca
// kendiliğinden false olur. Sayfa açıldıktan sonraki ilk birkaç saniye (buluttan ilk eşitleme
// gelirken) parlama yapılmaz; açılışta var olan okunmamış kayıtlar zaten satır satır yan-sön ile gösterilir.
// ============================================================================

export function useArrivalFlash(count: number, durationMs = 8000, warmupMs = 5000): boolean {
  const prev = useRef<number | null>(null);
  const mountedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const warmedUp = Date.now() - mountedAt.current >= warmupMs;
    if (prev.current !== null && count > prev.current && warmedUp) {
      setFlash(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(false), durationMs);
    }
    prev.current = count;
  }, [count, durationMs, warmupMs]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return flash;
}
