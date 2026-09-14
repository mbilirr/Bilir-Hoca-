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
} from 'lucide-react';
import { Student, Homework, HomeworkSubmission, Etut, GradeRecord, AttendanceRecord } from '../../types';
import { StudentTabType } from './StudentHeroBanner';

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

  // 1. Ödev İstatistikleri
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

  // Yaklaşan acil ödevler (Son teslim tarihi bugün veya önümüzdeki 3 gün olanlar)
  const urgentHomeworks = useMemo(() => {
    return homeworks
      .filter((hw) => !completedHwIds.has(hw.id) && hw.dueDate && hw.dueDate.slice(0, 10) >= todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 3);
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
      {/* =========================================================================
          SECTION 1: 4 LARGE METRIC STATUS CARDS
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ödev Durumu */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Ödevler & Kazanımlar</span>
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black text-white">{completedHwsCount}</span>
              <span className="text-xs font-semibold text-slate-400">/ {totalHws} Tamamlandı</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
              <span>%{completionPercentage} Tamamlama</span>
              <span className={pendingHwsCount > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                {pendingHwsCount > 0 ? `${pendingHwsCount} Bekleyen Ödev` : 'Hepsi Teslim Edildi'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-indigo-400 group-hover:text-indigo-300 pt-2 border-t border-slate-800/80">
            <span>Ödevleri Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Card 2: Etüt Programı */}
        <div
          onClick={() => onNavigateTab('etuts')}
          className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-600/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Etüt & Birebir Destek</span>
            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <Calendar className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black text-white">{etuts.length}</span>
              <span className="text-xs font-semibold text-slate-400">Kayıtlı Etüt</span>
            </div>

            <div className="mt-2 text-xs">
              {todayEtuts.length > 0 ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[11px] animate-pulse">
                  <span>⚡ Bugün {todayEtuts.length} Etüdünüz Var!</span>
                </span>
              ) : upcomingEtuts.length > 0 ? (
                <span className="text-slate-400 text-[11px]">
                  En yakın: <strong className="text-cyan-300">{upcomingEtuts[0].subject}</strong> ({upcomingEtuts[0].date})
                </span>
              ) : (
                <span className="text-slate-500 text-[11px]">Planlanmış aktif etüt yok</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-cyan-400 group-hover:text-cyan-300 pt-2 border-t border-slate-800/80">
            <span>Etüt Programını Aç</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Card 3: Akademik Not Ortalaması */}
        <div
          onClick={() => onNavigateTab('grades')}
          className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-600/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Akademik Not Ortalaması</span>
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black text-white">
                {averageScore !== null ? averageScore : '—'}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ 100</span>
            </div>

            <div className="mt-2 flex items-center space-x-2 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[11px]">
                {letterGrade}
              </span>
              <span className="text-[10px] text-slate-400">
                {myGrades.length} Not Kaydı
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-amber-400 group-hover:text-amber-300 pt-2 border-t border-slate-800/80">
            <span>Notları & Karnemi İncele</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Card 4: Devam Durumu */}
        <div
          onClick={() => onNavigateTab('grades')}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-3xl p-5 shadow-xl transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-600/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">Derse Devam Oranı</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-black text-white">%{attendanceRate}</span>
              <span className="text-xs font-semibold text-slate-400">Katılım</span>
            </div>

            <div className="mt-2 flex items-center space-x-2 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">
                {presentDays} Gün Var
              </span>
              {absentDays > 0 && (
                <span className="text-[10px] text-rose-400 font-semibold">
                  {absentDays} Gün Yok
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:text-emerald-300 pt-2 border-t border-slate-800/80">
            <span>Devam Geçmişini Gör</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: TIMELINE / URGENT TASKS & UPCOMING ETUTS
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Yaklaşan Acil Ödevler (8 Columns) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Target className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">Yaklaşan Ödevler & Görevler</h3>
                <p className="text-[11px] text-slate-400">Son teslim tarihi yaklaşan ödevlerinizi gecikmeden teslim edin</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('homework')}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Tümünü Gör ({totalHws})
            </button>
          </div>

          {urgentHomeworks.length > 0 ? (
            <div className="space-y-3">
              {urgentHomeworks.map((hw) => (
                <div
                  key={hw.id}
                  onClick={() => onNavigateTab('homework')}
                  className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                        {hw.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                          {hw.subject}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                          {formatDueDateLabel(hw.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shrink-0 self-start sm:self-center transition-colors shadow-md"
                  >
                    Ödevi İncele
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center bg-slate-950/40 rounded-2xl border border-slate-800/80 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs sm:text-sm font-bold text-white">Harika! Bekleyen acil ödeviniz bulunmuyor.</p>
              <p className="text-[11px] text-slate-400">Tüm ödevlerinizi zamanında teslim ettiğiniz için teşekkürler.</p>
            </div>
          )}
        </div>

        {/* Başarı Rozetleri & Motivasyon (4 Columns) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 flex flex-col justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">Başarı Rozetlerim</h3>
              <p className="text-[11px] text-slate-400">Akademik disiplin ve motivasyon rozetleri</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
              <span className="text-2xl block">🎯</span>
              <span className="text-xs font-black text-white block">Zamanında Teslim</span>
              <span className="text-[10px] text-slate-400">Düzenli Ödevci</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
              <span className="text-2xl block">⭐</span>
              <span className="text-xs font-black text-white block">Etüt Yıldızı</span>
              <span className="text-[10px] text-slate-400">Aktif Katılım</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
              <span className="text-2xl block">🏆</span>
              <span className="text-xs font-black text-white block">Çalışkan Genç</span>
              <span className="text-[10px] text-slate-400">Yüksek Puan</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-1">
              <span className="text-2xl block">🚀</span>
              <span className="text-xs font-black text-white block">Gelişim Lideri</span>
              <span className="text-[10px] text-slate-400">Sürekli İlerleme</span>
            </div>
          </div>

          <div className="p-3 bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-500/30 rounded-2xl flex items-center space-x-2.5 text-xs text-purple-200">
            <Flame className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Hedefine odaklan ve her gün bir soru daha çözerek geleceğini inşa et!</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: QUICK MODULE SHORTCUTS CARDS (Ödevler, Etütler, Notlar, Mesajlaşma)
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
        <button
          type="button"
          onClick={() => onNavigateTab('homework')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/60 transition-all flex items-center space-x-3 text-left group cursor-pointer shadow-md hover:scale-[1.02]"
        >
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white group-hover:text-indigo-300 transition-colors">
              Ödevlerim & Kazanımlar
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Tüm ders ödevleri ve teslimleri</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('etuts')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-cyan-500/60 transition-all flex items-center space-x-3 text-left group cursor-pointer shadow-md hover:scale-[1.02]"
        >
          <div className="w-11 h-11 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white group-hover:text-cyan-300 transition-colors">
              Etüt Programım
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Birebir etüt ve konu tekrarı</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('grades')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/60 transition-all flex items-center space-x-3 text-left group cursor-pointer shadow-md hover:scale-[1.02]"
        >
          <div className="w-11 h-11 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">
              Notlarım & Devamsızlık
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Sınav sonuçları ve karne grafiği</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('messages')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/60 transition-all flex items-center space-x-3 text-left group cursor-pointer shadow-md hover:scale-[1.02]"
        >
          <div className="w-11 h-11 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white group-hover:text-emerald-300 transition-colors">
              Öğretmene Soru Sor
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Öğretmeninizle birebir mesajlaşın</p>
          </div>
        </button>
      </div>
    </div>
  );
};
