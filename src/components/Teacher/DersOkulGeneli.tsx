import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import { basHarf, dakika } from '../../lib/dersKisa';
import {
  DersAyar,
  GUN_ADLARI,
  GunDurum,
  GunHucre,
  GunIzin,
  dersCanliDinle,
  gunEkle,
  gunTablosu,
  isoGun,
  izinListesi,
  tarihUzun,
  trBugun,
  trSaat,
} from '../../services/dersService';
import { DersYoklamaModal, DersYoklamaHedef } from './DersYoklamaModal';

// ============================================================================
// Aşama 240: DERSLER › OKUL GENELİ (yalnız idare) — taslak dersler-v1 "İdareci · Dersler".
//  * Günün özeti: ders / alındı / geciken / bekliyor (durumlar SUNUCUDA hesaplanır: ders_gun_tablosu, 221)
//  * Yoklama haritası: sınıf × ders saati; kareye tıklayınca o dersin yoklaması açılır (idare yazabilir, 232)
//  * Geciken yoklamalar ve o günün gün boyu izinleri (232 ders_gun_izin)
// Canlı: yoklama / program / ayar / tatil / izin değişince yeniden okunur; bugün ayrıca 5 dakikada bir
// (gecikme süresi dolan ders "geciken"e geçsin). Kurum Raporu'ndaki ayrıntılı rapor aynen durur.
// ============================================================================

const KARE: Record<GunDurum, string> = {
  alindi: 'bg-success-soft text-success-fg border-transparent',
  geciken: 'bg-danger-soft text-danger-fg border-danger/40',
  bekliyor: 'bg-warning-soft text-warning-fg border-transparent',
  sonra: 'bg-surface-2 text-subtle border-transparent',
};
const AD: Record<GunDurum, string> = { alindi: 'Alındı', geciken: 'Geciken', bekliyor: 'Bekliyor', sonra: 'Sonra' };
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

