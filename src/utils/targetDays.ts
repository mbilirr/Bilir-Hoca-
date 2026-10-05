import type { WeeklyQuestionTarget, StudentQuestionLog } from '../types';
import { normalizeSubject, targetSubjectMatcher } from '../lib/subjects';

// Bir soru hedefinin gün gün hesabı (Aşama 10b). Ekrandaki "Gün gün durum" tablosu ve PDF raporu aynı sonucu kullanır.

export type TargetDayStatus = 'met' | 'partial' | 'none' | 'today' | 'future';
export interface TargetDayRow {
  ymd: string;
  label: string; // "5 Eki"
  weekday: string; // "Pzt"
  solved: number;
  status: TargetDayStatus;
}
export interface TargetDaysResult {
  start: string;
  end: string;
  daily: number;
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
  const daily = Math.max(1, Number(t.dailyTarget) || Math.round(total / Math.max(1, t.targetDays || 7)) || 1);
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
      let status: TargetDayStatus;
      if (ymd > today) status = 'future';
      else if (solvedDay >= daily) status = 'met';
      else if (ymd === today) status = 'today';
      else status = solvedDay > 0 ? 'partial' : 'none';
      rows.push({ ymd, label: `${d.getDate()} ${AY[d.getMonth()]}`, weekday: GUN[d.getDay()], solved: solvedDay, status });
    }
  }
  const solved = rows.reduce((a, r) => a + r.solved, 0);
  return {
    start,
    end,
    daily,
    subject,
    rows,
    metDays: rows.filter((r) => r.status === 'met').length,
    elapsedDays: rows.filter((r) => r.status !== 'future' && r.status !== 'today').length,
    solved,
    total,
    percent: Math.min(100, Math.round((solved / total) * 100)),
  };
}

export function targetDayStatusText(r: TargetDayRow, daily: number): string {
  switch (r.status) {
    case 'met':
      return 'Hedef tamam';
    case 'partial':
      return `Eksik (${daily - r.solved} soru)`;
    case 'none':
      return 'Soru girilmedi';
    case 'today':
      return r.solved > 0 ? `Bugün · ${daily - r.solved} kaldı` : 'Bugün · henüz girilmedi';
    default:
      return 'Henüz gelmedi';
  }
}
