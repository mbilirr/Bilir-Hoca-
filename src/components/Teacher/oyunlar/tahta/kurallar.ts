// ============================================================================
// Aşama 383: TAHTADA OYNA — kurallar (saf işlevler; tests/tahta.test.ts sınar)
// Öğretmenin kendi ekranında (akıllı tahta / projeksiyon) oynanır; öğrenci bağlantısı ve kayıt yoktur.
//  · Düello: iki takım aynı soruyu aynı anda görür, her takımın kendi şık düğmeleri vardır. İlk doğru cevaplayan
//    puanı alır; yanlış cevaplayan takım o soruda kilitlenir, öbür takım deneyebilir.
//  · Grup: 2-6 grup sırayla cevaplar; sıradaki grubun tek cevabı vardır, istersen pas geçer.
// Puan: doğru = 100 + kalan süreye göre en çok 50 (soru yarışıyla aynı).
// ============================================================================
export type TahtaMod = 'duello' | 'grup';
export const TAHTA_SORU = { en_az: 3, en_cok: 30 };
export const GRUP_SAYISI = { en_az: 2, en_cok: 6 };
export const TAHTA_TABAN = 100;
export const TAHTA_BONUS = 50;

export interface TahtaSoru {
  id: string;
  metin: string;
  siklar: string[];
  dogru: number;
  aciklama: string;
}
export interface Takim {
  ad: string;
  puan: number;
  dogru: number;
}
export interface TahtaCevap {
  takim: number;
  secim: number;
  dogru: boolean;
  kazanilan: number;
}
export interface TahtaDurum {
  mod: TahtaMod;
  sorular: TahtaSoru[];
  takimlar: Takim[];
  /** şimdiki soru */
  i: number;
  /** grup modunda sırası gelen grup */
  sira: number;
  asama: 'soru' | 'sonuc' | 'bitti';
  cevaplar: TahtaCevap[];
}

export function karistir<T>(liste: T[], rnd: () => number = Math.random): T[] {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorular sırası ve şıkları karıştırılarak oyun kurulur */
export function tahtaKur(
  mod: TahtaMod,
  takimAdlari: string[],
  sorular: Array<{ id: string; metin: string; siklar: string[]; dogru: number | null; aciklama?: string }>,
  rnd: () => number = Math.random
): TahtaDurum {
  const hazir = karistir(sorular, rnd)
    .filter((s) => s.siklar.length === 4 && s.dogru !== null)
    .map((s) => {
      const sira = karistir([0, 1, 2, 3], rnd);
      return { id: s.id, metin: s.metin, siklar: sira.map((k) => s.siklar[k]), dogru: sira.indexOf(s.dogru as number), aciklama: s.aciklama || '' };
    });
  return {
    mod,
    sorular: hazir,
    takimlar: takimAdlari.map((ad) => ({ ad, puan: 0, dogru: 0 })),
    i: 0,
    sira: 0,
    asama: hazir.length ? 'soru' : 'bitti',
    cevaplar: [],
  };
}

export const puanHesapla = (gecenMs: number, sureMs: number) => TAHTA_TABAN + Math.floor(TAHTA_BONUS * Math.max(0, 1 - Math.min(Math.max(0, gecenMs), sureMs) / sureMs));

/** Bir takımın cevabı. Geçersizse (sıra değil, zaten cevapladı, soru kapandı) durum aynen döner. */
export function tahtaCevap(d: TahtaDurum, takim: number, secim: number, gecenMs: number, sureMs: number): TahtaDurum {
  if (d.asama !== 'soru' || !d.takimlar[takim] || secim < 0 || secim > 3) return d;
  if (d.mod === 'grup' && takim !== d.sira) return d;
  if (d.cevaplar.some((c) => c.takim === takim)) return d;
  const soru = d.sorular[d.i];
  const dogru = secim === soru.dogru;
  const kazanilan = dogru ? puanHesapla(gecenMs, sureMs) : 0;
  const cevaplar = [...d.cevaplar, { takim, secim, dogru, kazanilan }];
  const takimlar = d.takimlar.map((t, k) => (k === takim ? { ...t, puan: t.puan + kazanilan, dogru: t.dogru + (dogru ? 1 : 0) } : t));
  const bitti = dogru || d.mod === 'grup' || cevaplar.length >= d.takimlar.length;
  return { ...d, cevaplar, takimlar, asama: bitti ? 'sonuc' : 'soru' };
}

/** Süre doldu ya da (grup) pas: soru cevabı gösterilerek kapanır */
export const tahtaKapat = (d: TahtaDurum): TahtaDurum => (d.asama === 'soru' ? { ...d, asama: 'sonuc' } : d);

/** Sıradaki soru (grup modunda sıra bir sonraki gruba geçer) */
export function tahtaSonraki(d: TahtaDurum): TahtaDurum {
  if (d.asama !== 'sonuc') return d;
  const i = d.i + 1;
  return { ...d, i, sira: (d.sira + 1) % d.takimlar.length, cevaplar: [], asama: i >= d.sorular.length ? 'bitti' : 'soru' };
}

/** Puan sırası (eşit puanda doğru sayısı, sonra ad) */
export const siralama = (d: TahtaDurum) =>
  d.takimlar.map((t, k) => ({ ...t, k })).sort((a, b) => b.puan - a.puan || b.dogru - a.dogru || a.ad.localeCompare(b.ad, 'tr'));
