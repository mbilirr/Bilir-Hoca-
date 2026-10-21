import type { Student, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';
import { addDaysYmd, cleanQuestionCount, dateOfDay, loadPlan, type PlanItem } from '../services/studyPlanService';
import { normalizeSubject, sameSubjectName, sameTargetSubjects, targetSubjectList } from './subjects';
import { isFlexibleTarget, isPlanTopicRecord, PLAN_QUESTION_TARGET_NOTE, PLAN_TOPIC_NOTE_PREFIX } from '../utils/targetDays';

// ============================================================================
// Haftalık plan → Öğrencinin "Soru Kaydet" formu ve soru hedefleri
//  * Plandaki görevlerin metni (kitap – açıklama) öğrencinin "Soru Kaydet" formundaki
//    "Çalışılan Konu / Test" kutusuna, görevin GÜNÜNE ve DERSİNE yazılır.
//  * Görevde SORU SAYISI varsa o ders için planın 7 günü boyunca GÜN GÜN bir soru hedefi oluşur
//    (ör. Salı 30, Cuma 20). Bu gerçek bir hedeftir; öğretmen "Öğrenci Hedefleri › Gelecek hafta planı"
//    bölümünde sayıları değiştirebilir (Aşama 53: değiştirilen sayılar sonraki aktarımlarda korunur).
//  * Soru sayısı yoksa yalnızca konu kaydı oluşur (soru hedefi değildir, hiçbir listede görünmez).
//
// Aşama 53 — senkronizasyon hatalarının kökten çözümü:
//  * Bir plan haftası + ders için TEK kayıt tutulur. Önceki sürümlerde oluşmuş çift kayıtlar silinir
//    (çift kayıt, eski günün konusunun yeni günle birlikte "2-3 günde" görünmesine yol açıyordu).
//  * Bu haftanın tarihleri yalnızca bu planın konularını taşır: tarihleri bu haftayla çakışan ESKİ plan
//    kayıtlarından bu haftanın günleri temizlenir.
//  * Plandan çıkarılan / başka güne taşınan görevlerin eski günleri her aktarımda silinir.
//  * Gönderilmiş planda görev eklenince / değişince / silinince aktarım kendiliğinden yapılır
//    (syncSentPlan) — "Planı yenile"ye basmak gerekmez.
// ============================================================================

export interface PlanTransferResult {
  subjects: string[]; // konuları / sayıları aktarılan dersler
  days: number; // konu yazılan gün sayısı (ders × gün)
  skippedSubjects: string[]; // öğretmenin yetkisi olmayan dersler
  emptySubjects: string[]; // kitap/açıklama/soru sayısı yazılmamış görevlerin dersleri
  questionSubjects: string[]; // soru hedefi oluşan / güncellenen dersler
  questionTotal: number; // aktarılan toplam soru
  manualKept: string[]; // elle verilmiş / elle değiştirilmiş hedef korunduğu için sayıları aktarılmayan dersler
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

const subjKey = (s?: string | null) => normalizeSubject(s || '').toLocaleLowerCase('tr-TR').trim();
/** Kaydın tek dersi (birden çok dersli kayıtlar plandan gelmez → null) */
const singleSubjectKey = (t: WeeklyQuestionTarget): string | null => {
  const list = targetSubjectList(t.subject);
  return list.length === 1 ? subjKey(list[0]) : null;
};
const sumOf = (m?: Record<string, number> | null) => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Anahtarları sıralı kopya (karşılaştırma için) */
const sorted = <V>(m?: Record<string, V> | null): Record<string, V> | null =>
  m && Object.keys(m).length ? Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b))) : null;

async function safeDelete(t: WeeklyQuestionTarget): Promise<void> {
  if (!t.id || !dataService.canEditQuestionTarget(t)) return;
  await dataService.deleteQuestionTargetById(t.id);
}

