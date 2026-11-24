// ============================================================================
// Aşama 377: SINIFLAR VE DERSLER — öğretmen düzenleme › "Sınıflar ve dersler"
// Öğretmenin her şubedeki durumu tek pencerede: Yok / Görür / Derse girer (+ sınıf öğretmeni).
//   Derse girer = ders programı › Sınıf öğretmenleri kaydı (branş dersiyle) + sınıfı görme izni
//   Görür       = yalnız görme izni (öğrencileri görür, ödev/etüt verebilir; ders programında yoktur)
//   "Hepsini görür" = kademe izni (o düzeyin bütün şubeleri, sonradan açılanlar dahil)
// Ders programından yapılan atamalar da burada görünür (aynı kayıt). Ders başka öğretmendeyse kaydetmeden
// önce sorulur: birlikte girer (ortak ders) ya da değiştir. Hepsi tek işlemde yazılır (sql/377).
// Kademe (Ortaokul / Lise …) seçimi yalnız birden çok kademe varsa; altında 5-6-7-8 sekmeleri, bir seferde tek düzey.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, LayoutGrid, Star } from 'lucide-react';
import type { ClassGroup, UnifiedUser } from '../../../types';
import { Modal, Segmented, cx } from '../../ui/kit';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { dataService } from '../../../services/dataService';
import {
  ogretmenSiniflariKaydet,
  sinifDersOgretmenleri,
  sinifOgretmenleri,
  type SinifDersOgretmen,
  type SubeDurum,
} from '../../../services/dersService';
import { ALL_SUBJECTS, subjectsForBranch } from '../../../lib/subjects';
import { EMPTY_GRADES, fetchTeacherGrades, gradeOf, type TeacherGrades } from '../../../lib/teacherGrades';
import { basHarf } from '../../../lib/dersKisa';
import { WIDE_ROLES, wideRoleText } from './ortak';
import { useKullaniciBaglam } from './useKullaniciYonetimi';

type Kademe = 'ana' | 'ilk' | 'orta' | 'lise' | 'diger';
const KADEME_AD: Record<Kademe, string> = { ana: 'Anasınıfı', ilk: 'İlkokul', orta: 'Ortaokul', lise: 'Lise', diger: 'Diğer' };
const KADEME_SIRA: Kademe[] = ['ana', 'ilk', 'orta', 'lise', 'diger'];
const DURUM_AD: Record<SubeDurum, string> = { yok: 'Yok', gorur: 'Görür', ders: 'Derse girer' };
const DURUMLAR: SubeDurum[] = ['yok', 'gorur', 'ders'];
const SIRA: Record<SubeDurum, number> = { yok: 0, gorur: 1, ders: 2 };

const anahtar = (d: string) => d.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
const sinifSirala = (a: ClassGroup, b: ClassGroup) => a.name.localeCompare(b.name, 'tr', { numeric: true });
const anasinifi = (c: ClassGroup) => /ana\s*s[ıi]n[ıi]f|okul\s*öncesi|anaokul/i.test(`${c.gradeLevel || ''} ${c.name}`);
function kademeOf(c: ClassGroup): Kademe {
  if (anasinifi(c)) return 'ana';
  const g = gradeOf(c);
  if (g === null) return 'diger';
  return g <= 4 ? 'ilk' : g <= 8 ? 'orta' : 'lise';
}
/** Düzey sekmesinin anahtarı: "5", "6" … ya da "ana" / "diger" */
const duzeyOf = (c: ClassGroup): string => {
  const k = kademeOf(c);
  return k === 'ana' || k === 'diger' ? k : String(gradeOf(c));
};
const duzeyAd = (d: string) => (d === 'ana' ? 'Anasınıfı' : d === 'diger' ? 'Diğer' : `${d}. sınıf`);
/** "Ayşe Yılmaz" → "Ayşe Y." */
const kisaAd = (ad: string) => {
  const p = ad.trim().split(/\s+/);
  return p.length > 1 ? `${p.slice(0, -1).join(' ')} ${p[p.length - 1].charAt(0)}.` : ad;
};

