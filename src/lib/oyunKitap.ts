// ============================================================================
// Aşama 407: Oyunlar — kitaptan soru ekleme yardımcıları (saf; ekran ve test ortak kullanır)
// Yapay zekânın verdiği kutular (0-1000, [üst, sol, alt, sağ]) sayfa oranına çevrilir; çakışan kutu elenir;
// cevap anahtarı soru numarasına göre taslaklara uygulanır; kitap ayarları cihazda hatırlanır.
// ============================================================================
import type { KesimKutusu } from './oyunGorsel';

/** Yapay zekâ kutusu (0-1000) → sayfa oranı (0-1); geçersizse null */
export function kutuCevir(k: unknown): KesimKutusu | null {
  if (!Array.isArray(k) || k.length !== 4) return null;
  const [ust, sol, alt, sag] = k.map((v) => Math.max(0, Math.min(1000, Number(v))));
  if (![ust, sol, alt, sag].every(Number.isFinite) || alt - ust < 20 || sag - sol < 20) return null;
  return { x: sol / 1000, y: ust / 1000, w: (sag - sol) / 1000, h: (alt - ust) / 1000 };
}

/** İki kutunun kesişiminin küçük kutuya oranı (0-1) */
export function ortusme(a: KesimKutusu, b: KesimKutusu): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));
}

/** Yeni kutulardan, var olanlarla (ya da birbirleriyle) yarıdan fazla örtüşenleri atar */
export function yeniKutular<T extends { kutu: KesimKutusu }>(var_: KesimKutusu[], gelen: T[]): T[] {
  const kabul: T[] = [];
  for (const g of gelen) {
    if (var_.some((k) => ortusme(k, g.kutu) > 0.5) || kabul.some((k) => ortusme(k.kutu, g.kutu) > 0.5)) continue;
    kabul.push(g);
  }
  return kabul;
}

/** Kutuları okuma sırasına koyar: önce sütun (sol yarı, sağ yarı), sonra yukarıdan aşağı */
export function okumaSirasi<T extends { kutu: KesimKutusu }>(l: T[]): T[] {
  const sutun = (k: KesimKutusu) => (k.x + k.w / 2 < 0.5 ? 0 : 1);
  return [...l].sort((a, b) => sutun(a.kutu) - sutun(b.kutu) || a.kutu.y - b.kutu.y);
}

export const HARFLER = ['A', 'B', 'C', 'D'] as const;

/** Cevap anahtarındaki harf → şık sırası (A-D); E ya da okunamayan → -1 */
export const harfSira = (h: string) => HARFLER.indexOf(String(h || '').trim().toLocaleUpperCase('tr-TR') as (typeof HARFLER)[number]);

/** Anahtarı numarası olan ve doğrusu seçilmemiş taslaklara uygular; uygulanan taslak sayısını ve yeni listeyi döner */
export function anahtarUygula<T extends { no: number | null; dogru: number | null }>(
  taslaklar: T[],
  cevaplar: Array<{ no: number; cevap: string }>
): { liste: T[]; uygulanan: number } {
  const m = new Map<number, number>();
  for (const c of cevaplar) {
    const i = harfSira(c.cevap);
    if (Number.isInteger(c.no) && i >= 0 && !m.has(c.no)) m.set(c.no, i);
  }
  let uygulanan = 0;
  const liste = taslaklar.map((t) => {
    if (t.dogru !== null || t.no === null || !m.has(t.no)) return t;
    uygulanan++;
    return { ...t, dogru: m.get(t.no)! };
  });
  return { liste, uygulanan };
}

/** Yapay zekâ şıkları okuyamazsa (ya da şıklar resimse) A-D harfi kalır */
export function siklarDuzelt(okunan: string[] | undefined): string[] {
  const s = (okunan || []).slice(0, 4).map((x) => String(x || '').trim());
  const ayri = s.length === 4 && s.every(Boolean) && new Set(s.map((x) => x.toLocaleLowerCase('tr-TR'))).size === 4;
  return ayri ? s : [...HARFLER];
}

/** Metin okunamazsa listede tanınsın diye kitap, sayfa ve soru numarası yazılır */
export function yedekMetin(kitap: string, sayfa: number, no: number | null): string {
  const ad = kitap.replace(/\.pdf$/i, '').trim().slice(0, 60) || 'Kitap';
  return `${ad} · sayfa ${sayfa}${no ? ` · ${no}. soru` : ''}`;
}

/** Kayıtlı eklenen kutular → sayfa başına kutu listesi (bozuk kayıt atlanır) */
export function eklenenOku(v: unknown): Map<number, KesimKutusu[]> {
  const m = new Map<number, KesimKutusu[]>();
  if (!v || typeof v !== 'object') return m;
  for (const [k, l] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || !Array.isArray(l)) continue;
    const kutular = l
      .filter((x): x is number[] => Array.isArray(x) && x.length === 4 && x.every((y) => Number.isFinite(y) && y >= 0 && y <= 1))
      .map(([x, y, w, h]) => ({ x, y, w, h }));
    if (kutular.length) m.set(n, kutular);
  }
  return m;
}

/** Sayfa başına kutular → saklanacak biçim (4 basamak) */
export function eklenenYaz(m: Map<number, KesimKutusu[]>): Record<string, number[][]> {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return Object.fromEntries([...m].map(([n, l]) => [String(n), l.map((k) => [r(k.x), r(k.y), r(k.w), r(k.h)])]));
}

// ---------------------------------------------------------------------------- cihazda hatırlama
export interface KitapAyari {
  sayfa: number;
  ders: string;
  sinif: number | null;
  zorluk: string;
  konu: string;
  kod: string | null;
  /** daha önce eklenen soruların kutuları: sayfa → [x, y, w, h] (yinelenen soru eklenmesin) */
  eklenen?: Record<string, number[][]>;
  /** son açılış (en eskiler silinir) */
  t?: number;
}
const ANAHTAR_ON = 'oyunKitap:';
const EN_COK_KITAP = 30;
export const kitapAnahtari = (ad: string, boyut: number) => `${ANAHTAR_ON}${ad}|${boyut}`;

export function kitapOku(anahtar: string): Partial<KitapAyari> | null {
  try {
    const v = JSON.parse(localStorage.getItem(anahtar) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export function kitapYaz(anahtar: string, a: KitapAyari) {
  try {
    localStorage.setItem(anahtar, JSON.stringify({ ...a, t: Date.now() }));
    // en eski kitaplar silinir (cihazda en çok EN_COK_KITAP kitap)
    const hepsi: Array<[string, number]> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ANAHTAR_ON)) hepsi.push([k, Number(kitapOku(k)?.t) || 0]);
    }
    hepsi.sort((a, b) => b[1] - a[1]);
    for (const [k] of hepsi.slice(EN_COK_KITAP)) localStorage.removeItem(k);
  } catch {
    /* gizli pencere: hatırlanmaz */
  }
}
