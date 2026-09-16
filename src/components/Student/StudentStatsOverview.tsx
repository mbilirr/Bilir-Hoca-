import React, { useMemo } from 'react';
import {
  BookOpen,
  Calendar,
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Target,
  Flame,
  Zap,
  HelpCircle,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import { Student, Homework, HomeworkSubmission, Etut, GradeRecord, AttendanceRecord } from '../../types';
import { StudentTabType } from './StudentHeroBanner';
import { dataService } from '../../services/dataService';

interface StudentStatsOverviewProps {
  student: Student;
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
  onNavigateTab: (tab: StudentTabType) => void;
}

export const StudentStatsOverview: React.FC<StudentStatsOverviewProps> = ({
  student,
  homeworks,
  submissions,
  etuts,
  grades,
  attendance,
  onNavigateTab,
}) => {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // 1. Ödev & Kurs Tamamlama İstatistikleri
  const mySubmissions = useMemo(() => {
    return submissions.filter((sub) => sub.studentId === student.id);
  }, [submissions, student.id]);

  const completedHwIds = useMemo(() => {
    return new Set(mySubmissions.map((s) => s.homeworkId));
  }, [mySubmissions]);

  const totalHws = homeworks.length;
  const completedHwsCount = completedHwIds.size;
  const pendingHwsCount = Math.max(0, totalHws - completedHwsCount);
  const completionPercentage = totalHws > 0 ? Math.round((completedHwsCount / totalHws) * 100) : 100;

  // Yaklaşan acil ödevler
  const urgentHomeworks = useMemo(() => {
    return homeworks
      .filter((hw) => !completedHwIds.has(hw.id) && hw.dueDate && hw.dueDate.slice(0, 10) >= todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 4);
  }, [homeworks, completedHwIds, todayStr]);

  // 2. Etüt İstatistikleri
  const todayEtuts = useMemo(() => {
    return etuts.filter((e) => e.date === todayStr);
  }, [etuts, todayStr]);

  const upcomingEtuts = useMemo(() => {
    return etuts
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 3);
  }, [etuts, todayStr]);

  // 3. Not Ortalaması
  const myGrades = useMemo(() => {
    return grades.filter((g) => g.studentId === student.id && g.score !== undefined);
  }, [grades, student.id]);

  const averageScore = useMemo(() => {
    if (myGrades.length === 0) return null;
    const sum = myGrades.reduce((acc, g) => acc + (g.score || 0), 0);
    return Math.round((sum / myGrades.length) * 10) / 10;
  }, [myGrades]);

  const letterGrade = useMemo(() => {
    if (averageScore === null) return '—';
    if (averageScore >= 85) return 'Pekiyi (5)';
    if (averageScore >= 70) return 'İyi (4)';
    if (averageScore >= 55) return 'Orta (3)';
    if (averageScore >= 45) return 'Geçer (2)';
    return 'Geliştirilmeli (1)';
  }, [averageScore]);

  // 4. Devamsızlık
  const { presentDays, absentDays, totalAttendanceDays } = useMemo(() => {
    let present = 0;
    let absent = 0;
    let total = 0;

    attendance.forEach((att) => {
      const record = att.records.find((r) => r.studentId === student.id);
      if (record) {
        total++;
        if (record.status === 'present') present++;
        else if (record.status === 'absent') absent++;
      }
    });

    return { presentDays: present, absentDays: absent, totalAttendanceDays: total };
  }, [attendance, student.id]);

  const attendanceRate = useMemo(() => {
    if (totalAttendanceDays === 0) return 100;
    return Math.round((presentDays / totalAttendanceDays) * 100);
  }, [totalAttendanceDays, presentDays]);

  // 5. Öğrencinin Bu Haftaki Soru Çözüm Verisi
  const questionLogs = dataService.getQuestionLogs();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const studentWeeklyQuestions = questionLogs
    .filter((l) => l.studentId === student.id && l.date >= weekAgoStr)
    .reduce((sum, l) => sum + (l.totalQuestions || 0), 0);

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

  return (
    <div className="w-full space-y-6">
      {/* ========================================================================= */}
      {/* GOOGLE LOOKER STUDIO - EXECUTIVE KPI SCORECARDS                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Kurs & Ödev Bitirme Oranı */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="uppercase tracking-wider text-[11px] font-bold text-slate-500">
                Kurs & Ödev Bitirme
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                  %{completionPercentage}
                </span>
                <span className="text-xs font-semibold text-slate-500">Tamamlandı</span>
              </div>

              {/* Looker Studio Progress Bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-500 mt-2">
                <span>{completedHwsCount} / {totalHws} Ödev</span>
                <span className={pendingHwsCount > 0 ? 'text-orange-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {pendingHwsCount > 0 ? `${pendingHwsCount} Bekleyen` : 'Tümü Bitti'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-orange-600 pt-3 mt-3 border-t border-slate-100 transition-colors">
            <span>Ödevleri İncele</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-orange-500" />
          </div>
        </div>

        {/* Card 2: Etüt Programı & Birebir */}
        <div
          onClick={() => onNavigateTab('etuts')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="uppercase tracking-wider text-[11px] font-bold text-slate-500">
                Etüt & Birebir Destek
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#f1f5f9] border border-slate-200 flex items-center justify-center text-[#1e3a8a] group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                  {etuts.length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Kayıtlı Etüt</span>
              </div>

              <div className="mt-2 text-xs">
                {todayEtuts.length > 0 ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 font-bold text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping inline-block mr-1" />
                    Bugün {todayEtuts.length} Etüdünüz Var!
                  </span>
                ) : upcomingEtuts.length > 0 ? (
                  <span className="text-slate-600 text-[11px] block truncate">
                    En yakın: <strong className="text-[#0f172a]">{upcomingEtuts[0].subject}</strong> ({upcomingEtuts[0].date})
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Planlanmış aktif etüt yok</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-[#1e3a8a] pt-3 mt-3 border-t border-slate-100 transition-colors">
            <span>Etüt Programını Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-[#1e3a8a]" />
          </div>
        </div>

        {/* Card 3: Akademik Not Ortalaması */}
        <div
          onClick={() => onNavigateTab('grades')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="uppercase tracking-wider text-[11px] font-bold text-slate-500">
                Not Ortalaması & Başarı
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform">
                <Award className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                  {averageScore !== null ? averageScore : '—'}
                </span>
                <span className="text-xs font-semibold text-slate-500">/ 100 Puan</span>
              </div>

              <div className="mt-2 flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-md bg-[#0f172a] text-white font-bold text-[11px]">
                  {letterGrade}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {myGrades.length} Not Kaydı
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-orange-600 pt-3 mt-3 border-t border-slate-100 transition-colors">
            <span>Karnemi İncele</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-orange-500" />
          </div>
        </div>

        {/* Card 4: Soru Çözümü & Çalışma Disiplini */}
        <div
          onClick={() => onNavigateTab('questions')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="uppercase tracking-wider text-[11px] font-bold text-slate-500">
                Soru Sayısı & Disiplin
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#f1f5f9] border border-slate-200 flex items-center justify-center text-[#1e3a8a] group-hover:scale-105 transition-transform">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-[#1e3a8a] tracking-tight">
                  {studentWeeklyQuestions}
                </span>
                <span className="text-xs font-semibold text-slate-500">Soru / Bu Hafta</span>
              </div>

              <div className="mt-2 flex items-center space-x-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                  Devamlılık: %{attendanceRate}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-[#0f172a] group-hover:text-[#1e3a8a] pt-3 mt-3 border-t border-slate-100 transition-colors">
            <span>Soru Analitiği ve Grafikler</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-[#1e3a8a]" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: TIMELINE / URGENT TASKS & UPCOMING ETUTS                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Yaklaşan Acil Ödevler (8 Columns) */}
        <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0f172a]">Yaklaşan Ödevler ve Görevler</h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('homework')}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
            >
              Tümünü Gör ({totalHws}) →
            </button>
          </div>

          {urgentHomeworks.length > 0 ? (
            <div className="space-y-3">
              {urgentHomeworks.map((hw) => (
                <div
                  key={hw.id}
                  onClick={() => onNavigateTab('homework')}
                  className="p-4 rounded-xl bg-[#f8fafc] border border-slate-200 hover:border-orange-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#1e3a8a] shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#0f172a] group-hover:text-orange-600 transition-colors">
                        {hw.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[#334155] font-semibold">
                          {hw.subject}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold">
                          {formatDueDateLabel(hw.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-4 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold shrink-0 self-start sm:self-center transition-colors shadow-xs"
                  >
                    Ödevi Aç
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#f8fafc] rounded-xl border border-slate-200 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-[#0f172a]">Harika! Bekleyen acil ödeviniz bulunmuyor.</p>
            </div>
          )}
        </div>

        {/* Başarı Rozetleri & Motivasyon (4 Columns) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0f172a]">Başarı Rozetlerim</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-center space-y-1">
              <span className="text-2xl block">🎯</span>
              <span className="text-xs font-black text-[#0f172a] block">Zamanında Teslim</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-center space-y-1">
              <span className="text-2xl block">⭐</span>
              <span className="text-xs font-black text-[#0f172a] block">Etüt Yıldızı</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-center space-y-1">
              <span className="text-2xl block">🏆</span>
              <span className="text-xs font-black text-[#0f172a] block">Çalışkan Genç</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-slate-200 text-center space-y-1">
              <span className="text-2xl block">🚀</span>
              <span className="text-xs font-black text-[#0f172a] block">Gelişim Lideri</span>
            </div>
          </div>

          <div className="p-3.5 bg-orange-50/70 border border-orange-200/80 rounded-xl flex items-center space-x-2.5 text-xs text-orange-950 font-medium">
            <Flame className="w-4 h-4 text-orange-600 shrink-0" />
            <span>Hedefine odaklan ve her gün bir soru daha çözerek geleceğini inşa et!</span>
          </div>
        </div>
      </div>
    </div>
  );
};
