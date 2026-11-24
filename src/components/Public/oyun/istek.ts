// Aşama 381: herkese açık oyun sayfasının sunucu çağrıları (giriş gerektirmez; her istekte bağlantı imzası denetlenir)
export type OyunMod = 'quiz' | 'cark' | 'bulmaca' | 'hafiza' | 'savunma';

export interface OyunBilgi {
  ad: string;
  mod: OyunMod;
  kapsam: 'sinif' | 'kisisel';
  sinif: string;
  sureSn: number;
  soruSayisi: number;
  bitis: string;
}
export interface SinifOgrenci {
  id: string;
  ad: string;
  durum: 'suruyor' | 'bitti' | null;
}
/** Aşama 393: şıklar resimdeyse (yalnız A-D harfi yazılı) düğmeler tek satırda, büyük harfle */
export const yalnizHarf = (siklar: string[]) => siklar.length === 4 && siklar.every((x, i) => x.trim().toLocaleUpperCase('tr-TR') === 'ABCD'[i]);

export interface QuizSoru {
  no: number;
  toplam: number;
  metin: string;
  /** Aşama 393: PDF'den kesilen soru resmi (data URL); varsa soru resimden okunur */
  gorsel?: string | null;
  siklar: string[];
  sureSn: number;
  kalanMs: number;
}
/** Aşama 396: Çalışma modu sorusu (süre yok); tekrar = turun sonunda yeniden sorulan yanlış soru */
export interface CalismaSoru extends QuizSoru {
  tekrar: boolean;
}
export interface CarkTahta {
  no: number;
  toplam: number;
  ipucu: string;
  acik: Array<string | null>;
  denenen: string[];
  hata: number;
  hak: number;
  tur: number;
  asama: 'cevir' | 'harf';
  deger: number;
}
/** Aşama 382: bulmaca tahtası (cevap yok; yalnız açılmış harfler) */
export interface BulmacaKelime {
  k: number;
  no: number;
  yon: 'y' | 'd';
  x: number;
  y: number;
  n: number;
  ipucu: string;
  durum: 'acik' | 'bildi' | 'kacti';
  yanlis: number;
  deger: number;
  harfler: Array<string | null>;
}
export interface BulmacaTahta {
  gen: number;
  yuk: number;
  hak: number;
  kelimeler: BulmacaKelime[];
}
/** Aşama 398: hafıza kartı; yazı yalnız açık / eşleşmiş kartta gelir */
export interface HafizaKart {
  k: number;
  durum: 'kapali' | 'acik' | 'eslesti';
  tur?: 'ipucu' | 'kelime';
  metin?: string;
}
export interface HafizaTahta {
  kartlar: HafizaKart[];
  cift: number;
  eslesen: number;
  hamle: number;
}
export interface OyunOzet {
  puan: number;
  dogru: number;
  toplam: number;
  bitti: boolean;
}
export type OyunEkrani =
  | { tur: 'quiz'; soru: QuizSoru; puan: number }
  | { tur: 'calisma'; soru: CalismaSoru; puan: number; dogru: number }
  | { tur: 'cark'; tahta: CarkTahta; puan: number }
  | { tur: 'bulmaca'; bulmaca: BulmacaTahta; puan: number }
  | { tur: 'hafiza'; hafiza: HafizaTahta; puan: number }
  | { tur: 'savunma'; soru: QuizSoru; puan: number; can: number; canEnCok: number }
  | { tur: 'bitti'; sonuc: OyunOzet };

/** Sunucunun anlamlı hata yanıtı: kod 'kapali' | 'doldu' ise oyun artık oynanamaz */
export class OyunHatasi extends Error {
  kod: string;
  constructor(mesaj: string, kod = '') {
    super(mesaj);
    this.kod = kod;
  }
}

export async function oyunCagri<T = any>(token: string, op: string, ek: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'oyun-play', op, token, ...ek }) });
  } catch {
    throw new OyunHatasi('İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.', 'ag');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || !data.ok) throw new OyunHatasi((data && data.error) || 'Sunucuya ulaşılamadı. Biraz sonra tekrar dene.', (data && data.code) || (res.status === 410 ? 'doldu' : ''));
  return data as T;
}

/** Kalan süreyi okunur yazar: "2 gün", "5 saat", "40 dk" */
export function kalanYazi(bitisIso: string): string {
  const ms = Date.parse(bitisIso) - Date.now();
  if (!(ms > 0)) return '';
  const dk = Math.floor(ms / 60000);
  if (dk < 60) return `${Math.max(1, dk)} dk`;
  if (dk < 60 * 24) return `${Math.floor(dk / 60)} saat`;
  return `${Math.floor(dk / 1440)} gün`;
}
