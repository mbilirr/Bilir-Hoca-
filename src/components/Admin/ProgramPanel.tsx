import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, Users } from 'lucide-react';
import type { ClassGroup } from '../../types';
import { Modal, Panel, Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import {
  DersAyar,
  GUN_ADLARI,
  GUN_KISA,
  ProgramSatiri,
  SinifDersOgretmen,
  dersAyarOku,
  dersCanliDinle,
  guncelProgram,
  programOgretmenAta,
  programSinifAta,
  sinifDersOgretmenleri,
} from '../../services/dersService';

// ============================================================================
// Aşama 219: DERS PROGRAMI (yönetici) — öğretmene göre ya da sınıfa göre haftalık ızgara.
// Hücreye tıklanınca seçim penceresi açılır; seçenekler yalnız "Sınıf öğretmenleri"ndeki eşleşmelerdir.
// Kurallar veritabanında da denetlenir (öğretmen aynı saatte tek sınıf, sınıf aynı saatte tek ders).
// Değişiklik kaydedildiği günden itibaren geçerlidir; geçmiş günler ve alınmış yoklamalar değişmez.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
const STORE_KEY = 'edu_ders_program_v1';
type Gorunum = 'ogretmen' | 'sinif';

interface Hucre {
  gun: number;
  sira: number;
}

const okunan = (): { g: Gorunum; t: string; c: string } => {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || '{}') || {};
    return { g: v.g === 'sinif' ? 'sinif' : 'ogretmen', t: String(v.t || ''), c: String(v.c || '') };
  } catch {
    return { g: 'ogretmen', t: '', c: '' };
  }
};

