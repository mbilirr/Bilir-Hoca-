import type { StudentQuestionLog, WeeklyQuestionTarget } from '../types';
import { dataService } from '../services/dataService';
import { formatDateISO, getWeekStartOf, turkishDayShortOf } from './questionAnalytics';
import { computeTargetDays, isPendingPlanTarget, isPlanMirrorTarget, weekDayGoal, type TargetDaysResult } from './targetDays';

// ============================================================================
// ÖĞRENCİ SORU ÖZETİ — TEK HESAP (Aşama 29)
//
// Öğrenci ana sayfasında soru sayısı üç yerde görünür: "Duyurular" (bugünkü hedef),
// "Durumum" (bu hafta + hedef ilerlemesi) ve Soru Takibi sayfası. Daha önce her biri
// kendi kuralıyla hesapladığı için sayılar birbirini tutmuyordu:
//   - Duyurular, günlere özel (gün gün dağıtılmış) hedefi ve hedefin dersini hesaba katmıyordu,
//   - "bugün" sayfa açıldığı anda sabitleniyordu,
//   - soru sayısı hedefin tarih aralığından bağımsız toplanıyordu.
// Artık hepsi bu dosyadaki tek fonksiyondan beslenir; Soru Takibi sayfasıyla aynı
// kuralları (computeTargetDays + weekDayGoal) kullanır.
// ============================================================================

export interface QuestionDayCount {
  ymd: string;
  label: string;
  count: number;
}

export interface ActiveTargetInfo {
  t: WeeklyQuestionTarget;
  res: TargetDaysResult;
}

export interface StudentQuestionSummary {
  todayYmd: string;
  /** Pazartesi–Pazar günlük soru sayıları (tüm dersler) */
  weekDays: QuestionDayCount[];
  /** Bu hafta çözülen toplam soru */
  week: number;
  /** Bugün çözülen toplam soru (tüm dersler) */
  today: number;
  /** Bugün için geçerli, tamamlanmamış/bitmiş tüm hedefler (bitiş tarihi yakın olan önce) */
  targets: ActiveTargetInfo[];
  /** Bugünün hedefi (0 = bugün için hedef verilmemiş) */
  todayGoal: number;
  /** Bugünün hedefine sayılan çözülmüş soru (hedefin dersiyle sınırlı) */
  todayGoalSolved: number;
  /** Bugünün hedefi hangi derslerden oluşuyor (boş = tüm dersler / genel hedef) */
  todayGoalSubjects: string[];
  /** "Durumum" kartında gösterilen ana hedef (yoksa null) */
  primary:
    | (ActiveTargetInfo & {
        teacher: string;
        subject: string;
      })
    | null;
  otherTargets: number;
}

/** Hedef tamamlandı mı? (yüzde yuvarlaması değil, gerçek sayı karşılaştırılır: 995/1000 tamam sayılmaz) */
export const isTargetDone = (res: TargetDaysResult) => res.solved >= res.total;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function buildStudentQuestionSummary(
  studentId: string,
  now: Date,
  logs: StudentQuestionLog[]
): StudentQuestionSummary {
  const todayYmd = formatDateISO(now);
  // Aşama 43: hafta, öğrencinin haftalık planının başladığı günden başlar (plan yoksa Pazartesi)
  const monday = getWeekStartOf(now, dataService.getStudentWeekStartDay(studentId));
  const mine = logs.filter((l) => l.studentId === studentId);

  // --- Günlük/haftalık toplamlar (tüm dersler) ---
  const weekDays: QuestionDayCount[] = Array.from({ length: 7 }, (_, i) => ({
    ymd: formatDateISO(addDays(monday, i)),
    label: turkishDayShortOf(addDays(monday, i)),
    count: 0,
  }));
  const index = new Map(weekDays.map((d, i) => [d.ymd, i]));
  let today = 0;
  for (const l of mine) {
    const day = (l.date || '').slice(0, 10);
    const n = Number(l.totalQuestions) || 0;
    const i = index.get(day);
    if (i !== undefined) weekDays[i].count += n;
    if (day === todayYmd) today += n;
  }
  const week = weekDays.reduce((s, d) => s + d.count, 0);

  // --- Bugün geçerli hedefler (gün gün hesap: Soru Takibi sayfasıyla aynı) ---
  const targets: ActiveTargetInfo[] = dataService
    .getQuestionTargetsForStudent(studentId, todayYmd, todayYmd)
    .filter((t) => !isPendingPlanTarget(t))
    .map((t) => ({ t, res: computeTargetDays(t, studentId, mine, todayYmd) }))
    // Bitmemiş olanlar önce, aralarında bitiş tarihi en yakın olan
    .sort((a, b) => Number(isTargetDone(a.res)) - Number(isTargetDone(b.res)) || a.res.end.localeCompare(b.res.end));

  // --- Bugünün hedefi: genel hedef varsa onun bugünkü sayısı; yoksa bugüne denk gelen ders hedeflerinin toplamı ---
  const { goal, generalRow } = weekDayGoal(todayYmd, targets);
  let todayGoalSolved = 0;
  const todayGoalSubjects: string[] = [];
  if (generalRow) {
    todayGoalSolved = generalRow.solved;
  } else {
    for (const x of targets) {
      if (!x.t.subject || isPlanMirrorTarget(x.t, targets.map((y) => y.t))) continue;
      const r = x.res.rows.find((row) => row.ymd === todayYmd);
      if (r && r.target > 0) {
        todayGoalSolved += r.solved;
        if (!todayGoalSubjects.includes(x.t.subject)) todayGoalSubjects.push(x.t.subject);
      }
    }
  }

  const top = targets[0];
  const teacher = top
    ? top.t.assignedByTeacherName || (top.t.assignedBy && top.t.assignedBy !== 'Öğretmen' ? top.t.assignedBy : '')
    : '';

  return {
    todayYmd,
    weekDays,
    week,
    today,
    targets,
    todayGoal: goal,
    todayGoalSolved,
    todayGoalSubjects,
    primary: top ? { ...top, teacher, subject: top.t.subject || 'Tüm dersler' } : null,
    otherTargets: Math.max(0, targets.length - 1),
  };
}
