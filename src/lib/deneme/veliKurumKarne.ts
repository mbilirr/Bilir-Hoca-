// ============================================================================
// DENEME ANALİZİ (Aşama 56) — VELİ KARNESİ, ÖNCELİKLİ KONU KARNESİ, KURUM ÖZETİ
//  * Veli Karnesi: tek sayfa, sade dil; teknik tablo yok.
//  * Öncelikli Konu Karnesi: eksik konular 1. / 2. / 3. öncelik; "bu konu düzelirse yaklaşık +X net".
//  * Kurum Özeti (yönetici): katılım, kurum ortalaması, LGS yüzdelik dağılımı, sınıfların sırası.
// Hesaplar kayıtlı sonuçlardan yapılır; öğrenci verisi dışarı gönderilmez.
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import type { Student } from '../../types';
import { LGS_SCORING, LGS_SUBJECTS, round2, type ExamSubject } from './lgs';
import { LEVEL_INFO, levelOf } from './analiz';
import { isBadKonu } from './kazanimBank';
import { LGS_YEARS, isLgsExam, lgsPercentileFor, lgsPercentiles, type LgsPercentile } from './lgsYuzdelik';
import { NO_TOPIC, kazanimTracking, studySuggestions, type KazRow, type KazSubject } from './kazanimKarne';

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Velinin anlayacağı kazanım adı: konu başlığı ya da kısaltılmış kazanım cümlesi (kod yok) */
export function plainKazanim(r: Pick<KazRow, 'title' | 'text' | 'label'>, max = 80): string {
  const cut = (s: string) => (s.length > max ? `${s.slice(0, max - 1).trim()}…` : s);
  const title = (r.title || '').trim();
  const text = (r.text || '').trim();
  if (title && !(text && isBadKonu(title, text))) return cut(title);
  if (text) return cut(text.replace(/^[A-ZÇĞİÖŞÜ]{1,3}\.\d+(\.\d+)*\.?\s*/u, ''));
  return cut(r.label.replace(/^[A-ZÇĞİÖŞÜ]{1,3}\.\d+(\.\d+)*\.?\s*/u, ''));
}

// ============================================================================ Veli Karnesi
export interface VeliTopic {
  subject: ExamSubject;
  name: string;
  rate: number;
  hint: string;
}

export interface VeliKarneData {
  exams: DenemeExam[]; // öğrencinin girdiği denemeler (sırasıyla)
  lastExam: DenemeExam;
  last: DenemeResult;
  prevScore: number | null;
  change: number | null;
  avgScore: number | null;
  clsAvg: number | null; // son denemede sınıf ortalaması
  kurumAvg: number | null;
  rank: { cls: number; clsCount: number; overall: number; overallCount: number } | null;
  lgs: LgsPercentile | null; // en güncel resmî yıla göre
  lgsAll: LgsPercentile[];
  trend: Array<{ exam: DenemeExam; score: number | null; clsAvg: number | null }>; // son 5 deneme
  strong: VeliTopic[];
  improve: VeliTopic[];
  target: number | null;
  sentence: string; // tek cümlelik özet
}

/** Önce farklı derslerden seçer (velide çeşitlilik), sonra kalanları doldurur */
function pickDiverse<T extends { subject: ExamSubject }>(list: T[], n: number): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  for (const x of list) {
    if (out.length >= n || used.has(x.subject.key)) continue;
    out.push(x);
    used.add(x.subject.key);
  }
  for (const x of list) if (out.length < n && !out.includes(x)) out.push(x);
  return out;
}

