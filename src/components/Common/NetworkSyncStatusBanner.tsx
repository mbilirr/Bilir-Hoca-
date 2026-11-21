import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CloudUpload, RefreshCw, WifiOff } from 'lucide-react';
import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 304: BAĞLANTI DURUMU ŞERİDİ
// - İnternet kesilince ekranın üstünde sade bir şerit: değişikliklerin kaydedilmeyeceği açıkça yazar.
// - Bağlantı gelince "güncelleniyor" görünür; "Veriler güncel" yazısı ancak eşitleme GERÇEKTEN bitince çıkar
//   (eskiden eşitleme başlamadan "Senkronize edildi" yazıyordu).
// - Eşitlemeyi veri servisi kendisi başlatır (internet gelince); şerit yalnız o işin bitmesini bekler, ikinci bir
//   eşitleme başlatmaz.
// ============================================================================

type Durum = 'cevrimdisi' | 'esitleniyor' | 'guncel' | null;

export const NetworkSyncStatusBanner: React.FC = () => {
  const [durum, setDurum] = useState<Durum>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'cevrimdisi' : null,
  );
  const sira = useRef(0); // art arda kesilip gelirse yalnız son bağlantının sonucu gösterilir
  // Aşama 343: bağlantı yokken cihazda bekleyen kayıt sayısı (yoklama, not, ödev kontrolü, soru kaydı)
  const [bekleyen, setBekleyen] = useState<number>(() => dataService.bekleyenKayitSayisi());
  useEffect(() => dataService.bekleyenKayitDinle(setBekleyen), []);

  useEffect(() => {
    let kapat: ReturnType<typeof setTimeout> | null = null;
    const temizle = () => {
      if (kapat) clearTimeout(kapat);
      kapat = null;
    };
    const cevrimdisi = () => {
      sira.current++;
      temizle();
      setDurum('cevrimdisi');
    };
    const cevrimici = () => {
      const benim = ++sira.current;
      temizle();
      setDurum('esitleniyor');
      // Veri servisi internet gelince eşitlemeyi zaten başlattı; bu çağrı süren işi döndürür (yeni iş başlatmaz)
      const bitti = dataService.revalidateAndSyncAll(false).catch(() => undefined);
      // Sunucu çok yavaşsa şerit ekranda asılı kalmaz
      const sure = new Promise<void>((z) => setTimeout(z, 20_000));
      void Promise.race([bitti, sure]).then(() => {
        if (benim !== sira.current) return;
        setDurum('guncel');
        kapat = setTimeout(() => {
          if (benim === sira.current) setDurum(null);
        }, 3000);
      });
    };
    window.addEventListener('online', cevrimici);
    window.addEventListener('offline', cevrimdisi);
    return () => {
      temizle();
      window.removeEventListener('online', cevrimici);
      window.removeEventListener('offline', cevrimdisi);
    };
  }, []);

  // Aşama 343: bağlantı var ama bekleyen kayıt henüz gitmediyse (sunucuya ulaşılamıyor) şerit açık kalır
  const gorunen: Durum | 'bekliyor' = durum === 'cevrimdisi' ? durum : bekleyen > 0 ? 'bekliyor' : durum;
  if (!gorunen) return null;

  const icerik =
    gorunen === 'cevrimdisi' ? (
      <>
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden />
        <span className="font-semibold">İnternet bağlantısı yok</span>
        {bekleyen > 0 ? (
          <span className="opacity-75">· {bekleyen} kayıt cihazda bekliyor</span>
        ) : (
          <span className="hidden sm:inline opacity-75">· Yoklama, not ve ödev kontrolü cihazda bekler, bağlantı gelince gönderilir</span>
        )}
      </>
    ) : gorunen === 'bekliyor' ? (
      <>
        <CloudUpload className="w-4 h-4 shrink-0" aria-hidden />
        <span className="font-semibold">{bekleyen} kayıt gönderilmeyi bekliyor</span>
        <span className="hidden sm:inline opacity-75">· sunucuya ulaşılınca kendiliğinden gönderilir</span>
      </>
    ) : gorunen === 'esitleniyor' ? (
      <>
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
        <span className="font-semibold">Bağlantı geldi</span>
        <span className="opacity-75">· güncelleniyor</span>
      </>
    ) : (
      <>
        <CheckCircle2 className="w-4 h-4 shrink-0 text-success" aria-hidden />
        <span className="font-semibold">Veriler güncel</span>
      </>
    );

  return (
    <div
      id={gorunen === 'cevrimdisi' || gorunen === 'bekliyor' ? 'offline-sync-alert-banner' : 'online-sync-success-toast'}
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-(--z-bildirim) max-w-[calc(100vw-2rem)] flex items-center gap-2 whitespace-nowrap rounded-full bg-fg text-canvas text-xs px-4 py-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {icerik}
    </div>
  );
};
