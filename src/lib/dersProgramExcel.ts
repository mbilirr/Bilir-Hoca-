// ============================================================================
// Aşama 231: EXCEL'DEN DERS PROGRAMI — dosya okuma, ad eşleme ve şablon.
// İki biçim okunur:
//  1) LİSTE: her satır bir ders saati → Sınıf | Gün | Ders saati | Ders | Öğretmen
//     (ortak derste öğretmenler virgülle; aynı saat için ayrı satır da olur)
//  2) ÇİZELGE: sınıf başına bir sayfa (sayfa adı sınıfın adı) → ilk sütun ders saati, başlık satırında günler,
//     hücrede "Matematik - Ayşe Yılmaz" (ya da alt satırda öğretmen)
// Sınıf, öğretmen ve gün adları Türkçe harf / büyük-küçük farkı gözetmeden eşlenir. Asıl denetim veritabanındadır
// (ders_programi_toplu_yukle); burada yalnız adlar kimliğe çevrilir ve okunamayan satırlar gösterilir.
// ============================================================================
import { ColumnSpec, matrixToRows, normalizeClassKey, sheetSource, trFold } from './importNormalize';
import type { DersAyar, ProgramSatiri, TopluSatir } from '../services/dersService';
import { downloadStyledXlsx, safeSheetName, type Cell } from './xlsxStyled';

// dersService'teki ile aynı (bu dosya veritabanı bağlantısını içe almasın diye kopya)
const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;

export interface ExcelBaglam {
  ayar: DersAyar;
  siniflar: Array<{ id: string; name: string }>;
  ogretmenler: Array<{ id: string; name: string }>;
  dersAdlari: string[]; // kurumda kayıtlı ders adları (yazımı korumak için)
}

export interface ExcelSonuc {
  bicim: 'liste' | 'cizelge' | null;
  satirlar: TopluSatir[];
  hatalar: Array<{ yer: string; mesaj: string }>;
  siniflar: string[]; // dosyadaki sınıf kimlikleri
}

const LISTE_SUTUN: Record<'sinif' | 'gun' | 'sira' | 'ders' | 'ogretmen', ColumnSpec> = {
  sinif: { exact: ['sınıf', 'sınıf adı', 'şube', 'sınıf/şube', 'class'], partial: ['sınıf', 'sube'] },
  gun: { exact: ['gün', 'gun', 'day'], partial: ['gün'] },
  sira: { exact: ['ders saati', 'saat', 'sıra', 'ders no', 'kaçıncı ders', 'ders sırası'], partial: ['ders saati', 'sıra'] },
  ders: { exact: ['ders', 'ders adı', 'dersin adı', 'branş', 'subject'], partial: ['ders ad'] },
  ogretmen: { exact: ['öğretmen', 'öğretmenler', 'öğretmen adı', 'öğretmenin adı', 'teacher'], partial: ['öğretmen'] },
};

const GUN_ANAHTAR: Array<[string, number]> = [
  ['pazartesi', 1],
  ['sali', 2],
  ['carsamba', 3],
  ['persembe', 4],
  ['cumartesi', 6], // "cuma"dan önce
  ['cuma', 5],
  ['pazar', 7],
];
const GUN_KISA_ANAHTAR: Record<string, number> = { pzt: 1, pts: 1, sal: 2, car: 3, crs: 3, per: 4, prs: 4, cum: 5, cma: 5, cmt: 6, cts: 6, paz: 7, pzr: 7 };

/** "Pazartesi", "PZT", "pzt.", "1" → 1..7; tanınmazsa 0 */
export function gunOku(raw: unknown): number {
  const f = trFold(raw).replace(/[^a-z0-9]/g, '');
  if (!f) return 0;
  if (/^[1-7]$/.test(f)) return Number(f);
  for (const [k, n] of GUN_ANAHTAR) if (f === k) return n;
  if (GUN_KISA_ANAHTAR[f]) return GUN_KISA_ANAHTAR[f];
  for (const [k, n] of GUN_ANAHTAR) if (f.startsWith(k)) return n;
  return 0;
}

