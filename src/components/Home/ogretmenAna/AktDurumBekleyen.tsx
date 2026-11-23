// Aşama 375: öğretmen ana sayfası › süresi dolan zümre etkinliği için "yapıldı mı?" satırı (tek satır, sabit boy).
// Aşama 375b: yalnız SORUMLU öğretmende (etkinliğin sınıf düzeyine giren zümre üyesi; veritabanı seçer).
// Kendi zümresinin etkinliği bitince (ay içinde: ayın son günü · tek gün: ertesi gün · birkaç gün: son günün ertesi)
// ve durumu işaretlenmediyse görünür; "İşaretle" ilk bekleyen etkinliğin penceresini açar. E-postadaki bağlantı
// (?akt-durum=1) sayfa açılınca pencereyi kendiliğinden açar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';
import { useAktDurumlar } from '../../Teacher/takvim/useAktDurumlar';
import { baslik, durumBekleyenlerim, durumKey, etkinlikler } from '../../../services/akademikTakvimService';

export function AktDurumBekleyen() {
  const { can, takvimKayit, setAktSecili } = useOgretmenAnaBaglam();
  const harita = useAktDurumlar(!!can.takvim);
  // hangi etkinlikler bende bekliyor: veritabanı söyler (durum ya da takvim değişince yeniden sorulur)
  const [anahtarlar, setAnahtarlar] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!can.takvim || !harita || !takvimKayit) return;
    let canli = true;
    void durumBekleyenlerim().then((k) => canli && setAnahtarlar(k));
    return () => {
      canli = false;
    };
  }, [can.takvim, harita, takvimKayit]);

  const bekleyen = useMemo(() => {
    if (!anahtarlar || !anahtarlar.size || !takvimKayit) return [];
    return etkinlikler(takvimKayit).filter((g) => anahtarlar.has(durumKey(g.tarih, g.ad, g.zumre)));
  }, [anahtarlar, takvimKayit]);

  // e-postadaki "Durumu işaretle" bağlantısı
  const acildi = useRef(false);
  useEffect(() => {
    if (acildi.current || !bekleyen.length) return;
    let p: URLSearchParams;
    try {
      p = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    if (!p.has('akt-durum')) return;
    acildi.current = true;
    p.delete('akt-durum');
    try {
      const q = p.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    } catch {
      /* adres değişmese de olur */
    }
    setAktSecili(bekleyen[0]);
  }, [bekleyen, setAktSecili]);

  if (!bekleyen.length) return null;
  const ilk = bekleyen[0];
  return (
    <div className="od-note alert" id="akt-durum-bekleyen">
      <span className="ic">
        <ClipboardCheck aria-hidden="true" />
      </span>
      <span>
        {bekleyen.length === 1 ? (
          <>
            <b>{baslik(ilk.ad)}</b> etkinliği yapıldı mı? Durumunu işaretleyin.
          </>
        ) : (
          <>
            <b>{bekleyen.length} zümre etkinliğinin</b> durumu bekleniyor (ilki: {baslik(ilk.ad)}).
          </>
        )}
      </span>
      <button type="button" className="ak-btn w-24 primary" id="akt-durum-isaretle" onClick={() => setAktSecili(ilk)}>
        İşaretle
      </button>
    </div>
  );
}
export default AktDurumBekleyen;
