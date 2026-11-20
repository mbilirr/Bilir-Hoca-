import React, { useEffect, useState } from 'react';
import { Check, Copy, Loader2, ShieldCheck } from 'lucide-react';
import { ikiAdimAcik, ikiAdimBaslat, ikiAdimKapat, ikiAdimTamamla, ikiAdimVazgec, type IkiAdimKurulum } from '../../lib/ikiAdim';
import { KodKutusu } from '../ui/KodKutusu';

// ============================================================================
// Aşama 294: İki adımlı giriş — açma / kapatma (yalnız sistem sahibi; Yönetim › Yedek ve bakım)
// Aç: QR kodu kod uygulamasına okutulur, uygulamadaki ilk kod girilince açılır.
// Kapat: güncel kod istenir (oturumu açık kalmış bilgisayardan başkası kapatamasın).
// ============================================================================
type Asama = 'okunuyor' | 'kapali' | 'kurulum' | 'acik' | 'kapatma';

export const IkiAdimPanel: React.FC = () => {
  const [asama, setAsama] = useState<Asama>('okunuyor');
  const [kurulum, setKurulum] = useState<IkiAdimKurulum | null>(null);
  const [kod, setKod] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [kopya, setKopya] = useState(false);

  useEffect(() => {
    let canli = true;
    ikiAdimAcik()
      .then((a) => canli && setAsama(a ? 'acik' : 'kapali'))
      .catch((e) => canli && (setHata(e?.message || 'Durum okunamadı.'), setAsama('kapali')));
    return () => {
      canli = false;
    };
  }, []);

  const calis = async (is: () => Promise<void>) => {
    if (mesgul) return;
    setMesgul(true);
    setHata(null);
    setBilgi(null);
    try {
      await is();
    } catch (e: any) {
      setHata(e?.message || 'İşlem yapılamadı.');
      setKod('');
    } finally {
      setMesgul(false);
    }
  };

  const baslat = () =>
    calis(async () => {
      setKurulum(await ikiAdimBaslat());
      setKod('');
      setAsama('kurulum');
    });
  const tamamla = (deger: string) =>
    calis(async () => {
      if (!kurulum) return;
      await ikiAdimTamamla(kurulum.factorId, deger);
      setKurulum(null);
      setKod('');
      setAsama('acik');
      setBilgi('İki adımlı giriş açıldı. Bundan sonra girişte şifreden sonra kod sorulur.');
    });
  const vazgec = () =>
    calis(async () => {
      if (kurulum) await ikiAdimVazgec(kurulum.factorId);
      setKurulum(null);
      setKod('');
      setAsama('kapali');
    });
  const kapat = (deger: string) =>
    calis(async () => {
      await ikiAdimKapat(deger);
      setKod('');
      setAsama('kapali');
      setBilgi('İki adımlı giriş kapatıldı. Giriş yalnız şifreyle yapılır.');
    });

  const kopyala = async () => {
    if (!kurulum) return;
    try {
      await navigator.clipboard.writeText(kurulum.gizli);
      setKopya(true);
      setTimeout(() => setKopya(false), 1500);
    } catch {
      /* pano kapalıysa anahtar zaten ekranda yazıyor */
    }
  };

  const acik = asama === 'acik' || asama === 'kapatma';

  return (
    <section id="iki-adim-panel" className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-lg space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/25 text-brand-fg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fg flex items-center gap-2">
              İki Adımlı Giriş
              {asama !== 'okunuyor' && <span className={`ui-chip ${acik ? 'ui-chip-success' : ''}`}>{acik ? 'Açık' : 'Kapalı'}</span>}
            </h2>
            <p className="text-xs text-muted">Sistem sahibi hesabı: şifreden sonra telefondaki kod uygulamasının 6 haneli kodu sorulur.</p>
          </div>
        </div>
        {asama === 'okunuyor' && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
        {asama === 'kapali' && (
          <button type="button" id="iki-adim-ac" className="ui-btn ui-btn-primary ui-btn-sm w-28 justify-center" disabled={mesgul} onClick={() => void baslat()}>
            {mesgul ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aç'}
          </button>
        )}
        {asama === 'acik' && (
          <button
            type="button"
            id="iki-adim-kapat"
            className="ui-btn ui-btn-secondary ui-btn-sm w-28 justify-center"
            onClick={() => {
              setKod('');
              setHata(null);
              setBilgi(null);
              setAsama('kapatma');
            }}
          >
            Kapat
          </button>
        )}
      </div>

      {hata && <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{hata}</p>}
      {bilgi && <p role="status" className="text-xs font-semibold text-success-fg bg-success-soft rounded-xl px-3 py-2">{bilgi}</p>}

      {asama === 'kurulum' && kurulum && (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-start border-t border-line pt-4">
          <img src={kurulum.qr} alt="Kod uygulamasına okutulacak QR kodu" width={168} height={168} className="w-42 h-42 rounded-xl bg-white p-2 border border-line mx-auto" />
          <div className="space-y-3 min-w-0">
            <ol className="text-sm text-fg-2 space-y-1.5 list-decimal pl-5">
              <li>Telefonunuzda bir kod uygulaması açın (Google Authenticator, Microsoft Authenticator…).</li>
              <li>Uygulamada "hesap ekle"ye basıp bu QR kodu okutun.</li>
              <li>Uygulamada görünen 6 haneli kodu aşağıya yazın.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>QR okutulamıyorsa anahtar:</span>
              <code className="px-2 py-1 rounded-lg bg-surface-2 border border-line text-fg font-mono break-all">{kurulum.gizli}</code>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-8 !px-0 justify-center" onClick={() => void kopyala()} aria-label="Anahtarı kopyala" title="Kopyala">
                {kopya ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <form
              className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                void tamamla(kod);
              }}
            >
              <div className="col-span-2 flex justify-center sm:block">
                <KodKutusu id="iki-adim-kurulum-kod" value={kod} onChange={setKod} onTam={(v) => void tamamla(v)} disabled={mesgul} autoFocus hata={!!hata} />
              </div>
              <button type="submit" className="ui-btn ui-btn-primary w-full sm:w-28 h-11 justify-center" disabled={mesgul || kod.length !== 6}>
                {mesgul ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Doğrula'}
              </button>
              <button type="button" className="ui-btn ui-btn-secondary w-full sm:w-28 h-11 justify-center" disabled={mesgul} onClick={() => void vazgec()}>
                Vazgeç
              </button>
            </form>
            <p className="text-xs text-warning-fg">
              Telefonunuzu kaybederseniz girişi Supabase üzerinden siz açarsınız (yolu KURULUM-294 dosyasında). Anahtarı güvenli bir yere not edin.
            </p>
          </div>
        </div>
      )}

      {asama === 'kapatma' && (
        <form
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void kapat(kod);
          }}
        >
          <p className="col-span-2 w-full text-sm text-fg-2">Kapatmak için uygulamadaki güncel kodu girin.</p>
          <div className="col-span-2 flex justify-center sm:block">
            <KodKutusu id="iki-adim-kapat-kod" value={kod} onChange={setKod} disabled={mesgul} autoFocus hata={!!hata} />
          </div>
          <button type="submit" className="ui-btn ui-btn-primary w-full sm:w-28 h-11 justify-center" disabled={mesgul || kod.length !== 6}>
            {mesgul ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kapat'}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary w-full sm:w-28 h-11 justify-center" disabled={mesgul} onClick={() => (setKod(''), setHata(null), setAsama('acik'))}>
            Vazgeç
          </button>
        </form>
      )}
    </section>
  );
};
