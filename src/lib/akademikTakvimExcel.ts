// ============================================================================
// Aşama 242: AKADEMİK TAKVİM EXCEL'İ (kurumun kullandığı biçim)
// Her ay ayrı sayfa (EYLÜL … HAZİRAN). Başlık satırı: S.N, ZÜMRE, BİRİM, SINIF, ETKİNLİK KAPSAMI, ETKİNLİK ADI, TARİH,
// OKUL İÇİ/OKUL DIŞI, KONFERANS SALONU KULLANIMI, KONTROL. Sütunlar başlık adından bulunur (sıra değişse de okunur).
// Boş satırlar atlanır. Yıl yanlış yazılmışsa (ör. Ocak sayfasında 2026) ay sayfasına göre düzeltilir ve gösterilir.
// ============================================================================
import { AY_ADLARI, ZUMRELER, buyuk, tarihYaz, zumreAdi, type AktSatir } from '../services/akademikTakvimService';

export const AY_SAYFALARI: Record<string, number> = {
  EYLÜL: 9, EKİM: 10, KASIM: 11, ARALIK: 12, OCAK: 1, ŞUBAT: 2, MART: 3, NİSAN: 4, MAYIS: 5, HAZİRAN: 6,
};
const BASLIKLAR = ['S.N', 'ZÜMRE', 'BİRİM', 'SINIF', 'ETKİNLİK KAPSAMI', 'ETKİNLİK ADI', 'TARİH', 'OKUL İÇİ/OKUL DIŞI', 'KONFERANS SALONU KULLANIMI', 'KONTROL'];

export type OkunanDurum = 'yeni' | 'duzeltildi' | 'hatali';
export interface OkunanSatir extends Partial<AktSatir> {
  sayfa: string;
  satirNo: number;
  durum: OkunanDurum;
  not: string;
}
export interface OkumaSonucu {
  sayfaSayisi: number;
  satirlar: OkunanSatir[];
}

const AYLAR_TR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

/** Tek gün: [gün, ay, yıl?] ya da null. "15.03.2027", "15/3/27", "15.03", "15 Mart 2027", "15 Mart", "2027-03-15" */
function gunOku(t: string): [number, number, number | null] | null {
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return [+m[3], +m[2], +m[1]];
  m = t.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?$/);
  if (m) return [+m[1], +m[2], m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null];
  m = t.match(/^(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?$/u);
  if (m) {
    const ay = AYLAR_TR.indexOf(m[2]) + 1;
    return ay ? [+m[1], ay, m[3] ? +m[3] : null] : null;
  }
  return null;
}

/**
 * Aşama 327: TARİH hücresi → { bas, bit? }. Yılı yazılmamışsa ay sayfasının eğitim yılından alınır (Eyl–Ara = yil, Oca–Haz = yil+1).
 * Birkaç gün süren etkinlik: "15-19.03", "15-19.03.2027", "15.03-19.03", "30.03-02.04.2027", "15-19 Mart", "15 Mart - 19 Mart".
 */
