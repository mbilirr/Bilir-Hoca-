// ============================================================================
// Aşama 348: TEK BİLDİRİM. "Kaydedildi", hata ve bilgi yazıları her sayfada aynı yerde ve aynı biçimde çıkar:
//   - masaüstünde sağ altta, telefonda alt menünün üstünde; en çok 3 bildirim üst üste, en yenisi altta
//   - başarı 4 sn, bilgi 6 sn, hata 10 sn görünür; fare üstündeyken ya da klavyeyle odaktayken süre durur
//   - isteğe bağlı tek eylem düğmesi ("Tekrar dene", "Aç" …); hata bildiriminde ne yapılacağı ayrıntı satırında yazar
//   - aynı yazı açıkken yeniden gelirse ikinci kez çıkmaz, süresi baştan başlar
// React'e bağlı değildir (dataService de kullanır); ekrandaki katman Common/BildirimKatmani.tsx.
// "Geri al" ayrı çubuktur (lib/geriAl.ts); bildirimler o çubuk açıkken onun üstüne kayar.
// ============================================================================
import { useSyncExternalStore } from 'react';

export type BildirimTuru = 'basari' | 'hata' | 'bilgi';

export interface BildirimEylemi {
  ad: string;
  calistir: () => unknown;
}

export interface Bildirim {
  no: number;
  tur: BildirimTuru;
  baslik: string;
  ayrinti?: string;
  eylem?: BildirimEylemi;
  sure: number;
  /** aynı yazı yeniden gelince artar; katman süreyi baştan başlatır */
  tazelendi: number;
}

export const BILDIRIM_SURE: Record<BildirimTuru, number> = { basari: 4000, bilgi: 6000, hata: 10_000 };
const EN_COK = 3;

let liste: Bildirim[] = [];
let sayac = 0;
const dinleyiciler = new Set<() => void>();
const duyur = () => dinleyiciler.forEach((d) => d());

export function bildir(b: { tur?: BildirimTuru; baslik: string; ayrinti?: string; eylem?: BildirimEylemi; sure?: number }): number {
  const tur = b.tur || 'basari';
  const baslik = (b.baslik || '').trim();
  if (!baslik) return 0;
  const ayni = liste.find((x) => x.tur === tur && x.baslik === baslik && (x.ayrinti || '') === (b.ayrinti || ''));
  if (ayni) {
    liste = liste.map((x) => (x === ayni ? { ...x, eylem: b.eylem || x.eylem, tazelendi: x.tazelendi + 1 } : x));
    duyur();
    return ayni.no;
  }
  const yeni: Bildirim = { no: ++sayac, tur, baslik, ayrinti: b.ayrinti?.trim() || undefined, eylem: b.eylem, sure: b.sure ?? BILDIRIM_SURE[tur], tazelendi: 0 };
  liste = [...liste, yeni].slice(-EN_COK);
  duyur();
  return yeni.no;
}

export const basariBildir = (baslik: string, ayrinti?: string) => bildir({ tur: 'basari', baslik, ayrinti });
export const hataBildir = (baslik: string, ayrinti?: string, eylem?: BildirimEylemi) => bildir({ tur: 'hata', baslik, ayrinti, eylem });
export const bilgiBildir = (baslik: string, ayrinti?: string) => bildir({ tur: 'bilgi', baslik, ayrinti });

export function bildirimKapat(no: number): void {
  if (!liste.some((x) => x.no === no)) return;
  liste = liste.filter((x) => x.no !== no);
  duyur();
}

/** Eski tek satırlık hata yazısını ("Hata: X (neden). Değişiklikler geri alındı.") başlık + ayrıntıya böler */
export function hataMetniniBol(metin: string): { baslik: string; ayrinti?: string } {
  const m = String(metin || '').replace(/^\s*Hata:\s*/i, '').trim();
  const geri = m.match(/^(.*?)[\s.]*(Değişiklikler|Bu değişiklik|Değişiklik) geri alındı\.?$/s);
  if (geri && geri[1].trim()) return { baslik: geri[1].trim(), ayrinti: 'Ekrandaki değişiklik eski hâline döndü; bir daha deneyin.' };
  const nokta = m.search(/[.!?](\s|$)/);
  if (nokta > 0 && nokta < m.length - 1) return { baslik: m.slice(0, nokta + 1).trim(), ayrinti: m.slice(nokta + 1).trim() || undefined };
  return { baslik: m };
}

function abone(d: () => void) {
  dinleyiciler.add(d);
  return () => {
    dinleyiciler.delete(d);
  };
}
const anlik = () => liste;

export function useBildirimler(): Bildirim[] {
  return useSyncExternalStore(abone, anlik, anlik);
}

/** Aşama 348: ana sayfaların eski { ton, text } bildirimi; artık ortak katmana gider */
export type AkMesaj = { ton: 'ok' | 'hata'; text: string };
export function akMesaj(m: AkMesaj | null): void {
  if (m) bildir({ tur: m.ton === 'hata' ? 'hata' : 'basari', baslik: m.text });
}
