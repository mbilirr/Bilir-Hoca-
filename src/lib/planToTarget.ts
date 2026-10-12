import type { Student, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';
import { addDaysYmd, dateOfDay, type PlanItem } from '../services/studyPlanService';
import { normalizeSubject } from './subjects';
import { isFlexibleTarget } from '../utils/targetDays';

// ============================================================================
// Günlük plan → Soru takibi aktarımı
//  * Öğretmen plandaki görevleri tek düğmeyle öğrencinin "Soru Kaydet" formundaki
//    "Çalışılan Konu / Test" kutusuna aktarır.
//  * Aynı anda, planla aynı tarihlerde her ders için bir soru hedefi açılır. Hedefin soru
//    sayıları 0'dır; öğretmen hedefi açıp yalnızca soru sayılarını girer.
//  * Soru sayıları girilene kadar hedef öğrenciye gösterilmez (konular ise hemen görünür).
// ============================================================================

export interface PlanTransferResult {
  targets: WeeklyQuestionTarget[]; // açılan / güncellenen hedefler (ders başına bir tane)
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

export async function transferPlanToQuestionTargets(opts: {
  student: Student;
  weekStart: string;
  items: PlanItem[];
  canSubject: (subject: string) => boolean;
}): Promise<PlanTransferResult> {
  const { student, weekStart, items, canSubject } = opts;
  const weekEnd = addDaysYmd(weekStart, 6);
  const result: PlanTransferResult = { targets: [], skippedSubjects: [], emptySubjects: [] };

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
  if (bySubject.size === 0) return result;

  for (const [subject, days] of bySubject) {
    const dailyTopics: Record<string, string> = {};
    for (const [date, list] of days) dailyTopics[date] = joinTopics(list);

    // Planın 7 günü: görevi olan günler sayı bekler, diğerleri 0 (dinlenme)
    const zeroDays: Record<string, number> = {};
    for (let i = 0; i < 7; i++) zeroDays[addDaysYmd(weekStart, i)] = 0;

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
      dailyTargets: zeroDays,
      targetQuestions: 0,
      dailyTopics,
      fromPlan: true,
      notes: 'Günlük plandaki görevlere göre soru hedefi.',
    };

    // Aynı öğretmenin aynı ders ve tarihlerde zaten hedefi varsa o hedef güncellenir (sayılar korunur, konular eklenir)
    const conflict = dataService.findQuestionTargetConflict(draft);
    let toSave: WeeklyQuestionTarget;
    if (conflict) {
      const mergedTopics: Record<string, string> = { ...(conflict.dailyTopics || {}) };
      for (const [d, t] of Object.entries(dailyTopics)) mergedTopics[d] = joinTopics([...(mergedTopics[d] || '').split(', '), t]);
      toSave = {
        ...conflict,
        dailyTopics: mergedTopics,
        fromPlan: true,
        // Eşit dağıtımlı eski hedefin günlük sayıları korunsun diye dailyTargets'e dokunulmaz
        dailyTargets: isFlexibleTarget(conflict) ? conflict.dailyTargets : undefined,
      };
    } else {
      toSave = draft;
    }
    const saved = await dataService.saveQuestionTarget(toSave);
    result.targets.push(saved);
  }
  return result;
}