export function veliKarneData(examsAll: DenemeExam[], results: DenemeResult[], target: number | null, subjects: ExamSubject[] = LGS_SUBJECTS): VeliKarneData | null {
  const rByExam = new Map<string, DenemeResult>();
  for (const r of results) if (!rByExam.has(r.examId)) rByExam.set(r.examId, r);
  const exams = examsAll.filter((e) => rByExam.has(e.id));
  if (!exams.length) return null;
  const lastExam = exams[exams.length - 1];
  const last = rByExam.get(lastExam.id)!;
  const prev = exams.length > 1 ? rByExam.get(exams[exams.length - 2].id) : undefined;
  const scores = exams.map((e) => rByExam.get(e.id)!.score).filter((v): v is number => typeof v === 'number');
  const clsOf = (e: DenemeExam, r: DenemeResult) => (r.classId ? (e.summary.classes || {})[r.classId]?.avgScore ?? null : null);
  const subs = subjects.filter((s) => exams.some((e) => e.subjects.some((x) => x.key === s.key)));
  const tracking: KazSubject[] = kazanimTracking(exams, results, subs);
  // Güçlü konular: kazanılmış, en az 2 soru sorulmuş, başarısı en yüksek olanlar
  const strongAll: VeliTopic[] = [];
  for (const st of tracking)
    for (const r of st.rows)
      if (r.status === 'kazanildi' && r.questions >= 2 && r.label !== NO_TOPIC)
        strongAll.push({ subject: st.subject, name: plainKazanim(r), rate: r.rate, hint: `${r.questions} soruda ${r.d} doğru` });
  strongAll.sort((a, b) => b.rate - a.rate);
  const sug = studySuggestions(tracking, 8).map((s) => ({
    subject: s.subject,
    name: plainKazanim(s.row),
    rate: s.row.lastRate ?? s.row.rate,
    hint: `Haftada yaklaşık ${s.questions} soru çözmesi önerilir`,
  }));
  const lgsYear = LGS_YEARS.find((c) => !c.estimate);
  const lgs = isLgsExam(lastExam) && lgsYear ? lgsPercentileFor(last.score, lgsYear) : null;
  const change = prev && typeof prev.score === 'number' && typeof last.score === 'number' ? round2(last.score - prev.score) : null;
  const rank = last.stats.rank ? { cls: last.stats.rank.cls, clsCount: last.stats.rank.clsCount, overall: last.stats.rank.overall, overallCount: last.stats.rank.overallCount } : null;
  const parts: string[] = [`Son denemede (${lastExam.name}) ${typeof last.score === 'number' ? `${String(round2(last.score)).replace('.', ',')} puan aldı` : 'sonucu var'}`];
  if (rank) parts.push(`sınıfında ${rank.clsCount} öğrenci arasında ${rank.cls}. oldu`);
  if (change !== null && Math.abs(change) >= 0.5) parts.push(change > 0 ? `bir önceki denemeye göre ${String(Math.abs(change)).replace('.', ',')} puan yükseldi` : `bir önceki denemeye göre ${String(Math.abs(change)).replace('.', ',')} puan düştü`);
  const avg = avgOf(scores);
  return {
    exams,
    lastExam,
    last,
    prevScore: prev && typeof prev.score === 'number' ? prev.score : null,
    change,
    avgScore: avg === null ? null : round2(avg),
    clsAvg: clsOf(lastExam, last),
    kurumAvg: typeof lastExam.summary.avgScore === 'number' ? lastExam.summary.avgScore : null,
    rank,
    lgs,
    lgsAll: isLgsExam(lastExam) ? lgsPercentiles(last.score) : [],
    trend: exams.slice(-5).map((e) => ({ exam: e, score: rByExam.get(e.id)!.score, clsAvg: clsOf(e, rByExam.get(e.id)!) })),
    strong: pickDiverse(strongAll, 3),
    improve: pickDiverse(sug, 3),
    target,
    sentence: `${parts.join(', ')}.`,
  };
}

// ============================================================================ Öncelikli Konu Karnesi
export type PriorityTier = 1 | 2 | 3;
export const TIER_INFO: Record<PriorityTier, { label: string; tone: 'danger' | 'warning' | 'info'; desc: string }> = {
  1: { label: '1. öncelik', tone: 'danger', desc: 'Toplam kaybın ilk yarısını oluşturan konular: önce bunlar' },
  2: { label: '2. öncelik', tone: 'warning', desc: 'Kaybın sonraki %30\'u: 1. öncelikler bitince' },
  3: { label: '3. öncelik', tone: 'info', desc: 'Kalan konular: tekrar haftalarında' },
};

