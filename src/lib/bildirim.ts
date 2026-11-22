// ============================================================================
// Aşama 348: TEK BİLDİRİM. "Kaydedildi", hata ve bilgi yazıları her sayfada aynı yerde ve aynı biçimde çıkar:
//   - masaüstünde sağ altta, telefonda alt menünün üstünde; en çok 3 bildirim üst üste, en yenisi altta
//   - başarı 4 sn, bilgi 6 sn, hata 10 sn görünür; fare üstündeyken ya da klavyeyle odaktayken süre durur
//   - isteğe bağlı tek eylem düğmesi ("Tekrar dene", "Aç" …); hata bildiriminde ne yapılacağı ayrıntı satırında yazar
//   - aynı yazı açıkken yeniden gelirse ikinci kez çıkmaz, süresi baştan başlar
// React'e bağlı değildir (dataService de kullanır); ekrandaki katman Common/BildirimKatmani.tsx.
// "Geri al" ayrı çubuktur (lib/geriAl.ts); bildirimler o çubuk açıkken onun üstüne kayar.
// ============================================================================
import { useCallback, useRef, useSyncExternalStore } from 'react';

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
  const ayrinti = b.ayrinti?.trim() || undefined;
  // Aşama 353: uzun yazı okunacak kadar kalır (saniyede ~15 harf), en çok 15 sn; fare üstündeyken zaten durur
  const okuma = Math.min(15_000, (baslik.length + (ayrinti?.length || 0)) * 70);
  const yeni: Bildirim = { no: ++sayac, tur, baslik, ayrinti, eylem: b.eylem, sure: b.sure ?? Math.max(BILDIRIM_SURE[tur], okuma), tazelendi: 0 };
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

// ============================================================================
// Aşama 353: SAYFA İÇİ GEÇİCİ YAZILAR DA ORTAK BİLDİRİMDE.
// Eskiden her sayfa kendi "Kaydedildi" / "E-posta gönderildi" şeridini tutuyordu (useState + 15 sn sonra silme).
// Artık o sayfalar useBildirimKanali() kullanır: verilen yazı ortak katmanda çıkar.
//   - tek yuva: aynı kanaldan yeni yazı gelince eskisi kapanır (eski şerit gibi üst üste binmez)
//   - null / '' verilirse o kanalın açık bildirimi kapanır
//   - eski biçimlerin hepsi tanınır: 'yazı', { tone|type|ton|tip, text|yazi|t|lines }, { ok }, { err }
// Formdaki alan hataları ("Ad zorunlu") bu kanala GİTMEZ; kutunun yanında kalır.
// ============================================================================
export type EskiBildirim =
  | string
  | null
  | undefined
  | false
  | {
      tone?: string;
      type?: string;
      ton?: string;
      tip?: string;
      ok?: boolean;
      err?: boolean;
      text?: string;
      yazi?: string;
      t?: string;
      lines?: string[];
      ayrinti?: string;
    };

const HATA_TONU = /^(err|error|hata|danger|bad|fail)/i;
const BILGI_TONU = /^(warn|warning|info|bilgi|uyari)/i;
const HATA_YAZISI = /^\s*(hata\b|⚠|❌)|(lamadı|lemedi|namadı|nemedi|yamadı|yemedi|başarısız)/i;
const SURUYOR = /(…|\.\.\.)\s*$/;

/** Uzun yazı (70 harften uzun, birden çok cümle): ilk cümle başlık, kalanı ayrıntı satırı */
function uzunuBol(yazi: string): { baslik: string; ayrinti?: string } {
  if (yazi.length <= 70) return { baslik: yazi };
  const m = yazi.match(/^(.{8,}?[.!?])\s+(\S[\s\S]*)$/);
  return m ? { baslik: m[1].trim(), ayrinti: m[2].trim() } : { baslik: yazi };
}

/** Eski geçici yazıyı ortak bildirim biçimine çevirir; boşsa null */
export function eskiBildirimCevir(m: EskiBildirim): { tur: BildirimTuru; baslik: string; ayrinti?: string } | null {
  if (!m) return null;
  if (typeof m === 'string') {
    const yazi = m.trim();
    if (!yazi) return null;
    if (HATA_YAZISI.test(yazi)) return { tur: 'hata', ...hataMetniniBol(yazi) };
    return { tur: SURUYOR.test(yazi) ? 'bilgi' : 'basari', ...uzunuBol(yazi) };
  }
  const satirlar = (m.lines || []).map((x) => String(x || '').trim()).filter(Boolean);
  const yazi = String(m.text ?? m.yazi ?? m.t ?? satirlar[0] ?? '').trim();
  if (!yazi) return null;
  const ayrinti = (m.ayrinti || (m.text || m.yazi || m.t ? satirlar : satirlar.slice(1)).join(' · ')).trim() || undefined;
  const ton = String(m.tone ?? m.type ?? m.ton ?? m.tip ?? '');
  const tur: BildirimTuru =
    m.err === true || m.ok === false || HATA_TONU.test(ton)
      ? 'hata'
      : BILGI_TONU.test(ton) || (!ton && m.ok === undefined && SURUYOR.test(yazi))
        ? 'bilgi'
        : 'basari';
  if (tur === 'hata' && !ayrinti) return { tur, ...hataMetniniBol(yazi) };
  if (!ayrinti) return { tur, ...uzunuBol(yazi) };
  return { tur, baslik: yazi, ayrinti };
}

/**
 * Aşama 353: tek yuvalı bildirim kanalı. Eski `const [notice, setNotice] = useState(null)` yerine
 * `const setNotice = useBildirimKanali();` yazılır; çağrılar aynı kalır.
 */
export function useBildirimKanali(): (m: EskiBildirim, eylem?: BildirimEylemi) => void {
  const son = useRef(0);
  return useCallback((m: EskiBildirim, eylem?: BildirimEylemi) => {
    const b = eskiBildirimCevir(m);
    if (son.current && (!b || !liste.some((x) => x.no === son.current && x.baslik === b.baslik && x.tur === b.tur))) {
      bildirimKapat(son.current);
      son.current = 0;
    }
    if (b) son.current = bildir({ ...b, eylem });
  }, []);
}
