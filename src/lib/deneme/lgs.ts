// ============================================================================
// DENEME ANALİZİ (Aşama 47) — DERSLER, CEVAP ANAHTARI, NET VE LGS PUANI
// Bütün analizler A kitapçığı soru sırasıyla yapılır: B kitapçığı cevapları
// cevap anahtarındaki "B karşılığı" ile A sırasına çevrilir.
// ============================================================================

export interface ExamSubject {
  key: string; // tr, sos, din, ing, mat, fen
  name: string;
  short: string;
  count: number; // soru sayısı
  coef: number; // LGS katsayısı
  session: 'sozel' | 'sayisal';
}

export interface ExamQuestion {
  no: number; // A kitapçığındaki soru numarası
  answer: string; // A, B, C, D (X = iptal: herkes doğru sayılır)
  bNo?: number | null; // B kitapçığındaki karşılığı
  cNo?: number | null; // Aşama 336: C kitapçığındaki karşılığı (4 kitapçıklı denemeler)
  dNo?: number | null; // Aşama 336: D kitapçığındaki karşılığı
  kazanimCode?: string;
  kazanim?: string; // MEB kazanım metni
  konu?: string; // konu (yapay zekâ ya da öğretmen)
  alt?: string; // alt kazanım (yapay zekâ ya da öğretmen)
  kazanimCode2?: string; // Aşama 48: ikincil kazanım (yalnızca bilgi; analizde birincil kullanılır)
  kazanim2?: string;
  ai?: string; // Aşama 48: kazanımı yapay zekâ önerdiyse sağlayıcının adı (gemini / mistral)
  srcCode?: string; // Aşama 48d: yayınevi Excel'indeki kazanım kodu (yalnızca bankayla eşleştirmek için; analizde kullanılmaz)
  srcText?: string; // Aşama 48d: yayınevi Excel'indeki kazanım/konu metni (yalnızca eşleştirme için)
  konuCode?: string; // Aşama 128: bankadaki konu kodu (F.8.1.1). Kazanım seçilmeyip yalnız konu atanan sorularda da dolu
}

export type ExamQuestions = Record<string, ExamQuestion[]>;

// ----------------------------------------------------------------------------- Aşama 336: A-B-C-D kitapçık
// Sorular A sırasıyla tutulur; her ek kitapçık için A sorusunun o kitapçıktaki numarası saklanır
// (B: bNo, C: cNo, D: dNo). Numara yoksa o kitapçık A ile aynı sıradadır.
export type Kitapcik = 'A' | 'B' | 'C' | 'D';
export type EkKitapcik = 'B' | 'C' | 'D';
export const EK_KITAPCIKLAR: EkKitapcik[] = ['B', 'C', 'D'];
export const NO_ALANI = { B: 'bNo', C: 'cNo', D: 'dNo' } as const;

/** Geçerli kitapçık harfi (A-D) ya da '' */
export const kitapcikHarfi = (v: string | null | undefined): Kitapcik | '' => {
  const k = (v || '').trim().toUpperCase();
  return k === 'A' || k === 'B' || k === 'C' || k === 'D' ? k : '';
};

/** A sorusunun verilen kitapçıktaki numarası */
export function kitapNo(q: ExamQuestion, k: string): number {
  if (k === 'B' || k === 'C' || k === 'D') return q[NO_ALANI[k]] || q.no;
  return q.no;
}

/** Denemede C/D eşleşmesi girilmiş mi? (yoksa yalnız A/B) */
export function kitapciklarOf(qs: ExamQuestions): Kitapcik[] {
  const all = Object.values(qs || {}).flat();
  const out: Kitapcik[] = ['A', 'B'];
  if (all.some((q) => q && q.cNo)) out.push('C');
  if (all.some((q) => q && q.dNo)) out.push('D');
  return out;
}

export interface ScoringSettings {
  base: number; // hiç net yokken puan
  perWeighted: number; // ağırlıklı net başına puan
  wrongPerCorrect: number; // kaç yanlış bir doğruyu götürür
}

export interface SubjectStat {
  d: number;
  y: number;
  b: number;
  net: number;
}