export const DersOkulGeneli: React.FC<{ students: Student[]; classes: ClassGroup[] }> = ({ students, classes }) => {
  const kurumId = dataService.getMyKurum().kurumId;
  const bugun = trBugun();
  const [gun, setGun] = useState(bugun);
  const [gt, setGt] = useState<{ ayar: DersAyar | null; hucreler: GunHucre[] } | null>(null);
  const [izinler, setIzinler] = useState<GunIzin[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const [hedef, setHedef] = useState<DersYoklamaHedef | null>(null);
  const [suzgec, setSuzgec] = useState<'hepsi' | 'geciken'>('hepsi');
  const [saat, setSaat] = useState(trSaat);

  const yukle = useCallback(async () => {
    try {
      const [t, iz] = await Promise.all([gunTablosu(gun), izinListesi(kurumId || '', gun).catch(() => [] as GunIzin[])]);
      setGt(t);
      setIzinler(iz.filter((x) => x.tarih === gun));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Okul geneli okunamadı.');
    }
  }, [gun, kurumId]);

  useEffect(() => {
    setGt(null);
    void yukle();
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil', 'ders_gun_izin', 'ders_vekil'], () => void yukle());
    if (gun !== bugun) return kapat;
    const t = setInterval(() => {
      setSaat(trSaat());
      if (document.visibilityState === 'visible') void yukle();
    }, 5 * 60_000);
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [kurumId, gun, bugun, yukle]);

  const ayar = gt?.ayar || null;
  const satirlar = useMemo(() => {
    const m = new Map<string, { classId: string; classAd: string; hucre: Map<number, GunHucre> }>();
    for (const h of gt?.hucreler || []) {
      if (!m.has(h.classId)) m.set(h.classId, { classId: h.classId, classAd: h.classAd, hucre: new Map() });
      m.get(h.classId)!.hucre.set(h.sira, h);
    }
    return Array.from(m.values()).sort((a, b) => trSirala(a.classAd, b.classAd));
  }, [gt]);
  const siraSayisi = Math.max(ayar?.dersSayisi || 0, ...(gt?.hucreler || []).map((h) => h.sira));
  const siralar = Array.from({ length: siraSayisi }, (_, i) => i + 1);
  const say = useMemo(() => {
    const s: Record<GunDurum, number> = { alindi: 0, geciken: 0, bekliyor: 0, sonra: 0 };
    let gec = 0;
    for (const h of gt?.hucreler || []) {
      s[h.durum] += 1;
      if (h.oturum?.gec) gec += 1;
    }
    return { ...s, toplam: (gt?.hucreler || []).length, gec };
  }, [gt]);
  const gecikenler = useMemo(
    () => (gt?.hucreler || []).filter((h) => h.durum === 'geciken').sort((a, b) => a.sira - b.sira || trSirala(a.classAd, b.classAd)),
    [gt]
  );
  const ogrenci = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sinifAd = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

  const yuzde = (n: number) => `${say.toplam ? (n / say.toplam) * 100 : 0}%`;
  const kareYazi = (h: GunHucre) => {
    if (h.durum === 'alindi') {
      const yok = (h.oturum?.sayilar.absent || 0) + (h.oturum?.sayilar.excused || 0);
      return yok ? `${yok} yok` : '✓';
    }
    return h.durum === 'geciken' ? '!' : h.durum === 'bekliyor' ? '…' : '';
  };
  const gecikmeYazi = (h: GunHucre) => {
    if (gun !== bugun) return 'Alınmadı';
    const bit = ayar?.saatler[h.sira - 1]?.bit;
    const dk = bit ? dakika(saat) - dakika(bit) : 0;
    if (dk <= 0) return 'Gecikti';
    return dk >= 60 ? `${Math.floor(dk / 60)} sa ${dk % 60 ? `${dk % 60} dk ` : ''}önce bitti` : `${dk} dk önce bitti`;
  };

  if (hata && !gt) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger-fg">
        {hata}
      </p>
    );
  }
  if (!gt) return <p className="text-xs text-muted">Okul geneli yükleniyor…</p>;
  if (!ayar?.kayitli) return <p className="text-xs text-muted">Ders saatleri kaydedilmemiş (Yönetim › Ders programı).</p>;

  const baslik = `${GUN_ADLARI[isoGun(gun) - 1]} ${tarihUzun(gun)}${gun === bugun ? ' · Bugün' : ''}`;

  return (
    <div className="space-y-4" id="ders-okul-geneli">
      {/* Günün özeti */}
      <section className="rounded-2xl border border-line bg-surface shadow-card grid grid-cols-2 lg:grid-cols-4">
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted truncate">{baslik}</p>
          <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">
            {say.toplam} <span className="text-[13px] font-semibold text-muted">ders</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-surface-2 flex overflow-hidden" aria-hidden="true">
            <span className="bg-success" style={{ width: yuzde(say.alindi) }} />
            <span className="bg-danger" style={{ width: yuzde(say.geciken) }} />
            <span className="bg-warning" style={{ width: yuzde(say.bekliyor) }} />
            <span className="bg-line-strong" style={{ width: yuzde(say.sonra) }} />
          </div>
        </div>
        <div className="px-5 py-4 border-l border-line">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-success-fg">Alındı</p>
          <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{say.alindi}</p>
          <p className="text-xs text-muted">{say.gec ? `${say.gec} tanesi geç alındı` : 'Hepsi zamanında'}</p>
        </div>
        <button
          type="button"
          onClick={() => setSuzgec(suzgec === 'geciken' ? 'hepsi' : 'geciken')}
          disabled={!say.geciken}
          className="px-5 py-4 border-t lg:border-t-0 lg:border-l border-line text-left enabled:hover:bg-surface-2 transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-danger-fg">Geciken</p>
          <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{say.geciken}</p>
          <p className="text-xs text-muted">Ders bitiminden {ayar.gecikmeDk} dk sonra</p>
        </button>
        <div className="px-5 py-4 border-t lg:border-t-0 border-l border-line">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warning-fg">Bekliyor</p>
          <p className="text-[26px] font-extrabold tracking-tight tabular-nums mt-0.5">{say.bekliyor}</p>
          <p className="text-xs text-muted">Henüz gelmedi: {say.sonra}</p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Yoklama haritası */}
        <section className="rounded-2xl border border-line bg-surface shadow-card min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold">Yoklama haritası</h3>
              <p className="text-xs text-muted">Sınıf × ders saati. Kareye tıklayınca dersin yoklaması açılır.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setGun(gunEkle(gun, -1))} aria-label="Önceki gün">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setGun(gunEkle(gun, 1))} disabled={gun >= bugun} aria-label="Sonraki gün">
                <ChevronRight className="w-4 h-4" />
              </button>
              {gun !== bugun && (
                <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-20 justify-center" onClick={() => setGun(bugun)}>
                  Bugün
                </button>
              )}
              <Segmented
                size="sm"
                value={suzgec}
                onChange={setSuzgec}
                items={[
                  { value: 'hepsi', label: 'Hepsi', id: 'okul-suzgec-hepsi' },
                  { value: 'geciken', label: 'Geciken', id: 'okul-suzgec-geciken' },
                ]}
              />
            </div>
          </div>
          {satirlar.length === 0 ? (
            <p className="text-xs text-muted px-5 py-6">Bu gün programda ders yok.</p>
          ) : (
            <div className="overflow-x-auto px-4 pt-3 pb-2">
              <div className="grid gap-1.5 items-center min-w-[560px]" style={{ gridTemplateColumns: `64px repeat(${siralar.length}, minmax(44px, 1fr)) 64px` }}>
                <div />
                {siralar.map((s) => (
                  <div key={s} className="text-center text-[11.5px] font-semibold text-muted leading-tight">
                    {s}
                    <span className="block font-medium text-subtle tabular-nums">{ayar.saatler[s - 1]?.bas || ''}</span>
                  </div>
                ))}
                <div className="text-center text-[11.5px] font-semibold text-muted">Alındı</div>
                {satirlar.map((r) => {
                  const planli = Array.from(r.hucre.values());
                  const alinan = planli.filter((h) => h.durum === 'alindi').length;
                  const gecmis = planli.filter((h) => h.durum !== 'sonra').length;
                  return (
                    <React.Fragment key={r.classId}>
                      <div className="text-[13px] font-bold truncate">{r.classAd}</div>
                      {siralar.map((s) => {
                        const h = r.hucre.get(s);
                        if (!h) return <div key={s} className="h-10 rounded-lg border border-dashed border-line" aria-hidden="true" />;
                        const soluk = suzgec === 'geciken' && h.durum !== 'geciken';
                        const tam = `${r.classAd} · ${s}. ders · ${h.ders} · ${h.teacherAdlari.join(', ')} · ${AD[h.durum]}${h.oturum?.alanAd ? ` (${h.oturum.alanAd})` : ''}`;
                        return (
                          <button
                            key={s}
                            type="button"
                            title={tam}
                            aria-label={tam}
                            onClick={() => setHedef({ classId: r.classId, tarih: gun, sira: s })}
                            className={cx(
                              'h-10 rounded-lg border text-[11px] font-bold tabular-nums',
                              'transition-[scale,opacity] duration-150 hover:scale-[1.06] active:scale-[0.96]',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                              KARE[h.durum],
                              soluk && 'opacity-25'
                            )}
                          >
                            {kareYazi(h)}
                          </button>
                        );
                      })}
                      <div className="text-center text-[11.5px] font-bold text-fg-2 tabular-nums">
                        {alinan}/{gecmis || planli.length}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 pb-4 pt-1 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success" />Alındı</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-danger" />Geciken</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />Bekliyor</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-line-strong" />Sonra</span>
          </div>
        </section>

        {/* Geciken + izinler */}
        <section className="rounded-2xl border border-line bg-surface shadow-card self-start">
          <div className="px-5 py-4 border-b border-line">
            <h3 className="text-[15px] font-bold">Geciken yoklamalar</h3>
            <p className="text-xs text-muted">Öğretmene ve idareye hatırlatma gider.</p>
          </div>
          {gecikenler.length === 0 ? (
            <p className="text-xs text-muted px-5 py-4">Geciken yoklama yok.</p>
          ) : (
            gecikenler.map((h) => (
              <button
                key={`${h.classId}-${h.sira}`}
                type="button"
                onClick={() => setHedef({ classId: h.classId, tarih: gun, sira: h.sira })}
                className="w-full grid grid-cols-[36px_1fr_auto] gap-3 items-center px-5 py-2.5 border-t border-line first:border-t-0 text-left hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span className="w-9 h-9 rounded-lg bg-surface-3 text-fg-2 text-[11px] font-bold flex items-center justify-center">{basHarf(h.teacherAdlari[0] || '?')}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold truncate">{h.teacherAdlari.join(', ') || 'Öğretmen'}</span>
                  <span className="block text-xs text-muted truncate">
                    {h.classAd} · {h.sira}. ders {h.ders}
                  </span>
                </span>
                <span className="rounded-md bg-danger-soft text-danger-fg px-2 py-0.5 text-[11px] font-bold whitespace-nowrap">{gecikmeYazi(h)}</span>
              </button>
            ))
          )}
          <div className="px-5 py-4 border-y border-line">
            <h3 className="text-[15px] font-bold">Gün boyu izinler</h3>
            <p className="text-xs text-muted">Yoklamaya kendiliğinden yazılır.</p>
          </div>
          {izinler.length === 0 ? (
            <p className="text-xs text-muted px-5 py-4">Bu gün izinli / raporlu öğrenci yok.</p>
          ) : (
            izinler.map((z) => {
              const o = ogrenci.get(z.studentId);
              const ad = o?.name || 'Öğrenci';
              return (
                <div key={`${z.studentId}-${z.tarih}`} className="grid grid-cols-[36px_1fr_auto] gap-3 items-center px-5 py-2.5 border-t border-line first:border-t-0">
                  <span className="w-9 h-9 rounded-lg bg-surface-3 text-fg-2 text-[11px] font-bold flex items-center justify-center">{basHarf(ad)}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{ad}</span>
                    <span className="block text-xs text-muted truncate">
                      {(o?.classId && sinifAd.get(o.classId)) || ''}
                      {z.aciklama ? ` · ${z.aciklama}` : ''}
                    </span>
                  </span>
                  <span
                    className={cx(
                      'w-16 text-center rounded-md px-2 py-0.5 text-[11px] font-bold',
                      z.tur === 'raporlu' ? 'bg-warning-soft text-warning-fg' : 'bg-brand-soft text-brand-fg'
                    )}
                  >
                    {z.tur === 'raporlu' ? 'Raporlu' : 'İzinli'}
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>

      <DersYoklamaModal hedef={hedef} kurumId={kurumId} onClose={() => setHedef(null)} onSaved={() => void yukle()} />
    </div>
  );
};
