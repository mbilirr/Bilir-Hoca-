// ============================================================================
// Aşama 385: ÖĞRENCİNİN OYUNLARI — ana sayfa › Bana gelenler › Oyun
// Öğrenci oyun tablolarını okuyamaz; liste sunucudan (api/mail.js action 'oyun-ogrenci') öğrencinin KENDİ
// oturumuyla gelir. Oynanabilecek her oyun için öğrencinin kendi adına imzalı bağlantı (token) döner; oyun,
// bağlantıyla açılan sayfanın aynısıyla oynanır (cevap, puan ve süre sunucuda).
// ============================================================================
import { callMailOnce } from '../lib/mailApi';
import type { OyunMod } from './oyunOturumService';

export interface OgrenciOyun {
  id: string;
  ad: string;
  mod: OyunMod;
  sinif: string;
  soruSayisi: number;
  bitis: string;
  ogretmen: string;
  olusturma: string;
  /** süresi dolmadı */
  acik: boolean;
  deneme: { durum: 'suruyor' | 'bitti'; puan: number; dogru: number; toplam: number } | null;
  /** yalnız oynanabilir oyunda (açık ve bitirilmemiş) */
  token?: string;
}

/** Aşama 389: öğrencinin sınıfını kapsayan en yeni turnuva; yalnız kendi sırası (başkalarının adı gelmez) */
export interface OgrenciTurnuva {
  id: string;
  ad: string;
  ogretmen: string;
  oyunSayisi: number;
  katilan: number;
  ben: { sira: number; puan: number; oyun: number } | null;
}

export interface OgrenciOyunlari {
  /** Oyunlar bölümü öğrencinin kurumunda açık mı (kapalıysa sekme gösterilmez) */
  acik: boolean;
  oyunlar: OgrenciOyun[];
  turnuva: OgrenciTurnuva | null;
  /** Aşama 396: okulun soru bankasında soru var: "Kendin oyna" açılabilir */
  serbest: boolean;
}

export async function ogrenciOyunlari(): Promise<OgrenciOyunlari> {
  const r = await callMailOnce('oyun-ogrenci', { op: 'liste' });
  if (!r.ok) throw new Error(r.error || 'Oyunlar okunamadı.');
  return {
    acik: !!r.acik,
    oyunlar: Array.isArray(r.oyunlar) ? (r.oyunlar as OgrenciOyun[]) : [],
    turnuva: r.turnuva && typeof r.turnuva === 'object' ? (r.turnuva as OgrenciTurnuva) : null,
    serbest: !!r.serbest,
  };
}

/** Önce yarım kalanlar, sonra oynanmamışlar (yeni → eski), en sonda bitenler ve süresi dolanlar */
export function oyunSirasi(a: OgrenciOyun, b: OgrenciOyun): number {
  const derece = (o: OgrenciOyun) => (o.token ? (o.deneme ? 0 : 1) : 2);
  return derece(a) - derece(b) || (b.olusturma || '').localeCompare(a.olusturma || '');
}

// ============================================================================
// Aşama 396: KENDİN OYNA — öğrenci öğretmen beklemeden okulun soru bankasından oyun kurar.
// Sorular sunucuda seçilir (öğrenci soru tablosunu okuyamaz); oyun kendi adına imzalı bağlantıyla oynanır.
// ============================================================================
export type SerbestMod = 'calisma' | 'quiz' | 'cark' | 'bulmaca';
export type SerbestZorluk = '' | 'kolay' | 'orta' | 'zor';

export const SERBEST_MODLAR: Array<{ mod: SerbestMod; ad: string; not: string }> = [
  { mod: 'calisma', ad: 'Çalışma', not: 'Süre yok, yanlışta açıklama' },
  { mod: 'quiz', ad: 'Meydan okuma', not: 'Süreli, rekorunu geç' },
  { mod: 'cark', ad: 'Kelime çarkı', not: 'Harf harf bul' },
  { mod: 'bulmaca', ad: 'Bulmaca', not: 'Çapraz bulmaca' },
];
/** sunucudaki SERBEST_SAYI ile aynı: seçilebilir sayılar ve en az sayı */
export const SERBEST_SAYILAR: Record<SerbestMod, { secenek: number[]; enAz: number }> = {
  calisma: { secenek: [5, 10, 15, 20], enAz: 3 },
  quiz: { secenek: [5, 10, 15, 20], enAz: 3 },
  cark: { secenek: [3, 5, 8, 10], enAz: 1 },
  bulmaca: { secenek: [4, 6, 8, 10], enAz: 2 },
};
export const serbestTur = (mod: SerbestMod) => (mod === 'cark' || mod === 'bulmaca' ? 'kelime' : 'coktan');

