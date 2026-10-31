// ============================================================================
// DENEME ANALİZİ (Aşama 47) — KARNE HESAPLARI
// Konu / kazanım / alt kazanım başarı yüzdeleri, seviye ve öneriler, gelişim ve hedef hesabı.
// Başarı yüzdesi = doğru / soru sayısı (boş ve yanlış başarısız sayılır).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LGS_SCORING, LGS_SUBJECTS, markOf, round2, type ExamSubject } from './lgs';
import { isBadKonu } from './kazanimBank';

export type Level = 'iyi' | 'tekrar' | 'etut' | 'kritik';

export const LEVEL_INFO: Record<Level, { label: string; advice: string; tone: 'success' | 'info' | 'warning' | 'danger'; rgb: [number, number, number] }> = {
  iyi: { label: 'Başarılı', advice: 'Konu kazanılmış; düzenli tekrarla korunmalı.', tone: 'success', rgb: [16, 150, 105] },
  tekrar: { label: 'Tekrar', advice: 'Konu tekrarı yapılmalı, soru çözüm taktik ve yöntemleri çalışılmalı.', tone: 'info', rgb: [37, 99, 235] },
  // Aşama 53c: %30–49 aralığının adı "Takviye" (etüt / takviye çalışması gerektirir)
  etut: { label: 'Takviye', advice: 'Takviye çalışması (etüt) yapılmalı, soru çözümüyle pekiştirilmeli.', tone: 'warning', rgb: [217, 119, 6] },
  kritik: { label: 'Kritik', advice: 'Konu anlaşılmamış: konu yeniden anlatılmalı ve yoğun soru çözümü yapılmalı.', tone: 'danger', rgb: [220, 38, 38] },
};

/** %70 ve üstü başarılı; %50-70 tekrar; %30-50 etüt; %30 altı kritik */
export function levelOf(rate: number): Level {
  if (rate >= 70) return 'iyi';
  if (rate >= 50) return 'tekrar';
  if (rate >= 30) return 'etut';
  return 'kritik';
}

export interface TopicNode {
  key: string;
  label: string;
  code?: string;
  questions: number; // farklı soru sayısı (deneme × soru)
  total: number; // değerlendirilen cevap sayısı (öğrenci × soru)
  d: number;
  y: number;
  b: number;
  rate: number; // başarı yüzdesi
  children: TopicNode[];
}

export interface SubjectTopics {
  subject: ExamSubject;
  total: number;
  d: number;
  y: number;
  b: number;
  rate: number;
  topics: TopicNode[];
}

const keyOf = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const newNode = (key: string, label: string, code?: string): TopicNode => ({ key, label, code, questions: 0, total: 0, d: 0, y: 0, b: 0, rate: 0, children: [] });
const finish = (n: TopicNode) => {
  n.rate = n.total ? Math.round((n.d / n.total) * 100) : 0;
  n.children.forEach(finish);
  n.children.sort((a, b) => a.rate - b.rate || b.total - a.total);
};

/** Bir soru hangi konu ve alt başlık altında raporlanır */
// Aşama 48g (öğretmenin istediği yapı):
//   KONU        = MEB kazanımı + parantez içinde konu başlığı
//                 ör. "F.8.1.1.1 Mevsimlerin oluşumuna yönelik tahminlerde bulunur. (Mevsimlerin Oluşumu)"
//   ALT KAZANIM = o kazanımın açıklama maddelerinden biri (a, b, c …)
//                 ör. "Dünya'nın dönme ekseni olduğuna değinilir."
// Aynı kazanıma ait sorular tek konu altında toplanır; alt kazanımlar onun altında ayrılır.
export function topicLabels(q: { konu?: string; kazanim?: string; alt?: string; kazanimCode?: string }): { konu: string; alt: string | null } {
  const title = (q.konu || '').trim();
  const kaz = (q.kazanim || '').trim();
  const code = (q.kazanimCode || '').trim();
  const alt: string | null = (q.alt || '').trim() || null;
  if (kaz) {
    const head = code && !kaz.startsWith(code) ? `${code} ${kaz}` : kaz;
    const withTitle = title && !isBadKonu(title, kaz) && keyOf(title) !== keyOf(kaz) ? `${head} (${title})` : head;
    return { konu: withTitle, alt: alt && keyOf(alt) !== keyOf(kaz) ? alt : null };
  }
  if (title) return { konu: code && !title.startsWith(code) ? `${code} ${title}` : title, alt };
  return { konu: 'Konusu belirtilmemiş', alt };
}

