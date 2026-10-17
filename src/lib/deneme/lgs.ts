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
  kazanimCode?: string;
  kazanim?: string; // MEB kazanım metni
  konu?: string; // konu (yapay zekâ ya da öğretmen)
  alt?: string; // alt kazanım (yapay zekâ ya da öğretmen)
}

export type ExamQuestions = Record<string, ExamQuestion[]>;

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
      const idx = booklet === 'B' ? (q.bNo || q.no) - 1 : q.no - 1;
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

export function scoreOf(stats: Record<string, SubjectStat>, subjects: ExamSubject[], s: ScoringSettings = LGS_SCORING): { weighted: number; score: number; totalNet: number } {
  let weighted = 0;
  let totalNet = 0;
  for (const sub of subjects) {
    const st = stats[sub.key];
    if (!st) continue;
    weighted += sub.coef * st.net;
    totalNet += st.net;
  }
  weighted = Math.max(0, weighted);
  const score = Math.min(500, Math.max(0, s.base + weighted * s.perWeighted));
  return { weighted: round2(weighted), score: Math.round(score * 1000) / 1000, totalNet: round2(totalNet) };
}

/** Kitapçık türü boşsa: A ve B anahtarına göre hangisiyle daha çok doğru varsa o seçilir */
export function guessBooklet(raw: Record<string, string>, subjects: ExamSubject[], qs: ExamQuestions): 'A' | 'B' {
  let a = 0;
  let b = 0;
  for (const sub of subjects) {
    const list = qs[sub.key] || [];
    const r = raw[sub.key] || '';
    a += gradeSubject(toAOrder(r, list, 'A'), list).d;
    b += gradeSubject(toAOrder(r, list, 'B'), list).d;
  }
  return b > a ? 'B' : 'A';
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
  let booklet = bookletIn === 'A' || bookletIn === 'B' ? bookletIn : '';
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
  classes: Record<string, { name: string; count: number; avgScore: number; avgNet: Record<string, number>; avgTotalNet: number }>;
  questionRates?: Record<string, number[]>; // ders → her sorunun doğru oranı (0-100)
}

interface RankableResult {
  studentId: string;
  classId: string | null;
  className: string | null;
  score: number | null;
  totalNet: number | null;
  answers: Record<string, string>;
  stats: ResultStats;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Sıralamaları sonuçlara yazar ve kişisel bilgi içermeyen özeti döndürür */
export function rankAndSummarize<T extends RankableResult>(results: T[], subjects: ExamSubject[], qs: ExamQuestions): ExamSummary {
  const byScore = (a: T, b: T) => (b.score ?? 0) - (a.score ?? 0) || (b.totalNet ?? 0) - (a.totalNet ?? 0);
  const all = results.slice().sort(byScore);
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
  const byClass = new Map<string, T[]>();
  for (const r of all) {
    const k = r.classId || '-';
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  }
  const classRanks = new Map<string, Map<string, number>>();
  byClass.forEach((list, k) => classRanks.set(k, rankIn(list)));
  for (const r of results as RankableResult[]) {
    const k = r.classId || '-';
    r.stats = {
      ...r.stats,
      rank: {
        overall: overall.get(r.studentId) || 0,
        overallCount: results.length,
        cls: classRanks.get(k)?.get(r.studentId) || 0,
        clsCount: byClass.get(k)?.length || 0,
      },
    };
  }
  const netAvg = (list: T[]) => {
    const o: Record<string, number> = {};
    for (const s of subjects) o[s.key] = round2(avg(list.map((r) => r.stats.subjects[s.key]?.net ?? 0)));
    return o;
  };
  const classes: ExamSummary['classes'] = {};
  byClass.forEach((list, k) => {
    classes[k] = {
      name: list[0]?.className || 'Sınıfsız',
      count: list.length,
      avgScore: round2(avg(list.map((r) => r.score ?? 0))),
      avgNet: netAvg(list),
      avgTotalNet: round2(avg(list.map((r) => r.totalNet ?? 0))),
    };
  });
  const questionRates: Record<string, number[]> = {};
  for (const s of subjects) {
    const list = qs[s.key] || [];
    questionRates[s.key] = list.map((q, i) => {
      if (!results.length) return 0;
      const ok = results.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length;
      return Math.round((ok / results.length) * 100);
    });
  }
  return {
    count: results.length,
    avgScore: round2(avg(results.map((r) => r.score ?? 0))),
    maxScore: round2(Math.max(0, ...results.map((r) => r.score ?? 0))),
    avgNet: netAvg(results),
    avgTotalNet: round2(avg(results.map((r) => r.totalNet ?? 0))),
    classes,
    questionRates,
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
