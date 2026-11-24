// ============================================================================
// Aşama 396: KENDİN OYNA — öğrenci öğretmen beklemeden okulun soru bankasından oyun kurar ve oynar.
//   1) Başla: seri, en iyi puan, bu hafta doğru oranı; zorlandığı konu önerisi; tür (Çalışma, Meydan okuma, Kelime çarkı,
//      Bulmaca), ders, konu (soru sayısıyla), zorluk, sayı; "Tekrar oyna" son ayarla.
//   2) Oyun: öğretmen oyunlarıyla aynı motor (Çalışma modu süresiz; yanlışta doğru şık ve açıklama).
//   3) Sonuç: puan / doğru sayısı, kişisel rekor, seri, yanlışların doğru cevabı; "Yanlışları tekrar" / "Yeni oyun".
// Sorular sunucuda seçilir; doğru cevap oyun sırasında tarayıcıya gitmez. Öğretmen bu oyunları listesinde görmez.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Award, Check, Flame, RotateCcw, Sparkles, Target, Trophy } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { oyunCagri, type OyunEkrani } from '../../Public/oyun/istek';
import {
  ROZETLER,
  SERBEST_MODLAR,
  siradakiSeri,
  SERBEST_SAYILAR,
  serbestBaslat,
  serbestBilgi,
  serbestDersler,
  serbestKonular,
  serbestSayi,
  serbestSonuc,
  serbestTur,
  type SerbestAyar,
  type SerbestBilgi,
  type SerbestMod,
  type SerbestSonuc,
  type SerbestZorluk,
} from '../../../services/oyunOgrenciService';

const Gelisimim = React.lazy(() => import('./Gelisimim').then((m) => ({ default: m.Gelisimim }))); // Aşama 397
const QuizOyunu = React.lazy(() => import('../../Public/oyun/QuizOyunu').then((m) => ({ default: m.QuizOyunu })));
const CarkOyunu = React.lazy(() => import('../../Public/oyun/CarkOyunu').then((m) => ({ default: m.CarkOyunu })));
const BulmacaOyunu = React.lazy(() => import('../../Public/oyun/BulmacaOyunu').then((m) => ({ default: m.BulmacaOyunu })));
const HafizaOyunu = React.lazy(() => import('../../Public/oyun/HafizaOyunu').then((m) => ({ default: m.HafizaOyunu }))); // Aşama 398
const CalismaOyunu = React.lazy(() => import('../../Public/oyun/CalismaOyunu').then((m) => ({ default: m.CalismaOyunu })));

const ZORLUKLAR: Array<{ v: SerbestZorluk; ad: string }> = [
  { v: '', ad: 'Karışık' },
  { v: 'kolay', ad: 'Kolay' },
  { v: 'orta', ad: 'Orta' },
  { v: 'zor', ad: 'Zor' },
];
const MOD_ADI = Object.fromEntries(SERBEST_MODLAR.map((m) => [m.mod, m.ad])) as Record<SerbestMod, string>;
const birim = (mod: SerbestMod) => (serbestTur(mod) === 'kelime' ? 'kelime' : 'soru');
const sayiYaz = (n: number) => n.toLocaleString('tr-TR');

type Ekran = { tur: 'basla' } | { tur: 'oyun'; oyunId: string; token: string; ekran: OyunEkrani } | { tur: 'sonuc'; veri: SerbestSonuc };

const Yukleniyor: React.FC<{ yazi: string }> = ({ yazi }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
    <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
    {yazi}
  </div>
);

const Kutucuk: React.FC<{ deger: string; ad: string; ikon: React.ReactNode }> = ({ deger, ad, ikon }) => (
  <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
    <b className="flex items-center gap-1.5 text-lg font-bold leading-tight tabular-nums text-fg">
      {ikon}
      <span className="truncate">{deger}</span>
    </b>
    <span className="block truncate text-2xs text-muted">{ad}</span>
  </div>
);

const Bolum: React.FC<{ ad: string; htmlFor?: string; children: React.ReactNode }> = ({ ad, htmlFor, children }) => (
  <div className="space-y-1.5">
    {htmlFor ? (
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-muted">
        {ad}
      </label>
    ) : (
      <p className="text-xs font-semibold text-muted">{ad}</p>
    )}
    {children}
  </div>
);

