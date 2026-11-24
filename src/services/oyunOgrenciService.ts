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

export interface OgrenciOyunlari {
  /** Oyunlar bölümü öğrencinin kurumunda açık mı (kapalıysa sekme gösterilmez) */
  acik: boolean;
  oyunlar: OgrenciOyun[];
}

export async function ogrenciOyunlari(): Promise<OgrenciOyunlari> {
  const r = await callMailOnce('oyun-ogrenci', { op: 'liste' });
  if (!r.ok) throw new Error(r.error || 'Oyunlar okunamadı.');
  return { acik: !!r.acik, oyunlar: Array.isArray(r.oyunlar) ? (r.oyunlar as OgrenciOyun[]) : [] };
}

/** Önce yarım kalanlar, sonra oynanmamışlar (yeni → eski), en sonda bitenler ve süresi dolanlar */
export function oyunSirasi(a: OgrenciOyun, b: OgrenciOyun): number {
  const derece = (o: OgrenciOyun) => (o.token ? (o.deneme ? 0 : 1) : 2);
  return derece(a) - derece(b) || (b.olusturma || '').localeCompare(a.olusturma || '');
}
