// ============================================================================
// DENEME ANALİZİ (Aşama 50) — TEK DENEME KARNESİ VERİSİ
// Bir öğrencinin tek bir denemedeki ayrıntılı karnesi: puan ve sıralar, ders ders D/Y/B/net,
// sınıf ve kurum ortalamaları, soru soru cevap çizelgesi, konu/kazanım başarısı (kurum başarısıyla).
// Yalnızca kaydedilmiş sonuç ve deneme özetinden hesaplanır; başka öğrencinin bilgisi kullanılmaz
// (sınıf/kurum değerleri denemenin kişisel bilgi içermeyen özetindendir).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LGS_SUBJECTS, markOf, round2, type ExamSubject } from './lgs';
import { topicLabels } from './analiz';

export type Mark = 'D' | 'Y' | 'B';

export interface AnswerCell {
  no: number;
  key: string; // doğru cevap (X = iptal)
  given: string; // öğrencinin cevabı (boş = '')
  mark: Mark;
  kurumRate: number | null; // kurumda bu soruyu doğru yapanların yüzdesi
}

export interface SubjectRow {
  subject: ExamSubject;
  count: number;
  d: number;
  y: number;
  b: number;
  net: number;
  rate: number; // doğru / soru (%)
  clsAvgNet: number | null;
  kurumAvgNet: number | null;
  answers: AnswerCell[];
}

export interface TopicRow {
  subject: ExamSubject;
  konu: string;
  alt: string | null;
  questions: number[]; // A kitapçığı soru numaraları
  d: number;
  y: number;
  b: number;
  rate: number;
  kurumRate: number | null;
}

export interface ExamKarneData {
  exam: DenemeExam;
  result: DenemeResult;
  subjects: SubjectRow[];
  topics: TopicRow[];
  score: number | null;
  totalNet: number | null;
  clsAvgScore: number | null;
  kurumAvgScore: number | null;
  kurumMaxScore: number | null;
  totals: { count: number; d: number; y: number; b: number };
  rank: { cls: number; clsCount: number; overall: number; overallCount: number } | null;
}

const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function examKarneData(exam: DenemeExam, result: DenemeResult): ExamKarneData {
  const subs = LGS_SUBJECTS.filter((s) => exam.subjects.some((x) => x.key === s.key));
  const cls = result.classId ? (exam.summary.classes || {})[result.classId] : undefined;
  const qRates = exam.summary.questionRates || {};
  const subjects: SubjectRow[] = [];
  const topicMap = new Map<string, TopicRow>();
  const totals = { count: 0, d: 0, y: 0, b: 0 };

  for (const s of subs) {
    const qs = exam.questions[s.key] || [];
    if (!qs.length) continue;
    const ans = result.answers[s.key] || '';
    const rates = qRates[s.key] || [];
    const answers: AnswerCell[] = qs.map((q, i) => {
      const g = (ans[i] || ' ').trim();
      const r = rates[i];
      return { no: q.no, key: (q.answer || '').toUpperCase(), given: g, mark: markOf(g || ' ', q), kurumRate: typeof r === 'number' ? r : null };
    });
    const st = result.stats.subjects?.[s.key];
    const d = answers.filter((a) => a.mark === 'D').length;
    const y = answers.filter((a) => a.mark === 'Y').length;
    const b = answers.length - d - y;
    totals.count += answers.length;
    totals.d += d;
    totals.y += y;
    totals.b += b;
    subjects.push({
      subject: s,
      count: answers.length,
      d,
      y,
      b,
      net: st ? st.net : round2(d - y / 3),
      rate: answers.length ? Math.round((d / answers.length) * 100) : 0,
      clsAvgNet: cls && typeof cls.avgNet?.[s.key] === 'number' ? cls.avgNet[s.key] : null,
      kurumAvgNet: typeof exam.summary.avgNet?.[s.key] === 'number' ? (exam.summary.avgNet as Record<string, number>)[s.key] : null,
      answers,
    });

    // Konu / alt kazanım (kazanımı girilmemiş sorular "Konusu belirtilmemiş" altında)
    qs.forEach((q, i) => {
      if (!q.answer) return;
      const { konu, alt } = topicLabels(q);
      const k = `${s.key}|${konu}`;
      let t = topicMap.get(k);
      if (!t) {
        t = { subject: s, konu, alt: null, questions: [], d: 0, y: 0, b: 0, rate: 0, kurumRate: null };
        topicMap.set(k, t);
      }
      if (alt && !t.alt) t.alt = alt;
      t.questions.push(q.no);
      const m = answers[i].mark;
      if (m === 'D') t.d++;
      else if (m === 'Y') t.y++;
      else t.b++;
    });
  }

  const topics = Array.from(topicMap.values()).map((t) => {
    const s = subjects.find((x) => x.subject.key === t.subject.key);
    const rs = (s?.answers || []).filter((a) => t.questions.includes(a.no)).map((a) => a.kurumRate).filter((x): x is number => x !== null);
    return { ...t, rate: Math.round((t.d / Math.max(1, t.questions.length)) * 100), kurumRate: avgOf(rs) };
  });

  return {
    exam,
    result,
    subjects,
    topics,
    score: result.score,
    totalNet: result.totalNet,
    clsAvgScore: cls ? cls.avgScore : null,
    kurumAvgScore: typeof exam.summary.avgScore === 'number' ? exam.summary.avgScore : null,
    kurumMaxScore: typeof exam.summary.maxScore === 'number' ? exam.summary.maxScore : null,
    totals,
    rank: result.stats.rank || null,
  };
}

/** Yüzdelik dilim (kurum içi): 1. olan %0'a yakın, sonuncu %100 */
export function percentile(rank: { overall: number; overallCount: number } | null): number | null {
  if (!rank || !rank.overallCount) return null;
  return Math.max(1, Math.round((rank.overall / rank.overallCount) * 100));
}
