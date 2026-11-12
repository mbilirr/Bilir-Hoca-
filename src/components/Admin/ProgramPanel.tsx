import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileSpreadsheet, Plus, Printer, Search } from 'lucide-react';
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
import { basHarf, dersKisa } from '../../lib/dersKisa'; // Aşama 240: ortak kısaltma yardımcıları

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
// Aşama 239: ortak ders — sınıfın dersine yazılı bütün öğretmenler o dersin her saatine birlikte girer
//            (veritabanı tetiği zz239_ders_ortak + ata fonksiyonları; ekran aynı kuralla önizler).
// Aşama 241: açılır liste yerine yan liste (öğretmen / sınıf, arama, haftalık ders sayısı, "Programsız" rozeti,
//            kaydedilmemiş değişikliği olanlarda nokta) ve ızgara üstünde seçilenin özeti. Veri aynı (ekrandaki program).
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';
// Aşama 237b: gün sütunu genişliği — öğretmene göre yalnız sınıf adı (kısa), sınıfa göre ders + öğretmen (uzun)
// Aşama 237e: öğretmene göre sütun "8/D-F.S.Ç" gibi üç kelimeli kısaltmanın da sığacağı genişlikte
const GUN_W = { ogretmen: 'w-28', sinif: 'w-40' } as const;
// Dolu düğmenin en fazla genişliği (sütundan taşmasın; uzun ad kısaltılır, tamamı title'da)
// Aşama 239b: bir görünümdeki BÜTÜN hücre düğmeleri (dolu, ortak, boş) aynı en ve boyda — ızgara simetrik
const DUGME_BOY = { ogretmen: 'w-[5.75rem] h-11', sinif: 'w-36 h-11' } as const;
// Aşama 237d / 239b: ders kısaltması ve baş harf artık ortak src/lib/dersKisa.ts'den (Aşama 240)
const STORE_KEY = 'edu_ders_program_v1';
type Gorunum = 'ogretmen' | 'sinif';
/** Yan liste avatarı: "Mustafa BİLİR" → "MB" */
const avatar = (ad: string) => basHarf(ad).replace(/\./g, '').slice(0, 2);
const kucuk = (x: string) => x.toLocaleLowerCase('tr');
const sinifAv = (ad: string) => (ad.length <= 4 ? ad : avatar(ad));

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
// Aşama 239: ortak ders (sınıfın dersine birden çok öğretmen yazılı) — veritabanıyla aynı kural:
//   öğretmen yazılınca diğer ortak öğretmenler de aynı saate yazılır; öğretmenden kaldırılınca o saat hepsinden kalkar.
type OrtakBul = (classId: string, ders: string) => string[];
function taslakUygula(program: ProgramSatiri[], taslak: ProgramIslem[], ortak: OrtakBul): ProgramSatiri[] {
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
    const yaz = (classId: string, ders: string, tids: string[]) => {
      tids.forEach((t, k) => {
        if (!rows.some((p) => ayni(p) && p.classId === classId && p.ders === ders && p.teacherId === t)) rows = [...rows, yeni(classId, ders, t, k)];
      });
    };
    if (i.tur === 'ogretmen') {
      const eski = rows.filter((p) => ayni(p) && p.teacherId === i.teacherId);
      for (const e of eski) {
        const hepsi = ortak(e.classId, e.ders).length > 1;
        rows = rows.filter((p) => !(ayni(p) && (hepsi ? p.classId === e.classId && p.ders === e.ders : p.id === e.id)));
      }
      if (i.classId && i.ders) {
        const o = ortak(i.classId, i.ders);
        yaz(i.classId, i.ders, o.includes(i.teacherId) ? [i.teacherId, ...o.filter((t) => t !== i.teacherId)] : [i.teacherId]);
      }
    } else {
      rows = rows.filter((p) => !(ayni(p) && p.classId === i.classId));
      if (i.ders) {
        const o = ortak(i.classId, i.ders);
        yaz(i.classId, i.ders, o.length ? o : i.teacherIds);
      }
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
  // Aşama 239: sınıf+ders → derse yazılı öğretmenler (ortak ders)
  const ortakMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of atamalar) {
      const k = `${a.classId}|${a.ders}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a.teacherId);
    }
    return m;
  }, [atamalar]);
  const ortak = useCallback<OrtakBul>((cid, d) => ortakMap.get(`${cid}|${d}`) || [], [ortakMap]);
  const program = useMemo(() => taslakUygula(kayitli, taslak, ortak), [kayitli, taslak, ortak]); // ekranda görünen
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
      return imza(taslakUygula(kayitli, sonraki, ortak)) === imza(taslakUygula(kayitli, digerleri, ortak)) ? digerleri : sonraki;
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

  // Aşama 241: yan listede kaydedilmemiş değişikliği olan öğretmen / sınıf (kayıtlı ile ekrandaki farklı)
  const taslakli = useMemo(() => {
    const s = new Set<string>();
    if (!taslak.length) return s;
    const grupla = (rows: ProgramSatiri[]) => {
      const m = new Map<string, string[]>();
      for (const p of rows) {
        const k = gorunum === 'ogretmen' ? p.teacherId : p.classId;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(`${anahtar(p.gun, p.sira)}|${p.classId}|${p.ders}|${p.teacherId}`);
      }
      return m;
    };
    const a = grupla(kayitli);
    const b = grupla(program);
    new Set([...a.keys(), ...b.keys()]).forEach((k) => {
      if ((a.get(k) || []).sort().join(',') !== (b.get(k) || []).sort().join(',')) s.add(k);
    });
    return s;
  }, [taslak.length, kayitli, program, gorunum]);

  // Aşama 241: yan liste — haftalık ders sayısı ekrandaki programdan (kaydedilmemiş seçimler dahil)
  const [ara, setAra] = useState('');
  const yanListe = useMemo(() => {
    const sayi = new Map<string, Set<string>>();
    for (const p of program) {
      const k = gorunum === 'ogretmen' ? p.teacherId : p.classId;
      if (!sayi.has(k)) sayi.set(k, new Set());
      sayi.get(k)!.add(anahtar(p.gun, p.sira));
    }
    const q = kucuk(ara.trim());
    if (gorunum === 'ogretmen') {
      return ogretmenler
        .filter((t) => !q || kucuk(`${t.name} ${t.branch || ''}`).includes(q))
        .map((t) => ({ id: t.id, ad: t.name, av: avatar(t.name), alt: t.branch || 'Branş yok', saat: sayi.get(t.id)?.size || 0 }));
    }
    const dersler = new Map<string, Set<string>>();
    for (const a of atamalar) {
      if (!dersler.has(a.classId)) dersler.set(a.classId, new Set());
      dersler.get(a.classId)!.add(a.ders);
    }
    return siniflar
      .filter((c) => !q || kucuk(c.name).includes(q))
      .map((c) => ({ id: c.id, ad: c.name, av: sinifAv(c.name), alt: `${dersler.get(c.id)?.size || 0} ders tanımlı`, saat: sayi.get(c.id)?.size || 0 }));
  }, [program, gorunum, ara, ogretmenler, siniflar, atamalar]);

  // ---------------------------------------------------------------- seçim penceresi
  const [secili, setSecili] = useState<Hucre | null>(null);
  const [excelAcik, setExcelAcik] = useState(false); // Aşama 231

  const ac = (h: Hucre) => setSecili(h);
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
        // Aşama 239: ortak öğretmenler de bu saate yazılacağı için başka sınıfta olmamalı
        const ortaklar = ortak(a.classId, a.ders).filter((t) => t !== teacherId);
        const mesgulOrtak = ortaklar.map((t) => ({ t, p: ogretmenMesgul.get(`${t}|${k}`) })).find((x) => x.p && x.p.classId !== a.classId);
        return {
          classId: a.classId,
          ders: a.ders,
          deger: `${a.classId}|${a.ders}`,
          ad: `${sinifAd.get(a.classId) || a.classId} · ${a.ders}`,
          pasif: !!baska || !!mesgulOrtak,
          not: baska
            ? `Dolu: ${baska.ders} · ${ogretmenAd.get(baska.teacherId) || ''}`
            : mesgulOrtak
              ? `Ortak öğretmen ${ogretmenAd.get(mesgulOrtak.t) || ''} bu saatte ${sinifAd.get(mesgulOrtak.p!.classId) || 'başka sınıfta'}`
              : ortaklar.length
                ? `Ortak ders: ${ortaklar.map((t) => ogretmenAd.get(t) || '').join(', ')} ile birlikte`
                : 'Bu saatte boş',
        };
      })
      .sort((x, y) => x.ad.localeCompare(y.ad, 'tr', { numeric: true }));
  }, [secili, gorunum, atamalar, teacherId, sinifSlot, sinifAd, ogretmenAd, ortak, ogretmenMesgul]);

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
    return `${ogretmenAd.get(tid) || 'Öğretmen'} bu saatte ${sinifAd.get(p.classId) || 'başka sınıfta'}`;
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
  const ogretmenDersleri = Array.from(new Set(atamalar.filter((a) => a.teacherId === teacherId).map((a) => a.ders)));
  const tekDers = ogretmenDersleri.length <= 1;
  const kisaltma = (d: string) => {
    const k = dersKisa(d);
    return ogretmenDersleri.some((x) => x !== d && dersKisa(x) === k) ? d : k;
  };
  const hucreIcerik = (gun: number, sira: number) => {
    if (gorunum === 'ogretmen') {
      const p = ogretmenSlot.get(anahtar(gun, sira));
      if (!p) return null;
      const ortak = (sinifSlot.get(`${p.classId}|${anahtar(gun, sira)}`) || []).filter((x) => x.teacherId !== teacherId && x.ders === p.ders);
      return {
        ust: tekDers ? sinifAd.get(p.classId) || p.classId : `${sinifAd.get(p.classId) || p.classId}-${kisaltma(p.ders)}`,
        tam: `${sinifAd.get(p.classId) || p.classId} · ${p.ders}`,
        alt: ortak.length ? `Ortak: ${ortak.map((x) => basHarf(ogretmenAd.get(x.teacherId) || '')).join(' ')}` : '',
        altTam: ortak.length ? `Ortak: ${ortak.map((x) => ogretmenAd.get(x.teacherId) || '').join(', ')}` : '',
      };
    }
    const ps = sinifSlot.get(`${classId}|${anahtar(gun, sira)}`) || [];
    if (!ps.length) return null;
    const adlar = ps.map((x) => ogretmenAd.get(x.teacherId) || '');
    return { ust: ps[0].ders, tam: ps[0].ders, alt: adlar.length > 1 ? adlar.map(basHarf).join(' ') : adlar[0], altTam: adlar.join(', ') };
  };

  return (
    <Panel
      title="Ders programı"
      icon={CalendarDays}
      id="ders-programi"
      description="Hücrelere seçtiğiniz dersler alttaki Kaydet ile birlikte yazılır. Bugün başlamış ders saati bir sonraki haftadan değişir. Geçmiş günler ve alınmış yoklamalar değişmez."
      actions={
        <div className="flex items-center gap-2">
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
      {/* Aşama 241: solda öğretmen / sınıf listesi, sağda seçilenin özeti + ızgara + Kaydet çubuğu */}
      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-2.5 xl:sticky xl:top-3" aria-label={gorunum === 'ogretmen' ? 'Öğretmenler' : 'Sınıflar'}>
          <Segmented
            size="sm"
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
            value={gorunum}
            onChange={(g) => {
              setGorunum(g);
              setAra('');
            }}
            items={[
              { value: 'ogretmen', label: 'Öğretmen', id: 'program-gorunum-ogretmen' },
              { value: 'sinif', label: 'Sınıf', id: 'program-gorunum-sinif' },
            ]}
          />
          <label className="relative block">
            <span className="sr-only">{gorunum === 'ogretmen' ? 'Öğretmen ara' : 'Sınıf ara'}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" aria-hidden="true" />
            <input
              type="search"
              className="ui-field pl-8"
              placeholder={gorunum === 'ogretmen' ? 'Öğretmen ara' : 'Sınıf ara'}
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              id="program-ara"
            />
          </label>
          <div
            role="listbox"
            aria-label={gorunum === 'ogretmen' ? 'Öğretmen seç' : 'Sınıf seç'}
            className="max-h-60 xl:max-h-[32rem] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-0.5"
            id={gorunum === 'ogretmen' ? 'program-ogretmen' : 'program-sinif'}
          >
            {yanListe.map((x) => {
              const sec = x.id === (gorunum === 'ogretmen' ? teacherId : classId);
              const kapasite = Math.max(1, ayar.gunler.length * ayar.dersSayisi);
              return (
                <button
                  key={x.id}
                  type="button"
                  role="option"
                  aria-selected={sec}
                  onClick={() => (gorunum === 'ogretmen' ? setTeacherId(x.id) : setClassId(x.id))}
                  title={`${x.ad} · haftada ${x.saat} ders${taslakli.has(x.id) ? ' (kaydedilmemiş değişiklik var)' : ''}`}
                  className={cx(
                    'grid w-full grid-cols-[2rem_minmax(0,1fr)_4.5rem] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left',
                    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    sec ? 'bg-brand-soft' : 'hover:bg-surface-2'
                  )}
                >
                  <span
                    className={cx(
                      'grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold tracking-tight transition-colors duration-150',
                      sec ? 'bg-brand text-white' : 'bg-surface-3 text-fg-2'
                    )}
                    aria-hidden="true"
                  >
                    {x.av}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={cx('truncate text-[13px] font-semibold', sec ? 'text-brand-fg' : 'text-fg')}>{x.ad}</span>
                      {taslakli.has(x.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{x.alt}</span>
                  </span>
                  {x.saat ? (
                    <span className="justify-self-end text-right text-xs font-bold tabular-nums text-fg-2">
                      {x.saat}
                      <span className="mt-1 block h-1 w-11 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (x.saat / kapasite) * 100)}%` }} />
                      </span>
                    </span>
                  ) : (
                    <span className="justify-self-end rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold text-warning-fg">Programsız</span>
                  )}
                </button>
              );
            })}
            {!yanListe.length && <p className="px-2 py-3 text-xs text-muted">Sonuç yok.</p>}
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {/* Seçilenin özeti */}
          {(gorunum === 'ogretmen' ? seciliOgretmen : seciliSinif) && (
            <div className="flex min-w-0 items-center gap-3" id="program-secilen">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-[13px] font-bold text-white" aria-hidden="true">
                {gorunum === 'ogretmen' ? avatar(seciliOgretmen?.name || '') : sinifAv(seciliSinif?.name || '')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-fg">{gorunum === 'ogretmen' ? seciliOgretmen?.name : `${seciliSinif?.name} sınıfı`}</p>
                <p
                  className="truncate text-xs text-muted tabular-nums"
                  title={gorunum === 'ogretmen' ? ogretmenDersleri.join(', ') : sinifDersleri.map(([d]) => d).join(', ')}
                >
                  {gorunum === 'ogretmen'
                    ? [seciliOgretmen?.branch, `haftada ${toplam} ders`, ogretmenDersleri.length ? ogretmenDersleri.map(kisaltma).join(', ') : ''].filter(Boolean).join(' · ')
                    : [`haftada ${toplam} ders`, `${sinifDersleri.length} ders`, `${new Set(sinifDersleri.flatMap(([, t]) => t)).size} öğretmen`].join(' · ')}
                </p>
              </div>
            </div>
          )}

          {hata && (
            <p role="alert" className="text-xs font-semibold text-danger-fg">
              {hata}
            </p>
          )}

        {/* Aşama 237b: ızgara içeriği kadar geniş (sayfaya yayılmaz); gün sütunları eşit ve görünüme göre dar/geniş.
            Hücre düğmeleri yazı kadar: öğretmene göre "8/C" kısa hap, sınıfa göre ders + öğretmen. Kaydet çubuğu ızgarayla aynı genişlikte. */}
        <div className="w-fit max-w-full space-y-3">
        <div className="overflow-x-auto rounded-xl border border-line" id="program-izgara">
          <table className="table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-surface-2 text-fg-2">
                <th scope="col" className="w-10 py-2 font-semibold text-center">
                  #
                </th>
                <th scope="col" className="w-20 py-2 px-2 font-semibold text-left">
                  Saat
                </th>
                {gunler.map((g) => (
                  <th key={g} scope="col" className={cx(GUN_W[gorunum], 'py-2 px-2 font-semibold text-center border-l border-line')}>
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
                        <td key={g} className="p-1.5 border-l border-line align-middle text-center">
                          <button
                            type="button"
                            onClick={() => ac({ gun: g, sira: s })}
                            aria-label={`${ic ? `${etiket}: ${ic.tam}. Değiştir` : `${etiket}: boş. Ata`}${yeni ? ' (kaydedilmedi)' : ''}`}
                            title={ic ? `${ic.tam}${ic.altTam ? ` · ${ic.altTam}` : ''}${yeni ? ' (kaydedilmedi)' : ''}` : yeni ? 'Kaydedilmedi' : undefined}
                            className={cx(
                              'inline-flex flex-col items-center justify-center gap-0.5 align-middle rounded-lg border px-1.5',
                              DUGME_BOY[gorunum],
                              'transition-[translate,scale,border-color,background-color,color] duration-150 ease-out active:scale-[0.96]',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
                              ic
                                ? cx(
                                    'shadow-sm',
                                    yeni ? 'bg-brand-soft border-brand' : 'bg-surface border-line hover:border-line-strong hover:-translate-y-px'
                                  )
                                : cx('border-dashed hover:text-fg-2 hover:border-line-strong', yeni ? 'border-brand text-brand-fg' : 'border-line text-subtle')
                            )}
                          >
                            {ic ? (
                              <>
                                <span className={cx('text-[13px] leading-4 font-semibold truncate max-w-full', yeni ? 'text-brand-fg' : 'text-fg')}>{ic.ust}</span>
                                {ic.alt && (
                                  <span className="text-[10px] leading-3 font-medium text-muted truncate max-w-full">{ic.alt}</span>
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
              // Aşama 239: dersin bütün öğretmenleri birlikte yazılır; biri başka sınıftaysa seçilemez
              const mesgul = tids.map((t) => mesgulNot(t)).find(Boolean) || null;
              const secilen = seciliIcerik.deger === d;
              return (
                <div key={d} role="listitem">
                  <button
                    type="button"
                    disabled={!!mesgul}
                    aria-current={secilen || undefined}
                    onClick={() => sinifSec(d, tids)}
                    className={cx(
                      'w-full text-left rounded-lg px-2.5 py-2 transition-colors',
                      mesgul ? 'opacity-60 cursor-not-allowed' : 'hover:bg-surface-2',
                      secilen && 'bg-brand-soft'
                    )}
                  >
                    <span className="block text-xs font-semibold text-fg">{d}</span>
                    <span className={cx('block text-[11px] truncate', mesgul ? 'text-danger-fg' : 'text-muted')}>
                      {mesgul || `${tids.length > 1 ? 'Ortak ders: ' : ''}${tids.map((t) => ogretmenAd.get(t) || 'Bilinmeyen öğretmen').join(', ')}`}
                    </span>
                  </button>
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
