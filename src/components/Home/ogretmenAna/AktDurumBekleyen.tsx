// Aşama 375: öğretmen ana sayfası › süresi dolan zümre etkinliği için "yapıldı mı?" satırı (tek satır, sabit boy).
// Kendi zümresinin etkinliği bitince (ay içinde: ayın son günü · tek gün: ertesi gün · birkaç gün: son günün ertesi)
// ve durumu işaretlenmediyse görünür; "İşaretle" ilk bekleyen etkinliğin penceresini açar. E-postadaki bağlantı
// (?akt-durum=1) sayfa açılınca pencereyi kendiliğinden açar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useOgretmenAnaBaglam } from './useOgretmenAnaSayfa';
import { useAktDurumlar } from '../../Teacher/takvim/useAktDurumlar';
import { baslik, benimZumrelerim, bugun, buyuk, durumBul, etkinlikler, gunEkle, soruGunu, tarihYaz } from '../../../services/akademikTakvimService';

const GERI_GUN = 30; // bu kadar gün önce sorulmuş ve hâlâ işaretlenmemiş olanlar da listede kalır

export function AktDurumBekleyen() {
  const { can, takvimKayit, setAktSecili } = useOgretmenAnaBaglam();
  const harita = useAktDurumlar(!!can.takvim);
  const [zumrelerim, setZumrelerim] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!can.takvim) return;
    let canli = true;
    void benimZumrelerim().then((z) => canli && setZumrelerim(z));
    return () => {
      canli = false;
    };
  }, [can.takvim]);

  const bekleyen = useMemo(() => {
    if (!harita || !zumrelerim || !zumrelerim.size || !takvimKayit) return [];
    const bugunS = tarihYaz(bugun());
    const enEski = tarihYaz(gunEkle(bugun(), -GERI_GUN));
    return etkinlikler(takvimKayit).filter((g) => {
      if (!g.zumre || !zumrelerim.has(buyuk(g.zumre))) return false;
      const s = soruGunu(g);
      return s <= bugunS && s >= enEski && !durumBul(harita, g).durum;
    });
  }, [harita, zumrelerim, takvimKayit]);

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
