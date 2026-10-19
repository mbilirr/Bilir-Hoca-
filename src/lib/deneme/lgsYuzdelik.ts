// ============================================================================
// Aşama 51: LGS puanından geçmiş yılların Türkiye geneli yüzdelik dilim tahmini
//
// MEB, puan → yüzdelik dilim için resmî bir tablo yayımlamıyor. Resmî olan, her yıl
// okulların yerleştirme TABAN PUANI ve o puanın TÜRKİYE GENELİ YÜZDELİK DİLİMİdir.
// Aşağıdaki dayanak noktaları bu okul çiftlerinden (taban puan, yüzdelik) derlendi;
// aradaki puanlar logaritmik ölçekte doğrusal ara değerle bulunur.
//
//  - 2025: MEB 2025 yerleştirme okul taban puanı-yüzdelik çiftleri (İstanbul, Ankara, İzmir
//          okulları ve 2.936 okul kaydından türetilen derleme ile karşılaştırıldı).
//  - 2024: MEB 2024 yerleştirme okul taban puanı-yüzdelik çiftleri. 370 puanın altında
//          güvenilir çift bulunamadı; bu puanların altı için "> %18,53" gösterilir.
//  - 2026: MEB 2026 okul yüzdelikleri henüz yayımlanmadı (bir sonraki tercih kılavuzunda
//          yayımlanır). TAHMİNİDİR: aynı okulların 2026 taban puanı ile 2025 yüzdelik dilimi
//          eşleştirildi (okul tercih sırası yıldan yıla büyük ölçüde korunur). 386 puanın altı
//          için veri yoktur.
//
// Yeni yılın resmî verisi gelince yalnızca LGS_YEARS dizisini güncellemek yeterlidir.
// Bu hesap öğrenci verisini hiçbir yere göndermez; tarayıcıda yapılır.
// ============================================================================

export interface LgsYearCurve {
  year: number;
  /** true: resmî okul verisi yerine tahmin */
  estimate: boolean;
  note: string;
  /** [puan, yüzdelik dilim %] — puana göre azalan sırada */
  points: Array<[number, number]>;
}

export const LGS_YEARS: LgsYearCurve[] = [
  {
    year: 2026,
    estimate: true,
    note: 'Tahmini: 2026 taban puanları ile aynı okulların 2025 yüzdelikleri eşleştirildi (MEB 2026 okul yüzdeliklerini henüz yayımlamadı).',
    points: [
      [500, 0.01],
      [494.89, 0.09],
      [493.36, 0.14],
      [488.25, 0.31],
      [486.28, 0.51],
      [483.87, 0.56],
      [483.44, 0.69],
      [480.1, 0.83],
      [478.9, 0.97],
      [477.82, 1.05],
      [475, 1.2],
      [470, 1.5],
      [466.53, 1.75],
      [462.31, 2.59],
      [459.63, 2.66],
      [456.43, 2.72],
      [454.15, 3.42],
      [450.53, 3.45],
      [446, 4.0],
      [442.58, 4.67],
      [439.48, 4.73],
      [434, 5.4],
      [422, 7.6],
      [417, 8.0],
      [413.4, 8.64],
      [409, 10.3],
      [402.34, 11.26],
      [397.63, 12.23],
      [391, 12.8],
      [387, 13.8],
    ],
  },
  {
    year: 2025,
    estimate: false,
    note: 'MEB 2025 yerleştirme okul taban puanı-yüzdelik verilerinden.',
    points: [
      [500, 0.01],
      [495.35, 0.09],
      [493.96, 0.14],
      [489.02, 0.31],
      [487.9, 0.42],
      [486.22, 0.51],
      [485.28, 0.56],
      [482.44, 0.69],
      [480, 0.88],
      [477.21, 1.05],
      [475.66, 1.22],
      [473.14, 1.39],
      [468.88, 1.75],
      [463.71, 2.25],
      [460, 2.61],
      [456.69, 2.95],
      [452.32, 3.42],
      [450, 3.76],
      [446.73, 4.06],
      [441.16, 4.73],
      [436.56, 5.32],
      [434.13, 5.64],
      [425.41, 6.84],
      [420, 7.67],
      [413.17, 8.64],
      [400, 10.71],
      [390.11, 12.39],
      [380, 14.18],
      [350, 19.73],
      [300, 31.39],
      [250, 47.44],
      [200, 75.04],
    ],
  },
  {
    year: 2024,
    estimate: false,
    note: 'MEB 2024 yerleştirme okul taban puanı-yüzdelik verilerinden.',
    points: [
      [500, 0.01],
      [495.15, 0.04],
      [494.81, 0.05],
      [490.18, 0.12],
      [489.63, 0.2],
      [489.19, 0.24],
      [486.79, 0.38],
      [484.0, 0.47],
      [482.46, 0.61],
      [480.56, 0.72],
      [478.43, 0.89],
      [477.35, 1.03],
      [475.26, 1.17],
      [473.07, 1.3],
      [470.8, 1.62],
      [468.21, 1.88],
      [465.62, 2.16],
      [461.83, 2.68],
      [460.14, 2.9],
      [457.19, 3.25],
      [454.81, 3.51],
      [453.23, 3.87],
      [448.05, 4.7],
      [440.9, 5.87],
      [436.37, 6.38],
      [430.87, 7.26],
      [427.76, 7.84],
      [420.79, 8.93],
      [417.11, 9.6],
      [411.65, 10.75],
      [407.91, 11.31],
      [405.02, 11.93],
      [393.59, 13.99],
      [388.85, 14.9],
      [370.83, 18.53],
    ],
  },
];

