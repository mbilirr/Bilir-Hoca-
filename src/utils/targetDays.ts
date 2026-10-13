import type { WeeklyQuestionTarget, StudentQuestionLog } from '../types';
import { normalizeSubject, targetSubjectMatcher, targetSubjectList } from '../lib/subjects';

// Bir soru hedefinin gün gün hesabı (Aşama 10b). Ekrandaki "Gün gün durum" tablosu ve PDF raporu aynı sonucu kullanır.
// Yeni: öğretmen hedefin sorularını günlere farklı sayılarla dağıtabilir (dailyTargets). Dağıtmadıysa her gün eşittir.

export type TargetDayStatus = 'met' | 'partial' | 'none' | 'today' | 'future';
export interface TargetDayRow {
  ymd: string;
  label: string; // "5 Eki"
  weekday: string; // "Pzt"
  solved: number;
  /** O günün hedefi (gün gün dağıtılmışsa o günün sayısı, değilse günlük hedef). 0 = o gün hedef yok */
  target: number;
  status: TargetDayStatus;
}
export interface TargetDaysResult {
  start: string;
  end: string;
  daily: number; // eşit dağıtımda günlük hedef, gün gün dağıtımda günlük ortalama
  flexible: boolean; // true = öğretmen soruları günlere farklı sayılarla dağıttı
  subject: string; // '' = tüm dersler
  rows: TargetDayRow[];
  metDays: number;
  elapsedDays: number; // bugün hariç geçmiş günler + hedefi tutulmuş bugün
  solved: number;
  total: number;
  percent: number;
}

// Yerel tarih (YYYY-MM-DD); questionAnalytics'e bağımlılık olmasın diye burada
const formatDateISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

export function targetEndDate(t: WeeklyQuestionTarget): string {
  if (t.weekEndDate && /^\d{4}-\d{2}-\d{2}$/.test(t.weekEndDate)) return t.weekEndDate;
  const s0 = parseYmd(t.weekStartDate || '');
  if (!s0) return t.weekStartDate || '';
  s0.setDate(s0.getDate() + Math.max(1, t.targetDays || 7) - 1);
  return formatDateISO(s0);
}

/** Hedef gün gün farklı sayılarla mı dağıtılmış? */
export function isFlexibleTarget(t: WeeklyQuestionTarget): boolean {
  return !!t.dailyTargets && typeof t.dailyTargets === 'object' && Object.keys(t.dailyTargets).length > 0;
}

/** Günlük plandan aktarılan konu kayıtlarının not metni (lib/planToTarget.ts bu metinle kaydeder) */
export const PLAN_TOPIC_NOTE_PREFIX = 'Günlük plandan aktarılan konular';

/** Kayıt günlük plandan mı geldi? (yeni kayıtlarda fromPlan, eskilerde not metni) */
export function isPlanTopicRecord(t: WeeklyQuestionTarget | null | undefined): boolean {
  if (!t) return false;
  return !!t.fromPlan || (t.notes || '').startsWith(PLAN_TOPIC_NOTE_PREFIX);
}

/**
 * Günlük plandan "Soru Kaydet'e aktar" ile oluşan konu kaydı (soru sayısı 0). Hedef değildir:
 * öğretmen ve öğrenci ekranlarında hedef olarak gösterilmez, hesaplara katılmaz; yalnızca konuları taşır.
 *
 * Aşama 30: Önceki bir sürüm bu kayıtları "1 soru" ve "gün gün farklı dağıtıldı" olarak kaydedebildiği için
 * ekranda "Matematik soru hedefi: 1 soru" gibi sahte hedefler görünüyordu. Toplamı 1 soru ya da daha az olan
 * ve plandan geldiği (ya da konu taşıdığı, ya da günlere dağıtıldığı) anlaşılan kayıtlar da konu kaydı sayılır.
 * Gerçek bir öğretmen hedefi en az birkaç sorudur; 1 soruluk hedef pratikte verilmez.
 */
