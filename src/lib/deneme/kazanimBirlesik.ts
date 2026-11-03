// ============================================================================
// Aşama 141: BİRLEŞİK KONU VE KAZANIM ANALİZİ (veri)
// Birleştirilmiş karnedeki iki "Konu ve kazanım analizi" bölümü tek bölümde: her kazanımda bu denemenin
// sonucu (soru kutuları, başarı, kurum çizgisi) ile seçilen denemelerin toplamı yan yana. Ekran ve PDF aynı veriyi kullanır.
// ============================================================================
import { levelOf, type Level, type SubjectTopics } from './analiz';
import type { KarneData } from './karneOrtalama';
import { KISA_AD, dersRengi } from './tekSayfaKarne';

type RGB = [number, number, number];
export interface BirlesikSatir {
  konu: string;
  /** alt kazanımlar (seçilen denemelerin toplamıyla) */
  altlar: Array<{ ad: string; rate: number }>;
  /** bu denemenin sonucu (ortalama karnede ya da denemeye girmediği kazanımda yok) */
  bu: { sorular: Array<{ no: number; mark: 'D' | 'Y' | 'B' }>; d: number; y: number; b: number; rate: number } | null;
  /** kurumda doğru yapanların oranı (çizgi) */
  kurumRate: number | null;
  /** seçilen denemelerin toplamı (tek denemede ve bu denemeyle aynıysa yok) */
  toplam: { soru: number; d: number; y: number; b: number; rate: number } | null;
  /** durum: toplam varsa ona, yoksa bu denemeye göre */
  durum: Level;
  oran: number;
}
export interface BirlesikDers {
  key: string;
  ad: string;
  renk: RGB;
  bu: { d: number; y: number; b: number; net: number; rate: number } | null;
  toplamRate: number | null;
  sayilar: Record<Level, number>;
  satirlar: BirlesikSatir[];
}

const keyOf = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const BELIRSIZ = keyOf('Konusu belirtilmemiş');

/**
 * detail: ön karnenin verisi (tek deneme ya da ortalama; yoksa null) · analysis: seçilen denemelerin konu ağacı
 * denemeSayisi: kapsamdaki (öğrencinin girdiği) deneme sayısı
 */
export function birlesikKazanim(detail: KarneData | null, analysis: SubjectTopics[], denemeSayisi: number): BirlesikDers[] {
  const ortalama = !!detail?.avg;
  const tekDeneme = !!detail && !ortalama;
  // ikinci çubuk yalnız birden çok denemede (ya da bu deneme verisi yoksa) anlamlıdır
  const toplamGoster = denemeSayisi >= 2 || !tekDeneme;
  const keys: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => !seen.has(k) && (seen.add(k), keys.push(k));
  analysis.forEach((a) => add(a.subject.key));
  detail?.subjects.forEach((s) => add(s.subject.key));
  const out: BirlesikDers[] = [];
  keys.forEach((key, i) => {
    const st = analysis.find((a) => a.subject.key === key) || null;
    const sr = detail?.subjects.find((s) => s.subject.key === key) || null;
    const subject = st?.subject || sr!.subject;
    const rows = new Map<string, BirlesikSatir>();
    const marks = new Map<number, 'D' | 'Y' | 'B'>();
    if (tekDeneme && sr) for (const a of sr.answers) marks.set(a.no, a.mark);
    if (detail)
      for (const t of detail.topics) {
        if (t.subject.key !== key) continue;
        rows.set(keyOf(t.konu), {
          konu: t.konu,
          altlar: [],
          bu: tekDeneme ? { sorular: t.questions.map((no) => ({ no, mark: marks.get(no) || 'B' })), d: t.d, y: t.y, b: t.b, rate: t.rate } : null,
          kurumRate: t.kurumRate,
          toplam: null,
          durum: levelOf(t.rate),
          oran: t.rate,
        });
      }
    if (st && toplamGoster)
      for (const n of st.topics) {
        const k = keyOf(n.label);
        const toplam = { soru: n.questions, d: n.d, y: n.y, b: n.b, rate: n.rate };
        const altlar = n.children.map((c) => ({ ad: c.label, rate: c.rate }));
        const r = rows.get(k);
        if (r) {
          r.toplam = toplam;
          r.altlar = altlar;
        } else rows.set(k, { konu: n.label, altlar, bu: null, kurumRate: null, toplam, durum: levelOf(n.rate), oran: n.rate });
      }
    const satirlar = Array.from(rows.entries())
      .map(([k, r]) => {
        const oran = r.toplam ? r.toplam.rate : r.bu ? r.bu.rate : r.oran;
        return { k, r: { ...r, oran, durum: levelOf(oran) } };
      })
      .sort((a, b) => Number(a.k === BELIRSIZ) - Number(b.k === BELIRSIZ) || a.r.oran - b.r.oran)
      .map((x) => x.r);
    if (!satirlar.length) return;
    const sayilar: Record<Level, number> = { iyi: 0, tekrar: 0, etut: 0, kritik: 0 };
    satirlar.forEach((r) => sayilar[r.durum]++);
    out.push({
      key,
      ad: KISA_AD[key] || subject.name,
      renk: dersRengi(key, i),
      bu: sr && !ortalama ? { d: sr.d, y: sr.y, b: sr.b, net: sr.net, rate: sr.rate } : null,
      toplamRate: st && toplamGoster ? st.rate : null,
      sayilar,
      satirlar,
    });
  });
  return out;
}