export async function transferPlanTopicsToQuestionEntry(opts: {
  student: Student;
  weekStart: string;
  items: PlanItem[];
  canSubject: (subject: string) => boolean;
}): Promise<PlanTransferResult> {
  const { student, weekStart, items, canSubject } = opts;
  const weekEnd = addDaysYmd(weekStart, 6);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart, i));
  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;
  const result: PlanTransferResult = {
    subjects: [],
    days: 0,
    skippedSubjects: [],
    emptySubjects: [],
    questionSubjects: [],
    questionTotal: 0,
    manualKept: [],
  };

  // ---- 1) Plan: ders → gün → konu listesi / soru sayısı (yalnızca yetkili dersler)
  const topicsBySubject = new Map<string, Map<string, string[]>>();
  const countsBySubject = new Map<string, Map<string, number>>();
  const nameOf = new Map<string, string>(); // anahtar → ders adı
  for (const it of items) {
    const subject = normalizeSubject(it.subject || '');
    if (!subject) continue;
    if (!canSubject(it.subject)) {
      if (!result.skippedSubjects.includes(subject)) result.skippedSubjects.push(subject);
      continue;
    }
    // Görevin tarihi DAİMA planın başlangıcı + gün sırası ile hesaplanır (0 = planın ilk günü)
    if (!(it.day >= 0 && it.day <= 6)) continue;
    const date = dateOfDay(weekStart, it.day);
    if (!inWeek(date)) continue;
    const key = subjKey(subject);
    nameOf.set(key, subject);
    const text = planItemTopicText(it);
    const count = cleanQuestionCount(it.questionCount);
    if (!text && !count) {
      if (!result.emptySubjects.includes(subject)) result.emptySubjects.push(subject);
      continue;
    }
    if (text) {
      const days = topicsBySubject.get(key) || new Map<string, string[]>();
      days.set(date, [...(days.get(date) || []), text]);
      topicsBySubject.set(key, days);
    }
    if (count) {
      const days = countsBySubject.get(key) || new Map<string, number>();
      days.set(date, (days.get(date) || 0) + count);
      countsBySubject.set(key, days);
    }
  }
  const planKeys = Array.from(new Set([...topicsBySubject.keys(), ...countsBySubject.keys()]));
  /** Bu kayıt üzerinde işlem yapılabilir mi (öğretmenin yetkili olduğu ders) */
  const manageable = (t: WeeklyQuestionTarget) => dataService.canEditQuestionTarget(t) && targetSubjectList(t.subject).every((s) => canSubject(s));

  // ---- 2) Bu haftanın tarihlerine denk gelen mevcut kayıtlar (sahibi kim olursa olsun)
  const records = dataService.getStudentQuestionRecordsInRange(student.id, weekStart, weekEnd);
  const planRecords = records.filter((t) => isPlanTopicRecord(t) && manageable(t));
  const myManual = records.filter((t) => !isPlanTopicRecord(t) && dataService.isMyQuestionTarget(t) && manageable(t));

  // 2a) Bu haftayla ÇAKIŞAN başka haftaların plan kayıtları: bu haftanın günleri onlardan temizlenir
  //     (aynı tarihte öğrencinin tek planı olabilir; o tarihlerin konusu artık bu plandan gelir)
  for (const t of planRecords.filter((r) => r.weekStartDate !== weekStart)) {
    const topics: Record<string, string> = { ...(t.dailyTopics || {}) };
    const targets: Record<string, number> | undefined = t.dailyTargets ? { ...t.dailyTargets } : undefined;
    let changed = false;
    for (const d of weekDates) {
      if (d in topics) {
        delete topics[d];
        changed = true;
      }
      if (targets && d in targets) {
        delete targets[d];
        changed = true;
      }
    }
    if (!changed) continue;
    const rest = sumOf(targets);
    if (!Object.keys(topics).length && rest <= 0) {
      await safeDelete(t);
      continue;
    }
    await dataService.saveQuestionTarget(
      rest > 0
        ? { ...t, dailyTopics: topics, dailyTargets: targets, targetQuestions: rest }
        : { ...t, dailyTopics: topics, dailyTargets: undefined, targetQuestions: 0, dailyTarget: 0, notes: PLAN_TOPIC_NOTE, fromPlan: true }
    );
  }

  // 2b) Bu haftanın plan kayıtları: ders başına TEK kayıt kalır, çiftler silinir
  const thisWeek = new Map<string, WeeklyQuestionTarget>();
  const duplicates: WeeklyQuestionTarget[] = [];
  const thisWeekList = planRecords
    .filter((r) => r.weekStartDate === weekStart)
    // tercih: öğretmenin sayılarını değiştirdiği kayıt › benim kaydım › diğerleri
    .sort((a, b) => Number(!!b.planCountsLocked) - Number(!!a.planCountsLocked) || Number(dataService.isMyQuestionTarget(b)) - Number(dataService.isMyQuestionTarget(a)));
  for (const r of thisWeekList) {
    const k = singleSubjectKey(r);
    if (!k) continue;
    if (thisWeek.has(k)) duplicates.push(r);
    else thisWeek.set(k, r);
  }
  for (const d of duplicates) await safeDelete(d);

  // ---- 3) Plandaki her ders
  for (const key of planKeys) {
    const subject = nameOf.get(key) || key;
    const weekTopics: Record<string, string> = {};
    for (const [date, list] of topicsBySubject.get(key) || new Map<string, string[]>()) weekTopics[date] = joinTopics(list);
    const counts = countsBySubject.get(key);
    const total = counts ? Array.from(counts.values()).reduce((a, b) => a + b, 0) : 0;
    const keeper = thisWeek.get(key);
    thisWeek.delete(key); // işlendi (kalanlar 4. adımda silinir)

    // 3a) Öğretmenin bu ders için ELLE verdiği hedef: sayılarına dokunulmaz, yalnızca bu haftanın konuları yazılır
    const manual = myManual.find((t) => sameTargetSubjects(t.subject, subject));
    // Aşama 60: öğretmenin bu haftaya GÜN GÜN verdiği birden çok dersli ya da tüm derslere ait hedef bu dersi kapsıyorsa
    // ("Soru hedefi ver" penceresinde plandaki sayılarla doldurulup kaydedilen hedef) plandaki sayılar ayrıca hedef olmaz
    // (çift sayılmasın). Plan kaydı yalnızca konuları taşır; Soru Kaydet'teki konular plandan gelmeye devam eder.
    // Aşama 64: hedef yalnızca PLANDAKİ sayılarla doldurulmuşsa (sorusu olan her günü planda da sorulu bir gün) kapsayan
    // sayılmaz: plan ders ders hedef olarak kalır (öğrencideki gün gün duvarlar ve günlük hedef bunlardan hesaplanır),
    // o kayıt ekranlarda ayrıca sayılmaz (utils/targetDays.ts › isPlanMirrorTarget). Böylece plan değişince günün hedefi de değişir.
    const mirrorsPlan = (t: WeeklyQuestionTarget) => {
      const list = targetSubjectList(t.subject);
      const days = Object.entries(t.dailyTargets || {})
        .filter(([d, n]) => inWeek(d) && (Number(n) || 0) > 0)
        .map(([d]) => d);
      if (!days.length) return false;
      return days.every((d) =>
        Array.from(countsBySubject.entries()).some(
          ([k, m]) => (m.get(d) || 0) > 0 && (!list.length || list.some((x) => sameSubjectName(x, nameOf.get(k) || k)))
        )
      );
    };
    const covering = manual
      ? undefined
      : myManual.find((t) => {
          if (!isFlexibleTarget(t) || !Object.keys(t.dailyTargets || {}).some(inWeek)) return false;
          if (t.targetType !== 'class' && mirrorsPlan(t)) return false;
          const list = targetSubjectList(t.subject);
          return list.length === 0 || list.some((x) => sameSubjectName(x, subject));
        });
    if (covering) {
      const topicOnly: WeeklyQuestionTarget = {
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
        dailyTargets: undefined,
        targetQuestions: 0,
        dailyTarget: 0,
        notes: PLAN_TOPIC_NOTE,
        planCountsLocked: false,
        ...(keeper?.id ? { id: keeper.id } : {}),
      };
      const same =
        !!keeper &&
        sameJson(sorted(keeper.dailyTopics), sorted(weekTopics)) &&
        !keeper.dailyTargets &&
        (Number(keeper.targetQuestions) || 0) === 0 &&
        (keeper.notes || '') === PLAN_TOPIC_NOTE;
      if (Object.keys(weekTopics).length) {
        if (!same) await dataService.saveQuestionTarget(topicOnly);
      } else if (keeper) await safeDelete(keeper);
      if (total > 0 && !result.manualKept.includes(subject)) result.manualKept.push(subject);
      result.subjects.push(subject);
      result.days += Object.keys(weekTopics).length;
      continue;
    }
    if (manual) {
      const merged: Record<string, string> = {};
      for (const [d, t] of Object.entries(manual.dailyTopics || {})) if (!inWeek(d)) merged[d] = t;
      Object.assign(merged, weekTopics);
      if (!sameJson(sorted(merged), sorted(manual.dailyTopics))) {
        await dataService.saveQuestionTarget({
          ...manual,
          dailyTopics: merged,
          dailyTargets: isFlexibleTarget(manual) ? manual.dailyTargets : undefined,
        });
      }
      if (keeper) await safeDelete(keeper); // aynı ders için ikinci (plan) hedefi olmasın
      if (total > 0 && !result.manualKept.includes(subject)) result.manualKept.push(subject);
      result.subjects.push(subject);
      result.days += Object.keys(weekTopics).length;
      continue;
    }

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
    let toSave: WeeklyQuestionTarget;
    if (keeper?.planCountsLocked && (Number(keeper.targetQuestions) || 0) >= 1) {
      // 3b) Öğretmen bu hedefin sayılarını elle değiştirdi: sayılar korunur, konular güncellenir
      toSave = { ...keeper, dailyTopics: weekTopics, weekStartDate: weekStart, weekEndDate: weekEnd, targetDays: 7 };
      if (total > 0 && !result.manualKept.includes(subject)) result.manualKept.push(subject);
    } else {
      // 3c) Plandaki gün gün sayılar (görev olmayan gün 0 = o derste hedef yok)
      toSave =
        total > 0
          ? {
              ...base,
              dailyTargets: Object.fromEntries(weekDates.map((d) => [d, counts?.get(d) || 0])),
              targetQuestions: total,
              dailyTarget: Math.max(1, Math.round(total / 7)),
              notes: PLAN_TARGET_NOTE,
              planCountsLocked: false,
            }
          : { ...base, dailyTargets: undefined, targetQuestions: 0, dailyTarget: 0, notes: PLAN_TOPIC_NOTE, planCountsLocked: false };
      if (keeper) toSave = { ...toSave, id: keeper.id };
    }
    // Değişiklik yoksa yazılmaz (otomatik eşitlemede gereksiz kayıt ve e-posta/bildirim oluşmasın)
    const unchanged =
      !!keeper &&
      sameJson(sorted(keeper.dailyTopics), sorted(toSave.dailyTopics)) &&
      sameJson(sorted(keeper.dailyTargets), sorted(toSave.dailyTargets)) &&
      (Number(keeper.targetQuestions) || 0) === (Number(toSave.targetQuestions) || 0) &&
      (keeper.notes || '') === (toSave.notes || '') &&
      keeper.weekStartDate === toSave.weekStartDate &&
      dataService.questionTargetEnd(keeper) === weekEnd;
    if (!unchanged) await dataService.saveQuestionTarget(toSave);
    result.subjects.push(subject);
    result.days += Object.keys(weekTopics).length;
    if (total > 0 && !(keeper?.planCountsLocked && (Number(keeper.targetQuestions) || 0) >= 1)) {
      result.questionSubjects.push(subject);
      result.questionTotal += total;
    }
  }

  // ---- 4) Plandan çıkarılan dersler: bu haftanın plan kayıtları silinir; elle verilen hedeflerdeki
  //         bu haftaya ait (plandan gelmiş) konular temizlenir
  for (const [, rec] of thisWeek) await safeDelete(rec);
  for (const m of myManual) {
    const k = singleSubjectKey(m);
    if (k && planKeys.includes(k)) continue;
    const topics = m.dailyTopics || {};
    if (!Object.keys(topics).some(inWeek)) continue;
    const kept: Record<string, string> = {};
    for (const [d, t] of Object.entries(topics)) if (!inWeek(d)) kept[d] = t;
    await dataService.saveQuestionTarget({ ...m, dailyTopics: kept, dailyTargets: isFlexibleTarget(m) ? m.dailyTargets : undefined });
  }
  return result;
}

