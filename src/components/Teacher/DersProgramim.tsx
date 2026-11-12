import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { EmptyState, Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { useQuickFocus } from '../../lib/quickFocus';
import { basHarf, dakika, dersKisaListede } from '../../lib/dersKisa';
import {
  GUN_ADLARI,
  GUN_KISA,
  HaftaHucre,
  HaftaVeri,
  dersCanliDinle,
  gunEkle,
  haftaBasi,
  haftaOku,
  isoGun,
  tarihUzun,
  trBugun,
  trSaat,
} from '../../services/dersService';
import { DersYoklamaModal, DersYoklamaHedef } from './DersYoklamaModal';

// ============================================================================
// Aşama 220: ÖĞRETMENİN DERS PROGRAMI — hafta (bilgisayar) / gün (telefon) görünümü.
// Hücreler veritabanında program + yoklama kayıtları birleştirilerek gelir (ders_programi_hafta);
// ekran yalnız çizer. Yeşil: yoklama alındı · Turuncu: ders başladı, yoklama yok · Gri: henüz gelmedi.
// Ortak dersin öğretmenlerinden biri kaydedince herkeste canlı yeşile döner.
// Aşama 231: tatil günlerinde ders çıkmaz (veritabanı atlar); başlıkta "Tatil" yazar.
// Aşama 232: vekil yazıldığım ders "Vekil" etiketiyle görünür; kendi dersime vekil yazıldıysa vekilin adı görünür.
// Aşama 240: yeni tasarım (taslak dersler-v1) — "Şimdi" kartı (kalan süre + tek tıkla yoklama),
//   sıradaki / bekleyen dersler, haftanın özeti, eşit boy ders kartları (sınıf + ders kısaltması + durum),
//   telefonda gün şeridi ve "şimdi" çizgisi. Veri ve kurallar aynı (sunucu saati, canlı güncelleme).
// ============================================================================

type Gorunum = 'gun' | 'hafta';
type Durum = 'alindi' | 'bekliyor' | 'sonra';
const STORE_KEY = 'edu_ders_gorunum_v1';

const simdiSaat = () => trSaat(); // Aşama 234: Türkiye saati (sunucuya göre), cihaz saati değil

const ilkGorunum = (): Gorunum => {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v === 'gun' || v === 'hafta') return v;
  } catch {
    /* depolama kapalı */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'gun' : 'hafta';
};

const NOKTA: Record<Durum, string> = { alindi: 'bg-success', bekliyor: 'bg-warning', sonra: 'bg-line-strong' };
const YAZI: Record<Durum, string> = { alindi: 'text-success-fg', bekliyor: 'text-warning-fg font-semibold', sonra: 'text-muted' };
const KART_H = 'h-[62px]';
const GRAD = { background: 'linear-gradient(135deg, var(--color-brand) 0%, var(--color-brand-hover) 100%)' };

