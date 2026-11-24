// Aşama 386: TABLO ANLIK SİNYALİ (ortak kanca)
//  Aşama 349c'deki deneme sinyalinin genel hali: verilen tablolardan biri değişince veritabanı içeriksiz bir sinyal yazar
//  (canli_sinyal, kurumun ya da kişinin kanalı). Kanca bir sayı döndürür; ekran onu okuma etkisine bağımlılık olarak
//  ekler ve sinyal gelince (kısa beklemeyle tek sefer) yeniden okur. Arka plandaki sekme çizilmez, dönüşte bir kez okur.
//  SQL kurulu değilse sayı hiç artmaz; ekranlar kendi okumalarıyla aynen çalışır.
//  `tablolar` modül düzeyinde sabit bir dizi olmalıdır (her çizimde yeni dizi verilirse dinleme yeniden kurulur).
import { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';

export function useTabloSurumu(tablolar: readonly string[], aktif = true, bekleMs = 1500): number {
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
    const birak = dataService.tabloDinle(tablolar, () => {
      if (zaman) clearTimeout(zaman);
      zaman = setTimeout(() => {
        zaman = null;
        artir();
      }, bekleMs);
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
  }, [tablolar, aktif, bekleMs]);
  return surum;
}