export interface PriorityRow {
  tier: PriorityTier;
  subject: ExamSubject;
  row: KazRow;
  perExamQuestions: number; // deneme başına ortalama soru
  gainNet: number; // konu tamamen düzelirse deneme başına kazanılacak yaklaşık net
  gainPoints: number; // ... yaklaşık puan
  share: number; // toplam kayıptaki payı (%)
}

export interface PriorityKarne {
  rows: PriorityRow[];
  tiers: Record<PriorityTier, { count: number; gainNet: number; gainPoints: number }>;
  totalNet: number;
  totalPoints: number;
  examCount: number;
}

/**
 * Konuların önceliği: deneme başına kaybettirdiği puana göre (Pareto).
 * Sıralı listede toplam kaybın ilk %50'si 1. öncelik, sonraki %30'u 2. öncelik, kalanı 3. öncelik.
 */
export function priorityKarne(examsAll: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS): PriorityKarne {
  const exams = examsAll.filter((e) => results.some((r) => r.examId === e.id));
  const n = exams.length;
  const subs = subjects.filter((s) => exams.some((e) => e.subjects.some((x) => x.key === s.key)));
  const tracking = kazanimTracking(exams, results, subs);
  const cand: Array<Omit<PriorityRow, 'tier' | 'share'>> = [];
  for (const st of tracking)
    for (const r of st.rows) {
      if (r.label === NO_TOPIC || r.status === 'kazanildi' || r.status === 'sorulmadi' || r.lostNet <= 0 || !n) continue;
      cand.push({
        subject: st.subject,
        row: r,
        perExamQuestions: round2(r.questions / n),
        gainNet: round2(r.lostNet / n),
        gainPoints: r.perExamLoss,
      });
    }
  cand.sort((a, b) => b.gainPoints - a.gainPoints || a.row.rate - b.row.rate);
  const total = cand.reduce((a, c) => a + c.gainPoints, 0);
  let acc = 0;
  const rows: PriorityRow[] = cand.map((c) => {
    const before = acc;
    acc += c.gainPoints;
    const startShare = total ? before / total : 1;
    const tier: PriorityTier = startShare < 0.5 ? 1 : startShare < 0.8 ? 2 : 3;
    return { ...c, tier, share: total ? Math.round((c.gainPoints / total) * 1000) / 10 : 0 };
  });
  const tiers = { 1: { count: 0, gainNet: 0, gainPoints: 0 }, 2: { count: 0, gainNet: 0, gainPoints: 0 }, 3: { count: 0, gainNet: 0, gainPoints: 0 } } as PriorityKarne['tiers'];
  for (const r of rows) {
    const t = tiers[r.tier];
    t.count++;
    t.gainNet = round2(t.gainNet + r.gainNet);
    t.gainPoints = round2(t.gainPoints + r.gainPoints);
  }
  return {
    rows,
    tiers,
    totalNet: round2(rows.reduce((a, r) => a + r.gainNet, 0)),
    totalPoints: round2(total),
    examCount: n,
  };
}

/** Önceliğe göre kısa öneri */
export const priorityAdvice = (r: PriorityRow) => LEVEL_INFO[levelOf(r.row.lastRate ?? r.row.rate)].advice;

// ============================================================================ Kurum Özeti
export interface LgsBand {
  label: string;
  max: number; // yüzdelik dilim üst sınırı (dahil)
  rgb: [number, number, number];
}
/** LGS yüzdelik dilim aralıkları (en iyiden) */
export const LGS_BANDS: LgsBand[] = [
  { label: 'İlk %1', max: 1, rgb: [5, 122, 85] },
  { label: '%1 - 5', max: 5, rgb: [16, 185, 129] },
  { label: '%5 - 10', max: 10, rgb: [14, 165, 233] },
  { label: '%10 - 25', max: 25, rgb: [245, 158, 11] },
  { label: '%25 ve sonrası', max: 101, rgb: [225, 29, 72] },
];