/** Eşit genişlikte bölmeli seçim (zorluk, sayı) */
function Bolmeli<T extends string | number>({ ad, secenekler, deger, onSec }: { ad: string; secenekler: Array<{ v: T; ad: string; kapali?: boolean }>; deger: T; onSec: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={ad} className="grid gap-1 rounded-xl border border-line bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${secenekler.length}, minmax(0, 1fr))` }}>
      {secenekler.map((s) => (
        <button
          key={String(s.v)}
          type="button"
          role="radio"
          aria-checked={s.v === deger}
          disabled={s.kapali}
          onClick={() => onSec(s.v)}
          className={cx(
            'h-8 rounded-lg text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            s.v === deger ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
          )}
        >
          {s.ad}
        </button>
      ))}
    </div>
  );
}

export const KendinOyna: React.FC<{ studentId: string; onKapat: () => void; ilkSekme?: 'oyna' | 'gelisim' }> = ({ studentId, onKapat, ilkSekme = 'oyna' }) => {
  const [sekme, setSekme] = useState<'oyna' | 'gelisim'>(ilkSekme); // Aşama 397
  const [bilgi, setBilgi] = useState<SerbestBilgi | null>(null);
  const [bilgiHata, setBilgiHata] = useState<string | null>(null);
  const [ekran, setEkran] = useState<Ekran>({ tur: 'basla' });
  const [ayar, setAyar] = useState<SerbestAyar>({ mod: 'calisma', ders: '', konu: '', zorluk: '', adet: 10 });
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const bilgiYukle = useCallback(() => {
    setBilgiHata(null);
    serbestBilgi()
      .then((b) => {
        setBilgi(b);
        // açılışta son ayar (yoksa en çok sorusu olan ders) seçili gelir
        setAyar((a) => {
          if (a.ders) return a;
          if (b.sonAyar && serbestSayi(b.banka, b.sonAyar) >= SERBEST_SAYILAR[b.sonAyar.mod]?.enAz) return { ...b.sonAyar, zorluk: b.sonAyar.zorluk || '' };
          return { ...a, ders: serbestDersler(b.banka, a.mod)[0]?.ders || '' };
        });
      })
      .catch((e) => setBilgiHata(e instanceof Error ? e.message : 'Bilgiler okunamadı.'));
  }, []);
  useEffect(bilgiYukle, [bilgiYukle]);

  const banka = useMemo(() => bilgi?.banka || [], [bilgi]);
  const dersler = useMemo(() => serbestDersler(banka, ayar.mod), [banka, ayar.mod]);
  const konular = useMemo(() => serbestKonular(banka, ayar), [banka, ayar]);
  const uygun = useMemo(() => serbestSayi(banka, ayar), [banka, ayar]);
  const sayilar = SERBEST_SAYILAR[ayar.mod];
  const yeterli = uygun >= sayilar.enAz;
  // en yakın seçilebilir sayı: bankada daha az soru varsa elde olan kadar oynanır
  const oynanacak = Math.min(ayar.adet, uygun);

  const ayarla = (ek: Partial<SerbestAyar>) =>
    setAyar((a) => {
      const y = { ...a, ...ek };
      if (ek.mod && ek.mod !== a.mod) {
        if (!SERBEST_SAYILAR[y.mod].secenek.includes(y.adet)) y.adet = SERBEST_SAYILAR[y.mod].secenek[1];
        if (!serbestDersler(banka, y.mod).some((d) => d.ders === y.ders)) y.ders = serbestDersler(banka, y.mod)[0]?.ders || '';
      }
      if ((ek.ders !== undefined && ek.ders !== a.ders) || (ek.mod && ek.mod !== a.mod)) {
        if (y.konu && !serbestKonular(banka, y).some((k) => k.konu === y.konu)) y.konu = '';
      }
      return y;
    });

  const oyunAc = async (a: SerbestAyar | { tekrarOyunId: string }) => {
    setHata(null);
    setMesgul('Oyun hazırlanıyor…');
    try {
      const r = await serbestBaslat(a);
      const g = await oyunCagri<OyunEkrani>(r.token, 'basla', { studentId });
      setEkran({ tur: 'oyun', oyunId: r.oyun.id, token: r.token, ekran: g });
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Oyun açılamadı.');
    } finally {
      setMesgul(null);
    }
  };

  const bitti = useCallback(async (oyunId: string) => {
    setMesgul('Sonuç hazırlanıyor…');
    setHata(null);
    try {
      setEkran({ tur: 'sonuc', veri: await serbestSonuc(oyunId) });
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Sonuç okunamadı.');
      setEkran({ tur: 'basla' });
    } finally {
      setMesgul(null);
    }
    bilgiYukle(); // seri ve rekor tazelenir
  }, [bilgiYukle]);
  // yarıda bırakılıp yeniden açılan oyun zaten bitmişse doğrudan sonuca geçilir
  const bitmisOyun = ekran.tur === 'oyun' && ekran.ekran.tur === 'bitti' ? ekran.oyunId : null;
  useEffect(() => {
    if (bitmisOyun) void bitti(bitmisOyun);
  }, [bitmisOyun, bitti]);

  const hataKutusu = hata && (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg">
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      {hata}
    </p>
  );
  const kap = (icerik: React.ReactNode) => (
    <div className="mx-auto max-w-xl space-y-4 pb-6" id="kendin-oyna">
      {icerik}
    </div>
  );

  // Aşama 397: Başla ekranının üstünde Oyna | Gelişimim
  const sekmeler = (
    <div role="tablist" aria-label="Kendin oyna" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {(
        [
          ['oyna', 'Oyna'],
          ['gelisim', 'Gelişimim'],
        ] as const
      ).map(([k, ad]) => (
        <button
          key={k}
          type="button"
          role="tab"
          id={`ko-sekme-${k}`}
          aria-selected={sekme === k}
          onClick={() => setSekme(k)}
          className={cx('h-8 rounded-lg text-xs font-semibold transition-colors', sekme === k ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg')}
        >
          {ad}
        </button>
      ))}
    </div>
  );

  // ------------------------------------------------------------------ oyun
  if (mesgul && ekran.tur !== 'basla') return kap(<Yukleniyor yazi={mesgul} />);
  if (ekran.tur === 'oyun') {
    const g = ekran.ekran;
    const sonra = () => void bitti(ekran.oyunId);
    let oyun: React.ReactNode = null;
    if (g.tur === 'calisma') oyun = <CalismaOyunu token={ekran.token} studentId={studentId} ilk={g} onBitti={sonra} />;
    else if (g.tur === 'quiz') oyun = <QuizOyunu token={ekran.token} studentId={studentId} ilk={g} onBitti={sonra} />;
    else if (g.tur === 'cark') oyun = <CarkOyunu token={ekran.token} studentId={studentId} ilk={g} onBitti={sonra} />;
    else if (g.tur === 'bulmaca') oyun = <BulmacaOyunu token={ekran.token} studentId={studentId} ilk={g} onBitti={sonra} />;
    else if (g.tur === 'hafiza') oyun = <HafizaOyunu token={ekran.token} studentId={studentId} ilk={g} onBitti={sonra} />;
    else if (g.tur === 'bitti') oyun = <Yukleniyor yazi="Sonuç hazırlanıyor…" />;
    return kap(
      <>
        <React.Suspense fallback={<Yukleniyor yazi="Oyun yükleniyor…" />}>{oyun}</React.Suspense>
        {hataKutusu}
      </>
    );
  }

  // ------------------------------------------------------------------ sonuç
  if (ekran.tur === 'sonuc') {
    const v = ekran.veri;
    const mod = v.oyun.mod;
    const a = v.oyun.ayar || {};
    const tekrarOyunu = !!a.tekrar;
    const rekor = !tekrarOyunu && v.rekor && v.rekor.yeni ? v.rekor : null;
    const yuzde = v.sonuc.toplam ? Math.round((v.sonuc.dogru / v.sonuc.toplam) * 100) : 0;
    return kap(
      <>
        <div className="ui-card space-y-4 p-5" id="kendin-sonuc">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-4xl font-bold leading-none tracking-tight tabular-nums text-fg">
                {mod === 'calisma' ? `${v.sonuc.dogru} / ${v.sonuc.toplam}` : sayiYaz(v.sonuc.puan)}
              </p>
              <p className="mt-1.5 text-xs text-muted">
                {[mod === 'calisma' ? '' : `${v.sonuc.toplam} ${birim(mod) === 'soru' ? 'sorudan' : 'kelimeden'} ${v.sonuc.dogru} doğru`, a.ders, tekrarOyunu ? 'Yanlışlarım' : a.konu || 'Karışık', MOD_ADI[mod]].filter(Boolean).join(' · ')}
              </p>
            </div>
            {rekor ? (
              <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-1 text-2xs font-bold text-success-fg">{rekor.onceki === null ? 'İlk rekorun' : 'Yeni rekor'}</span>
            ) : mod !== 'calisma' && v.rekor && !tekrarOyunu ? (
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-semibold tabular-nums text-muted">Rekor {sayiYaz(v.rekor.enIyi)}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', yuzde >= 80 ? 'bg-success-soft text-success-fg' : 'bg-brand-soft text-brand-fg')}>
              {yuzde >= 80 ? <Trophy className="w-5 h-5" aria-hidden /> : <Target className="w-5 h-5" aria-hidden />}
            </span>
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-fg">{yuzde === 100 ? 'Hepsi doğru!' : yuzde >= 80 ? 'Çok iyi gidiyorsun' : yuzde >= 50 ? 'Yarıdan fazlası doğru' : 'Tekrar etmekte fayda var'}</p>
              <p className="text-muted">
                {rekor && rekor.onceki !== null ? `Önceki rekorun ${sayiYaz(rekor.onceki)} puandı. ` : ''}
                {v.seri > 0 ? `Seri: ${v.seri}. gün, yarın da oynarsan sürer.` : ''}
              </p>
            </div>
          </div>

          {(v.yeniRozetler || []).map((r) => {
            const t = ROZETLER.find((x) => x.kod === r.rozet);
            if (!t) return null;
            return (
              <div key={r.rozet} className="flex items-center gap-3 rounded-xl border border-brand bg-brand-soft px-3.5 py-3" role="status">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">{t.simge}</span>
                <div className="min-w-0 text-xs">
                  <p className="text-sm font-semibold text-fg">Yeni rozet: {t.ad}</p>
                  <p className="text-muted">
                    {r.rozet === 'konu_ustasi' && r.detay?.konu ? `${r.detay.konu} konusunda ${r.detay.toplam} soruda %${Math.round(((r.detay.dogru || 0) / Math.max(1, r.detay.toplam || 1)) * 100)}` : t.not}
                  </p>
                </div>
              </div>
            );
          })}
          {(() => {
            const s = siradakiSeri(v.seri, new Set());
            return s && v.seri > 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Award className="w-4 h-4 shrink-0 text-brand-fg" aria-hidden />
                {s.ad} rozetine {s.kalan} gün kaldı.
              </p>
            ) : null;
          })()}

          {v.yanlislar.length > 0 && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-brand-fg">Yanlış yaptıkların</p>
              <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
                {v.yanlislar.map((y, i) => (
                  <li key={i} className="py-2.5 text-sm">
                    <p className="break-words font-semibold text-fg">{y.gorselli ? 'Resimli soru' : y.metin}</p>
                    <p className="text-xs text-muted">
                      Doğrusu: <span className="font-semibold text-success-fg">{y.dogru}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={cx('grid gap-2.5', v.yanlislar.length ? 'grid-cols-2' : 'grid-cols-1')}>
            {v.yanlislar.length > 0 && (
              <Button variant="secondary" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => void oyunAc({ tekrarOyunId: v.oyun.id })}>
                Yanlışları tekrar
              </Button>
            )}
            <Button
              onClick={() => {
                setHata(null);
                setEkran({ tur: 'basla' });
              }}
            >
              Yeni oyun
            </Button>
          </div>
        </div>
        {hataKutusu}
      </>
    );
  }

  // ------------------------------------------------------------------ gelişim (Aşama 397)
  if (sekme === 'gelisim') {
    return kap(
      <>
        {sekmeler}
        <React.Suspense fallback={<Yukleniyor yazi="Hazırlanıyor…" />}>
          <Gelisimim
            onKonu={(ders, konu) => {
              ayarla({ mod: 'calisma', ders, konu, zorluk: '' });
              setSekme('oyna');
            }}
          />
        </React.Suspense>
      </>
    );
  }

  // ------------------------------------------------------------------ başla
  if (bilgiHata) {
    return kap(
      <div role="alert" className="ui-card space-y-3 p-5">
        <p className="flex items-start gap-2 text-sm font-semibold text-fg">
          <AlertCircle className="mt-0.5 w-4 h-4 shrink-0 text-danger-fg" aria-hidden />
          {bilgiHata}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onKapat}>
            Kapat
          </Button>
          <Button onClick={bilgiYukle}>Tekrar dene</Button>
        </div>
      </div>
    );
  }
  if (!bilgi) return kap(<Yukleniyor yazi="Hazırlanıyor…" />);

  if (!banka.length) {
    return kap(
      <div className="ui-card p-5 text-center text-sm text-muted">
        Okulunun soru bankasında henüz sana uygun soru yok. Öğretmenlerin soru ekledikçe burada oynayabilirsin.
      </div>
    );
  }

  const rekorAnahtar = `${ayar.mod}:${oynanacak}`;
  const enIyi = ayar.mod !== 'calisma' ? bilgi.rekor[rekorAnahtar]?.p : undefined;
  const hafta = bilgi.hafta.toplam ? Math.round((bilgi.hafta.dogru / bilgi.hafta.toplam) * 100) : null;
  const son = bilgi.sonAyar && serbestSayi(banka, bilgi.sonAyar) >= SERBEST_SAYILAR[bilgi.sonAyar.mod]?.enAz ? bilgi.sonAyar : null;
  const zayif = bilgi.zayif && serbestSayi(banka, { mod: 'calisma', ders: bilgi.zayif.ders, konu: bilgi.zayif.konu, zorluk: '' }) >= SERBEST_SAYILAR.calisma.enAz ? bilgi.zayif : null;

  return kap(
    <>
    {sekmeler}
    <div className="ui-card space-y-4 p-5" id="kendin-basla">
      <div className="grid grid-cols-3 gap-2">
        <Kutucuk deger={bilgi.seri ? `${bilgi.seri} gün` : '—'} ad={bilgi.bugun ? 'seri · bugün tamam' : 'günlük seri'} ikon={<Flame className={cx('w-4 h-4 shrink-0', bilgi.seri ? 'text-warning-fg' : 'text-subtle')} aria-hidden />} />
        {ayar.mod === 'calisma' ? (
          <Kutucuk deger={bilgi.enUzunSeri ? `${bilgi.enUzunSeri} gün` : '—'} ad="en uzun seri" ikon={<Trophy className="w-4 h-4 shrink-0 text-subtle" aria-hidden />} />
        ) : (
          <Kutucuk deger={enIyi !== undefined ? sayiYaz(enIyi) : '—'} ad={`en iyi · ${oynanacak || ayar.adet} ${birim(ayar.mod)}`} ikon={<Trophy className="w-4 h-4 shrink-0 text-subtle" aria-hidden />} />
        )}
        <Kutucuk deger={hafta === null ? '—' : `%${hafta}`} ad="bu hafta doğru" ikon={<Check className="w-4 h-4 shrink-0 text-subtle" aria-hidden />} />
      </div>

      {zayif && (
        <button
          type="button"
          onClick={() => ayarla({ mod: 'calisma', ders: zayif.ders, konu: zayif.konu, zorluk: '' })}
          className="flex w-full items-start gap-2.5 rounded-xl bg-brand-soft px-3.5 py-2.5 text-left text-xs text-fg transition-colors hover:bg-brand-soft/70"
        >
          <Sparkles className="mt-0.5 w-4 h-4 shrink-0 text-brand-fg" aria-hidden />
          <span className="min-w-0">
            <span className="block">
              Zorlandığın konu: <b className="text-brand-fg">{zayif.konu}</b> · {zayif.toplam} soruda {zayif.dogru} doğru
            </span>
            <span className="block text-muted">Dokun, Çalışma modunda bu konu seçilsin</span>
          </span>
        </button>
      )}

      <div role="radiogroup" aria-label="Oyun türü" className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
        {SERBEST_MODLAR.map((m) => {
          const var_ = serbestDersler(banka, m.mod).some((d) => d.n >= SERBEST_SAYILAR[m.mod].enAz);
          const on = ayar.mod === m.mod;
          return (
            <button
              key={m.mod}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!var_}
              onClick={() => ayarla({ mod: m.mod })}
              className={cx(
                'min-h-[3.75rem] rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                on ? 'border-brand bg-surface ring-1 ring-inset ring-brand' : 'border-line bg-surface hover:bg-surface-2'
              )}
            >
              <b className="block text-sm font-semibold text-fg">{m.ad}</b>
              <span className="block text-2xs text-muted">{var_ ? m.not : `Bankada ${birim(m.mod)} yok`}</span>
            </button>
          );
        })}
      </div>

      <Bolum ad="Ders" htmlFor="ko-ders">
        <select id="ko-ders" value={ayar.ders} onChange={(e) => ayarla({ ders: e.target.value })} className="ui-field w-full cursor-pointer">
          {!dersler.length && <option value="">Ders yok</option>}
          {dersler.map((d) => (
            <option key={d.ders} value={d.ders}>
              {d.ders}
            </option>
          ))}
        </select>
      </Bolum>
      <Bolum ad="Konu" htmlFor="ko-konu">
        <select id="ko-konu" value={ayar.konu} onChange={(e) => ayarla({ konu: e.target.value })} className="ui-field w-full cursor-pointer" disabled={!ayar.ders}>
          <option value="">
            Hepsi ({sayiYaz(serbestSayi(banka, { ...ayar, konu: '' }))} {birim(ayar.mod)})
          </option>
          {konular.map((k) => (
            <option key={k.konu} value={k.konu}>
              {k.konu} ({sayiYaz(k.n)})
            </option>
          ))}
        </select>
      </Bolum>
      <Bolum ad="Zorluk">
        <Bolmeli ad="Zorluk" secenekler={ZORLUKLAR.map((z) => ({ v: z.v, ad: z.ad }))} deger={ayar.zorluk} onSec={(v) => ayarla({ zorluk: v })} />
      </Bolum>
      <Bolum ad={birim(ayar.mod) === 'kelime' ? 'Kelime sayısı' : 'Soru sayısı'}>
        <Bolmeli ad="Sayı" secenekler={sayilar.secenek.map((n) => ({ v: n, ad: String(n) }))} deger={ayar.adet} onSec={(v) => ayarla({ adet: v })} />
      </Bolum>

      {!yeterli ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-fg">
          Bu seçimde yeterli {birim(ayar.mod)} yok (en az {sayilar.enAz}). Konuyu ya da zorluğu değiştir.
        </p>
      ) : (
        uygun < ayar.adet && (
          <p className="text-xs text-muted">
            Bu seçimde {uygun} {birim(ayar.mod)} var; oyun {uygun} {birim(ayar.mod)}la oynanır.
          </p>
        )
      )}
      {hataKutusu}

      <Button className="w-full" onClick={() => void oyunAc(ayar)} disabled={!yeterli || !!mesgul} isLoading={!!mesgul} loadingText="Hazırlanıyor…">
        Başla
      </Button>
      {son && (
        <p className="text-center text-xs text-subtle">
          Son oyunun: {[son.ders, son.konu || 'Karışık', `${son.adet} ${birim(son.mod)}`, MOD_ADI[son.mod]].join(' · ')} ·{' '}
          <button type="button" className="font-semibold text-brand-fg hover:underline disabled:opacity-50" disabled={!!mesgul} onClick={() => void oyunAc(son)}>
            Tekrar oyna
          </button>
        </p>
      )}
    </div>
    </>
  );
};