export const ProgramPanel: React.FC<{ kurumId: string; classes: ClassGroup[] }> = ({ kurumId, classes }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => dataService.subscribe(() => setTick((t) => t + 1)), []);
  const ilk = useMemo(okunan, []);
  const [gorunum, setGorunum] = useState<Gorunum>(ilk.g);
  const [teacherId, setTeacherId] = useState(ilk.t);
  const [classId, setClassId] = useState(ilk.c);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ g: gorunum, t: teacherId, c: classId }));
    } catch {
      /* depolama kapalı */
    }
  }, [gorunum, teacherId, classId]);

  const siniflar = useMemo(() => {
    const granted = new Set(dataService.getMyKurum().grantedClassIds || []);
    return classes
      .filter((c) => (c.kurumId || '') === kurumId || granted.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, kurumId, tick]);
  const sinifAd = useMemo(() => new Map(siniflar.map((c) => [c.id, c.name])), [siniflar]);
  const ogretmenler = useMemo(
    () =>
      dataService
        .getAllTeachersInternal()
        .filter((t) => (t.kurumId || '') === kurumId && (t.status || 'approved') === 'approved')
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kurumId, tick]
  );
  const ogretmenAd = useMemo(() => new Map(ogretmenler.map((t) => [t.id, t.name])), [ogretmenler]);

  const [ayar, setAyar] = useState<DersAyar | null>(null);
  const [program, setProgram] = useState<ProgramSatiri[]>([]);
  const [atamalar, setAtamalar] = useState<SinifDersOgretmen[]>([]);
  const [yuklendi, setYuklendi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      const a = await dersAyarOku();
      const bugun = a?.bugun || '';
      const [p, s] = await Promise.all([bugun ? guncelProgram(kurumId, bugun) : Promise.resolve([]), sinifDersOgretmenleri(kurumId)]);
      setAyar(a);
      setProgram(p);
      setAtamalar(s);
      setHata(null);
    } catch (e: any) {
      setHata(e?.message || 'Program okunamadı.');
    } finally {
      setYuklendi(true);
    }
  }, [kurumId]);

  useEffect(() => {
    void yukle();
    return dersCanliDinle(kurumId, ['kurum_ders_ayar', 'sinif_ders_ogretmen', 'ders_programi'], () => void yukle());
  }, [kurumId, yukle]);

  // Programı olan / ataması olan öğretmen ilk seçilsin
  useEffect(() => {
    if (!ogretmenler.length) return;
    if (!teacherId || !ogretmenler.some((t) => t.id === teacherId)) {
      const ilkAtanan = ogretmenler.find((t) => atamalar.some((a) => a.teacherId === t.id));
      setTeacherId((ilkAtanan || ogretmenler[0]).id);
    }
  }, [ogretmenler, atamalar, teacherId]);
  useEffect(() => {
    if (siniflar.length && (!classId || !siniflar.some((c) => c.id === classId))) setClassId(siniflar[0].id);
  }, [siniflar, classId]);

  // gun-sira anahtarına göre program satırları
  const anahtar = (gun: number, sira: number) => `${gun}-${sira}`;
  const ogretmenSlot = useMemo(() => {
    const m = new Map<string, ProgramSatiri>();
    for (const p of program) if (p.teacherId === teacherId) m.set(anahtar(p.gun, p.sira), p);
    return m;
  }, [program, teacherId]);
  const sinifSlot = useMemo(() => {
    const m = new Map<string, ProgramSatiri[]>();
    for (const p of program) {
      const k = `${p.classId}|${anahtar(p.gun, p.sira)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [program]);
  const ogretmenMesgul = useMemo(() => {
    const m = new Map<string, ProgramSatiri>();
    for (const p of program) m.set(`${p.teacherId}|${anahtar(p.gun, p.sira)}`, p);
    return m;
  }, [program]);

  const toplam = useMemo(
    () => (gorunum === 'ogretmen' ? ogretmenSlot.size : new Set(program.filter((p) => p.classId === classId).map((p) => anahtar(p.gun, p.sira))).size),
    [gorunum, ogretmenSlot, program, classId]
  );

  // ---------------------------------------------------------------- seçim penceresi
  const [secili, setSecili] = useState<Hucre | null>(null);
  const [secim, setSecim] = useState<string>(''); // öğretmen görünümü: "classId|ders"; sınıf görünümü: ders
  const [secTids, setSecTids] = useState<string[]>([]);
  const [kayit, setKayit] = useState(false);
  const [pHata, setPHata] = useState<string | null>(null);

  const ac = (h: Hucre) => {
    setPHata(null);
    setSecili(h);
    if (gorunum === 'ogretmen') {
      const p = ogretmenSlot.get(anahtar(h.gun, h.sira));
      setSecim(p ? `${p.classId}|${p.ders}` : '');
    } else {
      const ps = sinifSlot.get(`${classId}|${anahtar(h.gun, h.sira)}`) || [];
      setSecim(ps[0]?.ders || '');
      setSecTids(ps.map((p) => p.teacherId));
    }
  };

  // Öğretmen görünümü seçenekleri: öğretmenin bütün sınıf+ders eşleşmeleri
  const ogretmenSecenek = useMemo(() => {
    if (!secili || gorunum !== 'ogretmen') return [];
    const k = anahtar(secili.gun, secili.sira);
    return atamalar
      .filter((a) => a.teacherId === teacherId)
      .map((a) => {
        const dolu = (sinifSlot.get(`${a.classId}|${k}`) || []).filter((p) => p.teacherId !== teacherId);
        const baska = dolu.find((p) => p.ders !== a.ders);
        const ortak = dolu.filter((p) => p.ders === a.ders);
        return {
          deger: `${a.classId}|${a.ders}`,
          ad: `${sinifAd.get(a.classId) || a.classId} · ${a.ders}`,
          pasif: !!baska,
          not: baska
            ? `Dolu: ${baska.ders} · ${ogretmenAd.get(baska.teacherId) || ''}`
            : ortak.length
              ? `Ortak ders: ${ortak.map((p) => ogretmenAd.get(p.teacherId) || '').join(', ')}`
              : 'Bu saatte boş',
        };
      })
      .sort((x, y) => x.ad.localeCompare(y.ad, 'tr', { numeric: true }));
  }, [secili, gorunum, atamalar, teacherId, sinifSlot, sinifAd, ogretmenAd]);

  // Sınıf görünümü seçenekleri: sınıfın dersleri ve dersin öğretmenleri
  const sinifDersleri = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of atamalar) {
      if (a.classId !== classId) continue;
      if (!m.has(a.ders)) m.set(a.ders, []);
      m.get(a.ders)!.push(a.teacherId);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [atamalar, classId]);
  const dersOgretmenleri = useMemo(() => sinifDersleri.find(([d]) => d === secim)?.[1] || [], [sinifDersleri, secim]);
  const mesgulNot = (tid: string): string | null => {
    if (!secili) return null;
    const p = ogretmenMesgul.get(`${tid}|${anahtar(secili.gun, secili.sira)}`);
    if (!p || p.classId === classId) return null;
    return `Bu saatte ${sinifAd.get(p.classId) || 'başka sınıfta'}`;
  };
  const dersSec = (d: string) => {
    setSecim(d);
    const tids = sinifDersleri.find(([x]) => x === d)?.[1] || [];
    setSecTids(tids.filter((t) => !mesgulNot(t)));
  };

  const kaydet = async (bos: boolean) => {
    if (!secili || kayit) return;
    setKayit(true);
    setPHata(null);
    try {
      if (gorunum === 'ogretmen') {
        const [cid, ...dp] = bos || !secim ? [''] : secim.split('|');
        await programOgretmenAta(teacherId, secili.gun, secili.sira, cid || null, cid ? dp.join('|') : null);
      } else {
        await programSinifAta(classId, secili.gun, secili.sira, bos ? null : secim || null, bos ? [] : secTids);
      }
      setSecili(null);
      await yukle();
    } catch (e: any) {
      setPHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setKayit(false);
    }
  };

  // ---------------------------------------------------------------- çizim
  if (!yuklendi) {
    return (
      <Panel title="Ders programı" icon={CalendarDays} id="ders-programi">
        <p className="text-xs text-muted">Yükleniyor…</p>
      </Panel>
    );
  }
  if (hata && !ayar) {
    return (
      <Panel title="Ders programı" icon={CalendarDays} id="ders-programi">
        <p role="alert" className="text-xs font-semibold text-danger-fg">
          {hata}
        </p>
      </Panel>
    );
  }
  if (!ayar?.kayitli) {
    return (
      <Panel title="Ders programı" icon={CalendarDays} id="ders-programi">
        <p className="text-xs text-warning-fg font-semibold">Önce "Ders saatleri" bölümünde ders sayısını ve saatleri kaydedin.</p>
      </Panel>
    );
  }

  const gunler = [...ayar.gunler].sort((a, b) => a - b);
  const siralar = Array.from({ length: ayar.dersSayisi }, (_, i) => i + 1);
  const seciliOgretmen = ogretmenler.find((t) => t.id === teacherId);
  const seciliSinif = siniflar.find((c) => c.id === classId);

  const hucreIcerik = (gun: number, sira: number) => {
    if (gorunum === 'ogretmen') {
      const p = ogretmenSlot.get(anahtar(gun, sira));
      if (!p) return null;
      const ortak = (sinifSlot.get(`${p.classId}|${anahtar(gun, sira)}`) || []).filter((x) => x.teacherId !== teacherId && x.ders === p.ders);
      return {
        ust: `${p.ders} · ${sinifAd.get(p.classId) || p.classId}`,
        alt: ortak.length ? `Ortak: ${ortak.map((x) => ogretmenAd.get(x.teacherId) || '').join(', ')}` : '',
      };
    }
    const ps = sinifSlot.get(`${classId}|${anahtar(gun, sira)}`) || [];
    if (!ps.length) return null;
    return { ust: ps[0].ders, alt: ps.map((x) => ogretmenAd.get(x.teacherId) || '').join(', ') };
  };

  return (
    <Panel
      title="Ders programı"
      icon={CalendarDays}
      id="ders-programi"
      description="Değişiklik bugünden itibaren geçerli olur. Geçmiş günler ve alınmış yoklamalar değişmez."
      actions={<span className="text-xs text-muted tabular-nums">Haftada {toplam} ders</span>}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={gorunum}
            onChange={setGorunum}
            items={[
              { value: 'ogretmen', label: 'Öğretmene göre', id: 'program-gorunum-ogretmen' },
              { value: 'sinif', label: 'Sınıfa göre', id: 'program-gorunum-sinif' },
            ]}
          />
          {gorunum === 'ogretmen' ? (
            <select className="ui-field w-64" aria-label="Öğretmen" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} id="program-ogretmen">
              {ogretmenler.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.branch ? ` · ${t.branch}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <select className="ui-field w-40" aria-label="Sınıf" value={classId} onChange={(e) => setClassId(e.target.value)} id="program-sinif">
              {siniflar.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {hata && (
          <p role="alert" className="text-xs font-semibold text-danger-fg">
            {hata}
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-line" id="program-izgara">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-fg-2">
                <th scope="col" className="w-10 py-2 font-semibold text-center">
                  #
                </th>
                <th scope="col" className="w-24 py-2 px-2 font-semibold text-left">
                  Saat
                </th>
                {gunler.map((g) => (
                  <th key={g} scope="col" className="py-2 px-2 font-semibold text-left border-l border-line">
                    <span className="hidden sm:inline">{GUN_ADLARI[g - 1]}</span>
                    <span className="sm:hidden">{GUN_KISA[g - 1]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {siralar.map((s) => {
                const saat = ayar.saatler[s - 1];
                return (
                  <tr key={s} className="border-t border-line">
                    <td className="text-center font-bold text-fg-2 tabular-nums">{s}</td>
                    <td className="px-2 text-fg-2 tabular-nums leading-tight">
                      {saat?.bas}
                      <br />
                      <span className="text-subtle">{saat?.bit}</span>
                    </td>
                    {gunler.map((g) => {
                      const ic = hucreIcerik(g, s);
                      const etiket = `${GUN_ADLARI[g - 1]} ${s}. ders`;
                      return (
                        <td key={g} className="p-1 border-l border-line align-top">
                          <button
                            type="button"
                            onClick={() => ac({ gun: g, sira: s })}
                            aria-label={ic ? `${etiket}: ${ic.ust}. Değiştir` : `${etiket}: boş. Ata`}
                            className={cx(
                              'w-full min-h-[44px] rounded-lg px-2 py-1 text-left flex flex-col justify-center gap-0.5 transition-colors',
                              ic ? 'bg-surface border border-line hover:border-line-strong' : 'border border-dashed border-line text-subtle hover:text-fg-2 hover:border-line-strong items-center'
                            )}
                          >
                            {ic ? (
                              <>
                                <span className="font-semibold text-fg truncate w-full">{ic.ust}</span>
                                {ic.alt && (
                                  <span className="text-[11px] text-muted truncate w-full flex items-center gap-1">
                                    <Users className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    {ic.alt}
                                  </span>
                                )}
                              </>
                            ) : (
                              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {gorunum === 'ogretmen' && seciliOgretmen && !atamalar.some((a) => a.teacherId === seciliOgretmen.id) && (
          <p className="text-xs text-warning-fg font-semibold">
            {seciliOgretmen.name} hiçbir sınıfın ders öğretmeni olarak yazılmamış. Önce "Sınıf öğretmenleri" bölümünden ekleyin.
          </p>
        )}
        {gorunum === 'sinif' && seciliSinif && sinifDersleri.length === 0 && (
          <p className="text-xs text-warning-fg font-semibold">{seciliSinif.name} için ders öğretmeni yazılmamış. Önce "Sınıf öğretmenleri" bölümünden ekleyin.</p>
        )}
      </div>

      <Modal
        open={!!secili}
        onClose={() => !kayit && setSecili(null)}
        size="sm"
        icon={CalendarDays}
        title={secili ? `${GUN_ADLARI[secili.gun - 1]} · ${secili.sira}. ders` : ''}
        description={
          secili
            ? `${ayar.saatler[secili.sira - 1]?.bas || ''}–${ayar.saatler[secili.sira - 1]?.bit || ''} · ${gorunum === 'ogretmen' ? seciliOgretmen?.name || '' : seciliSinif?.name || ''}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={() => void kaydet(true)} disabled={kayit}>
              Boş bırak
            </button>
            <button
              type="button"
              className={cx(BTN, 'ui-btn-primary')}
              onClick={() => void kaydet(false)}
              disabled={kayit || !secim || (gorunum === 'sinif' && secTids.length === 0)}
            >
              {kayit ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        }
      >
        {gorunum === 'ogretmen' ? (
          <div className="space-y-1" role="radiogroup" aria-label="Sınıf ve ders">
            {ogretmenSecenek.length === 0 && <p className="text-xs text-muted">Bu öğretmen hiçbir sınıfa ders öğretmeni olarak yazılmamış.</p>}
            {ogretmenSecenek.map((o) => (
              <label
                key={o.deger}
                className={cx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                  o.pasif ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2',
                  secim === o.deger && 'bg-brand-soft'
                )}
              >
                <input type="radio" name="program-secim" value={o.deger} checked={secim === o.deger} disabled={o.pasif} onChange={() => setSecim(o.deger)} />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-fg">{o.ad}</span>
                  <span className={cx('block text-[11px]', o.pasif ? 'text-danger-fg' : 'text-muted')}>{o.not}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-fg-2">
              Ders
              <select className="ui-field w-full" value={secim} onChange={(e) => dersSec(e.target.value)}>
                <option value="">Seçin</option>
                {sinifDersleri.map(([d]) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            {secim && (
              <fieldset className="space-y-1">
                <legend className="text-[11px] font-semibold text-fg-2 mb-1">Öğretmen(ler)</legend>
                {dersOgretmenleri.map((tid) => {
                  const not = mesgulNot(tid);
                  const on = secTids.includes(tid);
                  return (
                    <label key={tid} className={cx('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5', not ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-2')}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!!not}
                        onChange={() => setSecTids((cur) => (on ? cur.filter((x) => x !== tid) : [...cur, tid]))}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-fg">{ogretmenAd.get(tid) || 'Bilinmeyen öğretmen'}</span>
                        {not && <span className="block text-[11px] text-danger-fg">{not}</span>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </div>
        )}
        {pHata && (
          <p role="alert" className="mt-3 text-xs font-semibold text-danger-fg">
            {pHata}
          </p>
        )}
      </Modal>
    </Panel>
  );
};