/** Sonuçlardan ders → konu → alt kazanım başarı ağacı (öğrenci için tek sonuç, sınıf için çok sonuç) */
export function topicAnalysis(exams: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS): SubjectTopics[] {
  const byExam = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byExam.has(r.examId)) byExam.set(r.examId, []);
    byExam.get(r.examId)!.push(r);
  }
  const out: SubjectTopics[] = [];
  for (const sub of subjects) {
    const topics = new Map<string, TopicNode>();
    const agg = { total: 0, d: 0, y: 0, b: 0 };
    for (const ex of exams) {
      if (!ex.subjects.some((s) => s.key === sub.key)) continue;
      const list = ex.questions[sub.key] || [];
      const rs = byExam.get(ex.id) || [];
      if (!rs.length) continue;
      list.forEach((q, i) => {
        if (!q.answer) return;
        const { konu, alt } = topicLabels(q);
        const tk = keyOf(konu);
        if (!topics.has(tk)) topics.set(tk, newNode(tk, konu, q.kazanimCode));
        const t = topics.get(tk)!;
        let c: TopicNode | null = null;
        if (alt) {
          const ck = keyOf(alt);
          c = t.children.find((x) => x.key === ck) || null;
          if (!c) {
            c = newNode(ck, alt, q.kazanimCode);
            t.children.push(c);
          }
        }
        t.questions++;
        if (c) c.questions++;
        for (const r of rs) {
          const m = markOf((r.answers[sub.key] || '')[i], q);
          for (const n of c ? [t, c] : [t]) {
            n.total++;
            if (m === 'D') n.d++;
            else if (m === 'Y') n.y++;
            else n.b++;
          }
          agg.total++;
          if (m === 'D') agg.d++;
          else if (m === 'Y') agg.y++;
          else agg.b++;
        }
      });
    }
    if (!agg.total) continue;
    const list = Array.from(topics.values());
    list.forEach(finish);
    list.sort((a, b) => a.rate - b.rate || b.total - a.total);
    out.push({ subject: sub, ...agg, rate: Math.round((agg.d / agg.total) * 100), topics: list });
  }
  return out;
}

// ----------------------------------------------------------------------------- Gelişim (seçilen denemeler)
export interface TrendRow {
  exam: DenemeExam;
  result: DenemeResult;
}

export function trendRows(exams: DenemeExam[], results: DenemeResult[], studentId: string): TrendRow[] {
  const byExam = new Map(results.filter((r) => r.studentId === studentId).map((r) => [r.examId, r]));
  return exams.filter((e) => byExam.has(e.id)).map((e) => ({ exam: e, result: byExam.get(e.id)! }));
}

/** Hedefe ulaşmak için gereken puan ve yaklaşık net (4 katsayılı derslerde) */
export function targetGap(lastScore: number | null, target: number | null): { points: number; weighted: number; mainNets: number; otherNets: number } | null {
  if (lastScore === null || target === null) return null;
  const points = round2(target - lastScore);
  const weighted = points > 0 ? round2(points / LGS_SCORING.perWeighted) : 0;
  return { points, weighted, mainNets: round2(weighted / 4), otherNets: round2(weighted) };
}

// ----------------------------------------------------------------------------- Sınıf ortalamaları
export interface ClassAverage {
  classId: string;
  className: string;
  count: number;
  avgScore: number;
  avgTotalNet: number;
  avgNet: Record<string, number>;
}

export function classAverages(results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS): ClassAverage[] {
  const m = new Map<string, DenemeResult[]>();
  for (const r of results) {
    const k = r.classId || '-';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return Array.from(m.entries())
    .map(([k, list]) => {
      const avgNet: Record<string, number> = {};
      for (const s of subjects) avgNet[s.key] = avg(list.map((r) => r.stats.subjects?.[s.key]?.net ?? 0));
      return {
        classId: k,
        className: list[0]?.className || 'Sınıfsız',
        count: list.length,
        avgScore: avg(list.map((r) => r.score ?? 0)),
        avgTotalNet: avg(list.map((r) => r.totalNet ?? 0)),
        avgNet,
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className, 'tr', { numeric: true }));
}

/** Öğrenci başına konu başarıları (etüt listesi için) */
export interface StudentTopicRow {
  studentId: string;
  studentName: string;
  className: string;
  subjectKey: string;
  konu: string;
  alt: string | null;
  total: number;
  d: number;
  y: number;
  b: number;
  rate: number;
}

/**
 * level: 'konu' = kazanım (kodlu kazanım metni + konu başlığı, eski adıyla "konu bazında"), 'alt' = alt kazanım,
 * 'baslik' = Aşama 115: yalnız konu başlığı (başlık yoksa / kazanımla aynıysa kazanım metni).
 */
export function studentTopicRows(exams: DenemeExam[], results: DenemeResult[], subjectKey: string, level: 'konu' | 'alt' | 'baslik'): StudentTopicRow[] {
  const exMap = new Map(exams.map((e) => [e.id, e]));
  const acc = new Map<string, StudentTopicRow>();
  for (const r of results) {
    const ex = exMap.get(r.examId);
    if (!ex) continue;
    const list = ex.questions[subjectKey] || [];
    const ans = r.answers[subjectKey] || '';
    list.forEach((q, i) => {
      if (!q.answer) return;
      const { konu, alt } = topicLabels(q);
      const title = level === 'baslik' ? (q.konu || '').trim() : '';
      const label = level === 'alt' ? alt || konu : level === 'baslik' && title && !isBadKonu(title, (q.kazanim || '').trim()) ? title : konu;
      const k = `${r.studentId}|${keyOf(label)}`;
      let row = acc.get(k);
      if (!row) {
        row = { studentId: r.studentId, studentName: r.studentName, className: r.className || '', subjectKey, konu: level === 'alt' ? konu : label, alt: level === 'alt' ? alt : null, total: 0, d: 0, y: 0, b: 0, rate: 0 };
        acc.set(k, row);
      }
      const m = markOf(ans[i], q);
      row.total++;
      if (m === 'D') row.d++;
      else if (m === 'Y') row.y++;
      else row.b++;
    });
  }
  const rows = Array.from(acc.values());
  rows.forEach((x) => (x.rate = x.total ? Math.round((x.d / x.total) * 100) : 0));
  return rows;
}
