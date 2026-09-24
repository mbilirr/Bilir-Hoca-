import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Plus,
  Edit2,
  Trash2,
  CalendarCheck,
  Sparkles,
  Filter,
  Calendar as CalendarIcon,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import { Etut, Student, ClassGroup } from '../../types';
import { createGoogleCalendarUrlForEtut, downloadIcsFile } from '../../lib/calendar';

interface WeeklyEtutCalendarProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
  onAddEtutForDate?: (dateStr: string) => void;
  onEditEtut?: (etut: Etut) => void;
  onDeleteEtut?: (etut: Etut) => void;
  onNotifyEtut?: (etut: Etut) => void;
  onAttendanceEtut?: (etut: Etut) => void;
  readOnly?: boolean;
}

// Helper to get Monday of the week
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
];

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Matematik: {
    bg: 'bg-indigo-950/40',
    text: 'text-indigo-300',
    border: 'border-indigo-500/30',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  Fizik: {
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-300',
    border: 'border-cyan-500/30',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  Kimya: {
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  Biyoloji: {
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  Türkçe: {
    bg: 'bg-rose-950/40',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  Tarih: {
    bg: 'bg-orange-950/40',
    text: 'text-orange-300',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  Coğrafya: {
    bg: 'bg-teal-950/40',
    text: 'text-teal-300',
    border: 'border-teal-500/30',
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  'Fen Bilgisi': {
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  'Sosyal Bilgiler': {
    bg: 'bg-yellow-950/40',
    text: 'text-yellow-300',
    border: 'border-yellow-500/30',
    badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  İngilizce: {
    bg: 'bg-sky-950/40',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
  Edebiyat: {
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    border: 'border-purple-500/30',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
};

export const WeeklyEtutCalendar: React.FC<WeeklyEtutCalendarProps> = ({
  etuts,
  students,
  classes,
  onAddEtutForDate,
  onEditEtut,
  onDeleteEtut,
  onNotifyEtut,
  onAttendanceEtut,
  readOnly = false,
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  const todayKey = formatDateKey(new Date());

  // Generate 7 days for current week
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const dayDate = new Date(currentWeekStart);
      dayDate.setDate(currentWeekStart.getDate() + index);
      const dateKey = formatDateKey(dayDate);
      return {
        date: dayDate,
        dateKey,
        dayName: DAY_NAMES[index],
        isToday: dateKey === todayKey,
      };
    });
  }, [currentWeekStart, todayKey]);

  // Mobile active day index (0..6)
  const [mobileActiveIndex, setMobileActiveIndex] = useState<number>(() => {
    const today = formatDateKey(new Date());
    const mon = getMonday(new Date());
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      if (formatDateKey(d) === today) return i;
    }
    return 0;
  });

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToDay = (index: number) => {
    setMobileActiveIndex(index);
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const child = container.children[index] as HTMLElement;
      if (child) {
        child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      }
    }
  };

  const handleMobileScroll = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.clientWidth * 0.88;
    if (itemWidth > 0) {
      const idx = Math.round(scrollLeft / itemWidth);
      if (idx >= 0 && idx < 7 && idx !== mobileActiveIndex) {
        setMobileActiveIndex(idx);
      }
    }
  };

  // Navigate weeks
  const goToPreviousWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  // Filter etuts by subject
  const filteredEtuts = useMemo(() => {
    if (selectedSubjectFilter === 'all') return etuts;
    return etuts.filter((e) => e.subject === selectedSubjectFilter);
  }, [etuts, selectedSubjectFilter]);

  // Map etuts by dateKey
  const etutsByDay = useMemo(() => {
    const map: Record<string, Etut[]> = {};
    weekDays.forEach((day) => {
      map[day.dateKey] = [];
    });

    filteredEtuts.forEach((etut) => {
      if (map[etut.date]) {
        map[etut.date].push(etut);
      }
    });

    // Sort etuts in each day chronologically by time
    Object.keys(map).forEach((dateKey) => {
      map[dateKey].sort((a, b) => (a?.time || '').localeCompare(b?.time || ''));
    });

    return map;
  }, [weekDays, filteredEtuts]);

  // Calculate week stats
  const totalEtutsThisWeek = weekDays.reduce(
    (count, day) => count + (etutsByDay[day.dateKey]?.length || 0),
    0
  );

  const totalMinutesThisWeek = weekDays.reduce((mins, day) => {
    const dayEtuts = etutsByDay[day.dateKey] || [];
    return mins + dayEtuts.reduce((sub, e) => sub + (e.duration || 45), 0);
  }, 0);

  const totalHoursStr = (totalMinutesThisWeek / 60).toFixed(1);

  // Available subjects for filter
  const subjects = Array.from(new Set(etuts.map((e) => e.subject)));

  // Week range label (e.g. "8 - 14 Eylül 2026")
  const weekEnd = weekDays[6].date;
  const startDay = currentWeekStart.getDate();
  const startMonth = currentWeekStart.toLocaleDateString('tr-TR', { month: 'short' });
  const endDay = weekEnd.getDate();
  const endMonth = weekEnd.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
  const weekLabel = `${startDay} ${startMonth} - ${endDay} ${endMonth}`;

  // Helper for student chips
  const getAssignedStudentsSummary = (assignedStudentIds: 'all' | string[]) => {
    if (assignedStudentIds === 'all') return 'Tüm Sınıf & Grup';
    if (assignedStudentIds.length === 1) {
      const s = students.find((std) => std.id === assignedStudentIds[0]);
      return s ? s.name : '1 Öğrenci';
    }
    const names = assignedStudentIds
      .map((id) => students.find((s) => s.id === id)?.name?.split(' ')[0])
      .filter(Boolean);
    if (names.length > 2) {
      return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    }
    return names.join(', ');
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
        {/* Left: Navigation and Week Label */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={goToPreviousWeek}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Önceki Hafta"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToCurrentWeek}
              className="px-2.5 py-1 text-xs font-semibold hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded-lg transition-colors"
            >
              Bu Hafta
            </button>
            <button
              onClick={goToNextWeek}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Sonraki Hafta"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <CalendarDays className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-white tracking-tight">{weekLabel}</span>
          </div>
        </div>

        {/* Right: Quick Stats & Subject Filter */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Stats Badge */}
          <div className="flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
            <span>Bu Hafta:</span>
            <strong className="text-indigo-400">{totalEtutsThisWeek} Etüt</strong>
            <span className="text-slate-600">•</span>
            <strong className="text-amber-400">{totalHoursStr} Saat</strong>
          </div>

          {/* Subject Filter */}
          <div className="flex items-center space-x-1 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">
                Tüm Dersler
              </option>
              {subjects.map((sub) => (
                <option key={sub} value={sub} className="bg-slate-900 text-white">
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* MOBİL: 7 Gün Yatay Sekmeler (Hızlı Geçiş) */}
      <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {weekDays.map((day, idx) => {
          const dayEtuts = etutsByDay[day.dateKey] || [];
          const isSelected = idx === mobileActiveIndex;
          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => scrollToDay(idx)}
              className={`flex-1 min-w-[44px] py-1.5 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/50 scale-[1.03]'
                  : day.isToday
                  ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-900/90 text-slate-400 border border-slate-800'
              }`}
            >
              <span className="text-[10px] uppercase font-semibold">
                {day.dayName.slice(0, 3)}
              </span>
              <span className="text-xs font-bold mt-0.5">
                {day.date.getDate()}
              </span>
              {dayEtuts.length > 0 && (
                <span
                  className={`text-[9px] px-1 rounded-full font-bold mt-0.5 ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-indigo-500/30 text-indigo-300'
                  }`}
                >
                  {dayEtuts.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* MOBİL: Yan Yana Sayfa Geçiş Kontrolleri (< Gün Seçici >) */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 bg-slate-950/80 border border-slate-800/90 rounded-2xl text-xs">
        <button
          type="button"
          onClick={() => scrollToDay(Math.max(0, mobileActiveIndex - 1))}
          disabled={mobileActiveIndex === 0}
          className="flex items-center space-x-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-semibold cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Önceki Gün</span>
        </button>

        <div className="text-center">
          <span className="text-white font-bold block text-xs">
            {weekDays[mobileActiveIndex]?.dayName}
          </span>
          <span className="text-[10px] text-indigo-300">
            {weekDays[mobileActiveIndex]?.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} (Gün {mobileActiveIndex + 1}/7)
          </span>
        </div>

        <button
          type="button"
          onClick={() => scrollToDay(Math.min(6, mobileActiveIndex + 1))}
          disabled={mobileActiveIndex === 6}
          className="flex items-center space-x-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-semibold cursor-pointer"
        >
          <span>Sonraki Gün</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 7-Day Grid on Desktop / Side-by-Side Sliding Carousel on Mobile */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMobileScroll}
        className="flex md:grid md:grid-cols-7 gap-3 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory pb-3 md:pb-0 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {weekDays.map((day) => {
          const dayEtuts = etutsByDay[day.dateKey] || [];
          const hasEtuts = dayEtuts.length > 0;

          return (
            <div
              key={day.dateKey}
              className={`w-[88vw] sm:w-[75vw] md:w-auto shrink-0 snap-center md:snap-align-none flex flex-col rounded-2xl border transition-all duration-200 min-h-[380px] md:min-h-[360px] ${
                day.isToday
                  ? 'bg-slate-900/90 border-indigo-500/50 ring-1 ring-indigo-500/30 shadow-indigo-500/10 shadow-lg'
                  : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-3 border-b flex items-center justify-between ${
                  day.isToday
                    ? 'bg-indigo-950/40 border-indigo-500/30'
                    : 'bg-slate-950/50 border-slate-800'
                } rounded-t-2xl`}
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-xs font-bold ${
                        day.isToday ? 'text-indigo-300' : 'text-slate-300'
                      }`}
                    >
                      {day.dayName}
                    </span>
                    {day.isToday && (
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {day.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      hasEtuts
                        ? day.isToday
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                        : 'bg-slate-900 text-slate-500'
                    }`}
                  >
                    {dayEtuts.length}
                  </span>
                  {!readOnly && onAddEtutForDate && (
                    <button
                      type="button"
                      onClick={() => onAddEtutForDate(day.dateKey)}
                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-indigo-300 rounded-md transition-colors cursor-pointer"
                      title={`${day.dayName} gününe etüt ekle`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Day Body / Etüt Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {dayEtuts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-8 text-center px-2">
                    <CalendarIcon className="w-6 h-6 text-slate-700 mb-1.5" />
                    <p className="text-[11px] text-slate-500 font-medium">Planlı etüt yok</p>
                    {!readOnly && onAddEtutForDate && (
                      <button
                        type="button"
                        onClick={() => onAddEtutForDate(day.dateKey)}
                        className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded border border-dashed border-indigo-500/30 hover:bg-indigo-950/40 transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Etüt Ekle</span>
                      </button>
                    )}
                  </div>
                ) : (
                  dayEtuts.map((etut) => {
                    return (
                      <div
                        key={etut.id}
                        className="p-2.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-xs group relative shadow-xs text-slate-800"
                      >
                        {/* Subject & Time & Period */}
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                          <div className="flex items-center space-x-1">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >
                              {etut.subject}
                            </span>
                            {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                {etut.lessonPeriod}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-amber-700 font-semibold flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>{etut.time}</span>
                          </span>
                        </div>

                        {/* Topic */}
                        <h5 className="font-bold text-slate-900 text-[11px] leading-tight mb-1 line-clamp-2">
                          {etut.topic}
                        </h5>

                        {/* Teacher */}
                        {etut.teacherName && (
                          <div className="flex items-center space-x-1 text-[10px] text-indigo-800 mb-1 truncate font-semibold">
                            <span className="truncate">👨‍🏫 {etut.teacherName}</span>
                          </div>
                        )}

                        {/* Location */}
                        {etut.location && (
                          <div className="flex items-center space-x-1 text-[10px] text-slate-500 mb-1 truncate">
                            <MapPin className="w-2.5 h-2.5 text-rose-500 flex-shrink-0" />
                            <span className="truncate">{etut.location}</span>
                          </div>
                        )}

                        {/* Students */}
                        <div className="flex items-center space-x-1 text-[10px] text-slate-600 mb-1.5 truncate">
                          <Users className="w-2.5 h-2.5 text-indigo-500 flex-shrink-0" />
                          <span className="truncate font-medium">
                            {getAssignedStudentsSummary(etut.assignedStudentIds)}
                          </span>
                        </div>

                        {/* Teacher Feedback / Notes indicator */}
                        {etut.teacherFeedback && (
                          <div
                            className="mb-1.5 p-1 bg-amber-50 border border-amber-200 rounded text-[9px] text-amber-900 flex items-center space-x-1"
                            title={`Öğretmen Görüşü: ${etut.teacherFeedback}`}
                          >
                            <span className="shrink-0 font-bold">💬</span>
                            <span className="italic truncate font-normal">{etut.teacherFeedback}</span>
                          </div>
                        )}

                        {/* Quick Action Footer */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-[10px]">
                          <span className="text-slate-400 font-mono">{etut.duration} dk</span>

                          <div className="flex items-center space-x-1 opacity-90 group-hover:opacity-100">
                            {/* Attendance / Yoklama */}
                            {!readOnly && onAttendanceEtut && (
                              <button
                                type="button"
                                onClick={() => onAttendanceEtut(etut)}
                                className="p-1 text-slate-400 hover:text-emerald-600 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                                title="Etüt Yoklaması & Devamsızlık Al"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              </button>
                            )}

                            {/* WhatsApp / Mail Bilgilendirme */}
                            {!readOnly && onNotifyEtut && (
                              <button
                                type="button"
                                onClick={() => onNotifyEtut(etut)}
                                className="p-1 text-slate-400 hover:text-emerald-600 rounded hover:bg-emerald-50 transition-colors cursor-pointer"
                                title="WhatsApp ve Mail ile İlet"
                              >
                                <MessageCircle className="w-3 h-3 text-emerald-600" />
                              </button>
                            )}

                            {/* Google Calendar */}
                            <a
                              href={createGoogleCalendarUrlForEtut(etut)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                              title="Google Takvime Ekle"
                            >
                              <CalendarCheck className="w-3 h-3 text-blue-600" />
                            </a>

                            {/* .ics Download */}
                            <button
                              type="button"
                              onClick={() =>
                                downloadIcsFile(
                                  `etut-${etut.id}`,
                                  `[ETÜT] ${etut.subject}: ${etut.topic}`,
                                  etut.notes || `${etut.location || 'Derslik'}`,
                                  `${etut.date}T${etut.time}:00`,
                                  etut.duration || 45,
                                  etut.location || 'Okul'
                                )
                              }
                              className="p-1 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                              title="iCal / Outlook Takvim İndir (.ics)"
                            >
                              <CalendarIcon className="w-3 h-3 text-amber-600" />
                            </button>

                            {/* Edit */}
                            {!readOnly && onEditEtut && (
                              <button
                                type="button"
                                onClick={() => onEditEtut(etut)}
                                className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Düzenle"
                              >
                                <Edit2 className="w-3 h-3 text-slate-600" />
                              </button>
                            )}

                            {/* Delete */}
                            {!readOnly && onDeleteEtut && (
                              <button
                                type="button"
                                onClick={() => onDeleteEtut(etut)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="w-3 h-3 text-rose-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MOBİL: 7 Sayfa Nokta Göstergeleri (Swipe Dots) */}
      <div className="md:hidden flex flex-col items-center justify-center space-y-1.5 pt-1 pb-2">
        <div className="flex items-center space-x-1.5">
          {weekDays.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollToDay(idx)}
              aria-label={`Gün ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === mobileActiveIndex
                  ? 'w-6 bg-indigo-500'
                  : 'w-1.5 bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] text-slate-400 flex items-center space-x-1 font-medium">
          <span>↔</span>
          <span>Günler arasında geçiş yapmak için sağa / sola kaydırın</span>
        </span>
      </div>
    </div>
  );
};
