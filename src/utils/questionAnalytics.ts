import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { UserOptions } from 'jspdf-autotable';
import { StudentQuestionLog, Student, ClassGroup, WeeklyQuestionTarget } from '../types';
import { PDF_FONT, registerTurkishPdfFont } from '../lib/pdfFonts';
import { computeTargetDays, targetDayStatusText, targetDayLabel } from './targetDays';
import type { TargetDayRow, TargetDayStatus } from './targetDays';
import {
  MIDDLE_SCHOOL_SUBJECTS,
  HIGH_SCHOOL_SUBJECTS,
  getStudentSchoolLevel,
  getStudentQuestionSubjects,
  detectSchoolLevelFromGrade,
} from '../constants/schoolConstants';

export {
  MIDDLE_SCHOOL_SUBJECTS,
  HIGH_SCHOOL_SUBJECTS,
  getStudentSchoolLevel,
  getStudentQuestionSubjects,
  detectSchoolLevelFromGrade,
};

export const DEFAULT_SUBJECTS = [
  'Türkçe',
  'Matematik',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'T.C. İnkılap Tarihi',
  'Türk Dili ve Edebiyatı',
  'Geometri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Din Kültürü',
  'İngilizce',
];

export const TURKISH_DAYS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
];

export const TURKISH_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export interface DayQuestionSummary {
  dateStr: string; // YYYY-MM-DD
  dayName: string; // 'Pazartesi', etc.
  dayShortName: string; // 'Pzt'
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  hasSolved: boolean;
  subjectsText: string;
  subjects: { subject: string; count: number; correct?: number; wrong?: number }[];
}

export interface WeeklyAnalytics {
  studentId: string;
  studentName: string;
  className: string;
  weekLabel: string;
  startDateStr: string;
  endDateStr: string;
  days: DayQuestionSummary[];
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  accuracyPercentage: number;
  dailyAverage: number;
  solvedDaysCount: number;
  unsolvedDays: string[]; // ["Çarşamba", "Pazar"]
  unsolvedDaysCount: number;
  subjectBreakdown: { subject: string; count: number; percentage: number }[];
  previousWeekTotal: number;
  weeklyDifference: number;
  weeklyGrowthRate: number;
  statusAssessment: {
    trend: 'up' | 'stable' | 'down';
    badgeText: string;
    badgeClass: string;
    reportSummary: string;
  };
}

export interface WeekInMonthSummary {
  weekIndex: number;
  weekLabel: string;
  startDateStr: string;
  endDateStr: string;
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  activeDaysCount: number;
  topSubject: string;
}

export interface MonthlyAnalytics {
  studentId: string;
  studentName: string;
  className: string;
  monthLabel: string;
  year: number;
  month: number;
  weeks: WeekInMonthSummary[];
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalEmpty: number;
  weeklyAverage: number;
  activeDaysCount: number;
  subjectBreakdown: { subject: string; count: number; percentage: number }[];
  previousMonthTotal: number;
  monthlyDifference: number;
  monthlyGrowthRate: number;
  statusAssessment: {
    trend: 'up' | 'stable' | 'down';
    badgeText: string;
    badgeClass: string;
    reportSummary: string;
  };
}

/**
 * Format a Date object as YYYY-MM-DD in local time
 */
export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format date in Turkish (e.g., "15 Eylül 2026")
 */
export function formatTurkishDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return `${d} ${TURKISH_MONTHS[m] || ''} ${y}`;
}

/**
 * Returns the Monday of the week for a given Date
 */
export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Computes weekly analytics for a given student and week offset (0 = current week, -1 = last week, etc.)
 */
export function computeWeeklyAnalytics(
  logs: StudentQuestionLog[],
  studentId: string,
  studentName: string,
  className: string,
  targetDate: Date = new Date()
): WeeklyAnalytics {
  const monday = getMondayOfWeek(targetDate);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(monday.getDate() - 1);

  const startDateStr = formatDateISO(monday);
  const endDateStr = formatDateISO(sunday);
  const prevStartStr = formatDateISO(prevMonday);
  const prevEndStr = formatDateISO(prevSunday);

  // Student specific logs
  const studentLogs = logs.filter((l) => l.studentId === studentId);

  // Map each day of the week
  const days: DayQuestionSummary[] = [];
  const unsolvedDays: string[] = [];
  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;
  const subjectMap = new Map<string, number>();

  for (let i = 0; i < 7; i++) {
    const curDate = new Date(monday);
    curDate.setDate(monday.getDate() + i);
    const curDateStr = formatDateISO(curDate);
    const dayName = TURKISH_DAYS[i];
    const dayShortName = TURKISH_DAYS_SHORT[i];

    // Find logs for this date
    const dayLogs = studentLogs.filter((l) => l.date === curDateStr);
    let dayTotal = 0;
    let dayCorrect = 0;
    let dayWrong = 0;
    let dayEmpty = 0;
    const daySubjects: { subject: string; count: number; correct?: number; wrong?: number }[] = [];

    dayLogs.forEach((l) => {
      dayTotal += l.totalQuestions || 0;
      dayCorrect += l.totalCorrect || 0;
      dayWrong += l.totalWrong || 0;
      dayEmpty += l.totalEmpty || 0;

      l.entries.forEach((e) => {
        if (e.questionCount > 0) {
          daySubjects.push({
            subject: e.subject,
            count: e.questionCount,
            correct: e.correctCount,
            wrong: e.wrongCount,
          });
          const curr = subjectMap.get(e.subject) || 0;
          subjectMap.set(e.subject, curr + e.questionCount);
        }
      });
    });

    totalQuestions += dayTotal;
    totalCorrect += dayCorrect;
    totalWrong += dayWrong;
    totalEmpty += dayEmpty;

    const hasSolved = dayTotal > 0;
    if (!hasSolved) {
      unsolvedDays.push(dayName);
    }

    const subjectsText = daySubjects.length > 0
      ? daySubjects.map((s) => `${s.subject}: ${s.count}`).join(', ')
      : 'Soru çözülmedi';

    days.push({
      dateStr: curDateStr,
      dayName,
      dayShortName,
      totalQuestions: dayTotal,
      totalCorrect: dayCorrect,
      totalWrong: dayWrong,
      totalEmpty: dayEmpty,
      hasSolved,
      subjectsText,
      subjects: daySubjects,
    });
  }

  // Previous week calculation
  let previousWeekTotal = 0;
  studentLogs
    .filter((l) => l.date >= prevStartStr && l.date <= prevEndStr)
    .forEach((l) => {
      previousWeekTotal += l.totalQuestions || 0;
    });

  const weeklyDifference = totalQuestions - previousWeekTotal;
  const weeklyGrowthRate = previousWeekTotal > 0
    ? Math.round(((totalQuestions - previousWeekTotal) / previousWeekTotal) * 100)
    : totalQuestions > 0 ? 100 : 0;

  const solvedDaysCount = days.filter((d) => d.hasSolved).length;
  const dailyAverage = Math.round((totalQuestions / 7) * 10) / 10;
  const accuracyPercentage = totalQuestions > 0 && (totalCorrect + totalWrong > 0)
    ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
    : 0;

  // Subject breakdown sorted by count
  const subjectBreakdown: { subject: string; count: number; percentage: number }[] = [];
  subjectMap.forEach((count, subject) => {
    subjectBreakdown.push({
      subject,
      count,
      percentage: totalQuestions > 0 ? Math.round((count / totalQuestions) * 100) : 0,
    });
  });
  subjectBreakdown.sort((a, b) => b.count - a.count);

  // Status assessment
  let trend: 'up' | 'stable' | 'down' = 'stable';
  let badgeText = 'İstikrarlı Çalışma';
  let badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  let reportSummary = '';

  if (previousWeekTotal === 0) {
    // Önceki haftada kayıt yoksa yüzde hesaplanmaz (Aşama 10b: "+%100" yanıltıcıydı)
    if (totalQuestions === 0) {
      trend = 'stable';
      badgeText = 'Kayıt Yok';
      badgeClass = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
      reportSummary = 'Bu hafta ve önceki hafta için soru kaydı bulunmuyor.';
    } else {
      trend = 'up';
      badgeText = 'Önceki haftada kayıt yok';
      badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      reportSummary = `Öğrenci bu hafta ${solvedDaysCount} gün çalışarak toplam ${totalQuestions} soru çözdü. Önceki haftada soru kaydı olmadığı için karşılaştırma yapılamıyor.`;
    }
  } else if (totalQuestions === 0) {
    trend = 'down';
    badgeText = 'Bu hafta kayıt yok';
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Bu hafta soru kaydı yok; önceki hafta ${previousWeekTotal} soru çözülmüştü. Düzenli günlük çalışmaya dönülmesi önerilir.`;
  } else if (weeklyDifference > 20 || weeklyGrowthRate >= 15) {
    trend = 'up';
    badgeText = `Yükselen Başarı (+%${weeklyGrowthRate})`;
    badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    reportSummary = `Öğrenci bu hafta önceki haftaya göre ${Math.abs(weeklyDifference)} soru (+%${weeklyGrowthRate}) daha fazla çözdü. Soru çözme temposu yükseliyor.`;
  } else if (weeklyDifference < -20 || weeklyGrowthRate <= -15) {
    trend = 'down';
    badgeText = `Hacim Düşüşü (-%${Math.abs(weeklyGrowthRate)})`;
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Öğrencinin haftalık soru sayısı önceki haftaya göre ${Math.abs(weeklyDifference)} soru (-%${Math.abs(weeklyGrowthRate)}) azaldı. Soru çözülmeyen günlerin azaltılması ve düzenli günlük çalışma önerilir.`;
  } else {
    trend = 'stable';
    badgeText = 'Dengeli & İstikrarlı Süreç';
    badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    reportSummary = `Öğrenci bu hafta önceki haftayla dengeli bir çalışma temposu sergilemiştir (Haftalık değişim: ${weeklyDifference >= 0 ? '+' : ''}${weeklyDifference} soru). Haftalık çalışma disiplini korunmakta olup başarı istikrarı devam etmektedir.`;
  }

  const weekLabel = `${formatTurkishDate(startDateStr)} - ${formatTurkishDate(endDateStr)}`;

  return {
    studentId,
    studentName,
    className,
    weekLabel,
    startDateStr,
    endDateStr,
    days,
    totalQuestions,
    totalCorrect,
    totalWrong,
    totalEmpty,
    accuracyPercentage,
    dailyAverage,
    solvedDaysCount,
    unsolvedDays,
    unsolvedDaysCount: unsolvedDays.length,
    subjectBreakdown,
    previousWeekTotal,
    weeklyDifference,
    weeklyGrowthRate,
    statusAssessment: {
      trend,
      badgeText,
      badgeClass,
      reportSummary,
    },
  };
}

