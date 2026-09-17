import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  CalendarDays,
  Sparkles,
  GraduationCap,
  CheckCircle2,
  Bookmark,
  Camera,
  ArrowRight,
  UserCheck,
  Award,
  HelpCircle,
  Target,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { Student, Etut, Homework, HomeworkSubmission } from '../../types';
import { dataService } from '../../services/dataService';

export type StudentTabType = 'home' | 'homework' | 'etuts' | 'grades' | 'messages' | 'questions';

interface StudentHeroBannerProps {
  student: Student;
  etuts: Etut[];
  homeworks: Homework[];
  submissions?: HomeworkSubmission[];
  onNavigateTab: (tab: StudentTabType) => void;
  onOpenAvatarModal: () => void;
  onOpenProfileModal?: () => void;
  onOpenPasswordModal?: () => void;
}

const TURKISH_MONTHS = [
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

const WEEKDAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const StudentHeroBanner: React.FC<StudentHeroBannerProps> = ({
  student,
  etuts,
  homeworks,
  submissions,
  onNavigateTab,
  onOpenAvatarModal,
  onOpenProfileModal,
  onOpenPasswordModal,
}) => {
  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth(); // 0-11

  // Format today as YYYY-MM-DD
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Calendar View State
  const [viewYear, setViewYear] = useState<number>(todayYear);
  const [viewMonth, setViewMonth] = useState<number>(todayMonth);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleGoToToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setSelectedDateStr(todayStr);
  };

  // Calendar Matrix Computation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDayIndex = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      homeworkList: Homework[];
      etutList: Etut[];
    }[] = [];

    // 1. Previous month trailing days
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        homeworkList: [],
        etutList: [],
      });
    }

    // 2. Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayHws = homeworks.filter((hw) => hw.dueDate && hw.dueDate.slice(0, 10) === dateStr);
      const dayEtuts = etuts.filter((et) => et.date === dateStr);

      cells.push({
        dayNumber: day,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        homeworkList: dayHws,
        etutList: dayEtuts,
      });
    }

    // 3. Next month leading days to complete rows (up to 35 or 42)
    const remaining = 42 - cells.length;
    if (remaining < 7) {
      for (let day = 1; day <= remaining; day++) {
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
        const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          dayNumber: day,
          dateStr,
          isCurrentMonth: false,
          isToday: dateStr === todayStr,
          homeworkList: [],
          etutList: [],
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth, todayStr, homeworks, etuts]);

  // Selected date details
  const selectedDetails = useMemo(() => {
    const selectedHws = homeworks.filter((h) => h.dueDate && h.dueDate.slice(0, 10) === selectedDateStr);
    const selectedEtuts = etuts.filter((e) => e.date === selectedDateStr);
    return {
      homeworks: selectedHws,
      etuts: selectedEtuts,
      hasEvents: selectedHws.length > 0 || selectedEtuts.length > 0,
    };
  }, [homeworks, etuts, selectedDateStr]);

  const formatSelectedDateTurkish = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const monthName = TURKISH_MONTHS[parseInt(m, 10) - 1] || '';
    const isSelToday = dateStr === todayStr;
    return `${parseInt(d, 10)} ${monthName} ${y}${isSelToday ? ' (Bugün)' : ''}`;
  };

  // Yaklaşan Ödevler ve Görevler Hesabı
  const activeSubmissions = useMemo(() => {
    return submissions || dataService.getSubmissions() || [];
  }, [submissions]);

  const completedHwIds = useMemo(() => {
    const studentSubs = activeSubmissions.filter((s) => s.studentId === student.id);
    return new Set(studentSubs.map((s) => s.homeworkId));
  }, [activeSubmissions, student.id]);

  const urgentHomeworks = useMemo(() => {
    return homeworks
      .filter((hw) => !completedHwIds.has(hw.id) && hw.dueDate)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 4);
  }, [homeworks, completedHwIds]);

  const todayEtuts = useMemo(() => {
    return etuts.filter((e) => e.date === todayStr);
  }, [etuts, todayStr]);

  const formatDueDateLabel = (dueDateStr?: string) => {
    if (!dueDateStr) return '';
    const day = dueDateStr.slice(0, 10);
    const time = dueDateStr.includes('T') ? dueDateStr.slice(11, 16) : '';
    if (day === todayStr) {
      return `⏰ Bugün${time ? ` ${time}` : ''}`;
    }
    const [y, m, d] = day.split('-');
    return `${d}.${m}.${y}${time ? ` ${time}` : ''}`;
  };

  const studentAvatarUrl =
    student.avatar ||
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;

  return (
    <div id="student-agenda-wall" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Background Ambience Glow */}
      <div className="absolute top-0 -left-20 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch relative z-10">
        {/* =========================================================================
            LEFT COLUMN: YAKLAŞAN ÖDEVLER VE GÖREVLER DUVARI
           ========================================================================= */}
        <div className="lg:col-span-6 bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>Yaklaşan Ödevler ve Görevler</span>
                    {urgentHomeworks.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-slate-950">
                        {urgentHomeworks.length}
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('homework')}
                  className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                >
                  Tümü ({homeworks.length}) →
                </button>

                {/* Profil Resmi & Değiştirme Kısayolu */}
                <button
                  type="button"
                  onClick={onOpenAvatarModal}
                  className="relative group p-0.5 rounded-full ring-2 ring-indigo-500/40 hover:ring-indigo-400 transition-all cursor-pointer"
                  title="Profil Resmini Değiştir"
                >
                  <img
                    src={studentAvatarUrl}
                    alt={student.name}
                    className="w-7 h-7 rounded-full object-cover bg-slate-900"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-indigo-600 rounded-full flex items-center justify-center border border-slate-900">
                    <Camera className="w-1.5 h-1.5 text-white" />
                  </span>
                </button>
              </div>
            </div>

            {/* Content List */}
            {urgentHomeworks.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {urgentHomeworks.map((hw) => {
                  const isDueToday = hw.dueDate && hw.dueDate.slice(0, 10) === todayStr;
                  return (
                    <div
                      key={hw.id}
                      onClick={() => onNavigateTab('homework')}
                      className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-orange-500/50 hover:bg-slate-900 transition-all flex items-center justify-between gap-2.5 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isDueToday ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-indigo-400'
                        }`}>
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-orange-300 transition-colors truncate">
                            {hw.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                              {hw.subject}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              isDueToday
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : 'bg-slate-800/80 text-slate-400'
                            }`}>
                              {formatDueDateLabel(hw.dueDate)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
                      >
                        Ödevi Aç
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs sm:text-sm font-bold text-white">Harika! Bekleyen acil ödeviniz bulunmuyor.</p>
                <p className="text-[11px] text-slate-400">Tüm görevlerinizi zamanında tamamladınız.</p>
              </div>
            )}
          </div>

          {/* Bugün Varsa Etüt veya Günün İlhamı */}
          {todayEtuts.length > 0 ? (
            <div
              onClick={() => onNavigateTab('etuts')}
              className="mt-3 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200 cursor-pointer hover:bg-cyan-950/60 transition-colors"
            >
              <div className="flex items-center space-x-2 truncate">
                <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-bold">Bugün {todayEtuts.length} Etüdünüz Var:</span>
                <span className="truncate">{todayEtuts[0].subject} ({todayEtuts[0].time})</span>
              </div>
              <span className="text-[11px] font-bold text-cyan-300 shrink-0 ml-2">Etüte Git →</span>
            </div>
          ) : (
            <div className="mt-3 bg-slate-900/60 border border-slate-800/70 rounded-xl p-2.5 flex items-center space-x-2.5 text-slate-300 text-xs">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="italic text-[11px] text-slate-300 truncate">
                &ldquo;Başarı, her gün bıkmadan usanmadan tekrarlanan küçük adımların toplamıdır.&rdquo;
              </span>
            </div>
          )}
        </div>

        {/* =========================================================================
            RIGHT COLUMN: KOMPAKT AYLIK TAKVİM / AJANDA DUVARI
           ========================================================================= */}
        <div className="lg:col-span-6 bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm sm:text-base font-black text-white">
                {TURKISH_MONTHS[viewMonth]} {viewYear}
              </h3>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-2 py-0.5 text-[11px] font-bold text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 rounded-lg transition-colors cursor-pointer"
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Önceki Ay"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Sonraki Ay"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center py-1.5 border-b border-slate-800/50">
            {WEEKDAY_NAMES.map((w, idx) => (
              <span
                key={w}
                className={`text-[10px] font-bold ${
                  idx >= 5 ? 'text-amber-400/80' : 'text-slate-400'
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 pt-1.5">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDateStr;
              const hasHw = cell.homeworkList.length > 0;
              const hasEtut = cell.etutList.length > 0;

              return (
                <button
                  key={`${cell.dateStr}-${idx}`}
                  type="button"
                  onClick={() => setSelectedDateStr(cell.dateStr)}
                  className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    !cell.isCurrentMonth
                      ? 'text-slate-600 opacity-40 hover:opacity-80'
                      : cell.isToday
                      ? 'bg-indigo-600/25 text-white ring-1 ring-indigo-500 font-black'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  } ${
                    isSelected
                      ? 'bg-indigo-600 text-white ring-1.5 ring-indigo-400 shadow-md scale-105 z-10'
                      : ''
                  }`}
                >
                  <span className="text-[11px] leading-tight">{cell.dayNumber}</span>

                  {/* Indicator Badges */}
                  {(hasHw || hasEtut) && (
                    <div className="flex items-center space-x-1 mt-0.5">
                      {hasHw && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-400"
                          title={`${cell.homeworkList.length} Ödev Teslimi`}
                        />
                      )}
                      {hasEtut && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                          title={`${cell.etutList.length} Etüt Programı`}
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between pt-2 text-[10px] text-slate-400 border-t border-slate-800/70 mt-1.5">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Ödev</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Etüt</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Güne tıkla</span>
          </div>

          {/* Selected Date Program Drawer */}
          <div className="mt-2 pt-2 border-t border-slate-800 bg-slate-900/60 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-white">
              <span className="flex items-center space-x-1.5">
                <Bookmark className="w-3 h-3 text-indigo-400" />
                <span>{formatSelectedDateTurkish(selectedDateStr)}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {selectedDetails.homeworks.length} Ödev • {selectedDetails.etuts.length} Etüt
              </span>
            </div>

            {selectedDetails.hasEvents ? (
              <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                {selectedDetails.homeworks.map((hw) => (
                  <div
                    key={hw.id}
                    onClick={() => onNavigateTab('homework')}
                    className="p-1.5 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-[11px] text-amber-200 cursor-pointer hover:bg-amber-950/50 transition-colors"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <BookOpen className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate font-medium">{hw.title}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 shrink-0">
                        {hw.subject}
                      </span>
                    </div>
                    <span className="text-[9px] text-amber-300 font-bold shrink-0 ml-1.5">Ödevi Aç →</span>
                  </div>
                ))}

                {selectedDetails.etuts.map((et) => (
                  <div
                    key={et.id}
                    onClick={() => onNavigateTab('etuts')}
                    className="p-1.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between text-[11px] text-cyan-200 cursor-pointer hover:bg-cyan-950/50 transition-colors"
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="truncate font-medium">{et.subject}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 shrink-0">
                        {et.time}
                      </span>
                    </div>
                    <span className="text-[9px] text-cyan-300 font-bold shrink-0 ml-1.5">Etüte Git →</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic py-0.5 text-center">
                Bu tarihte planlanmış ödev veya etüt bulunmuyor.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
