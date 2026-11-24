// Aşama 381: herkese açık oyun sayfasının sunucu çağrıları (giriş gerektirmez; her istekte bağlantı imzası denetlenir)
export type OyunMod = 'quiz' | 'cark' | 'bulmaca';

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
export interface OyunOzet {
  puan: number;
  dogru: number;
  toplam: number;
  bitti: boolean;
}
export type OyunEkrani =
  | { tur: 'quiz'; soru: QuizSoru; puan: number }
  | { tur: 'cark'; tahta: CarkTahta; puan: number }
  | { tur: 'bulmaca'; bulmaca: BulmacaTahta; puan: number }
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