/**
 * Computes monthly analytics for a given student and year/month
 */
export function computeMonthlyAnalytics(
  logs: StudentQuestionLog[],
  studentId: string,
  studentName: string,
  className: string,
  year: number,
  month: number // 0-11
): MonthlyAnalytics {
  const monthName = TURKISH_MONTHS[month];
  const monthLabel = `${monthName} ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Previous month calculation
  const prevMonthDate = new Date(year, month - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();
  const prevDaysInMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const prevMonthStartStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
  const prevMonthEndStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDaysInMonth).padStart(2, '0')}`;

  const studentLogs = logs.filter((l) => l.studentId === studentId);

  // Divide month into roughly 4-5 weekly periods
  const weeks: WeekInMonthSummary[] = [];
  const weekRanges = [
    { index: 1, start: 1, end: 7, label: '1. Hafta (1-7 ' + monthName + ')' },
    { index: 2, start: 8, end: 14, label: '2. Hafta (8-14 ' + monthName + ')' },
    { index: 3, start: 15, end: 21, label: '3. Hafta (15-21 ' + monthName + ')' },
    { index: 4, start: 22, end: 28, label: '4. Hafta (22-28 ' + monthName + ')' },
  ];

  if (daysInMonth > 28) {
    weekRanges.push({
      index: 5,
      start: 29,
      end: daysInMonth,
      label: `5. Hafta (29-${daysInMonth} ${monthName})`,
    });
  }

  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalEmpty = 0;
  const activeDatesSet = new Set<string>();
  const subjectMap = new Map<string, number>();

  weekRanges.forEach((range) => {
    const sStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(range.start).padStart(2, '0')}`;
    const eStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(range.end).padStart(2, '0')}`;

    const rangeLogs = studentLogs.filter((l) => l.date >= sStr && l.date <= eStr);
    let wTotal = 0;
    let wCorrect = 0;
    let wWrong = 0;
    const wActiveDays = new Set<string>();
    const wSubjectMap = new Map<string, number>();

    rangeLogs.forEach((l) => {
      wTotal += l.totalQuestions || 0;
      wCorrect += l.totalCorrect || 0;
      wWrong += l.totalWrong || 0;
      totalEmpty += l.totalEmpty || 0;
      if (l.totalQuestions > 0) {
        wActiveDays.add(l.date);
        activeDatesSet.add(l.date);
      }

      l.entries.forEach((e) => {
        if (e.questionCount > 0) {
          const wCurr = wSubjectMap.get(e.subject) || 0;
          wSubjectMap.set(e.subject, wCurr + e.questionCount);
          const mCurr = subjectMap.get(e.subject) || 0;
          subjectMap.set(e.subject, mCurr + e.questionCount);
        }
      });
    });

    totalQuestions += wTotal;
    totalCorrect += wCorrect;
    totalWrong += wWrong;

    let topSubject = '—';
    let topSubjectCount = 0;
    wSubjectMap.forEach((c, sub) => {
      if (c > topSubjectCount) {
        topSubjectCount = c;
        topSubject = sub;
      }
    });

    weeks.push({
      weekIndex: range.index,
      weekLabel: range.label,
      startDateStr: sStr,
      endDateStr: eStr,
      totalQuestions: wTotal,
      totalCorrect: wCorrect,
      totalWrong: wWrong,
      activeDaysCount: wActiveDays.size,
      topSubject,
    });
  });

  // Previous month total
  let previousMonthTotal = 0;
  studentLogs
    .filter((l) => l.date >= prevMonthStartStr && l.date <= prevMonthEndStr)
    .forEach((l) => {
      previousMonthTotal += l.totalQuestions || 0;
    });

  const monthlyDifference = totalQuestions - previousMonthTotal;
  const monthlyGrowthRate = previousMonthTotal > 0
    ? Math.round(((totalQuestions - previousMonthTotal) / previousMonthTotal) * 100)
    : totalQuestions > 0 ? 100 : 0;

  const weeklyAverage = weeks.length > 0 ? Math.round(totalQuestions / weeks.length) : 0;

  // Subject breakdown sorted
  const subjectBreakdown: { subject: string; count: number; percentage: number }[] = [];
  subjectMap.forEach((count, subject) => {
    subjectBreakdown.push({
      subject,
      count,
      percentage: totalQuestions > 0 ? Math.round((count / totalQuestions) * 100) : 0,
    });
  });
  subjectBreakdown.sort((a, b) => b.count - a.count);

  let trend: 'up' | 'stable' | 'down' = 'stable';
  let badgeText = 'İstikrarlı Aylık Performans';
  let badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  let reportSummary = '';

  if (previousMonthTotal === 0) {
    if (totalQuestions === 0) {
      trend = 'stable';
      badgeText = 'Kayıt Yok';
      badgeClass = 'bg-slate-500/15 text-slate-300 border-slate-500/30';
      reportSummary = 'Bu ay ve önceki ay için soru kaydı bulunmuyor.';
    } else {
      trend = 'up';
      badgeText = 'Önceki ayda kayıt yok';
      badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      reportSummary = `Öğrenci bu ay ${activeDatesSet.size} gün çalışarak toplam ${totalQuestions} soru çözdü. Önceki ayda soru kaydı olmadığı için karşılaştırma yapılamıyor.`;
    }
  } else if (totalQuestions === 0) {
    trend = 'down';
    badgeText = 'Bu ay kayıt yok';
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Bu ay soru kaydı yok; önceki ay ${previousMonthTotal} soru çözülmüştü.`;
  } else if (monthlyDifference > 80 || monthlyGrowthRate >= 15) {
    trend = 'up';
    badgeText = `Aylık Artış (+%${monthlyGrowthRate})`;
    badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    reportSummary = `Öğrenci bu ay önceki aya göre ${Math.abs(monthlyDifference)} soru (+%${monthlyGrowthRate}) daha fazla çözdü. Soru çözme temposu yükseliyor.`;
  } else if (monthlyDifference < -80 || monthlyGrowthRate <= -15) {
    trend = 'down';
    badgeText = `Aylık Düşüş (-%${Math.abs(monthlyGrowthRate)})`;
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Öğrencinin aylık soru sayısı önceki aya göre ${Math.abs(monthlyDifference)} soru (-%${Math.abs(monthlyGrowthRate)}) azaldı. Haftalık çalışma planının gözden geçirilmesi önerilir.`;
  } else {
    trend = 'stable';
    badgeText = 'Dengeli & İstikrarlı Süreç';
    badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    reportSummary = `Öğrencinin aylık soru çözme performansı önceki ay ile dengeli ve istikrarlı düzeydedir (Aylık fark: ${monthlyDifference >= 0 ? '+' : ''}${monthlyDifference} soru). Düzenli test çözme disiplini korunmaktadır.`;
  }

  return {
    studentId,
    studentName,
    className,
    monthLabel,
    year,
    month,
    weeks,
    totalQuestions,
    totalCorrect,
    totalWrong,
    totalEmpty,
    weeklyAverage,
    activeDaysCount: activeDatesSet.size,
    subjectBreakdown,
    previousMonthTotal,
    monthlyDifference,
    monthlyGrowthRate,
    statusAssessment: {
      trend,
      badgeText,
      badgeClass,
      reportSummary,
    },
  };
}

