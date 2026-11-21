// Aşama 349c: DENEME ANLIK SİNYALİ
//  Deneme kaydı ya da sonucu değişince (sonuç yüklendi, yayımlandı, yayımı kalktı, düzeltildi) veritabanı içeriksiz bir
//  sinyal yazar (sql/349c; kurumun kanalına, yayımlı denemede sonucu olan öğrencinin kendi kanalına). Ekranlar bu sayıyı
//  okuma etkilerine bağımlılık olarak ekler: sinyal gelince (kısa beklemeyle tek sefer) yeniden okurlar.
//  SQL kurulu değilse sayı hiç artmaz; ekranların 5 dakikalık ve sekmeye dönüşteki okuması aynen sürer.
import { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';

const TABLOLAR = ['deneme_exams', 'deneme_results'] as const;
const BEKLE_MS = 1500; // toplu sonuç yüklemesinde art arda gelen sinyaller tek okumaya iner

export function useDenemeSurumu(aktif = true): number {
  const [surum, setSurum] = useState(0);
  useEffect(() => {
    if (!aktif) return;
    let zaman: ReturnType<typeof setTimeout> | null = null;
    let bekliyor = false;
    const artir = () => {
      // arka plandaki sekme çizilmez; dönüşte bir kez
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        bekliyor = true;
        return;
      }
      setSurum((n) => n + 1);
    };
    const birak = dataService.tabloDinle(TABLOLAR, () => {
      if (zaman) clearTimeout(zaman);
      zaman = setTimeout(() => {
        zaman = null;
        artir();
      }, BEKLE_MS);
    });
    const gorunur = () => {
      if (bekliyor && document.visibilityState === 'visible') {
        bekliyor = false;
        setSurum((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', gorunur);
    return () => {
      birak();
      if (zaman) clearTimeout(zaman);
      document.removeEventListener('visibilitychange', gorunur);
    };
  }, [aktif]);
  return surum;
}
