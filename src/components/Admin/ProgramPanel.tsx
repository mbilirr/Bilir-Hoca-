import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileSpreadsheet, Plus, Printer, Users } from 'lucide-react';
import type { ClassGroup } from '../../types';
import { Modal, Panel, Segmented, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import {
  DersAyar,
  GUN_ADLARI,
  GUN_KISA,
  ProgramIslem,
  ProgramSatiri,
  SinifDersOgretmen,
  dersAyarOku,
  dersCanliDinle,
  guncelProgram,
  programTopluKaydet,
  sinifDersOgretmenleri,
} from '../../services/dersService';
import { lazyNamed } from '../../lib/lazyLoad';
import { tabloYazdir, YazdirTablo } from '../../lib/tabloYazdir';

// Aşama 231: Excel'den program yükleme penceresi (xlsx kütüphanesiyle birlikte) yalnız açılınca iner
const ProgramExcelModal = lazyNamed(() => import('./ProgramExcelModal'), 'ProgramExcelModal');

// ============================================================================
// Aşama 219: DERS PROGRAMI (yönetici) — öğretmene göre ya da sınıfa göre haftalık ızgara.
// Hücreye tıklanınca seçim penceresi açılır; seçenekler yalnız "Sınıf öğretmenleri"ndeki eşleşmelerdir.
// Kurallar veritabanında da denetlenir (öğretmen aynı saatte tek sınıf, sınıf aynı saatte tek ders).
// Değişiklik kaydedildiği günden itibaren geçerlidir; geçmiş günler ve alınmış yoklamalar değişmez.
// Aşama 231: bugün BAŞLAMIŞ ders saati değişmez (o saatin bir sonraki dersinden geçerli). Excel'den toplu / tek sınıf yükleme.
// Aşama 232: Yazdır (A4 yatay): seçili sınıf / öğretmen ya da hepsi (her biri ayrı sayfa). Ekrandaki güncel program basılır.
// Aşama 237: seçim tek tıkla ızgaraya işlenir (taslak); sayfa altındaki tek "Kaydet" bütün değişiklikleri
//            tek işlemde yazar (biri hata verirse hiçbiri yazılmaz). Sınıf görünümünde dersler doğrudan listelenir.
//            Gün sütunları eşit genişlikte; dolu hücre yazı kadar yer kaplar.
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

// Aşama 237: aynı hücreye (aynı öğretmen ya da aynı sınıf) yapılan son seçim öncekinin yerini alır
const islemAnahtar = (i: ProgramIslem) => (i.tur === 'ogretmen' ? `o|${i.teacherId}|${i.gun}-${i.sira}` : `s|${i.classId}|${i.gun}-${i.sira}`);

// Kaydedilmemiş seçimleri kayıtlı programın üstüne, veritabanının yapacağı sırayla uygular (ekranda görünen program)
function taslakUygula(program: ProgramSatiri[], taslak: ProgramIslem[]): ProgramSatiri[] {
  let rows = program;
  taslak.forEach((i, n) => {
    const ayni = (p: ProgramSatiri) => p.gun === i.gun && p.sira === i.sira;
    const yeni = (classId: string, ders: string, teacherId: string, k: number): ProgramSatiri => ({
      id: `taslak-${n}-${k}`,
      gun: i.gun,
      sira: i.sira,
      classId,
      ders,
      teacherId,
      gecerliBas: '',
      gecerliBit: null,
    });
    if (i.tur === 'ogretmen') {
      rows = rows.filter((p) => !(ayni(p) && p.teacherId === i.teacherId));
      if (i.classId && i.ders) rows = [...rows, yeni(i.classId, i.ders, i.teacherId, 0)];
    } else {
      rows = rows.filter((p) => !(ayni(p) && p.classId === i.classId));
      if (i.ders) rows = [...rows, ...i.teacherIds.map((t, k) => yeni(i.classId, i.ders as string, t, k))];
    }
  });
  return rows;
}

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
  const [kayitli, setKayitli] = useState<ProgramSatiri[]>([]); // veritabanındaki program
  const [atamalar, setAtamalar] = useState<SinifDersOgretmen[]>([]);
  const [yuklendi, setYuklendi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    try {
      const a = await dersAyarOku();
      const bugun = a?.bugun || '';
      const [p, s] = await Promise.all([bugun ? guncelProgram(kurumId, bugun) : Promise.resolve([]), sinifDersOgretmenleri(kurumId)]);
      setAyar(a);
      setKayitli(p);
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

  // ---------------------------------------------------------------- taslak (Aşama 237)
  const [taslak, setTaslak] = useState<ProgramIslem[]>([]);
  const [kayit, setKayit] = useState(false);
  const [kHata, setKHata] = useState<string | null>(null);
  const program = useMemo(() => taslakUygula(kayitli, taslak), [kayitli, taslak]); // ekranda görünen
  // Hiçbir şeyi değiştirmeyen seçim (aynı dersi yeniden seçmek, kayıtlı hâline geri dönmek) listeye girmez
  const taslakEkle = (i: ProgramIslem) => {
    setKHata(null);
    setTaslak((cur) => {
      const digerleri = cur.filter((x) => islemAnahtar(x) !== islemAnahtar(i));
      const sonraki = [...digerleri, i];
      const imza = (rows: ProgramSatiri[]) =>
        rows
          .filter((p) => p.gun === i.gun && p.sira === i.sira)
          .map((p) => `${p.classId}|${p.ders}|${p.teacherId}`)
          .sort()
          .join(',');
      return imza(taslakUygula(kayitli, sonraki)) === imza(taslakUygula(kayitli, digerleri)) ? digerleri : sonraki;
    });
  };
  const kaydet = async () => {
    if (!taslak.length || kayit) return;
    setKayit(true);
    setKHata(null);
    try {
      await programTopluKaydet(taslak);
      await yukle();
      setTaslak([]);
    } catch (e: any) {
      setKHata(e?.message || 'Kaydedilemedi.');
    } finally {
      setKayit(false);
    }
  };
  const vazgec = () => {
    setTaslak([]);
    setKHata(null);
  };
  // Kaydedilmemiş değişiklik varken sayfadan çıkılırsa tarayıcı uyarsın
  useEffect(() => {
    if (!taslak.length) return;
    const uyar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', uyar);
    return () => window.removeEventListener('beforeunload', uyar);
  }, [taslak.length]);

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

  // Bu görünümde kaydedilmemiş değişikliği olan hücreler (kayıtlı ile ekrandaki farklıysa)
  const degisen = useMemo(() => {
    const s = new Set<string>();
    if (!taslak.length) return s;
    const imza = (rows: ProgramSatiri[], k: string) =>
      rows
        .filter((p) => anahtar(p.gun, p.sira) === k && (gorunum === 'ogretmen' ? p.teacherId === teacherId : p.classId === classId))
        .map((p) => `${p.classId}|${p.ders}|${p.teacherId}`)
        .sort()
        .join(',');
    for (const i of taslak) {
      const k = anahtar(i.gun, i.sira);
      if (!s.has(k) && imza(kayitli, k) !== imza(program, k)) s.add(k);
    }
    return s;
  }, [taslak, kayitli, program, gorunum, teacherId, classId]);

  // ---------------------------------------------------------------- seçim penceresi
  const [secili, setSecili] = useState<Hucre | null>(null);
  const [acikDers, setAcikDers] = useState<string>(''); // sınıf görünümü: öğretmeni birden çok olan dersin seçimi açık
  const [secTids, setSecTids] = useState<string[]>([]);
  const [excelAcik, setExcelAcik] = useState(false); // Aşama 231

  const ac = (h: Hucre) => {
    setSecili(h);
    setAcikDers('');
    setSecTids([]);
  };
  const kapat = () => setSecili(null);

  const seciliIcerik = useMemo(() => {
    if (!secili) return { deger: '', dolu: false };
    const k = anahtar(secili.gun, secili.sira);
    if (gorunum === 'ogretmen') {
      const p = ogretmenSlot.get(k);
      return { deger: p ? `${p.classId}|${p.ders}` : '', dolu: !!p };
    }
    const ps = sinifSlot.get(`${classId}|${k}`) || [];
    return { deger: ps[0]?.ders || '', dolu: ps.length > 0 };
  }, [secili, gorunum, ogretmenSlot, sinifSlot, classId]);

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
          classId: a.classId,
          ders: a.ders,
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
  const mesgulNot = (tid: string): string | null => {
    if (!secili) return null;
    const p = ogretmenMesgul.get(`${tid}|${anahtar(secili.gun, secili.sira)}`);
    if (!p || p.classId === classId) return null;
    return `Bu saatte ${sinifAd.get(p.classId) || 'başka sınıfta'}`;
  };

  const ogretmenSec = (cid: string | null, ders: string | null) => {
    if (!secili) return;
    taslakEkle({ tur: 'ogretmen', teacherId, gun: secili.gun, sira: secili.sira, classId: cid, ders });
    kapat();
  };
  const sinifSec = (ders: string | null, tids: string[]) => {
    if (!secili) return;
    taslakEkle({ tur: 'sinif', classId, gun: secili.gun, sira: secili.sira, ders, teacherIds: ders ? tids : [] });
    kapat();
  };
  // Tek öğretmenli ders tek tıkla işlenir; öğretmeni birden çok olan derste öğretmen seçimi açılır
  const dersTikla = (d: string, tids: string[]) => {
    const bos = tids.filter((t) => !mesgulNot(t));
    if (tids.length === 1) {
      if (bos.length) sinifSec(d, bos);
      return;
    }
    if (acikDers === d) {
      setAcikDers('');
      return;
    }
    setAcikDers(d);
    const mevcut = seciliIcerik.deger === d && secili ? (sinifSlot.get(`${classId}|${anahtar(secili.gun, secili.sira)}`) || []).map((p) => p.teacherId) : [];
    setSecTids(mevcut.length ? mevcut : bos);
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
  const kaydedilmemis = taslak.length > 0;
  const onceKaydet = 'Önce değişiklikleri kaydedin';

  // ---------------------------------------------------------------- yazdır (Aşama 232) — kayıtlı program basılır
  const yazdirTablo = (g: Gorunum, id: string, baslik: string, yeniSayfa: boolean): YazdirTablo => {
    const hucre = (gun: number, sira: number): string => {
      if (g === 'ogretmen') {
        const p = kayitli.find((x) => x.teacherId === id && x.gun === gun && x.sira === sira);
        return p ? `${p.ders} · ${sinifAd.get(p.classId) || p.classId}` : '';
      }
      const ps = kayitli.filter((x) => x.classId === id && x.gun === gun && x.sira === sira);
      return ps.length ? `${ps[0].ders} · ${ps.map((x) => ogretmenAd.get(x.teacherId) || '').join(', ')}` : '';
    };
    return {
      baslik,
      yeniSayfa,
      head: ['#', 'Saat', ...gunler.map((x) => GUN_ADLARI[x - 1])],
      rows: siralar.map((s) => [s, ayar.saatler[s - 1] ? `${ayar.saatler[s - 1].bas}–${ayar.saatler[s - 1].bit}` : '', ...gunler.map((x) => hucre(x, s))]),
    };
  };
  const yazdir = (hepsi: boolean) => {
    if (kaydedilmemis) return;
    const kurumAd = dataService.getMyKurum().kurumName || '';
    let tablolar: YazdirTablo[];
    let baslik: string;
    if (gorunum === 'ogretmen') {
      const liste = hepsi ? ogretmenler.filter((t) => kayitli.some((p) => p.teacherId === t.id)) : seciliOgretmen ? [seciliOgretmen] : [];
      tablolar = liste.map((t, i) => yazdirTablo('ogretmen', t.id, t.name, i > 0));
      baslik = hepsi ? 'Öğretmen ders programları' : `Ders programı · ${seciliOgretmen?.name || ''}`;
    } else {
      const liste = hepsi ? siniflar.filter((c) => kayitli.some((p) => p.classId === c.id)) : seciliSinif ? [seciliSinif] : [];
      tablolar = liste.map((c, i) => yazdirTablo('sinif', c.id, `${c.name} sınıfı`, i > 0));
      baslik = hepsi ? 'Sınıf ders programları' : `Ders programı · ${seciliSinif?.name || ''}`;
    }
    if (!tablolar.length) {
      setHata('Yazdırılacak program yok.');
      return;
    }
    if (!tabloYazdir({ kurum: kurumAd, baslik, alt: `${ayar.bugun ? `${ayar.bugun.split('-').reverse().join('.')} itibarıyla` : ''}`, tablolar, yatay: true })) {
      setHata('Yazdırma penceresi açılamadı. Tarayıcıda açılır pencere iznini verin.');
    }
  };

  // Aşama 237: öğretmene göre görünümde dersi belli öğretmenin kutusunda yalnız sınıf adı yazar
  // (öğretmen birden çok derse yazılmışsa ders adı da yazılır, yoksa hangi ders olduğu anlaşılmaz)
  const tekDers = new Set(atamalar.filter((a) => a.teacherId === teacherId).map((a) => a.ders)).size <= 1;
  const hucreIcerik = (gun: number, sira: number) => {
    if (gorunum === 'ogretmen') {
      const p = ogretmenSlot.get(anahtar(gun, sira));
      if (!p) return null;
      const ortak = (sinifSlot.get(`${p.classId}|${anahtar(gun, sira)}`) || []).filter((x) => x.teacherId !== teacherId && x.ders === p.ders);
      return {
        ust: tekDers ? sinifAd.get(p.classId) || p.classId : `${sinifAd.get(p.classId) || p.classId} · ${p.ders}`,
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
      description="Hücrelere seçtiğiniz dersler alttaki Kaydet ile birlikte yazılır. Bugün başlamış ders saati bir sonraki haftadan değişir. Geçmiş günler ve alınmış yoklamalar değişmez."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted tabular-nums">Haftada {toplam} ders</span>
          <button
            type="button"
            className={cx(BTN, 'ui-btn-secondary')}
            onClick={() => yazdir(false)}
            disabled={kaydedilmemis}
            id="program-yazdir"
            title={kaydedilmemis ? onceKaydet : 'Seçili programı yazdır (A4)'}
          >
            <Printer className="w-3.5 h-3.5" /> Yazdır
          </button>
          <button
            type="button"
            className={cx(BTN, 'ui-btn-secondary')}
            onClick={() => yazdir(true)}
            disabled={kaydedilmemis}
            id="program-yazdir-hepsi"
            title={kaydedilmemis ? onceKaydet : gorunum === 'ogretmen' ? 'Bütün öğretmenlerin programı, her biri ayrı sayfa' : 'Bütün sınıfların programı, her biri ayrı sayfa'}
          >
            <Printer className="w-3.5 h-3.5" /> Hepsini yazdır
          </button>
          <button
            type="button"
            className={cx(BTN, 'ui-btn-secondary')}
            onClick={() => setExcelAcik(true)}
            disabled={kaydedilmemis}
            title={kaydedilmemis ? onceKaydet : undefined}
            id="program-excel-ac"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      }
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
          {/* Aşama 237: table-fixed — gün sütunları eşit, dolu hücre sütunu genişletmez */}
          <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
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
                      const yeni = degisen.has(anahtar(g, s));
                      const etiket = `${GUN_ADLARI[g - 1]} ${s}. ders`;
                      return (
                        <td key={g} className="p-1 border-l border-line align-middle">
                          <button
                            type="button"
                            onClick={() => ac({ gun: g, sira: s })}
                            aria-label={`${ic ? `${etiket}: ${ic.ust}. Değiştir` : `${etiket}: boş. Ata`}${yeni ? ' (kaydedilmedi)' : ''}`}
                            title={yeni ? 'Kaydedilmedi' : undefined}
                            className={cx(
                              'min-h-[44px] rounded-lg px-2 py-1 text-left flex-col justify-center gap-0.5 align-middle transition-colors',
                              ic
                                ? cx('inline-flex max-w-full border', yeni ? 'bg-brand-soft border-brand' : 'bg-surface border-line hover:border-line-strong')
                                : cx(
                                    'flex w-full border border-dashed items-center hover:text-fg-2 hover:border-line-strong',
                                    yeni ? 'border-brand text-brand-fg' : 'border-line text-subtle'
                                  )
                            )}
                          >
                            {ic ? (
                              <>
                                <span className="font-semibold text-fg truncate max-w-full">{ic.ust}</span>
                                {ic.alt && (
                                  <span className="text-[11px] text-muted truncate max-w-full flex items-center gap-1">
                                    <Users className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{ic.alt}</span>
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

        {/* Aşama 237: sayfanın tek Kaydet çubuğu — bütün değişiklikler tek işlemde yazılır */}
        <div
          className={cx(
            'sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 backdrop-blur',
            kaydedilmemis ? 'border-brand bg-surface/95 shadow-lg' : 'border-line bg-surface/80'
          )}
          id="program-kaydet-cubugu"
        >
          <span className={cx('text-xs font-semibold tabular-nums', kaydedilmemis ? 'text-brand-fg' : 'text-muted')} aria-live="polite">
            {kaydedilmemis ? `${taslak.length} değişiklik kaydedilmedi` : 'Kaydedilmemiş değişiklik yok'}
          </span>
          {kHata && (
            <span role="alert" className="text-xs font-semibold text-danger-fg min-w-0">
              {kHata}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={vazgec} disabled={!kaydedilmemis || kayit} id="program-vazgec">
              Vazgeç
            </button>
            <button type="button" className={cx(BTN, 'ui-btn-primary')} onClick={() => void kaydet()} disabled={!kaydedilmemis || kayit} id="program-kaydet">
              {kayit ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={!!secili}
        onClose={kapat}
        size="sm"
        icon={CalendarDays}
        title={secili ? `${GUN_ADLARI[secili.gun - 1]} · ${secili.sira}. ders` : ''}
        description={
          secili
            ? `${ayar.saatler[secili.sira - 1]?.bas || ''}–${ayar.saatler[secili.sira - 1]?.bit || ''} · ${gorunum === 'ogretmen' ? seciliOgretmen?.name || '' : seciliSinif?.name || ''}`
            : undefined
        }
        footer={
          seciliIcerik.dolu ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={cx(BTN, 'ui-btn-secondary')}
                onClick={() => (gorunum === 'ogretmen' ? ogretmenSec(null, null) : sinifSec(null, []))}
                id="program-bosalt"
              >
                Boş bırak
              </button>
            </div>
          ) : undefined
        }
      >
        {gorunum === 'ogretmen' ? (
          <div className="space-y-1" aria-label="Sınıf ve ders">
            {ogretmenSecenek.length === 0 && <p className="text-xs text-muted">Bu öğretmen hiçbir sınıfa ders öğretmeni olarak yazılmamış.</p>}
            {ogretmenSecenek.map((o) => {
              const secilen = seciliIcerik.deger === o.deger;
              return (
                <button
                  key={o.deger}
                  type="button"
                  disabled={o.pasif}
                  aria-current={secilen || undefined}
                  onClick={() => ogretmenSec(o.classId, o.ders)}
                  className={cx(
                    'w-full text-left rounded-lg px-2.5 py-2 transition-colors',
                    o.pasif ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-2',
                    secilen && 'bg-brand-soft'
                  )}
                >
                  <span className="block text-xs font-semibold text-fg">{tekDers ? sinifAd.get(o.classId) || o.classId : o.ad}</span>
                  <span className={cx('block text-[11px]', o.pasif ? 'text-danger-fg' : 'text-muted')}>{o.not}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1" role="list" aria-label="Ders">
            {sinifDersleri.length === 0 && <p className="text-xs text-muted">Bu sınıfa ders öğretmeni yazılmamış.</p>}
            {sinifDersleri.map(([d, tids]) => {
              const bos = tids.filter((t) => !mesgulNot(t));
              const pasif = bos.length === 0;
              const secilen = seciliIcerik.deger === d;
              const acik = acikDers === d;
              return (
                <div key={d} role="listitem" className={cx('rounded-lg', (secilen || acik) && 'bg-brand-soft')}>
                  <button
                    type="button"
                    disabled={pasif}
                    aria-current={secilen || undefined}
                    aria-expanded={tids.length > 1 ? acik : undefined}
                    onClick={() => dersTikla(d, tids)}
                    className={cx('w-full text-left rounded-lg px-2.5 py-2 transition-colors', pasif ? 'opacity-60 cursor-not-allowed' : !secilen && !acik && 'hover:bg-surface-2')}
                  >
                    <span className="block text-xs font-semibold text-fg">{d}</span>
                    <span className={cx('block text-[11px] truncate', pasif ? 'text-danger-fg' : 'text-muted')}>
                      {pasif ? 'Öğretmeni bu saatte başka sınıfta' : tids.map((t) => ogretmenAd.get(t) || 'Bilinmeyen öğretmen').join(', ')}
                    </span>
                  </button>
                  {acik && (
                    <fieldset className="px-2.5 pb-2 space-y-1">
                      <legend className="sr-only">{d} öğretmenleri</legend>
                      {tids.map((tid) => {
                        const not = mesgulNot(tid);
                        const on = secTids.includes(tid);
                        return (
                          <label key={tid} className={cx('flex items-center gap-2.5 rounded-lg px-1.5 py-1', not ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')}>
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
                      <div className="flex justify-end pt-1">
                        <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={secTids.length === 0} onClick={() => sinifSec(d, secTids)}>
                          Seç
                        </button>
                      </div>
                    </fieldset>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {excelAcik && (
        <Suspense fallback={null}>
          <ProgramExcelModal
            open={excelAcik}
            onClose={() => setExcelAcik(false)}
            ayar={ayar}
            siniflar={siniflar.map((c) => ({ id: c.id, name: c.name }))}
            ogretmenler={ogretmenler.map((t) => ({ id: t.id, name: t.name }))}
            program={kayitli}
            dersAdlari={Array.from(new Set(atamalar.map((a) => a.ders)))}
            baslangicSinif={gorunum === 'sinif' ? classId : undefined}
            onDone={() => void yukle()}
          />
        </Suspense>
      )}
    </Panel>
  );
};