/**
 * Yedek: Türkçe yazı tipi PDF'e gömülemezse (registerTurkishPdfFont false dönerse) metni
 * standart Helvetica'nın basabileceği ASCII karakterlere çevirir. Normalde kullanılmaz.
 */
export function sanitizeForPdf(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/â/g, 'a')
    .replace(/Â/g, 'A')
    .replace(/î/g, 'i')
    .replace(/Î/g, 'I')
    .replace(/û/g, 'u')
    .replace(/Û/g, 'U')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7E\n\r]/g, '')
    .trim();
}

// ============================================================================
// PDF RAPORLARI (Aşama 10b)
// Türkçe yazı tipi gömülür (lib/pdfFonts); yüklenemezse Helvetica + sanitizeForPdf kullanılır.
// Öğretmen hedefleri utils/targetDays ile ekrandakiyle aynı şekilde hesaplanır.
// ============================================================================

type RGB = [number, number, number];
const PDF_INK: RGB = [17, 24, 39];
const PDF_TEXT: RGB = [55, 65, 81];
const PDF_MUTED: RGB = [107, 114, 128];
const PDF_LINE: RGB = [209, 213, 219];
const PDF_SOFT: RGB = [243, 244, 246];
const PDF_ACCENT: RGB = [67, 56, 202];
const PDF_ACCENT_SOFT: RGB = [238, 242, 255];
const PDF_OK: RGB = [21, 128, 61];
const PDF_WARN: RGB = [180, 83, 9];
const PDF_BAD: RGB = [185, 28, 28];

// Gömülü yazı tipinde bulunan karakterler dışındakiler (emoji, ✓, ★ vb.) PDF'te kutu olarak çıkmasın diye atılır
const PDF_UNSUPPORTED_CHARS =
  /[^\n\x20-\x7E -ſ–—‘’“”•…←→−≤≥]/g;

export function cleanForPdfFont(str: unknown): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(PDF_UNSUPPORTED_CHARS, '')
    .replace(/[  ]{2,}/g, ' ')
    .trim();
}

interface PdfKit {
  doc: jsPDF;
  F: string;
  t: (s: unknown) => string;
  pageW: number;
  pageH: number;
  M: number;
  W: number;
  y: number;
  top: number;
  bottom: number;
}

function createPdfKit(): PdfKit {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fontOk = registerTurkishPdfFont(doc);
  const F = fontOk ? PDF_FONT : 'helvetica';
  doc.setFont(F, 'normal');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;
  return {
    doc,
    F,
    t: fontOk ? cleanForPdfFont : (s: unknown) => sanitizeForPdf(s === undefined || s === null ? '' : String(s)),
    pageW,
    pageH,
    M,
    W: pageW - M * 2,
    y: M,
    top: 18,
    bottom: pageH - 16,
  };
}

function pdfFont(k: PdfKit, style: 'normal' | 'bold', size: number, color: RGB = PDF_TEXT) {
  k.doc.setFont(k.F, style);
  k.doc.setFontSize(size);
  k.doc.setTextColor(color[0], color[1], color[2]);
}

function ensureSpace(k: PdfKit, h: number) {
  if (k.y + h > k.bottom) {
    k.doc.addPage();
    k.y = k.top;
  }
}

function sectionTitle(k: PdfKit, text: string, minFollow = 22) {
  ensureSpace(k, 9 + minFollow);
  pdfFont(k, 'bold', 10.5, PDF_INK);
  k.doc.text(k.t(text), k.M, k.y + 4);
  k.doc.setFillColor(...PDF_ACCENT);
  k.doc.rect(k.M, k.y + 5.6, 12, 0.7, 'F');
  k.y += 9;
}

function paragraph(
  k: PdfKit,
  text: string,
  opts: { size?: number; color?: RGB; bold?: boolean; gap?: number; indent?: number } = {}
) {
  const size = opts.size ?? 8.5;
  const indent = opts.indent ?? 0;
  const lineH = size * 0.3528 * 1.4;
  pdfFont(k, opts.bold ? 'bold' : 'normal', size, opts.color ?? PDF_TEXT);
  const lines: string[] = k.doc.splitTextToSize(k.t(text), k.W - indent);
  for (const ln of lines) {
    ensureSpace(k, lineH);
    k.doc.text(ln, k.M + indent, k.y + lineH * 0.75);
    k.y += lineH;
  }
  k.y += opts.gap ?? 1.5;
}

