// ============================================================================
// DENEME ANALİZİ (Aşama 62) — B KİTAPÇIĞI EŞLEŞMESİ: GİRİŞ, DOĞRULAMA, UYUM KONTROLÜ
// Sistem her A sorusu için B kitapçığındaki numarasını (bNo) tutar; sıralama ne kadar karışık olursa olsun
// eşleşme doğru girildiyse cevaplar doğru okunur.
//  1) Doğrulama: her B numarası 1..soru sayısı arasında ve bir kez kullanılmalı.
//  2) B cevap anahtarıyla kontrol: A'nın cevabı, eşleştiği B sorusunun cevabıyla aynı olmalı.
//  3) Uyum kontrolü (sonuçlar yüklendikten sonra): aynı sorunun A ve B kitapçığındaki doğru oranları
//     birbirinden çok farklıysa eşleşme yanlış olabilir; B'deki olası doğru numara önerilir.
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { markOf, type ExamQuestion, type ExamQuestions, type ExamSubject } from './lgs';

// ----------------------------------------------------------------------------- 1) doğrulama
/** Bir dersin B eşleşmesindeki sorunlar (boşsa sorun yok). Hiç B numarası yoksa "A ile aynı sıra" sayılır. */
export function bMapProblems(subject: ExamSubject, list: ExamQuestion[]): string[] {
  const out: string[] = [];
  if (!list.length || list.every((q) => !q.bNo)) return out;
  const used = new Map<number, number[]>();
  for (const q of list) {
    if (!q.bNo) {
      out.push(`${subject.name} ${q.no}. soru: B numarası yazılmamış.`);
      continue;
    }
    if (!Number.isInteger(q.bNo) || q.bNo < 1 || q.bNo > subject.count) {
      out.push(`${subject.name} ${q.no}. soru: B numarası ${q.bNo} geçersiz (1-${subject.count} olmalı).`);
      continue;
    }
    used.set(q.bNo, [...(used.get(q.bNo) || []), q.no]);
  }
  for (const [b, as] of used) if (as.length > 1) out.push(`${subject.name}: B kitapçığının ${b}. sorusu birden çok A sorusuna verilmiş (${as.join(', ')}. sorular).`);
  return out;
}

/** Bütün derslerin B eşleşme sorunları (yalnızca cevap anahtarı girilmiş dersler) */
export function keyBProblems(subjects: ExamSubject[], qs: ExamQuestions): string[] {
  const out: string[] = [];
  for (const s of subjects) {
    const list = qs[s.key] || [];
    if (!list.some((q) => q.answer)) continue;
    out.push(...bMapProblems(s, list));
  }
  return out;
}

/** Bir sorunun B numarası sorunlu mu (tablo hücresini kırmızı göstermek için) */
export function badBNos(subject: ExamSubject, list: ExamQuestion[]): Set<number> {
  const bad = new Set<number>();
  if (!list.length || list.every((q) => !q.bNo)) return bad;
  const count = new Map<number, number>();
  for (const q of list) if (q.bNo) count.set(q.bNo, (count.get(q.bNo) || 0) + 1);
  for (const q of list) {
    if (!q.bNo || q.bNo < 1 || q.bNo > subject.count || (count.get(q.bNo) || 0) > 1) bad.add(q.no);
  }
  return bad;
}

// ----------------------------------------------------------------------------- yapıştırma
/**
 * Yapıştırılan B sırası. Sayılar boşluk, virgül, satır ya da sekmeyle ayrılabilir.
 *  direction 'a2b': "A'nın 1., 2., 3. … sorularının B'deki numaraları" (ör. 12 5 18 …)
 *  direction 'b2a': "B'nin 1., 2., 3. … sorularının A'daki numaraları"
 * İki sütunlu yapıştırmada ("1 12", "2 5" …) ilk sütun soru numarası kabul edilir.
 * Dönen dizi: A sırasıyla B numaraları (index 0 = A'nın 1. sorusu); okunamazsa hata metni.
 */
export function parseBOrder(text: string, count: number, direction: 'a2b' | 'b2a'): { bNos: number[] } | { error: string } {
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let nums: number[] = [];
  // iki sütunlu satırlar: "1 12" / "1-12" / "1:12" / "1\t12"
  const pairs = lines.map((l) => /^(\d{1,3})\s*[\t ,;:=\-–>→]+\s*(\d{1,3})$/.exec(l)).filter(Boolean) as RegExpExecArray[];
  const pairMap = new Map<number, number>();
  for (const p of pairs) pairMap.set(Number(p[1]), Number(p[2]));
  const asPairs = lines.length >= 2 && pairs.length === lines.length && pairMap.size === count && Array.from({ length: count }, (_, i) => pairMap.has(i + 1)).every(Boolean);
  if (asPairs) {
    nums = Array.from({ length: count }, (_, i) => pairMap.get(i + 1) || 0);
  } else {
    nums = (text.match(/\d{1,3}/g) || []).map(Number);
    if (nums.length !== count) return { error: `${count} sayı olmalı; ${nums.length} sayı okundu.` };
  }
  if (nums.some((n) => n < 1 || n > count)) return { error: `Sayılar 1 ile ${count} arasında olmalı.` };
  if (new Set(nums).size !== count) return { error: 'Aynı numara birden çok kez yazılmış; her numara bir kez olmalı.' };
  if (direction === 'a2b') return { bNos: nums };
  // B'nin i. sorusu = A'nın nums[i]. sorusu → A'nın nums[i]. sorusunun B numarası i+1
  const out = new Array<number>(count).fill(0);
  nums.forEach((a, i) => (out[a - 1] = i + 1));
  return { bNos: out };
}

