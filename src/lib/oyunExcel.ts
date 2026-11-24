// ============================================================================
// Aşama 395: Oyunlar — Excel ile toplu soru yükleme (saf mantık; dosya okuma/yazma bileşende)
// Şablon sütunları: Soru, A, B, C, D, Doğru (A-D), Açıklama, Zorluk (Kolay/Orta/Zor), Konu.
// Başlıklar büyük/küçük harf ve Türkçe karakter farkına bakmaz; sütun sırası serbesttir. Her satır tek tek
// denetlenir: geçerli satırlar eklenir, hatalı satırlar nedeniyle listelenir (hiçbiri sessizce atlanmaz).
// ============================================================================
import { soruHatasi } from './oyunSoruKurali';
import type { OyunSoruGirdi, OyunZorluk } from '../services/oyunService';

export const EXCEL_EN_COK = 150;
export const EXCEL_BASLIKLAR = ['Soru', 'A', 'B', 'C', 'D', 'Doğru', 'Açıklama', 'Zorluk', 'Konu'] as const;
/** Şablondaki örnek satır (öğretmen silip kendi sorularını yazar) */
export const EXCEL_ORNEK: string[] = ['Mevsimlerin oluşmasının asıl nedeni nedir?', "Dünya'nın eksen eğikliği", "Dünya'nın kendi etrafında dönmesi", "Ay'ın çekim etkisi", "Güneş'teki lekeler", 'A', 'Eksen eğikliği nedeniyle ışınlar farklı açıyla gelir.', 'Orta', 'Mevsimlerin oluşumu'];

const kat = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const anahtar = (v: unknown) =>
  kat(v)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

const SUTUN_ADLARI: Record<string, string[]> = {
  soru: ['soru', 'soruk', 'soruMetni', 'soruMetin'].map(anahtar),
  a: ['a', 'asikki', 'sik1'],
  b: ['b', 'bsikki', 'sik2'],
  c: ['c', 'csikki', 'sik3'],
  d: ['d', 'dsikki', 'sik4'],
  dogru: ['dogru', 'dogrucevap', 'dogrusik', 'cevap'],
  aciklama: ['aciklama', 'not'],
  zorluk: ['zorluk', 'seviye'],
  konu: ['konu'],
};

export interface ExcelSatir {
  /** Excel'deki satır numarası (başlık 1) */
  satir: number;
  girdi?: OyunSoruGirdi;
  hata?: string;
}

export interface ExcelSonuc {
  satirlar: ExcelSatir[];
  gecerli: OyunSoruGirdi[];
  hatali: ExcelSatir[];
  /** dosyada beklenen sütunlardan eksik olanlar (soru ve şık sütunları zorunlu) */
  eksikSutunlar: string[];
  /** EXCEL_EN_COK'tan sonrası okunmadı */
  kesildi: boolean;
}

function zorlukCoz(v: string): OyunZorluk | null {
  const k = anahtar(v);
  if (!k) return 'orta';
  if (k === 'kolay' || k === 'easy' || k === '1') return 'kolay';
  if (k === 'orta' || k === 'medium' || k === '2') return 'orta';
  if (k === 'zor' || k === 'hard' || k === '3') return 'zor';
  return null;
}

/** "A", "b", "C şıkkı", "3", "Pascal" gibi değerlerden doğru şık sırasını bulur; bulunamazsa -1 */
function dogruCoz(v: string, siklar: string[]): number {
  const k = anahtar(v);
  if (!k) return -1;
  const harf = k.replace(/sikki?$/, '');
  if (/^[abcd]$/.test(harf)) return 'abcd'.indexOf(harf);
  if (/^[1-4]$/.test(k)) return Number(k) - 1;
  const i = siklar.findIndex((s) => anahtar(s) === k);
  return i;
}

/**
 * Sayfa satırlarını (ilk satır başlık) sorulara çevirir. ders / sınıf dışarıdan gelir.
 * @param tablo  SheetJS sheet_to_json(header:1) çıktısı gibi satır dizisi
 */
export function excelSorulariCoz(tablo: unknown[][], ders: string, sinif: number | null): ExcelSonuc {
  const bas = (tablo[0] || []).map(anahtar);
  const sutun: Record<string, number> = {};
  for (const [ad, takma] of Object.entries(SUTUN_ADLARI)) {
    const i = bas.findIndex((h) => takma.includes(h));
    if (i >= 0) sutun[ad] = i;
  }
  const zorunlu: Array<[string, string]> = [['soru', 'Soru'], ['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['dogru', 'Doğru']];
  const eksikSutunlar = zorunlu.filter(([k]) => sutun[k] === undefined).map(([, ad]) => ad);
  const sonuc: ExcelSonuc = { satirlar: [], gecerli: [], hatali: [], eksikSutunlar, kesildi: false };
  if (eksikSutunlar.length) return sonuc;

  const gorulen = new Set<string>();
  for (let r = 1; r < tablo.length; r++) {
    const h = tablo[r] || [];
    const al = (ad: string) => (sutun[ad] === undefined ? '' : kat(h[sutun[ad]]));
    const metin = al('soru');
    const siklar = [al('a'), al('b'), al('c'), al('d')];
    if (!metin && siklar.every((s) => !s)) continue; // tamamen boş satır
    if (sonuc.satirlar.length >= EXCEL_EN_COK) {
      sonuc.kesildi = true;
      break;
    }
    const satir = r + 1;
    const hataVer = (hata: string) => {
      const x: ExcelSatir = { satir, hata };
      sonuc.satirlar.push(x);
      sonuc.hatali.push(x);
    };
    const zorluk = zorlukCoz(al('zorluk'));
    if (!zorluk) {
      hataVer('Zorluk Kolay, Orta ya da Zor olmalı.');
      continue;
    }
    const dogru = dogruCoz(al('dogru'), siklar);
    const girdi: OyunSoruGirdi = {
      tur: 'coktan',
      sinif,
      ders,
      konu: al('konu').slice(0, 300),
      kazanimKodu: null,
      zorluk,
      metin,
      siklar,
      dogru: dogru >= 0 ? dogru : null,
      cevap: '',
      aciklama: al('aciklama').slice(0, 300),
    };
    const h2 = soruHatasi(girdi);
    if (h2) {
      hataVer(h2 === 'Doğru şıkkı seçin.' ? 'Doğru sütunu A, B, C ya da D olmalı.' : h2);
      continue;
    }
    const kay = anahtar(metin);
    if (gorulen.has(kay)) {
      hataVer('Aynı soru dosyada iki kez var.');
      continue;
    }
    gorulen.add(kay);
    const x: ExcelSatir = { satir, girdi };
    sonuc.satirlar.push(x);
    sonuc.gecerli.push(girdi);
  }
  return sonuc;
}