/** "3", "3. ders", "3.Ders", "08:30" (ders başlangıcı) → sıra; tanınmazsa 0 */
export function siraOku(raw: unknown, ayar: DersAyar): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  // "08:30" ya da "8.30" (saat): ders başlangıcından sıra bulunur. "3. ders" saat sayılmaz.
  const saat = s.match(/^(\d{1,2}):(\d{2})/) || s.match(/^(\d{1,2})\.(\d{2})(?!\d)/);
  if (saat && Number(saat[1]) >= 6 && Number(saat[1]) <= 23) {
    const hhmm = `${saat[1].padStart(2, '0')}:${saat[2]}`;
    const i = ayar.saatler.findIndex((x) => x.bas === hhmm);
    return i >= 0 ? i + 1 : 0;
  }
  // Excel saat hücresi (gün kesri: 0,354 = 08:30)
  const n = Number(s.replace(',', '.'));
  if (Number.isFinite(n) && n > 0 && n < 1) {
    const dk = Math.round(n * 24 * 60);
    const hhmm = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
    const i = ayar.saatler.findIndex((x) => x.bas === hhmm);
    return i >= 0 ? i + 1 : 0;
  }
  const m = s.match(/\d{1,2}/);
  return m ? Number(m[0]) : 0;
}

const adAnahtar = (s: unknown) => trFold(s).replace(/[^a-z0-9]+/g, ' ').trim();

