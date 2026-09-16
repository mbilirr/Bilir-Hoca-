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
  Award,
  Search,
  Filter,
  Check,
  Clock,
  Layers,
  Sparkles,
  Target,
  ArrowUpRight,
  Flame,
  BookOpen,
  PieChart as PieIcon,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  LabelList,
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
  // Sınıf seçimi (varsayılan ilk sınıf)
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return classes.length > 0 ? classes[0].id : '';
  });

  // Seçili sınıftaki öğrenciler
  const classStudents = useMemo(() => {
    if (!selectedClassId || selectedClassId === 'all') return students;
    return students.filter((s) => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Seçili öğrenci
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    return classStudents.length > 0 ? classStudents[0].id : '';
  });

  // Sınıf değiştiğinde öğrenci seçimini güncelle
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

  // Görünüm modları: 'weekly' (Haftalık Analiz) | 'monthly' (Aylık Analiz) | 'class_overview' (Sınıf Başarı Sıralaması)
  const [activeAnalysisMode, setActiveAnalysisMode] = useState<'weekly' | 'monthly' | 'class_overview'>('weekly');

  // Grafik görselleştirme tipi: 'bar' (Sütun Grafiği) | 'area' (Trend & Alan) | 'accuracy' (Doğru / Yanlış)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area' | 'accuracy'>('bar');

  // Hedef Soru Sayısı (Öğretmen tarafından dinamik olarak ayarlanabilir, varsayılan 50 soru/gün)
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState<number>(50);

  // Tarih ofsetleri
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Soru logları
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  // Aktif öğrenci için haftalık analitik
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

  // Aktif öğrenci için aylık analitik
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

  // Sınıf genel özeti & sıralaması
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
        accuracyPercentage: stWeekly.accuracyPercentage,
        monthlyTotal: stMonthly.totalQuestions,
        monthlyDiff: stMonthly.monthlyDifference,
        badgeText: stWeekly.statusAssessment.badgeText,
        badgeClass: stWeekly.statusAssessment.badgeClass,
      };
    }).sort((a, b) => b.weeklyTotal - a.weeklyTotal);
  }, [activeClass, classStudents, allLogs, targetWeekDate, monthDate]);

  // Haftalık Hedef Tamamlama Oranı Hesabı
  const weeklyTargetTotal = dailyQuestionTarget * 7;
  const weeklyTargetCompletionRate = useMemo(() => {
    if (!weeklyAnalytics || weeklyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((weeklyAnalytics.totalQuestions / weeklyTargetTotal) * 100));
  }, [weeklyAnalytics, weeklyTargetTotal]);

  // Aylık Hedef Tamamlama Oranı Hesabı (30 gün üzerinden)
  const monthlyTargetTotal = dailyQuestionTarget * 30;
  const monthlyTargetCompletionRate = useMemo(() => {
    if (!monthlyAnalytics || monthlyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((monthlyAnalytics.totalQuestions / monthlyTargetTotal) * 100));
  }, [monthlyAnalytics, monthlyTargetTotal]);

  // Looker Studio Custom Tooltip Component (Temiz Beyaz Arka Plan & Koyu Gri Metinler & Canlı Turuncu)
  const renderLookerTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200/90 shadow-xl rounded-xl p-3.5 text-xs text-slate-800 space-y-1.5 z-50 min-w-[210px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="font-bold text-[#0f172a] text-xs">
              {data.dayName ? `${data.dayName} (${formatTurkishDate(data.dateStr)})` : data.weekLabel}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-600 border border-orange-200">
              {data.totalQuestions > 0 ? `${data.totalQuestions} Soru` : '0 Soru'}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-slate-600">
              <span>Toplam Çözülen:</span>
              <strong className="text-[#0f172a] font-bold text-xs">{data.totalQuestions} Soru</strong>
            </div>

            {data.totalCorrect !== undefined && data.totalCorrect > 0 && (
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Doğru:
                </span>
                <span className="font-bold text-emerald-700">{data.totalCorrect}</span>
              </div>
            )}

            {data.totalWrong !== undefined && data.totalWrong > 0 && (
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 text-rose-500">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Yanlış:
                </span>
                <span className="font-bold text-rose-700">{data.totalWrong}</span>
              </div>
            )}

            {data.totalQuestions >= dailyQuestionTarget ? (
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 pt-1 border-t border-slate-100">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Günlük Hedefe Ulaşıldı (%{Math.round((data.totalQuestions / dailyQuestionTarget) * 100)})</span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-[11px] text-orange-600 font-medium pt-1 border-t border-slate-100">
                Hedefe {dailyQuestionTarget - data.totalQuestions} soru kaldı
              </div>
            ) : (
              <div className="text-[11px] text-rose-600 font-medium flex items-center gap-1 pt-1 border-t border-slate-100">
                <AlertCircle className="w-3 h-3 text-rose-500" />
                <span>Bu gün soru çözülmedi</span>
              </div>
            )}

            {data.subjectsText && (
              <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500 truncate max-w-[200px]">
                {data.subjectsText}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* GOOGLE LOOKER STUDIO - EXECUTIVE CONTROL BAR & APP HEADER               */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
        {/* Top Looker Studio Header Brand */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0f172a] text-white flex items-center justify-center shadow-md shadow-slate-900/10">
              <BarChart3 className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                  Google Looker Studio
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Eğitim Analitik Modülü</span>
              </div>
              <h2 className="text-lg font-bold text-[#0f172a] tracking-tight">
                Öğrenci Soru Sayısı ve Başarı Takip Dashboard'u
              </h2>
            </div>
          </div>

          {/* Quick PDF & Export Bar */}
          <div className="flex items-center gap-2">
            {activeStudent && (
              <>
                {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
                  <button
                    id="btn-looker-pdf-weekly"
                    onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Haftalık Raporu İndir (PDF)</span>
                  </button>
                )}
                {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
                  <button
                    id="btn-looker-pdf-monthly"
                    onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                    className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-orange-400" />
                    <span>Aylık Raporu İndir (PDF)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Parameter Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          {/* 1. Sınıf Seçimi */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#1e3a8a]" />
              Sınıf Filtresi
            </label>
            <select
              id="looker-filter-class"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full bg-white border border-slate-300 text-xs font-semibold text-[#0f172a] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gradeLevel || ''})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Öğrenci Seçimi */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-orange-600" />
              Öğrenci Seçimi
            </label>
            <select
              id="looker-filter-student"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-white border border-slate-300 text-xs font-bold text-[#0f172a] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer"
            >
              {classStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.studentNumber ? `(No: ${s.studentNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Görünüm Dönemi (Haftalık / Aylık / Sınıf Sıralaması) */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#1e3a8a]" />
              Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-white border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('weekly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'weekly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Haftalık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('monthly')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'monthly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Aylık
              </button>
              <button
                type="button"
                onClick={() => setActiveAnalysisMode('class_overview')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  activeAnalysisMode === 'class_overview'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Sınıf
              </button>
            </div>
          </div>

          {/* 4. Dinamik Günlük Hedef Soru Ayarı */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-[#334155] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-orange-600" />
                Günlük Hedef
              </label>
              <span className="text-xs font-black text-orange-600">{dailyQuestionTarget} Soru</span>
            </div>
            <div className="flex gap-1.5 mt-1">
              {[30, 50, 75, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDailyQuestionTarget(val)}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                    dailyQuestionTarget === val
                      ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                      : 'bg-white text-[#475569] border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!activeStudent ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          Lütfen analizini incelemek istediğiniz sınıf ve öğrenciyi seçiniz.
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TAB 1: HAFTALIK LOOKER STUDIO DASHBOARD                                  */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'weekly' && weeklyAnalytics && (
            <div className="space-y-6">
              {/* Hafta Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="p-2 bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Önceki Hafta"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Güncel Dönem' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                    </span>
                    <h3 className="text-sm font-bold text-[#0f172a]">
                      İncelenen Hafta: <span className="text-[#1e3a8a]">{weeklyAnalytics.weekLabel}</span>
                    </h3>
                  </div>
                  <button
                    onClick={() => setWeekOffset((prev) => Math.min(0, prev + 1))}
                    disabled={weekOffset >= 0}
                    className={`p-2 rounded-xl transition-colors ${
                      weekOffset >= 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : 'bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer'
                    }`}
                    title="Sonraki Hafta"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-[#f8fafc] px-4 py-2 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-full bg-[#0f172a] text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                    {activeStudent.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-[#0f172a] block">{activeStudent.name}</span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {activeStudent.className || activeClass?.name} {activeStudent.studentNumber ? `• No: ${activeStudent.studentNumber}` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* LOOKER STUDIO EXECUTIVE KPI SCORECARDS (TEMİZ BEYAZ & GECE MAVİSİ & TURUNCU) */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Toplam Çözülen Soru & İlerleme */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Haftalık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {weeklyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Soru</span>
                  </div>

                  {/* Deltası */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
                    {weeklyAnalytics.weeklyDifference >= 0 ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        +{weeklyAnalytics.weeklyDifference} soru (+%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    ) : (
                      <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />
                        {weeklyAnalytics.weeklyDifference} soru (%{weeklyAnalytics.weeklyGrowthRate})
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Önceki Hafta: <strong className="text-slate-700">{weeklyAnalytics.previousWeekTotal} soru</strong>
                  </div>
                </div>

                {/* 2. Kurs / Müfredat Hedef Bitirme Oranı (%) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Kurs / Hedef Bitirme</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Target className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-orange-600 tracking-tight">
                      %{weeklyTargetCompletionRate}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Tamamlandı</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, weeklyTargetCompletionRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                    <span>Haftalık Hedef: <strong>{weeklyTargetTotal} Soru</strong></span>
                    <span className="text-slate-700 font-semibold">{weeklyAnalytics.dailyAverage} soru/gün</span>
                  </div>
                </div>

                {/* 3. Çalışma Disiplini & Soru Çözülmeyen Günler */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Çalışma Disiplini</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {weeklyAnalytics.solvedDaysCount}
                      <span className="text-base text-slate-400 font-semibold"> / 7 Gün</span>
                    </span>
                  </div>

                  {/* Soru Çözülmeyen Günler Rozeti */}
                  <div className="mt-3">
                    {weeklyAnalytics.unsolvedDaysCount > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-orange-600" />
                          {weeklyAnalytics.unsolvedDaysCount} Gün Çözülmedi
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ({weeklyAnalytics.unsolvedDays.join(', ')})
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        7 Gün Kesintisiz Çalışma
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Haftalık Devamlılık Oranı: <strong className="text-slate-700">%{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Öğrenci Başarı Durumu & Doğruluk Oranı */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Başarı & Doğruluk Oranı</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#1e3a8a] tracking-tight">
                      %{weeklyAnalytics.accuracyPercentage}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Net Başarı</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#0f172a] text-white">
                      {weeklyAnalytics.statusAssessment.badgeText}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex gap-2">
                    <span className="text-emerald-600 font-semibold">D: {weeklyAnalytics.totalCorrect}</span>
                    <span className="text-rose-600 font-semibold">Y: {weeklyAnalytics.totalWrong}</span>
                    <span className="text-slate-500">B: {weeklyAnalytics.totalEmpty}</span>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* GOOGLE LOOKER STUDIO ANA GRAFİĞİ (HAFİF GRİ ARKA PLAN, KOYU GRİ METİNLER) */}
              {/* ========================================================================= */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                {/* Chart Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-[#0f172a] tracking-tight">
                        Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#0f172a] text-white">
                        {weeklyAnalytics.studentName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Dönem: {weeklyAnalytics.weekLabel} • Sütun tepelerinde net soru sayıları ve turuncu günlük hedef çizgisi
                    </p>
                  </div>

                  {/* Chart Type & Legend Switcher */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 mr-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-[#1e3a8a] inline-block" /> Çözülen Soru
                      </span>
                      <span className="flex items-center gap-1.5 text-orange-600">
                        <span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Hedef ({dailyQuestionTarget})
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-600">
                        <span className="w-3 h-3 rounded bg-rose-500 inline-block" /> 0 Soru
                      </span>
                    </div>

                    {/* Chart Mode Buttons */}
                    <div className="flex rounded-lg bg-[#f1f5f9] p-0.5 border border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => setChartVisualType('bar')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'bar'
                            ? 'bg-white text-[#0f172a] shadow-xs'
                            : 'text-slate-600 hover:text-[#0f172a]'
                        }`}
                      >
                        Sütun Grafiği
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartVisualType('area')}
                        className={`px-3 py-1 rounded-md font-bold transition-all ${
                          chartVisualType === 'area'
                            ? 'bg-white text-[#0f172a] shadow-xs'
                            : 'text-slate-600 hover:text-[#0f172a]'
                        }`}
                      >
                        Trend & Alan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Plot Area with Light Gray Background */}
                <div className="h-80 w-full bg-[#f8fafc] rounded-xl p-3 border border-slate-200/80">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartVisualType === 'bar' ? (
                      <BarChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="dayName"
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <Tooltip content={renderLookerTooltip} />

                        {/* Canlı Turuncu Hedef Referans Çizgisi */}
                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke="#ea580c"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Hedef: ${dailyQuestionTarget} Soru`,
                            fill: '#ea580c',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideTopRight',
                          }}
                        />

                        {/* Sütun Çizimi ve Tepede Net Değerler (LabelList) */}
                        <Bar
                          dataKey="totalQuestions"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={55}
                        >
                          {/* Sütunların üzerine net sayıları yazdır */}
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="#0f172a"
                            fontSize={12}
                            fontWeight={800}
                            offset={8}
                            formatter={(val: number) => (val > 0 ? val : '0')}
                          />
                          {weeklyAnalytics.days.map((entry, index) => {
                            // Gece mavisi (#1e3a8a), hedefe ulaştıysa lacivert, 0 ise belirgin turuncu/rose
                            const isZero = entry.totalQuestions === 0;
                            const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                            return (
                              <Cell
                                key={`cell-looker-${index}`}
                                fill={isZero ? '#f43f5e' : isAboveTarget ? '#1e3a8a' : '#3b82f6'}
                                opacity={isZero ? 0.85 : 1}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart
                        data={weeklyAnalytics.days}
                        margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient id="lookerNavyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="dayName"
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          stroke="#475569"
                          fontSize={12}
                          fontWeight={600}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <Tooltip content={renderLookerTooltip} />

                        <ReferenceLine
                          y={dailyQuestionTarget}
                          stroke="#ea580c"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          label={{
                            value: `Hedef: ${dailyQuestionTarget} Soru`,
                            fill: '#ea580c',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideTopRight',
                          }}
                        />

                        <Area
                          type="monotone"
                          dataKey="totalQuestions"
                          stroke="#1e3a8a"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#lookerNavyGradient)"
                          dot={{ r: 5, fill: '#ea580c', stroke: '#ffffff', strokeWidth: 2 }}
                          activeDot={{ r: 7, fill: '#ea580c' }}
                        >
                          <LabelList
                            dataKey="totalQuestions"
                            position="top"
                            fill="#0f172a"
                            fontSize={12}
                            fontWeight={800}
                            offset={8}
                          />
                        </Area>
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* KURS BİTİRME ORANLARI & DERS DAĞILIMI & YAZILI VERİ TABLOSU               */}
              {/* ========================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sol / 2 Kolon: Yazılı Looker Studio Veri Tablosu */}
                <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-bold text-[#0f172a]">
                        Günlük Soru Çözüm ve Başarı Tablosu
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Öğrenci: <strong className="text-slate-800">{weeklyAnalytics.studentName}</strong> • {weeklyAnalytics.className}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#f8fafc] text-slate-700 border border-slate-200">
                      7 Günlük Detay
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5">Gün</th>
                          <th className="px-3.5 py-2.5">Tarih</th>
                          <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                          <th className="px-3.5 py-2.5">Ders Dağılımı</th>
                          <th className="px-3.5 py-2.5 text-center">Hedef Durumu</th>
                          <th className="px-3.5 py-2.5 text-center">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {weeklyAnalytics.days.map((d) => {
                          const metTarget = d.totalQuestions >= dailyQuestionTarget;
                          const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                          return (
                            <tr key={d.dateStr} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3.5 py-2.5 font-bold text-[#0f172a]">{d.dayName}</td>
                              <td className="px-3.5 py-2.5 text-slate-500">{formatTurkishDate(d.dateStr)}</td>
                              <td className="px-3.5 py-2.5 text-center">
                                <span className="font-extrabold text-[#0f172a] text-sm">
                                  {d.totalQuestions}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-600 truncate max-w-xs">
                                {d.subjectsText || <span className="text-slate-400 italic">Ders kaydı yok</span>}
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                <div className="inline-flex items-center gap-1.5">
                                  <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                      style={{ width: `${completionRate}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600">%{completionRate}</span>
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5 text-center">
                                {d.hasSolved ? (
                                  metTarget ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Hedef Tamamlandı
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      Kısmi Çözüm
                                    </span>
                                  )
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    0 Soru ⚠️
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sağ / 1 Kolon: Kurs / Ders Bitirme Oranları & Pedagojik Rapor */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                      <BookOpen className="w-4 h-4 text-orange-600" />
                      <h4 className="text-sm font-bold text-[#0f172a]">
                        Kurs & Ders Bitirme Oranları
                      </h4>
                    </div>

                    {/* Ders Bazlı İlerleme Çubukları */}
                    {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {weeklyAnalytics.subjectBreakdown.map((sub, i) => {
                          return (
                            <div key={sub.subject} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[#0f172a]">{sub.subject}</span>
                                <span className="font-bold text-orange-600">
                                  {sub.count} Soru (%{sub.percentage})
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${
                                    i === 0 ? 'bg-[#0f172a]' : i === 1 ? 'bg-orange-500' : 'bg-[#1e3a8a]'
                                  }`}
                                  style={{ width: `${sub.percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                    )}

                    {/* Pedagojik Değerlendirme Raporu */}
                    <div className="mt-5 p-3.5 bg-[#f8fafc] rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                        <Award className="w-3.5 h-3.5 text-orange-600" />
                        <span>Rehberlik & Başarı Analizi</span>
                      </div>
                      <p className="leading-relaxed text-slate-600">
                        {weeklyAnalytics.statusAssessment.reportSummary}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <button
                      onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Looker Studio Haftalık Raporunu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: AYLIK LOOKER STUDIO DASHBOARD                                     */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'monthly' && monthlyAnalytics && (
            <div className="space-y-6">
              {/* Ay Gezinme ve Öğrenci Kimlik Kartı */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
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
                    className="p-2 bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Önceki Ay"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">
                      Aylık İnceleme Dönemi
                    </span>
                    <h3 className="text-sm font-bold text-[#0f172a]">
                      Analiz Ayı: <span className="text-[#1e3a8a]">{monthlyAnalytics.monthLabel}</span>
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
                    className="p-2 bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Sonraki Ay"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-[#f8fafc] px-4 py-2 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-full bg-[#0f172a] text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/20">
                    {activeStudent.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-[#0f172a] block">{activeStudent.name}</span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {activeStudent.className || activeClass?.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aylık Executive KPI Scorecards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Ayda Çözülen Toplam Soru */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aylık Toplam Soru</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {monthlyAnalytics.totalQuestions}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Soru</span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Haftalık Ortalama: <strong className="text-slate-800">{monthlyAnalytics.weeklyAverage} soru</strong>
                  </div>
                </div>

                {/* 2. Aylık Hedef Tamamlama Oranı */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aylık Müfredat Hedefi</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Target className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-orange-600 tracking-tight">
                      %{monthlyTargetCompletionRate}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">Tamamlandı</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, monthlyTargetCompletionRate)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Aylık Hedef: <strong>{monthlyTargetTotal} Soru</strong>
                  </div>
                </div>

                {/* 3. Aktif Soru Çözülen Günler */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Aktif Çalışma Günleri</span>
                    <span className="p-1.5 rounded-lg bg-[#f1f5f9] text-[#1e3a8a]">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-[#0f172a] tracking-tight">
                      {monthlyAnalytics.activeDaysCount}
                      <span className="text-base text-slate-400 font-semibold"> Gün</span>
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Aylık Düzenlilik: <strong className="text-slate-800">%{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}</strong>
                  </div>
                </div>

                {/* 4. Geçmiş Aya Göre İlerleme Durumu */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Geçmiş Aya Göre Gelişim</span>
                    <span className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                      <Award className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mt-2">
                    {monthlyAnalytics.monthlyDifference >= 0 ? (
                      <span className="text-2xl font-black text-emerald-700">
                        +{monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    ) : (
                      <span className="text-2xl font-black text-rose-700">
                        {monthlyAnalytics.monthlyDifference} Soru
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Önceki Ay: <strong className="text-slate-800">{monthlyAnalytics.previousMonthTotal} soru</strong> ({monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%{monthlyAnalytics.monthlyGrowthRate})
                  </div>
                </div>
              </div>

              {/* Aylık Hafta Bazında Soru Çözüm Grafiği */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
                  <div>
                    <h4 className="text-base font-bold text-[#0f172a] tracking-tight">
                      Aylık Hafta Bazında Soru Çözüm ve Başarı Grafiği
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {monthlyAnalytics.monthLabel} ayı süresince haftalık toplam çözülen soru sayıları
                    </p>
                  </div>
                </div>

                <div className="h-80 w-full bg-[#f8fafc] rounded-xl p-3 border border-slate-200/80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyAnalytics.weeks}
                      margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="weekLabel"
                        stroke="#475569"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis
                        stroke="#475569"
                        fontSize={12}
                        fontWeight={600}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <Tooltip content={renderLookerTooltip} />
                      <Bar
                        dataKey="totalQuestions"
                        fill="#1e3a8a"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={60}
                      >
                        <LabelList
                          dataKey="totalQuestions"
                          position="top"
                          fill="#0f172a"
                          fontSize={12}
                          fontWeight={800}
                          offset={8}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Aylık Veri Tablosu & Ders Dağılımı */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-[#0f172a] mb-3 pb-2 border-b border-slate-100">
                    Haftalık Soru Çözüm Dökümü Tablosu
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3.5 py-2.5">Hafta / Tarih Aralığı</th>
                          <th className="px-3.5 py-2.5 text-center">Haftalık Soru Sayısı</th>
                          <th className="px-3.5 py-2.5 text-center">Aktif Gün</th>
                          <th className="px-3.5 py-2.5">Ağırlıklı Ders</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monthlyAnalytics.weeks.map((w) => (
                          <tr key={w.weekIndex} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3.5 py-2.5 font-bold text-[#0f172a]">{w.weekLabel}</td>
                            <td className="px-3.5 py-2.5 text-center font-extrabold text-[#1e3a8a] text-sm">
                              {w.totalQuestions} Soru
                            </td>
                            <td className="px-3.5 py-2.5 text-center text-slate-700 font-semibold">{w.activeDaysCount} Gün</td>
                            <td className="px-3.5 py-2.5 font-medium text-orange-600">{w.topSubject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-[#0f172a] mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-orange-600" />
                      Aylık Ders Dağılım Payları
                    </h4>
                    {monthlyAnalytics.subjectBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {monthlyAnalytics.subjectBreakdown.map((sub, i) => (
                          <div key={sub.subject} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[#0f172a]">{sub.subject}</span>
                              <span className="font-bold text-orange-600">
                                {sub.count} Soru (%{sub.percentage})
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${
                                  i === 0 ? 'bg-[#0f172a]' : i === 1 ? 'bg-orange-500' : 'bg-[#1e3a8a]'
                                }`}
                                style={{ width: `${sub.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Ders dökümü bulunamadı.</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <button
                      onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                      className="w-full py-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-orange-400" />
                      <span>Looker Studio Aylık Raporunu PDF İndir</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: SINIF GENEL BAŞARI SIRALAMASI VE KARŞILAŞTIRMA TABLOSU             */}
          {/* ========================================================================= */}
          {activeAnalysisMode === 'class_overview' && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-[#0f172a]">
                    {activeClass?.name || 'Sınıf'} — Tüm Öğrencilerin Soru Çözüm & Başarı Sıralaması
                  </h3>
                  <p className="text-xs text-slate-500">
                    Haftalık ve aylık toplam çözülen soru sayıları, soru çözülmeyen gün alarmları ve başarı dereceleri
                  </p>
                </div>
                <div className="text-xs font-bold text-[#0f172a] bg-[#f8fafc] px-3 py-1.5 rounded-lg border border-slate-200">
                  Toplam {classOverviewData.length} Öğrenci
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Sıra</th>
                      <th className="px-4 py-3">Öğrenci Adı</th>
                      <th className="px-4 py-3 text-center">Bu Hafta Çözülen</th>
                      <th className="px-4 py-3 text-center">Soru Çözülmeyen Günler</th>
                      <th className="px-4 py-3 text-center">Haftalık İlerleme</th>
                      <th className="px-4 py-3 text-center">Bu Ay Toplam</th>
                      <th className="px-4 py-3 text-center">Başarı Seviyesi</th>
                      <th className="px-4 py-3 text-right">Analiz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classOverviewData.map((row, idx) => (
                      <tr
                        key={row.student.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          row.student.id === selectedStudentId ? 'bg-orange-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-[#0f172a]">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="hover:text-orange-600 text-left transition-colors cursor-pointer"
                          >
                            {row.student.name}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-[#0f172a] text-sm">
                          {row.weeklyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.unsolvedDaysCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                              {row.unsolvedDaysCount} Gün Çözülmedi
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Her Gün Çözüldü
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">
                          <span className={row.weeklyDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                            {row.weeklyDiff >= 0 ? '+' : ''}{row.weeklyDiff} ({row.weeklyGrowthRate >= 0 ? '+' : ''}%{row.weeklyGrowthRate})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a]">
                          {row.monthlyTotal} Soru
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#f8fafc] text-[#0f172a] border border-slate-200">
                            {row.badgeText}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(row.student.id);
                              setActiveAnalysisMode('weekly');
                            }}
                            className="px-3 py-1 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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
