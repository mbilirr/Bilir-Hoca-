import type { Student, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';
import { addDaysYmd, dateOfDay, type PlanItem } from '../services/studyPlanService';
import { normalizeSubject } from './subjects';
import { isFlexibleTarget, isPendingPlanTarget } from '../utils/targetDays';

// ============================================================================
// Günlük plan → Öğrencinin "Soru Kaydet" formu
//  * Öğretmen plandaki görevleri tek düğmeyle öğrencinin "Soru Kaydet" formundaki
//    "Çalışılan Konu / Test" kutusuna aktarır (görevin gününe, görevin dersine).
//  * Konular, her ders için bir "konu kaydında" saklanır (question_targets tablosu, soru sayısı 0,
//    fromPlan = true). Bu kayıt bir soru hedefi DEĞİLDİR: öğretmen ve öğrenci ekranlarında hiçbir listede,
//    grafikte ya da hesapta görünmez; yalnızca konuları taşır. Veritabanı değişikliği gerekmez.
//  * Aynı hafta yeniden aktarılırsa o haftanın konuları plandaki güncel görevlerle değiştirilir.
//  * Öğretmenin aynı ders ve tarihlerde gerçek bir soru hedefi varsa konular o hedefe eklenir (sayıları korunur).
// ============================================================================

export interface PlanTransferResult {
  subjects: string[]; // konuları aktarılan dersler
  days: number; // konu yazılan gün sayısı (ders × gün)
  skippedSubjects: string[]; // öğretmenin yetkisi olmayan dersler
  emptySubjects: string[]; // kitap/açıklama yazılmamış görevlerin dersleri (aktarılacak metin yok)
}

/** Görevin konu kutusuna yazılacak metni: "Kitap – açıklama" */
export const planItemTopicText = (it: Pick<PlanItem, 'book' | 'note'>) =>
  [it.book, it.note]
    .map((s) => (s || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' – ');

const joinTopics = (list: string[]) => {
  const uniq: string[] = [];
  for (const t of list) if (t && !uniq.includes(t)) uniq.push(t);
  return uniq.join(', ').slice(0, 120);
};

export async function transferPlanTopicsToQuestionEntry(opts: {
  student: Student;
  weekStart: string;
  items: PlanItem[];
  canSubject: (subject: string) => boolean;
}): Promise<PlanTransferResult> {
  const { student, weekStart, items, canSubject } = opts;
  const weekEnd = addDaysYmd(weekStart, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i));
  const result: PlanTransferResult = { subjects: [], days: 0, skippedSubjects: [], emptySubjects: [] };

  // Ders → gün → konu listesi
  const bySubject = new Map<string, Map<string, string[]>>();
  for (const it of items) {
    const subject = normalizeSubject(it.subject || '');
    if (!subject) continue;
    if (!canSubject(it.subject)) {
      if (!result.skippedSubjects.includes(subject)) result.skippedSubjects.push(subject);
      continue;
    }
    const text = planItemTopicText(it);
    if (!text) {
      if (!result.emptySubjects.includes(subject)) result.emptySubjects.push(subject);
      continue;
    }
    const date = dateOfDay(weekStart, it.day);
    const days = bySubject.get(subject) || new Map<string, string[]>();
    days.set(date, [...(days.get(date) || []), text]);
    bySubject.set(subject, days);
  }

  // Plandan çıkarılmış derslerin bu haftaya ait eski konu kayıtları silinir
  const oldRecords = dataService.getMyPlanTopicRecords(student.id, weekStart, weekEnd);
  for (const rec of oldRecords) {
    const subj = normalizeSubject(rec.subject || '');
    if (!bySubject.has(subj) && rec.id) await dataService.deleteQuestionTargetById(rec.id);
  }

  for (const [subject, days] of bySubject) {
    const weekTopics: Record<string, string> = {};
    for (const [date, list] of days) weekTopics[date] = joinTopics(list);

    const draft: WeeklyQuestionTarget = {
      targetType: 'student',
      studentId: student.id,
      studentName: student.name,
      classId: student.classId,
      className: student.className,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      targetDays: 7,
      subject,
      targetQuestions: 0,
      dailyTopics: weekTopics,
      fromPlan: true,
      notes: 'Günlük plandan aktarılan konular (soru hedefi değildir).',
    };

    // Bu öğretmenin aynı ders ve tarihlerde kaydı varsa (konu kaydı ya da gerçek hedef) o kayıt güncellenir:
    // bu haftanın günlerindeki konular plandaki güncel görevlerle değiştirilir, diğer günler ve soru sayıları korunur.
    const existing = dataService.findQuestionTargetConflict(draft);
    let toSave: WeeklyQuestionTarget;
    if (existing) {
      const merged: Record<string, string> = {};
      for (const [d, t] of Object.entries(existing.dailyTopics || {})) if (!weekDates.includes(d)) merged[d] = t;
      Object.assign(merged, weekTopics);
      toSave = isPendingPlanTarget(existing)
        ? { ...draft, id: existing.id }
        : {
            ...existing,
            dailyTopics: merged,
            // Eşit dağıtımlı hedefin sayıları korunsun diye dailyTargets'e dokunulmaz
            dailyTargets: isFlexibleTarget(existing) ? existing.dailyTargets : undefined,
          };
    } else {
      toSave = draft;
    }
    await dataService.saveQuestionTarget(toSave);
    result.subjects.push(subject);
    result.days += Object.keys(weekTopics).length;
  }
  return result;
}
