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

  // 5. Öğrencinin Bu Haftaki Soru Çözüm Verisi & Son 7 Günlük Dağılım Grafiği
  const questionLogs = dataService.getQuestionLogs();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const studentWeeklyQuestions = questionLogs
    .filter((l) => l.studentId === student.id && l.date >= weekAgoStr)
    .reduce((sum, l) => sum + (l.totalQuestions || 0), 0);

  // Son 7 günün günlük soru analitiği
  const last7DaysData = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('tr-TR', { weekday: 'short' });
      const count = questionLogs
        .filter((l) => l.studentId === student.id && l.date === dStr)
        .reduce((sum, l) => sum + (l.totalQuestions || 0), 0);
      days.push({ date: dStr, label: dayName, count });
    }
    return days;
  }, [questionLogs, student.id]);

  const maxDailyCount = Math.max(1, ...last7DaysData.map((d) => d.count));

  return (
    <div id="student-analytics-overview-wall" className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Duvar Başlığı */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#0f172a]">
              Akademik Başarı & Gelişim Göstergeleri
            </h3>
            <p className="text-[11px] text-slate-500">
              Kurs ödevleri, etütler, not ortalaması, soru analitiği ve başarı rozetlerinizin genel görünümü
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 bg-slate-100/80 px-2.5 py-1 rounded-full border border-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px] font-bold text-slate-700">Dönem Performans Özeti</span>
        </div>
      </div>

      {/* TEK DUVAR İÇİNDE YAN YANA 5 KUTU (Rozetler ve Not Ortalaması yer değiştirildi, Rozetler daha büyük ve dikkat çekici) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-stretch">
        {/* Kutu 1: Kurs & Ödev Bitirme */}
        <div
          onClick={() => onNavigateTab('homework')}
          className="col-span-1 sm:col-span-1 lg:col-span-2 bg-[#f8fafc] border border-slate-200/90 rounded-xl p-3.5 hover:border-orange-300 hover:bg-white hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="text-[11px] font-bold text-slate-600 truncate">Kurs & Ödev Bitirme</span>
              <div className="w-6 h-6 rounded-lg bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 group-hover:scale-105 transition-transform shrink-0">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-[#0f172a] tracking-tight">
                  %{completionPercentage}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Bitti</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-orange-500 to-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
                <span className="font-semibold">{completedHwsCount}/{totalHws} Ödev</span>
                <span className={pendingHwsCount > 0 ? 'text-orange-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {pendingHwsCount > 0 ? `${pendingHwsCount} Bekleyen` : 'Tamamı Bitti'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-orange-600 group-hover:text-orange-700">
            <span>Ödevlerime Git</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Kutu 2: Etüt & Birebir Destek */}
        <div
          onClick={() => onNavigateTab('etuts')}
          className="col-span-1 sm:col-span-1 lg:col-span-2 bg-[#f8fafc] border border-slate-200/90 rounded-xl p-3.5 hover:border-blue-300 hover:bg-white hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="text-[11px] font-bold text-slate-600 truncate">Etüt & Birebir Destek</span>
              <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform shrink-0">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-[#0f172a] tracking-tight">
                  {etuts.length}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Program</span>
              </div>

              <div className="mt-2 text-[10px] min-h-[30px] flex items-center">
                {todayEtuts.length > 0 ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px] truncate">
                    Bugün {todayEtuts.length} Etüt Var!
                  </span>
                ) : upcomingEtuts.length > 0 ? (
                  <span className="text-slate-600 text-[10px] truncate">
                    Yakın: <strong className="text-[#0f172a]">{upcomingEtuts[0].subject}</strong>
                  </span>
                ) : (
                  <span className="text-slate-400 text-[10px]">Aktif etüt yok</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-blue-600 group-hover:text-blue-700">
            <span>Etüt Programı</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Kutu 3: Akademik Başarı Rozetlerim (NOT ORTALAMA BAŞARI İLE YER DEĞİŞTİRİLDİ, DAHA BÜYÜK VE DİKKAT ÇEKİCİ) */}
        <div
          id="student-stats-academic-badges"
          className="col-span-1 sm:col-span-2 lg:col-span-4 bg-gradient-to-br from-amber-500/15 via-slate-900 to-amber-950/40 border-2 border-amber-400/90 rounded-xl p-3.5 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/40 flex flex-col justify-between relative overflow-hidden group"
        >
          {/* Subtle golden ambient glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-400/15 rounded-full blur-xl pointer-events-none" />

          <div>
            {/* Header: Title and Glowing Badge Status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <span className="text-xs sm:text-sm font-black text-amber-100 tracking-tight">
                  Akademik Başarı Rozetlerim
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[10px] shadow-sm flex items-center gap-1 shrink-0 animate-pulse">
                <Flame className="w-3 h-3 text-red-600 fill-red-600" />
                4/4 KAZANILDI
              </span>
            </div>

            {/* Score & Level Sub-Bar */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-amber-300 tracking-tight">
                  4 / 4
                </span>
                <span className="text-[10px] font-bold text-amber-200/80">Tamamlandı</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[10px] font-extrabold flex items-center space-x-1">
                <span>🏆 Seviye 1 Yıldız Öğrenci</span>
              </span>
            </div>

            {/* 4 Dikkat Çekici Büyük Rozet Kartı */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
              <div className="bg-slate-950/80 border border-amber-400/50 rounded-lg p-2 text-center shadow-inner hover:border-amber-300 transition-all">
                <span className="text-base sm:text-lg block">🎯</span>
                <span className="text-[10px] font-extrabold text-white block mt-0.5 truncate">Ödev Ustası</span>
                <span className="text-[8.5px] font-bold text-emerald-400 block">%100 Teslim</span>
              </div>
              <div className="bg-slate-950/80 border border-amber-400/50 rounded-lg p-2 text-center shadow-inner hover:border-amber-300 transition-all">
                <span className="text-base sm:text-lg block">⭐</span>
                <span className="text-[10px] font-extrabold text-white block mt-0.5 truncate">Etüt Yıldızı</span>
                <span className="text-[8.5px] font-bold text-amber-300 block">Tam Katılım</span>
              </div>
              <div className="bg-slate-950/80 border border-amber-400/50 rounded-lg p-2 text-center shadow-inner hover:border-amber-300 transition-all">
                <span className="text-base sm:text-lg block">🏆</span>
                <span className="text-[10px] font-extrabold text-white block mt-0.5 truncate">Soru Şampiyonu</span>
                <span className="text-[8.5px] font-bold text-blue-300 block">Haftalık Hedef</span>
              </div>
              <div className="bg-slate-950/80 border border-amber-400/50 rounded-lg p-2 text-center shadow-inner hover:border-amber-300 transition-all">
                <span className="text-base sm:text-lg block">🚀</span>
                <span className="text-[10px] font-extrabold text-white block mt-0.5 truncate">Gelişim Lideri</span>
                <span className="text-[8.5px] font-bold text-purple-300 block">Aktif Seri</span>
              </div>
            </div>
          </div>

          {/* Golden Progress and Status Footer */}
          <div className="pt-2 mt-2 border-t border-amber-500/30 flex items-center justify-between text-[10px] font-bold text-amber-200">
            <span className="flex items-center space-x-1">
              <span>✨ Tüm Dönem Rozetleri Açıldı</span>
            </span>
            <span className="text-amber-300 font-extrabold flex items-center space-x-1">
              <span>Süper Seri Aktif</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            </span>
          </div>
        </div>

        {/* Kutu 4: Soru Analitiği & Grafikler */}
        <div
          onClick={() => onNavigateTab('questions')}
          className="col-span-1 sm:col-span-1 lg:col-span-2 bg-[#f8fafc] border border-slate-200/90 rounded-xl p-3.5 hover:border-emerald-300 hover:bg-white hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="text-[11px] font-bold text-slate-600 truncate">Soru Analitiği & Grafikler</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform shrink-0">
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-emerald-700 tracking-tight">
                  {studentWeeklyQuestions}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Soru/Hafta</span>
              </div>

              {/* Son 7 Günlük Mini Çubuk Grafik */}
              <div className="mt-2 pt-0.5 flex items-end justify-between gap-1 h-7 bg-white px-1 py-0.5 rounded border border-slate-200/70">
                {last7DaysData.map((d, idx) => {
                  const heightPercent = maxDailyCount > 0 ? Math.max(15, Math.round((d.count / maxDailyCount) * 100)) : 15;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group/bar" title={`${d.label} (${d.date}): ${d.count} Soru`}>
                      <div
                        className={`w-full rounded-t transition-all ${
                          d.count > 0 ? 'bg-emerald-500 group-hover/bar:bg-emerald-600' : 'bg-slate-200'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                      <span className="text-[7px] text-slate-400 font-mono mt-0.5 leading-none">
                        {d.label.slice(0, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-emerald-600 group-hover:text-emerald-700">
            <span>Soru Analizine Git</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Kutu 5: Not Ortalama Başarı (AKADEMİK BAŞARI ROZETLERİM İLE YER DEĞİŞTİRİLDİ) */}
        <div
          onClick={() => onNavigateTab('grades')}
          className="col-span-1 sm:col-span-1 lg:col-span-2 bg-[#f8fafc] border border-slate-200/90 rounded-xl p-3.5 hover:border-purple-300 hover:bg-white hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span className="text-[11px] font-bold text-slate-600 truncate">Not Ortalama Başarı</span>
              <div className="w-6 h-6 rounded-lg bg-purple-50 border border-purple-200/80 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform shrink-0">
                <Award className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-2xl font-black text-[#0f172a] tracking-tight">
                  {averageScore !== null ? averageScore : '—'}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">/ 100</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-1 text-[10px] min-h-[30px]">
                <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-white font-bold text-[9px] truncate">
                  {letterGrade}
                </span>
                <span className="text-slate-500 font-medium truncate">
                  {myGrades.length} Not Kaydı
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-purple-600 group-hover:text-purple-700">
            <span>Karneler & Notlar</span>
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