// ----------------------------------------------------------------------------- 2) B cevap anahtarıyla kontrol
export const cleanKey = (s: string) => (s || '').toUpperCase().replace(/İ/g, 'I').replace(/[^A-EX]/g, '');

export interface BKeyCheck {
  checked: number;
  mismatches: Array<{ no: number; bNo: number; a: string; b: string }>;
  /** Harfler bu kurallardan birine tam uyuyor mu */
  fitsReverse: boolean;
  fitsSame: boolean;
}

/** A anahtarı + eşleşme, B'nin kendi anahtarıyla uyuşuyor mu? */
export function checkWithBKey(list: ExamQuestion[], count: number, bKeyRaw: string): BKeyCheck | null {
  const bKey = cleanKey(bKeyRaw);
  if (bKey.length < count) return null;
  const fits = (f: (no: number) => number) =>
    list.every((q) => !q.answer || q.answer === 'X' || bKey[f(q.no) - 1] === 'X' || bKey[f(q.no) - 1] === q.answer);
  const mismatches: BKeyCheck['mismatches'] = [];
  let checked = 0;
  for (const q of list) {
    if (!q.answer || q.answer === 'X') continue;
    const b = q.bNo || q.no;
    const bAns = bKey[b - 1];
    if (!bAns || bAns === 'X') continue;
    checked++;
    if (bAns !== q.answer) mismatches.push({ no: q.no, bNo: b, a: q.answer, b: bAns });
  }
  return { checked, mismatches, fitsReverse: fits((no) => count + 1 - no), fitsSame: fits((no) => no) };
}

// ----------------------------------------------------------------------------- 3) sonuçlarla uyum kontrolü
export interface BookletIssue {
  subject: ExamSubject;
  no: number;
  bNo: number;
  rateA: number; // A kitapçıklı öğrencilerde doğru %
  rateB: number; // B kitapçıklı öğrencilerde doğru %
  suggest: { bNo: number; rate: number } | null; // B'de muhtemel doğru numara
}

export interface BookletCheck {
  nA: number;
  nB: number;
  enough: boolean; // her kitapçıkta yeterli öğrenci var mı
  issues: BookletIssue[];
  wholeSubjects: string[]; // sorunların yarıdan çoğu bu derste: eşleşme bütünüyle yanlış olabilir
}

export const BOOKLET_MIN = 12; // kitapçık başına en az öğrenci

/**
 * Her soru için A ve B kitapçıklı öğrencilerin doğru oranı karşılaştırılır. Doğru eşleşmede ikisi yakındır;
 * yanlış eşleşmede B'deki oran rastgele seviyesine düşer. İki oran arasındaki fark hem büyük (30 puan) hem
 * istatistiksel olarak anlamlıysa (z ≥ 3) soru işaretlenir. Sonuçlar A sırasına çevrilmiş olarak saklandığı için
 * B öğrencilerinin kâğıt üzerindeki sırası eşleşmeden geri kurulur ve doğru cevabın B'de en çok hangi numarada
 * işaretlendiğine bakılarak olası doğru B numarası önerilir.
 */
export function bookletConsistency(exam: DenemeExam, results: DenemeResult[]): BookletCheck {
  const A = results.filter((r) => (r.booklet || 'A') !== 'B');
  const B = results.filter((r) => r.booklet === 'B');
  const enough = A.length >= BOOKLET_MIN && B.length >= BOOKLET_MIN;
  const issues: BookletIssue[] = [];
  const wholeSubjects: string[] = [];
  if (!enough) return { nA: A.length, nB: B.length, enough, issues, wholeSubjects };
  for (const s of exam.subjects) {
    const qs = exam.questions[s.key] || [];
    if (!qs.length || qs.every((q) => !q.answer)) continue;
    // B öğrencilerinin kâğıttaki (B sırasındaki) cevapları
    const rawB = B.map((r) => {
      const a = r.answers[s.key] || '';
      const raw = new Array<string>(qs.length).fill(' ');
      qs.forEach((q, i) => {
        const b = (q.bNo || q.no) - 1;
        if (b >= 0 && b < raw.length) raw[b] = a[i] || ' ';
      });
      return raw;
    });
    const subjIssues: BookletIssue[] = [];
    qs.forEach((q, i) => {
      if (!q.answer || q.answer === 'X') return;
      const dA = A.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length;
      const dB = B.filter((r) => markOf((r.answers[s.key] || '')[i], q) === 'D').length;
      const pA = dA / A.length;
      const pB = dB / B.length;
      const p = (dA + dB) / (A.length + B.length);
      const se = Math.sqrt(Math.max(1e-9, p * (1 - p) * (1 / A.length + 1 / B.length)));
      const z = Math.abs(pA - pB) / se;
      if (Math.abs(pA - pB) < 0.3 || z < 3) return;
      // olası doğru B numarası: B öğrencilerinin bu sorunun doğru cevabını en çok işaretlediği numara
      let best: { bNo: number; rate: number } | null = null;
      for (let j = 0; j < qs.length; j++) {
        const rate = rawB.filter((raw) => raw[j] === q.answer).length / B.length;
        if (!best || rate > best.rate) best = { bNo: j + 1, rate };
      }
      const cur = q.bNo || q.no;
      const suggest = best && best.bNo !== cur && best.rate - pB >= 0.25 && best.rate >= pA - 0.2 ? { bNo: best.bNo, rate: Math.round(best.rate * 100) } : null;
      subjIssues.push({ subject: s, no: q.no, bNo: cur, rateA: Math.round(pA * 100), rateB: Math.round(pB * 100), suggest });
    });
    if (subjIssues.length >= Math.max(3, Math.ceil(qs.length / 2))) wholeSubjects.push(s.name);
    issues.push(...subjIssues);
  }
  return { nA: A.length, nB: B.length, enough, issues, wholeSubjects };
}