function pdfTable(k: PdfKit, opts: UserOptions, gapAfter = 5) {
  autoTable(k.doc, {
    startY: k.y,
    margin: { left: k.M, right: k.M, top: k.top, bottom: k.pageH - k.bottom },
    theme: 'grid',
    ...opts,
    styles: {
      font: k.F,
      fontSize: 7.8,
      cellPadding: 1.5,
      textColor: PDF_TEXT,
      lineColor: PDF_LINE,
      lineWidth: 0.15,
      valign: 'middle',
      ...(opts.styles || {}),
    },
    headStyles: {
      font: k.F,
      fillColor: PDF_ACCENT_SOFT,
      textColor: PDF_INK,
      fontStyle: 'bold',
      ...(opts.headStyles || {}),
    },
  });
  k.y = ((k.doc as any).lastAutoTable?.finalY ?? k.y) + gapAfter;
}

const nowTr = () => {
  const d = new Date();
  return {
    date: d.toLocaleDateString('tr-TR'),
    dateTime: `${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
  };
};

const parseYmdLocal = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

// "28 Eylül – 4 Ekim 2026", "1 – 7 Mayıs 2026"
function formatTurkishRange(a: string, b: string): string {
  const pa = parseYmdLocal(a);
  const pb = parseYmdLocal(b);
  if (!pa || !pb) return `${a || ''} – ${b || ''}`;
  if (pa.y !== pb.y) return `${formatTurkishDate(a)} – ${formatTurkishDate(b)}`;
  if (pa.m === pb.m) return pa.d === pb.d ? formatTurkishDate(a) : `${pa.d} – ${pb.d} ${TURKISH_MONTHS[pb.m]} ${pb.y}`;
  return `${pa.d} ${TURKISH_MONTHS[pa.m]} – ${pb.d} ${TURKISH_MONTHS[pb.m]} ${pb.y}`;
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const accuracyOf = (correct: number, wrong: number) =>
  correct + wrong > 0 ? `%${Math.round((correct / (correct + wrong)) * 100)}` : '–';
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

interface PdfSubjectStat {
  subject: string;
  count: number;
  correct: number;
  wrong: number;
  empty: number;
  topics: string[];
}

// Dönemdeki ders bazlı doğru/yanlış/boş, çalışılan konular ve öğrenci notları
function collectPeriodDetails(
  logs: StudentQuestionLog[] | undefined,
  studentId: string,
  start: string,
  end: string
): { subjects: PdfSubjectStat[]; notes: { date: string; text: string }[] } | null {
  if (!logs) return null;
  const map = new Map<string, PdfSubjectStat>();
  const topicKeys = new Map<string, Set<string>>();
  const notes: { date: string; text: string }[] = [];
  const own = logs
    .filter((l) => l.studentId === studentId && l.date >= start && l.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const l of own) {
    for (const e of Array.isArray(l.entries) ? l.entries : []) {
      const q = Number(e.questionCount) || 0;
      if (q <= 0) continue;
      const key = e.subject || 'Diğer';
      let s = map.get(key);
      if (!s) {
        s = { subject: key, count: 0, correct: 0, wrong: 0, empty: 0, topics: [] };
        map.set(key, s);
        topicKeys.set(key, new Set());
      }
      const c = Number(e.correctCount) || 0;
      const w = Number(e.wrongCount) || 0;
      s.count += q;
      s.correct += c;
      s.wrong += w;
      s.empty += e.emptyCount !== undefined && e.emptyCount !== null ? Number(e.emptyCount) || 0 : c || w ? Math.max(0, q - c - w) : 0;
      const topic = String(e.topic || '').replace(/\s+/g, ' ').trim();
      if (topic) {
        const tk = topic.toLocaleLowerCase('tr');
        const seen = topicKeys.get(key)!;
        if (!seen.has(tk)) {
          seen.add(tk);
          s.topics.push(topic);
        }
      }
    }
    const note = String(l.notes || '').replace(/\s+/g, ' ').trim();
    if (note) notes.push({ date: l.date, text: note });
  }
  return { subjects: [...map.values()].sort((a, b) => b.count - a.count), notes };
}

function topicsText(topics: string[]): string {
  if (!topics.length) return '–';
  const shown = topics.slice(0, 5).map((x) => truncate(x, 32));
  return shown.join(', ') + (topics.length > 5 ? ` (+${topics.length - 5} konu)` : '');
}

function drawReportHeader(k: PdfKit, title: string, generatedAt: string) {
  const { doc } = k;
  doc.setFillColor(...PDF_ACCENT);
  doc.rect(0, 0, k.pageW, 2.5, 'F');
  pdfFont(k, 'bold', 16, PDF_INK);
  doc.text(k.t(title), k.M, 14.5);
  pdfFont(k, 'normal', 8, PDF_MUTED);
  doc.text(k.t(`Oluşturulma: ${generatedAt}`), k.pageW - k.M, 14.5, { align: 'right' });
  doc.setDrawColor(...PDF_LINE);
  doc.setLineWidth(0.3);
  doc.line(k.M, 18.5, k.pageW - k.M, 18.5);
  k.y = 21.5;
}

function drawInfoRow(k: PdfKit, items: [string, string][], widths: number[]) {
  let x = k.M;
  items.forEach(([label, value], i) => {
    pdfFont(k, 'normal', 7.2, PDF_MUTED);
    k.doc.text(k.t(label), x, k.y + 3);
    pdfFont(k, 'bold', 9.5, PDF_INK);
    const v = (k.doc.splitTextToSize(k.t(value || '–'), widths[i] - 3) as string[])[0] || '–';
    k.doc.text(v, x, k.y + 8);
    x += widths[i];
  });
  k.y += 13;
}

function drawKpiTiles(k: PdfKit, tiles: { label: string; value: string }[]) {
  const gap = 2.5;
  const n = tiles.length;
  const w = (k.W - gap * (n - 1)) / n;
  const h = 14.5;
  tiles.forEach((tile, i) => {
    const x = k.M + i * (w + gap);
    k.doc.setFillColor(...PDF_SOFT);
    k.doc.roundedRect(x, k.y, w, h, 1.5, 1.5, 'F');
    pdfFont(k, 'bold', 13, PDF_INK);
    k.doc.text(k.t(tile.value), x + 3, k.y + 7);
    pdfFont(k, 'normal', 7.2, PDF_MUTED);
    k.doc.text(k.t(tile.label), x + 3, k.y + 11.8);
  });
  k.y += h + 3.5;
}

function drawNoticeBox(k: PdfKit, title: string, text: string) {
  pdfFont(k, 'normal', 8.5, PDF_TEXT);
  const lines: string[] = k.doc.splitTextToSize(k.t(text), k.W - 10);
  const h = 11 + lines.length * 4.2;
  ensureSpace(k, h);
  k.doc.setFillColor(...PDF_ACCENT_SOFT);
  k.doc.roundedRect(k.M, k.y, k.W, h, 2, 2, 'F');
  k.doc.setFillColor(...PDF_ACCENT);
  k.doc.rect(k.M, k.y, 1.2, h, 'F');
  pdfFont(k, 'bold', 11, PDF_INK);
  k.doc.text(k.t(title), k.M + 5, k.y + 7);
  pdfFont(k, 'normal', 8.5, PDF_TEXT);
  k.doc.text(lines, k.M + 5, k.y + 12.5);
  k.y += h + 5;
}

function drawChartImage(k: PdfKit, img: string, ratio: number) {
  if (!img) return;
  const h = k.W * ratio;
  ensureSpace(k, h + 2);
  try {
    k.doc.addImage(img, 'PNG', k.M, k.y, k.W, h, undefined, 'FAST');
    k.y += h + 4;
  } catch (e) {
    console.warn('[PDF] Grafik eklenemedi:', e);
  }
}

function drawSubjectTable(k: PdfKit, subjects: PdfSubjectStat[], total: number) {
  sectionTitle(k, 'Ders Dağılımı', Math.min(subjects.length, 8) * 5.6 + 7);
  pdfTable(k, {
    head: [['Ders', 'Soru', 'D', 'Y', 'B', 'Doğruluk', 'Pay', 'Çalışılan konular'].map(k.t)],
    body: subjects.map((s) =>
      [
        s.subject,
        String(s.count),
        String(s.correct),
        String(s.wrong),
        String(s.empty),
        accuracyOf(s.correct, s.wrong),
        total > 0 ? `%${Math.round((s.count / total) * 100)}` : '–',
        topicsText(s.topics),
      ].map(k.t)
    ),
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold', textColor: PDF_INK },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 11, halign: 'center' },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 11, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 'auto' },
    },
  });
}

function drawStudentNotes(k: PdfKit, notes: { date: string; text: string }[], max: number) {
  if (!notes.length) return;
  sectionTitle(k, 'Öğrenci Notları', 10);
  const shown = notes.slice(0, max);
  pdfTable(k, {
    body: shown.map((n) => {
      const lbl = targetDayLabel(n.date);
      return [`${lbl.weekday} ${lbl.label}`, truncate(n.text, 300)].map(k.t);
    }),
    columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold', textColor: PDF_INK }, 1: { cellWidth: 'auto' } },
  }, notes.length > max ? 1.5 : 5);
  if (notes.length > max) paragraph(k, `(${notes.length - max} not daha var; uygulamadan görüntülenebilir.)`, { size: 7.2, color: PDF_MUTED, gap: 3 });
}

const STATUS_COLOR: Record<TargetDayStatus, RGB> = {
  met: PDF_OK,
  partial: PDF_WARN,
  none: PDF_BAD,
  today: PDF_MUTED,
  future: PDF_MUTED,
};

function subjectTargetsText(st: WeeklyQuestionTarget['subjectTargets']): string {
  if (!st) return '';
  const pairs: [string, number][] = Array.isArray(st)
    ? st.map((x) => [x.subject, Number(x.target) || 0] as [string, number])
    : Object.entries(st).map(([s, v]) => [s, Number(v) || 0] as [string, number]);
  return pairs
    .filter(([s, v]) => s && v > 0)
    .map(([s, v]) => `${s} ${v}`)
    .join(', ');
}

function drawTargetsSection(
  k: PdfKit,
  targets: WeeklyQuestionTarget[],
  studentId: string,
  logs: StudentQuestionLog[],
  emptyText: string
) {
  sectionTitle(k, 'Soru Hedefleri', targets.length ? 40 : 8);
  if (!targets.length) {
    paragraph(k, emptyText, { size: 8.5, color: PDF_TEXT, gap: 4 });
    return;
  }
  targets.forEach((tg, idx) => {
    const res = computeTargetDays(tg, studentId, logs);
    const subjectLabel = tg.subject || 'Tüm dersler';
    const teacher = tg.assignedByTeacherName || tg.assignedBy || 'Belirtilmemiş';
    const isClass = tg.targetType === 'class';
    const kind = isClass ? `Sınıf hedefi${tg.className ? ` (${tg.className})` : ''}` : 'Öğrenciye özel hedef';
    const result = res.elapsedDays
      ? `${res.metDays}/${res.elapsedDays} günde hedef tuttu${res.rows.some((r) => r.status === 'today') ? ' (bugün devam ediyor)' : ''}`
      : 'Henüz geçen gün yok';

    ensureSpace(k, 40);
    pdfFont(k, 'bold', 9.2, PDF_INK);
    k.doc.text(k.t(`${idx + 1}. ${subjectLabel} hedefi`), k.M, k.y + 3.5);
    const titleW = k.doc.getTextWidth(k.t(`${idx + 1}. ${subjectLabel} hedefi`));
    pdfFont(k, 'normal', 7.8, PDF_MUTED);
    k.doc.text(k.t(`· ${kind}`), k.M + titleW + 2, k.y + 3.5);
    pdfFont(k, 'bold', 8.5, res.elapsedDays && res.metDays === res.elapsedDays ? PDF_OK : PDF_INK);
    k.doc.text(k.t(result), k.pageW - k.M, k.y + 3.5, { align: 'right' });
    k.y += 5.5;

    const span3 = (content: string) => ({ content: k.t(content), colSpan: 3 });
    const body: any[] = [
      ['Veren öğretmen', teacher, 'Ders', subjectLabel].map(k.t),
      ['Tarih aralığı', `${formatTurkishRange(res.start, res.end)} (${res.rows.length} gün)`, 'Günlük hedef', `${res.daily} soru`].map(k.t),
      ['Toplam hedef', `${res.total} soru`, 'Çözülen', `${res.solved} soru (%${res.percent})`].map(k.t),
    ];
    const st = subjectTargetsText(tg.subjectTargets);
    if (st) body.push([k.t('Ders hedefleri'), span3(st)]);
    const note = String(tg.notes || '').replace(/\s+/g, ' ').trim();
    if (note) body.push([k.t('Öğretmen notu'), span3(truncate(note, 400))]);
    pdfTable(
      k,
      {
        body,
        styles: { fontSize: 7.8, cellPadding: 1.3 },
        columnStyles: {
          0: { cellWidth: 27, fillColor: PDF_SOFT, fontStyle: 'bold', textColor: PDF_INK },
          1: { cellWidth: 64 },
          2: { cellWidth: 27, fillColor: PDF_SOFT, fontStyle: 'bold', textColor: PDF_INK },
          3: { cellWidth: 64 },
        },
      },
      2
    );

    // Gün gün tablo: 4 satırdan uzunsa iki sütun grubu yan yana (yer kazanmak için)
    const rows = res.rows;
    if (rows.length) {
      const cells = (r: TargetDayRow) => [`${r.weekday} ${r.label}`, String(r.solved), String(res.daily), targetDayStatusText(r, res.daily)];
      const split = rows.length > 4;
      const half = Math.ceil(rows.length / 2);
      const left = split ? rows.slice(0, half) : rows;
      const right = split ? rows.slice(half) : [];
      const H = ['Gün', 'Çözülen', 'Hedef', 'Durum'];
      const body2 = left.map((r, i) =>
        [...cells(r), ...(split ? (right[i] ? cells(right[i]) : ['', '', '', '']) : [])].map(k.t)
      );
      const colsOne = {
        0: { cellWidth: 22 },
        1: { cellWidth: 14, halign: 'center' as const },
        2: { cellWidth: 12, halign: 'center' as const },
        3: { cellWidth: 43 },
      };
      pdfTable(
        k,
        {
          head: [(split ? [...H, ...H] : H).map(k.t)],
          body: body2,
          tableWidth: split ? k.W : 91,
          styles: { fontSize: 7.3, cellPadding: 1.1 },
          headStyles: { fillColor: PDF_SOFT, fontSize: 7.3 },
          columnStyles: split
            ? { ...colsOne, 4: colsOne[0], 5: colsOne[1], 6: colsOne[2], 7: colsOne[3] }
            : colsOne,
          didParseCell: (data) => {
            if (data.section !== 'body') return;
            const ci = data.column.index;
            if (split && ci === 4) data.cell.styles.lineWidth = { left: 0.5, top: 0.15, right: 0.15, bottom: 0.15 };
            if (ci % 4 !== 3) return;
            const r = ci < 4 ? left[data.row.index] : right[data.row.index];
            if (!r) return;
            data.cell.styles.textColor = STATUS_COLOR[r.status];
            if (r.status === 'met') data.cell.styles.fontStyle = 'bold';
          },
        },
        5
      );
    }
  });
}

function drawSignatures(k: PdfKit) {
  ensureSpace(k, 22);
  k.y += 2;
  const gap = 14;
  const colW = (k.W - gap) / 2;
  ['Öğretmen İmza', 'Veli İmza'].forEach((title, i) => {
    const x = k.M + i * (colW + gap);
    pdfFont(k, 'bold', 9, PDF_INK);
    k.doc.text(k.t(title), x, k.y + 4);
    k.doc.setDrawColor(...PDF_MUTED);
    k.doc.setLineWidth(0.3);
    k.doc.line(x, k.y + 14, x + colW, k.y + 14);
    pdfFont(k, 'normal', 7, PDF_MUTED);
    k.doc.text(k.t('Ad Soyad / İmza / Tarih'), x, k.y + 17.5);
  });
  k.y += 20;
}

// Tüm sayfalara üst bilgi (2. sayfadan itibaren) ve alt bilgi (Sayfa N / M, rapor tarihi)
function drawPageFrames(k: PdfKit, runningHeader: string, footerLeft: string, reportDate: string) {
  const { doc } = k;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.2);
    if (i > 1) {
      pdfFont(k, 'normal', 7.5, PDF_MUTED);
      doc.text((doc.splitTextToSize(k.t(runningHeader), k.W) as string[])[0] || '', k.M, 10);
      doc.line(k.M, 12, k.pageW - k.M, 12);
    }
    doc.line(k.M, k.pageH - 11, k.pageW - k.M, k.pageH - 11);
    pdfFont(k, 'normal', 7.2, PDF_MUTED);
    doc.text((doc.splitTextToSize(k.t(footerLeft), k.W - 62) as string[])[0] || '', k.M, k.pageH - 7);
    doc.text(k.t(`Rapor tarihi: ${reportDate} · Sayfa ${i} / ${n}`), k.pageW - k.M, k.pageH - 7, { align: 'right' });
  }
}

const CHART_W = 1600;
const CHART_H = 560;
const CHART_RATIO = CHART_H / CHART_W;
const CHART_ACCENT = '#4338ca';
const CHART_TARGET = '#b45309';
const chartFont = (weight: string, px: number) => `${weight} ${px}px Arial, "Liberation Sans", "Helvetica Neue", "Segoe UI", sans-serif`;

function niceAxis(maxVal: number) {
  const raw = Math.max(1, maxVal) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) || 10) * mag;
  return { step, maxY: step * Math.ceil(maxVal / step) };
}

interface ChartBar {
  value: number;
  label: string;
  sub: string;
  sub2?: string;
}

function drawBarChart(bars: ChartBar[], opts: { legend: string; target?: (number | null)[]; targetLegend?: string }): string {
  const canvas = document.createElement('canvas');
  canvas.width = CHART_W;
  canvas.height = CHART_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CHART_W, CHART_H);

  const left = 90;
  const right = CHART_W - 20;
  const top = 78;
  const bottom = CHART_H - (bars.some((b) => b.sub2) ? 112 : 84);
  const plotH = bottom - top;
  const targets = opts.target || [];
  const hasTarget = targets.some((v) => v !== null && v !== undefined && v > 0);
  const maxVal = Math.max(10, ...bars.map((b) => b.value), ...targets.map((v) => v || 0)) * 1.12;
  const { step, maxY } = niceAxis(maxVal);
  const yOf = (v: number) => bottom - (v / maxY) * plotH;

  // Lejant
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = chartFont('600', 24);
  ctx.fillStyle = CHART_ACCENT;
  ctx.fillRect(left, 24, 26, 26);
  ctx.fillStyle = '#374151';
  ctx.fillText(opts.legend, left + 38, 38);
  if (hasTarget) {
    const lx = left + 60 + ctx.measureText(opts.legend).width;
    ctx.strokeStyle = CHART_TARGET;
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(lx, 38);
    ctx.lineTo(lx + 50, 38);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#374151';
    ctx.fillText(opts.targetLegend || 'Günlük hedef', lx + 62, 38);
  }

  // Izgara ve eksen
  ctx.textAlign = 'right';
  ctx.font = chartFont('400', 22);
  for (let v = 0; v <= maxY + 0.001; v += step) {
    const y = yOf(v);
    ctx.strokeStyle = v === 0 ? '#9ca3af' : '#e5e7eb';
    ctx.lineWidth = v === 0 ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = '#6b7280';
    ctx.fillText(String(Math.round(v * 10) / 10), left - 14, y);
  }

  const slot = (right - left) / Math.max(1, bars.length);
  const barW = Math.min(slot * 0.58, 170);
  bars.forEach((b, i) => {
    const cx = left + slot * i + slot / 2;
    const x = cx - barW / 2;
    if (b.value > 0) {
      const y = yOf(b.value);
      const h = Math.max(bottom - y, 3);
      ctx.fillStyle = CHART_ACCENT;
      ctx.beginPath();
      ctx.roundRect(x, bottom - h, barW, h, [8, 8, 0, 0]);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = chartFont('700', 25);
    ctx.fillStyle = b.value > 0 ? '#111827' : '#9ca3af';
    ctx.fillText(String(b.value), cx, yOf(b.value) - 10);
    ctx.font = chartFont('700', 24);
    ctx.fillStyle = '#111827';
    ctx.fillText(b.label, cx, bottom + 34);
    ctx.font = chartFont('400', 22);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(b.sub, cx, bottom + 62);
    if (b.sub2) ctx.fillText(b.sub2, cx, bottom + 90);
  });

  // Günlük hedef çizgisi (genel hedefin kapsadığı günler)
  if (hasTarget) {
    ctx.strokeStyle = CHART_TARGET;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    targets.forEach((v, i) => {
      if (!v || v <= 0) return;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(left + slot * i + 4, y);
      ctx.lineTo(left + slot * (i + 1) - 4, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Haftalık grafik (PDF için). Oran 1600x560; PDF'te en-boy oranı korunarak yerleştirilir.
 * dailyTargets: her gün için genel hedefin günlük sayısı (yoksa null) — kesikli çizgi olarak çizilir.
 */
export function generateWeeklyChartCanvas(analytics: WeeklyAnalytics, dailyTargets?: (number | null)[]): string {
  const bars: ChartBar[] = analytics.days.map((d) => {
    const lbl = targetDayLabel(d.dateStr);
    const answered = d.totalCorrect + d.totalWrong;
    return {
      value: d.totalQuestions,
      label: d.dayName,
      sub: lbl.label,
      sub2: answered > 0 ? `%${Math.round((d.totalCorrect / answered) * 100)} doğru` : '',
    };
  });
  const vals = (dailyTargets || []).filter((v): v is number => !!v && v > 0);
  const same = vals.length > 0 && vals.every((v) => v === vals[0]);
  return drawBarChart(bars, {
    legend: 'Çözülen soru',
    target: dailyTargets,
    targetLegend: same ? `Günlük hedef (${vals[0]} soru)` : 'Günlük hedef',
  });
}

/**
 * Aylık grafik (PDF için): ayın haftalarına göre çözülen soru.
 */
export function generateMonthlyChartCanvas(analytics: MonthlyAnalytics): string {
  const bars: ChartBar[] = analytics.weeks.map((w) => {
    const a = parseYmdLocal(w.startDateStr);
    const b = parseYmdLocal(w.endDateStr);
    const range = a && b ? `${a.d}–${b.d} ${TURKISH_MONTHS[b.m]}` : '';
    return {
      value: w.totalQuestions,
      label: `${w.weekIndex}. Hafta`,
      sub: range,
      sub2: `${w.activeDaysCount} gün aktif`,
    };
  });
  return drawBarChart(bars, { legend: 'Haftalık çözülen soru' });
}

export interface PdfTargetOptions {
  logs?: StudentQuestionLog[];
  // Rapor tarih aralığına denk gelen hedefleri döndürür (YYYY-MM-DD, YYYY-MM-DD)
  getTargets?: (rangeStart: string, rangeEnd: string) => WeeklyQuestionTarget[];
}

function safeTargets(options: PdfTargetOptions | undefined, start: string, end: string): WeeklyQuestionTarget[] {
  try {
    return options?.getTargets ? options.getTargets(start, end) || [] : [];
  } catch (e) {
    console.warn('[PDF] Hedefler alınamadı:', e);
    return [];
  }
}

/**
 * Haftalık soru çözüm raporu (PDF). Normal bir hafta 1-2 sayfadır.
 */
export function downloadWeeklyPDF(analytics: WeeklyAnalytics, student?: Student | null, options?: PdfTargetOptions): void {
  const k = createPdfKit();
  const { date: reportDate, dateTime } = nowTr();
  const today = formatDateISO(new Date());
  const logs = options?.logs || [];
  const studentId = analytics.studentId;
  const className = analytics.className || student?.className || '–';
  const period = formatTurkishRange(analytics.startDateStr, analytics.endDateStr);
  const targets = safeTargets(options, analytics.startDateStr, analytics.endDateStr);
  const details = collectPeriodDetails(options?.logs, studentId, analytics.startDateStr, analytics.endDateStr);
  const hasData = analytics.totalQuestions > 0;

  // Genel (ders seçilmemiş) hedef: günlük tablodaki "Durum" ve grafikteki hedef çizgisi bunun günlük sayısını kullanır
  const general = targets.find((t) => !t.subject) || null;
  const generalRes = general ? computeTargetDays(general, studentId, logs, today) : null;
  const generalRow = (ymd: string) => generalRes?.rows.find((r) => r.ymd === ymd) || null;

  drawReportHeader(k, 'Haftalık Soru Çözüm Raporu', dateTime);
  drawInfoRow(
    k,
    [
      ['Öğrenci', analytics.studentName],
      ['Sınıf', className],
      ['Öğrenci No', student?.studentNumber || '–'],
      ['Hafta', period],
    ],
    [52, 40, 26, 64]
  );

  const prevText =
    analytics.previousWeekTotal > 0
      ? `Önceki hafta ${analytics.previousWeekTotal} soru (değişim ${analytics.weeklyDifference >= 0 ? '+' : ''}${analytics.weeklyDifference} soru)`
      : 'Önceki haftada kayıt yok';

  if (!hasData) {
    drawNoticeBox(
      k,
      'Bu hafta soru kaydı yok',
      `${period} tarihleri arasında öğrenci soru çözümü girmedi. ${prevText}.`
    );
  } else {
    drawKpiTiles(k, [
      { label: 'Toplam soru', value: String(analytics.totalQuestions) },
      { label: 'Doğru', value: String(analytics.totalCorrect) },
      { label: 'Yanlış', value: String(analytics.totalWrong) },
      { label: 'Boş', value: String(analytics.totalEmpty) },
      { label: 'Doğruluk', value: accuracyOf(analytics.totalCorrect, analytics.totalWrong) },
      { label: 'Çalışılan gün', value: `${analytics.solvedDaysCount} / 7` },
    ]);
    paragraph(
      k,
      `Günlük ortalama ${fmtNum(analytics.dailyAverage)} soru · ${prevText}` +
        (general && generalRes ? ` · Genel günlük hedef ${generalRes.daily} soru` : ''),
      { size: 8, color: PDF_MUTED, gap: 3 }
    );

    // Grafik
    const dailyTargets = analytics.days.map((d) => (generalRow(d.dateStr) ? generalRes!.daily : null));
    drawChartImage(k, generateWeeklyChartCanvas(analytics, dailyTargets), CHART_RATIO);

    // Değerlendirme
    sectionTitle(k, 'Değerlendirme', 10);
    const bestDay = [...analytics.days].sort((a, b) => b.totalQuestions - a.totalQuestions)[0];
    const topSubject = analytics.subjectBreakdown[0];
    const parts = [analytics.statusAssessment.reportSummary];
    if (bestDay && bestDay.totalQuestions > 0) parts.push(`En çok soru ${bestDay.dayName} günü çözüldü (${bestDay.totalQuestions} soru).`);
    if (topSubject)
      parts.push(
        analytics.subjectBreakdown.length === 1
          ? `Çalışılan tek ders: ${topSubject.subject}.`
          : `En çok çalışılan ders: ${topSubject.subject} (toplamın %${topSubject.percentage} kadarı).`
      );
    parts.push(
      analytics.unsolvedDays.length > 0
        ? `Soru girilmeyen günler: ${analytics.unsolvedDays.join(', ')}.`
        : 'Haftanın her günü soru çözüldü.'
    );
    paragraph(k, parts.join(' '), { size: 8.5, gap: 3 });

    // Günlük döküm
    sectionTitle(k, 'Günlük Döküm', 30);
    const statusOf = (d: DayQuestionSummary): { text: string; color: RGB; bold?: boolean } => {
      const row = generalRow(d.dateStr);
      if (row && generalRes) {
        return { text: targetDayStatusText(row, generalRes.daily), color: STATUS_COLOR[row.status], bold: row.status === 'met' };
      }
      if (d.hasSolved) return { text: 'Soru çözüldü', color: PDF_TEXT };
      if (d.dateStr > today) return { text: 'Henüz gelmedi', color: PDF_MUTED };
      if (d.dateStr === today) return { text: 'Bugün · henüz girilmedi', color: PDF_MUTED };
      return { text: 'Kayıt yok', color: PDF_BAD };
    };
    const statuses = analytics.days.map(statusOf);
    pdfTable(
      k,
      {
        head: [['Gün', 'Soru', 'D', 'Y', 'B', 'Doğruluk', 'Dersler', general ? `Durum (hedef ${generalRes!.daily})` : 'Durum'].map(k.t)],
        body: analytics.days.map((d, i) =>
          [
            `${d.dayShortName} ${targetDayLabel(d.dateStr).label}`,
            String(d.totalQuestions),
            String(d.totalCorrect),
            String(d.totalWrong),
            String(d.totalEmpty),
            accuracyOf(d.totalCorrect, d.totalWrong),
            d.subjects.length ? d.subjects.map((s) => `${s.subject} ${s.count}`).join(', ') : '–',
            statuses[i].text,
          ].map(k.t)
        ),
        columnStyles: {
          0: { cellWidth: 22, fontStyle: 'bold', textColor: PDF_INK },
          1: { cellWidth: 12, halign: 'center', fontStyle: 'bold', textColor: PDF_INK },
          2: { cellWidth: 10, halign: 'center' },
          3: { cellWidth: 10, halign: 'center' },
          4: { cellWidth: 10, halign: 'center' },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 'auto' },
          7: { cellWidth: 34 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 7) {
            const s = statuses[data.row.index];
            data.cell.styles.textColor = s.color;
            if (s.bold) data.cell.styles.fontStyle = 'bold';
          }
        },
      },
      1.5
    );
    paragraph(
      k,
      'D: doğru, Y: yanlış, B: boş. Doğruluk = doğru / (doğru + yanlış).' +
        (general ? ' Durum, öğretmenin genel (tüm dersler) hedefinin günlük sayısına göredir.' : ' Bu hafta genel bir günlük hedef olmadığı için gün bazında hedef değerlendirmesi yapılmadı.'),
      { size: 7.2, color: PDF_MUTED, gap: 4 }
    );

    // Ders dağılımı
    const subjects: PdfSubjectStat[] =
      details?.subjects ??
      analytics.subjectBreakdown.map((s) => {
        let correct = 0;
        let wrong = 0;
        analytics.days.forEach((d) =>
          d.subjects.forEach((x) => {
            if (x.subject === s.subject) {
              correct += x.correct || 0;
              wrong += x.wrong || 0;
            }
          })
        );
        return { subject: s.subject, count: s.count, correct, wrong, empty: Math.max(0, s.count - correct - wrong), topics: [] };
      });
    if (subjects.length) drawSubjectTable(k, subjects, analytics.totalQuestions);
  }

  if (details) drawStudentNotes(k, details.notes, 10);
  drawTargetsSection(k, targets, studentId, logs, 'Bu dönem için öğretmen hedefi yok.');
  drawSignatures(k);
  drawPageFrames(
    k,
    `Haftalık Soru Çözüm Raporu · ${analytics.studentName} (${className}) · ${period}`,
    `${analytics.studentName} · ${period}`,
    reportDate
  );

  k.doc.save(`${analytics.studentName.replace(/\s+/g, '_')}_Haftalik_Soru_Raporu.pdf`);
}

/**
 * Aylık soru çözüm raporu (PDF).
 */
export function downloadMonthlyPDF(analytics: MonthlyAnalytics, student?: Student | null, options?: PdfTargetOptions): void {
  const k = createPdfKit();
  const { date: reportDate, dateTime } = nowTr();
  const logs = options?.logs || [];
  const studentId = analytics.studentId;
  const className = analytics.className || student?.className || '–';
  const daysInMonth = new Date(analytics.year, analytics.month + 1, 0).getDate();
  const mm = String(analytics.month + 1).padStart(2, '0');
  const monthStart = `${analytics.year}-${mm}-01`;
  const monthEnd = `${analytics.year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;
  const targets = safeTargets(options, monthStart, monthEnd);
  const details = collectPeriodDetails(options?.logs, studentId, monthStart, monthEnd);
  const hasData = analytics.totalQuestions > 0;
  const prevMonthDate = new Date(analytics.year, analytics.month - 1, 1);
  const prevMonthLabel = `${TURKISH_MONTHS[prevMonthDate.getMonth()]} ${prevMonthDate.getFullYear()}`;

  drawReportHeader(k, 'Aylık Soru Çözüm Raporu', dateTime);
  drawInfoRow(
    k,
    [
      ['Öğrenci', analytics.studentName],
      ['Sınıf', className],
      ['Öğrenci No', student?.studentNumber || '–'],
      ['Ay', `${analytics.monthLabel} (${formatTurkishRange(monthStart, monthEnd)})`],
    ],
    [52, 40, 26, 64]
  );

  const prevText =
    analytics.previousMonthTotal > 0
      ? `Önceki ay (${prevMonthLabel}) ${analytics.previousMonthTotal} soru (değişim ${analytics.monthlyDifference >= 0 ? '+' : ''}${analytics.monthlyDifference} soru)`
      : `Önceki ayda (${prevMonthLabel}) kayıt yok`;

  if (!hasData) {
    drawNoticeBox(k, 'Bu ay soru kaydı yok', `${analytics.monthLabel} ayında öğrenci soru çözümü girmedi. ${prevText}.`);
  } else {
    drawKpiTiles(k, [
      { label: 'Toplam soru', value: String(analytics.totalQuestions) },
      { label: 'Doğru', value: String(analytics.totalCorrect) },
      { label: 'Yanlış', value: String(analytics.totalWrong) },
      { label: 'Boş', value: String(analytics.totalEmpty) },
      { label: 'Doğruluk', value: accuracyOf(analytics.totalCorrect, analytics.totalWrong) },
      { label: 'Çalışılan gün', value: `${analytics.activeDaysCount} / ${daysInMonth}` },
    ]);
    paragraph(k, `Haftalık ortalama ${analytics.weeklyAverage} soru · ${prevText}`, { size: 8, color: PDF_MUTED, gap: 3 });

    drawChartImage(k, generateMonthlyChartCanvas(analytics), CHART_RATIO);

    sectionTitle(k, 'Değerlendirme', 10);
    const topWeek = [...analytics.weeks].sort((a, b) => b.totalQuestions - a.totalQuestions)[0];
    const topSubject = analytics.subjectBreakdown[0];
    const parts = [analytics.statusAssessment.reportSummary];
    if (topWeek && topWeek.totalQuestions > 0) parts.push(`En çok soru ${topWeek.weekIndex}. haftada çözüldü (${topWeek.totalQuestions} soru).`);
    if (topSubject)
      parts.push(
        analytics.subjectBreakdown.length === 1
          ? `Çalışılan tek ders: ${topSubject.subject}.`
          : `En çok çalışılan ders: ${topSubject.subject} (toplamın %${topSubject.percentage} kadarı).`
      );
    parts.push(`Ayın ${daysInMonth} gününün ${analytics.activeDaysCount} gününde soru çözüldü.`);
    paragraph(k, parts.join(' '), { size: 8.5, gap: 3 });

    // Haftalık döküm (haftaların boş sayısı kayıtlardan hesaplanır)
    sectionTitle(k, 'Haftalık Döküm', 26);
    const weekEmpty = (w: WeekInMonthSummary) =>
      logs
        .filter((l) => l.studentId === studentId && l.date >= w.startDateStr && l.date <= w.endDateStr)
        .reduce((a, l) => a + (Number(l.totalEmpty) || 0), 0);
    pdfTable(
      k,
      {
        head: [['Hafta', 'Tarih', 'Soru', 'D', 'Y', 'B', 'Doğruluk', 'Aktif gün', 'En çok çalışılan ders'].map(k.t)],
        body: analytics.weeks.map((w) =>
          [
            `${w.weekIndex}. Hafta`,
            formatTurkishRange(w.startDateStr, w.endDateStr),
            String(w.totalQuestions),
            String(w.totalCorrect),
            String(w.totalWrong),
            options?.logs ? String(weekEmpty(w)) : '–',
            accuracyOf(w.totalCorrect, w.totalWrong),
            String(w.activeDaysCount),
            w.totalQuestions > 0 ? w.topSubject || '–' : '–',
          ].map(k.t)
        ),
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold', textColor: PDF_INK },
          1: { cellWidth: 34 },
          2: { cellWidth: 13, halign: 'center', fontStyle: 'bold', textColor: PDF_INK },
          3: { cellWidth: 11, halign: 'center' },
          4: { cellWidth: 11, halign: 'center' },
          5: { cellWidth: 11, halign: 'center' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 16, halign: 'center' },
          8: { cellWidth: 'auto' },
        },
      },
      1.5
    );
    paragraph(k, 'D: doğru, Y: yanlış, B: boş. Doğruluk = doğru / (doğru + yanlış).', { size: 7.2, color: PDF_MUTED, gap: 4 });

    const subjects: PdfSubjectStat[] =
      details?.subjects ??
      analytics.subjectBreakdown.map((s) => ({ subject: s.subject, count: s.count, correct: 0, wrong: 0, empty: 0, topics: [] }));
    if (subjects.length) drawSubjectTable(k, subjects, analytics.totalQuestions);
  }

  if (details) drawStudentNotes(k, details.notes, 15);
  drawTargetsSection(k, targets, studentId, logs, 'Bu dönem için öğretmen hedefi yok.');
  drawSignatures(k);
  drawPageFrames(
    k,
    `Aylık Soru Çözüm Raporu · ${analytics.studentName} (${className}) · ${analytics.monthLabel}`,
    `${analytics.studentName} · ${analytics.monthLabel}`,
    reportDate
  );

  k.doc.save(`${analytics.studentName.replace(/\s+/g, '_')}_Aylik_Soru_Raporu.pdf`);
}
