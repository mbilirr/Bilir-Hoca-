import type { Student, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';
import { addDaysYmd, cleanQuestionCount, dateOfDay, type PlanItem } from '../services/studyPlanService';
import { normalizeSubject } from './subjects';
import { isFlexibleTarget, isPendingPlanTarget, isPlanTopicRecord, PLAN_QUESTION_TARGET_NOTE, PLAN_TOPIC_NOTE_PREFIX } from '../utils/targetDays';

// ============================================================================
// Haftalık plan → Öğrencinin "Soru Kaydet" formu ve soru hedefleri
//  * Plandaki görevlerin metni (kitap – açıklama) öğrencinin "Soru Kaydet" formundaki
//    "Çalışılan Konu / Test" kutusuna, görevin gününe ve dersine yazılır.
//  * Aşama 43: görevde SORU SAYISI varsa, o ders için planın haftasıyla (planın başladığı günden itibaren 7 gün)
//    aynı tarihlerde GÜN GÜN bir soru hedefi oluşur (ör. Salı 30, Perşembe 20). Bu gerçek bir hedeftir:
//    öğrenci ve öğretmen ekranlarındaki bütün tablo, grafik ve özetlerde görünür.
//  * Soru sayısı yoksa yalnızca konu kaydı oluşur (soru hedefi değildir, hiçbir listede görünmez).
//  * Aynı hafta yeniden aktarılırsa (gönder / Planı yenile) o haftanın konu ve sayıları güncel planla değiştirilir.
//  * Öğretmenin aynı ders ve tarihlerde ELLE verdiği bir soru hedefi varsa onun sayılarına dokunulmaz;
//    yalnızca konular eklenir (sonuçta "manualKept" ile bildirilir).
// ============================================================================

export interface PlanTransferResult {
  subjects: string[]; // konuları / sayıları aktarılan dersler
  days: number; // konu yazılan gün sayısı (ders × gün)
  skippedSubjects: string[]; // öğretmenin yetkisi olmayan dersler
  emptySubjects: string[]; // kitap/açıklama/soru sayısı yazılmamış görevlerin dersleri
  questionSubjects: string[]; // Aşama 43: soru hedefi oluşan / güncellenen dersler
  questionTotal: number; // Aşama 43: aktarılan toplam soru
  manualKept: string[]; // Aşama 43: elle verilmiş hedef korunduğu için sayıları aktarılmayan dersler
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

const PLAN_TARGET_NOTE = PLAN_QUESTION_TARGET_NOTE;
const PLAN_TOPIC_NOTE = `${PLAN_TOPIC_NOTE_PREFIX} (soru hedefi değildir).`;

export async function transferPlanTopicsToQuestionEntry(opts: {
  student: Student;
  weekStart: string;
  items: PlanItem[];
  canSubject: (subject: string) => boolean;
}): Promise<PlanTransferResult> {
  const { student, weekStart, items, canSubject } = opts;
  const weekEnd = addDaysYmd(weekStart, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i));
  const result: PlanTransferResult = {
    subjects: [],
    days: 0,
    skippedSubjects: [],
    emptySubjects: [],
    questionSubjects: [],
    questionTotal: 0,
    manualKept: [],
  };

  // Ders → gün → konu listesi / soru sayısı
  const topicsBySubject = new Map<string, Map<string, string[]>>();
  const countsBySubject = new Map<string, Map<string, number>>();
  for (const it of items) {
    const subject = normalizeSubject(it.subject || '');
    if (!subject) continue;
    if (!canSubject(it.subject)) {
      if (!result.skippedSubjects.includes(subject)) result.skippedSubjects.push(subject);
      continue;
    }
    const date = dateOfDay(weekStart, it.day);
    if (!weekDates.includes(date)) continue;
    const text = planItemTopicText(it);
    const count = cleanQuestionCount(it.questionCount);
    if (!text && !count) {
      if (!result.emptySubjects.includes(subject)) result.emptySubjects.push(subject);
      continue;
    }
    if (text) {
      const days = topicsBySubject.get(subject) || new Map<string, string[]>();
      days.set(date, [...(days.get(date) || []), text]);
      topicsBySubject.set(subject, days);
    }
    if (count) {
      const days = countsBySubject.get(subject) || new Map<string, number>();
      days.set(date, (days.get(date) || 0) + count);
      countsBySubject.set(subject, days);
    }
  }
  const subjects = Array.from(new Set([...topicsBySubject.keys(), ...countsBySubject.keys()]));

  // Plandan çıkarılmış derslerin BU haftaya ait eski kayıtları (konu kaydı ya da plandan gelen hedef) silinir.
  // Farklı günde başlayan komşu haftanın kayıtlarına dokunulmaz.
  const oldRecords = dataService.getMyPlanTopicRecords(student.id, weekStart, weekEnd);
  for (const rec of oldRecords) {
    const subj = normalizeSubject(rec.subject || '');
    if (!subjects.includes(subj) && rec.id && rec.weekStartDate === weekStart) await dataService.deleteQuestionTargetById(rec.id);
  }

  for (const subject of subjects) {
    const weekTopics: Record<string, string> = {};
    for (const [date, list] of topicsBySubject.get(subject) || new Map<string, string[]>()) weekTopics[date] = joinTopics(list);
    const counts = countsBySubject.get(subject);
    const total = counts ? Array.from(counts.values()).reduce((a, b) => a + b, 0) : 0;

    const base: WeeklyQuestionTarget = {
      targetType: 'student',
      studentId: student.id,
      studentName: student.name,
      classId: student.classId,
      className: student.className,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      targetDays: 7,
      subject,
      dailyTopics: weekTopics,
      fromPlan: true,
    };
    const draft: WeeklyQuestionTarget =
      total > 0
        ? {
            ...base,
            // Gün gün hedef: planın 7 gününün hepsi yazılır (görev olmayan gün 0 = o derste hedef yok)
            dailyTargets: Object.fromEntries(weekDates.map((d) => [d, counts?.get(d) || 0])),
            targetQuestions: total,
            dailyTarget: Math.max(1, Math.round(total / 7)),
            notes: PLAN_TARGET_NOTE,
          }
        : { ...base, targetQuestions: 0, notes: PLAN_TOPIC_NOTE };

    // Bu öğretmenin aynı ders ve tarihlerde kaydı var mı?
    const found = dataService.findQuestionTargetConflict(draft);
    // BAŞKA haftanın plan kaydı (tarihleri çakışıyor) bu haftanınkiyle değiştirilmez; bu hafta için ayrı kayıt açılır
    const existing = found && isPlanTopicRecord(found) && found.weekStartDate !== weekStart ? null : found;
    let toSave: WeeklyQuestionTarget;
    if (!existing) {
      toSave = draft;
    } else if (isPlanTopicRecord(existing) || isPendingPlanTarget(existing)) {
      // Plandan gelmiş eski kayıt: tamamen güncel planla değiştirilir
      toSave = { ...draft, id: existing.id };
    } else {
      // Öğretmenin ELLE verdiği hedef: sayıları korunur, yalnızca bu haftanın konuları güncellenir
      const merged: Record<string, string> = {};
      for (const [d, t] of Object.entries(existing.dailyTopics || {})) if (!weekDates.includes(d)) merged[d] = t;
      Object.assign(merged, weekTopics);
      toSave = {
        ...existing,
        dailyTopics: merged,
        // Eşit dağıtımlı hedefin sayıları korunsun diye dailyTargets'e dokunulmaz
        dailyTargets: isFlexibleTarget(existing) ? existing.dailyTargets : undefined,
      };
      if (total > 0 && !result.manualKept.includes(subject)) result.manualKept.push(subject);
    }
    await dataService.saveQuestionTarget(toSave);
    result.subjects.push(subject);
    result.days += Object.keys(weekTopics).length;
    if (total > 0 && toSave.fromPlan) {
      result.questionSubjects.push(subject);
      result.questionTotal += total;
    }
  }
  return result;
}
