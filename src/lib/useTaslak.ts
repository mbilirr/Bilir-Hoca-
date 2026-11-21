import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataService } from '../services/dataService';
import { taslakAnahtari, taslakOku, taslakSil, taslakYaz, type Taslak } from './taslak';

/**
 * Aşama 344: formun yazılanlarını taslak olarak tutar.
 *  - ad: formun adı (ör. 'odev_yeni', `etut_${id}`); null ise taslak tutulmaz
 *  - deger: formun o anki değerleri (useMemo ile verin)
 *  - dolu: formda saklanmaya değer bir şey var mı (çoğunlukla "dirty")
 * Açılışta önceki taslak varsa `bulunan` dolu gelir; form "Geri yükle / Sil" sorar (TaslakCubugu).
 * Karar verilmeden form boş kaldıkça eski taslak silinmez. Kayıt başarılı olunca ya da form bilerek silinince temizle().
 */
export function useTaslak<T>(ad: string | null, deger: T, dolu: boolean) {
  const anahtar = useMemo(() => taslakAnahtari(dataService.getAuthSession()?.user.id, ad), [ad]);
  const [bulunan, setBulunan] = useState<Taslak<T> | null>(() => taslakOku<T>(anahtar));
  const bulunanRef = useRef(bulunan);
  bulunanRef.current = bulunan;
  const doluRef = useRef(dolu);
  doluRef.current = dolu;
  const bekleyen = useRef<{ deger: T; dolu: boolean } | null>(null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anahtarRef = useRef(anahtar);
  anahtarRef.current = anahtar;

  const simdiYaz = useCallback(() => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
    const b = bekleyen.current;
    bekleyen.current = null;
    // Oturum kapandıysa yazılmaz: elle çıkışta taslaklar silinir, sayfa kapanırken geri yazılmasın
    if (!b || !anahtarRef.current || !dataService.getAuthSession()) return;
    if (b.dolu) taslakYaz(anahtarRef.current, b.deger);
    else if (!bulunanRef.current) taslakSil(anahtarRef.current);
  }, []);

  useEffect(() => {
    if (!anahtar) return;
    bekleyen.current = { deger, dolu };
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(simdiYaz, 400);
  }, [anahtar, deger, dolu, simdiYaz]);

  // Sekme kapanırken ya da form kapanınca son yazılanlar da saklanır
  useEffect(() => {
    window.addEventListener('pagehide', simdiYaz);
    return () => {
      window.removeEventListener('pagehide', simdiYaz);
      simdiYaz();
    };
  }, [simdiYaz]);

  /** Bulunan taslağın değerini verir; form bunu kendi alanlarına yazar. */
  const geriYukle = useCallback((): T | null => {
    const t = bulunanRef.current;
    setBulunan(null);
    return t ? t.deger : null;
  }, []);

  /** Bulunan taslaktan vazgeçilir (Sil). */
  const vazgec = useCallback(() => {
    setBulunan(null);
    bulunanRef.current = null;
    if (!doluRef.current) taslakSil(anahtarRef.current);
  }, []);

  /** Kayıt başarılı oldu ya da form bilerek silindi: taslak kalmaz. */
  const temizle = useCallback(() => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
    bekleyen.current = null;
    bulunanRef.current = null;
    setBulunan(null);
    taslakSil(anahtarRef.current);
  }, []);

  return { bulunan, geriYukle, vazgec, temizle };
}