export interface ResultStats {
  subjects: Record<string, SubjectStat>;
  weighted: number;
  rank?: { overall: number; overallCount: number; cls: number; clsCount: number };
  missing?: string[]; // girmediği oturumlar (sozel / sayisal)
  bookletGuessed?: boolean;
}

// LGS: Türkçe, Matematik, Fen 20 soru ×4; İnkılap, Din, Yabancı Dil 10 soru ×1 (en çok 270 ağırlıklı net)
export const LGS_SUBJECTS: ExamSubject[] = [
  { key: 'tr', name: 'Türkçe', short: 'TÜR', count: 20, coef: 4, session: 'sozel' },
  { key: 'sos', name: 'T.C. İnkılap Tarihi ve Atatürkçülük', short: 'İNK', count: 10, coef: 1, session: 'sozel' },
  { key: 'din', name: 'Din Kültürü ve Ahlak Bilgisi', short: 'DİN', count: 10, coef: 1, session: 'sozel' },
  { key: 'ing', name: 'Yabancı Dil', short: 'YDL', count: 10, coef: 1, session: 'sozel' },
  { key: 'mat', name: 'Matematik', short: 'MAT', count: 20, coef: 4, session: 'sayisal' },
  { key: 'fen', name: 'Fen Bilimleri', short: 'FEN', count: 20, coef: 4, session: 'sayisal' },
];

// Yaklaşık LGS puanı: 194,75 + ağırlıklı net × 1,1305 (270 ağırlıklı net = 500 puan).
// Gerçek LGS puanı Türkiye geneli ortalamalarla hesaplanır; bu değer tahmindir ve ayarlardan değiştirilebilir.
export const LGS_SCORING: ScoringSettings = { base: 194.752082, perWeighted: 305.247918 / 270, wrongPerCorrect: 3 };

// ----------------------------------------------------------------------------- Aşama 271: sınıf düzeyi (5-6-7-8)
// Bir deneme tek sınıf düzeyine aittir (deneme_exams.grade). Ders anahtarları her sınıfta aynıdır; "sos" 8'de
// T.C. İnkılap Tarihi, 5-7'de Sosyal Bilgiler'dir. Soru sayıları denemeye kaydedilir (exam.subjects), bu yüzden
// kayıtlı her deneme kendi ders listesiyle okunur; aşağıdaki listeler yalnız YENİ deneme için başlangıçtır.
export const DENEME_SINIFLARI = ['5', '6', '7', '8'] as const;

/** "8", "8. sınıf", 8 → "8"; sayı değilse olduğu gibi (ör. "Mezun") */
export const sinifNo = (g: unknown): string => {
  const t = String(g ?? '').trim();
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? t : String(n);
};

/** LGS'ye (8. sınıf) ait deneme mi? Sınıf boşsa eski kayıt sayılır (8) */
export const isLgsGrade = (g: unknown) => {
  const s = sinifNo(g);
  return !s || s === '8';
};

/** Yeni denemenin başlangıç dersleri: 8 = LGS; 5-6 = Türkçe/Mat/Fen 15 soru; 7 = 20 soru; diğerleri 10 soru */
export function subjectsForGrade(grade: unknown): ExamSubject[] {
  if (isLgsGrade(grade)) return LGS_SUBJECTS.map((s) => ({ ...s }));
  const big = sinifNo(grade) === '7' ? 20 : 15;
  return LGS_SUBJECTS.map((s) =>
    s.key === 'sos' ? { ...s, name: 'Sosyal Bilgiler', short: 'SOS' } : s.coef === 4 ? { ...s, count: big } : { ...s }
  );
}

/** Ders listesindeki en yüksek ağırlıklı net (LGS: 270) */
export const maxWeighted = (subjects: ExamSubject[]) => subjects.reduce((a, s) => a + s.coef * s.count, 0);

/**
 * Aşama 271: 5-6-7 puanı. MEB'in bu sınıflar için resmî puanı yoktur; yayınevleri LGS yöntemini kullanır
 * (Türkçe, Matematik, Fen ×4; diğerleri ×1; 3 yanlış 1 doğruyu götürür; tavan 500). Aynı taban (194,75) ile
 * ağırlıklı net başına puan, denemenin en yüksek ağırlıklı netine göre ölçeklenir: tam net her sınıfta 500.
 * 8. sınıfta (270 ağırlıklı net) sonuç LGS_SCORING ile birebir aynıdır.
 */
