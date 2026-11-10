import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { Bekleyen, bekleyenlerim, dersCanliDinle, trBugun } from '../../services/dersService';

// ============================================================================
// Aşama 220: ÖĞRETMEN ANA SAYFASI — tek satır "8C · 3. ders yoklaması bekliyor".
// Yalnız başlamış ve yoklaması alınmamış kendi dersleri (son 7 gün, veritabanı ders_bekleyenlerim).
// Bekleyen yoksa hiçbir şey çizmez; yoklama alınınca canlı kaybolur. İdare özetine gitmez.
// 217 SQL kurulu değilse sessizce gizlenir (ana sayfa bozulmaz).
// ============================================================================

export const DersBekleyenSatiri: React.FC<{ onAc: (b: Bekleyen) => void }> = ({ onAc }) => {
  const kurumId = dataService.getMyKurum().kurumId;
  const [liste, setListe] = useState<Bekleyen[]>([]);

  const yukle = useCallback(async () => {
    try {
      setListe(await bekleyenlerim());
    } catch {
      setListe([]);
    }
  }, []);

  useEffect(() => {
    if (!kurumId) return;
    void yukle();
    // Ders başlayınca satır kendiliğinden gelsin: 5 dakikada bir (yalnız sayfa açıkken)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void yukle();
    }, 5 * 60_000);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_tatil'], () => void yukle()); // Aşama 231: tatil
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [kurumId, yukle]);

  if (!liste.length) return null;
  const ilk = liste[0];
  const bugun = trBugun(); // Aşama 234: Türkiye günü (sunucu saati)
  const gunYazi = ilk.tarih === bugun ? '' : ' (önceki gün)';
  const diger = liste.length - 1;

  return (
    <button
      type="button"
      id="home-ders-bekleyen"
      onClick={() => onAc(ilk)}
      className="w-full flex items-center gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-left text-xs text-warning-fg hover:border-warning transition-colors"
    >
      <ClipboardCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate font-semibold">
        {ilk.classAd} · {ilk.sira}. ders yoklaması bekliyor{gunYazi}
        {diger > 0 && <span className="font-normal"> · +{diger} ders daha</span>}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
    </button>
  );
};
