import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Calendar,
  Users,
  User,
  GraduationCap,
  Download,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Award,
  Search,
  Filter,
  Check,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts';
import { Student, ClassGroup, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import {
  computeWeeklyAnalytics,
  computeMonthlyAnalytics,
  downloadWeeklyPDF,
  downloadMonthlyPDF,
  formatTurkishDate,
  formatDateISO,
  TURKISH_MONTHS,
} from '../../utils/questionAnalytics';

interface QuestionTrackingViewProps {
  classes: ClassGroup[];
  students: Student[];
}

export const QuestionTrackingView: React.FC<QuestionTrackingViewProps> = ({
  classes,
  students,
}) => {
  // Class selection (defaults to first class or 'all')
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return classes.length > 0 ? classes[0].id : '';
  });

  // Students in selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId || selectedClassId === 'all') return students;
    return students.filter((s) => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Selected student
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    return classStudents.length > 0 ? classStudents[0].id : '';
  });

  // Whenever class changes, update student selection if needed
  useEffect(() => {
    if (classStudents.length > 0 && !classStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [classStudents, selectedStudentId]);

  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || classStudents[0] || students[0];
  }, [students, selectedStudentId, classStudents]);

  const activeClass = useMemo(() => {
    return classes.find((c) => c.id === activeStudent?.classId);
  }, [classes, activeStudent]);

  // View modes: 'weekly' (Haftalık Analiz & Grafik) | 'monthly' (Aylık Analiz & Grafik) | 'class_overview' (Sınıf Özeti)
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<'weekly' | 'monthly' | 'class_overview'>('weekly');

  // Date offsets
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Question logs
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  // Compute weekly analytics for active student
  const targetWeekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weeklyAnalytics = useMemo(() => {
    if (!activeStudent) return null;
    return computeWeeklyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      targetWeekDate
    );
  }, [allLogs, activeStudent, activeClass, targetWeekDate]);

  // Compute monthly analytics for active student
  const monthlyAnalytics = useMemo(() => {
    if (!activeStudent) return null;
    return computeMonthlyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || activeClass?.name || 'Sınıf Belirtilmedi',
      monthDate.year,
      monthDate.month
    );
  }, [allLogs, activeStudent, activeClass, monthDate]);

  // Class overview calculations (summarize question numbers for all students in the class)
  const classOverviewData = useMemo(() => {
    if (!activeClass) return [];
    return classStudents.map((st) => {
      const stWeekly = computeWeeklyAnalytics(
        allLogs,
        st.id,
        st.name,
        activeClass.name,
        targetWeekDate
      );
      const stMonthly = computeMonthlyAnalytics(
        allLogs,
        st.id,
        st.name,
        activeClass.name,
        monthDate.year,
        monthDate.month
      );
      return {
        student: st,
        weeklyTotal: stWeekly.totalQuestions,
        weeklyAvg: stWeekly.dailyAverage,
        unsolvedDaysCount: stWeekly.unsolvedDaysCount,
        unsolvedDays: stWeekly.unsolvedDays,
        weeklyDiff: stWeekly.weeklyDifference,
        weeklyGrowthRate: stWeekly.weeklyGrowthRate,
        monthlyTotal: stMonthly.totalQuestions,
        monthlyDiff: stMonthly.monthlyDifference,
        badgeText: stWeekly.statusAssessment.badgeText,
        badgeClass: stWeekly.statusAssessment.badgeClass,
      };
    }).sort((a, b) => b.weeklyTotal - a.weeklyTotal);
  }, [activeClass, classStudents, allLogs, targetWeekDate, monthDate]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Dropdown Selection Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Öğrenci Soru Sayısı Takip ve Analiz Modülü
                </h2>
                <p className="text-xs text-slate-400">
                  Öğrencilerin çözdüğü soru sayılarının günlük, haftalık ve aylık yazılı ve grafik analizleri
                </p>
              </div>
            </div>
          </div>

          {/* Sınıf ve Öğrenci Seçim Açılır Pencereleri (User Explicit Requirement) */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-800/90 p-3 rounded-2xl border border-slate-700/80 shadow-md">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                Sınıf Seçiniz
              </label>
              <select
                id="teacher-tracking-class-select"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs font-semibold text-white rounded-xl px-3.5 py-2 focus:outline-none focus:border-indigo-500 min-w-[140px]"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.gradeLevel || ''})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-400" />
                Öğrenci Seçiniz
              </label>
              <select
                id="teacher-tracking-student-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs font-bold text-white rounded-xl px-3.5 py-2 focus:outline-none focus:border-purple-500 min-w-[180px]"
              >
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.studentNumber ? `(No: ${s.studentNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              id="teacher-tab-weekly"
              onClick={() => setActiveAnalysisMode('weekly')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeAnalysisMode === 'weekly'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Haftalık Analiz & Grafik
            </button>

            <button
              id="teacher-tab-monthly"
              onClick={() => setActiveAnalysisMode('monthly')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeAnalysisMode === 'monthly'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Aylık Analiz & Grafik
            </button>

            <button
              id="teacher-tab-class-overview"
              onClick={() => setActiveAnalysisMode('class_overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeAnalysisMode === 'class_overview'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              Sınıf Genel Özeti & Sıralama
            </button>
          </div>

          {/* Quick PDF Action */}
          {activeStudent && (
            <div className="flex items-center gap-2">
              {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
                <button
                  id="btn-teacher-pdf-weekly"
                  onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                  className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Haftalık Raporu PDF İndir
                </button>
              )}
              {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
                <button
                  id="btn-teacher-pdf-monthly"
                  onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                  className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Aylık Raporu PDF İndir
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!activeStudent ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          Lütfen analizini incelemek istediğiniz sınıf ve öğrenciyi seçiniz.
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/* TAB 1: HAFTALIK ANALİZ VE GRAFİK (USER DETAILED SPEC)   */}
          {/* ======================================================== */}
          {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
            <div className="space-y-6">
              {/* Week Selector Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="Önceki Hafta"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Bu Hafta (Güncel Dönem)' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                    </span>
                    <h3 className="text-sm font-bold text-white">
                      Haftanın Tarihi: <span className="text-indigo-300">{weeklyAnalytics.weekLabel}</span>
                    </h3>
                  </div>
                  <button
                    onClick={() => setWeekOffset((prev) => Math.min(0, prev + 1))}
                    disabled={weekOffset >= 0}
                    className={`p-2 rounded-xl transition-colors ${
                      weekOffset >= 0
                        ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Sonraki Hafta"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Student Info Pill */}
                <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/60">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                    {activeStudent.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">{activeStudent.name}</span>
                    <span className="text-[11px] text-slate-400">{activeStudent.className || activeClass?.name}</span>
                  </div>
                </div>
              </div>

              {/* Requirement: Öğrenci ismi, günler, haftanın tarihi, günlük çözülen toplam soru sayıları, soru çözülmeyen günler ve haftalık çözülen toplam soru sayısı, geçmiş haftalara göre ilerleme durumu başarı durumu rapor olarak verilsin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Haftalık Toplam */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Haftalık Çözülen Toplam Soru</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-indigo-400">{weeklyAnalytics.totalQuestions}</span>
                    <span className="text-xs text-slate-400">Soru</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">
                    Günlük ortalama: <strong className="text-slate-200">{weeklyAnalytics.dailyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Günlük Toplamlar & Aktif Günler */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Soru Çözülen Gün Sayısı</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">
                      {weeklyAnalytics.solvedDaysCount} <span className="text-base text-slate-400 font-medium">/ 7 Gün</span>
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">
                    Haftalık disiplin: %{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}
                  </div>
                </div>

                {/* 3. Soru Çözülmeyen Günler (Vurgulu ve Açıkça İstenen) */}
                <div className={`bg-slate-900 border rounded-2xl p-5 shadow-lg ${
                  weeklyAnalytics.unsolvedDaysCount > 0
                    ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent'
                    : 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-transparent'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Soru Çözülmeyen Günler</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      weeklyAnalytics.unsolvedDaysCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {weeklyAnalytics.unsolvedDaysCount} Gün
                    </span>
                  </div>
                  <div className="mt-2 min-h-[2.5rem]">
                    {weeklyAnalytics.unsolvedDays.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {weeklyAnalytics.unsolvedDays.map((day) => (
                          <span key={day} className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded">
                            {day}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-2">
                        <CheckCircle2 className="w-4 h-4" /> Tebrikler! 7 günün tümünde soru çözüldü.
                      </p>
                    )}
                  </div>
                </div>

                {/* 4. Geçmiş Haftalara Göre İlerleme Durumu */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Geçmiş Haftaya Göre İlerleme</span>
                  <div className="flex items-center gap-2 mt-2">
                    {weeklyAnalytics.weeklyDifference >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-rose-400" />
                    )}
                    <span className={`text-2xl font-black ${
                      weeklyAnalytics.weeklyDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {weeklyAnalytics.weeklyDifference >= 0 ? '+' : ''}{weeklyAnalytics.weeklyDifference} Soru
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Önceki Hafta: <strong className="text-slate-200">{weeklyAnalytics.previousWeekTotal} soru</strong> ({weeklyAnalytics.weeklyGrowthRate >= 0 ? '+' : ''}%{weeklyAnalytics.weeklyGrowthRate})
                  </div>
                </div>
              </div>

              {/* Requirement: Haftalık grafik te öğrenci ismi, günler, haftanın tarihi, günlük çözülen toplam soru sayıları verilsin */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white">
                        Haftalık Toplam ve Günlük Soru Çözüm Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {weeklyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Hafta: {weeklyAnalytics.weekLabel} — Günlük toplam çözülen soru sayıları ve soru çözülmeyen günler
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Soru Çözülen Gün
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-3 h-3 rounded bg-rose-500 inline-block" /> Soru Çözülmeyen Gün (0 Soru)
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyAnalytics.days} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                      <XAxis
                        dataKey="dayName"
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as typeof weeklyAnalytics.days[0];
                            return (
                              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 z-50">
                                <p className="font-bold text-white">{data.dayName} ({formatTurkishDate(data.dateStr)})</p>
                                <p className="text-indigo-400 font-semibold">
                                  Günlük Toplam: {data.totalQuestions} Soru
                                </p>
                                {data.totalQuestions > 0 ? (
                                  <p className="text-slate-300 text-[11px] max-w-xs">{data.subjectsText}</p>
                                ) : (
                                  <p className="text-rose-400 font-medium">Bu gün soru çözülmedi ⚠️</p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="totalQuestions" radius={[6, 6, 0, 0]}>
                        {weeklyAnalytics.days.map((entry, index) => (
                          <Cell
                            key={`cell-teacher-${index}`}
                            fill={entry.totalQuestions > 0 ? '#6366f1' : '#f43f5e'}
                            opacity={entry.totalQuestions > 0 ? 0.95 : 0.4}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Written Table & Pedagogical Success Assessment Report */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Günlük Tablo */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white">Yazılı Günlük Soru Çözüm Tablosu</h4>
                    <span className="text-xs text-slate-400">
                      Öğrenci: <strong className="text-white">{weeklyAnalytics.studentName}</strong>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="px-3 py-2.5">Gün</th>
                          <th className="px-3 py-2.5">Tarih</th>
                          <th className="px-3 py-2.5 text-center">Çözülen Toplam</th>
                          <th className="px-3 py-2.5">Ders Dağılımları</th>
                          <th className="px-3 py-2.5 text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {weeklyAnalytics.days.map((d) => (
                          <tr key={d.dateStr} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2.5 font-bold text-slate-200">{d.dayName}</td>
                            <td className="px-3 py-2.5 text-slate-400">{formatTurkishDate(d.dateStr)}</td>
                            <td className="px-3 py-2.5 text-center font-extrabold text-indigo-400">
                              {d.totalQuestions} Soru
                            </td>
                            <td className="px-3 py-2.5 text-slate-300 truncate max-w-xs">{d.subjectsText}</td>
                            <td className="px-3 py-2.5 text-center">
                              {d.hasSolved ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300">
                                  Tamamlandı
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300">
                                  Soru Çözülmedi ⚠️
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Requirement: geçmiş haftalara göre ilerleme durumu başarı durumu rapor olarak verilsin */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Award className="w-5 h-5 text-amber-400" />
                      <h4 className="text-sm font-bold text-white">Haftalık Başarı & İlerleme Raporu</h4>
                    </div>

                    <div className="mb-3">
                      <span className={`inline-block text-xs font-bold px-3 py-1 rounded-lg border ${weeklyAnalytics.statusAssessment.badgeClass}`}>
                        {weeklyAnalytics.statusAssessment.badgeText}
                      </span>
                    </div>

                    <div className="bg-slate-800/70 p-4 rounded-xl border border-slate-700/70 text-xs text-slate-300 leading-relaxed space-y-2">
                      <p className="font-semibold text-white">Öğretmen / Rehberlik Değerlendirmesi:</p>
                      <p>{weeklyAnalytics.statusAssessment.reportSummary}</p>
                    </div>

                    {/* Subject Distribution */}
                    {weeklyAnalytics.subjectBreakdown.length > 0 && (
                      <div className="mt-4">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Haftalık Ders Dağılımı
                        </span>
                        <div className="space-y-1.5">
                          {weeklyAnalytics.subjectBreakdown.slice(0, 4).map((sub) => (
                            <div key={sub.subject} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300">{sub.subject}</span>
                              <span className="font-bold text-indigo-400">{sub.count} Soru (%{sub.percentage})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20"
                    >
                      <Download className="w-4 h-4" />
                      Haftalık Raporu PDF Olarak İndir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: AYLIK ANALİZ VE GRAFİK (USER DETAILED SPEC)      */}
          {/* ======================================================== */}
          {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
            <div className="space-y-6">
              {/* Month Selector Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setMonthDate((prev) => {
                        if (prev.month === 0) {
                          return { year: prev.year - 1, month: 11 };
                        }
                        return { year: prev.year, month: prev.month - 1 };
                      });
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="Önceki Ay"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider block">
                      Aylık İnceleme Dönemi
                    </span>
                    <h3 className="text-sm font-bold text-white">
                      Analiz Ayı: <span className="text-purple-300">{monthlyAnalytics.monthLabel}</span>
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setMonthDate((prev) => {
                        const now = new Date();
                        if (prev.year === now.getFullYear() && prev.month >= now.getMonth()) {
                          return prev;
                        }
                        if (prev.month === 11) {
                          return { year: prev.year + 1, month: 0 };
                        }
                        return { year: prev.year, month: prev.month + 1 };
                      });
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="Sonraki Ay"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Student Info Pill */}
                <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/60">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-xs">
                    {activeStudent.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-white block">{activeStudent.name}</span>
                    <span className="text-[11px] text-slate-400">{activeStudent.className || activeClass?.name}</span>
                  </div>
                </div>
              </div>

              {/* Requirement: Aylık grafik te öğrenci ismi, haftalar , haftalık çözülen toplam soru sayıları, ayda çözülen toplam soru sayısı verilsin. geçmiş aylara göre ilerleme durumu başarı durumu rapor olarak verilsin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ayda Çözülen Toplam Soru Sayısı */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Ayda Çözülen Toplam Soru</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-purple-400">{monthlyAnalytics.totalQuestions}</span>
                    <span className="text-xs text-slate-400">Soru</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">
                    Haftalık ortalama: <strong className="text-slate-200">{monthlyAnalytics.weeklyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Aktif Çalışılan Gün Sayısı */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Soru Çözülen Aktif Günler</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-white">{monthlyAnalytics.activeDaysCount}</span>
                    <span className="text-xs text-slate-400">Gün</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400">
                    Ay içindeki düzenlilik: %{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}
                  </div>
                </div>

                {/* 3. Geçmiş Aylara Göre İlerleme Durumu */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Geçmiş Aya Göre İlerleme</span>
                  <div className="flex items-center gap-2 mt-2">
                    {monthlyAnalytics.monthlyDifference >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-rose-400" />
                    )}
                    <span className={`text-2xl font-black ${
                      monthlyAnalytics.monthlyDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {monthlyAnalytics.monthlyDifference >= 0 ? '+' : ''}{monthlyAnalytics.monthlyDifference} Soru
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Önceki Ay: <strong className="text-slate-200">{monthlyAnalytics.previousMonthTotal} soru</strong> ({monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%{monthlyAnalytics.monthlyGrowthRate})
                  </div>
                </div>

                {/* 4. Başarı Değerlendirmesi */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                  <span className="text-xs text-slate-400 font-medium">Genel Başarı Durumu</span>
                  <div className="mt-3">
                    <span className={`inline-block text-xs font-bold px-3 py-1 rounded-lg border ${monthlyAnalytics.statusAssessment.badgeClass}`}>
                      {monthlyAnalytics.statusAssessment.badgeText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Requirement: Aylık grafik te öğrenci ismi, haftalar, haftalık çözülen toplam soru sayıları */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white">
                        Aylık Hafta Bazında Soru Çözüm Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {monthlyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {monthlyAnalytics.monthLabel} ayı boyunca haftalara göre çözülen toplam soru sayıları
                    </p>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyAnalytics.weeks} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                      <XAxis
                        dataKey="weekLabel"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as typeof monthlyAnalytics.weeks[0];
                            return (
                              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs space-y-1 z-50">
                                <p className="font-bold text-white">{data.weekLabel}</p>
                                <p className="text-purple-400 font-semibold">
                                  Haftalık Toplam: {data.totalQuestions} Soru
                                </p>
                                <p className="text-slate-300">Aktif Soru Çözülen: {data.activeDaysCount} Gün</p>
                                <p className="text-indigo-300">En Çok Çalışılan: {data.topSubject}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="totalQuestions" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Written Table & Pedagogical Success Assessment Report for Monthly */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white">Haftalık Soru Çözüm Dökümü Tablosu</h4>
                    <span className="text-xs text-slate-400">
                      Öğrenci: <strong className="text-white">{monthlyAnalytics.studentName}</strong>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="px-3 py-2.5">Hafta / Tarih Aralığı</th>
                          <th className="px-3 py-2.5 text-center">Haftalık Soru Sayısı</th>
                          <th className="px-3 py-2.5 text-center">Aktif Gün</th>
                          <th className="px-3 py-2.5">Ağırlıklı Ders</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {monthlyAnalytics.weeks.map((w) => (
                          <tr key={w.weekIndex} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2.5 font-bold text-slate-200">{w.weekLabel}</td>
                            <td className="px-3 py-2.5 text-center font-extrabold text-purple-400">
                              {w.totalQuestions} Soru
                            </td>
                            <td className="px-3 py-2.5 text-center text-slate-300">{w.activeDaysCount} Gün</td>
                            <td className="px-3 py-2.5 font-medium text-indigo-300">{w.topSubject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Requirement: geçmiş aylara göre ilerleme durumu başarı durumu rapor olarak verilsin */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Award className="w-5 h-5 text-purple-400" />
                      <h4 className="text-sm font-bold text-white">Aylık Başarı & İlerleme Raporu</h4>
                    </div>

                    <div className="bg-slate-800/70 p-4 rounded-xl border border-slate-700/70 text-xs text-slate-300 leading-relaxed space-y-2">
                      <p className="font-semibold text-white">Rehberlik & Gelişim Görüşü:</p>
                      <p>{monthlyAnalytics.statusAssessment.reportSummary}</p>
                    </div>

                    {monthlyAnalytics.subjectBreakdown.length > 0 && (
                      <div className="mt-4">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Aylık Ders Dağılımı ve Paylar
                        </span>
                        <div className="space-y-1.5">
                          {monthlyAnalytics.subjectBreakdown.slice(0, 4).map((sub) => (
                            <div key={sub.subject} className="flex items-center justify-between text-xs">
                              <span className="text-slate-300">{sub.subject}</span>
                              <span className="font-bold text-purple-400">{sub.count} Soru (%{sub.percentage})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-600/20"
                    >
                      <Download className="w-4 h-4" />
                      Aylık Raporu PDF Olarak İndir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: SINIF GENEL ÖZETİ VE ÖĞRENCİ SIRALAMASI           */}
          {/* ======================================================== */}
          {activeAnalysisMode === 'class_overview' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm Durumu
                  </h3>
                  <p className="text-xs text-slate-400">
                    Haftalık ve aylık toplam çözülen soru sayıları, soru çözülmeyen günler ve ilerleme durumları
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Sıra</th>
                      <th className="px-4 py-3">Öğrenci Adı</th>
                      <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                      <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                      <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                      <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                      <th className="px-4 py-3">Başarı Değerlendirmesi</th>
                      <th className="px-4 py-3 text-right">Detay & PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {classOverviewData.map((row, idx) => (
                      <tr
                        key={row.student.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          row.student.id === selectedStudentId ? 'bg-indigo-600/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-white">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="hover:text-indigo-400 text-left transition-colors"
                          >
                            {row.student.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-indigo-400 text-sm">
                          {row.weeklyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.unsolvedDaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300">
                              {row.unsolvedDays.join(', ')} ({row.unsolvedDaysCount} gün)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300">
                              Her Gün Çözüldü
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">
                          <span className={row.weeklyDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} ({row.weeklyGrowthRate >= 0 ? '+' : ''}%{row.weeklyGrowthRate})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-purple-400">
                          {row.monthlyTotal} Soru
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold border ${row.badgeClass}`}>
                            {row.badgeText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Analiz Aç
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