/** Öğretmen hücresi: "Ayşe Yılmaz, Ali Kaya" / "Ayşe Yılmaz + Ali Kaya" / "Ayşe Yılmaz ve Ali Kaya" */
const ogretmenParcala = (s: string) =>
  s
    .split(/\s*(?:,|;|\+|&|\/|\n|\bve\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);

function eslestirici(b: ExcelBaglam) {
  const sinif = new Map<string, string>();
  for (const c of b.siniflar) sinif.set(normalizeClassKey(c.name), c.id);
  const ogr = new Map<string, string[]>();
  for (const t of b.ogretmenler) {
    const k = adAnahtar(t.name);
    ogr.set(k, [...(ogr.get(k) || []), t.id]);
  }
  const ders = new Map<string, string>();
  for (const d of b.dersAdlari) if (!ders.has(adAnahtar(d))) ders.set(adAnahtar(d), d);
  return {
    sinif: (ad: string) => sinif.get(normalizeClassKey(ad)) || '',
    ogretmen: (ad: string): { id?: string; hata?: string } => {
      const ids = ogr.get(adAnahtar(ad)) || [];
      if (ids.length === 1) return { id: ids[0] };
      if (ids.length > 1) return { hata: `"${ad}" adında birden çok öğretmen var` };
      return { hata: `"${ad}" adında onaylı öğretmen bulunamadı` };
    },
    ders: (ad: string) => {
      const temiz = ad.replace(/\s+/g, ' ').trim();
      return ders.get(adAnahtar(temiz)) || temiz;
    },
  };
}

/** Hücre matrisleri (sayfa adı + satırlar) → program satırları */
export function programOku(sayfalar: Array<{ ad: string; matrix: unknown[][] }>, b: ExcelBaglam): ExcelSonuc {
  const es = eslestirici(b);
  const sonuc: ExcelSonuc = { bicim: null, satirlar: [], hatalar: [], siniflar: [] };
  const hata = (yer: string, mesaj: string) => {
    if (sonuc.hatalar.length < 200) sonuc.hatalar.push({ yer, mesaj });
  };
  const ogretmenler = (hucre: string, yer: string): string[] | null => {
    const adlar = ogretmenParcala(hucre);
    if (!adlar.length) {
      hata(yer, 'Öğretmen yazılmamış.');
      return null;
    }
    const ids: string[] = [];
    let kotu = false;
    for (const a of adlar) {
      const r = es.ogretmen(a);
      if (r.id) ids.push(r.id);
      else {
        hata(yer, `${r.hata}.`);
        kotu = true;
      }
    }
    return kotu ? null : Array.from(new Set(ids));
  };

  for (const sayfa of sayfalar) {
    const m = sayfa.matrix;
    if (!m.length) continue;

    // ---- 1) LİSTE biçimi
    const liste = matrixToRows(m, LISTE_SUTUN);
    const h = liste.headers;
    const bul = (spec: ColumnSpec) => {
      const al = spec.exact.map((x) => trFold(x).replace(/[^a-z0-9]/g, ''));
      return h.find((x) => al.includes(trFold(x).replace(/[^a-z0-9]/g, ''))) || h.find((x) => (spec.partial || []).some((p) => trFold(x).replace(/[^a-z0-9]/g, '').includes(trFold(p).replace(/[^a-z0-9]/g, ''))));
    };
    const kS = bul(LISTE_SUTUN.sinif);
    const kG = bul(LISTE_SUTUN.gun);
    const kD = bul(LISTE_SUTUN.ders);
    const kO = bul(LISTE_SUTUN.ogretmen);
    const kR = h.find((x) => x !== kS && x !== kG && x !== kD && x !== kO && /ders ?saati|^saat$|sira|ders ?no|kacinci/.test(trFold(x)));
    if (liste.headerFound && kG && kR && kD && kO) {
      sonuc.bicim = sonuc.bicim || 'liste';
      const sabitSinif = kS ? '' : es.sinif(sayfa.ad); // sınıf sütunu yoksa sayfa adı sınıf sayılır
      if (!kS && !sabitSinif) {
        hata(`"${sayfa.ad}" sayfası`, 'Sınıf sütunu yok ve sayfa adı bir sınıfa benzemiyor.');
        continue;
      }
      for (const r of liste.rows) {
        const yer = `"${sayfa.ad}" ${r.rowNumber}. satır`;
        const v = r.values;
        if (![kS ? v[kS] : 'x', v[kG], v[kR], v[kD], v[kO]].some((x) => String(x || '').trim())) continue;
        const classId = kS ? es.sinif(v[kS]) : sabitSinif;
        const gun = gunOku(v[kG]);
        const sira = siraOku(v[kR], b.ayar);
        const ders = es.ders(String(v[kD] || ''));
        let kotu = false;
        if (!classId) {
          hata(yer, `"${v[kS!] || ''}" sınıfı bulunamadı.`);
          kotu = true;
        }
        if (!gun) {
          hata(yer, `Gün okunamadı ("${v[kG] || ''}").`);
          kotu = true;
        }
        if (!sira) {
          hata(yer, `Ders saati okunamadı ("${v[kR] || ''}").`);
          kotu = true;
        }
        if (!ders) {
          hata(yer, 'Ders adı boş.');
          kotu = true;
        }
        const tids = ogretmenler(String(v[kO] || ''), yer);
        if (kotu || !tids) continue;
        sonuc.satirlar.push({ satir: r.rowNumber, classId, gun, sira, ders, teacherIds: tids });
      }
      continue;
    }

    // ---- 2) ÇİZELGE biçimi (günler başlıkta)
    let basSatir = -1;
    let gunSutun: Array<{ col: number; gun: number }> = [];
    for (let i = 0; i < Math.min(m.length, 12); i++) {
      const row = Array.isArray(m[i]) ? m[i] : [];
      const g = row.map((c, col) => ({ col, gun: gunOku(c) })).filter((x) => x.gun > 0 && !/^\d$/.test(String(row[x.col]).trim()));
      if (g.length >= 2) {
        basSatir = i;
        gunSutun = g;
        break;
      }
    }
    if (basSatir < 0) {
      hata(`"${sayfa.ad}" sayfası`, 'Biçim tanınmadı. Şablondaki sütunları (Sınıf, Gün, Ders saati, Ders, Öğretmen) kullanın.');
      continue;
    }
    // sınıf: sayfa adı ya da başlığın üstündeki satırlardan biri
    let classId = es.sinif(sayfa.ad);
    for (let i = 0; i < basSatir && !classId; i++) {
      for (const c of (Array.isArray(m[i]) ? m[i] : []) as unknown[]) {
        const id = es.sinif(String(c ?? ''));
        if (id) {
          classId = id;
          break;
        }
      }
    }
    if (!classId) {
      hata(`"${sayfa.ad}" sayfası`, 'Sınıf bulunamadı. Sayfa adını sınıfın adı yapın (ör. 8-A).');
      continue;
    }
    sonuc.bicim = sonuc.bicim || 'cizelge';
    const ilkGun = Math.min(...gunSutun.map((x) => x.col));
    for (let i = basSatir + 1; i < m.length; i++) {
      const row = Array.isArray(m[i]) ? m[i] : [];
      // ders saati: günlerden önceki sütunlardaki ilk dolu hücre
      let siraHucre: unknown = '';
      for (let c = 0; c < ilkGun; c++) {
        if (String(row[c] ?? '').trim()) {
          siraHucre = row[c];
          break;
        }
      }
      const sira = siraOku(siraHucre, b.ayar);
      const dolu = gunSutun.some((g) => String(row[g.col] ?? '').trim());
      if (!dolu) continue;
      const yerSatir = `"${sayfa.ad}" ${i + 1}. satır`;
      if (!sira) {
        hata(yerSatir, `Ders saati okunamadı ("${String(siraHucre ?? '')}").`);
        continue;
      }
      for (const g of gunSutun) {
        const hucre = String(row[g.col] ?? '').trim();
        if (!hucre) continue;
        const yer = `${yerSatir}, ${GUN_ADLARI[g.gun - 1]}`;
        // "Matematik\nAyşe Yılmaz" ya da "Matematik - Ayşe Yılmaz" ya da "Matematik (Ayşe Yılmaz)"
        let dersAd = '';
        let ogrAd = '';
        const parantez = hucre.match(/^(.+?)\s*\((.+)\)\s*$/s);
        if (hucre.includes('\n')) {
          const [d, ...o] = hucre.split('\n');
          dersAd = d;
          ogrAd = o.join(', ');
        } else if (parantez) {
          dersAd = parantez[1];
          ogrAd = parantez[2];
        } else {
          const p = hucre.split(/\s+[-–—|]\s+|\s*:\s*/);
          dersAd = p[0];
          ogrAd = p.slice(1).join(', ');
        }
        const ders = es.ders(dersAd);
        if (!ders) {
          hata(yer, 'Ders adı boş.');
          continue;
        }
        if (!ogrAd.trim()) {
          hata(yer, `"${hucre}": öğretmen yazılmamış ("Ders - Öğretmen" biçiminde yazın).`);
          continue;
        }
        const tids = ogretmenler(ogrAd, yer);
        if (!tids) continue;
        sonuc.satirlar.push({ satir: i + 1, classId, gun: g.gun, sira, ders, teacherIds: tids });
      }
    }
  }

  // aynı sınıf + gün + saat: aynı dersse öğretmenler birleşir
  const birlesik = new Map<string, TopluSatir>();
  for (const s of sonuc.satirlar) {
    const k = `${s.classId}|${s.gun}|${s.sira}|${adAnahtar(s.ders)}`;
    const v = birlesik.get(k);
    if (v) v.teacherIds = Array.from(new Set([...v.teacherIds, ...s.teacherIds]));
    else birlesik.set(k, { ...s, teacherIds: [...s.teacherIds] });
  }
  sonuc.satirlar = Array.from(birlesik.values());
  sonuc.siniflar = Array.from(new Set(sonuc.satirlar.map((s) => s.classId)));
  return sonuc;
}

/** Dosyayı okur (xlsx / xls / csv). Kütüphane yalnız gerektiğinde iner. */
export async function excelSayfalari(file: File): Promise<Array<{ ad: string; matrix: unknown[][] }>> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const src = sheetSource(buf, 'array');
  const wb = XLSX.read(src.data, { type: src.type, cellDates: false });
  return wb.SheetNames.map((ad) => ({
    ad,
    matrix: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ad], { header: 1, defval: '', raw: false }),
  }));
}