export const DersProgramim: React.FC = () => {
  const kurumId = dataService.getMyKurum().kurumId;
  const bugun = trBugun(); // Aşama 234: Türkiye günü (sunucu saati)
  const [gorunum, setGorunumState] = useState<Gorunum>(ilkGorunum);
  const setGorunum = (g: Gorunum) => {
    setGorunumState(g);
    try {
      window.localStorage.setItem(STORE_KEY, g);
    } catch {
      /* depolama kapalı */
    }
  };
  const [gun, setGun] = useState(bugun); // gün görünümündeki gün; hafta görünümü bu günün haftası
  const bas = haftaBasi(gun);
  const [veri, setVeri] = useState<HaftaVeri | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [saat, setSaat] = useState(simdiSaat);
  const [hedef, setHedef] = useState<DersYoklamaHedef | null>(null);

  // Saat ilerledikçe "şimdi" kartı ve "bekliyor" durumu güncellensin (dakikada bir, yalnız ekranda çizim)
  useEffect(() => {
    const t = setInterval(() => setSaat(simdiSaat()), 60_000);
    return () => clearInterval(t);
  }, []);

  const yukle = useCallback(async () => {
    try {
      setVeri(await haftaOku(bas));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Program okunamadı.');
    }
  }, [bas]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil', 'ders_vekil'], () => void yukle());
  }, [kurumId, yukle]);

  // Ana sayfadaki "yoklama bekliyor" satırından gelindiyse o dersi aç
  useQuickFocus(['ders'], (f) => {
    const [classId, tarih, sira] = f.id.split('|');
    if (classId && tarih && Number(sira) > 0) {
      setGun(tarih);
      setHedef({ classId, tarih, sira: Number(sira) });
    }
  });

  const ayar = veri?.ayar || null;
  // Aşama 231: tatil günleri (tarih → açıklama)
  const tatil = useMemo(() => new Map((veri?.tatiller || []).map((t) => [t.tarih, t.aciklama])), [veri]);
  const gunler = useMemo(() => [...(ayar?.gunler || [])].sort((a, b) => a - b), [ayar]);
  const siralar = useMemo(() => Array.from({ length: ayar?.dersSayisi || 0 }, (_, i) => i + 1), [ayar]);
  const saatOf = useCallback((s: number) => ayar?.saatler[s - 1] || { bas: '', bit: '' }, [ayar]);

  const hucreler = useMemo(() => {
    const m = new Map<string, HaftaHucre[]>();
    for (const h of veri?.hucreler || []) {
      const k = `${h.tarih}|${h.sira}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(h);
    }
    return m;
  }, [veri]);

  const durumu = useCallback(
    (h: HaftaHucre): Durum => {
      if (h.oturum) return 'alindi';
      const b = ayar?.saatler[h.sira - 1]?.bas || '00:00';
      if (h.tarih < bugun || (h.tarih === bugun && saat >= b)) return 'bekliyor';
      return 'sonra';
    },
    [ayar, bugun, saat]
  );

  const ozet = useMemo(() => {
    const s = { toplam: 0, alindi: 0, bekliyor: 0, sonra: 0, yok: 0 };
    for (const h of veri?.hucreler || []) {
      s.toplam += 1;
      s[durumu(h)] += 1;
      if (h.oturum) s.yok += (h.oturum.sayilar.absent || 0) + (h.oturum.sayilar.excused || 0);
    }
    return s;
  }, [veri, durumu]);

  // Haftadaki farklı dersler → kısaltma çakışırsa tam ad
  const dersListesi = useMemo(() => Array.from(new Set((veri?.hucreler || []).map((h) => h.ders))), [veri]);
  const kisa = (d: string) => dersKisaListede(d, dersListesi);

  // ---------------------------------------------------------------- bugün: şimdi / sıradaki / bekleyen
  const buHafta = bas === haftaBasi(bugun);
  const sirala = (a: HaftaHucre, b: HaftaHucre) => a.tarih.localeCompare(b.tarih) || a.sira - b.sira;
  const bugunDersler = useMemo(() => (veri?.hucreler || []).filter((h) => h.tarih === bugun).sort(sirala), [veri, bugun]);
  const simdiki = bugunDersler.find((h) => saatOf(h.sira).bas <= saat && saat < saatOf(h.sira).bit) || null;
  const sonrakiler = useMemo(
    () => (veri?.hucreler || []).filter((h) => h.tarih > bugun || (h.tarih === bugun && saatOf(h.sira).bas > saat)).sort(sirala),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [veri, bugun, saat, saatOf]
  );
  const bekleyenler = useMemo(
    () => (veri?.hucreler || []).filter((h) => durumu(h) === 'bekliyor' && h !== simdiki).sort(sirala),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [veri, durumu, simdiki]
  );

  const haftaGunleri = gunler.map((g) => gunEkle(bas, g - 1));
  const geri = () => setGun(gunEkle(gun, gorunum === 'hafta' ? -7 : -1));
  const ileri = () => setGun(gunEkle(gun, gorunum === 'hafta' ? 7 : 1));
  const aralikYazi =
    gorunum === 'hafta'
      ? `${tarihUzun(bas)} – ${tarihUzun(gunEkle(bas, Math.max(0, (gunler[gunler.length - 1] || 7) - 1)))}`
      : `${GUN_ADLARI[isoGun(gun) - 1]} ${tarihUzun(gun)}${gun === bugun ? ' · Bugün' : ''}`;

  const durumYazi = (h: HaftaHucre, d: Durum) => {
    if (d === 'alindi') {
      const s = h.oturum?.sayilar || {};
      const yok = (s.absent || 0) + (s.excused || 0);
      return `Alındı${yok ? ` · ${yok} yok` : ''}`;
    }
    if (d === 'bekliyor') return h.tarih === bugun ? 'Yoklama al' : 'Alınmadı';
    return saatOf(h.sira).bas;
  };
  const ortaklar = (h: HaftaHucre) => {
    const ben = dataService.getCurrentTeacher()?.id || '';
    const adlar = h.teacherAdlari.filter((_, i) => h.teacherIds[i] !== ben);
    return adlar.length && h.teacherIds.length > 1 ? adlar : [];
  };
  const yan = (h: HaftaHucre): { yazi: string; tam: string } | null => {
    if (h.benimVekil) return { yazi: 'Vekil', tam: 'Bu derse vekil olarak yazıldınız' };
    if (h.vekilAd) return { yazi: `V: ${basHarf(h.vekilAd)}`, tam: `Vekil: ${h.vekilAd}` };
    const o = ortaklar(h);
    return o.length ? { yazi: o.map(basHarf).join(' '), tam: `Ortak ders: ${o.join(', ')}` } : null;
  };
  const ac = (h: HaftaHucre) => setHedef({ classId: h.classId, tarih: h.tarih, sira: h.sira });

  // Bileşen değil işlev: her çizimde yeniden kurulmasın (odak ve tıklama kaybolmaz)
  const dersKarti = (h: HaftaHucre) => {
    const d = durumu(h);
    const canli = h === simdiki;
    const y = yan(h);
    const tam = `${h.classAd} · ${h.ders} · ${h.sira}. ders · ${d === 'alindi' ? durumYazi(h, d) : d === 'bekliyor' ? 'yoklama bekliyor' : 'henüz gelmedi'}${y ? ` · ${y.tam}` : ''}`;
    return (
      <button
        key={`${h.classId}-${h.ders}-${h.tarih}-${h.sira}`}
        type="button"
        onClick={() => ac(h)}
        title={tam}
        aria-label={tam}
        className={cx(
          KART_H,
          'w-full rounded-xl border px-3 py-2 text-left flex flex-col justify-center gap-1',
          'transition-[translate,scale,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          d === 'bekliyor' ? 'bg-warning-soft/60 border-warning' : 'bg-surface border-line hover:border-line-strong',
          canli && 'ring-2 ring-brand/25 border-brand'
        )}
      >
        <span className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-[15px] leading-5 font-bold text-fg truncate">{h.classAd}</span>
          <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-fg-2">{kisa(h.ders)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] min-w-0">
          <span className={cx('w-2 h-2 rounded-full shrink-0', NOKTA[d])} aria-hidden="true" />
          <span className={cx('truncate tabular-nums', YAZI[d])}>{durumYazi(h, d)}</span>
          {y && (
            <span className="ml-auto flex items-center gap-1 text-[10.5px] font-semibold text-muted shrink-0">
              {!h.benimVekil && !h.vekilAd && <Users className="w-3 h-3" aria-hidden="true" />}
              {y.yazi}
            </span>
          )}
        </span>
      </button>
    );
  };

  // ---------------------------------------------------------------- durumlar
  if (hata && !veri) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger-fg">
        {hata}
      </p>
    );
  }
  if (!veri) return <p className="text-xs text-muted">Program yükleniyor…</p>;
  if (!ayar?.kayitli) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Ders programı henüz hazır değil"
        description="Kurum yöneticisi ders saatlerini ve programı girince dersleriniz burada görünür."
      />
    );
  }

  // ---------------------------------------------------------------- Şimdi kartı
  const vurgu = simdiki || (sonrakiler[0]?.tarih === bugun ? sonrakiler[0] : null);
  const vurguSaat = vurgu ? saatOf(vurgu.sira) : null;
  const simdiDk = dakika(saat);
  let halka = { oran: 0, ust: '', alt: '' };
  if (simdiki && vurguSaat) {
    const top = Math.max(1, dakika(vurguSaat.bit) - dakika(vurguSaat.bas));
    const kalan = Math.max(0, dakika(vurguSaat.bit) - simdiDk);
    halka = { oran: kalan / top, ust: `${kalan}'`, alt: 'kaldı' };
  } else if (vurgu && vurguSaat) {
    const kala = Math.max(0, dakika(vurguSaat.bas) - simdiDk);
    halka = { oran: 1, ust: kala <= 99 ? `${kala}'` : vurguSaat.bas, alt: kala <= 99 ? 'sonra' : 'başlar' };
  }
  const bugunBitti = !vurgu && bugunDersler.length > 0;
  const bugunAlinan = bugunDersler.filter((h) => h.oturum).length;
  const yarin = sonrakiler.find((h) => h.tarih > bugun) || null;
  const CEVRE = 2 * Math.PI * 37;

  const simdiKarti = (kucuk: boolean) => (
    <section
      className={cx('relative overflow-hidden rounded-2xl text-white shadow-card flex items-center', kucuk ? 'gap-4 p-4' : 'gap-5 px-6 py-5')}
      style={GRAD}
      id="ders-simdi"
      aria-live="polite"
    >
      {vurgu && !kucuk && (
        <div className="relative w-[86px] h-[86px] shrink-0" aria-hidden="true">
          <svg viewBox="0 0 86 86" className="w-full h-full -rotate-90">
            <circle cx="43" cy="43" r="37" fill="none" stroke="rgb(255 255 255 / .22)" strokeWidth="7" />
            <circle
              cx="43"
              cy="43"
              r="37"
              fill="none"
              stroke="#fff"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CEVRE}
              strokeDashoffset={CEVRE * (1 - halka.oran)}
              style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)' }}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-xl font-bold tabular-nums">{halka.ust}</span>
            <span className="text-[10px] opacity-80 mt-1">{halka.alt}</span>
          </span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {vurgu && vurguSaat ? (
          <>
            <p className="text-xs font-medium opacity-85 tabular-nums">
              {simdiki ? 'Şimdi' : 'Sıradaki'} · {vurgu.sira}. ders · {vurguSaat.bas}–{vurguSaat.bit}
              {kucuk && simdiki ? ` · ${halka.ust} kaldı` : ''}
            </p>
            <h2 className={cx('font-extrabold tracking-tight truncate', kucuk ? 'text-[22px] mt-0.5' : 'text-[28px] mt-1')}>
              {vurgu.classAd} · {vurgu.ders}
            </h2>
            {!kucuk && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5">
                  {vurgu.oturum ? durumYazi(vurgu, 'alindi') : simdiki ? 'Yoklama alınmadı' : 'Teneffüs'}
                </span>
                {yan(vurgu) && <span className="rounded-full bg-white/15 px-2.5 py-0.5">{yan(vurgu)!.tam}</span>}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-medium opacity-85">{GUN_ADLARI[isoGun(bugun) - 1]} {tarihUzun(bugun)}</p>
            <h2 className={cx('font-extrabold tracking-tight', kucuk ? 'text-xl mt-0.5' : 'text-2xl mt-1')}>
              {tatil.has(bugun) ? `Bugün tatil${tatil.get(bugun) ? ` · ${tatil.get(bugun)}` : ''}` : bugunBitti ? 'Bugünkü dersler bitti' : 'Bugün dersiniz yok'}
            </h2>
            <p className="text-xs opacity-85 mt-1 tabular-nums">
              {bugunBitti ? `${bugunDersler.length} dersin ${bugunAlinan} tanesinde yoklama alındı.` : ''}
              {yarin ? ` Sıradaki: ${GUN_KISA[isoGun(yarin.tarih) - 1]} ${saatOf(yarin.sira).bas} · ${yarin.classAd} ${kisa(yarin.ders)}` : ''}
            </p>
          </>
        )}
      </div>
      {simdiki && (
        <button
          type="button"
          onClick={() => ac(simdiki)}
          className={cx(
            'shrink-0 rounded-xl bg-white font-bold text-brand-fg transition-[translate,scale,box-shadow] duration-150 hover:-translate-y-px hover:shadow-pop active:scale-[0.97]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
            kucuk ? 'h-9 px-4 text-xs' : 'h-10 min-w-[8.5rem] px-5 text-[13px]'
          )}
          id="ders-simdi-yoklama"
        >
          {simdiki.oturum ? 'Yoklamayı aç' : 'Yoklama al'}
        </button>
      )}
    </section>
  );

  // Sağ kart: geçmişte alınmamış yoklama varsa onlar, yoksa sıradaki dersler
  const sagListe = bekleyenler.length ? bekleyenler.slice(0, 3) : sonrakiler.filter((h) => h !== vurgu).slice(0, 3);
  const sagKart = (
    <section className="rounded-2xl border border-line bg-surface shadow-card px-5 py-4 flex flex-col gap-3" id="ders-sirada">
      <p className={cx('text-[11px] font-semibold uppercase tracking-wider', bekleyenler.length ? 'text-warning-fg' : 'text-muted')}>
        {bekleyenler.length ? `Yoklaması bekleyen · ${bekleyenler.length}` : 'Sıradaki dersler'}
      </p>
      {sagListe.length === 0 && <p className="text-xs text-muted">Bu hafta başka ders yok.</p>}
      {sagListe.map((h) => (
        <button
          key={`${h.tarih}-${h.sira}-${h.classId}`}
          type="button"
          onClick={() => ac(h)}
          className="flex items-center gap-3 text-left rounded-lg -mx-2 px-2 py-1 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="w-14 shrink-0 border-r border-line pr-3 text-center">
            <span className="block text-[15px] font-bold tabular-nums">{saatOf(h.sira).bas}</span>
            <span className="block text-[11px] text-muted">{h.tarih === bugun ? `${h.sira}. ders` : GUN_KISA[isoGun(h.tarih) - 1]}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold truncate">
              {h.classAd} · {h.ders}
            </span>
            <span className={cx('block text-xs', bekleyenler.length ? 'text-warning-fg' : 'text-muted')}>
              {bekleyenler.length ? `${h.tarih === bugun ? 'Bugün' : tarihUzun(h.tarih)} · yoklama alınmadı` : yan(h)?.tam || `${h.sira}. ders`}
            </span>
          </span>
        </button>
      ))}
    </section>
  );

  // Haftanın özeti
  const yuzde = (n: number) => `${ozet.toplam ? (n / ozet.toplam) * 100 : 0}%`;
  const ozetKart = (
    <section className="rounded-2xl border border-line bg-surface shadow-card grid grid-cols-2 sm:grid-cols-4" id="ders-ozet">
      <div className="px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bu hafta</p>
        <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">
          {ozet.toplam} <span className="text-[13px] font-semibold text-muted">ders</span>
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 flex overflow-hidden" aria-hidden="true">
          <span className="bg-success" style={{ width: yuzde(ozet.alindi) }} />
          <span className="bg-warning" style={{ width: yuzde(ozet.bekliyor) }} />
          <span className="bg-line-strong" style={{ width: yuzde(ozet.sonra) }} />
        </div>
      </div>
      <div className="px-5 py-4 border-l border-line">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-success-fg">Alındı</p>
        <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{ozet.alindi}</p>
        <p className="text-xs text-muted">{ozet.yok ? `${ozet.yok} öğrenci yok yazıldı` : 'Devamsızlık yok'}</p>
      </div>
      <button
        type="button"
        disabled={!bekleyenler.length}
        onClick={() => bekleyenler[0] && ac(bekleyenler[0])}
        className="px-5 py-4 border-t sm:border-t-0 sm:border-l border-line text-left enabled:hover:bg-surface-2 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        title={bekleyenler.length ? 'İlk bekleyen yoklamayı aç' : undefined}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-warning-fg">Bekliyor</p>
        <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{ozet.bekliyor}</p>
        <p className="text-xs text-muted">{ozet.bekliyor ? 'Açmak için tıklayın' : 'Bekleyen yok'}</p>
      </button>
      <div className="px-5 py-4 border-t sm:border-t-0 border-l border-line">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Henüz gelmedi</p>
        <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{ozet.sonra}</p>
        <p className="text-xs text-muted">Bu haftanın kalanı</p>
      </div>
    </section>
  );

  // Gezinme
  const gezinme = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-3">
      <div className="flex items-center gap-1.5">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={geri} aria-label={gorunum === 'hafta' ? 'Önceki hafta' : 'Önceki gün'}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-semibold text-fg min-w-[11rem] text-center tabular-nums">{aralikYazi}</span>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={ileri} aria-label={gorunum === 'hafta' ? 'Sonraki hafta' : 'Sonraki gün'}>
          <ChevronRight className="w-4 h-4" />
        </button>
        {gun !== bugun && (
          <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-20 justify-center" onClick={() => setGun(bugun)}>
            Bugün
          </button>
        )}
      </div>
      <Segmented
        size="sm"
        value={gorunum}
        onChange={setGorunum}
        items={[
          { value: 'gun', label: 'Gün', id: 'ders-gorunum-gun' },
          { value: 'hafta', label: 'Hafta', id: 'ders-gorunum-hafta' },
        ]}
      />
    </div>
  );

  const lejant = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-3 pt-1 text-[11.5px] text-muted">
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Yoklama alındı</span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />Bekliyor</span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-line-strong" />Henüz gelmedi</span>
      <span className="flex items-center gap-1.5"><Users className="w-3 h-3" />Ortak ders (baş harf)</span>
    </div>
  );

  return (
    <div className="space-y-4" id="ders-programim">
      {buHafta && (
        <div className={cx('grid gap-4', gorunum === 'hafta' ? 'lg:grid-cols-[1.35fr_1fr]' : '')}>
          <div className="hidden sm:block">{simdiKarti(false)}</div>
          <div className="sm:hidden">{simdiKarti(true)}</div>
          {gorunum === 'hafta' && <div className="hidden lg:block">{sagKart}</div>}
        </div>
      )}
      {gorunum === 'hafta' && ozetKart}

      {hata && (
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {hata}
        </p>
      )}

      <section className="rounded-2xl border border-line bg-surface shadow-card">
        {gezinme}
        {gorunum === 'hafta' ? (
          <>
            <div className="overflow-x-auto px-2 pb-1" id="ders-hafta">
              <div
                className="grid gap-1.5 min-w-[680px] px-2"
                style={{ gridTemplateColumns: `76px repeat(${haftaGunleri.length}, minmax(112px, 1fr))` }}
              >
                <div />
                {haftaGunleri.map((t) => {
                  const hs = (veri?.hucreler || []).filter((h) => h.tarih === t).sort(sirala);
                  const bugunMu = t === bugun;
                  return (
                    <div key={t} className={cx('rounded-xl px-2.5 py-2 text-xs', bugunMu ? 'bg-brand-soft text-brand-fg' : 'text-muted')}>
                      <span className={cx('block text-[13px] font-semibold', bugunMu ? 'text-brand-fg' : 'text-fg')}>
                        {GUN_KISA[isoGun(t) - 1]} {tarihUzun(t)}
                        {bugunMu ? ' · Bugün' : ''}
                      </span>
                      {tatil.has(t) ? (
                        <span className="block truncate">Tatil{tatil.get(t) ? ` · ${tatil.get(t)}` : ''}</span>
                      ) : (
                        <>
                          <span className="tabular-nums">{hs.length ? `${hs.length} ders` : 'Ders yok'}</span>
                          {hs.length > 0 && (
                            <span className="flex gap-[3px] mt-1.5" aria-hidden="true">
                              {hs.slice(0, 10).map((h) => (
                                <span key={`${h.sira}-${h.classId}`} className={cx('h-1 w-3.5 rounded-full', h.oturum ? 'bg-success' : durumu(h) === 'bekliyor' ? 'bg-warning' : 'bg-line')} />
                              ))}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {siralar.map((s) => (
                  <React.Fragment key={s}>
                    <div className="h-[62px] flex flex-col justify-center pl-1 text-xs text-muted tabular-nums">
                      <span className="text-[13px] font-semibold text-fg-2">{s}. ders</span>
                      {saatOf(s).bas}–{saatOf(s).bit}
                    </div>
                    {haftaGunleri.map((t) => {
                      const hs = hucreler.get(`${t}|${s}`) || [];
                      return hs.length ? (
                        <div key={t} className="flex flex-col gap-1">
                          {hs.map((h) => dersKarti(h))}
                        </div>
                      ) : (
                        <div key={t} className={cx(KART_H, 'rounded-xl', t === bugun && 'bg-brand-soft/40')} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {lejant}
          </>
        ) : (
          <div className="px-3 pb-4" id="ders-gun">
            <div className="flex gap-1.5 mb-4" role="group" aria-label="Gün seç">
              {haftaGunleri.map((t) => {
                const on = t === gun;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGun(t)}
                    className={cx(
                      'flex-1 h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 text-[11px] transition-[background-color,border-color,scale] duration-150 active:scale-[0.96]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                      on ? 'bg-brand border-brand text-white' : 'bg-surface border-line text-muted hover:border-line-strong'
                    )}
                  >
                    <span className={cx('text-base font-bold tabular-nums', on ? 'text-white' : t === bugun ? 'text-brand-fg' : 'text-fg')}>{Number(t.slice(8, 10))}</span>
                    {GUN_KISA[isoGun(t) - 1]}
                  </button>
                );
              })}
            </div>
            {!gunler.includes(isoGun(gun)) ? (
              <p className="text-xs text-muted px-1 py-4">Bu gün ders günü değil.</p>
            ) : tatil.has(gun) && !(veri?.hucreler || []).some((h) => h.tarih === gun) ? (
              <p className="text-xs text-muted px-1 py-4">Tatil{tatil.get(gun) ? `: ${tatil.get(gun)}` : ''}. Ders yok.</p>
            ) : (
              <div className="space-y-2">
                {siralar.map((s) => {
                  const hs = hucreler.get(`${gun}|${s}`) || [];
                  const cizgi = gun === bugun && saat < saatOf(s).bas && (s === 1 || saat >= saatOf(s - 1).bas);
                  return (
                    <React.Fragment key={s}>
                      {cizgi && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-danger-fg tabular-nums" aria-label={`Şu an ${saat}`}>
                          {saat}
                          <span className="flex-1 h-0.5 rounded bg-danger" />
                        </div>
                      )}
                      <div className="grid grid-cols-[52px_1fr] gap-2.5 items-center">
                        <span className="text-right text-[11px] text-muted tabular-nums leading-tight">
                          <span className="block text-[13px] font-bold text-fg-2">{saatOf(s).bas}</span>
                          {s}. ders
                        </span>
                        {hs.length ? (
                          <div className="flex flex-col gap-1.5">{hs.map((h) => dersKarti(h))}</div>
                        ) : (
                          <div className="h-[34px] rounded-xl border border-dashed border-line flex items-center px-3 text-xs text-subtle">Boş saat</div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <DersYoklamaModal hedef={hedef} kurumId={kurumId} onClose={() => setHedef(null)} onSaved={() => void yukle()} />
    </div>
  );
};