export function scoringFor(subjects: ExamSubject[], wrongPerCorrect = LGS_SCORING.wrongPerCorrect): ScoringSettings {
  const max = maxWeighted(subjects);
  if (max === 270 && wrongPerCorrect === LGS_SCORING.wrongPerCorrect) return { ...LGS_SCORING };
  return { base: LGS_SCORING.base, perWeighted: max > 0 ? (500 - LGS_SCORING.base) / max : LGS_SCORING.perWeighted, wrongPerCorrect };
}

/** Denemenin kayıtlı puan ayarı (eski kayıtlarda LGS) */
export const examScoring = (exam: { scoring?: Partial<ScoringSettings> | null } | null | undefined): ScoringSettings =>
  exam?.scoring && typeof exam.scoring.base === 'number' && typeof exam.scoring.perWeighted === 'number'
    ? { base: exam.scoring.base, perWeighted: exam.scoring.perWeighted, wrongPerCorrect: typeof exam.scoring.wrongPerCorrect === 'number' ? exam.scoring.wrongPerCorrect : 3 }
    : LGS_SCORING;

/**
 * Denemelerde gerçekten bulunan dersler: sıra LGS sırası, ad ve soru sayısı denemenin kendi kaydından
 * (sonraki deneme önceliklidir). 8'de LGS_SUBJECTS ile aynı sonucu verir; 5-7'de "Sosyal Bilgiler" ve 15 soru gelir.
 */
export function subjectsOfExams(exams: Array<{ subjects?: ExamSubject[] | null; examDate?: string }>): ExamSubject[] {
  const byKey = new Map<string, ExamSubject>();
  const sorted = exams.slice().sort((a, b) => String(a.examDate || '').localeCompare(String(b.examDate || '')));
  for (const e of sorted) for (const s of e.subjects || []) if (s && s.key) byKey.set(s.key, s);
  const order = LGS_SUBJECTS.map((s) => s.key);
  return Array.from(byKey.values()).sort((a, b) => (order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99));
}

/** Puanın adı: 8'de "LGS puanı", 5-7'de "Puan" */
export const puanAdi = (grade: unknown) => (isLgsGrade(grade) ? 'LGS puanı' : 'Puan');

/** Karnelerdeki puan açıklaması */
export function puanNotu(exam: { grade?: string; scoring?: Partial<ScoringSettings> | null } | null | undefined): string {
  const w = examScoring(exam).wrongPerCorrect;
  const ceza = w > 0 ? `${w} yanlış 1 doğruyu götürür` : 'yanlış doğruyu götürmez';
  if (isLgsGrade(exam?.grade)) return `Puanlar yaklaşık LGS puanıdır (${ceza}; ağırlıklı net × 1,13 + 194,75).`;
  return `Puan LGS yöntemiyle hesaplanır (${ceza}; Türkçe, Matematik ve Fen ×4, diğer dersler ×1; bütün sorular doğruysa 500). MEB'in bu sınıf için resmî puanı yoktur.`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmtNet = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '-' : (Math.round(n * 100) / 100).toLocaleString('tr-TR'));
export const fmtScore = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ders listesinde olmayan soru dizilerini temizler, eksik soruları boş anahtarla tamamlar */
export function normalizeQuestions(subjects: ExamSubject[], qs: ExamQuestions): ExamQuestions {
  const out: ExamQuestions = {};
  for (const s of subjects) {
    const list = (qs[s.key] || []).slice().sort((a, b) => a.no - b.no);
    const arr: ExamQuestion[] = [];
    for (let i = 1; i <= s.count; i++) {
      const q = list.find((x) => x.no === i);
      arr.push(q ? { ...q, answer: (q.answer || '').toUpperCase().slice(0, 1) } : { no: i, answer: '' });
    }
    out[s.key] = arr;
  }
  return out;
}

