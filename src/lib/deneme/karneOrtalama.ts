// ============================================================================
// DENEME ANALİZİ (Aşama 92) — ORTALAMA DENEME KARNESİ
// Son 3 / 5 / 10 ya da seçilen denemelerin ortalamasıyla tek bir karne: ortalama puan, ortalama sıralar,
// ders ders ortalama doğru / yanlış / boş / net, sınıf ve kurum ortalamaları, bütün sorular üzerinden konu
// ve kazanım başarısı. Tek deneme karnesiyle aynı yapıdadır (ekran ve PDF aynı tasarımı kullanır).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { examKarneData, type ExamKarneData, type SubjectRow, type TopicRow } from './karneDetay';
import { round2 } from './lgs';

export interface AvgInfo {
  n: number; // deneme sayısı
  scopeLabel: string; // "Son 3 deneme"
  range: string; // tarih aralığı
}

export type KarneData = ExamKarneData & { avg?: AvgInfo };

const mean = (xs: Array<number | null | undefined>): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const r2 = (v: number | null) => (v === null ? null : round2(v));

/** Denemeler (tarih sırasıyla) ve öğrencinin sonuçlarından ortalama karne; 2'den az deneme varsa null */
export function averageKarneData(exams: DenemeExam[], results: DenemeResult[], scopeLabel: string, range: string): KarneData | null {
  const rBy = new Map<string, DenemeResult>();
  for (const r of results) if (!rBy.has(r.examId)) rBy.set(r.examId, r);
  const used = exams.filter((e) => rBy.has(e.id));
  if (used.length < 2) return null;
  const per = used.map((e) => examKarneData(e, rBy.get(e.id)!));
  const last = per[per.length - 1];

  // Dersler (ilk geçtiği sırayla)
  const keys: string[] = [];
  for (const p of per) for (const s of p.subjects) if (!keys.includes(s.subject.key)) keys.push(s.subject.key);
  const subjects: SubjectRow[] = keys.map((k) => {
    const rows = per.map((p) => p.subjects.find((s) => s.subject.key === k)).filter((x): x is SubjectRow => !!x);
    const total = rows.reduce((a, s) => a + s.count, 0);
    const d = rows.reduce((a, s) => a + s.d, 0);
    return {
      subject: rows[0].subject,
      count: Math.round(total / rows.length),
      d: round2(d / rows.length),
      y: round2(rows.reduce((a, s) => a + s.y, 0) / rows.length),
      b: round2(rows.reduce((a, s) => a + s.b, 0) / rows.length),
      net: round2(rows.reduce((a, s) => a + s.net, 0) / rows.length),
      rate: total ? Math.round((d / total) * 100) : 0,
      clsAvgNet: r2(mean(rows.map((s) => s.clsAvgNet))),
      kurumAvgNet: r2(mean(rows.map((s) => s.kurumAvgNet))),
      answers: [],
    };
  });

  // Konular: bütün denemelerdeki soruların toplamı (kurum başarısı soru sayısıyla ağırlıklı)
  const tm = new Map<string, TopicRow & { kw: number; kn: number }>();
  for (const p of per)
    for (const t of p.topics) {
      const k = `${t.subject.key}|${t.konu}`;
      let x = tm.get(k);
      if (!x) {
        x = { ...t, questions: [], d: 0, y: 0, b: 0, rate: 0, kurumRate: null, kw: 0, kn: 0 };
        tm.set(k, x);
      }
      if (!x.alt && t.alt) x.alt = t.alt;
      x.questions = x.questions.concat(t.questions);
      x.d += t.d;
      x.y += t.y;
      x.b += t.b;
      if (t.kurumRate !== null) {
        x.kw += t.kurumRate * t.questions.length;
        x.kn += t.questions.length;
      }
    }
  const topics: TopicRow[] = Array.from(tm.values()).map(({ kw, kn, ...t }) => ({
    ...t,
    rate: Math.round((t.d / Math.max(1, t.questions.length)) * 100),
    kurumRate: kn ? Math.round(kw / kn) : null,
  }));

  const ranks = per.map((p) => p.rank).filter((x): x is NonNullable<ExamKarneData['rank']> => !!x);
  const rank =
    ranks.length === per.length
      ? {
          cls: Math.round(mean(ranks.map((x) => x.cls))!),
          clsCount: Math.round(mean(ranks.map((x) => x.clsCount))!),
          overall: Math.round(mean(ranks.map((x) => x.overall))!),
          overallCount: Math.round(mean(ranks.map((x) => x.overallCount))!),
        }
      : null;
  const n = per.length;
  const maxes = per.map((p) => p.kurumMaxScore).filter((x): x is number => typeof x === 'number');
  return {
    exam: last.exam,
    result: last.result,
    subjects,
    topics,
    score: r2(mean(per.map((p) => p.score))),
    totalNet: r2(mean(per.map((p) => p.totalNet))),
    clsAvgScore: r2(mean(per.map((p) => p.clsAvgScore))),
    kurumAvgScore: r2(mean(per.map((p) => p.kurumAvgScore))),
    kurumMaxScore: maxes.length ? Math.max(...maxes) : null,
    totals: {
      count: Math.round(per.reduce((a, p) => a + p.totals.count, 0) / n),
      d: round2(per.reduce((a, p) => a + p.totals.d, 0) / n),
      y: round2(per.reduce((a, p) => a + p.totals.y, 0) / n),
      b: round2(per.reduce((a, p) => a + p.totals.b, 0) / n),
    },
    rank,
    avg: { n, scopeLabel, range },
  };
}