// ----------------------------------------------------------------------------- Aşama 53: otomatik eşitleme
// Aynı öğrencinin aynı haftası için eşitlemeler sırayla yapılır (art arda yapılan düzenlemeler birbirini ezmesin).
const queues = new Map<string, Promise<unknown>>();

/**
 * Gönderilmiş planı Soru Kaydet'e yeniden aktarır (plan gönderilmemişse hiçbir şey yapmaz).
 * Planda görev eklendiğinde / değiştirildiğinde / silindiğinde kendiliğinden çağrılır.
 */
export function syncSentPlan(student: Student, weekStart: string, canSubject: (subject: string) => boolean): Promise<PlanTransferResult | null> {
  const key = `${student.id}|${weekStart}`;
  const prev = queues.get(key) || Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const p = await loadPlan(student.id, weekStart);
      if (!p.header?.sentAt) return null;
      return transferPlanTopicsToQuestionEntry({ student, weekStart, items: p.items, canSubject });
    });
  queues.set(key, run);
  run.finally(() => {
    if (queues.get(key) === run) queues.delete(key);
  }).catch(() => undefined);
  return run;
}

/**
 * Plan başka öğrencilere / haftaya uygulanıp HEMEN GÖNDERİLDİĞİNDE (ya da sonradan düzenlendiğinde)
 * görevler o öğrencilerin Soru Kaydet bölümüne de aktarılır. Hata gönderimi bozmaz; aktarılan öğrenci sayısını döndürür.
 */
export async function transferPlansForStudents(students: Student[], weekStart: string, canSubject: (subject: string) => boolean): Promise<number> {
  let ok = 0;
  for (const s of students) {
    try {
      const r = await syncSentPlan(s, weekStart, canSubject);
      if (r && r.subjects.length) ok++;
    } catch {
      /* bir öğrencide aktarılamazsa diğerleri sürer; "Planı yenile" ile tekrar aktarılabilir */
    }
  }
  return ok;
}
