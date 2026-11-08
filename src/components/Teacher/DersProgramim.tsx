import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { EmptyState, Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { useQuickFocus } from '../../lib/quickFocus';
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
  tarihYaz,
} from '../../services/dersService';
import { DersYoklamaModal, DersYoklamaHedef } from './DersYoklamaModal';

// ============================================================================
// Aşama 220: ÖĞRETMENİN DERS PROGRAMI — hafta (bilgisayar) / gün (telefon) görünümü.
// Hücreler veritabanında program + yoklama kayıtları birleştirilerek gelir (ders_programi_hafta);
// ekran yalnız çizer. Yeşil: yoklama alındı · Turuncu: ders başladı, yoklama yok · Gri: henüz gelmedi.
// Ortak dersin öğretmenlerinden biri kaydedince herkeste canlı yeşile döner.
// ============================================================================

type Gorunum = 'gun' | 'hafta';
type Durum = 'alindi' | 'bekliyor' | 'sonra';
const STORE_KEY = 'edu_ders_gorunum_v1';

const simdiSaat = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const ilkGorunum = (): Gorunum => {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v === 'gun' || v === 'hafta') return v;
  } catch {
    /* depolama kapalı */
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'gun' : 'hafta';
};

const CIZGI: Record<Durum, string> = {
  alindi: 'bg-success',
  bekliyor: 'bg-warning',
  sonra: 'bg-line-strong',
};
const ALT_RENK: Record<Durum, string> = {
  alindi: 'text-success-fg',
  bekliyor: 'text-warning-fg',
  sonra: 'text-muted',
};

