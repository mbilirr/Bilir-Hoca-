import React, { useEffect, useMemo, useState } from 'react';
import { Tatil, tatilEkle } from '../../services/dersService';
import { AkSheet } from './AnaSayfaKabuk';

// Aşama 245 (246'da ayrı dosyaya alındı: kurum yöneticisi ve müdür ana sayfası aynı paneli kullanır)
// ---------------------------------------------------------------------------
// Tatil ekle (Yönetim › Ders programı › Ders saatleri'ndeki tatil günleriyle aynı kayıt)
// ---------------------------------------------------------------------------
export const AkTatilSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  tatiller: Tatil[];
  bugun: string;
  onKayit: () => void;
  onMesaj: (m: { ton: 'ok' | 'hata'; text: string }) => void;
}> = ({ open, onClose, tatiller, bugun, onKayit, onMesaj }) => {
  const [ad, setAd] = useState('');
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState('');
  useEffect(() => {
    if (open) {
      setAd('');
      setBas('');
      setBit('');
      setHata('');
    }
  }, [open]);
  // Ardışık günler tek satır: "25 Oca – 5 Şub · Yarıyıl tatili"
  const araliklar = useMemo(() => {
    const s = [...tatiller].sort((a, b) => a.tarih.localeCompare(b.tarih));
    const out: Array<{ bas: string; bit: string; aciklama: string; gun: number }> = [];
    const ertesi = (t: string) => {
      const d = new Date(t + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    };
    s.forEach((t) => {
      const son = out[out.length - 1];
      if (son && son.aciklama === t.aciklama && ertesi(son.bit) === t.tarih) {
        son.bit = t.tarih;
        son.gun++;
      } else out.push({ bas: t.tarih, bit: t.tarih, aciklama: t.aciklama, gun: 1 });
    });
    return out;
  }, [tatiller]);
  const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const gecerli = !!bas && !!(bit || bas) && (bit || bas) >= bas && ad.trim().length > 1;
  const ekle = async () => {
    if (busy) return;
    const son = bit || bas;
    if (!bas || son < bas) return setHata('Bitiş, başlangıçtan önce olamaz.');
    if (!ad.trim()) return setHata('Tatilin adını yazın.');
    setBusy(true);
    setHata('');
    try {
      const n = await tatilEkle(bas, son, ad.trim());
      onMesaj({ ton: 'ok', text: `${n || 'Tatil'} gün tatil olarak eklendi.` });
      setAd('');
      setBas('');
      setBit('');
      onKayit();
    } catch (e: any) {
      setHata(e?.message || 'Eklenemedi.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AkSheet
      open={open}
      onClose={onClose}
      locked={busy}
      kicker="Kurulum"
      title="Tatil günü ekle"
      desc="Tatil günlerinde ders yoklaması istenmez, gecikme sayılmaz."
      footer={
        <>
          <span className="cnt tnum">{araliklar.length ? `${tatiller.length} gün kayıtlı` : ''}</span>
          <button type="button" className="ak-btn w-24" onClick={onClose} disabled={busy}>
            Kapat
          </button>
          <button type="button" className="ak-btn dark" onClick={ekle} disabled={busy || !gecerli}>
            {busy ? 'Ekleniyor' : 'Ekle'}
          </button>
        </>
      }
    >
      <div className="ak-fgrid">
        <label className="ak-fld full">
          Ad
          <input className="ak-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Yarıyıl tatili" maxLength={80} />
        </label>
        <label className="ak-fld">
          Başlangıç
          <input className="ak-inp" type="date" value={bas} min={bugun} onChange={(e) => setBas(e.target.value)} />
        </label>
        <label className="ak-fld">
          Bitiş
          <input className="ak-inp" type="date" value={bit} min={bas || bugun} onChange={(e) => setBit(e.target.value)} />
        </label>
        {hata && <p className="ak-err full">{hata}</p>}
      </div>
      {araliklar.length ? (
        araliklar.map((t) => (
          <div className="ak-frow" key={t.bas}>
            <span className="w">
              <b>{t.aciklama || 'Tatil'}</b>
              <span>
                {t.bas === t.bit ? f(t.bas) : `${f(t.bas)} – ${f(t.bit)}`} · {t.gun} gün
              </span>
            </span>
            <span className="ak-oktag">Kayıtlı</span>
          </div>
        ))
      ) : (
        <p className="ak-hint">Bugünden sonrası için girilmiş tatil yok.</p>
      )}
    </AkSheet>
  );
};