export interface KurumExamRow {
  exam: DenemeExam;
  n: number; // sonuç sayısı
  participation: number | null; // % (sonuç / kayıtlı öğrenci)
  avgScore: number | null;
  avgTotalNet: number | null;
  maxScore: number | null;
  avgNet: Record<string, number | null>;
  bands: number[] | null; // LGS dilim dağılımı (LGS türü değilse null)
  topClass: { name: string; avgScore: number } | null;
}

export interface KurumClassRow {
  classId: string;
  name: string;
  students: number; // kayıtlı öğrenci
  participants: number; // seçilen denemelerin en az birine giren
  participation: number | null; // % (girilen deneme / (öğrenci × deneme))
  avgScore: number | null; // girdiği denemelerdeki sınıf ortalamalarının ortalaması
  lastScore: number | null;
  firstScore: number | null;
  change: number | null;
  avgRank: number | null; // denemelerdeki sırasının ortalaması
  rank: number; // genel sıra (ortalama puana göre)
  top1: number; // son denemede ilk %1'deki öğrenci
}

export interface KurumOzet {
  exams: DenemeExam[];
  subjects: ExamSubject[];
  perExam: KurumExamRow[];
  classes: KurumClassRow[];
  lgsYear: number | null;
  summary: {
    students: number; // kayıtlı öğrenci
    participants: number;
    participation: number | null;
    avgScore: number | null;
    lastAvg: number | null;
    change: number | null;
    lastTop1: number | null;
    lastTop10: number | null;
  };
}

