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

  const handleSaveQuestionLog = async () => {
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

    try {
      await dataService.saveQuestionLog({
        studentId: activeStudent.id,
        studentName: activeStudent.name,
        classId: activeStudent.classId || selectedClassId,
        className: activeStudent.className || currentClass?.name || 'Belirtilmedi',
        date: entryDate,
        entries: finalEntries,
        notes: entryNotes.trim(),
      });
    } catch {
      // Hata uyarısı gösterildi; girilen sayılar kaybolmasın diye form temizlenmez
      return;
    }

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

  // Haftalık tarih aralığı
  const currentWeekStartDate = useMemo(() => {
    const mon = getMondayOfWeek(targetWeekDate);
    return formatDateISO(mon);
  }, [targetWeekDate]);

  const currentWeekEndDate = useMemo(() => {
    const mon = getMondayOfWeek(targetWeekDate);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return formatDateISO(sun);
  }, [targetWeekDate]);

  // Öğretmen tarafından öğrenciye atanan haftalık soru hedefi
  const activeWeeklyTarget = useMemo(() => {
    return dataService.getWeeklyQuestionTarget(activeStudent.id, currentWeekStartDate);
  }, [activeStudent.id, currentWeekStartDate, allLogs]);

  // Hedef Tamamlama Oranı (Öğretmenin atadığı haftalık hedef önceliklidir)
  const weeklyTargetTotal = activeWeeklyTarget?.targetQuestions || (dailyQuestionTarget * 7);
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
        <div className="bg-surface border border-line shadow-xl rounded-xl p-3.5 text-xs text-fg space-y-1.5 z-50 min-w-[210px]">
          <div className="flex items-center justify-between border-b border-line pb-1.5">
            <span className="font-bold text-fg text-xs">
              {data.dayName ? `${data.dayName} (${formatTurkishDate(data.dateStr)})` : data.weekLabel}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30">
              {data.totalQuestions > 0 ? `${data.totalQuestions} Soru` : '0 Soru'}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-muted">
              <span>Toplam Çözülen:</span>
              <strong className="text-fg font-bold text-xs">{data.totalQuestions} Soru</strong>
            </div>

            {data.totalCorrect !== undefined && data.totalCorrect > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Doğru:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">{data.totalCorrect}</span>
              </div>
            )}

            {data.totalWrong !== undefined && data.totalWrong > 0 && (
              <div className="flex justify-between items-center text-muted">
                <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Yanlış:
                </span>
                <span className="font-bold text-rose-700 dark:text-rose-300">{data.totalWrong}</span>
              </div>
            )}

            {data.totalQuestions >= dailyQuestionTarget ? (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-300 font-semibold flex items-center gap-1 pt-1 border-t border-line">
                <CheckCircle2 className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                <span>Günlük Hedefe Ulaşıldı (%{Math.round((data.totalQuestions / dailyQuestionTarget) * 100)})</span>
              </div>
            ) : data.totalQuestions > 0 ? (
              <div className="text-[11px] text-orange-600 dark:text-orange-300 font-medium pt-1 border-t border-line">
                Hedefe {dailyQuestionTarget - data.totalQuestions} soru kaldı
              </div>
            ) : (
              <div className="text-[11px] text-rose-600 dark:text-rose-300 font-medium flex items-center gap-1 pt-1 border-t border-line">
                <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                <span>Bu gün soru çözülmedi</span>
              </div>
            )}

            {data.subjectsText && (
              <div className="pt-1 border-t border-line text-[10px] text-muted truncate max-w-[200px]">
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
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fg text-surface flex items-center justify-center shadow-md shadow-slate-900/10">
              <BarChart3 className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg tracking-tight">
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
                className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Haftalık Raporu İndir (PDF)</span>
              </button>
            )}
            {activeTab === 'monthly' && monthlyAnalytics && (
              <button
                id="btn-student-looker-pdf-monthly"
                onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
                className="px-3.5 py-2 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Aylık Raporu İndir (PDF)</span>
              </button>
            )}
          </div>
        </div>

        {/* Looker Studio Filter & Tab Navigation */}
        <div className="pt-4">
          {/* Görünüm Modu / Sekme Seçimi */}
          <div className="bg-surface-2 p-3 rounded-xl border border-line w-full">
            <label className="block text-[11px] font-bold text-fg-2 mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
              Çalışma Modülü & Analiz Boyutu
            </label>
            <div className="flex rounded-lg bg-surface border border-line-strong p-0.5">
              <button
                type="button"
                id="btn-student-tab-entry"
                onClick={() => setActiveTab('entry')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'entry'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-muted hover:text-orange-600 dark:hover:text-orange-300'
                }`}
              >
                + Soru Kaydet
              </button>
              <button
                type="button"
                id="btn-student-tab-history"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Geçmiş Kayıtlar
              </button>
              <button
                type="button"
                id="btn-student-tab-weekly"
                onClick={() => setActiveTab('weekly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'weekly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Haftalık Analiz
              </button>
              <button
                type="button"
                id="btn-student-tab-monthly"
                onClick={() => setActiveTab('monthly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
                  activeTab === 'monthly'
                    ? 'bg-fg text-surface shadow-xs'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Aylık Analiz
              </button>
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
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousWeek}
                disabled={!canGoPreviousWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousWeek ? 'Önceki Soru Çözülen Hafta' : 'Daha Eski Kayıtlı Hafta Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-week-picker"
                type="button"
                onClick={() => setIsWeekModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş haftaları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider block">
                      {weekOffset === 0 ? 'Güncel Hafta' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                    </span>
                    {weekOffset !== 0 ? (
                      <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                        Geçmiş Hafta
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                        Aktif Hafta
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Haftalık İnceleme:</span>
                    <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {weeklyAnalytics.weekLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextWeek}
                disabled={!canGoNextWeek}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextWeek
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoNextWeek ? 'Sonraki Soru Çözülen Hafta' : 'Daha Yeni Hafta Yok'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
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

          {/* Öğretmen Haftalık Soru Hedefi & Rehberlik Kutusu */}
          {activeWeeklyTarget && (
            <div className="bg-gradient-to-r from-orange-50/90 dark:from-orange-500/10 via-amber-50 dark:via-amber-500/10 to-emerald-50/70 dark:to-emerald-500/10 border border-orange-200/90 dark:border-orange-500/30 rounded-2xl p-4.5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-200/60 dark:border-orange-500/30 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-fg flex items-center gap-1.5 flex-wrap">
                      <span>
                        🎯 Öğretmeninizin {activeWeeklyTarget.targetPeriodLabel || 'Bu Dönem İçin'} Belirlediği Soru Hedefi:
                      </span>
                      <span className="text-orange-700 dark:text-orange-300 font-black text-base">{activeWeeklyTarget.targetQuestions} Soru</span>
                      {activeWeeklyTarget.dailyTarget && (
                        <span className="text-xs font-bold text-muted">
                          (Günlük {activeWeeklyTarget.dailyTarget} Soru/Gün)
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted">
                      Tarih Aralığı: {formatTurkishDate(currentWeekStartDate)} - {formatTurkishDate(currentWeekEndDate)}
                      {activeWeeklyTarget.assignedBy && ` • Belirleyen: ${activeWeeklyTarget.assignedBy}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-surface border border-orange-300 dark:border-orange-500/30 text-orange-800 dark:text-orange-200 shadow-2xs">
                    %{weeklyTargetCompletionRate} Tamamlandı
                  </span>
                  {weeklyAnalytics.totalQuestions >= activeWeeklyTarget.targetQuestions ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-2xs flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Tebrikler, Hedef Başarıldı!
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-orange-600 text-white shadow-2xs">
                      {activeWeeklyTarget.targetQuestions - weeklyAnalytics.totalQuestions} Soru Kaldı
                    </span>
                  )}
                </div>
              </div>

              {activeWeeklyTarget.notes && (
                <div className="p-3 bg-surface/80 backdrop-blur-xs rounded-xl border border-orange-200/70 dark:border-orange-500/30 text-xs text-fg flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-orange-950 dark:text-orange-200 font-bold block mb-0.5">Öğretmeninizin Çalışma Notu:</strong>
                    <span className="italic text-fg-2">{activeWeeklyTarget.notes}</span>
                  </div>
                </div>
              )}

              {activeWeeklyTarget.subjectTargets && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-fg-2 uppercase tracking-wider block">
                    📚 Ders Bazlı Haftalık Hedef Dağılımı:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {(Array.isArray(activeWeeklyTarget.subjectTargets)
                      ? activeWeeklyTarget.subjectTargets.map((item) => [item.subject, item.target] as [string, number])
                      : Object.entries(activeWeeklyTarget.subjectTargets)
                    ).map(([subj, targetCount]) => {
                      const solvedCount = weeklyAnalytics.subjectBreakdown.find((s) => s.subject === subj)?.count || 0;
                      const isSubjComplete = solvedCount >= (Number(targetCount) || 0);
                      return (
                        <div
                          key={subj}
                          className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between ${
                            isSubjComplete
                              ? 'bg-emerald-50/90 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                              : 'bg-surface border-orange-200/80 dark:border-orange-500/30 text-fg'
                          }`}
                        >
                          <span className="font-bold text-[11px] truncate">{subj}</span>
                          <div className="flex items-baseline justify-between mt-1.5">
                            <span className="font-extrabold text-sm">
                              {solvedCount} / {targetCount}
                            </span>
                            {isSubjComplete && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ana Grafik (Hafif Gri Çizim Alanı, Koyu Gri Metinler, Doğrudan Değerler) */}
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <h4 className="text-base font-bold text-fg tracking-tight">
                  Günlük Soru Çözüm ve Hedef Dağılım Grafiği
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 text-xs font-semibold text-muted mr-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-[var(--chart-1)] inline-block" /> Çözülen Soru
                  </span>
                  <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-300">
                    <span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Hedef ({dailyQuestionTarget})
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300">
                    <span className="w-3 h-3 rounded bg-rose-500 inline-block" /> 0 Soru
                  </span>
                </div>

                <div className="flex rounded-lg bg-surface-2 p-0.5 border border-line text-xs">
                  <button
                    type="button"
                    onClick={() => setChartVisualType('bar')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      chartVisualType === 'bar'
                        ? 'bg-surface text-fg shadow-xs'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    Sütun
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartVisualType('area')}
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      chartVisualType === 'area'
                        ? 'bg-surface text-fg shadow-xs'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    Trend
                  </button>
                </div>
              </div>
            </div>

            <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
              <ResponsiveContainer width="100%" height="100%">
                {chartVisualType === 'bar' ? (
                  <BarChart
                    data={weeklyAnalytics.days}
                    margin={{ top: 25, right: 15, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="dayName"
                      stroke="var(--color-muted)"
                      fontSize={12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                    />
                    <YAxis
                      stroke="var(--color-muted)"
                      fontSize={12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
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
                        fill="var(--color-fg)"
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
                            fill={isZero ? '#f43f5e' : isAboveTarget ? 'var(--chart-1)' : '#3b82f6'}
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
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="dayName"
                      stroke="var(--color-muted)"
                      fontSize={12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
                    />
                    <YAxis
                      stroke="var(--color-muted)"
                      fontSize={12}
                      fontWeight={600}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-line-strong)' }}
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
                      stroke="var(--chart-1)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#studentNavyGradient)"
                      dot={{ r: 5, fill: '#ea580c', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                    >
                      <LabelList
                        dataKey="totalQuestions"
                        position="top"
                        fill="var(--color-fg)"
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
            <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-sm">
              <h4 className="text-sm font-bold text-fg mb-4 pb-2 border-b border-line">
                Günlük Soru Çözüm ve Başarı Tablosu
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                    <tr>
                      <th className="px-3.5 py-2.5">Gün</th>
                      <th className="px-3.5 py-2.5">Tarih</th>
                      <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                      <th className="px-3.5 py-2.5">Ders Dağılımı</th>
                      <th className="px-3.5 py-2.5 text-center">Hedef Durumu</th>
                      <th className="px-3.5 py-2.5 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {weeklyAnalytics.days.map((d) => {
                      const metTarget = d.totalQuestions >= dailyQuestionTarget;
                      const completionRate = Math.min(100, Math.round((d.totalQuestions / dailyQuestionTarget) * 100));
                      return (
                        <tr key={d.dateStr} className="hover:bg-surface-2 transition-colors">
                          <td className="px-3.5 py-2.5 font-bold text-fg">{d.dayName}</td>
                          <td className="px-3.5 py-2.5 text-muted">{formatTurkishDate(d.dateStr)}</td>
                          <td className="px-3.5 py-2.5 text-center">
                            <span className="font-extrabold text-fg text-sm">{d.totalQuestions}</span>
                          </td>
                          <td className="px-3.5 py-2.5 text-muted truncate max-w-xs">
                            {d.subjectsText || <span className="text-subtle italic">Ders kaydı yok</span>}
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <div className="w-12 bg-surface-3 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${metTarget ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                  style={{ width: `${completionRate}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-muted">%{completionRate}</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            {d.hasSolved ? (
                              metTarget ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                  Hedef Tamamlandı
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                                  Kısmi Çözüm
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
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

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-bold text-fg mb-3 pb-2 border-b border-line flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                  Kurs & Ders Bitirme Oranları
                </h4>
                {weeklyAnalytics.subjectBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {weeklyAnalytics.subjectBreakdown.map((sub, i) => (
                      <div key={sub.subject} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-fg">{sub.subject}</span>
                          <span className="font-bold text-orange-600 dark:text-orange-300">
                            {sub.count} Soru (%{sub.percentage})
                          </span>
                        </div>
                        <div className="w-full bg-surface-2 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              i === 0 ? 'bg-fg' : i === 1 ? 'bg-orange-500' : 'bg-[var(--chart-1)]'
                            }`}
                            style={{ width: `${sub.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted italic">Bu hafta henüz ders bazında soru kaydedilmedi.</p>
                )}

                <div className="mt-5 p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Award className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
                    <span>Haftalık Rehberlik Tavsiyesi</span>
                  </div>
                  <p className="leading-relaxed text-muted">
                    {weeklyAnalytics.statusAssessment.reportSummary}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-line">
                <button
                  onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
                  className="w-full py-2.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4 text-orange-400" />
                  <span>Haftalık Raporumu İndir</span>
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
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePreviousMonth}
                disabled={!canGoPreviousMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoPreviousMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
                }`}
                title={canGoPreviousMonth ? 'Önceki Soru Çözülen Ay' : 'Daha Eski Kayıtlı Ay Yok'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                id="btn-student-open-month-picker"
                type="button"
                onClick={() => setIsMonthModalOpen(true)}
                className="group flex items-center gap-3 px-3.5 py-2 bg-surface-2 hover:bg-orange-50/60 dark:hover:bg-orange-500/10 border border-line-strong hover:border-orange-500 rounded-2xl transition-all shadow-xs cursor-pointer text-left"
                title="Geçmiş ayları görüntülemek için tıklayın"
              >
                <div className="w-8 h-8 rounded-xl bg-orange-100/80 dark:bg-orange-500/15 group-hover:bg-orange-600 text-orange-600 dark:text-orange-300 group-hover:text-white flex items-center justify-center transition-colors shadow-xs shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-300 uppercase tracking-wider block">
                      {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth()
                        ? 'Güncel Ay'
                        : 'Geçmiş Dönem'}
                    </span>
                    {monthDate.year === new Date().getFullYear() && monthDate.month === new Date().getMonth() ? (
                      <span className="text-[9px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-1.5 py-0.2 rounded-md">
                        Aktif Ay
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                        Geçmiş Ay
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center gap-1">
                    <span className="text-muted font-medium">Analiz Ayı:</span>
                    <span className="text-[#1e3a8a] dark:text-blue-200 underline decoration-orange-400/60 decoration-2 underline-offset-2">
                      {monthlyAnalytics.monthLabel}
                    </span>
                  </h3>
                </div>
                <div className="ml-1 pl-2 border-l border-line text-subtle group-hover:text-orange-600 dark:group-hover:text-orange-300 flex items-center gap-1 text-xs font-semibold shrink-0">
                  <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5 text-orange-600 dark:text-orange-300" />
                </div>
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canGoNextMonth}
                className={`p-2.5 rounded-xl transition-colors ${
                  !canGoNextMonth
                    ? 'bg-surface-2 text-subtle cursor-not-allowed border border-line'
                    : 'bg-surface-2 hover:bg-surface-3 border border-line-strong text-fg-2 cursor-pointer shadow-xs'
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
                  className="px-3 py-2 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  title="Güncel Aya Dön"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Güncel Ay</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Toplam Soru</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-fg">{monthlyAnalytics.totalQuestions}</span>
                <span className="text-xs font-semibold text-muted">Soru</span>
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Haftalık Ortalama: <strong className="text-fg">{monthlyAnalytics.weeklyAverage} soru</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aylık Hedef Bitirme</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-orange-600 dark:text-orange-300">%{monthlyTargetCompletionRate}</span>
                <span className="text-xs font-semibold text-muted">Tamamlandı</span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-orange-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, monthlyTargetCompletionRate)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-muted">
                Aylık Hedef: <strong>{monthlyTargetTotal} Soru</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Aktif Çalışma Günleri</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-fg">{monthlyAnalytics.activeDaysCount}</span>
                <span className="text-xs font-semibold text-muted">Gün</span>
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Aylık Düzenlilik: <strong className="text-fg">%{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}</strong>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-xs font-semibold text-muted">Geçmiş Aya Göre Gelişim</span>
              <div className="flex items-baseline gap-2 mt-2">
                {monthlyAnalytics.monthlyDifference >= 0 ? (
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">+{monthlyAnalytics.monthlyDifference} Soru</span>
                ) : (
                  <span className="text-2xl font-black text-rose-700 dark:text-rose-300">{monthlyAnalytics.monthlyDifference} Soru</span>
                )}
              </div>
              <div className="mt-3 text-[11px] text-muted">
                Önceki Ay: <strong className="text-fg">{monthlyAnalytics.previousMonthTotal} soru</strong>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <h4 className="text-base font-bold text-fg tracking-tight mb-4">
              Aylık Hafta Bazında Soru Çözüm Grafiği
            </h4>
            <div className="h-80 w-full bg-surface-2 rounded-xl p-3 border border-line">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 25, right: 15, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="weekLabel" stroke="var(--color-muted)" fontSize={12} fontWeight={600} tickLine={false} />
                  <YAxis stroke="var(--color-muted)" fontSize={12} fontWeight={600} tickLine={false} />
                  <Tooltip content={renderLookerTooltip} />
                  <Bar dataKey="totalQuestions" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    <LabelList dataKey="totalQuestions" position="top" fill="var(--color-fg)" fontSize={12} fontWeight={800} offset={8} />
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
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">Günlük Soru Sayısı Girişi</h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-surface-2 p-0.5 border border-line text-xs">
                <button
                  type="button"
                  onClick={() => setInputMode('list')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'list'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Ders Listesi Tablosu
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('single')}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    inputMode === 'single'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  Tek Tek Ders Ekle
                </button>
              </div>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Tarih Seçimi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label className="block text-xs font-bold text-fg-2 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1e3a8a] dark:text-blue-200" />
                Soru Çözülen Tarih
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-1.5 text-xs font-bold text-fg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="bg-surface-2 p-3.5 rounded-xl border border-line">
              <label className="block text-xs font-bold text-fg-2 mb-1.5">
                Çalışma Notu veya Deneme Adı (İsteğe Bağlı)
              </label>
              <input
                type="text"
                placeholder="Örn: Hafta sonu genel tarama testi"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-1.5 text-xs text-fg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          {/* Input Mode: List Tablosu */}
          {inputMode === 'list' && (
            <div className="overflow-x-auto border border-line rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                  <tr>
                    <th className="px-3.5 py-2.5">Ders Adı</th>
                    <th className="px-3.5 py-2.5 text-center">Çözülen Soru</th>
                    <th className="px-3.5 py-2.5 text-center">Doğru</th>
                    <th className="px-3.5 py-2.5 text-center">Yanlış</th>
                    <th className="px-3.5 py-2.5">Çalışılan Konu / Test</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {listRows.map((row, idx) => (
                    <tr key={row.subject} className="hover:bg-surface-2">
                      <td className="px-3.5 py-2 font-bold text-fg">{row.subject}</td>
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
                          className="w-20 bg-surface border border-line-strong rounded-lg px-2 py-1 text-xs text-center font-bold text-fg focus:border-orange-500 focus:outline-none"
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
                          className="w-16 bg-surface border border-line-strong rounded-lg px-2 py-1 text-xs text-center text-emerald-700 dark:text-emerald-300 font-semibold focus:border-emerald-500 focus:outline-none"
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
                          className="w-16 bg-surface border border-line-strong rounded-lg px-2 py-1 text-xs text-center text-rose-700 dark:text-rose-300 font-semibold focus:border-rose-500 focus:outline-none"
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
                          className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1 text-xs text-fg focus:border-orange-500 focus:outline-none"
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
              <form onSubmit={handleAddSingleEntry} className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-surface-2 p-4 rounded-xl border border-line">
                <div>
                  <label className="block text-[11px] font-bold text-fg-2 mb-1">Ders</label>
                  <select
                    value={singleSubject}
                    onChange={(e) => setSingleSubject(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-fg"
                  >
                    {activeSubjects.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-fg-2 mb-1">Soru Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Soru"
                    value={singleCount}
                    onChange={(e) => setSingleCount(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-fg"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-fg-2 mb-1">Doğru</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="D"
                    value={singleCorrect}
                    onChange={(e) => setSingleCorrect(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-fg-2 mb-1">Yanlış</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Y"
                    value={singleWrong}
                    onChange={(e) => setSingleWrong(e.target.value)}
                    className="w-full bg-surface border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300 font-semibold"
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
                <div className="border border-line rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-2 text-fg-2 font-bold">
                      <tr>
                        <th className="px-3.5 py-2">Ders</th>
                        <th className="px-3.5 py-2 text-center">Soru</th>
                        <th className="px-3.5 py-2 text-center">D / Y</th>
                        <th className="px-3.5 py-2 text-right">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {singleEntries.map((item, idx) => (
                        <tr key={idx} className="hover:bg-surface-2">
                          <td className="px-3.5 py-2 font-bold text-fg">{item.subject}</td>
                          <td className="px-3.5 py-2 text-center font-bold text-fg">{item.questionCount} Soru</td>
                          <td className="px-3.5 py-2 text-center text-muted">
                            D: {item.correctCount ?? '—'} / Y: {item.wrongCount ?? '—'}
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSingleEntry(idx)}
                              className="text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 text-xs font-semibold cursor-pointer"
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

          <div className="flex justify-end pt-3 border-t border-line">
            <button
              type="button"
              onClick={handleSaveQuestionLog}
              className="px-6 py-2.5 bg-fg hover:bg-fg text-surface rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
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
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-fg">Geçmiş Soru Sayısı Kayıtları</h3>
            </div>
            <span className="text-xs font-bold text-fg bg-surface-2 px-3 py-1.5 rounded-lg border border-line">
              Toplam {studentHistoryLogs.length} Günlük Kayıt
            </span>
          </div>

          {studentHistoryLogs.length === 0 ? (
            <div className="text-center py-10 text-subtle text-xs">
              Henüz geçmiş bir soru çözümü kaydı bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-fg-2 font-bold border-b border-line">
                  <tr>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3 text-center">Toplam Soru</th>
                    <th className="px-4 py-3">Çözülen Dersler</th>
                    <th className="px-4 py-3">Not</th>
                    <th className="px-4 py-3 text-right">Sil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {studentHistoryLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3 font-bold text-fg">
                        {formatTurkishDate(log.date)}
                      </td>
                      <td className="px-4 py-3 text-center font-extrabold text-[#1e3a8a] dark:text-blue-200 text-sm">
                        {log.totalQuestions} Soru
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {log.entries.map((e) => `${e.subject}: ${e.questionCount}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-muted italic">
                        {log.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm('Bu soru kaydını silmek istediğinize emin misiniz?')) {
                              try {
                                await dataService.deleteQuestionLog(log.id);
                              } catch {
                                // hata uyarısı gösterildi, kayıt geri getirildi
                              }
                            }
                          }}
                          className="p-1.5 text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-r from-orange-50/70 dark:from-orange-500/10 via-surface to-surface-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-fg">
                    Haftalık İnceleme Dönemi Seçin
                  </h3>
                  <p className="text-xs text-muted font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı haftalar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="p-2 text-subtle hover:text-muted hover:bg-surface-2 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-line bg-surface-2">
              <div className="relative">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={weekSearchQuery}
                  onChange={(e) => setWeekSearchQuery(e.target.value)}
                  placeholder="Tarih veya hafta ara..."
                  className="w-full pl-9 pr-8 py-2 bg-surface border border-line-strong rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {weekSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setWeekSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Hafta Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastWeeks.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
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
                          ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-500/10 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-line hover:border-orange-300 dark:hover:border-orange-500/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {item.offset === 0 ? 'Bugün' : `${item.offset}H`}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-fg">
                              {item.relativeLabel}
                            </span>
                            {item.offset === 0 && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel
                              </span>
                            )}
                            {item.hasActivity && (
                              <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.2 rounded-md">
                                {item.activeDaysCount} Gün Çözüm
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted mt-0.5 font-medium">
                            {item.weekLabel}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-line sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] dark:text-blue-200 block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-muted block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-surface-2 hover:bg-orange-500 hover:text-white text-fg-2'
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
            <div className="p-3 border-t border-line bg-surface-2 flex justify-between items-center text-xs text-muted px-5">
              <span>Toplam {pastWeeksList.length} kayıtlı dönem</span>
              <button
                type="button"
                onClick={() => setIsWeekModalOpen(false)}
                className="px-4 py-1.5 bg-surface-3 hover:bg-surface-3 text-fg-2 rounded-xl font-bold transition-colors cursor-pointer"
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-line w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-line flex items-center justify-between bg-gradient-to-r from-orange-50/70 dark:from-orange-500/10 via-surface to-surface-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-fg">
                    Aylık Analiz Dönemi Seçin
                  </h3>
                  <p className="text-xs text-muted font-medium">
                    Yalnızca soru çözümü yapılan kayıtlı aylar listelenmektedir
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="p-2 text-subtle hover:text-muted hover:bg-surface-2 rounded-xl transition-colors cursor-pointer"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Arama Barı */}
            <div className="p-4 border-b border-line bg-surface-2">
              <div className="relative">
                <Search className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={monthSearchQuery}
                  onChange={(e) => setMonthSearchQuery(e.target.value)}
                  placeholder="Ay veya yıl ara..."
                  className="w-full pl-9 pr-8 py-2 bg-surface border border-line-strong rounded-xl text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
                {monthSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMonthSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Ay Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredPastMonths.length === 0 ? (
                <div className="p-8 text-center text-muted text-xs">
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
                          ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-500/10 shadow-xs ring-1 ring-orange-500/40'
                          : 'border-line hover:border-orange-300 dark:hover:border-orange-500/30 hover:bg-surface-2'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isSelected
                              ? 'bg-orange-600 text-white shadow-xs'
                              : item.hasActivity
                              ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black text-fg">
                              {item.monthLabel}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full">
                                Güncel Ay
                              </span>
                            )}
                            <span className="text-[9px] font-semibold text-muted bg-surface-2 px-1.5 py-0.2 rounded-md">
                              {item.relativeLabel}
                            </span>
                          </div>
                          {item.hasActivity && (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold mt-0.5">
                              {item.activeDaysCount} Gün Çözüm Kaydı
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:border-l sm:border-line sm:pl-3">
                        <div className="text-right">
                          <span className="text-sm font-black text-[#1e3a8a] dark:text-blue-200 block">
                            {item.totalQuestions} Soru
                          </span>
                          <span className="text-[10px] text-muted block">
                            {item.totalCorrect} D / {item.totalWrong} Y
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-surface-2 hover:bg-orange-500 hover:text-white text-fg-2'
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
            <div className="p-3 border-t border-line bg-surface-2 flex justify-between items-center text-xs text-muted px-5">
              <span>Toplam {pastMonthsList.length} kayıtlı ay</span>
              <button
                type="button"
                onClick={() => setIsMonthModalOpen(false)}
                className="px-4 py-1.5 bg-surface-3 hover:bg-surface-3 text-fg-2 rounded-xl font-bold transition-colors cursor-pointer"
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