export interface LgsPercentile {
  year: number;
  estimate: boolean;
  /** Yüzdelik dilim (%). below=true ise bu değerden daha geride demektir. */
  value: number;
  below: boolean;
  /** Ekranda gösterilecek metin: "%1,5", "%0,01", "> %18,53" (veri aralığının altında) */
  text: string;
}

const fmtPct = (v: number) => {
  const digits = v < 10 ? 2 : 1;
  const s = v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
};

/** Gürültülü çiftleri düzelt: puan azaldıkça yüzdelik asla azalmasın */
function cleaned(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = points
    .filter(([s, p]) => Number.isFinite(s) && Number.isFinite(p) && p > 0)
    .slice()
    .sort((a, b) => b[0] - a[0]);
  let max = 0;
  return sorted.map(([s, p]) => {
    max = Math.max(max, p);
    return [s, max] as [number, number];
  });
}

const CACHE = new Map<number, Array<[number, number]>>();
const curveOf = (c: LgsYearCurve) => {
  if (!CACHE.has(c.year)) CACHE.set(c.year, cleaned(c.points));
  return CACHE.get(c.year)!;
};

/** Bir yılın eğrisinde puanın yüzdelik dilimi (bulunamazsa null) */
export function lgsPercentileFor(score: number | null | undefined, curve: LgsYearCurve): LgsPercentile | null {
  if (score === null || score === undefined || !Number.isFinite(score) || score < 100 || score > 500.001) return null;
  const pts = curveOf(curve);
  if (!pts.length) return null;
  const make = (value: number, below: boolean): LgsPercentile => ({
    year: curve.year,
    estimate: curve.estimate,
    value,
    below,
    text: below ? `> %${fmtPct(value)}` : `%${fmtPct(value)}`,
  });
  if (score >= pts[0][0]) return make(pts[0][1], false);
  const last = pts[pts.length - 1];
  if (score < last[0]) return make(last[1], true);
  for (let i = 0; i < pts.length - 1; i++) {
    const [s1, p1] = pts[i];
    const [s2, p2] = pts[i + 1];
    if (score <= s1 && score >= s2) {
      if (s1 === s2) return make(p2, false);
      const t = (s1 - score) / (s1 - s2);
      // logaritmik ölçekte ara değer: üst dilimlerde (0,01-1) daha gerçekçi sonuç verir
      const v = Math.exp(Math.log(p1) + t * (Math.log(p2) - Math.log(p1)));
      return make(Math.round(v * 100) / 100, false);
    }
  }
  return null;
}

/** Tüm yıllar için (yeni yıldan eskiye) */
export function lgsPercentiles(score: number | null | undefined): LgsPercentile[] {
  return LGS_YEARS.map((c) => lgsPercentileFor(score, c)).filter((x): x is LgsPercentile => x !== null);
}

/** Yalnızca LGS türündeki denemelerde gösterilir */
export function isLgsExam(exam: { examType?: string; grade?: string } | null | undefined): boolean {
  if (!exam) return false;
  const t = (exam.examType || 'LGS').toLocaleUpperCase('tr-TR');
  return t.includes('LGS');
}

export const LGS_PERCENTILE_NOTE =
  'Deneme puanının geçmiş LGS yıllarındaki Türkiye geneli yüzdelik karşılığıdır; tahmini bir göstergedir. ' +
  'MEB puan-yüzdelik tablosu yayımlamadığından okul taban puanı-yüzdelik verilerinden hesaplanır. ' +
  'Deneme zorluğu gerçek sınavdan farklı olabilir.';