export function kurumOzet(examsAll: DenemeExam[], results: DenemeResult[], students: Student[], subjects: ExamSubject[] = LGS_SUBJECTS): KurumOzet | null {
  const exams = examsAll.filter((e) => results.some((r) => r.examId === e.id));
  if (!exams.length) return null;
  const subs = subjects.filter((s) => exams.some((e) => e.subjects.some((x) => x.key === s.key)));
  const lgsCurve = LGS_YEARS.find((c) => !c.estimate) || null;
  const bandOf = (score: number | null) => {
    if (!lgsCurve || score === null) return -1;
    const p = lgsPercentileFor(score, lgsCurve);
    if (!p) return -1;
    if (p.below) return LGS_BANDS.length - 1;
    return LGS_BANDS.findIndex((b) => p.value <= b.max);
  };
  const byExam = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byExam.has(r.examId)) byExam.set(r.examId, []);
    byExam.get(r.examId)!.push(r);
  }
  const active = students.filter((s) => s.status !== 'inactive');
  const regCount = active.length;
  const perExam: KurumExamRow[] = exams.map((e) => {
    const rs = byExam.get(e.id) || [];
    const sc = rs.map((r) => r.score).filter((v): v is number => typeof v === 'number');
    const avgNet: Record<string, number | null> = {};
    for (const s of subs) {
      const v = avgOf(rs.map((r) => r.stats.subjects?.[s.key]?.net).filter((x): x is number => typeof x === 'number'));
      avgNet[s.key] = v === null ? null : round2(v);
    }
    let bands: number[] | null = null;
    if (isLgsExam(e) && lgsCurve) {
      bands = LGS_BANDS.map(() => 0);
      for (const r of rs) {
        const b = bandOf(typeof r.score === 'number' ? r.score : null);
        if (b >= 0) bands[b]++;
      }
    }
    const cls = Object.values(e.summary.classes || {})
      .filter((c) => typeof c?.avgScore === 'number' && (c.count ?? 0) > 0)
      .sort((a, b) => b.avgScore - a.avgScore)[0];
    const avg = avgOf(sc);
    const tn = avgOf(rs.map((r) => r.totalNet).filter((x): x is number => typeof x === 'number'));
    return {
      exam: e,
      n: rs.length,
      participation: regCount ? Math.min(100, Math.round((rs.length / regCount) * 100)) : null,
      avgScore: avg === null ? null : round2(avg),
      avgTotalNet: tn === null ? null : round2(tn),
      maxScore: sc.length ? Math.max(...sc) : null,
      avgNet,
      bands,
      topClass: cls ? { name: cls.name, avgScore: cls.avgScore } : null,
    };
  });

  // Sınıflar
  const clsIds = new Map<string, string>();
  for (const s of active) if (s.classId) clsIds.set(s.classId, s.className || s.classId);
  for (const r of results) if (!clsIds.has(r.classId || '-')) clsIds.set(r.classId || '-', r.className || 'Sınıfsız');
  const lastExam = exams[exams.length - 1];
  const classes: KurumClassRow[] = Array.from(clsIds.entries()).map(([id, name]) => {
    const reg = active.filter((s) => (s.classId || '-') === id).length;
    const rs = results.filter((r) => (r.classId || '-') === id);
    const per = exams.map((e) => {
      const list = rs.filter((r) => r.examId === e.id);
      const sc = list.map((r) => r.score).filter((v): v is number => typeof v === 'number');
      const a = avgOf(sc);
      // denemedeki sıra (deneme özetindeki sınıf ortalamalarına göre)
      const order = Object.entries(e.summary.classes || {})
        .filter(([, c]) => typeof c?.avgScore === 'number' && (c.count ?? 0) > 0)
        .sort((x, y) => y[1].avgScore - x[1].avgScore);
      const idx = order.findIndex(([cid]) => cid === id);
      return { n: list.length, avg: a, rank: idx >= 0 ? idx + 1 : null };
    });
    const valid = per.filter((p) => p.avg !== null);
    const a = avgOf(valid.map((p) => p.avg!));
    const ranks = per.map((p) => p.rank).filter((x): x is number => x !== null);
    const lastRs = rs.filter((r) => r.examId === lastExam.id);
    return {
      classId: id,
      name,
      students: reg,
      participants: new Set(rs.map((r) => r.studentId)).size,
      participation: reg ? Math.min(100, Math.round((per.reduce((x, p) => x + p.n, 0) / (reg * exams.length)) * 100)) : null,
      avgScore: a === null ? null : round2(a),
      firstScore: valid.length ? round2(valid[0].avg!) : null,
      lastScore: valid.length ? round2(valid[valid.length - 1].avg!) : null,
      change: valid.length >= 2 ? round2(valid[valid.length - 1].avg! - valid[0].avg!) : null,
      avgRank: ranks.length ? round2(avgOf(ranks)!) : null,
      rank: 0,
      top1: isLgsExam(lastExam) ? lastRs.filter((r) => bandOf(typeof r.score === 'number' ? r.score : null) === 0).length : 0,
    };
  });
  const withData = classes.filter((c) => c.avgScore !== null).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  withData.forEach((c, i) => (c.rank = i + 1));
  const noData = classes.filter((c) => c.avgScore === null).sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  noData.forEach((c) => (c.rank = 0));

  const valid = perExam.filter((p) => p.avgScore !== null);
  const lastRow = perExam[perExam.length - 1];
  const participants = new Set(results.map((r) => r.studentId)).size;
  const sumN = perExam.reduce((a, p) => a + p.n, 0);
  return {
    exams,
    subjects: subs,
    perExam,
    classes: [...withData, ...noData],
    lgsYear: lgsCurve ? lgsCurve.year : null,
    summary: {
      students: regCount,
      participants,
      participation: regCount ? Math.min(100, Math.round((sumN / (regCount * exams.length)) * 100)) : null,
      avgScore: valid.length ? round2(avgOf(valid.map((p) => p.avgScore!))!) : null,
      lastAvg: lastRow.avgScore,
      change: valid.length >= 2 ? round2(valid[valid.length - 1].avgScore! - valid[0].avgScore!) : null,
      lastTop1: lastRow.bands ? lastRow.bands[0] : null,
      lastTop10: lastRow.bands ? lastRow.bands[0] + lastRow.bands[1] + lastRow.bands[2] : null,
    },
  };
}

/** Ağırlıklı netten puana: konu kazancını puana çevirirken kullanılır */
export const pointsPerNet = (coef: number) => round2(coef * LGS_SCORING.perWeighted);
