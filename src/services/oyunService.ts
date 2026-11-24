// ============================================================================
// Aşama 380: OYUNLAR — soru bankası veritabanı işlemleri (sql/380_oyunlar_bolumu.sql)
// Kurum bazlı bölüm: yalnız genel yöneticinin "Kurum bölümleri"nden açtığı kurumda çalışır (varsayılan kapalı).
// Okuma: kurumun öğretmen / idare hesapları (RLS) · Yazma: yalnız RPC ile; soruyu yazan kendisininkini, kurum
// yöneticisi / Müdür / Müdür Yrd. hepsini düzenler ve siler. Öğrenci bu tabloyu okuyamaz (doğru cevap sızmaz).
// Ekranlar her zaman sunucudaki kayıtları gösterir (yerel kopya yok).
// ============================================================================
import { supabase } from '../lib/supabase';

export type OyunSoruTur = 'coktan' | 'kelime';
export type OyunZorluk = 'kolay' | 'orta' | 'zor';

export interface OyunSoru {
  id: string;
  olusturan: string;
  olusturanAd: string;
  tur: OyunSoruTur;
  sinif: number | null;
  ders: string;
  konu: string;
  kazanimKodu: string | null;
  zorluk: OyunZorluk;
  metin: string;
  siklar: string[];
  dogru: number | null;
  cevap: string;
  aciklama: string;
  kaynak: 'elle' | 'yapay_zeka';
  /** Aşama 393: PDF'den kesilen soru resmi (oyun_gorselleri); yoksa null */
  gorselId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Kaydedilecek soru (id verilirse düzenleme) */
export interface OyunSoruGirdi {
  id?: string;
  tur: OyunSoruTur;
  sinif: number | null;
  ders: string;
  konu: string;
  kazanimKodu: string | null;
  zorluk: OyunZorluk;
  metin: string;
  siklar: string[];
  dogru: number | null;
  cevap: string;
  aciklama: string;
  gorselId?: string | null;
}

export const ZORLUKLAR: Array<{ value: OyunZorluk; label: string }> = [
  { value: 'kolay', label: 'Kolay' },
  { value: 'orta', label: 'Orta' },
  { value: 'zor', label: 'Zor' },
];
export const ZORLUK_AD: Record<OyunZorluk, string> = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor' };
export const TUR_AD: Record<OyunSoruTur, string> = { coktan: 'Çoktan seçmeli', kelime: 'Kelime' };
export const SIK_HARF = ['A', 'B', 'C', 'D'] as const;
/** Oyun soru bankasında en çok bu kadar yapay zekâ önerisi tek seferde eklenir (veritabanı sınırıyla aynı) */
export const TOPLU_EN_COK = 30;

const SQL_EKSIK = "Oyunlar veritabanında henüz kurulu değil. Supabase SQL Editor'de 380 numaralı SQL dosyasını çalıştırın.";

function hata(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message || 'İşlem yapılamadı.';
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || e?.code === 'PGRST205' || /could not find|does not exist|schema cache/i.test(m)) {
    return new Error(SQL_EKSIK);
  }
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.');
  return new Error(m);
}

const soruCevir = (r: any): OyunSoru => ({
  id: String(r.id),
  olusturan: String(r.olusturan || ''),
  olusturanAd: String(r.olusturan_ad || ''),
  tur: r.tur === 'kelime' ? 'kelime' : 'coktan',
  sinif: typeof r.sinif === 'number' ? r.sinif : null,
  ders: String(r.ders || ''),
  konu: String(r.konu || ''),
  kazanimKodu: r.kazanim_kodu ? String(r.kazanim_kodu) : null,
  zorluk: r.zorluk === 'kolay' || r.zorluk === 'zor' ? r.zorluk : 'orta',
  metin: String(r.metin || ''),
  siklar: Array.isArray(r.siklar) ? (r.siklar as unknown[]).map((x) => String(x ?? '')) : [],
  dogru: typeof r.dogru === 'number' ? r.dogru : null,
  cevap: String(r.cevap || ''),
  aciklama: String(r.aciklama || ''),
  kaynak: r.kaynak === 'yapay_zeka' ? 'yapay_zeka' : 'elle',
  gorselId: r.gorsel_id ? String(r.gorsel_id) : null,
  createdAt: String(r.created_at || ''),
  updatedAt: String(r.updated_at || ''),
});

const satirYap = (g: OyunSoruGirdi) => ({
  id: g.id || null,
  tur: g.tur,
  sinif: g.sinif,
  ders: g.ders,
  konu: g.konu,
  kazanim_kodu: g.kazanimKodu,
  zorluk: g.zorluk,
  metin: g.metin,
  siklar: g.tur === 'coktan' ? g.siklar : [],
  dogru: g.tur === 'coktan' ? g.dogru : null,
  cevap: g.tur === 'kelime' ? g.cevap : '',
  aciklama: g.aciklama,
  gorsel_id: g.tur === 'coktan' && g.gorselId ? g.gorselId : null,
});

/** Kurumun bütün soruları (RLS kendi kurumunu ve bölümün açık olmasını denetler); en yeni üstte */
export async function listOyunSorulari(): Promise<OyunSoru[]> {
  const out: OyunSoru[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('oyun_sorulari')
      .select('id,olusturan,olusturan_ad,tur,sinif,ders,konu,kazanim_kodu,zorluk,metin,siklar,dogru,cevap,aciklama,kaynak,gorsel_id,created_at,updated_at')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + 999);
    if (error) throw hata(error);
    for (const r of data || []) out.push(soruCevir(r));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Yeni soru ekler ya da (id varsa) düzenler; sunucu her alanı yeniden denetler */
export async function kaydetOyunSoru(g: OyunSoruGirdi): Promise<string> {
  const { data, error } = await supabase.rpc('oyun_soru_kaydet', { p: satirYap(g) });
  if (error) throw hata(error);
  return String(data);
}

/** Yapay zekâ önerilerinden seçilenleri tek işlemde ekler (biri hatalıysa hiçbiri yazılmaz) */
export async function topluEkleOyunSorulari(liste: OyunSoruGirdi[]): Promise<number> {
  if (!liste.length) return 0;
  const { data, error } = await supabase.rpc('oyun_soru_toplu_ekle', { p_satirlar: liste.slice(0, TOPLU_EN_COK).map(satirYap) });
  if (error) throw hata(error);
  return Number(data) || 0;
}

export async function silOyunSorulari(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('oyun_soru_sil', { p_ids: ids });
  if (error) throw hata(error);
  return Number(data) || 0;
}

/** Aşama 393: kesilen soru resmini kaydeder (JPEG data URL, en çok ~500 KB); id döner */
export async function yukleOyunGorsel(dataUrl: string): Promise<string> {
  const { data, error } = await supabase.rpc('oyun_gorsel_kaydet', { p_veri: dataUrl });
  if (error) throw hata(error);
  return String(data);
}

const gorselOnbellek = new Map<string, Promise<string | null>>();
/** Aşama 393: kayıtlı soru resmini okur (aynı resim bir kez indirilir) */
export function okuOyunGorsel(id: string): Promise<string | null> {
  let p = gorselOnbellek.get(id);
  if (!p) {
    p = Promise.resolve(supabase.from('oyun_gorselleri').select('veri').eq('id', id).maybeSingle()).then(({ data }) => (data?.veri as string | undefined) || null, () => null);
    p.then((v) => v || gorselOnbellek.delete(id));
    gorselOnbellek.set(id, p);
  }
  return p;
}

export { kelimeHatasi, soruHatasi } from '../lib/oyunSoruKurali';