/** Kitapçık sırasındaki cevapları A sırasına çevirir */
export function toAOrder(raw: string, qs: ExamQuestion[], booklet: string): string {
  return qs
    .map((q) => {
      const idx = kitapNo(q, booklet) - 1;
      const ch = raw[idx];
      return ch && ch !== ' ' ? ch : ' ';
    })
    .join('');
}

/** Tek bir sorunun sonucu: D (doğru), Y (yanlış), B (boş) */
export function markOf(given: string | undefined, q: ExamQuestion): 'D' | 'Y' | 'B' {
  const key = (q.answer || '').toUpperCase();
  if (key === 'X') return 'D'; // iptal edilen soru herkes için doğru
  if (!given || given === ' ') return 'B';
  if (given === '*') return 'Y'; // birden fazla işaretleme yanlış sayılır
  if (!key) return 'B'; // anahtarı girilmemiş soru değerlendirmeye girmez
  return given === key ? 'D' : 'Y';
}

export function gradeSubject(aOrder: string, qs: ExamQuestion[], s: ScoringSettings = LGS_SCORING): SubjectStat {
  let d = 0;
  let y = 0;
  let b = 0;
  qs.forEach((q, i) => {
    const m = markOf(aOrder[i], q);
    if (m === 'D') d++;
    else if (m === 'Y') y++;
    else b++;
  });
  const net = round2(d - (s.wrongPerCorrect > 0 ? y / s.wrongPerCorrect : 0));
  return { d, y, b, net };
}

/** Aşama 289: dersin yuvarlanmamış neti (doğru/yanlış sayısından); sayılar yoksa kayıtlı net */
const hamNet = (st: SubjectStat, s: ScoringSettings) =>
  typeof st.d === 'number' && typeof st.y === 'number' ? st.d - (s.wrongPerCorrect > 0 ? st.y / s.wrongPerCorrect : 0) : st.net;

// Aşama 289: puan, 2 haneye yuvarlanmış ders netlerinden değil gerçek netten hesaplanır (1 yanlışta 9,67 değil
// 9,6667); yayınevi karnesiyle ikinci ondalıkta fark kalmaz. Gösterilen ders neti yine 2 hanedir.
export function scoreOf(stats: Record<string, SubjectStat>, subjects: ExamSubject[], s: ScoringSettings = LGS_SCORING): { weighted: number; score: number; totalNet: number } {
  let weighted = 0;
  let totalNet = 0;
  for (const sub of subjects) {
    const st = stats[sub.key];
    if (!st) continue;
    const net = hamNet(st, s);
    weighted += sub.coef * net;
    totalNet += net;
  }
  weighted = Math.max(0, weighted);
  const score = Math.min(500, Math.max(0, s.base + weighted * s.perWeighted));
  return { weighted: round2(weighted), score: Math.round(score * 1000) / 1000, totalNet: round2(totalNet) };
}

/** Kitapçık türü boşsa: denemenin kitapçıklarından hangisinin anahtarıyla en çok doğru varsa o seçilir (eşitlikte A) */
export function guessBooklet(raw: Record<string, string>, subjects: ExamSubject[], qs: ExamQuestions): Kitapcik {
  let best: Kitapcik = 'A';
  let bestD = -1;
  for (const k of kitapciklarOf(qs)) {
    let d = 0;
    for (const sub of subjects) {
      const list = qs[sub.key] || [];
      d += gradeSubject(toAOrder(raw[sub.key] || '', list, k), list).d;
    }
    if (d > bestD) [best, bestD] = [k, d];
  }
  return best;
}

export interface ComputedResult {
  booklet: string;
  answers: Record<string, string>; // A sırasında
  stats: ResultStats;
  totalNet: number;
  score: number;
}

/** Bir öğrencinin optik cevaplarından (kitapçık sırasında) sonucu hesaplar */
export function computeResult(
  raw: Record<string, string>,
  bookletIn: string,
  subjects: ExamSubject[],
  qs: ExamQuestions,
  s: ScoringSettings = LGS_SCORING
): ComputedResult {
  let booklet: string = kitapcikHarfi(bookletIn);
  let bookletGuessed = false;
  if (!booklet) {
    booklet = guessBooklet(raw, subjects, qs);
    bookletGuessed = true;
  }
  const answers: Record<string, string> = {};
  for (const sub of subjects) answers[sub.key] = toAOrder(raw[sub.key] || '', qs[sub.key] || [], booklet);
  return recomputeFromAnswers(answers, booklet, subjects, qs, s, bookletGuessed);
}