function tarihOku(v: unknown, yil: number): { bas: Date; bit: Date | null } | null {
  if (v instanceof Date && !isNaN(v.getTime())) return { bas: new Date(v.getFullYear(), v.getMonth(), v.getDate()), bit: null };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel gün sayısı (1900 sistemi)
    const u = new Date(Math.round((v - 25569) * 864e5));
    return { bas: new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()), bit: null };
  }
  // "15.03" genel biçimli hücrede sayı (15,03) olarak durur: gün.ay diye okunur
  const t = (typeof v === 'number' && v >= 1 && v < 32 && !Number.isInteger(v) ? v.toFixed(2) : buyuk(v)).replace(/\s*[–—]\s*/g, '-');
  if (!t) return null;
  const kur = (g: number, a: number, y: number | null): Date | null => {
    const yy = y ?? (a >= 9 ? yil : yil + 1);
    const d = new Date(yy, a - 1, g);
    return d.getFullYear() === yy && d.getMonth() === a - 1 && d.getDate() === g ? d : null;
  };
  const tek = gunOku(t);
  const tekGun = tek && kur(...tek);
  if (tekGun) return { bas: tekGun, bit: null }; // geçersizse ("15-19.03" gün.ay.yıl sanılabilir) aralık olarak denenir
  // "15-19.03(.2027)" ya da "15-19 MART( 2027)": ilk gün yalnız sayı, ay ve yıl ikinci parçada
  let m = t.match(/^(\d{1,2})\s*-\s*(\d{1,2}(?:[./]\d{1,2}(?:[./](?:\d{4}|\d{2}))?|\s+\p{L}+(?:\s+\d{4})?))$/u);
  let ilk: [number, number, number | null] | null = null;
  let son: [number, number, number | null] | null = null;
  if (m) {
    son = gunOku(m[2]);
    if (son) ilk = [+m[1], son[1], son[2]];
  } else {
    // "15.03-19.03(.2027)" ya da "15 MART - 19 MART": iki parça da tam
    m = t.match(/^(.+?)\s*-\s*(\d{1,2}(?:[./]\d{1,2}(?:[./](?:\d{4}|\d{2}))?|\s+\p{L}+(?:\s+\d{4})?))$/u);
    if (m) {
      son = gunOku(m[2]);
      ilk = gunOku(m[1].trim());
      if (ilk && son && ilk[2] === null) ilk = [ilk[0], ilk[1], son[2] !== null && ilk[1] > son[1] ? son[2] - 1 : son[2]];
    }
  }
  if (!ilk || !son) return null;
  const bas = kur(...ilk);
  const bit = kur(...son);
  if (!bas || !bit) return null;
  return { bas, bit: bit.getTime() === bas.getTime() ? null : bit };
}

