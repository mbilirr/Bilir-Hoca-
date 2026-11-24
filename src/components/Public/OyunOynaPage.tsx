import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Gamepad2, Trophy, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';
import { cx } from '../ui/kit';
import { OyunHatasi, kalanYazi, oyunCagri, type OyunBilgi, type OyunEkrani, type OyunOzet, type SinifOgrenci } from './oyun/istek';

// ============================================================================
// GİRİŞSİZ OYUN SAYFASI (Aşama 381)
// Öğretmenin verdiği bağlantı (…/?oyun=…) bu sayfayı açar. İki tür bağlantı vardır:
//  · kişisel: bağlantı tek öğrenciye aittir, doğrudan oyuna girer
//  · sınıf (QR): öğrenci listeden kendi adını seçer
// Sunucu her istekte bağlantı imzasını, oyunun açık olup olmadığını ve öğrencinin sınıfını denetler;
// doğru cevaplar ve çark kelimesi cevap verilmeden tarayıcıya gelmez.
// ============================================================================
const QuizOyunu = React.lazy(() => import('./oyun/QuizOyunu').then((m) => ({ default: m.QuizOyunu })));
const CarkOyunu = React.lazy(() => import('./oyun/CarkOyunu').then((m) => ({ default: m.CarkOyunu })));

const MOD_AD = { quiz: 'Soru yarışı', cark: 'Kelime çarkı' } as const;
const secimAnahtari = (token: string) => `oyun-ogrenci:${token.slice(0, 40)}`;
const okuSecim = (token: string) => {
  try {
    return sessionStorage.getItem(secimAnahtari(token));
  } catch {
    return null;
  }
};
const yazSecim = (token: string, id: string | null) => {
  try {
    if (id) sessionStorage.setItem(secimAnahtari(token), id);
    else sessionStorage.removeItem(secimAnahtari(token));
  } catch {
    /* gizli sekme: seçim hatırlanmaz */
  }
};

const Kutu: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="ui-card space-y-4 p-5">{children}</div>;