interface Veri {
  sdo: SinifDersOgretmen[];
  so: Record<string, string>;
  soKurulu: boolean;
  gorme: Set<string>; // elle verilmiş görme izni
  kademe: TeacherGrades;
  kademeYok: boolean; // sql/102 kurulu değil
}

export function SiniflarVeDerslerPenceresi() {
  const { sinifDersUser: ogr, setSinifDersUser, classes, users, unvanlar, showToast, loadData, reloadAccessCounts } = useKullaniciBaglam();
  const kapat = () => setSinifDersUser(null);
  const kurumId = dataService.getMyKurumId();
  const authId = ogr ? ogr.auth_user_id || (/^[0-9a-f-]{36}$/i.test(ogr.id) ? ogr.id : null) : null;

  const [veri, setVeri] = useState<Veri | null>(null);
  const [hata, setHata] = useState('');
  const yukle = useCallback(async () => {
    if (!ogr || !kurumId) return;
    setHata('');
    try {
      const [sdo, so, erisim, kademe] = await Promise.all([
        sinifDersOgretmenleri(kurumId),
        sinifOgretmenleri(kurumId),
        authId ? dataService.getTeacherCloudAccess(authId) : Promise.resolve({ classIds: [] as string[] }),
        authId ? fetchTeacherGrades(authId) : Promise.resolve({ ...EMPTY_GRADES }),
      ]);
      setVeri({
        sdo,
        so: so.harita,
        soKurulu: so.kurulu,
        gorme: new Set(erisim.classIds || []),
        kademe: { grades: kademe.grades, all: kademe.all },
        kademeYok: (kademe as { missing?: boolean }).missing === true,
      });
    } catch (e: any) {
      setHata(e?.message || 'Bilgiler okunamadı.');
    }
  }, [ogr, kurumId, authId]);
  useEffect(() => {
    void yukle();
  }, [yukle]);

  // ------------------------------------------------------------------ ders
  const dersSecenek = useMemo(() => {
    const brans = subjectsForBranch(ogr?.branch);
    const mevcut = (veri?.sdo || []).filter((r) => r.teacherId === ogr?.id).map((r) => r.ders);
    const ilk: string[] = [];
    for (const d of [...brans, ...mevcut]) if (!ilk.some((x) => anahtar(x) === anahtar(d))) ilk.push(d);
    const diger = ALL_SUBJECTS.filter((d) => d !== 'Genel' && !ilk.some((x) => anahtar(x) === anahtar(d)));
    return { ilk, diger };
  }, [ogr, veri]);
  const [ders, setDers] = useState('');
  useEffect(() => {
    if (!ders && veri) setDers(dersSecenek.ilk[0] || '');
  }, [ders, veri, dersSecenek]);

  // ------------------------------------------------------------------ sınıflar, kademe, düzey
  const siniflar = useMemo(() => [...classes].sort(sinifSirala), [classes]);
  const kademeler = useMemo(() => KADEME_SIRA.filter((k) => siniflar.some((c) => kademeOf(c) === k)), [siniflar]);
  const [kademe, setKademe] = useState<Kademe | null>(null);
  const aktifKademe: Kademe | null = kademe && kademeler.includes(kademe) ? kademe : (kademeler.includes('orta') ? 'orta' : kademeler[0]) || null;
  const duzeyler = useMemo(() => {
    const set: string[] = [];
    for (const c of siniflar) if (kademeOf(c) === aktifKademe && !set.includes(duzeyOf(c))) set.push(duzeyOf(c));
    return set.sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
  }, [siniflar, aktifKademe]);
  const [duzey, setDuzey] = useState('');
  const aktifDuzey = duzeyler.includes(duzey) ? duzey : duzeyler[0] || '';
  const duzeySiniflari = siniflar.filter((c) => kademeOf(c) === aktifKademe && duzeyOf(c) === aktifDuzey);

  // ------------------------------------------------------------------ hedef öğretmenin durumu
  const isimOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.name);
    return (id: string) => m.get(id) || 'Başka öğretmen';
  }, [users]);
  const kurumRolesOn = dataService.getMyKurum().rolesEnabled === true;
  const genisRoller = ogr ? (unvanlar.get(ogr.id) || []).filter((r) => WIDE_ROLES.includes(r)) : [];
  const hepsiniGorur = !!ogr?.isAdmin || (kurumRolesOn && genisRoller.length > 0);
  const erisimYazilir = !!authId && !ogr?.isAdmin;

  const [secim, setSecim] = useState<Record<string, SubeDurum>>({});
  const [soSecim, setSoSecim] = useState<Record<string, boolean>>({});
  const [kademeSecim, setKademeSecim] = useState<TeacherGrades | null>(null);
  const kademeSu = kademeSecim || veri?.kademe || EMPTY_GRADES;
  const kademeKapsar = (c: ClassGroup) => {
    if (kademeSu.all) return true;
    const g = gradeOf(c);
    return g !== null && !anasinifi(c) && kademeSu.grades.includes(g);
  };

  const dersBende = (classId: string) =>
    !!veri && veri.sdo.some((r) => r.classId === classId && r.teacherId === ogr?.id && anahtar(r.ders) === anahtar(ders));
  const ilkDurum = (classId: string): SubeDurum => (dersBende(classId) ? 'ders' : veri?.gorme.has(classId) ? 'gorur' : 'yok');
  const durumOf = (classId: string): SubeDurum => secim[classId] ?? ilkDurum(classId);
  /** en az "Görür": rolünden / kademeden / başka dersinden görür */
  const altSinir = (c: ClassGroup): string => {
    if (hepsiniGorur) return ogr?.isAdmin ? 'Kurum yöneticisi bütün sınıfları görür' : 'Rolü gereği bütün sınıfları görür';
    if (kademeKapsar(c)) return 'Kademeden görür ("Hepsini görür" açık)';
    const baska = veri?.sdo.find((r) => r.classId === c.id && r.teacherId === ogr?.id && anahtar(r.ders) !== anahtar(ders));
    return baska ? `${baska.ders} dersine girer` : '';
  };
  const gorunenDurum = (c: ClassGroup): SubeDurum => {
    const d = durumOf(c.id);
    return d === 'yok' && altSinir(c) ? 'gorur' : d;
  };
  const digerleri = (classId: string) =>
    (veri?.sdo || []).filter((r) => r.classId === classId && r.teacherId !== ogr?.id && anahtar(r.ders) === anahtar(ders)).map((r) => r.teacherId);
  const soBende = (classId: string) => soSecim[classId] ?? veri?.so[classId] === ogr?.id;

  const degisenler = useMemo(
    () => siniflar.filter((c) => secim[c.id] !== undefined && secim[c.id] !== ilkDurum(c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siniflar, secim, veri, ders]
  );
  const soDegisen = siniflar.filter((c) => soSecim[c.id] !== undefined && soSecim[c.id] !== (veri?.so[c.id] === ogr?.id));
  const kademeDegisti =
    !!kademeSecim && !!veri && (kademeSecim.all !== veri.kademe.all || [...kademeSecim.grades].sort().join() !== [...veri.kademe.grades].sort().join());
  const kirli = degisenler.length > 0 || soDegisen.length > 0 || kademeDegisti;

  // ------------------------------------------------------------------ düzenleme
  const durumSec = (c: ClassGroup, d: SubeDurum) => setSecim((s) => ({ ...s, [c.id]: d }));
  const hepsineGir = () => setSecim((s) => ({ ...s, ...Object.fromEntries(duzeySiniflari.map((c) => [c.id, 'ders' as SubeDurum])) }));
  const duzeyNo = Number(aktifDuzey);
  const duzeyKademede = kademeSu.all || kademeSu.grades.includes(duzeyNo);
  const kademeAc = () => {
    if (!Number.isFinite(duzeyNo) || duzeyNo < 1) return;
    const tum = kademeSu.all ? Array.from(new Set(siniflar.map(gradeOf).filter((g): g is number => g !== null))) : kademeSu.grades;
    const grades = duzeyKademede ? tum.filter((g) => g !== duzeyNo) : [...tum, duzeyNo];
    setKademeSecim({ grades: grades.sort((a, b) => a - b), all: false });
  };

  // ------------------------------------------------------------------ kaydet (önce çakışmalar sorulur)
  const [onayAdim, setOnayAdim] = useState(false);
  const [degistir, setDegistir] = useState<Record<string, boolean>>({});
  const [mesgul, setMesgul] = useState(false);
  const [kayitHata, setKayitHata] = useState('');
  const dersCakisma = degisenler.filter((c) => durumOf(c.id) === 'ders' && digerleri(c.id).length > 0);
  const soCakisma = soDegisen.filter((c) => soSecim[c.id] && veri?.so[c.id] && veri.so[c.id] !== ogr?.id);

  const yaz = async () => {
    if (!ogr || !veri) return;
    setMesgul(true);
    setKayitHata('');
    try {
      await ogretmenSiniflariKaydet({
        teacherId: ogr.id,
        ders,
        siniflar: degisenler.map((c) => ({ classId: c.id, durum: durumOf(c.id) })),
        degistir: dersCakisma.filter((c) => degistir[c.id]).map((c) => c.id),
        sinifOgretmeni: soDegisen.map((c) => ({ classId: c.id, on: !!soSecim[c.id] })),
        kademe: kademeDegisti && erisimYazilir && !veri.kademeYok ? kademeSecim : null,
      });
      showToast(`✓ "${ogr.name}" için sınıflar ve dersler kaydedildi.`, 'success');
      kapat();
      loadData();
      reloadAccessCounts();
    } catch (e: any) {
      setKayitHata(e?.message || 'Kaydedilemedi.');
      setOnayAdim(false);
    } finally {
      setMesgul(false);
    }
  };
  const kaydet = () => {
    if (!kirli) return kapat();
    if (degisenler.some((c) => durumOf(c.id) === 'ders') && !ders) return setKayitHata('Önce dersi seçin.');
    if (!onayAdim && (dersCakisma.length > 0 || soCakisma.length > 0)) {
      setDegistir({});
      setOnayAdim(true);
      return;
    }
    void yaz();
  };

  if (!ogr) return null;

  // ------------------------------------------------------------------ özet
  const say = { ders: 0, gorur: 0 };
  for (const c of siniflar) {
    const d = gorunenDurum(c);
    if (d === 'ders') say.ders++;
    else if (d === 'gorur') say.gorur++;
  }
  const soListe = siniflar.filter((c) => soBende(c.id)).map((c) => c.name);

  const duzeyRozet = (d: string) => {
    const n = siniflar.filter((c) => duzeyOf(c) === d && kademeOf(c) === aktifKademe && gorunenDurum(c) === 'ders').length;
    return n ? <span className="ui-chip ui-chip-brand text-2xs h-5 px-1.5 tabular-nums">{n}</span> : null;
  };

  return (
    <Modal
      open
      onClose={kapat}
      size="lg"
      icon={LayoutGrid}
      layerClass="z-(--z-pencere-ust)"
      title="Sınıflar ve dersler"
      description={
        <span>
          <b className="text-fg-2">{ogr.name}</b>
          {ogr.branch ? ` · ${ogr.branch}` : ''} — girdiği sınıflar ders programına, gördüğü sınıflar erişime yazılır.
        </span>
      }
      govdeClass="p-5 sm:p-6 space-y-4"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted" id="svd-ozet" aria-live="polite">
            <b className="text-fg tabular-nums">{say.ders}</b> sınıfa derse girer · <b className="text-fg tabular-nums">{say.gorur}</b> sınıfı görür
            {soListe.length ? (
              <>
                {' '}
                · sınıf öğretmeni <b className="text-fg">{soListe.join(', ')}</b>
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            {onayAdim ? (
              <button type="button" className="ui-btn ui-btn-secondary w-28" disabled={mesgul} onClick={() => setOnayAdim(false)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Geri
              </button>
            ) : (
              <button type="button" className="ui-btn ui-btn-secondary w-28" disabled={mesgul} onClick={kapat}>
                İptal
              </button>
            )}
            <button type="button" id="svd-kaydet" className="ui-btn ui-btn-primary w-28" disabled={mesgul || !veri} onClick={kaydet}>
              {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      }
    >
      {hata ? (
        <YuklemeHatasi mesaj={hata} onTekrar={yukle} />
      ) : !veri ? (
        <Yukleniyor satir={5} />
      ) : onayAdim ? (
        // ---------------------------------------------------------------- çakışmalar
        <div className="space-y-3" id="svd-onay">
          <p className="text-sm text-fg-2">Kaydetmeden önce şunları seçin. Yoklama ve notlar hiçbir durumda silinmez.</p>
          {dersCakisma.map((c) => {
            const adlar = digerleri(c.id).map(isimOf).join(', ');
            const dg = !!degistir[c.id];
            return (
              <div key={c.id} className="ui-card ui-card-pad space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-fg">
                    {c.name} {ders} dersi {adlar} öğretmeninde
                  </p>
                  <Segmented
                    size="sm"
                    value={dg ? 'degistir' : 'birlikte'}
                    onChange={(v) => setDegistir((s) => ({ ...s, [c.id]: v === 'degistir' }))}
                    items={[
                      { value: 'birlikte', label: 'Birlikte girer' },
                      { value: 'degistir', label: 'Değiştir' },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted">
                  {dg
                    ? `Ders ${ogr.name} öğretmenine geçer; ${adlar} bu sınıftaki dersten çıkar, programdaki saatleri ${ogr.name} öğretmenine devredilir.`
                    : `Ortak ders olur: ders programında bu dersin her saatine ikisi birlikte yazılır.`}
                </p>
              </div>
            );
          })}
          {soCakisma.map((c) => (
            <div key={c.id} className="ui-card ui-card-pad space-y-1">
              <p className="text-sm font-semibold text-fg">
                {c.name} sınıf öğretmeni {isimOf(veri.so[c.id])}
              </p>
              <p className="text-xs text-muted">Bir sınıfın tek sınıf öğretmeni olur. Kaydedince {ogr.name} {c.name} sınıfının sınıf öğretmeni olur.</p>
            </div>
          ))}
          {kayitHata && <p className="text-xs font-semibold text-danger-fg">{kayitHata}</p>}
        </div>
      ) : (
        // ---------------------------------------------------------------- şubeler
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 w-full sm:w-64">
              <label htmlFor="svd-ders" className="ui-label">
                Derse girdiğinde ders
              </label>
              <select
                id="svd-ders"
                className="ui-field w-full"
                value={ders}
                disabled={degisenler.length > 0}
                title={degisenler.length > 0 ? 'Dersi değiştirmek için önce kaydedin' : undefined}
                onChange={(e) => setDers(e.target.value)}
              >
                {!ders && <option value="">Ders seçin</option>}
                {dersSecenek.ilk.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                {dersSecenek.diger.length > 0 && (
                  <optgroup label="Diğer dersler">
                    {dersSecenek.diger.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {kademeler.length > 1 && aktifKademe && (
              <Segmented
                className="sm:ml-auto"
                value={aktifKademe}
                onChange={(k) => {
                  setKademe(k);
                  setDuzey('');
                }}
                items={kademeler.map((k) => ({ value: k, label: KADEME_AD[k], id: `svd-kademe-${k}` }))}
              />
            )}
          </div>

          {hepsiniGorur ? (
            <p className="px-3 py-2 rounded-xl text-xs bg-info-soft text-info-fg border border-info/30">
              {ogr.isAdmin ? 'Kurum yöneticisi' : `${wideRoleText(genisRoller)} rolü gereği`} bütün sınıfları zaten görür; burada yalnız girdiği dersleri seçin.
            </p>
          ) : null}
          {!veri.soKurulu && (
            <p className="px-3 py-2 rounded-xl text-xs bg-warning-soft text-warning-fg border border-warning/30">
              Sınıf öğretmeni için önce Supabase'de sql/377_siniflar_ve_dersler.sql çalıştırılmalı.
            </p>
          )}

          {siniflar.length === 0 ? (
            <p className="text-xs text-muted">Kurumda henüz sınıf yok.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented
                  value={aktifDuzey}
                  onChange={setDuzey}
                  items={duzeyler.map((d) => ({ value: d, label: duzeyAd(d), badge: duzeyRozet(d), id: `svd-duzey-${d}` }))}
                />
                <div className="flex items-center gap-2">
                  {erisimYazilir && !hepsiniGorur && !veri.kademeYok && duzeyNo >= 1 && (
                    <button
                      type="button"
                      id="svd-kademe-gorur"
                      className="ui-secim w-32"
                      aria-pressed={duzeyKademede}
                      title={`Bütün ${duzeyAd(aktifDuzey)} şubelerini görür; sonradan açılan şubeler dahil`}
                      onClick={kademeAc}
                    >
                      {duzeyKademede && <Check aria-hidden />}
                      Hepsini görür
                    </button>
                  )}
                  <button type="button" id="svd-hepsine-gir" className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-32" onClick={hepsineGir} disabled={!ders}>
                    Hepsine girer
                  </button>
                </div>
              </div>

              <ul className="ui-card divide-y divide-line" aria-label={`${duzeyAd(aktifDuzey)} şubeleri`}>
                {duzeySiniflari.map((c) => {
                  const d = gorunenDurum(c);
                  const sinir = altSinir(c);
                  const baskasi = digerleri(c.id);
                  const soId = veri.so[c.id];
                  const soAcik = soBende(c.id);
                  const soBaskasi = !soAcik && soId && soId !== ogr.id ? isimOf(soId) : '';
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <span className="order-1 w-16 shrink-0 text-sm font-semibold text-fg truncate" title={c.name}>
                        {c.name}
                      </span>
                      <div className="ui-seg order-3 sm:order-2 flex flex-nowrap w-full sm:w-auto" role="group" aria-label={`${c.name} durumu`}>
                        {DURUMLAR.map((x) => (
                          <button
                            key={x}
                            type="button"
                            aria-pressed={d === x}
                            className={cx('ui-seg-btn flex-1 sm:flex-none sm:w-24', d === x && x === 'ders' && 'bg-brand text-white hover:text-white')}
                            disabled={(x === 'yok' && !!sinir) || (x === 'ders' && !ders)}
                            title={x === 'yok' && sinir ? sinir : undefined}
                            onClick={() => durumSec(c, x)}
                          >
                            {DURUM_AD[x]}
                          </button>
                        ))}
                      </div>
                      <span className="order-4 sm:order-3 w-full sm:w-auto sm:flex-1 min-w-0 text-xs text-muted truncate">
                        {d === 'ders' ? (
                          <>
                            <b className="text-fg-2">{ders}</b>
                            {baskasi.length > 0 && SIRA[d] > SIRA[ilkDurum(c.id)] ? (
                              <span className="text-warning-fg"> · şu an {baskasi.map((t) => kisaAd(isimOf(t))).join(', ')} giriyor, kaydederken sorulur</span>
                            ) : baskasi.length > 0 ? (
                              <> · ortak: {baskasi.map((t) => kisaAd(isimOf(t))).join(', ')}</>
                            ) : null}
                          </>
                        ) : baskasi.length > 0 ? (
                          `${ders}: ${baskasi.map((t) => kisaAd(isimOf(t))).join(', ')}`
                        ) : (
                          sinir || '—'
                        )}
                      </span>
                      {veri.soKurulu && (
                        <button
                          type="button"
                          className={cx('ui-secim w-28 order-2 sm:order-4 ml-auto sm:ml-0', soBaskasi && 'text-muted')}
                          aria-pressed={soAcik}
                          title={soAcik ? 'Sınıf öğretmeni (kaldırmak için basın)' : soBaskasi ? `Sınıf öğretmeni: ${soBaskasi}. Basınca ${ogr.name} olur.` : 'Sınıf öğretmeni yap'}
                          onClick={() => setSoSecim((s) => ({ ...s, [c.id]: !soAcik }))}
                        >
                          <Star aria-hidden />
                          {soAcik ? 'Sınıf öğrt.' : soBaskasi ? basHarf(soBaskasi) : 'Sınıf öğrt.'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-2xs text-muted">
                Yok: sınıfı görmez · Görür: öğrencileri görür, ödev/etüt verebilir, ders programında yoktur · Derse girer: ders programına atanır ve görür.
              </p>
            </div>
          )}
          {kayitHata && <p className="text-xs font-semibold text-danger-fg">{kayitHata}</p>}
        </>
      )}
    </Modal>
  );
}
export default SiniflarVeDerslerPenceresi;