export const DersProgramim: React.FC = () => {
  const kurumId = dataService.getMyKurum().kurumId;
  const bugun = tarihYaz(new Date());
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

  // Saat ilerledikçe "bekliyor" durumu güncellensin (dakikada bir, yalnız ekranda çizim)
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
    return dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar'], () => void yukle());
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
  const gunler = useMemo(() => [...(ayar?.gunler || [])].sort((a, b) => a - b), [ayar]);
  const siralar = useMemo(() => Array.from({ length: ayar?.dersSayisi || 0 }, (_, i) => i + 1), [ayar]);

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
    const s = { toplam: 0, alindi: 0, bekliyor: 0, sonra: 0 };
    for (const h of veri?.hucreler || []) {
      s.toplam += 1;
      s[durumu(h)] += 1;
    }
    return s;
  }, [veri, durumu]);

  const haftaGunleri = gunler.map((g) => gunEkle(bas, g - 1));
  const geri = () => setGun(gunEkle(gun, gorunum === 'hafta' ? -7 : -1));
  const ileri = () => setGun(gunEkle(gun, gorunum === 'hafta' ? 7 : 1));
  const aralikYazi =
    gorunum === 'hafta'
      ? `${tarihUzun(bas)} – ${tarihUzun(gunEkle(bas, 6))}`
      : `${GUN_ADLARI[isoGun(gun) - 1]} ${tarihUzun(gun)}${gun === bugun ? ' · Bugün' : ''}`;

  const altYazi = (h: HaftaHucre, d: Durum) => {
    if (d === 'alindi') {
      const s = h.oturum?.sayilar || {};
      const yok = (s.absent || 0) + (s.excused || 0);
      const ad = h.teacherIds.length > 1 && h.oturum?.alanAd ? ` · ${h.oturum.alanAd}` : '';
      return `Alındı${yok ? ` · ${yok} yok` : ''}${ad}`;
    }
    if (d === 'bekliyor') return h.tarih === bugun ? 'Yoklama al' : 'Yoklama alınmadı';
    return h.teacherIds.length > 1 ? 'Ortak ders' : 'Henüz gelmedi';
  };

  // Bileşen değil işlev: her çizimde yeniden kurulmasın (odak ve tıklama kaybolmaz)
  const dersDugmesi = (h: HaftaHucre, buyuk?: boolean) => {
    const d = durumu(h);
    return (
      <button
        key={`${h.classId}-${h.ders}`}
        type="button"
        onClick={() => setHedef({ classId: h.classId, tarih: h.tarih, sira: h.sira })}
        className={cx(
          'relative w-full overflow-hidden rounded-lg border bg-surface text-left flex flex-col justify-center gap-0.5 px-2.5 pt-1.5 pb-2.5 transition-colors hover:border-line-strong',
          buyuk ? 'min-h-[52px]' : 'min-h-[48px]',
          d === 'bekliyor' && h.tarih === bugun ? 'border-warning' : 'border-line'
        )}
        aria-label={`${h.ders} ${h.classAd}, ${h.sira}. ders: ${altYazi(h, d)}`}
      >
        <span className="flex items-center justify-between gap-1.5 w-full min-w-0">
          <span className={cx('font-semibold text-fg truncate', buyuk ? 'text-sm' : 'text-xs')}>
            {h.ders} · {h.classAd}
          </span>
          {h.teacherIds.length > 1 && <Users className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />}
        </span>
        <span className={cx('text-[11px] truncate', ALT_RENK[d])}>{altYazi(h, d)}</span>
        <span className={cx('absolute left-0 right-0 bottom-0 h-[3px]', CIZGI[d])} aria-hidden="true" />
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

  return (
    <div className="space-y-3" id="ders-programim">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={geri} aria-label={gorunum === 'hafta' ? 'Önceki hafta' : 'Önceki gün'}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-fg min-w-[9.5rem] text-center tabular-nums">{aralikYazi}</span>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={ileri} aria-label={gorunum === 'hafta' ? 'Sonraki hafta' : 'Sonraki gün'}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {gun !== bugun && (
            <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => setGun(bugun)}>
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

      {gorunum === 'hafta' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-2">
          <span className="font-semibold text-fg">Bu hafta {ozet.toplam} ders</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 rounded bg-success" aria-hidden="true" />
            Alındı · {ozet.alindi}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 rounded bg-warning" aria-hidden="true" />
            Bekliyor · {ozet.bekliyor}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 rounded bg-line-strong" aria-hidden="true" />
            Henüz gelmedi · {ozet.sonra}
          </span>
        </div>
      )}

      {hata && (
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {hata}
        </p>
      )}

      {gorunum === 'hafta' ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface" id="ders-hafta">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-fg-2">
                <th scope="col" className="w-10 py-2 font-semibold text-center">
                  #
                </th>
                <th scope="col" className="w-20 py-2 px-2 font-semibold text-left">
                  Saat
                </th>
                {haftaGunleri.map((t) => (
                  <th key={t} scope="col" className={cx('py-2 px-2 font-semibold text-left border-l border-line', t === bugun && 'text-brand-fg bg-brand-soft')}>
                    {GUN_KISA[isoGun(t) - 1]} {tarihUzun(t)}
                    {t === bugun ? ' · Bugün' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {siralar.map((s) => {
                const sa = ayar.saatler[s - 1];
                return (
                  <tr key={s} className="border-t border-line">
                    <td className="text-center font-bold text-fg-2 tabular-nums">{s}</td>
                    <td className="px-2 text-fg-2 tabular-nums leading-tight">
                      {sa?.bas}
                      <br />
                      <span className="text-subtle">{sa?.bit}</span>
                    </td>
                    {haftaGunleri.map((t) => {
                      const hs = hucreler.get(`${t}|${s}`) || [];
                      return (
                        <td key={t} className={cx('p-1 border-l border-line align-top', t === bugun && 'bg-brand-soft/40')}>
                          <div className="flex flex-col gap-1">
                            {hs.map((h) => dersDugmesi(h))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line" id="ders-gun">
          {!gunler.includes(isoGun(gun)) ? (
            <p className="text-xs text-muted px-3 py-4">Bu gün ders günü değil.</p>
          ) : (
            siralar.map((s) => {
              const sa = ayar.saatler[s - 1];
              const hs = hucreler.get(`${gun}|${s}`) || [];
              return (
                <div key={s} className={cx('flex items-center gap-3 px-3', hs.length ? 'py-2' : 'py-1.5')}>
                  <span className="w-5 text-center text-sm font-bold text-fg-2 tabular-nums">{s}</span>
                  <span className="w-12 text-[11px] text-fg-2 tabular-nums leading-tight">
                    {sa?.bas}
                    <br />
                    <span className="text-subtle">{sa?.bit}</span>
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {hs.length ? hs.map((h) => dersDugmesi(h, true)) : <span className="text-xs text-subtle">Ders yok</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <DersYoklamaModal hedef={hedef} kurumId={kurumId} onClose={() => setHedef(null)} onSaved={() => void yukle()} />
    </div>
  );
};
