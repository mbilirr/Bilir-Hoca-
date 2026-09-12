import React from 'react';
import {
  Users,
  CalendarClock,
  Clock,
  AlertTriangle,
  BookOpen,
  ArrowUpRight,
  TrendingUp,
  CheckCircle2,
  CalendarDays,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import { Student, ClassGroup, Homework, HomeworkSubmission, Etut, TeacherTabType } from '../../types';

interface TeacherStatsOverviewProps {
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  onNavigateTab: (tab: TeacherTabType) => void;
  headerRightSlot?: React.ReactNode;
  currentRole?: 'teacher' | 'student';
  onRoleChange?: (role: 'teacher' | 'student') => void;
}

export const TeacherStatsOverview: React.FC<TeacherStatsOverviewProps> = ({
  students,
  classes,
  homeworks,
  submissions,
  etuts,
  onNavigateTab,
  headerRightSlot,
  currentRole = 'teacher',
  onRoleChange,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const maxUpcomingStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // 1. YAKLAŞAN ÖDEVLER HESABI
  const safeHomeworks = Array.isArray(homeworks) ? homeworks : [];
  const upcomingHomeworks = safeHomeworks
    .filter((hw) => {
      if (!hw || !hw.dueDate) return false;
      const dueDay = hw.dueDate.slice(0, 10);
      return dueDay >= todayStr;
    })
    .sort((a, b) => (a?.dueDate || '').localeCompare(b?.dueDate || ''));

  const nextHomework = upcomingHomeworks[0];
  const dueTodayHomeworks = upcomingHomeworks.filter(
    (hw) => hw.dueDate && hw.dueDate.slice(0, 10) === todayStr
  );

  const formatHomeworkDueDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const day = dateStr.slice(0, 10);
    const time = dateStr.includes('T') ? dateStr.slice(11, 16) : '';
    if (day === todayStr) {
      return `Bugün${time ? ` ${time}` : ''}`;
    }
    const [year, month, d] = day.split('-');
    return `${d}.${month}.${year}${time ? ` ${time}` : ''}`;
  };

  // 2. ETÜT İSTATİSTİKLERİ
  const safeEtuts = Array.isArray(etuts) ? etuts : [];
  const todayEtuts = safeEtuts.filter((e) => e && e.date === todayStr);
  const upcomingEtuts = safeEtuts
    .filter((e) => e && e.date && e.date >= todayStr && e.date <= maxUpcomingStr)
    .sort((a, b) => {
      const dateA = a?.date || '';
      const dateB = b?.date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a?.time || '').localeCompare(b?.time || '');
    });

  const nextEtut = upcomingEtuts[0];

  // 3. TAMAMLANMAMIŞ ÖDEV ORANI HESABI
  // Her ödevin hedeflediği öğrenci sayısını toplayıp toplam beklenen teslimatı bulalım
  let totalExpectedSubmissions = 0;
  homeworks.forEach((hw) => {
    if (hw.assignedTo === 'all') {
      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
        const classStudents = students.filter((s) => hw.targetClassIds.includes(s.classId));
        totalExpectedSubmissions += Math.max(classStudents.length, 1);
      } else {
        totalExpectedSubmissions += students.length;
      }
    } else if (Array.isArray(hw.assignedTo)) {
      totalExpectedSubmissions += hw.assignedTo.length;
    } else {
      totalExpectedSubmissions += 1;
    }
  });

  // Eğer öğrenci veya ödev yoksa fallback
  if (totalExpectedSubmissions === 0 && homeworks.length > 0) {
    totalExpectedSubmissions = homeworks.length * Math.max(students.length, 1);
  }

  // Teslim edilen geçerli ödevler (on_time veya late)
  const completedSubmissionsCount = submissions.filter(
    (s) => s.status === 'on_time' || s.status === 'late'
  ).length;

  const pendingSubmissionsCount = Math.max(
    0,
    totalExpectedSubmissions - completedSubmissionsCount
  );

  const uncompletedRate =
    totalExpectedSubmissions > 0
      ? Math.min(100, Math.round((pendingSubmissionsCount / totalExpectedSubmissions) * 100))
      : 0;

  const completedRate = 100 - uncompletedRate;

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl transition-all">
      {/* Top Banner Bar with Title, Profile Role Switcher, and Right Slot (Bell, etc.) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Durum Özetleri
              </h3>
            </div>
          </div>

          {/* Öğretmen ve Öğrenci Profili Geçiş Butonu */}
          {onRoleChange && (
            <div
              className="inline-flex items-center bg-slate-950/80 p-0.5 rounded-xl border border-slate-700/80 shadow-inner"
              title="Öğretmen ve Öğrenci Profili Arasında Geçiş Yapın"
            >
              <button
                type="button"
                onClick={() => onRoleChange('teacher')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'teacher'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-sm ring-1 ring-indigo-400/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Öğretmen</span>
              </button>

              <button
                type="button"
                onClick={() => onRoleChange('student')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currentRole === 'student'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm ring-1 ring-emerald-400/40'
                    : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/70'
                }`}
                title="Öğrenci profili ve portal görünümüne geçiş yap"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Öğrenci Profili</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Corner Slot for Notification Bell or Quick Action */}
        {headerRightSlot && (
          <div className="flex items-center space-x-2 self-end sm:self-auto">{headerRightSlot}</div>
        )}
      </div>

      {/* 3 Main Statistics Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {/* ================= CARD 1: YAKLAŞAN ÖDEVLER ================= */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="group relative bg-slate-950/60 hover:bg-slate-950 border border-slate-800/90 hover:border-indigo-500/50 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-indigo-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Yaklaşan Ödevler
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2.5">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {upcomingHomeworks.length}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                  dueTodayHomeworks.length > 0
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : upcomingHomeworks.length > 0
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {dueTodayHomeworks.length > 0
                  ? `Bugün ${dueTodayHomeworks.length} Teslim`
                  : upcomingHomeworks.length > 0
                  ? `${upcomingHomeworks.length} Aktif Ödev`
                  : 'Yaklaşan Ödev Yok'}
              </span>
            </div>

            {nextHomework ? (
              <p className="text-xs text-slate-400 mt-2 truncate">
                <span className="text-indigo-400 font-medium">En Yakın Teslim:</span>{' '}
                <span className="text-slate-200 font-medium">
                  {formatHomeworkDueDate(nextHomework.dueDate)}
                </span>{' '}
                • {nextHomework.subject} ({nextHomework.title})
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                Önümüzdeki günlerde teslim tarihi yaklaşan yeni ödev bulunmuyor
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
            <span>Kazanım & Ödev Çizelgesi</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* ================= CARD 2: BUGÜN & YAKLAŞAN ETÜTLER ================= */}
        <div
          onClick={() => onNavigateTab('etuts')}
          className="group relative bg-slate-950/60 hover:bg-slate-950 border border-slate-800/90 hover:border-amber-500/50 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-amber-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Bugün & Yaklaşan Etütler
              </span>
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center group-hover:scale-110 transition-all ${
                  todayEtuts.length > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 group-hover:bg-amber-500 group-hover:text-slate-950'
                    : 'bg-slate-800 text-slate-400 border-slate-700 group-hover:bg-slate-700 group-hover:text-white'
                }`}
              >
                <CalendarClock className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2.5">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {todayEtuts.length}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                  todayEtuts.length > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {todayEtuts.length > 0 ? 'Bugün Planlandı' : 'Bugün Etüt Yok'}
              </span>
            </div>

            {nextEtut ? (
              <p className="text-xs text-slate-400 mt-2 truncate">
                <span className="text-amber-400 font-medium">En Yakın:</span>{' '}
                <span className="text-slate-200 font-medium">
                  {nextEtut.date === todayStr ? 'Bugün' : nextEtut.date} {nextEtut.time}
                </span>{' '}
                • {nextEtut.subject} ({nextEtut.topic})
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                Önümüzdeki günlerde planlanmış yeni etüt bulunmuyor
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-amber-400 group-hover:text-amber-300">
            <span>
              {upcomingEtuts.length > 0
                ? `Toplam ${upcomingEtuts.length} Yaklaşan Oturum`
                : 'Etüt Takvimini Aç'}
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* ================= CARD 3: TAMAMLANMAMIŞ ÖDEV ORANI ================= */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="group relative bg-slate-950/60 hover:bg-slate-950 border border-slate-800/90 hover:border-rose-500/50 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-rose-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Tamamlanmamış Ödev Oranı
              </span>
              <div
                className={`w-9 h-9 rounded-xl border flex items-center justify-center group-hover:scale-110 transition-all ${
                  uncompletedRate > 50
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 group-hover:bg-rose-600 group-hover:text-white'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30 group-hover:bg-blue-600 group-hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline space-x-2.5">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                %{uncompletedRate}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                  uncompletedRate > 50
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : uncompletedRate > 20
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {uncompletedRate > 50 ? 'Yüksek Eksik' : 'Teslim Bekliyor'}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-2.5">
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${completedRate}%` }}
                  className="bg-emerald-500 transition-all duration-500"
                  title={`Tamamlanan: %${completedRate}`}
                />
                <div
                  style={{ width: `${uncompletedRate}%` }}
                  className="bg-rose-500 transition-all duration-500"
                  title={`Tamamlanmamış: %${uncompletedRate}`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
                <span>
                  <strong className="text-rose-400">{pendingSubmissionsCount}</strong> teslim bekliyor
                </span>
                <span>
                  <strong className="text-emerald-400">{completedSubmissionsCount}</strong> teslim edildi
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-rose-400 group-hover:text-rose-300">
            <span>Ödev Çizelgesi & Kazanımlar</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
