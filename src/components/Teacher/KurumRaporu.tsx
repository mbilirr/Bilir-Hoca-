import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Printer, FileBarChart } from 'lucide-react';
import type { ClassGroup, Etut, GradeRecord, Homework, HomeworkSubmission, Student, Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { Modal, Segmented, cx } from '../ui/kit';
import { hasEtutAttendance } from '../../lib/etutTiming';
import { odevTeslimGruplari } from '../../lib/odevTeslim';
import { tabloYazdir, YazdirTablo } from '../../lib/tabloYazdir';
import {
  DersAyar,
  DevamsizlikSatiri,
  GUN_ADLARI,
  GunDurum,
  GunHucre,
  OgretmenYoklamaSatiri,
  dersCanliDinle,
  devamsizlikRapor,
  gunEkle,
  gunTablosu,
  haftaBasi,
  isoGun,
  ogretmenYoklamaRapor,
  tarihUzun,
  trBugun,
} from '../../services/dersService';
import { DersYoklamaModal, DersYoklamaHedef } from './DersYoklamaModal';

// ============================================================================
// Aşama 221: KURUM RAPORU — idarenin ayrıntılı ekranı (ana sayfada değil, ayrı pencere).
//  * Yoklama: seçili günde sınıf × ders saati; durumlar sunucuda (alındı / geciken / bekliyor / sonra)
//  * Devamsızlık: tarih aralığında öğrenci bazında (ders yoklaması)
//  * Öğretmenler: ders yoklaması (sunucu) + ödev / etüt / not sayıları (bellekteki kayıtlar)
//  * Ödevler: teslim tarihi aralıkta olan ödevlerin teslim oranı (sınıf / öğretmen)
// Her bölüm: Yazdır (A4) + Excel. Veri yalnız pencere açıkken ve yalnız seçili bölüm için okunur.
// ============================================================================

type Bolum = 'yoklama' | 'devamsizlik' | 'ogretmen' | 'odev';
const BTN = 'ui-btn ui-btn-sm ui-btn-secondary h-8 w-28 justify-center';
const DAY = 86400000;
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

const DURUM_RENK: Record<GunDurum, string> = {
  alindi: 'bg-success-soft text-success-fg',
  geciken: 'bg-danger-soft text-danger-fg',
  bekliyor: 'bg-warning-soft text-warning-fg',
  sonra: 'bg-surface-2 text-muted',
};
const DURUM_AD: Record<GunDurum, string> = { alindi: 'Alındı', geciken: 'Geciken', bekliyor: 'Bekliyor', sonra: 'Sonra' };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Açılınca gösterilecek bölüm (ana sayfadan "Geciken" ile gelince Yoklama) */
  ilkBolum?: Bolum;
  etuts: Etut[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
}

export const KurumRaporu: React.FC<Props> = ({ open, onClose, ilkBolum = 'yoklama', etuts, homeworks, submissions, students, classes }) => {
  const kurumId = dataService.getMyKurum().kurumId;
  const kurumAd = dataService.getMyKurum().kurumName || '';
  const bugun = trBugun(); // Aşama 234: Türkiye günü (sunucu saati)
  const [bolum, setBolum] = useState<Bolum>(ilkBolum);
  useEffect(() => {
    if (open) setBolum(ilkBolum);
  }, [open, ilkBolum]);

  // ---- tarih seçimleri
  const [gun, setGun] = useState(bugun);
  const [bas, setBas] = useState(haftaBasi(bugun));
  const [bit, setBit] = useState(bugun);
  const aralikHata = !bas || !bit || bit < bas ? 'Bitiş başlangıçtan önce olamaz.' : Math.round((Date.parse(bit) - Date.parse(bas)) / DAY) > 92 ? 'En fazla 93 gün seçilebilir.' : null;
  const aralikYazi = `${tarihUzun(bas)} – ${tarihUzun(bit)}`;

  // ---- Yoklama (gün tablosu)
  const [gt, setGt] = useState<{ ayar: DersAyar | null; hucreler: GunHucre[] } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [hedef, setHedef] = useState<DersYoklamaHedef | null>(null);
  const yukleGun = useCallback(async () => {
    try {
      setGt(await gunTablosu(gun));
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Rapor okunamadı.');
    }
  }, [gun]);
  useEffect(() => {
    if (!open || bolum !== 'yoklama') return;
    setGt(null);
    void yukleGun();
    if (gun !== bugun) return;
    // Bugün: kayıt gelince canlı, süre dolunca (geciken) 5 dakikada bir
    const t = setInterval(() => document.visibilityState === 'visible' && void yukleGun(), 5 * 60_000);
    const kapat = dersCanliDinle(kurumId, ['ders_yoklama_oturum', 'ders_programi', 'kurum_ders_ayar', 'kurum_ders_tatil'], () => void yukleGun());
    return () => {
      clearInterval(t);
      kapat();
    };
  }, [open, bolum, gun, bugun, kurumId, yukleGun]);

  const gunSatirlar = useMemo(() => {
    const m = new Map<string, { classId: string; classAd: string; hucre: Map<number, GunHucre> }>();
    for (const h of gt?.hucreler || []) {
      if (!m.has(h.classId)) m.set(h.classId, { classId: h.classId, classAd: h.classAd, hucre: new Map() });
      m.get(h.classId)!.hucre.set(h.sira, h);
    }
    return Array.from(m.values()).sort((a, b) => trSirala(a.classAd, b.classAd));
  }, [gt]);
  const siraSayisi = Math.max(gt?.ayar?.dersSayisi || 0, ...(gt?.hucreler || []).map((h) => h.sira));
  const siralar = Array.from({ length: siraSayisi }, (_, i) => i + 1);
  const gunSay = useMemo(() => {
    const s: Record<GunDurum, number> = { alindi: 0, geciken: 0, bekliyor: 0, sonra: 0 };
    for (const h of gt?.hucreler || []) s[h.durum] += 1;
    return s;
  }, [gt]);
  const hucreYazi = (h: GunHucre) => {
    if (h.durum !== 'alindi') return DURUM_AD[h.durum];
    const yok = (h.oturum?.sayilar.absent || 0) + (h.oturum?.sayilar.excused || 0);
    return `${yok ? `${yok} yok` : 'Tam'}${h.oturum?.gec ? ' · geç' : ''}`;
  };

  // ---- Devamsızlık
  const [dv, setDv] = useState<DevamsizlikSatiri[] | null>(null);
  const [dvSinif, setDvSinif] = useState('');
  useEffect(() => {
    if (!open || bolum !== 'devamsizlik' || aralikHata) return;
    let canli = true;
    setDv(null);
    devamsizlikRapor(bas, bit)
      .then((r) => canli && (setDv(r), setHata(null)))
      .catch((e) => canli && setHata(e?.message || 'Rapor okunamadı.'));
    return () => {
      canli = false;
    };
  }, [open, bolum, bas, bit, aralikHata]);
  const dvSiniflar = useMemo(() => Array.from(new Set((dv || []).map((r) => r.classAd).filter(Boolean))).sort(trSirala), [dv]);
  const dvListe = useMemo(() => (dv || []).filter((r) => !dvSinif || r.classAd === dvSinif), [dv, dvSinif]);

  // ---- Öğretmenler
  const [oy, setOy] = useState<OgretmenYoklamaSatiri[] | null>(null);
  useEffect(() => {
    if (!open || bolum !== 'ogretmen' || aralikHata) return;
    let canli = true;
    setOy(null);
    ogretmenYoklamaRapor(bas, bit)
      .then((r) => canli && (setOy(r), setHata(null)))
      .catch((e) => {
        if (!canli) return;
        setOy([]); // ders yoklaması kurulu değilse öğretmen tablosu yine de (ödev / etüt / not) görünür
        setHata(e?.message || 'Ders yoklaması okunamadı.');
      });
    return () => {
      canli = false;
    };
  }, [open, bolum, bas, bit, aralikHata]);
  const ogretmenSatirlar = useMemo(() => {
    if (bolum !== 'ogretmen') return [];
    const teachers: Teacher[] = dataService
      .getTeachers()
      .filter((t) => t.kurumId === kurumId && (t.status || 'approved') === 'approved');
    const grades: GradeRecord[] = dataService.getGrades();
    const rows = new Map<string, { id: string; ad: string; planli: number; alinan: number; alinmayan: number; gec: number; odev: number; etut: number; etutYok: number; not: number }>();
    const byAuth = new Map<string, string>();
    for (const t of teachers) {
      rows.set(t.id, { id: t.id, ad: t.name, planli: 0, alinan: 0, alinmayan: 0, gec: 0, odev: 0, etut: 0, etutYok: 0, not: 0 });
      if (t.auth_user_id) byAuth.set(t.auth_user_id, t.id);
    }
    for (const o of oy || []) {
      const r = rows.get(o.teacherId) || { id: o.teacherId, ad: o.ad, planli: 0, alinan: 0, alinmayan: 0, gec: 0, odev: 0, etut: 0, etutYok: 0, not: 0 };
      Object.assign(r, { planli: o.planli, alinan: o.alinan, alinmayan: o.alinmayan, gec: o.gec });
      rows.set(o.teacherId, r);
    }
    const sonMs = Date.parse(`${bit}T23:59:59`);
    const basMs = Date.parse(`${bas}T00:00:00`);
    for (const h of homeworks) {
      const at = new Date(h.createdAt || h.assignedDate || 0).getTime();
      if (!(at >= basMs && at <= sonMs)) continue;
      const r = rows.get(dataService.homeworkOwner(h).id);
      if (r) r.odev++;
    }
    const enGec = bit < bugun ? bit : bugun;
    for (const e of etuts) {
      if (e.date < bas || e.date > enGec) continue;
      const ids = new Set<string>([...(e.teacherIds || []), ...(e.teacherId ? [e.teacherId] : [])]);
      const alindi = hasEtutAttendance(e);
      ids.forEach((id) => {
        const r = rows.get(id);
        if (!r) return;
        r.etut++;
        if (!alindi) r.etutYok++;
      });
    }
    for (const g of grades) {
      const d = (g.date || '').slice(0, 10);
      if (d < bas || d > bit) continue;
      const r = rows.get(byAuth.get(g.createdBy || '') || '');
      if (r) r.not++;
    }
    return Array.from(rows.values())
      .filter((r) => r.planli + r.odev + r.etut + r.not > 0 || teachers.some((t) => t.id === r.id))
      .sort((a, b) => b.alinmayan - a.alinmayan || a.ad.localeCompare(b.ad, 'tr'));
  }, [bolum, oy, homeworks, etuts, bas, bit, bugun, kurumId]);

  // ---- Ödevler
  const [odevBy, setOdevBy] = useState<'sinif' | 'ogretmen'>('sinif');
  const odevSatirlar = useMemo(() => {
    if (bolum !== 'odev') return [];
    // Aşama 246: hesap tek yerde (müdür ana sayfasındaki ödev teslimi de aynı hesap)
    return Array.from(odevTeslimGruplari(homeworks, submissions, students, classes, bas, bit, odevBy).values())
      .map((g) => ({ ...g, oran: pct(g.done, g.exp) }))
      .sort((a, b) => a.oran - b.oran || trSirala(a.ad, b.ad));
  }, [bolum, homeworks, submissions, students, classes, bas, bit, odevBy]);

  // ---- Çıktı tabloları (ekrandaki tablonun aynısı)
  const cikti = (): { baslik: string; alt: string; tablo: YazdirTablo; yatay: boolean } | null => {
    if (bolum === 'yoklama') {
      return {
        baslik: 'Ders yoklaması',
        alt: `${GUN_ADLARI[isoGun(gun) - 1]} ${tarihUzun(gun)} · Alındı ${gunSay.alindi} · Geciken ${gunSay.geciken} · Bekliyor ${gunSay.bekliyor}`,
        yatay: true,
        tablo: {
          head: ['Sınıf', ...siralar.map((s) => `${s}. ders`)],
          rows: gunSatirlar.map((r) => [
            r.classAd,
            ...siralar.map((s) => {
              const h = r.hucre.get(s);
              return h ? `${h.ders} – ${hucreYazi(h)}` : '';
            }),
          ]),
        },
      };
    }
    if (bolum === 'devamsizlik') {
      return {
        baslik: 'Devamsızlık (ders yoklaması)',
        alt: `${aralikYazi}${dvSinif ? ` · ${dvSinif}` : ''}`,
        yatay: false,
        tablo: {
          head: ['Öğrenci', 'No', 'Sınıf', 'Gelmedi (ders)', 'Gün', 'Geç', 'İzinli'],
          rows: dvListe.map((r) => [r.ad, r.no, r.classAd, r.absent, r.gun, r.late, r.excused]),
          sayiDan: 3,
        },
      };
    }
    if (bolum === 'ogretmen') {
      return {
        baslik: 'Öğretmen etkinliği',
        alt: aralikYazi,
        yatay: true,
        tablo: {
          head: ['Öğretmen', 'Ders', 'Yoklama alınan', 'Alınmayan', 'Geç alınan', 'Ödev', 'Etüt', 'Etüt yoklaması yok', 'Not'],
          rows: ogretmenSatirlar.map((r) => [r.ad, r.planli, r.alinan, r.alinmayan, r.gec, r.odev, r.etut, r.etutYok, r.not]),
          sayiDan: 1,
        },
      };
    }
    return {
      baslik: `Ödev teslim oranı (${odevBy === 'sinif' ? 'sınıfa' : 'öğretmene'} göre)`,
      alt: `Teslim tarihi ${aralikYazi}`,
      yatay: false,
      tablo: {
        head: [odevBy === 'sinif' ? 'Sınıf' : 'Öğretmen', 'Ödev', 'Beklenen', 'Teslim', 'Oran %'],
        rows: odevSatirlar.map((r) => [r.ad, r.odev, r.exp, r.done, r.oran]),
        sayiDan: 1,
      },
    };
  };
  const yazdir = () => {
    const c = cikti();
    if (!c) return;
    if (!tabloYazdir({ kurum: kurumAd, baslik: c.baslik, alt: c.alt, tablolar: [c.tablo], yatay: c.yatay })) {
      setHata('Yazdırma penceresi açılamadı. Tarayıcıda açılır pencere iznini verin.');
    }
  };
  const excel = async () => {
    const c = cikti();
    if (!c) return;
    try {
      const { downloadExcel } = await import('./EtutAnalysisExport');
      const ad = `${c.baslik.split(' (')[0]}`.replace(/[^\p{L}\p{N}]+/gu, '-');
      await downloadExcel(`${ad}-${bolum === 'yoklama' ? gun : `${bas}_${bit}`}.xlsx`, [
        { name: c.baslik.slice(0, 31), meta: [['Kurum', kurumAd], ['Rapor', c.baslik], ['Kapsam', c.alt], ['Oluşturma', new Date().toLocaleString('tr-TR')]], table: { title: c.baslik, head: c.tablo.head, rows: c.tablo.rows } },
      ]);
    } catch (e: any) {
      setHata(e?.message || 'Excel dosyası hazırlanamadı.');
    }
  };

  const yukleniyor = (bolum === 'yoklama' && !gt) || (bolum === 'devamsizlik' && !dv && !aralikHata) || (bolum === 'ogretmen' && !oy && !aralikHata);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      icon={FileBarChart}
      tone="brand"
      title="Kurum raporu"
      description={kurumAd || undefined}
      id="kurum-raporu"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <button type="button" className={BTN} onClick={yazdir} disabled={yukleniyor} id="kurum-raporu-yazdir">
            <Printer className="w-3.5 h-3.5" /> Yazdır
          </button>
          <button type="button" className={BTN} onClick={() => void excel()} disabled={yukleniyor} id="kurum-raporu-excel">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={onClose}>
            Kapat
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            size="sm"
            value={bolum}
            onChange={(b) => {
              setHata(null);
              setBolum(b);
            }}
            items={[
              { value: 'yoklama', label: 'Yoklama', id: 'kr-yoklama' },
              { value: 'devamsizlik', label: 'Devamsızlık', id: 'kr-devamsizlik' },
              { value: 'ogretmen', label: 'Öğretmenler', id: 'kr-ogretmen' },
              { value: 'odev', label: 'Ödevler', id: 'kr-odev' },
            ]}
          />
          {bolum === 'yoklama' ? (
            <div className="flex items-center gap-1.5">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setGun(gunEkle(gun, -1))} aria-label="Önceki gün">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input type="date" className="ui-field w-40" value={gun} max={bugun} onChange={(e) => e.target.value && setGun(e.target.value)} aria-label="Gün" />
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon" onClick={() => setGun(gunEkle(gun, 1))} disabled={gun >= bugun} aria-label="Sonraki gün">
                <ChevronRight className="w-4 h-4" />
              </button>
              {gun !== bugun && (
                <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => setGun(bugun)}>
                  Bugün
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="date" className="ui-field w-40" value={bas} max={bit || bugun} onChange={(e) => setBas(e.target.value)} aria-label="Başlangıç" />
              <span className="text-xs text-muted">–</span>
              <input type="date" className="ui-field w-40" value={bit} min={bas} onChange={(e) => setBit(e.target.value)} aria-label="Bitiş" />
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => (setBas(haftaBasi(bugun)), setBit(bugun))}>
                Bu hafta
              </button>
              <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary h-8" onClick={() => (setBas(gunEkle(bugun, -29)), setBit(bugun))}>
                30 gün
              </button>
            </div>
          )}
        </div>

        {aralikHata && bolum !== 'yoklama' && <p className="text-xs font-semibold text-danger-fg">{aralikHata}</p>}
        {hata && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        )}
        {yukleniyor && !hata && <p className="text-xs text-muted">Hazırlanıyor…</p>}

        {/* ---------------- Yoklama */}
        {bolum === 'yoklama' && gt && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-2">
              <span className="font-semibold text-fg">
                {GUN_ADLARI[isoGun(gun) - 1]} {tarihUzun(gun)} · {gt.hucreler.length} ders
              </span>
              {(['alindi', 'geciken', 'bekliyor', 'sonra'] as GunDurum[]).map((d) => (
                <span key={d} className="flex items-center gap-1.5">
                  <span className={cx('w-3 h-3 rounded', DURUM_RENK[d])} aria-hidden="true" />
                  {DURUM_AD[d]} · {gunSay[d]}
                </span>
              ))}
              {gt.ayar?.kayitli && <span className="text-muted">Geciken: ders bitiminden {gt.ayar.gecikmeDk} dk sonra</span>}
            </div>
            {!gt.ayar?.kayitli ? (
              <p className="text-xs text-muted">Ders saatleri kaydedilmemiş (Yönetim › Ders programı).</p>
            ) : gunSatirlar.length === 0 ? (
              <p className="text-xs text-muted">Bu gün programda ders yok.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line" id="kr-gun-tablo">
                <table className="w-full border-collapse text-xs" style={{ minWidth: `${8 + siralar.length * 7}rem` }}>
                  <thead>
                    <tr className="bg-surface-2 text-fg-2">
                      <th className="sticky left-0 bg-surface-2 text-left px-2 py-2 font-semibold w-24">Sınıf</th>
                      {siralar.map((s) => (
                        <th key={s} className="px-1 py-2 font-semibold text-center border-l border-line">
                          {s}. ders
                          {gt.ayar?.saatler[s - 1] && <span className="block font-normal text-subtle tabular-nums">{gt.ayar.saatler[s - 1].bas}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gunSatirlar.map((r) => (
                      <tr key={r.classId} className="border-t border-line">
                        <th scope="row" className="sticky left-0 bg-surface text-left px-2 py-1 font-semibold text-fg">
                          {r.classAd}
                        </th>
                        {siralar.map((s) => {
                          const h = r.hucre.get(s);
                          return (
                            <td key={s} className="p-0.5 border-l border-line">
                              {h ? (
                                <button
                                  type="button"
                                  onClick={() => setHedef({ classId: h.classId, tarih: gun, sira: h.sira })}
                                  title={`${h.ders} · ${h.teacherAdlari.join(', ')}${h.oturum ? ` · ${h.oturum.alanAd}` : ''}`}
                                  className={cx('w-full rounded-md px-1.5 py-1 text-left leading-tight hover:ring-1 hover:ring-line-strong', DURUM_RENK[h.durum])}
                                >
                                  <span className="block truncate font-semibold">{h.ders}</span>
                                  <span className="block truncate text-[10px]">{hucreYazi(h)}</span>
                                </button>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ---------------- Devamsızlık */}
        {bolum === 'devamsizlik' && dv && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-2">
              <select className="ui-field w-36" value={dvSinif} onChange={(e) => setDvSinif(e.target.value)} aria-label="Sınıf">
                <option value="">Bütün sınıflar</option>
                {dvSiniflar.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span>
                {dvListe.length} öğrenci · toplam {dvListe.reduce((n, r) => n + r.absent, 0)} ders gelmedi
              </span>
            </div>
            {dvListe.length === 0 ? (
              <p className="text-xs text-muted">Bu aralıkta ders yoklamasında devamsızlık yok.</p>
            ) : (
              <RaporTablo
                head={['Öğrenci', 'No', 'Sınıf', 'Gelmedi', 'Gün', 'Geç', 'İzinli']}
                sayiDan={3}
                rows={dvListe.map((r) => [r.ad, r.no, r.classAd, r.absent, r.gun, r.late, r.excused])}
              />
            )}
          </>
        )}

        {/* ---------------- Öğretmenler */}
        {bolum === 'ogretmen' && oy && (
          <>
            <p className="text-[11px] text-muted">Ders: başlamış ders saati. Alınmayan: gecikme süresi dolmuş, yoklaması yok. Ödev: verilen; Etüt / Not: aralıktaki kayıtlar.</p>
            <RaporTablo
              head={['Öğretmen', 'Ders', 'Alınan', 'Alınmayan', 'Geç alınan', 'Ödev', 'Etüt', 'Etüt yoklaması yok', 'Not']}
              sayiDan={1}
              uyariSutun={[3, 7]}
              rows={ogretmenSatirlar.map((r) => [r.ad, r.planli, r.alinan, r.alinmayan, r.gec, r.odev, r.etut, r.etutYok, r.not])}
            />
          </>
        )}

        {/* ---------------- Ödevler */}
        {bolum === 'odev' && (
          <>
            <Segmented
              size="sm"
              value={odevBy}
              onChange={setOdevBy}
              items={[
                { value: 'sinif', label: 'Sınıfa göre', id: 'kr-odev-sinif' },
                { value: 'ogretmen', label: 'Öğretmene göre', id: 'kr-odev-ogretmen' },
              ]}
            />
            {odevSatirlar.length === 0 ? (
              <p className="text-xs text-muted">Bu aralıkta teslim tarihi olan ödev yok.</p>
            ) : (
              <RaporTablo
                head={[odevBy === 'sinif' ? 'Sınıf' : 'Öğretmen', 'Ödev', 'Beklenen', 'Teslim', 'Oran %']}
                sayiDan={1}
                rows={odevSatirlar.map((r) => [r.ad, r.odev, r.exp, r.done, r.oran])}
              />
            )}
          </>
        )}
      </div>

      <DersYoklamaModal hedef={hedef} kurumId={kurumId} onClose={() => setHedef(null)} onSaved={() => void yukleGun()} />
    </Modal>
  );
};

// Sade tablo (ekran); uyarı sütunlarında sıfırdan büyük sayı kırmızı
const RaporTablo: React.FC<{ head: string[]; rows: Array<Array<string | number>>; sayiDan?: number; uyariSutun?: number[] }> = ({ head, rows, sayiDan = 99, uyariSutun = [] }) => (
  <div className="overflow-x-auto rounded-xl border border-line">
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-surface-2 text-fg-2">
          {head.map((h, i) => (
            <th key={h} className={cx('px-2 py-2 font-semibold whitespace-nowrap', i >= sayiDan ? 'text-right' : 'text-left')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, i) => (
              <td
                key={i}
                className={cx(
                  'px-2 py-1.5',
                  i >= sayiDan ? 'text-right tabular-nums' : 'text-fg',
                  i === 0 && 'font-semibold',
                  uyariSutun.includes(i) && Number(c) > 0 ? 'font-bold text-danger-fg' : i >= sayiDan && Number(c) === 0 ? 'text-subtle' : ''
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
