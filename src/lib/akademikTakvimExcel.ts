// ============================================================================
// Aşama 242: AKADEMİK TAKVİM EXCEL'İ (kurumun kullandığı biçim)
// Her ay ayrı sayfa (EYLÜL … HAZİRAN). Başlık satırı: S.N, ZÜMRE, BİRİM, SINIF, ETKİNLİK KAPSAMI, ETKİNLİK ADI, TARİH,
// OKUL İÇİ/OKUL DIŞI, KONFERANS SALONU KULLANIMI, KONTROL. Sütunlar başlık adından bulunur (sıra değişse de okunur).
// Boş satırlar atlanır. Yıl yanlış yazılmışsa (ör. Ocak sayfasında 2026) ay sayfasına göre düzeltilir ve gösterilir.
// ============================================================================
import { AY_ADLARI, buyuk, tarihYaz, type AktSatir } from '../services/akademikTakvimService';

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

function tarihOku(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel gün sayısı (1900 sistemi)
    const u = new Date(Math.round((v - 25569) * 864e5));
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

/** Dosyayı okur; veritabanına bir şey yazmaz. yil: eğitim öğretim yılının başladığı yıl (2026 → 2026–2027) */
export async function takvimExcelOku(dosya: File, yil: number): Promise<OkumaSonucu> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await dosya.arrayBuffer(), { type: 'array' });
  const satirlar: OkunanSatir[] = [];
  let sayfaSayisi = 0;
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
        ad: etkinlik,
        sinif: buyuk(v('sinif')),
        birim: buyuk(v('birim')),
        zumre: buyuk(v('zumre')),
        kapsam: /VELİ/.test(buyuk(v('kapsam'))) ? 'veli' : 'ogrenci',
        yer: /DIŞ/.test(buyuk(v('yer'))) ? 'dis' : 'ic',
        salon: buyuk(v('salon')) === 'EVET',
        kontrol: !!v('kontrol') && !/HAYIR/.test(buyuk(v('kontrol'))),
      };
      let d = tarihOku(tv);
      if (!etkinlik) {
        s.durum = 'hatali';
        s.not = 'Etkinlik adı boş';
      } else if (!d) {
        s.durum = 'hatali';
        s.not = 'Tarih okunamadı';
      } else {
        const beklenen = d.getMonth() + 1 >= 9 ? yil : yil + 1;
        if (d.getMonth() + 1 !== ay) s.not = `${AY_ADLARI[ay - 1]} sayfasında, tarih ${AY_ADLARI[d.getMonth()]}`;
        if (d.getMonth() + 1 >= 7 && d.getMonth() + 1 <= 8) {
          s.durum = 'hatali';
          s.not = 'Tarih yaz tatilinde';
        } else if (d.getFullYear() !== beklenen) {
          s.durum = 'duzeltildi';
          s.not = `Yıl ${d.getFullYear()} → ${beklenen}`;
          d = new Date(beklenen, d.getMonth(), d.getDate());
        }
        s.tarih = tarihYaz(d);
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