export const OyunOynaPage: React.FC<{ token: string }> = ({ token }) => {
  const [bilgi, setBilgi] = useState<(OyunBilgi & { kisisel: boolean; ogrenci?: { id: string; ad: string }; ogrenciler?: SinifOgrenci[] }) | null>(null);
  const [hata, setHata] = useState<{ mesaj: string; kod: string } | null>(null);
  const [ogrenciId, setOgrenciId] = useState<string | null>(null);
  const [ekran, setEkran] = useState<OyunEkrani | null>(null);
  const [ad, setAd] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [adimHata, setAdimHata] = useState<string | null>(null);

  const hataYaz = (e: unknown) => setHata({ mesaj: e instanceof Error ? e.message : 'Bir sorun oluştu.', kod: e instanceof OyunHatasi ? e.kod : '' });

  useEffect(() => {
    document.title = 'Oyun';
    oyunCagri<any>(token, 'bilgi')
      .then((b) => {
        setBilgi({ ...b.oyun, kisisel: !!b.kisisel, ogrenci: b.ogrenci, ogrenciler: b.ogrenciler });
        document.title = b.oyun.ad;
        if (b.ogrenci) setOgrenciId(b.ogrenci.id);
        else {
          const hatirla = okuSecim(token);
          if (hatirla && (b.ogrenciler || []).some((s: SinifOgrenci) => s.id === hatirla)) setOgrenciId(hatirla);
        }
      })
      .catch(hataYaz);
  }, [token]);

  const basla = useCallback(
    async (id: string) => {
      setMesgul(true);
      setAdimHata(null);
      try {
        const g = await oyunCagri<OyunEkrani & { ogrenci: { id: string; ad: string } }>(token, 'basla', { studentId: id });
        setAd(g.ogrenci.ad);
        setEkran(g);
        if (!bilgi?.kisisel) yazSecim(token, id);
      } catch (e) {
        if (e instanceof OyunHatasi && (e.kod === 'kapali' || e.kod === 'doldu')) hataYaz(e);
        else setAdimHata(e instanceof Error ? e.message : 'Oyun açılamadı.');
        setOgrenciId(null);
        yazSecim(token, null);
      } finally {
        setMesgul(false);
      }
    },
    [token, bilgi?.kisisel]
  );

  // sınıf bağlantısında hatırlanan öğrenci doğrudan açılır
  const [otoDenendi, setOtoDenendi] = useState(false);
  useEffect(() => {
    if (!bilgi || bilgi.kisisel || !ogrenciId || otoDenendi || ekran) return;
    setOtoDenendi(true);
    void basla(ogrenciId);
  }, [bilgi, ogrenciId, otoDenendi, ekran, basla]);

  const bitir = useCallback((o: OyunOzet) => setEkran({ tur: 'bitti', sonuc: o }), []);

  const kapsayici = (icerik: React.ReactNode) => (
    <div className="min-h-screen bg-canvas text-fg" id="oyun-sayfa">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-fg">
            <Gamepad2 className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-fg">{bilgi ? bilgi.ad : 'Oyun'}</h1>
            <p className="truncate text-xs text-muted">{bilgi ? [MOD_AD[bilgi.mod], bilgi.sinif, ad].filter(Boolean).join(' · ') : 'biliredu'}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-5 pb-16">{icerik}</main>
    </div>
  );

  if (hata) {
    const bitmis = hata.kod === 'kapali' || hata.kod === 'doldu';
    return kapsayici(
      <div role="alert" id="oyun-hata" className="ui-card flex items-start gap-3 p-5">
        <AlertCircle className={cx('mt-0.5 w-5 h-5 shrink-0', bitmis ? 'text-warning-fg' : 'text-danger-fg')} aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-fg">{hata.mesaj}</p>
          <p className="text-xs text-muted">{bitmis ? 'Yeni bir bağlantı için öğretmenine haber ver.' : 'Sorun sürerse öğretmeninden yeni bir bağlantı iste.'}</p>
        </div>
      </div>
    );
  }
  if (!bilgi) {
    return kapsayici(
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
        <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
        Oyun yükleniyor…
      </div>
    );
  }

  if (ekran?.tur === 'bitti') {
    const s = ekran.sonuc;
    return kapsayici(
      <Kutu>
        <div className="space-y-3 text-center" id="oyun-bitti">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-soft text-success-fg">
            <Trophy className="w-7 h-7" aria-hidden />
          </span>
          <h2 className="text-lg font-bold text-fg">Oyun tamamlandı{ad ? `, ${ad}` : ''}!</h2>
          <p className="text-4xl font-bold tabular-nums text-fg">{s.puan}</p>
          <p className="text-sm text-muted">
            puan · {s.toplam} {bilgi.mod === 'cark' ? 'kelimeden' : 'sorudan'} {s.dogru} tanesini bildin
          </p>
          <p className="text-xs text-success-fg">
            <CheckCircle2 className="mr-1 inline w-3.5 h-3.5 align-[-0.15em]" aria-hidden />
            Sonucun öğretmenine iletildi. Her öğrenci oyunu bir kez oynar.
          </p>
        </div>
      </Kutu>
    );
  }
  if (ekran?.tur === 'quiz' && ogrenciId) {
    return kapsayici(
      <React.Suspense fallback={null}>
        <QuizOyunu token={token} studentId={ogrenciId} ilk={ekran} onBitti={bitir} />
      </React.Suspense>
    );
  }
  if (ekran?.tur === 'cark' && ogrenciId) {
    return kapsayici(
      <React.Suspense fallback={null}>
        <CarkOyunu token={token} studentId={ogrenciId} ilk={ekran} onBitti={bitir} />
      </React.Suspense>
    );
  }

  const kalan = kalanYazi(bilgi.bitis);
  const oyunNotu = bilgi.mod === 'quiz' ? `${bilgi.soruSayisi} soru · her soru için ${bilgi.sureSn} sn · hızlı doğru cevap daha çok puan` : `${bilgi.soruSayisi} kelime · çarkı çevir, harf seç, kelimeyi bul`;

  // kişisel bağlantı: tek düğme
  if (bilgi.kisisel && bilgi.ogrenci) {
    return kapsayici(
      <Kutu>
        <div className="space-y-1">
          <p className="text-base font-semibold text-fg">Merhaba {bilgi.ogrenci.ad}!</p>
          <p className="text-sm text-muted">{oyunNotu}</p>
          {kalan && <p className="text-xs text-subtle">Bağlantı {kalan} daha açık. Oyunu bir kez oynayabilirsin.</p>}
        </div>
        {adimHata && (
          <p role="alert" className="text-xs text-danger-fg">
            {adimHata}
          </p>
        )}
        <Button genislik="uzun" onClick={() => void basla(bilgi.ogrenci!.id)} isLoading={mesgul}>
          Oyuna başla
        </Button>
      </Kutu>
    );
  }

  // sınıf bağlantısı: adını seç
  const liste = bilgi.ogrenciler || [];
  return kapsayici(
    <Kutu>
      <div className="space-y-1">
        <p className="text-base font-semibold text-fg">Adını seç</p>
        <p className="text-sm text-muted">{oyunNotu}</p>
        {kalan && <p className="text-xs text-subtle">Bağlantı {kalan} daha açık. Herkes oyunu bir kez oynar.</p>}
      </div>
      {adimHata && (
        <p role="alert" className="text-xs text-danger-fg">
          {adimHata}
        </p>
      )}
      {liste.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">Bu sınıfta listelenecek öğrenci yok.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" id="oyun-ogrenciler">
          {liste.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={mesgul}
                onClick={() => {
                  setOgrenciId(s.id);
                  void basla(s.id);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <UserRound className="w-4 h-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{s.ad}</span>
                {s.durum === 'bitti' && <span className="shrink-0 rounded-lg bg-success-soft px-1.5 py-0.5 text-2xs font-semibold text-success-fg">Oynadı</span>}
                {s.durum === 'suruyor' && <span className="shrink-0 rounded-lg bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning-fg">Devam</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Kutu>
  );
};
