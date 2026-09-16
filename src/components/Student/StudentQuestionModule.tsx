import React, { useState, useMemo, useEffect } from 'react';
import {
  HelpCircle,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Download,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  CalendarDays,
  Sparkles,
  ListFilter,
  Layers,
  Award,
  Target,
  ArrowUpRight,
  Filter,
  User,
  Users,
  Search,
  ChevronDown,
  RotateCcw,
  X,
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
import { Student, ClassGroup, StudentQuestionLog, QuestionLogSubjectEntry } from '../../types';
import { dataService } from '../../services/dataService';
import {
  DEFAULT_SUBJECTS,
  computeWeeklyAnalytics,
  computeMonthlyAnalytics,
  downloadWeeklyPDF,
  downloadMonthlyPDF,
  formatTurkishDate,
  formatDateISO,
  getMondayOfWeek,
  TURKISH_MONTHS,
  getStudentSchoolLevel,
  getStudentQuestionSubjects,
} from '../../utils/questionAnalytics';

interface StudentQuestionModuleProps {
  currentStudent: Student;
  classes: ClassGroup[];
  students: Student[];
}

export const StudentQuestionModule: React.FC<StudentQuestionModuleProps> = ({
  currentStudent,
  classes,
  students,
}) => {
  // Sınıf ve öğrenci seçimi (varsayılan aktif öğrenci)
  const [selectedClassId, setSelectedClassId] = useState<string>(currentStudent.classId || '');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(currentStudent.id || '');

  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || currentStudent;
  }, [students, selectedStudentId, currentStudent]);

  const classStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter((s) => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // Görünüm sekmeleri: 'entry' (Soru Girişi) | 'weekly' (Haftalık Analiz) | 'monthly' (Aylık Analiz) | 'history' (Geçmiş Kayıtlar)
  const [activeTab, setActiveTab] = useState<'entry' | 'weekly' | 'monthly' | 'history'>('weekly');

  // Grafik görselleştirme tipi: 'bar' (Sütun) | 'area' (Trend & Alan)
  const [chartVisualType, setChartVisualType] = useState<'bar' | 'area'>('bar');

  // Dinamik günlük hedef soru sayısı
  const [dailyQuestionTarget, setDailyQuestionTarget] = useState<number>(50);

  // Tarih ve dönem ofsetleri
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Açılır pencere (Pop-up modal) kontrolleri
  const [isWeekModalOpen, setIsWeekModalOpen] = useState<boolean>(false);
  const [isMonthModalOpen, setIsMonthModalOpen] = useState<boolean>(false);
  const [weekSearchQuery, setWeekSearchQuery] = useState<string>('');
  const [monthSearchQuery, setMonthSearchQuery] = useState<string>('');

  // Form input mode: 'list' (Tüm derslerin karşısına yazma) or 'single' (Tek ders seçip yazma)
  const [inputMode, setInputMode] = useState<'list' | 'single'>('list');

  // Soru giriş formu
  const [entryDate, setEntryDate] = useState<string>(formatDateISO(new Date()));
  const [entryNotes, setEntryNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  const activeSubjects = useMemo(() => {
    return getStudentQuestionSubjects(activeStudent, classes);
  }, [activeStudent, classes]);

  const [listRows, setListRows] = useState<
    { subject: string; questionCount: string; correctCount: string; wrongCount: string; topic: string }[]
  >(() => {
    const subs = getStudentQuestionSubjects(currentStudent, classes);
    return subs.map((sub) => ({
      subject: sub,
      questionCount: '',
      correctCount: '',
      wrongCount: '',
      topic: '',
    }));
  });

  useEffect(() => {
    setListRows((prev) => {
      return activeSubjects.map((sub) => {
        const found = prev.find((p) => p.subject === sub);
        return (
          found || {
            subject: sub,
            questionCount: '',
            correctCount: '',
            wrongCount: '',
            topic: '',
          }
        );
      });
    });
  }, [activeSubjects]);

  const [singleSubject, setSingleSubject] = useState<string>(() => activeSubjects[0] || 'Matematik');
  const [singleCount, setSingleCount] = useState<string>('');
  const [singleCorrect, setSingleCorrect] = useState<string>('');
  const [singleWrong, setSingleWrong] = useState<string>('');
  const [singleTopic, setSingleTopic] = useState<string>('');
  const [singleEntries, setSingleEntries] = useState<QuestionLogSubjectEntry[]>([]);

  // Soru logları aboneliği
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  const handleAddSingleEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(singleCount, 10);
    if (isNaN(count) || count <= 0) return;

    const corr = singleCorrect ? parseInt(singleCorrect, 10) : undefined;
    const wrng = singleWrong ? parseInt(singleWrong, 10) : undefined;

    setSingleEntries((prev) => [
      ...prev,
      {
        subject: singleSubject,
        questionCount: count,
        correctCount: corr,
        wrongCount: wrng,
        topic: singleTopic.trim() || undefined,
      },
    ]);

    setSingleCount('');
    setSingleCorrect('');
    setSingleWrong('');
    setSingleTopic('');
  };

  const handleRemoveSingleEntry = (index: number) => {
    setSingleEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveQuestionLog = () => {
    let finalEntries: QuestionLogSubjectEntry[] = [];

    if (inputMode === 'list') {
      listRows.forEach((row) => {
        const count = parseInt(row.questionCount, 10);
        if (!isNaN(count) && count > 0) {
          const corr = row.correctCount ? parseInt(row.correctCount, 10) : undefined;
          const wrng = row.wrongCount ? parseInt(row.wrongCount, 10) : undefined;
          finalEntries.push({
            subject: row.subject,
            questionCount: count,
            correctCount: corr,
            wrongCount: wrng,
            topic: row.topic.trim() || undefined,
          });
        }
      });
    } else {
      finalEntries = [...singleEntries];
    }

    if (finalEntries.length === 0) {
      alert('Lütfen en az bir ders için çözülen soru sayısı giriniz.');
      return;
    }

    const currentClass = classes.find((c) => c.id === activeStudent.classId);

    dataService.saveQuestionLog({
      studentId: activeStudent.id,
      studentName: activeStudent.name,
      classId: activeStudent.classId || selectedClassId,
      className: activeStudent.className || currentClass?.name || 'Belirtilmedi',
      date: entryDate,
      entries: finalEntries,
      notes: entryNotes.trim(),
    });

    setSaveSuccessMsg(`${formatTurkishDate(entryDate)} tarihli soru sayısı kaydınız başarıyla kaydedildi!`);
    setTimeout(() => {
      setSaveSuccessMsg('');
    }, 4500);

    // Formu sıfırla
    if (inputMode === 'list') {
      setListRows((prev) =>
        prev.map((r) => ({
          ...r,
          questionCount: '',
          correctCount: '',
          wrongCount: '',
          topic: '',
        }))
      );
    } else {
      setSingleEntries([]);
    }
    setEntryNotes('');
  };

  // Haftalık analitik hesaplama
  const targetWeekDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weeklyAnalytics = useMemo(() => {
    return computeWeeklyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || 'Sınıf Belirtilmedi',
      targetWeekDate
    );
  }, [allLogs, activeStudent, targetWeekDate]);

  // Aylık analitik hesaplama
  const monthlyAnalytics = useMemo(() => {
    return computeMonthlyAnalytics(
      allLogs,
      activeStudent.id,
      activeStudent.name,
      activeStudent.className || 'Sınıf Belirtilmedi',
      monthDate.year,
      monthDate.month
    );
  }, [allLogs, activeStudent, monthDate]);

  // Öğrenci geçmiş kayıtları
  const studentHistoryLogs = useMemo(() => {
    return allLogs
      .filter((l) => l.studentId === activeStudent.id && (l.totalQuestions || 0) > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, activeStudent.id]);

  // Öğrencinin geçmiş haftaları (Soru sayısı 0 olan geçmiş haftalar tamamen silinir/çıkarılır)
  const pastWeeksList = useMemo(() => {
    const currentMonday = getMondayOfWeek(new Date());
    const studentLogs = allLogs.filter((l) => l.studentId === activeStudent.id);

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

      // SADECE güncel hafta veya soru sayısı > 0 olan geçmiş haftalar eklenir; soru sayısı olmayan geçmiş haftalar tamamen silinir
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
  }, [allLogs, activeStudent.id]);

  // Filtrelenmiş geçmiş haftalar (Arama için)
  const filteredPastWeeks = useMemo(() => {
    return pastWeeksList.filter((item) => {
      if (weekSearchQuery.trim()) {
        const q = weekSearchQuery.toLowerCase().trim();
        const matchesLabel = item.weekLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastWeeksList, weekSearchQuery]);

  // Öğrencinin geçmiş ayları (Soru sayısı 0 olan geçmiş aylar tamamen silinir/çıkarılır)
  const pastMonthsList = useMemo(() => {
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

      // SADECE güncel ay veya soru sayısı > 0 olan geçmiş aylar eklenir; soru sayısı olmayan geçmiş aylar tamamen silinir
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
  }, [allLogs, activeStudent.id]);

  const filteredPastMonths = useMemo(() => {
    return pastMonthsList.filter((item) => {
      if (monthSearchQuery.trim()) {
        const q = monthSearchQuery.toLowerCase().trim();
        const matchesLabel = item.monthLabel.toLowerCase().includes(q);
        const matchesRel = item.relativeLabel.toLowerCase().includes(q);
        return matchesLabel || matchesRel;
      }
      return true;
    });
  }, [pastMonthsList, monthSearchQuery]);

  // Hafta gezinme yardımcıları (Yalnızca kayıtlı ve soru çözülmüş haftalar arasında geçiş)
  const currentWeekListIdx = useMemo(() => {
    return pastWeeksList.findIndex((w) => w.offset === weekOffset);
  }, [pastWeeksList, weekOffset]);

  const canGoPreviousWeek = currentWeekListIdx >= 0 && currentWeekListIdx < pastWeeksList.length - 1;
  const canGoNextWeek = currentWeekListIdx > 0;

  const handlePreviousWeek = () => {
    if (canGoPreviousWeek) {
      setWeekOffset(pastWeeksList[currentWeekListIdx + 1].offset);
    }
  };

  const handleNextWeek = () => {
    if (canGoNextWeek) {
      setWeekOffset(pastWeeksList[currentWeekListIdx - 1].offset);
    }
  };

  // Ay gezinme yardımcıları (Yalnızca kayıtlı ve soru çözülmüş aylar arasında geçiş)
  const currentMonthListIdx = useMemo(() => {
    return pastMonthsList.findIndex((m) => m.year === monthDate.year && m.month === monthDate.month);
  }, [pastMonthsList, monthDate]);

  const canGoPreviousMonth = currentMonthListIdx >= 0 && currentMonthListIdx < pastMonthsList.length - 1;
  const canGoNextMonth = currentMonthListIdx > 0;

  const handlePreviousMonth = () => {
    if (canGoPreviousMonth) {
      const target = pastMonthsList[currentMonthListIdx + 1];
      setMonthDate({ year: target.year, month: target.month });
    }
  };

  const handleNextMonth = () => {
    if (canGoNextMonth) {
      const target = pastMonthsList[currentMonthListIdx - 1];
      setMonthDate({ year: target.year, month: target.month });
    }
  };

  // Hedef Tamamlama Oranı
  const weeklyTargetTotal = dailyQuestionTarget * 7;
  const weeklyTargetCompletionRate = useMemo(() => {
    if (!weeklyAnalytics || weeklyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((weeklyAnalytics.totalQuestions / weeklyTargetTotal) * 100));
  }, [weeklyAnalytics, weeklyTargetTotal]);

  const monthlyTargetTotal = dailyQuestionTarget * 30;
  const monthlyTargetCompletionRate = useMemo(() => {
    if (!monthlyAnalytics || monthlyTargetTotal <= 0) return 0;
    return Math.min(100, Math.round((monthlyAnalytics.totalQuestions / monthlyTargetTotal) * 100));
  }, [monthlyAnalytics, monthlyTargetTotal]);

  // Looker Studio Custom Popover Tooltip
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
                <span className="text-[11px] text-slate-500 font-medium">Öğrenci Soru Analitik Paneli</span>
              </div>
              <h2 className="text-lg font-bold text-[#0f172a] tracking-tight">
                Günlük Soru Çözümü ve Başarı İlerleme Modülü
              </h2>
            </div>
          </div>

          {/* Quick PDF & Export Bar */}
          <div className="flex items-center gap-2">
            {activeTab === 'weekly' && weeklyAnalytics && (
              <button
                id="btn-student-looker-pdf-weekly"
                onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Haftalık Raporu İndir (PDF)</span>
              </button>
            )}
            {activeTab === 'monthly' && monthlyAnalytics && (
              <button
                id="btn-student-looker-pdf-monthly"
                onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                className="px-3.5 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Aylık Raporu İndir (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Tab Navigation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-4">
          {/* 1. Görünüm Modu / Sekme Seçimi */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200 lg:col-span-2">
            <label className="block text-[11px] font-bold text-[#334155] mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#1e3a8a]" />
              Çalışma Modülü & Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-white border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('weekly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'weekly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Haftalık Analiz
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('monthly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'monthly'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Aylık Analiz
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('entry')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'entry'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-[#475569] hover:text-orange-600'
                }`}
              >
                + Soru Kaydet
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-[#0f172a] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                Geçmiş Kayıtlar
              </button>
            </div>
          </div>

          {/* 2. Günlük Hedef Soru Ayarı */}
          <div className="bg-[#f8fafc] p-3 rounded-xl border border-slate-200 lg:col-span-1">
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

      {/* ========================================================================= */}
      {/* SEKME 1: HAFTALIK LOOKER STUDIO DASHBOARD                                */}
      {/* ========================================================================= */}
      {activeTab === 'weekly' && weeklyAnalytics && (
        <div className="space-y-6">
          {/* Hafta Gezinme */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousWeek}
                disabled={!canGoPreviousWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousWeek
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousWeek ? 'Önceki Soru Çözülen Hafta' : 'Daha Eski Kayıtlı Hafta Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-week-picker"
                type="button"
                onClick={() => setIsWeekModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş haftaları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Güncel Hafta' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
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
                  <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1">
                    <span className="text-slate-500 font-medium">Haftalık İnceleme:</span>
                    <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {weeklyAnalytics.weekLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextWeek}
                disabled={!canGoNextWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextWeek
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer shadow-xs'
                }`}
                title={canGoNextWeek ? 'Sonraki Soru Çözülen Hafta' : 'Daha Yeni Hafta Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Güncel Haftaya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Hafta</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('entry')}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bugünün Sorularını Ekle</span>
              </button>
            </div>
          </div>

          {/* Executive KPI Scorecards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Toplam Çözülen Soru */}
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

            {/* 2. Kurs / Hedef Bitirme Oranı */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Haftalık Hedef Bitirme</span>
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
              <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-orange-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, weeklyTargetCompletionRate)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                <span>Hedef: <strong>{weeklyTargetTotal} Soru</strong></span>
                <span className="text-slate-700 font-semibold">{weeklyAnalytics.dailyAverage} soru/gün</span>
              </div>
            </div>

            {/* 3. Çalışma Disiplini */}
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
              <div className="mt-3">
                {weeklyAnalytics.unsolvedDaysCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-orange-600" />
                    {weeklyAnalytics.unsolvedDaysCount} Gün Boş ({weeklyAnalytics.unsolvedDays.join(', ')})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    7 Gün Kesintisiz Çalışma
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Haftalık Devamlılık: <strong className="text-slate-700">%{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}</strong>
              </div>
            </div>

            {/* 4. Başarı ve Doğruluk Oranı */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Başarı & Doğruluk</span>
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

          {/* Ana Grafik (Hafif Gri Çizim Alanı, Koyu Gri Metinler, Doğrudan Değerler) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-base font-bold text-[#0f172a] tracking-tight">
                  Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-3">
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
                    Sütun
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
                    Trend
                  </button>
                </div>
              </div>
            </div>

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
                    <Bar
                      dataKey="totalQuestions"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={55}
                    >
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
                        const isZero = entry.totalQuestions === 0;
                        const isAboveTarget = entry.totalQuestions >= dailyQuestionTarget;
                        return (
                          <Cell
                            key={`cell-student-${index}`}
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
                      <linearGradient id="studentNavyGradient" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#studentNavyGradient)"
                      dot={{ r: 5, fill: '#ea580c', stroke: '#ffffff', strokeWidth: 2 }}
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

          {/* Günlük Veri Tablosu ve Ders Dağılımı */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
              <h4 className="text-sm font-bold text-[#0f172a] mb-4 pb-2 border-b border-slate-100">
                Günlük Soru Çözüm ve Başarı Tablosu
              </h4>
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
                            <span className="font-extrabold text-[#0f172a] text-sm">{d.totalQuestions}</span>
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

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#0f172a] mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600" />
                  Kurs & Ders Bitirme Oranları
                </h4>
                {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {weeklyAnalytics.subjectBreakdown.map((sub, i) => (
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
                  <p className="text-xs text-slate-500 italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                )}

                <div className="mt-5 p-3.5 bg-[#f8fafc] rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                    <Award className="w-3.5 h-3.5 text-orange-600" />
                    <span>Haftalık Rehberlik Tavsiyesi</span>
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
                  <span>Looker Studio Haftalık Raporumu İndir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 2: AYLIK LOOKER STUDIO DASHBOARD                                   */}
      {/* ========================================================================= */}
      {activeTab === 'monthly' && monthlyAnalytics && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousMonth}
                disabled={!canGoPreviousMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousMonth
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousMonth ? 'Önceki Soru Çözülen Ay' : 'Daha Eski Kayıtlı Ay Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-month-picker"
                type="button"
                onClick={() => setIsMonthModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-[#f8fafc] hover:bg-orange-50/60 border border-slate-300 hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş ayları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 group-hover:bg-orange-600 text-orange-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">
                      {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                        ? 'Güncel Ay'
                        : 'Geçmiş Dönem'}
                    </span>
                    {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                      <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                        Aktif Ay
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                        Geçmiş Ay
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#0f172a] flex items-center gap-1">
                    <span className="text-slate-500 font-medium">Analiz Ayı:</span>
                    <span className="text-[#1e3a8a] underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {monthlyAnalytics.monthLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-slate-200 text-slate-400 group-hover:text-orange-600 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canGoNextMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextMonth
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-[#f8fafc] hover:bg-slate-200 border border-slate-300 text-slate-700 cursor-pointer shadow-xs'
                }`}
                title={canGoNextMonth ? 'Sonraki Soru Çözülen Ay' : 'Daha Yeni Ay Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {(monthDate.year !== new Date().getFullYear() || monthDate.month !== new Date().getMonth()) && (
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setMonthDate({ year: now.getFullYear(), month: now.getMonth() });
                  }}
                  className="px-3 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Güncel Aya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Ay</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-slate-500">Aylık Toplam Soru</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-[#0f172a]">{monthlyAnalytics.totalQuestions}</span>
                <span className="text-xs font-semibold text-slate-500">Soru</span>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                Haftalık Ortalama: <strong className="text-slate-800">{monthlyAnalytics.weeklyAverage} soru</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-slate-500">Aylık Hedef Bitirme</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-orange-600">%{monthlyTargetCompletionRate}</span>
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

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-slate-500">Aktif Çalışma Günleri</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-[#0f172a]">{monthlyAnalytics.activeDaysCount}</span>
                <span className="text-xs font-semibold text-slate-500">Gün</span>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                Aylık Düzenlilik: <strong className="text-slate-800">%{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-slate-500">Geçmiş Aya Göre Gelişim</span>
              <div className="flex items-baseline gap-2 mt-2">
                {monthlyAnalytics.monthlyDifference >= 0 ? (
                  <span className="text-2xl font-black text-emerald-700">+{monthlyAnalytics.monthlyDifference} Soru</span>
                ) : (
                  <span className="text-2xl font-black text-rose-700">{monthlyAnalytics.monthlyDifference} Soru</span>
                )}
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                Önceki Ay: <strong className="text-slate-800">{monthlyAnalytics.previousMonthTotal} soru</strong>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
            <h4 className="text-base font-bold text-[#0f172a] tracking-tight mb-4">
              Aylık Hafta Bazında Soru Çözüm Grafiği
            </h4>
            <div className="h-80 w-full bg-[#f8fafc] rounded-xl p-3 border border-slate-200/80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="weekLabel" stroke="#475569" fontSize={12} fontWeight={600} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={12} fontWeight={600} tickLine={false} />
                  <Tooltip content={renderLookerTooltip} />
                  <Bar dataKey="totalQuestions" fill="#1e3a8a" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    <LabelList dataKey="totalQuestions" position="top" fill="#0f172a" fontSize={12} fontWeight={800} offset={8} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 3: YENİ SORU SAYISI KAYDET FORMU                                    */}
      {/* ========================================================================= */}
      {activeTab === 'entry' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-[#0f172a]">Günlük Soru Sayısı Girişi</h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-[#f1f5f9] p-0.5 border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('list')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'list'
                      ? 'bg-white text-[#0f172a] shadow-xs'
                      : 'text-slate-600 hover:text-[#0f172a]'
                  }`}
                >
                  Ders Listesi Tablosu
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('single')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'single'
                      ? 'bg-white text-[#0f172a] shadow-xs'
                      : 'text-slate-600 hover:text-[#0f172a]'
                  }`}
                >
                  Tek Tek Ders Ekle
                </button>
              </div>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Tarih Seçimi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-[#334155] mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1e3a8a]" />
                Soru Çözülen Tarih
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-[#0f172a] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-[#334155] mb-1.5">
                Çalışma Notu veya Deneme Adı (İsteğe Bağlı)
              </label>
              <input
                type="text"
                placeholder="Örn: Hafta sonu genel tarama testi"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-[#0f172a] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          {/* Input Mode: List Tablosu */}
          {inputMode === 'list' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-2.5">Ders Adı</th>
                    <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                    <th className="px-3.5 py-2.5 text-center">Doğru</th>
                    <th className="px-3.5 py-2.5 text-center">Yanlış</th>
                    <th className="px-3.5 py-2.5">Çalışılan Konu / Test</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listRows.map((row, idx) => (
                    <tr key={row.subject} className="hover:bg-slate-50">
                      <td className="px-3.5 py-2 font-bold text-[#0f172a]">{row.subject}</td>
                      <td className="px-3.5 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.questionCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setListRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, questionCount: val } : r))
                            );
                          }}
                          className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center font-bold text-[#0f172a] focus:border-orange-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3.5 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={row.correctCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setListRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, correctCount: val } : r))
                            );
                          }}
                          className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center text-emerald-700 font-semibold focus:border-emerald-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3.5 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={row.wrongCount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setListRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, wrongCount: val } : r))
                            );
                          }}
                          className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center text-rose-700 font-semibold focus:border-rose-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3.5 py-2">
                        <input
                          type="text"
                          placeholder="Konu adı..."
                          value={row.topic}
                          onChange={(e) => {
                            const val = e.target.value;
                            setListRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, topic: val } : r))
                            );
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-[#0f172a] focus:border-orange-500 focus:outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Input Mode: Single Form */}
          {inputMode === 'single' && (
            <div className="space-y-4">
              <form onSubmit={handleAddSingleEntry} className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-[#f8fafc] p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-1">Ders</label>
                  <select
                    value={singleSubject}
                    onChange={(e) => setSingleSubject(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#0f172a]"
                  >
                    {activeSubjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-1">Soru Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Soru"
                    value={singleCount}
                    onChange={(e) => setSingleCount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#0f172a]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-1">Doğru</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="D"
                    value={singleCorrect}
                    onChange={(e) => setSingleCorrect(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-emerald-700 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#334155] mb-1">Yanlış</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Y"
                    value={singleWrong}
                    onChange={(e) => setSingleWrong(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-rose-700 font-semibold"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ekle
                  </button>
                </div>
              </form>

              {singleEntries.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f1f5f9] text-[#334155] font-bold">
                      <tr>
                        <th className="px-3.5 py-2">Ders</th>
                        <th className="px-3.5 py-2 text-center">Soru</th>
                        <th className="px-3.5 py-2 text-center">D / Y</th>
                        <th className="px-3.5 py-2 text-right">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {singleEntries.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3.5 py-2 font-bold text-[#0f172a]">{item.subject}</td>
                          <td className="px-3.5 py-2 text-center font-bold text-[#0f172a]">{item.questionCount} Soru</td>
                          <td className="px-3.5 py-2 text-center text-slate-600">
                            D: {item.correctCount ?? '—'} / Y: {item.wrongCount ?? '—'}
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleEntry(idx)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-semibold cursor-pointer"
                            >
                              Kaldır
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSaveQuestionLog}
              className="px-6 py-2.5 bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <Check className="w-4 h-4 text-orange-400" />
              <span>Soru Kaydını Tamamla ve Gönder</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEKME 4: GEÇMİŞ KAYITLAR                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-[#0f172a]">Geçmiş Soru Sayısı Kayıtları</h3>
            </div>
            <span className="text-xs font-bold text-[#0f172a] bg-[#f8fafc] px-3 py-1.5 rounded-lg border border-slate-200">
              Toplam {studentHistoryLogs.length} Günlük Kayıt
            </span>
          </div>

          {studentHistoryLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Henüz geçmiş bir soru çözümü kaydı bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f1f5f9] text-[#334155] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3 text-center">Toplam Soru</th>
                    <th className="px-4 py-3">Çözülen Dersler</th>
                    <th className="px-4 py-3">Not</th>
                    <th className="px-4 py-3 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentHistoryLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#0f172a]">
                        {formatTurkishDate(log.date)}
                      </td>
                      <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a] text-sm">
                        {log.totalQuestions} Soru
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {log.entries.map((e) => `${e.subject}: ${e.questionCount}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-slate-500 italic">
                        {log.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Bu soru kaydını silmek istediğinize emin misiniz?')) {
                              dataService.deleteQuestionLog(log.id);
                            }
                          }}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Kaydı Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: GEÇMİŞ HAFTALAR AÇILIR PENCERESİ (YALNIZCA SORU ÇÖZÜLENLER)       */}
      {/* ========================================================================= */}
      {isWeekModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-orange-50/70 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">
                    Haftalık İnceleme Dönemi Seçin
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı haftalar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-slate-100 bg-[#f8fafc]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={weekSearchQuery}
                  onChange={(e) => setWeekSearchQuery(e.target.value)}
                  placeholder="Tarih veya hafta ara..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {weekSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setWeekSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Hafta Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza uygun kayıtlı hafta bulunamadı.
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
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.offset === 0 ? 'Bugün' : `${item.offset}H`}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-[#0f172a]">
                              {item.relativeLabel}
                            </span>
                            {item.offset === 0 && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel
                              </span>
                            )}
                            {item.hasActivity && (
                              <span className="text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded-md">
                                {item.activeDaysCount} Gün Çözüm
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-slate-200 sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Seçili' : 'İncele'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-[#f8fafc] flex justify-between items-center text-xs text-slate-500 px-5">
              <span>Toplam {pastWeeksList.length} kayıtlı dönem</span>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: GEÇMİŞ AYLAR AÇILIR PENCERESİ (YALNIZCA SORU ÇÖZÜLENLER)          */}
      {/* ========================================================================= */}
      {isMonthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-orange-50/70 via-white to-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#0f172a]">
                    Aylık Analiz Dönemi Seçin
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı aylar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-slate-100 bg-[#f8fafc]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={monthSearchQuery}
                  onChange={(e) => setMonthSearchQuery(e.target.value)}
                  placeholder="Ay veya yıl ara..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {monthSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMonthSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Ay Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Aramanıza uygun kayıtlı ay bulunamadı.
                </div>
              ) : (
                filteredPastMonths.map((item) => {
                  const isSelected = item.year === monthDate.year && item.month === monthDate.month;
                  const isCurrent =
                    item.year === new Date().getFullYear() && item.month === new Date().getMonth();
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
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-[#0f172a]">
                              {item.monthLabel}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel Ay
                              </span>
                            )}
                            <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                              {item.relativeLabel}
                            </span>
                          </div>
                          {item.hasActivity && (
                            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                              {item.activeDaysCount} Gün Çözüm Kaydı
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-slate-200 sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-700'
                          }`}
                        >
                          {isSelected ? 'Seçili' : 'İncele'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-[#f8fafc] flex justify-between items-center text-xs text-slate-500 px-5">
              <span>Toplam {pastMonthsList.length} kayıtlı ay</span>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