export interface SerbestAyar {
  mod: SerbestMod;
  ders: string;
  konu: string;
  zorluk: SerbestZorluk;
  adet: number;
}
export interface SerbestBankaSatiri {
  ders: string;
  konu: string;
  tur: 'coktan' | 'kelime';
  zorluk: 'kolay' | 'orta' | 'zor';
  n: number;
}
export interface SerbestBilgi {
  seri: number;
  /** bugün bir oyun bitirdi (seri bugün için sayıldı) */
  bugun: boolean;
  enUzunSeri: number;
  /** "tür:soru sayısı" → en iyi puan */
  rekor: Record<string, { p: number }>;
  sonAyar: SerbestAyar | null;
  hafta: { dogru: number; toplam: number };
  zayif: { ders: string; konu: string; dogru: number; toplam: number } | null;
  banka: SerbestBankaSatiri[];
}
export interface SerbestOyun {
  oyun: { id: string; ad: string; mod: SerbestMod; soruSayisi: number };
  token: string;
}
export interface SerbestSonuc {
  oyun: { id: string; ad: string; mod: SerbestMod; ayar: (Partial<SerbestAyar> & { tekrar?: boolean }) | null };
  sonuc: { puan: number; dogru: number; toplam: number };
  rekor: { enIyi: number; yeni: boolean; onceki: number | null } | null;
  seri: number;
  yanlislar: Array<{ metin: string; dogru: string; gorselli: boolean }>;
}

const serbestCagri = async (op: string, ek: Record<string, unknown> = {}) => {
  const r = await callMailOnce('oyun-ogrenci', { op, ...ek });
  if (!r.ok) throw new Error(r.error || 'Bir sorun oluştu. Biraz sonra tekrar dene.');
  return r as any;
};

export async function serbestBilgi(): Promise<SerbestBilgi> {
  const r = await serbestCagri('serbest-bilgi');
  return {
    seri: Number(r.seri) || 0,
    bugun: !!r.bugun,
    enUzunSeri: Number(r.enUzunSeri) || 0,
    rekor: r.rekor && typeof r.rekor === 'object' ? r.rekor : {},
    sonAyar: r.sonAyar && typeof r.sonAyar === 'object' && r.sonAyar.ders ? (r.sonAyar as SerbestAyar) : null,
    hafta: { dogru: Number(r.hafta?.dogru) || 0, toplam: Number(r.hafta?.toplam) || 0 },
    zayif: r.zayif && r.zayif.konu ? r.zayif : null,
    banka: Array.isArray(r.banka) ? (r.banka as SerbestBankaSatiri[]) : [],
  };
}
export const serbestBaslat = (a: SerbestAyar | { tekrarOyunId: string }): Promise<SerbestOyun> => serbestCagri('serbest-baslat', { ...a });
export const serbestSonuc = (oyunId: string): Promise<SerbestSonuc> => serbestCagri('serbest-sonuc', { oyunId });

/** Seçime uyan soru (kelimede tekil cevap) sayısı */
export function serbestSayi(banka: SerbestBankaSatiri[], a: Pick<SerbestAyar, 'mod' | 'ders' | 'konu' | 'zorluk'>): number {
  const tur = serbestTur(a.mod);
  return banka.filter((b) => b.tur === tur && b.ders === a.ders && (!a.konu || b.konu === a.konu) && (!a.zorluk || b.zorluk === a.zorluk)).reduce((t, b) => t + (Number(b.n) || 0), 0);
}
/** Türe uyan dersler (soru sayısı çoktan aza) */
export function serbestDersler(banka: SerbestBankaSatiri[], mod: SerbestMod): Array<{ ders: string; n: number }> {
  const tur = serbestTur(mod);
  const m = new Map<string, number>();
  for (const b of banka) if (b.tur === tur) m.set(b.ders, (m.get(b.ders) || 0) + (Number(b.n) || 0));
  return [...m].map(([ders, n]) => ({ ders, n })).sort((a, b) => b.n - a.n || a.ders.localeCompare(b.ders, 'tr'));
}
/** Dersin konuları (seçili zorluğa göre sayı); konusu boş sorular yalnız "Hepsi"nde sayılır */
export function serbestKonular(banka: SerbestBankaSatiri[], a: Pick<SerbestAyar, 'mod' | 'ders' | 'zorluk'>): Array<{ konu: string; n: number }> {
  const tur = serbestTur(a.mod);
  const m = new Map<string, number>();
  for (const b of banka) if (b.tur === tur && b.ders === a.ders && b.konu && (!a.zorluk || b.zorluk === a.zorluk)) m.set(b.konu, (m.get(b.konu) || 0) + (Number(b.n) || 0));
  return [...m].map(([konu, n]) => ({ konu, n })).sort((x, y) => x.konu.localeCompare(y.konu, 'tr'));
}
