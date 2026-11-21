import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dataService, type VeriKonusu } from '../services/dataService';

// ============================================================================
// Veri değişince yeniden çiz (Aşama 29)
// dataService (Supabase eşitlemesi, gerçek zamanlı güncelleme, yerel kayıt) her değiştiğinde
// sayıyı artırır. Bu sayıyı bağımlılık olarak kullanan hesaplar anında yenilenir; böylece
// aynı sayfadaki tüm duvarlar aynı veriden, aynı anda beslenir.
// Aşama 349b: `konular` verilirse yalnız o veriler (ya da konusu belirsiz genel bir şey) değişince artar.
// Bileşenin okuduğu bütün konular yazılmalı; scripts/sayfa-konulari.mjs eksik konuyu yakalar.
// ============================================================================

export function useDataVersion(konular?: readonly VeriKonusu[]): number {
  const [version, setVersion] = useState(0);
  const anahtar = konular ? konular.join(',') : '*';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => dataService.subscribe(() => setVersion((v) => v + 1), konular), [anahtar]);
  return version;
}

/**
 * Aşama 349b: seçici abonelik. `oku` yalnız SAYI / METİN / DOĞRULUK gibi basit bir değer döndürmeli (ya da değişmedikçe
 * aynı kalan bir nesne). Bileşen yalnız bu değer değişince yeniden çizilir; ör. okunmamış mesaj sayısı aynı kaldıkça
 * gelen yeni yoklama ya da soru kaydı ekranı yeniden çizdirmez.
 */
export function useVeriSecici<T>(konular: readonly VeriKonusu[], oku: () => T): T {
  const okuRef = useRef(oku);
  okuRef.current = oku;
  const anahtar = konular.join(',');
  const abone = useCallback(
    (degisti: () => void) => dataService.subscribe(() => degisti(), konular),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anahtar]
  );
  return useSyncExternalStore(abone, () => okuRef.current());
}
