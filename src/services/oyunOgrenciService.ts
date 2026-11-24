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
export type SerbestMod = 'calisma' | 'quiz' | 'cark' | 'bulmaca' | 'hafiza' | 'savunma';
export type SerbestZorluk = '' | 'kolay' | 'orta' | 'zor';

export const SERBEST_MODLAR: Array<{ mod: SerbestMod; ad: string; not: string }> = [
  { mod: 'calisma', ad: 'Çalışma', not: 'Süre yok, yanlışta açıklama' },
  { mod: 'quiz', ad: 'Meydan okuma', not: 'Süreli, rekorunu geç' },
  { mod: 'cark', ad: 'Kelime çarkı', not: 'Harf harf bul' },
  { mod: 'bulmaca', ad: 'Bulmaca', not: 'Çapraz bulmaca' },
  { mod: 'hafiza', ad: 'Hafıza', not: 'Kartları eşleştir' },
  { mod: 'savunma', ad: 'Savunma', not: 'Kaleni 3 canla koru' },
];
/** sunucudaki SERBEST_SAYI ile aynı: seçilebilir sayılar ve en az sayı */
export const SERBEST_SAYILAR: Record<SerbestMod, { secenek: number[]; enAz: number }> = {
  calisma: { secenek: [5, 10, 15, 20], enAz: 3 },
  quiz: { secenek: [5, 10, 15, 20], enAz: 3 },
  cark: { secenek: [3, 5, 8, 10], enAz: 1 },
  bulmaca: { secenek: [4, 6, 8, 10], enAz: 2 },
  hafiza: { secenek: [3, 4, 6, 8], enAz: 3 },
  savunma: { secenek: [5, 10, 15, 20], enAz: 3 },
};
export const serbestTur = (mod: SerbestMod) => (mod === 'cark' || mod === 'bulmaca' || mod === 'hafiza' ? 'kelime' : 'coktan');

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
  /** Aşama 397: bu oyunda kazanılan rozetler */
  yeniRozetler?: Array<{ rozet: RozetKod; detay: { ders?: string; konu?: string; dogru?: number; toplam?: number } | null }>;
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

// ============================================================================
// Aşama 397: ROZETLER VE GELİŞİM — rozetler sunucuda (oyun bitince veritabanında) verilir; burası yalnız gösterir.
// ============================================================================
export type RozetKod = 'ilk_adim' | 'seri_3' | 'seri_7' | 'seri_30' | 'konu_ustasi' | 'yuz_dogru' | 'tekrarci' | 'rekor_kirici';
export const ROZETLER: Array<{ kod: RozetKod; ad: string; not: string; simge: string }> = [
  { kod: 'ilk_adim', ad: 'İlk adım', not: 'İlk oyunun', simge: '▶' },
  { kod: 'seri_3', ad: '3 gün seri', not: 'Üst üste 3 gün', simge: '3' },
  { kod: 'seri_7', ad: 'Haftalık', not: '7 gün seri', simge: '7' },
  { kod: 'seri_30', ad: 'Ay boyu', not: '30 gün seri', simge: '30' },
  { kod: 'konu_ustasi', ad: 'Konu ustası', not: 'Bir konuda usta', simge: '★' },
  { kod: 'yuz_dogru', ad: 'Yüz doğru', not: 'Toplam 100 doğru', simge: '100' },
  { kod: 'tekrarci', ad: 'Tekrarcı', not: 'Yanlışlarını tekrar etti', simge: '↻' },
  { kod: 'rekor_kirici', ad: 'Rekor kırıcı', not: 'Kendi rekorunu geç', simge: '▲' },
];
/** Usta: son 30 günde en az 10 soruda %80 (veritabanındaki kuralla aynı) */
export const USTA_EN_AZ = 10;
export const USTA_ORAN = 0.8;

export interface Gelisim {
  seri: number;
  enUzunSeri: number;
  toplamDogru: number;
  /** İstanbul'a göre bugün (YYYY-AA-GG) */
  bugun: string;
  takvim: Array<{ gun: string; n: number }>;
  konular: Array<{ ders: string; konu: string; dogru: number; toplam: number }>;
  rozetler: Array<{ rozet: RozetKod; kazanildi: string; detay: { ders?: string; konu?: string } | null }>;
}
export async function gelisimim(): Promise<Gelisim> {
  const r = await serbestCagri('gelisim');
  return {
    seri: Number(r.seri) || 0,
    enUzunSeri: Number(r.enUzunSeri) || 0,
    toplamDogru: Number(r.toplamDogru) || 0,
    bugun: String(r.bugun || ''),
    takvim: Array.isArray(r.takvim) ? r.takvim : [],
    konular: Array.isArray(r.konular) ? r.konular : [],
    rozetler: Array.isArray(r.rozetler) ? r.rozetler : [],
  };
}

/** Kazanılmamış rozet için ilerleme (0-1); ölçülemeyenler null */
export function rozetIlerleme(kod: RozetKod, g: Pick<Gelisim, 'seri' | 'toplamDogru'>): number | null {
  if (kod === 'seri_3') return Math.min(1, g.seri / 3);
  if (kod === 'seri_7') return Math.min(1, g.seri / 7);
  if (kod === 'seri_30') return Math.min(1, g.seri / 30);
  if (kod === 'yuz_dogru') return Math.min(1, g.toplamDogru / 100);
  return null;
}
/** Sıradaki seri rozeti: kazanılmamış en küçük eşik */
export function siradakiSeri(seri: number, kazanilan: Set<string>): { kod: RozetKod; ad: string; kalan: number } | null {
  for (const [kod, n, ad] of [['seri_3', 3, '3 gün seri'], ['seri_7', 7, 'Haftalık'], ['seri_30', 30, 'Ay boyu']] as Array<[RozetKod, number, string]>) {
    if (!kazanilan.has(kod) && seri < n) return { kod, ad, kalan: n - seri };
  }
  return null;
}

/** Son 28 gün (bugün dahil), pazartesiden başlayan 4-5 haftalık ızgara: null = ızgara dolgusu */
export function takvimIzgarasi(bugun: string, takvim: Gelisim['takvim']): Array<{ gun: string; n: number; bugun: boolean } | null> {
  const m = new Map(takvim.map((t) => [String(t.gun).slice(0, 10), Number(t.n) || 0]));
  const [y, a, d] = bugun.split('-').map(Number);
  const b = new Date(Date.UTC(y, (a || 1) - 1, d || 1));
  const gunler: Array<{ gun: string; n: number; bugun: boolean }> = [];
  for (let i = 27; i >= 0; i--) {
    const t = new Date(b.getTime() - i * 86400000).toISOString().slice(0, 10);
    gunler.push({ gun: t, n: m.get(t) || 0, bugun: i === 0 });
  }
  const ilkHaftaGunu = (new Date(gunler[0].gun + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = pazartesi
  const sonBos = 6 - ((new Date(gunler[27].gun + 'T00:00:00Z').getUTCDay() + 6) % 7);
  return [...Array(ilkHaftaGunu).fill(null), ...gunler, ...Array(sonBos).fill(null)];
}