/** Kayıtlı (A sırasındaki) cevaplardan yeniden hesaplar (cevap anahtarı düzeltilince) */
export function recomputeFromAnswers(
  answers: Record<string, string>,
  booklet: string,
  subjects: ExamSubject[],
  qs: ExamQuestions,
  s: ScoringSettings = LGS_SCORING,
  bookletGuessed = false
): ComputedResult {
  const subjStats: Record<string, SubjectStat> = {};
  const sessionAnswered: Record<string, boolean> = {};
  for (const sub of subjects) {
    const a = answers[sub.key] || '';
    subjStats[sub.key] = gradeSubject(a, qs[sub.key] || [], s);
    if (/[A-E*]/.test(a)) sessionAnswered[sub.session] = true;
  }
  const missing = Array.from(new Set(subjects.map((x) => x.session))).filter((ss) => !sessionAnswered[ss]);
  const sc = scoreOf(subjStats, subjects, s);
  const stats: ResultStats = { subjects: subjStats, weighted: sc.weighted };
  if (missing.length) stats.missing = missing;
  if (bookletGuessed) stats.bookletGuessed = true;
  return { booklet, answers, stats, totalNet: sc.totalNet, score: sc.score };
}

// ----------------------------------------------------------------------------- Özet ve sıralama
export interface ExamSummary {
  count: number;
  avgScore: number;
  maxScore: number;
  avgNet: Record<string, number>;
  avgTotalNet: number;
  classes: Record<string, { name: string; count: number; avgScore: number; avgNet: Record<string, number>; avgTotalNet: number; tam?: number }>;
  questionRates?: Record<string, number[]>; // ders → her sorunun doğru oranı (0-100)
  tam?: number; // Aşama 289: bütün oturumlara giren öğrenci sayısı (sıralama ve puan ortalaması bunlar üzerinden)
  surum?: number; // Aşama 289: özetin hesap kuralı (2 = eksik oturum hesap dışı)
}

/** Aşama 289: özet ve sıralamanın hesap kuralı; eski kayıtlar (surum yok) "Yeniden hesapla" ile güncellenir */
export const OZET_SURUM = 2;

interface RankableResult {
  studentId: string;
  classId: string | null;
  className: string | null;
  score: number | null;
  totalNet: number | null;
  answers: Record<string, string>;
  stats: ResultStats;
}

type OturumBilgisi = { stats?: { missing?: string[] } | null };

/**
 * Aşama 289: öğrenci bu dersin oturumuna girdi mi? Girmediği oturumun dersleri o öğrenci için HESAP DIŞIDIR:
 * ders ortalamasına 0 net olarak girmez, soru doğru oranının paydasında sayılmaz, kazanım analizinde "boş" olmaz.
 */
export const oturumaGirdi = (r: OturumBilgisi, sub: { session: string }) => !r.stats?.missing?.includes(sub.session);

/**
 * Aşama 289: bütün oturumlara girdi mi? Eksik oturumlu öğrencinin puanı yarım sınavın puanıdır; sıralamaya ve
 * puan / toplam net ortalamasına girmez (yayınevlerinin uygulaması). Kendi karnesinde puanı yine görünür.
 */
export const tamOturum = (r: OturumBilgisi) => !r.stats?.missing?.length;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sayilar = (xs: Array<number | null | undefined>) => xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

