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
  ChevronDown,
  RotateCcw,
  X,
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
  getMondayOfWeek,
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

  // Açılır pencere (Geçmiş Hafta ve Geçmiş Ay Seçici Modal) durumları
  const [isWeekModalOpen, setIsWeekModalOpen] = useState<boolean>(false);
  const [weekFilterTab, setWeekFilterTab] = useState<'all' | 'with_questions'>('all');
  const [weekSearchQuery, setWeekSearchQuery] = useState<string>('');

  const [isMonthModalOpen, setIsMonthModalOpen] = useState<boolean>(false);
  const [monthFilterTab, setMonthFilterTab] = useState<'all' | 'with_questions'>('all');
  const [monthSearchQuery, setMonthSearchQuery] = useState<string>('');

  // ESC tuşu ile açılır pencereleri kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isWeekModalOpen) setIsWeekModalOpen(false);
        if (isMonthModalOpen) setIsMonthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWeekModalOpen, isMonthModalOpen]);

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

  // Öğrencinin geçmiş haftaları ve soru sayıları (Açılır pencere için)
  const pastWeeksList = useMemo(() => {
    const currentMonday = getMondayOfWeek(new Date());
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent?.id);

    // En az 26 hafta (yaklaşık 6 ay), eğer daha eski log varsa listeyi o tarihe kadar genişlet
    let maxPastWeeks = 26;
    if (studentLogs.length > 0) {
      studentLogs.forEach((l) => {
        if (l.date) {
          const logDate = new Date(l.date + 'T00:00:00');
          if (!isNaN(logDate.getTime())) {
            const logMonday = getMondayOfWeek(logDate);
            const diffDays = Math.round((currentMonday.getTime() - logMonday.getTime()) / (1000 * 60 * 60 * 24));
            const off = Math.round(diffDays / 7);
            if (off > maxPastWeeks && off < 104) {
              maxPastWeeks = off + 2;
            }
          }
        }
      });
    }

    const list = [];
    for (let i = 0; i <= maxPastWeeks; i++) {
      const offset = -i;
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() + offset * 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const sStr = formatDateISO(mon);
      const eStr = formatDateISO(sun);

      let weekTotal = 0;
      let weekCorrect = 0;
      let weekWrong = 0;
      const activeDays = new Set<string>();

      studentLogs.forEach((l) => {
        if (l.date >= sStr && l.date <= eStr) {
          weekTotal += l.totalQuestions || 0;
          weekCorrect += l.totalCorrect || 0;
          weekWrong += l.totalWrong || 0;
          if ((l.totalQuestions || 0) > 0) {
            activeDays.add(l.date);
          }
        }
      });

      const relativeLabel =
        offset === 0
          ? 'Bu Hafta (Güncel)'
          : offset === -1
          ? 'Geçen Hafta'
          : `${Math.abs(offset)} Hafta Önce`;

      // Sadece güncel hafta veya soru sayısı > 0 olan geçmiş haftalar eklenir; soru sayısı olmayan geçmiş haftalar tamamen silinir
      if (offset === 0 || weekTotal > 0) {
        list.push({
          offset,
          startDateStr: sStr,
          endDateStr: eStr,
          weekLabel: `${formatTurkishDate(sStr)} - ${formatTurkishDate(eStr)}`,
          relativeLabel,
          totalQuestions: weekTotal,
          totalCorrect: weekCorrect,
          totalWrong: weekWrong,
          activeDaysCount: activeDays.size,
          hasActivity: weekTotal > 0,
        });
      }
    }

    return list;
  }, [allLogs, activeStudent?.id]);

  // Filtrelenmiş geçmiş haftalar
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.toLowerCase().trim();
        const matchesLabel = item.weekLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastWeeksList, weekFilterTab, weekSearchQuery]);

  const activeWeeksCount = useMemo(() => {
    return pastWeeksList.filter((w) => w.hasActivity).length;
  }, [pastWeeksList]);

  // Geçmiş aylar listesi (Son 24 ay)
  const pastMonthsList = useMemo(() => {
    if (!activeStudent) return [];
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent.id);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const list: Array<{
      year: number;
      month: number;
      monthLabel: string;
      relativeLabel: string;
      totalQuestions: number;
      totalCorrect: number;
      totalWrong: number;
      activeDaysCount: number;
      hasActivity: boolean;
    }> = [];

    for (let offset = 0; offset < 24; offset++) {
      const d = new Date(currentYear, currentMonth - offset, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const sStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const eStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      let monthTotal = 0;
      let monthCorrect = 0;
      let monthWrong = 0;
      const activeDays = new Set<string>();

      studentLogs.forEach((l) => {
        if (l.date >= sStr && l.date <= eStr) {
          monthTotal += l.totalQuestions || 0;
          monthCorrect += l.totalCorrect || 0;
          monthWrong += l.totalWrong || 0;
          if ((l.totalQuestions || 0) > 0) {
            activeDays.add(l.date);
          }
        }
      });

      const relativeLabel =
        offset === 0
          ? 'Bu Ay (Güncel)'
          : offset === 1
          ? 'Geçen Ay'
          : `${offset} Ay Önce`;

      const monthName = TURKISH_MONTHS[m] || '';
      const monthLabel = `${monthName} ${y}`;

      // Sadece güncel ay veya soru sayısı > 0 olan geçmiş aylar eklenir; soru sayısı olmayan geçmiş aylar tamamen silinir
      if (offset === 0 || monthTotal > 0) {
        list.push({
          year: y,
          month: m,
          monthLabel,
          relativeLabel,
          totalQuestions: monthTotal,
          totalCorrect: monthCorrect,
          totalWrong: monthWrong,
          activeDaysCount: activeDays.size,
          hasActivity: monthTotal > 0,
        });
      }
    }

    return list;
  }, [allLogs, activeStudent?.id]);

  const filteredPastMonths = useMemo(() => {
    return pastMonthsList.filter((item) => {
      if (monthFilterTab === 'with_questions' && !item.hasActivity) {
        return false;
      }
      if (monthSearchQuery.trim()) {
        const q = monthSearchQuery.toLowerCase().trim();
        const matchesLabel = item.monthLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastMonthsList, monthFilterTab, monthSearchQuery]);

  const activeMonthsCount = useMemo(() => {
    return pastMonthsList.filter((m) => m.hasActivity).length;
  }, [pastMonthsList]);

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
                {/* Açılır Pencere ile Hafta Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-week-picker-modal"
                    type="button"
                    onClick={() => setIsWeekModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş haftaları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">
                          {weekOffset === 0 ? 'Güncel Dönem' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                        </span>
                        {weekOffset !== 0 ? (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                            Geçmiş Hafta
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                            Aktif Hafta
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                        <span className="hidden xs:inline text-slate-500 font-medium">İncelenen Hafta:</span>
                        <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {weeklyAnalytics.weekLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <span className="hidden md:inline text-[11px] text-slate-500 group-hover:text-orange-700 font-medium">
                        Açılır Pencere
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 md:text-slate-400" />
                    </div>
                  </button>

                  {weekOffset !== 0 && (
                    <button
                      id="btn-reset-current-week"
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Bugünün güncel haftasına dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Haftaya Dön</span>
                    </button>
                  )}
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
                {/* Açılır Pencere ile Ay Seçimi (İleri / Geri Tuşları Yerine Açılır Pencere) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    id="btn-open-month-picker-modal"
                    type="button"
                    onClick={() => setIsMonthModalOpen(true)}
                    className="group flex items-center gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    title="Geçmiş ayları ve çözülen soruları görüntülemek için açılır pencereyi açın"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">
                          Aylık İnceleme Dönemi
                        </span>
                        {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                            Aktif Ay
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                            Geçmiş Dönem
                          </span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1.5">
                        <span className="hidden xs:inline text-slate-500 font-medium">Analiz Ayı:</span>
                        <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                          {monthlyAnalytics.monthLabel}
                        </span>
                      </h3>
                    </div>
                    <div className="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                      <span className="hidden md:inline text-[11px] text-slate-500 group-hover:text-orange-700 font-medium">
                        Açılır Pencere
                      </span>
                      <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 md:text-slate-400" />
                    </div>
                  </button>

                  {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                    <button
                      id="btn-reset-current-month"
                      type="button"
                      onClick={() => setMonthDate({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                      className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Güncel aya dön"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Güncel Aya Dön</span>
                    </button>
                  )}
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

      {/* ========================================================================= */}
      {/* GEÇMİŞ HAFTA SEÇİMİ AÇILIR PENCERESİ (POPUP MODAL)                        */}
      {/* ========================================================================= */}
      {isWeekModalOpen && activeStudent && (
        <div
          id="modal-week-picker-backdrop"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsWeekModalOpen(false);
            }
          }}
        >
          <div
            id="modal-week-picker-content"
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                    <span>Geçmiş Hafta Seçimi</span>
                    <span className="text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                      Açılır Pencere
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <strong className="text-slate-700">{activeStudent.name}</strong> öğrencisinin geçmiş haftalarda çözdüğü soruları incelemek için dilediğiniz haftayı seçin.
                  </p>
                </div>
              </div>
              <button
                id="btn-close-week-modal"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Filter & Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-[#f8fafc] space-y-3">
              {/* Hızlı Atlama Düğmeleri */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hızlı Seç:</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(0);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === 0
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Bu Hafta (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-1);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -1
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Geçen Hafta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-2);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -2
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  2 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-3);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -3
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  3 Hafta Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(-4);
                    setIsWeekModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    weekOffset === -4
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  1 Ay Önce (4. Hafta)
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={weekSearchQuery}
                    onChange={(e) => setWeekSearchQuery(e.target.value)}
                    placeholder="Hafta veya ay ara (Örn: Eylül, Ağustos)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  {weekSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setWeekSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-300 shrink-0">
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      weekFilterTab === 'all'
                        ? 'bg-[#0f172a] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({pastWeeksList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekFilterTab('with_questions')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                      weekFilterTab === 'with_questions'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white">
                      {activeWeeksCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Hafta Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun hafta bulunamadı.
                </div>
              ) : (
                filteredPastWeeks.map((item) => {
                  const isSelected = item.offset === weekOffset;
                  return (
                    <div
                      key={item.offset}
                      onClick={() => {
                        setWeekOffset(item.offset);
                        setIsWeekModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-[#0f172a] text-orange-400'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {item.offset === 0 ? '0' : item.offset}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950' : 'text-[#0f172a]'
                              }`}
                            >
                              {item.weekLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.offset === 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isSelected
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {formatTurkishDate(item.startDateStr)} - {formatTurkishDate(item.endDateStr)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-[#0f172a] flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                {item.activeDaysCount} gün soru girişi yapıldı
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              Soru kaydı yok (0)
                            </span>
                          )}
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                              <span>Seçili</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-white hover:bg-[#0f172a] text-slate-700 hover:text-white border border-slate-300 hover:border-[#0f172a] text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                              İncele
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Hafta seçildiğinde Looker Studio grafikleri, başarı analizi ve PDF raporları anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setIsWeekModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600" />
                    <span>Güncel Haftaya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWeekModalOpen(false)}
                  className="px-4 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* GEÇMİŞ AYLARI İNCELEME AÇILIR PENCERESİ (LOOKER STUDIO MODAL)               */}
      {/* ========================================================================= */}
      {isMonthModalOpen && activeStudent && (
        <div
          id="month-picker-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsMonthModalOpen(false);
            }
          }}
        >
          <div
            id="month-picker-modal-content"
            className="w-full max-w-2xl bg-white border border-slate-300 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Başlık */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                      Açılır Pencere
                    </span>
                    <span className="text-xs text-slate-300 font-medium">
                      Öğrenci: <strong className="text-white">{activeStudent.name}</strong>
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Geçmiş Ayları ve Çözülen Soruları İncele
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Kapat (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hızlı Filtre & Arama Bölümü */}
            <div className="p-4 bg-[#f8fafc] border-b border-slate-200 space-y-3 shrink-0">
              {/* Hızlı Butonlar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 text-[11px] font-bold shrink-0">Hızlı Dönem:</span>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Bu Ay (Güncel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  Geçen Ay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  2 Ay Önce
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                    setMonthDate({ year: d.getFullYear(), month: d.getMonth() });
                    setIsMonthModalOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                >
                  3 Ay Önce
                </button>
              </div>

              {/* Arama ve Filtre Sekmeleri */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={monthSearchQuery}
                    onChange={(e) => setMonthSearchQuery(e.target.value)}
                    placeholder="Ay veya yıl ara (Örn: Eylül, 2026)..."
                    className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  {monthSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMonthSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-300 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      monthFilterTab === 'all'
                        ? 'bg-[#0f172a] text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tümü ({pastMonthsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMonthFilterTab('with_questions')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                      monthFilterTab === 'with_questions'
                        ? 'bg-orange-600 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Soru Çözülenler</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white">
                      {activeMonthsCount}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Ay Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza veya seçtiğiniz filtreye uygun ay bulunamadı.
                </div>
              ) : (
                filteredPastMonths.map((item) => {
                  const isSelected = item.year === monthDate.year && item.month === monthDate.month;
                  return (
                    <div
                      key={`${item.year}-${item.month}`}
                      onClick={() => {
                        setMonthDate({ year: item.year, month: item.month });
                        setIsMonthModalOpen(false);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-[#0f172a] text-orange-400'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {item.month + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-orange-950' : 'text-[#0f172a]'
                              }`}
                            >
                              {item.monthLabel}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                                item.year === new Date().getFullYear() && item.month === new Date().getMonth()
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isSelected
                                  ? 'bg-orange-200 text-orange-900'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.relativeLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {item.year} Yılı • {TURKISH_MONTHS[item.month]} Dönemi
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:self-center justify-between sm:justify-end">
                        <div className="text-left sm:text-right">
                          {item.hasActivity ? (
                            <div>
                              <span className="text-xs font-extrabold text-[#0f172a] flex items-center gap-1 sm:justify-end">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                {item.totalQuestions} Soru Çözüldü
                              </span>
                              <span className="text-[10px] text-emerald-600 font-semibold block">
                                {item.activeDaysCount} aktif çalışma günü
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              Soru kaydı yok (0)
                            </span>
                          )}
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs">
                              <Check className="w-3.5 h-3.5" />
                              <span>Seçili</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-1.5 bg-white hover:bg-[#0f172a] text-slate-700 hover:text-white border border-slate-300 hover:border-[#0f172a] text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                              İncele
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Ay seçildiğinde aylık Looker Studio grafikleri, başarı oranları ve aylık PDF anında güncellenir.</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                      setIsMonthModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-orange-600" />
                    <span>Güncel Aya Git</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMonthModalOpen(false)}
                  className="px-4 py-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