export function isPendingPlanTarget(t: WeeklyQuestionTarget | null | undefined): boolean {
  if (!t) return false;
  const total = Number(t.targetQuestions ?? t.weeklyTarget) || 0;
  if (total > 1) return false;
  if (isPlanTopicRecord(t)) return true;
  const hasTopics = !!t.dailyTopics && typeof t.dailyTopics === 'object' && Object.keys(t.dailyTopics).length > 0;
  return hasTopics || isFlexibleTarget(t) || total <= 0;
}

/** Eşit dağıtımdaki günlük hedef (gün gün dağıtımda ortalama) */
export function baseDailyTarget(t: WeeklyQuestionTarget): number {
  const total = Math.max(1, Number(t.targetQuestions || t.weeklyTarget) || 1);
  return Math.max(1, Number(t.dailyTarget) || Math.round(total / Math.max(1, t.targetDays || 7)) || 1);
}

/**
 * Hedefin verilen gündeki soru sayısı. Öğretmen günlere farklı sayılar yazdıysa o günün sayısı,
 * yazmadıysa eşit dağıtımdaki günlük hedef. Tarih hedefin aralığı dışındaysa 0.
 */
export function targetForDay(t: WeeklyQuestionTarget, ymd: string): number {
  const start = t.weekStartDate || '';
  if (!start || ymd < start || ymd > targetEndDate(t)) return 0;
  if (isFlexibleTarget(t)) {
    const v = Number((t.dailyTargets as Record<string, number>)[ymd]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  }
  return baseDailyTarget(t);
}

/**
 * Bir dersin verilen gündeki hedefi (o ders için ayrı hedef yoksa null).
 * - Hedef tek ders içinse (ör. yalnızca Matematik): o günün hedefinin tamamı.
 * - Ders dağılımı yazılmışsa (ör. Matematik 140 / toplam 350): o günün hedefinden dersin payı.
 */
export function subjectTargetForDay(t: WeeklyQuestionTarget, subject: string, ymd: string): number | null {
  const day = targetForDay(t, ymd);
  if (day <= 0) return null;
  const want = normalizeSubject(subject);
  const list = targetSubjectList(t.subject).map((s) => normalizeSubject(s));
  if (list.length === 1) return list[0] === want ? day : null;
  const st = t.subjectTargets;
  let share = 0;
  if (Array.isArray(st)) share = Number(st.find((x) => x && normalizeSubject(x.subject) === want)?.target) || 0;
  else if (st && typeof st === 'object') {
    for (const [k, v] of Object.entries(st)) if (normalizeSubject(k) === want) share = Number(v) || 0;
  }
  if (share <= 0) return null;
  const total = Math.max(1, Number(t.targetQuestions || t.weeklyTarget) || 1);
  return Math.max(1, Math.round((share * day) / total));
}

export function targetDayLabel(ymd: string): { label: string; weekday: string } {
  const d = parseYmd(ymd);
  return d ? { label: `${d.getDate()} ${AY[d.getMonth()]}`, weekday: GUN[d.getDay()] } : { label: ymd, weekday: '' };
}

export function computeTargetDays(
  t: WeeklyQuestionTarget,
  studentId: string,
  logs: StudentQuestionLog[],
  today: string = formatDateISO(new Date())
): TargetDaysResult {
  const start = t.weekStartDate || '';
  const end = targetEndDate(t);
  const total = Math.max(1, Number(t.targetQuestions || t.weeklyTarget) || 1);
  const daily = baseDailyTarget(t);
  const flexible = isFlexibleTarget(t);
  const subject = t.subject ? normalizeSubject(t.subject) : '';
  const counts = targetSubjectMatcher(t.subject);
  const perDay = new Map<string, number>();
  for (const l of logs) {
    if (l.studentId !== studentId || !l.date || l.date < start || l.date > end) continue;
    let n = 0;
    const entries = Array.isArray(l.entries) ? l.entries : [];
    if (entries.length) {
      for (const e of entries) if (counts(e.subject)) n += Number(e.questionCount) || 0;
    } else if (!subject) n = Number(l.totalQuestions) || 0;
    perDay.set(l.date, (perDay.get(l.date) || 0) + n);
  }
  const rows: TargetDayRow[] = [];
  const s0 = parseYmd(start);
  const e0 = parseYmd(end);
  if (s0 && e0 && e0 >= s0) {
    for (let d = new Date(s0); d <= e0 && rows.length < 366; d.setDate(d.getDate() + 1)) {
      const ymd = formatDateISO(d);
      const solvedDay = perDay.get(ymd) || 0;
      const dayTarget = targetForDay(t, ymd);
      let status: TargetDayStatus;
      if (ymd > today) status = 'future';
      else if (solvedDay >= dayTarget) status = 'met'; // hedefi 0 olan gün (dinlenme) de tamam sayılır
      else if (ymd === today) status = 'today';
      else status = solvedDay > 0 ? 'partial' : 'none';
      rows.push({ ymd, label: `${d.getDate()} ${AY[d.getMonth()]}`, weekday: GUN[d.getDay()], solved: solvedDay, target: dayTarget, status });
    }
  }
  const solved = rows.reduce((a, r) => a + r.solved, 0);
  return {
    start,
    end,
    daily,
    flexible,
    subject,
    rows,
    metDays: rows.filter((r) => r.status === 'met').length,
    elapsedDays: rows.filter((r) => r.status !== 'future' && r.status !== 'today').length,
    solved,
    total,
    percent: Math.min(100, Math.round((solved / total) * 100)),
  };
}

/**
 * Haftalık grafik ve birleşik günlük tablo için bir günün hedefi (öğretmen ve öğrenci ekranı aynı kuralı kullanır):
 *  1. O güne denk gelen GENEL (ders seçilmemiş) hedef varsa onun o günkü sayısı (0 = dinlenme günü, hedef yok).
 *  2. Genel hedef yoksa o güne denk gelen DERS hedeflerinin o günkü sayılarının toplamı.
 *  3. Hiçbir hedef o güne denk gelmiyorsa 0 (hedef yok). Varsayılan bir sayı UYDURULMAZ;
 *     böylece öğretmenin hedef vermediği günde grafikte hedef çizgisi/noktası görünmez.
 */
export function weekDayGoal(
  ymd: string,
  rows: Array<{ t: WeeklyQuestionTarget; res: TargetDaysResult }>
): { goal: number; generalRow: TargetDayRow | null } {
  let generalRow: TargetDayRow | null = null;
  for (const x of rows) {
    if (x.t.subject) continue;
    const r = x.res.rows.find((row) => row.ymd === ymd);
    if (r && (!generalRow || r.target > generalRow.target)) generalRow = r;
  }
  if (generalRow) return { goal: Math.max(0, generalRow.target), generalRow };
  let sum = 0;
  for (const x of rows) {
    if (!x.t.subject) continue;
    const r = x.res.rows.find((row) => row.ymd === ymd);
    if (r && r.target > 0) sum += r.target;
  }
  return { goal: sum, generalRow: null };
}

/** Grafik açıklamasındaki hedef yazısı: "Günlük hedef (50)", "Günlük hedef (güne göre değişir)" ya da "Bu hafta hedef yok" */
export function weekGoalLegendText(goals: number[]): string {
  const set = Array.from(new Set(goals.filter((g) => g > 0)));
  if (set.length === 0) return 'Bu hafta hedef verilmedi';
  if (set.length === 1 && goals.every((g) => g > 0)) return `Günlük hedef (${set[0]})`;
  return set.length === 1 ? `Günlük hedef (${set[0]}, yalnızca hedef verilen günler)` : 'Günlük hedef (güne göre değişir)';
}

export function targetDayStatusText(r: TargetDayRow, daily: number): string {
  const goal = typeof r.target === 'number' ? r.target : daily;
  if (goal <= 0 && r.status !== 'future') return r.solved > 0 ? 'Hedef yok · ekstra çalışma' : 'Bu gün hedef yok';
  switch (r.status) {
    case 'met':
      return 'Hedef tamam';
    case 'partial':
      return `Eksik (${goal - r.solved} soru)`;
    case 'none':
      return 'Soru girilmedi';
    case 'today':
      return r.solved > 0 ? `Bugün · ${goal - r.solved} kaldı` : 'Bugün · henüz girilmedi';
    default:
      return 'Henüz gelmedi';
  }
}