/** Sıralamaları sonuçlara yazar ve kişisel bilgi içermeyen özeti döndürür */
export function rankAndSummarize<T extends RankableResult>(results: T[], subjects: ExamSubject[], qs: ExamQuestions): ExamSummary {
  const byScore = (a: T, b: T) => (b.score ?? 0) - (a.score ?? 0) || (b.totalNet ?? 0) - (a.totalNet ?? 0);
  // Aşama 289: sıralama yalnız bütün oturumlara giren ve puanı olan öğrenciler arasında yapılır
  const siralanir = (r: T) => tamOturum(r) && typeof r.score === 'number' && Number.isFinite(r.score);
  const all = results.filter(siralanir).sort(byScore);
  const rankIn = (list: T[]) => {
    const ranks = new Map<string, number>();
    let prev: number | null = null;
    let rank = 0;
    list.forEach((r, i) => {
      const s = r.score ?? 0;
      if (prev === null || s !== prev) rank = i + 1;
      prev = s;
      ranks.set(r.studentId, rank);
    });
    return ranks;
  };
  const overall = rankIn(all);
  const byClass = new Map<string, T[]>(); // sınıftaki bütün öğrenciler (katılım)
  const byClassTam = new Map<string, T[]>(); // sıralamaya girenler (puana göre dizili)
  for (const r of results) {
    const k = r.classId || '-';
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  }
  for (const r of all) {
    const k = r.classId || '-';
    if (!byClassTam.has(k)) byClassTam.set(k, []);
    byClassTam.get(k)!.push(r);
  }
  const classRanks = new Map<string, Map<string, number>>();
  byClassTam.forEach((list, k) => classRanks.set(k, rankIn(list)));
  for (const r of results as RankableResult[]) {
    const k = r.classId || '-';
    const { rank: _eski, ...rest } = r.stats;
    void _eski;
    const o = overall.get(r.studentId);
    r.stats = o
      ? { ...rest, rank: { overall: o, overallCount: all.length, cls: classRanks.get(k)?.get(r.studentId) || 0, clsCount: byClassTam.get(k)?.length || 0 } }
      : rest; // sıralama dışı: sıra yazılmaz (ekran ve karneler "—" gösterir)
  }
  // Ders ortalaması: yalnız o dersin oturumuna girenler
  const netAvg = (list: T[]) => {
    const o: Record<string, number> = {};
    for (const s of subjects) o[s.key] = round2(avg(sayilar(list.filter((r) => oturumaGirdi(r, s)).map((r) => r.stats.subjects[s.key]?.net))));
    return o;
  };
  const puanOrt = (list: T[]) => round2(avg(sayilar(list.filter(tamOturum).map((r) => r.score))));
  const netOrt = (list: T[]) => round2(avg(sayilar(list.filter(tamOturum).map((r) => r.totalNet))));
  const classes: ExamSummary['classes'] = {};
  byClass.forEach((list, k) => {
    classes[k] = {
      name: list[0]?.className || 'Sınıfsız',
      count: list.length,
      avgScore: puanOrt(list),
      avgNet: netAvg(list),
      avgTotalNet: netOrt(list),
      tam: list.filter(tamOturum).length,
    };
  });
  const questionRates: Record<string, number[]> = {};
  for (const s of subjects) {
    const list = qs[s.key] || [];
    const girenler = results.filter((r) => oturumaGirdi(r, s));
    questionRates[s.key] = list.map((q, i) => {
      if (!girenler.length) return 0;
      const ok = girenler.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length;
      return Math.round((ok / girenler.length) * 100);
    });
  }
  return {
    count: results.length,
    avgScore: puanOrt(results),
    maxScore: round2(Math.max(0, ...sayilar(all.map((r) => r.score)))),
    avgNet: netAvg(results),
    avgTotalNet: netOrt(results),
    classes,
    questionRates,
    tam: results.filter(tamOturum).length,
    surum: OZET_SURUM,
  };
}

/** Elle yazılan cevap anahtarı ("CDCDCCAB…") → soru listesi (B karşılığı seçilen kurala göre) */
export function questionsFromKeyString(key: string, count: number, bRule: 'reverse' | 'same', prev: ExamQuestion[] = []): ExamQuestion[] {
  const clean = (key || '').toUpperCase().replace(/[^A-EX]/g, '');
  const out: ExamQuestion[] = [];
  for (let i = 1; i <= count; i++) {
    const old = prev.find((q) => q.no === i);
    out.push({ ...(old || {}), no: i, answer: clean[i - 1] || '', bNo: bRule === 'reverse' ? count + 1 - i : i });
  }
  return out;
}