/** Dosyayı okur; veritabanına bir şey yazmaz. yil: eğitim öğretim yılının başladığı yıl (2026 → 2026–2027) */
export async function takvimExcelOku(dosya: File, yil: number): Promise<OkumaSonucu> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await dosya.arrayBuffer(), { type: 'array' });
  const satirlar: OkunanSatir[] = [];
  let sayfaSayisi = 0;
  // Aşama 327: ZÜMRE sütunu boşsa dosya adındaki zümre kullanılır ("MATEMATİK ZÜMRESİ 2026 AKADEMİK TAKVİM.xlsx")
  const dosyaAdi = buyuk(dosya.name || '');
  const dosyaZumresi = [...ZUMRELER].sort((a, b) => b.length - a.length).find((z) => dosyaAdi.includes(z)) || '';
  for (const ad of wb.SheetNames) {
    const ay = AY_SAYFALARI[buyuk(ad)];
    if (!ay) continue;
    sayfaSayisi++;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ad], { header: 1, raw: true, defval: null, blankrows: false });
    const hi = rows.findIndex((r) => Array.isArray(r) && r.some((c) => buyuk(c) === 'ETKİNLİK ADI'));
    if (hi < 0) continue;
    const H = (rows[hi] as unknown[]).map(buyuk);
    const sut = (n: string) => H.findIndex((x) => x.startsWith(n));
    const S = {
      ad: sut('ETKİNLİK ADI'), tarih: sut('TARİH'), sinif: sut('SINIF'), kapsam: sut('ETKİNLİK KAPSAMI'), yer: sut('OKUL İÇİ'),
      salon: sut('KONFERANS'), birim: sut('BİRİM'), zumre: sut('ZÜMRE'), kontrol: sut('KONTROL'),
    };
    rows.slice(hi + 1).forEach((r, i) => {
      const row = (r || []) as unknown[];
      const v = (k: keyof typeof S) => (S[k] >= 0 ? row[S[k]] : null);
      const etkinlik = buyuk(v('ad'));
      const tv = v('tarih');
      if (!etkinlik && (tv === null || tv === '')) return; // boş satır (yalnız sıra no / birim yazılı olabilir)
      const s: OkunanSatir = {
        sayfa: ad,
        satirNo: hi + i + 2,
        durum: 'yeni',
        not: '',
        ayIcinde: false,
        ad: etkinlik,
        sinif: buyuk(v('sinif')),
        birim: buyuk(v('birim')),
        zumre: zumreAdi(v('zumre'), v('birim')) || dosyaZumresi, // Aşama 329: "MATEMATİK" → "MATEMATİK ZÜMRESİ"
        kapsam: /VELİ/.test(buyuk(v('kapsam'))) ? 'veli' : 'ogrenci',
        yer: /DIŞ/.test(buyuk(v('yer'))) ? 'dis' : 'ic',
        salon: buyuk(v('salon')) === 'EVET',
        kontrol: !!v('kontrol') && !/HAYIR/.test(buyuk(v('kontrol'))),
      };
      const okunan = tarihOku(tv, yil);
      let d = okunan?.bas ?? null;
      let bit = okunan?.bit ?? null;
      const gunFark = d && bit ? Math.round((bit.getTime() - d.getTime()) / 864e5) : 0;
      if (!etkinlik) {
        s.durum = 'hatali';
        s.not = 'Etkinlik adı boş';
      } else if (tv === null || tv === '' || !buyuk(tv)) {
        // Aşama 327: tarihi boş etkinlik sayfanın ayı içinde yapılacak sayılır ("Aralık içinde")
        const y = ay >= 9 ? yil : yil + 1;
        s.tarih = tarihYaz(new Date(y, ay - 1, 1));
        s.bitis = tarihYaz(new Date(y, ay, 0));
        s.ayIcinde = true;
        s.not = `Günü yok: ${AY_ADLARI[ay - 1]} içinde`;
      } else if (!d) {
        s.durum = 'hatali';
        s.not = `Tarih okunamadı ("${String(tv).trim().slice(0, 24)}")`;
      } else if (gunFark < 0 || gunFark > 60) {
        s.durum = 'hatali';
        s.not = gunFark < 0 ? 'Bitiş günü başlangıçtan önce' : 'Etkinlik 60 günden uzun';
      } else {
        const beklenen = d.getMonth() + 1 >= 9 ? yil : yil + 1;
        if (d.getMonth() + 1 !== ay) s.not = `${AY_ADLARI[ay - 1]} sayfasında, tarih ${AY_ADLARI[d.getMonth()]}`;
        if (d.getMonth() + 1 >= 7 && d.getMonth() + 1 <= 8) {
          s.durum = 'hatali';
          s.not = 'Tarih yaz tatilinde';
        } else if (d.getFullYear() !== beklenen) {
          s.durum = 'duzeltildi';
          s.not = `Yıl ${d.getFullYear()} → ${beklenen}`;
          const kay = beklenen - d.getFullYear();
          d = new Date(beklenen, d.getMonth(), d.getDate());
          if (bit) bit = new Date(bit.getFullYear() + kay, bit.getMonth(), bit.getDate());
        }
        s.tarih = tarihYaz(d);
        s.bitis = bit ? tarihYaz(bit) : '';
        s.ayIcinde = false;
      }
      satirlar.push(s);
    });
  }
  return { sayfaSayisi, satirlar };
}

/** Boş şablon: kurumun kullandığı biçimle aynı (10 ay sayfası, aynı başlıklar) */
export async function takvimSablonIndir(yil: number): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const ay of Object.keys(AY_SAYFALARI)) {
    const ws = XLSX.utils.aoa_to_sheet([BASLIKLAR]);
    ws['!cols'] = [6, 24, 12, 10, 18, 44, 12, 18, 26, 10].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, ay);
  }
  XLSX.writeFile(wb, `${yil}-${yil + 1} akademik takvim şablonu.xlsx`);
}
