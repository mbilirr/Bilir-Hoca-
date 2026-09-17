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
  onAddEtutForDate: (dateStr: string) => void;
  onEditEtut: (etut: Etut) => void;
  onDeleteEtut: (etut: Etut) => void;
  onNotifyEtut?: (etut: Etut) => void;
  onAttendanceEtut?: (etut: Etut) => void;
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

      {/* 7-Day Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayEtuts = etutsByDay[day.dateKey] || [];
          const hasEtuts = dayEtuts.length > 0;

          return (
            <div
              key={day.dateKey}
              className={`flex flex-col rounded-2xl border transition-all duration-200 min-h-[360px] ${
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
                  <button
                    type="button"
                    onClick={() => onAddEtutForDate(day.dateKey)}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-indigo-300 rounded-md transition-colors"
                    title={`${day.dayName} gününe etüt ekle`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Day Body / Etüt Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {dayEtuts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-8 text-center px-2">
                    <CalendarIcon className="w-6 h-6 text-slate-700 mb-1.5" />
                    <p className="text-[11px] text-slate-500 font-medium">Planlı etüt yok</p>
                    <button
                      type="button"
                      onClick={() => onAddEtutForDate(day.dateKey)}
                      className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1 rounded border border-dashed border-indigo-500/30 hover:bg-indigo-950/40 transition-colors flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Etüt Ekle</span>
                    </button>
                  </div>
                ) : (
                  dayEtuts.map((etut) => {
                    const colors = SUBJECT_COLORS[etut.subject] || {
                      bg: 'bg-slate-950/60',
                      text: 'text-indigo-300',
                      border: 'border-slate-800',
                      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
                    };

                    return (
                      <div
                        key={etut.id}
                        className={`p-2.5 rounded-xl border ${colors.bg} ${colors.border} hover:border-slate-600 transition-all text-xs group relative shadow-sm`}
                      >
                        {/* Subject & Time & Period */}
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                          <div className="flex items-center space-x-1">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${colors.badge}`}
                            >
                              {etut.subject}
                            </span>
                            {etut.lessonPeriod && etut.lessonPeriod !== 'Ders' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {etut.lessonPeriod}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-amber-300 font-semibold flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{etut.time}</span>
                          </span>
                        </div>

                        {/* Topic */}
                        <h5 className="font-bold text-slate-100 text-[11px] leading-tight mb-1 line-clamp-2">
                          {etut.topic}
                        </h5>

                        {/* Teacher */}
                        {etut.teacherName && (
                          <div className="flex items-center space-x-1 text-[10px] text-indigo-300 mb-1 truncate font-medium">
                            <span className="truncate">👨‍🏫 {etut.teacherName}</span>
                          </div>
                        )}

                        {/* Location */}
                        {etut.location && (
                          <div className="flex items-center space-x-1 text-[10px] text-slate-400 mb-1 truncate">
                            <MapPin className="w-2.5 h-2.5 text-rose-400 flex-shrink-0" />
                            <span className="truncate">{etut.location}</span>
                          </div>
                        )}

                        {/* Students */}
                        <div className="flex items-center space-x-1 text-[10px] text-slate-400 mb-2 truncate">
                          <Users className="w-2.5 h-2.5 text-indigo-400 flex-shrink-0" />
                          <span className="truncate">
                            {getAssignedStudentsSummary(etut.assignedStudentIds)}
                          </span>
                        </div>

                        {/* Quick Action Footer */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[10px]">
                          <span className="text-slate-500 font-mono">{etut.duration} dk</span>

                          <div className="flex items-center space-x-1 opacity-90 group-hover:opacity-100">
                            {/* Attendance / Yoklama */}
                            {onAttendanceEtut && (
                              <button
                                type="button"
                                onClick={() => onAttendanceEtut(etut)}
                                className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800 transition-colors"
                                title="Etüt Yoklaması & Devamsızlık Al"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                              </button>
                            )}

                            {/* WhatsApp / Mail Bilgilendirme */}
                            {onNotifyEtut && (
                              <button
                                type="button"
                                onClick={() => onNotifyEtut(etut)}
                                className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800 transition-colors"
                                title="WhatsApp ve Mail ile İlet"
                              >
                                <MessageCircle className="w-3 h-3" />
                              </button>
                            )}

                            {/* Google Calendar */}
                            <a
                              href={createGoogleCalendarUrlForEtut(etut)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-400 hover:text-blue-300 rounded hover:bg-slate-800"
                              title="Google Takvime Ekle"
                            >
                              <CalendarCheck className="w-3 h-3" />
                            </a>

                            {/* Edit */}
                            <button
                              type="button"
                              onClick={() => onEditEtut(etut)}
                              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                              title="Düzenle"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => onDeleteEtut(etut)}
                              className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                              title="Sil"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
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
    </div>
  );
};
