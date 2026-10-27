// ============================================================================
// DENEME ANALİZİ (Aşama 92) — B EŞLEŞMESİ DEĞİŞİNCE KAYITLI CEVAPLARI YENİDEN DÜZENLEME
// Sonuçlar A sırasına çevrilmiş olarak saklanır (çevirme o anki B numaralarıyla yapılır). Kayıtlı bir denemede
// B numaraları değişince B kitapçıklı öğrencilerin cevapları önce ESKİ numaralarla kâğıttaki (B) sıraya geri
// çevrilir, sonra YENİ numaralarla A sırasına yerleştirilir. Böylece TXT'yi yeniden yüklemek gerekmez; soru
// bazlı analiz, kazanım analizi ve B uyum kontrolü doğru sorulardan hesaplanır.
// Puan yalnızca yeni numaranın B harfi A'daki cevapla uyuşmuyorsa değişir (önizlemede sayısı gösterilir).
// ============================================================================
import type { DenemeResult } from '../../services/denemeService';
import { recomputeFromAnswers, type ExamQuestion, type ExamQuestions, type ExamSubject, type ScoringSettings } from './lgs';

export interface BChange {
  subject: ExamSubject;
  questions: number; // B numarası değişen A soruları
}

export interface BRemapPlan {
  changes: BChange[];
  nB: number; // cevapları yeniden düzenlenen B kitapçıklı öğrenci
  scoreChanged: number; // puanı değişecek öğrenci
  next: DenemeResult[]; // yeni anahtarla yeniden hesaplanmış sonuçlar (hepsi)
}

const bOf = (q: ExamQuestion | undefined, i: number) => (q && q.bNo ? q.bNo : q ? q.no : i + 1);

/** Eşleşme geçerli mi: her B numarası bir kez ve 1..n arasında */
function validMap(list: ExamQuestion[], n: number): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    const b = bOf(list[i], i);
    if (b < 1 || b > n || seen.has(b)) return false;
    seen.add(b);
  }
  return true;
}

/** Bir dersin A sırasındaki cevaplarını eski eşleşmeden yeni eşleşmeye taşır */
export function remapSubject(aOrder: string, oldList: ExamQuestion[], newList: ExamQuestion[], count: number): string {
  const raw = new Array<string>(count).fill(' ');
  oldList.forEach((q, i) => {
    const b = bOf(q, i) - 1;
    if (b >= 0 && b < count) raw[b] = aOrder[i] || ' ';
  });
  return newList.map((q, i) => raw[bOf(q, i) - 1] || ' ').join('');
}

/**
 * Yeni anahtarın sonuçlara etkisi. B eşleşmesi değişen derslerde B kitapçıklı öğrencilerin cevapları yeniden
 * düzenlenir; bütün sonuçlar yeni anahtarla yeniden hesaplanır.
 */
export function planBRemap(subjects: ExamSubject[], oldQs: ExamQuestions, newQs: ExamQuestions, results: DenemeResult[], scoring: ScoringSettings): BRemapPlan {
  const changes: BChange[] = [];
  const movable = new Set<string>();
  for (const s of subjects) {
    const o = oldQs[s.key] || [];
    const n = newQs[s.key] || [];
    if (!o.length || o.length !== n.length) continue;
    const diff = n.filter((q, i) => bOf(q, i) !== bOf(o[i], i)).length;
    if (!diff) continue;
    changes.push({ subject: s, questions: diff });
    // Eski ya da yeni eşleşme bozuksa (aynı B numarası iki kez) cevaplar taşınmaz
    if (validMap(o, s.count) && validMap(n, s.count)) movable.add(s.key);
  }
  let nB = 0;
  let scoreChanged = 0;
  const next = results.map((r) => {
    let answers = r.answers;
    if (r.booklet === 'B' && movable.size) {
      answers = { ...r.answers };
      for (const s of subjects) if (movable.has(s.key)) answers[s.key] = remapSubject(r.answers[s.key] || '', oldQs[s.key], newQs[s.key], s.count);
      nB++;
    }
    const re = recomputeFromAnswers(answers, r.booklet, subjects, newQs, scoring, !!r.stats.bookletGuessed);
    if (Math.abs((re.score ?? 0) - (r.score ?? 0)) > 0.0005) scoreChanged++;
    return { ...r, answers: re.answers, stats: { ...re.stats, rank: r.stats.rank }, totalNet: re.totalNet, score: re.score };
  });
  return { changes, nB, scoreChanged, next };
}