/** Şablon / mevcut programın Excel'i (liste biçimi). classIds verilirse yalnız o sınıflar. */
export async function programSablonIndir(p: {
  ayar: DersAyar;
  program: ProgramSatiri[];
  siniflar: Array<{ id: string; name: string }>;
  ogretmenler: Array<{ id: string; name: string }>;
  classIds?: string[];
  dosyaAdi: string;
}): Promise<void> {
  const sinifAd = new Map(p.siniflar.map((c) => [c.id, c.name]));
  const ogrAd = new Map(p.ogretmenler.map((t) => [t.id, t.name]));
  const secili = p.classIds?.length ? new Set(p.classIds) : null;
  const grup = new Map<string, { sinif: string; gun: number; sira: number; ders: string; ogr: string[] }>();
  for (const r of p.program) {
    if (secili && !secili.has(r.classId)) continue;
    const k = `${r.classId}|${r.gun}|${r.sira}|${r.ders}`;
    const g = grup.get(k) || { sinif: sinifAd.get(r.classId) || r.classId, gun: r.gun, sira: r.sira, ders: r.ders, ogr: [] };
    g.ogr.push(ogrAd.get(r.teacherId) || r.teacherId);
    grup.set(k, g);
  }
  const satirlar = Array.from(grup.values()).sort(
    (a, b) => a.sinif.localeCompare(b.sinif, 'tr', { numeric: true }) || a.gun - b.gun || a.sira - b.sira
  );
  const ornekSinif = (secili ? p.siniflar.find((c) => secili.has(c.id)) : p.siniflar[0])?.name || '8-A';
  const head = (v: string): Cell => ({ v, s: 'head' });
  const rows: Cell[][] = [[head('Sınıf'), head('Gün'), head('Ders saati'), head('Ders'), head('Öğretmen')]];
  satirlar.forEach((r, i) => {
    const s = i % 2 ? 'zebra' : 'plain';
    rows.push([
      { v: r.sinif, s },
      { v: GUN_ADLARI[r.gun - 1], s },
      { v: r.sira, s },
      { v: r.ders, s },
      { v: r.ogr.sort((a, b) => a.localeCompare(b, 'tr')).join(', '), s },
    ]);
  });
  if (!satirlar.length) rows.push([ornekSinif, 'Pazartesi', 1, 'Matematik', p.ogretmenler[0]?.name || 'Öğretmen Adı']);

  const used = new Set<string>();
  const bilgi: Cell[][] = [
    [{ v: 'Ders programı yükleme', s: 'title' }],
    [''],
    ['• Her satır bir ders saatidir: Sınıf, Gün, Ders saati (1, 2, 3 …), Ders, Öğretmen.'],
    ['• Ortak derste öğretmenleri virgülle yazın (ör. "Ayşe Yılmaz, Ali Kaya").'],
    ['• Dosyadaki her sınıfın programı dosyadakiyle DEĞİŞTİRİLİR; o sınıfın dosyada olmayan saatleri boşalır.'],
    ['• Dosyada olmayan sınıflar değişmez. Tek sınıf yüklemek için yalnız o sınıfın satırlarını bırakın.'],
    ['• Bugün başlamış ders saatleri değişmez; değişiklik o saatin bir sonraki dersinden geçerli olur.'],
    ['• Sınıf başına bir sayfa olan çizelge (günler başlıkta, hücrede "Ders - Öğretmen") da okunur; sayfa adı sınıfın adı olmalı.'],
    [''],
    [{ v: 'Ders saatleri', s: 'head' }, { v: 'Başlangıç', s: 'head' }, { v: 'Bitiş', s: 'head' }],
    ...p.ayar.saatler.map((x, i): Cell[] => [`${i + 1}. ders`, x.bas, x.bit]),
    [''],
    [{ v: 'Ders günleri', s: 'head' }],
    [p.ayar.gunler.map((g) => GUN_ADLARI[g - 1]).join(', ')],
  ];
  const ogrRows: Cell[][] = [[head('Öğretmen (bu yazımla)')], ...p.ogretmenler.map((t): Cell[] => [t.name])];
  const sinifRows: Cell[][] = [[head('Sınıf (bu yazımla)')], ...p.siniflar.map((c): Cell[] => [c.name])];
  await downloadStyledXlsx(p.dosyaAdi, [
    { name: safeSheetName('Program', used), rows, cols: [12, 14, 12, 24, 40] },
    { name: safeSheetName('Açıklama', used), rows: bilgi, cols: [90, 12, 12] },
    { name: safeSheetName('Öğretmenler', used), rows: ogrRows, cols: [36] },
    { name: safeSheetName('Sınıflar', used), rows: sinifRows, cols: [20] },
  ]);
}
