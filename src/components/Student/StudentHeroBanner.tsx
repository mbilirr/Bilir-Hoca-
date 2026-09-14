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
} from 'lucide-react';
import { Student, Etut, Homework } from '../../types';

export type StudentTabType = 'home' | 'homework' | 'etuts' | 'grades' | 'messages';

interface StudentHeroBannerProps {
  student: Student;
  etuts: Etut[];
  homeworks: Homework[];
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

  const studentAvatarUrl =
    student.avatar ||
    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 lg:p-7 shadow-2xl relative overflow-hidden">
      {/* Background Ambience Glow */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start relative z-10">
        {/* =========================================================================
            LEFT COLUMN: STUDENT HERO CARD & MOTIVATION
           ========================================================================= */}
        <div className="lg:col-span-6 flex flex-col justify-between h-full space-y-5">
          {/* Top Badge & School Level */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold tracking-wide shadow-sm">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Öğrenci Akademik Portalı</span>
            </span>

            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{student.className || '8. Sınıf'}</span>
            </span>

            {student.studentNumber && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/70 text-slate-400 text-xs font-mono">
                No: #{student.studentNumber}
              </span>
            )}
          </div>

          {/* Student Profile Block with Live Avatar Changer */}
          <div className="flex items-start sm:items-center space-x-4">
            <div className="relative group shrink-0">
              <div
                onClick={onOpenAvatarModal}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-cyan-500 p-1 ring-4 ring-indigo-500/30 shadow-xl overflow-hidden cursor-pointer transition-all duration-300 group-hover:scale-105 group-hover:ring-indigo-400"
                title="Profil Resmini Değiştir / Bilgisayardan Fotoğraf Yükle"
              >
                <img
                  src={studentAvatarUrl}
                  alt={student.name}
                  className="w-full h-full object-cover rounded-[20px] bg-slate-900"
                />
              </div>

              <button
                type="button"
                onClick={onOpenAvatarModal}
                className="absolute -bottom-1 -right-1 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg border-2 border-slate-900 transition-transform active:scale-95 group-hover:scale-110 cursor-pointer"
                title="Profil Resmi Değiştir veya Emoji Seç"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                Hoş Geldin, <span className="bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent">{student.name}</span>! 🚀
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium">
                Ders programını, ödevlerini ve etütlerini buradan kolayca takip edebilirsin.
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={onOpenAvatarModal}
                  className="inline-flex items-center space-x-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Resmimi Değiştir / Yükle</span>
                </button>
                {onOpenProfileModal && (
                  <>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={onOpenProfileModal}
                      className="inline-flex items-center text-xs text-slate-400 hover:text-slate-200 font-semibold cursor-pointer transition-colors"
                    >
                      Bilgileri Güncelle
                    </button>
                  </>
                )}
                {onOpenPasswordModal && (
                  <>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={onOpenPasswordModal}
                      className="inline-flex items-center text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer transition-colors"
                    >
                      Şifre Değiştir
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Inspirational Quote of the Day */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 sm:p-4 flex items-start space-x-3 text-slate-300 shadow-inner">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm italic font-serif text-slate-200">
                &ldquo;Başarı, her gün bıkmadan usanmadan tekrarlanan küçük adımların toplamıdır.&rdquo;
              </p>
              <span className="text-[11px] text-slate-400 font-semibold block">
                — Günün İlham Verici Tavsiyesi
              </span>
            </div>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigateTab('homework')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-indigo-900/60 to-indigo-800/40 hover:from-indigo-900/80 hover:to-indigo-800/60 border border-indigo-500/30 text-white font-bold text-xs sm:text-sm transition-all shadow-lg hover:shadow-indigo-500/10 cursor-pointer group"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-4 h-4" />
                </div>
                <span>Ödevlerimi Aç</span>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('etuts')}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-cyan-900/50 to-blue-900/40 hover:from-cyan-900/70 hover:to-blue-900/60 border border-cyan-500/30 text-white font-bold text-xs sm:text-sm transition-all shadow-lg hover:shadow-cyan-500/10 cursor-pointer group"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-300 group-hover:scale-110 transition-transform">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <span>Etüt Programım</span>
              </div>
              <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: INTERACTIVE MONTHLY CALENDAR / AJANDA
           ========================================================================= */}
        <div className="lg:col-span-6 bg-slate-950/70 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-xl">
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <CalendarDays className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm sm:text-base font-black text-white">
                {TURKISH_MONTHS[viewMonth]} {viewYear}
              </h3>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-2.5 py-1 text-[11px] font-bold text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 rounded-xl transition-colors cursor-pointer"
              >
                Bugün
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Önceki Ay"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Sonraki Ay"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center py-2 border-b border-slate-800/50">
            {WEEKDAY_NAMES.map((w, idx) => (
              <span
                key={w}
                className={`text-[11px] font-bold ${
                  idx >= 5 ? 'text-amber-400/80' : 'text-slate-400'
                }`}
              >
                {w}
              </span>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 pt-2">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDateStr;
              const hasHw = cell.homeworkList.length > 0;
              const hasEtut = cell.etutList.length > 0;

              return (
                <button
                  key={`${cell.dateStr}-${idx}`}
                  type="button"
                  onClick={() => setSelectedDateStr(cell.dateStr)}
                  className={`relative flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    !cell.isCurrentMonth
                      ? 'text-slate-600 opacity-40 hover:opacity-80'
                      : cell.isToday
                      ? 'bg-indigo-600/25 text-white ring-1 ring-indigo-500 font-black'
                      : 'text-slate-200 hover:bg-slate-800/80'
                  } ${
                    isSelected
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 shadow-md scale-105 z-10'
                      : ''
                  }`}
                >
                  <span>{cell.dayNumber}</span>

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

          {/* Legend / Info Bar */}
          <div className="flex items-center justify-between pt-3 text-[11px] text-slate-400 border-t border-slate-800/70 mt-2">
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Ödev Teslimi</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Etüt Programı</span>
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Güne tıklayarak detay görün</span>
          </div>

          {/* Selected Date Program Drawer */}
          <div className="mt-3 pt-3 border-t border-slate-800 bg-slate-900/60 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span className="flex items-center space-x-1.5">
                <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
                <span>{formatSelectedDateTurkish(selectedDateStr)}</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                {selectedDetails.homeworks.length} Ödev • {selectedDetails.etuts.length} Etüt
              </span>
            </div>

            {selectedDetails.hasEvents ? (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {selectedDetails.homeworks.map((hw) => (
                  <div
                    key={hw.id}
                    onClick={() => onNavigateTab('homework')}
                    className="p-2 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200 cursor-pointer hover:bg-amber-950/50 transition-colors"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate font-medium">{hw.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                        {hw.subject}
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-300 font-bold shrink-0 ml-2">Ödevi Aç →</span>
                  </div>
                ))}

                {selectedDetails.etuts.map((et) => (
                  <div
                    key={et.id}
                    onClick={() => onNavigateTab('etuts')}
                    className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200 cursor-pointer hover:bg-cyan-950/50 transition-colors"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate font-medium">{et.subject} ({et.topic})</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">
                        {et.time}
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-300 font-bold shrink-0 ml-2">Etüte Git →</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-1 text-center">
                Bu tarihte planlanmış ödev teslimi veya etüt bulunmuyor.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
