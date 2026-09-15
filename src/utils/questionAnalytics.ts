import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StudentQuestionLog, Student, ClassGroup } from '../types';
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

  if (weeklyDifference > 20 || weeklyGrowthRate >= 15) {
    trend = 'up';
    badgeText = `Yükselen Başarı (+%${weeklyGrowthRate})`;
    badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    reportSummary = `Öğrenci bu hafta önceki haftaya göre ${Math.abs(weeklyDifference)} soru (%+${weeklyGrowthRate}) daha fazla çözerek belirgin bir başarı ivmesi yakalamıştır. Soru çözme sürekliliği güçlü olup, başarı grafiği yukarı yönlüdür.`;
  } else if (weeklyDifference < -20 || weeklyGrowthRate <= -15) {
    trend = 'down';
    badgeText = `Hacim Düşüşü (%${weeklyGrowthRate})`;
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Öğrencinin haftalık soru çözüm hacminde önceki haftaya kıyasla ${Math.abs(weeklyDifference)} soru (%${weeklyGrowthRate}) azalma görülmektedir. Soru çözülmeyen günlerin azaltılması ve düzenli günlük çalışma hedeflerinin desteklenmesi önerilir.`;
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

  if (monthlyDifference > 80 || monthlyGrowthRate >= 15) {
    trend = 'up';
    badgeText = `Aylık Artış (+%${monthlyGrowthRate})`;
    badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    reportSummary = `Öğrenci bu ay önceki aya göre toplam ${Math.abs(monthlyDifference)} soru (%+${monthlyGrowthRate}) artış sağlayarak güçlü bir akademik ilerleme göstermiştir. Haftalık soru hedeflerine uyum yüksek olup konu pekiştirme süreci başarıyla devam etmektedir.`;
  } else if (monthlyDifference < -80 || monthlyGrowthRate <= -15) {
    trend = 'down';
    badgeText = `Aylık Düşüş (%${monthlyGrowthRate})`;
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    reportSummary = `Öğrencinin aylık toplam soru sayısında önceki aya kıyasla ${Math.abs(monthlyDifference)} soru (%${monthlyGrowthRate}) gerileme tespit edilmiştir. Deneme sınavları ve soru bankası takip planlaması yapılarak çalışma motivasyonunun artırılması hedeflenmelidir.`;
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
 * Sanitizes Turkish text specifically for standard jsPDF fonts (Helvetica/Times)
 * to avoid byte-shifting, character overlapping, or glyph corruption.
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

/**
 * Generates a high-resolution, pixel-perfect chart canvas image (PNG DataURL)
 * for Weekly Question Analytics. Rendered at 1600x700 for ultra-sharp PDF output.
 */
export function generateWeeklyChartCanvas(analytics: WeeklyAnalytics): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Inner card box with subtle border
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  const cardMargin = 16;
  ctx.beginPath();
  ctx.roundRect(cardMargin, cardMargin, canvas.width - cardMargin * 2, canvas.height - cardMargin * 2, 16);
  ctx.fill();
  ctx.stroke();

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('HAFTALIK GÜNLÜK SORU ÇÖZÜM PERFORMANS GRAFİĞİ', 50, 65);

  // Subtitle
  ctx.fillStyle = '#64748b';
  ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    `${analytics.studentName} • ${analytics.weekLabel} • Toplam Çözülen: ${analytics.totalQuestions} Soru`,
    50,
    98
  );

  // Legend
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  // Active pill
  ctx.fillStyle = '#4f46e5';
  ctx.beginPath();
  ctx.roundRect(canvas.width - 560, 50, 22, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Çözülen Günler', canvas.width - 528, 68);

  // Inactive pill
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.roundRect(canvas.width - 320, 50, 22, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Soru Çözülmeyen Günler', canvas.width - 288, 68);

  // Chart coordinates
  const chartLeft = 110;
  const chartRight = canvas.width - 60;
  const chartTop = 150;
  const chartBottom = 540;
  const chartHeight = chartBottom - chartTop;
  const chartWidth = chartRight - chartLeft;

  const maxVal = Math.max(...analytics.days.map((d) => d.totalQuestions), 10);
  const tickCount = 4;
  const step = Math.ceil(maxVal / tickCount / 10) * 10 || 10;
  const maxY = step * tickCount;

  // Grid lines and Y-axis labels
  ctx.textAlign = 'right';
  ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  for (let i = 0; i <= tickCount; i++) {
    const val = i * step;
    const y = chartBottom - (val / maxY) * chartHeight;

    ctx.strokeStyle = i === 0 ? '#cbd5e1' : '#e2e8f0';
    ctx.lineWidth = i === 0 ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.fillText(`${val} Soru`, chartLeft - 16, y + 6);
  }

  // Draw 7 Day Bars
  const count = analytics.days.length;
  const gap = 34;
  const totalBarWidth = (chartWidth - gap * (count + 1)) / count;
  const barWidth = Math.min(Math.max(totalBarWidth, 70), 160);

  analytics.days.forEach((day, index) => {
    const x = chartLeft + gap + index * (barWidth + gap);
    const hasQuestions = day.totalQuestions > 0;
    const barHeight = hasQuestions ? Math.max((day.totalQuestions / maxY) * chartHeight, 20) : 12;
    const y = chartBottom - barHeight;

    // Gradient bar fill
    if (hasQuestions) {
      const grad = ctx.createLinearGradient(x, y, x, chartBottom);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(1, '#4338ca');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#fee2e2'; // Rose 100
    }

    // Rounded top bar
    const radius = 10;
    ctx.beginPath();
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, chartBottom);
    ctx.closePath();
    ctx.fill();

    // Subtle outline
    ctx.strokeStyle = hasQuestions ? '#4338ca' : '#fca5a5';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Value Badge above bar
    ctx.textAlign = 'center';
    if (hasQuestions) {
      // Badge background pill
      const badgeText = `${day.totalQuestions} Soru`;
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      ctx.fillStyle = '#eef2ff';
      ctx.beginPath();
      ctx.roundRect(x + barWidth / 2 - textWidth / 2 - 10, y - 36, textWidth + 20, 26, 8);
      ctx.fill();
      ctx.strokeStyle = '#c7d2fe';
      ctx.stroke();

      ctx.fillStyle = '#3730a3';
      ctx.fillText(badgeText, x + barWidth / 2, y - 18);
    } else {
      ctx.fillStyle = '#e11d48';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('0 (Boş)', x + barWidth / 2, y - 14);
    }

    // Day Name below bar
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(day.dayName, x + barWidth / 2, chartBottom + 36);

    // Formatted Date
    ctx.fillStyle = '#64748b';
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(formatTurkishDate(day.dateStr), x + barWidth / 2, chartBottom + 64);

    // Has Solved Indicator Dot
    ctx.fillStyle = hasQuestions ? '#10b981' : '#f43f5e';
    ctx.beginPath();
    ctx.arc(x + barWidth / 2, chartBottom + 86, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas.toDataURL('image/png');
}

/**
 * Generates a high-resolution, pixel-perfect chart canvas image (PNG DataURL)
 * for Monthly Question Analytics. Rendered at 1600x700 for ultra-sharp PDF output.
 */
export function generateMonthlyChartCanvas(analytics: MonthlyAnalytics): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Inner card box
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  const cardMargin = 16;
  ctx.beginPath();
  ctx.roundRect(cardMargin, cardMargin, canvas.width - cardMargin * 2, canvas.height - cardMargin * 2, 16);
  ctx.fill();
  ctx.stroke();

  // Header Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('AYLIK HAFTALIK SORU ÇÖZÜM VE GELİŞİM GRAFİĞİ', 50, 65);

  // Subtitle
  ctx.fillStyle = '#64748b';
  ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    `${analytics.studentName} • ${analytics.monthLabel} • Toplam Çözülen: ${analytics.totalQuestions} Soru`,
    50,
    98
  );

  // Legend
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.roundRect(canvas.width - 440, 50, 22, 22, 6);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Haftalık Soru Toplamı', canvas.width - 408, 68);

  // Chart coordinates
  const chartLeft = 110;
  const chartRight = canvas.width - 60;
  const chartTop = 150;
  const chartBottom = 540;
  const chartHeight = chartBottom - chartTop;
  const chartWidth = chartRight - chartLeft;

  const maxVal = Math.max(...analytics.weeks.map((w) => w.totalQuestions), 10);
  const tickCount = 4;
  const step = Math.ceil(maxVal / tickCount / 10) * 10 || 10;
  const maxY = step * tickCount;

  // Grid lines
  ctx.textAlign = 'right';
  ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  for (let i = 0; i <= tickCount; i++) {
    const val = i * step;
    const y = chartBottom - (val / maxY) * chartHeight;

    ctx.strokeStyle = i === 0 ? '#cbd5e1' : '#e2e8f0';
    ctx.lineWidth = i === 0 ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.fillText(`${val} Soru`, chartLeft - 16, y + 6);
  }

  // Draw Bars
  const count = analytics.weeks.length;
  const gap = 44;
  const totalBarWidth = (chartWidth - gap * (count + 1)) / count;
  const barWidth = Math.min(Math.max(totalBarWidth, 80), 200);

  analytics.weeks.forEach((week, index) => {
    const x = chartLeft + gap + index * (barWidth + gap);
    const hasQuestions = week.totalQuestions > 0;
    const barHeight = hasQuestions ? Math.max((week.totalQuestions / maxY) * chartHeight, 20) : 12;
    const y = chartBottom - barHeight;

    if (hasQuestions) {
      const grad = ctx.createLinearGradient(x, y, x, chartBottom);
      grad.addColorStop(0, '#8b5cf6');
      grad.addColorStop(1, '#6d28d9');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#e2e8f0';
    }

    const radius = 10;
    ctx.beginPath();
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, chartBottom);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hasQuestions ? '#6d28d9' : '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Value Badge
    ctx.textAlign = 'center';
    const badgeText = `${week.totalQuestions} Soru`;
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    ctx.fillStyle = '#f5f3ff';
    ctx.beginPath();
    ctx.roundRect(x + barWidth / 2 - textWidth / 2 - 10, y - 36, textWidth + 20, 26, 8);
    ctx.fill();
    ctx.strokeStyle = '#ddd6fe';
    ctx.stroke();

    ctx.fillStyle = '#5b21b6';
    ctx.fillText(badgeText, x + barWidth / 2, y - 18);

    // Week Label
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${week.weekIndex}. Hafta`, x + barWidth / 2, chartBottom + 36);

    // Date Range
    ctx.fillStyle = '#64748b';
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(week.weekLabel, x + barWidth / 2, chartBottom + 62);

    // Active Days Tag
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${week.activeDaysCount} Gün Aktif`, x + barWidth / 2, chartBottom + 86);
  });

  return canvas.toDataURL('image/png');
}

/**
 * Downloads a high-quality, professional 2-Page PDF Report for Weekly Analytics
 * with zero text-shifting, mathematically exact positioning, and an embedded high-resolution chart.
 */
export function downloadWeeklyPDF(analytics: WeeklyAnalytics, student?: Student | null): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186 mm

  // =========================================================================
  // PAGE 1: YÖNETİCİ ÖZETİ, KPI METRİKLER VE YÜKSEK ÇÖZÜNÜRLÜKLÜ GRAFİK
  // =========================================================================

  // Top Header Banner (Deep Slate 900)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Indigo Accent Bar
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 26, pageWidth, 1.8, 'F');

  // Title & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(
    sanitizeForPdf('OGRENCI HAFTALIK SORU COZUM VE BASARI ANALIZ RAPORU'),
    pageWidth / 2,
    11,
    { align: 'center' }
  );

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizeForPdf('Akademik Takip, Gunluk Performans ve Gecmis Hafta Karsilastirma Cizelgesi'),
    pageWidth / 2,
    18,
    { align: 'center' }
  );

  // Student & Context Info Box (Y: 31 to 49mm)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, 31, contentWidth, 18, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizeForPdf(`Ogrenci: ${analytics.studentName}`), margin + 5, 37.5);
  doc.text(
    sanitizeForPdf(`Sinif: ${analytics.className || student?.className || 'Genel'}`),
    margin + 5,
    44.5
  );

  if (student?.studentNumber) {
    doc.text(sanitizeForPdf(`No: #${student.studentNumber}`), margin + 65, 44.5);
  }

  doc.text(sanitizeForPdf(`Analiz Haftasi: ${analytics.weekLabel}`), margin + 105, 37.5);
  doc.text(
    sanitizeForPdf(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`),
    margin + 105,
    44.5
  );

  // KPI Summary Metrics AutoTable (startY: 52mm)
  const metricsData = [
    [
      sanitizeForPdf('Toplam Cozulen Soru'),
      `${analytics.totalQuestions} Soru`,
      sanitizeForPdf('Gunluk Ortalama'),
      `${analytics.dailyAverage} Soru / Gun`,
    ],
    [
      sanitizeForPdf('Aktif Calisilan Gunler'),
      `${analytics.solvedDaysCount} / 7 Gun`,
      sanitizeForPdf('Soru Cozulmeyen Gunler'),
      analytics.unsolvedDays.length > 0
        ? sanitizeForPdf(analytics.unsolvedDays.join(', '))
        : sanitizeForPdf('Tum Gunler Calisildi'),
    ],
    [
      sanitizeForPdf('Onceki Hafta Toplami'),
      `${analytics.previousWeekTotal} Soru`,
      sanitizeForPdf('Haftalik Ilerleme'),
      `${analytics.weeklyDifference >= 0 ? '+' : ''}${analytics.weeklyDifference} Soru (%${
        analytics.weeklyGrowthRate >= 0 ? '+' : ''
      }${analytics.weeklyGrowthRate})`,
    ],
  ];

  autoTable(doc, {
    startY: 52,
    margin: { left: margin, right: margin },
    body: metricsData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 46.5 },
      1: { fontStyle: 'bold', textColor: [79, 70, 229], cellWidth: 46.5 },
      2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 46.5 },
      3: { fontStyle: 'bold', cellWidth: 46.5 },
    },
  });

  // EMBEDDED HIGH-RESOLUTION GRAPHIC (Canvas Chart, Y: 74mm, Height: 92mm)
  const chartY = 74;
  const chartHeight = 92;
  const chartImg = generateWeeklyChartCanvas(analytics);
  if (chartImg) {
    doc.addImage(chartImg, 'PNG', margin, chartY, contentWidth, chartHeight);
  }

  // Pedagogical Assessment & Progress Card (Y: 170 to 220mm)
  const reportBoxY = 170;
  const reportBoxHeight = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, reportBoxY, contentWidth, reportBoxHeight, 2.5, 2.5, 'FD');

  // Badge bar inside assessment card
  doc.setFillColor(238, 242, 255);
  doc.rect(margin + 0.6, reportBoxY + 0.6, contentWidth - 1.2, 8.5, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(67, 56, 202);
  doc.text(
    sanitizeForPdf(
      `PEDAGOJIK DEGERLENDIRME VE BASARI DURUMU: ${analytics.statusAssessment.badgeText.toUpperCase()}`
    ),
    margin + 4,
    reportBoxY + 6.2
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const splitText = doc.splitTextToSize(
    sanitizeForPdf(analytics.statusAssessment.reportSummary),
    contentWidth - 8
  );
  doc.text(splitText, margin + 4, reportBoxY + 14);

  // Weekly study habit recommendation note
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(sanitizeForPdf('Akademik Disiplin & Hedef:'), margin + 4, reportBoxY + 34);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const habitNote =
    analytics.unsolvedDays.length > 0
      ? `Haftada ${analytics.solvedDaysCount} gun aktif calisma kaydedildi. Bos birakilan gunlerde (${analytics.unsolvedDays.join(
          ', '
        )}) duzenli soru cozumu alişkanligi kazanilmasi tavsiye edilir.`
      : `Haftanin 7 gunu kesintisiz ve duzenli soru cozumu gerceklestirildi. Harika bir calisma disiplini sergilenmektedir.`;
  const splitHabit = doc.splitTextToSize(sanitizeForPdf(habitNote), contentWidth - 8);
  doc.text(splitHabit, margin + 4, reportBoxY + 39);

  // Quick Highlights Card (Y: 222 to 268mm)
  const highY = 222;
  const highHeight = 46;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, highY, contentWidth, highHeight, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeForPdf('HAFTALIK ONEMLI PERFORMANS DETAYLARI'), margin + 4, highY + 6.5);

  const bestDay = [...analytics.days].sort((a, b) => b.totalQuestions - a.totalQuestions)[0];
  const topSubject = analytics.subjectBreakdown[0];

  const highlights = [
    `• En Verimli Calisilan Gun: ${bestDay?.dayName || '-'} (${bestDay?.totalQuestions || 0} Soru cozumu ile zirve)`,
    `• En Cok Odaklanilan Ders: ${topSubject ? `${topSubject.subject} (%${topSubject.percentage} pay)` : 'Belirtilmedi'}`,
    `• Gunluk Calisma Rutini: Gun basina ortalama ${analytics.dailyAverage} soru hedefi yakalandi`,
    `• Calisma Devamliligi: Haftalik %${Math.round((analytics.solvedDaysCount / 7) * 100)} gunluk katilim disiplini`,
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  highlights.forEach((h, idx) => {
    doc.text(sanitizeForPdf(h), margin + 4, highY + 14 + idx * 7.5);
  });

  // Page 1 Footer
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    sanitizeForPdf('Sayfa 1 / 2 - Egitim & Ogrenci Takip Sistemi - Resmi Analiz Ciktisi'),
    pageWidth / 2,
    290,
    { align: 'center' }
  );

  // =========================================================================
  // PAGE 2: DETAYLI GÜNLÜK VE DERS ÇİZELGELERİ, ÖNERİLER VE İMZALAR
  // =========================================================================
  doc.addPage();

  // Page 2 Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 20, 'F');

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 20, pageWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    sanitizeForPdf('DETAYLI GUNLUK SORU COZUM CIZELGESI VE DERS DAGILIMI'),
    pageWidth / 2,
    9.5,
    { align: 'center' }
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizeForPdf(
      `Ogrenci: ${analytics.studentName} - Sinif: ${analytics.className || 'Genel'} - Donem: ${analytics.weekLabel}`
    ),
    pageWidth / 2,
    16,
    { align: 'center' }
  );

  // Table 1: Daily Breakdown Table (startY: 25mm)
  const daysTableHead = [
    [
      sanitizeForPdf('Gun'),
      sanitizeForPdf('Tarih'),
      sanitizeForPdf('Cozulen Soru'),
      sanitizeForPdf('Calisilan Dersler'),
      sanitizeForPdf('Durum'),
    ],
  ];

  const daysTableBody = analytics.days.map((d) => [
    sanitizeForPdf(d.dayName),
    formatTurkishDate(d.dateStr),
    `${d.totalQuestions} Soru`,
    sanitizeForPdf(d.subjectsText || '-'),
    d.hasSolved ? sanitizeForPdf('Tamamlandi') : sanitizeForPdf('Soru Cozulmedi (!)'),
  ]);

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin },
    head: daysTableHead,
    body: daysTableBody,
    theme: 'striped',
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.0,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 26 },
      2: { fontStyle: 'bold', cellWidth: 26, halign: 'center' },
      3: { cellWidth: 82 },
      4: { fontStyle: 'bold', cellWidth: 28, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        if (data.cell.raw === 'Soru Cozulmedi (!)') {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fillColor = [255, 241, 242];
        } else {
          data.cell.styles.textColor = [16, 185, 129];
        }
      }
    },
  });

  // Table 2: Subject Distribution Table (starts after Table 1)
  const afterDaysY = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeForPdf('DERS BAZINDA SORU DAGILIMI VE BASARI GOSTERGELERI'), margin, afterDaysY);

  const subjectTableHead = [
    [
      sanitizeForPdf('Ders Adi'),
      sanitizeForPdf('Haftalik Soru Sayisi'),
      sanitizeForPdf('Yuzdelik Pay (%)'),
      sanitizeForPdf('Performans Duzeyi'),
    ],
  ];

  const subjectTableBody = analytics.subjectBreakdown.map((s) => [
    sanitizeForPdf(s.subject),
    `${s.count} Soru`,
    `%${s.percentage}`,
    s.percentage >= 25
      ? sanitizeForPdf('Yuksek Odak (+)')
      : s.percentage >= 15
      ? sanitizeForPdf('Duzenli Calisma')
      : sanitizeForPdf('Temel Tekrar'),
  ]);

  if (subjectTableBody.length === 0) {
    subjectTableBody.push([
      sanitizeForPdf('Bu hafta icin henuz ders bazli soru kaydi bulunmuyor.'),
      '0',
      '%0',
      '-',
    ]);
  }

  autoTable(doc, {
    startY: afterDaysY + 3,
    margin: { left: margin, right: margin },
    head: subjectTableHead,
    body: subjectTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.0,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 38, halign: 'center' },
      3: { cellWidth: 50, halign: 'center' },
    },
  });

  // Guidance Recommendations Note Box
  const afterSubjectY = (doc as any).lastAutoTable.finalY + 5;
  const guideBoxY = Math.min(afterSubjectY, 196);
  const guideBoxHeight = 36;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, guideBoxY, contentWidth, guideBoxHeight, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(
    sanitizeForPdf('REHBERLIK VE HAFTALIK CALISMA TAVSIYELERI'),
    margin + 4,
    guideBoxY + 6.5
  );

  const guideNotes = [
    '1. Eksik kalan veya yanlis yapilan sorularin cozum videolarini izleyip ogretmene sormayi unutmayiniz.',
    '2. Soru cozumunu tek bir gune yigmak yerine tum haftaya yayarak hafizada kaliciligi guclendiriniz.',
    '3. Duzenli soru takibi ve deneme sinavlari icin haftalik calisma cizelgenizi rehber ogretmeninizle paylasiniz.',
  ];

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  guideNotes.forEach((n, idx) => {
    doc.text(sanitizeForPdf(n), margin + 4, guideBoxY + 13 + idx * 6.5);
  });

  // Official Institutional Signatures Box
  const sigY = 244;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, sigY, contentWidth, 36, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(sanitizeForPdf('Danisman / Brans Ogretmeni'), margin + 16, sigY + 8);
  doc.text(sanitizeForPdf('Ogrenci / Veli Onayi'), pageWidth - margin - 60, sigY + 8);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    sanitizeForPdf(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`),
    margin + 16,
    sigY + 15
  );
  doc.text(
    sanitizeForPdf(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`),
    pageWidth - margin - 60,
    sigY + 15
  );

  doc.text('Imza: _______________________', margin + 16, sigY + 26);
  doc.text('Imza: _______________________', pageWidth - margin - 60, sigY + 26);

  // Page 2 Footer
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    sanitizeForPdf('Sayfa 2 / 2 - Egitim & Ogrenci Takip Sistemi - Resmi Analiz Ciktisi'),
    pageWidth / 2,
    290,
    { align: 'center' }
  );

  doc.save(`${analytics.studentName.replace(/\s+/g, '_')}_Haftalik_Soru_Raporu.pdf`);
}

/**
 * Downloads a high-quality, professional 2-Page PDF Report for Monthly Analytics
 * with zero text-shifting, mathematically exact positioning, and an embedded high-resolution chart.
 */
export function downloadMonthlyPDF(analytics: MonthlyAnalytics, student?: Student | null): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186 mm

  // =========================================================================
  // PAGE 1: YÖNETİCİ ÖZETİ, AYLIK METRİKLER VE GRAFİK
  // =========================================================================

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Violet Accent Bar
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 26, pageWidth, 1.8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(
    sanitizeForPdf('OGRENCI AYLIK SORU COZUM VE BASARI ANALIZ RAPORU'),
    pageWidth / 2,
    11,
    { align: 'center' }
  );

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizeForPdf('Aylik Toplam Soru Sayisi, Haftalik Gelisim ve Gecmis Aya Gore Ilerleme'),
    pageWidth / 2,
    18,
    { align: 'center' }
  );

  // Student Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, 31, contentWidth, 18, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitizeForPdf(`Ogrenci: ${analytics.studentName}`), margin + 5, 37.5);
  doc.text(
    sanitizeForPdf(`Sinif: ${analytics.className || student?.className || 'Genel'}`),
    margin + 5,
    44.5
  );

  if (student?.studentNumber) {
    doc.text(sanitizeForPdf(`No: #${student.studentNumber}`), margin + 65, 44.5);
  }

  doc.text(sanitizeForPdf(`Analiz Ayi: ${analytics.monthLabel}`), margin + 105, 37.5);
  doc.text(
    sanitizeForPdf(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`),
    margin + 105,
    44.5
  );

  // Summary Metrics AutoTable
  const metricsData = [
    [
      sanitizeForPdf('Ayda Cozulen Toplam Soru'),
      `${analytics.totalQuestions} Soru`,
      sanitizeForPdf('Haftalik Ortalama Soru'),
      `${analytics.weeklyAverage} Soru / Hafta`,
    ],
    [
      sanitizeForPdf('Aktif Calisilan Gunler'),
      `${analytics.activeDaysCount} Gun`,
      sanitizeForPdf('Gecmis Aya Gore Ilerleme'),
      `${analytics.monthlyDifference >= 0 ? '+' : ''}${analytics.monthlyDifference} Soru (%${
        analytics.monthlyGrowthRate >= 0 ? '+' : ''
      }${analytics.monthlyGrowthRate})`,
    ],
    [
      sanitizeForPdf('Onceki Ay Toplami'),
      `${analytics.previousMonthTotal} Soru`,
      sanitizeForPdf('Genel Basari Durumu'),
      sanitizeForPdf(analytics.statusAssessment.badgeText),
    ],
  ];

  autoTable(doc, {
    startY: 52,
    margin: { left: margin, right: margin },
    body: metricsData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 46.5 },
      1: { fontStyle: 'bold', textColor: [124, 58, 237], cellWidth: 46.5 },
      2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 46.5 },
      3: { fontStyle: 'bold', cellWidth: 46.5 },
    },
  });

  // EMBEDDED HIGH-RESOLUTION GRAPHIC (Canvas Chart, Y: 74mm, Height: 92mm)
  const chartY = 74;
  const chartHeight = 92;
  const chartImg = generateMonthlyChartCanvas(analytics);
  if (chartImg) {
    doc.addImage(chartImg, 'PNG', margin, chartY, contentWidth, chartHeight);
  }

  // Monthly Pedagogical Assessment Card (Y: 170 to 220mm)
  const reportBoxY = 170;
  const reportBoxHeight = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, reportBoxY, contentWidth, reportBoxHeight, 2.5, 2.5, 'FD');

  doc.setFillColor(245, 243, 255);
  doc.rect(margin + 0.6, reportBoxY + 0.6, contentWidth - 1.2, 8.5, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(109, 40, 217);
  doc.text(
    sanitizeForPdf(
      `AYLIK PEDAGOJIK DEGERLENDIRME VE BASARI: ${analytics.statusAssessment.badgeText.toUpperCase()}`
    ),
    margin + 4,
    reportBoxY + 6.2
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const splitText = doc.splitTextToSize(
    sanitizeForPdf(analytics.statusAssessment.reportSummary),
    contentWidth - 8
  );
  doc.text(splitText, margin + 4, reportBoxY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(sanitizeForPdf('Aylik Gelisim Hedefi:'), margin + 4, reportBoxY + 34);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const monthlyHabitNote = `Ay boyunca ${analytics.activeDaysCount} gun aktif calisma yapildi. Aylik toplam ${analytics.totalQuestions} soruya ulasildi. Gelecek ay icin hedefi korumak ve her hafta en az ${Math.round(
    analytics.weeklyAverage * 1.1
  )} soruya ulasmak onerilir.`;
  const splitMonthlyHabit = doc.splitTextToSize(sanitizeForPdf(monthlyHabitNote), contentWidth - 8);
  doc.text(splitMonthlyHabit, margin + 4, reportBoxY + 39);

  // Highlights Card (Y: 222 to 268mm)
  const highY = 222;
  const highHeight = 46;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, highY, contentWidth, highHeight, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeForPdf('AYLIK ONEMLI BASARI VE ODOS DETAYLARI'), margin + 4, highY + 6.5);

  const topWeek = [...analytics.weeks].sort((a, b) => b.totalQuestions - a.totalQuestions)[0];
  const topMonthlySubject = analytics.subjectBreakdown[0];

  const monthlyHighlights = [
    `• En Verimli Hafta: ${topWeek ? `${topWeek.weekIndex}. Hafta (${topWeek.totalQuestions} Soru)` : '-'}`,
    `• En Cok Cozulen Ders: ${topMonthlySubject ? `${topMonthlySubject.subject} (%${topMonthlySubject.percentage} pay)` : 'Belirtilmedi'}`,
    `• Aylik Soru Artisi: ${analytics.monthlyDifference >= 0 ? '+' : ''}${analytics.monthlyDifference} Soru gecmis aya gore degisim`,
    `• Calisma Sikligi: Ayin ${analytics.activeDaysCount} gununde aktif akademik calisma gerceklesti`,
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  monthlyHighlights.forEach((h, idx) => {
    doc.text(sanitizeForPdf(h), margin + 4, highY + 14 + idx * 7.5);
  });

  // Page 1 Footer
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    sanitizeForPdf('Sayfa 1 / 2 - Egitim & Ogrenci Takip Sistemi - Resmi Analiz Ciktisi'),
    pageWidth / 2,
    290,
    { align: 'center' }
  );

  // =========================================================================
  // PAGE 2: HAFTALIK ÇİZELGE, DERS DAĞILIMI VE RESMİ ONAYLAR
  // =========================================================================
  doc.addPage();

  // Page 2 Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 20, 'F');

  doc.setFillColor(124, 58, 237);
  doc.rect(0, 20, pageWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    sanitizeForPdf('DETAYLI AYLIK HAFTALIK DAGILIM VE DERS CIZELGESI'),
    pageWidth / 2,
    9.5,
    { align: 'center' }
  );

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizeForPdf(
      `Ogrenci: ${analytics.studentName} - Sinif: ${analytics.className || 'Genel'} - Donem: ${analytics.monthLabel}`
    ),
    pageWidth / 2,
    16,
    { align: 'center' }
  );

  // Table 1: Weekly Breakdown in Month Table (startY: 25mm)
  const weeksTableHead = [
    [
      sanitizeForPdf('Hafta'),
      sanitizeForPdf('Tarih Araligi'),
      sanitizeForPdf('Haftalik Soru Sayisi'),
      sanitizeForPdf('Aktif Gun'),
      sanitizeForPdf('Agirlikli Ders'),
    ],
  ];

  const weeksTableBody = analytics.weeks.map((w) => [
    `${w.weekIndex}. Hafta`,
    sanitizeForPdf(w.weekLabel),
    `${w.totalQuestions} Soru`,
    `${w.activeDaysCount} Gun`,
    sanitizeForPdf(w.topSubject || '-'),
  ]);

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin },
    head: weeksTableHead,
    body: weeksTableBody,
    theme: 'striped',
    headStyles: {
      fillColor: [124, 58, 237],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.0,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26 },
      1: { cellWidth: 54 },
      2: { fontStyle: 'bold', cellWidth: 36, halign: 'center' },
      3: { cellWidth: 32, halign: 'center' },
      4: { cellWidth: 38, halign: 'center' },
    },
  });

  // Table 2: Subject Distribution Table
  const afterWeeksY = (doc as any).lastAutoTable.finalY + 5;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizeForPdf('DERS BAZINDA AYLIK SORU DAGILIMI VE AGIRLIKLAR'), margin, afterWeeksY);

  const subjectTableHead = [
    [
      sanitizeForPdf('Ders Adi'),
      sanitizeForPdf('Aylik Cozulen Soru'),
      sanitizeForPdf('Yuzdelik Pay (%)'),
      sanitizeForPdf('Akademik Durum'),
    ],
  ];

  const subjectTableBody = analytics.subjectBreakdown.map((s) => [
    sanitizeForPdf(s.subject),
    `${s.count} Soru`,
    `%${s.percentage}`,
    s.percentage >= 25
      ? sanitizeForPdf('Yuksek Yogunluk (+)')
      : s.percentage >= 15
      ? sanitizeForPdf('Duzenli Calisma')
      : sanitizeForPdf('Temel Hacim'),
  ]);

  if (subjectTableBody.length === 0) {
    subjectTableBody.push([
      sanitizeForPdf('Bu ay icin henuz soru kaydi bulunmuyor.'),
      '0',
      '%0',
      '-',
    ]);
  }

  autoTable(doc, {
    startY: afterWeeksY + 3,
    margin: { left: margin, right: margin },
    head: subjectTableHead,
    body: subjectTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.0,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 38, halign: 'center' },
      3: { cellWidth: 50, halign: 'center' },
    },
  });

  // Monthly Study Recommendations Note Box
  const afterSubjectY = (doc as any).lastAutoTable.finalY + 5;
  const guideBoxY = Math.min(afterSubjectY, 196);
  const guideBoxHeight = 36;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, guideBoxY, contentWidth, guideBoxHeight, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(124, 58, 237);
  doc.text(
    sanitizeForPdf('REHBERLIK VE GELECEK AY CALISMA PLANLAMASI'),
    margin + 4,
    guideBoxY + 6.5
  );

  const guideNotes = [
    '1. Gelecek ay basinda belirlenen soru hedefinin haftalara dengeli bolunmesi basariyi artiracaktir.',
    '2. Yuzdelik payi dusuk kalan derslerdeki eksik kazanimlar icin brans ogretmenlerinden etut talep ediniz.',
    '3. Aylik gelişim grafiginizi aileniz ve rehber ogretmeniniz ile birlikte degerlendiriniz.',
  ];

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  guideNotes.forEach((n, idx) => {
    doc.text(sanitizeForPdf(n), margin + 4, guideBoxY + 13 + idx * 6.5);
  });

  // Official Institutional Signatures Box
  const sigY = 244;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, sigY, contentWidth, 36, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(sanitizeForPdf('Danisman / Brans Ogretmeni'), margin + 16, sigY + 8);
  doc.text(sanitizeForPdf('Ogrenci / Veli Onayi'), pageWidth - margin - 60, sigY + 8);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    sanitizeForPdf(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`),
    margin + 16,
    sigY + 15
  );
  doc.text(
    sanitizeForPdf(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`),
    pageWidth - margin - 60,
    sigY + 15
  );

  doc.text('Imza: _______________________', margin + 16, sigY + 26);
  doc.text('Imza: _______________________', pageWidth - margin - 60, sigY + 26);

  // Page 2 Footer
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    sanitizeForPdf('Sayfa 2 / 2 - Egitim & Ogrenci Takip Sistemi - Resmi Analiz Ciktisi'),
    pageWidth / 2,
    290,
    { align: 'center' }
  );

  doc.save(`${analytics.studentName.replace(/\s+/g, '_')}_Aylik_Soru_Raporu.pdf`);
}
