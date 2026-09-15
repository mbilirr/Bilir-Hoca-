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
  // Class and student selector (defaults to current student)
  const [selectedClassId, setSelectedClassId] = useState<string>(currentStudent.classId || '');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(currentStudent.id || '');

  // Active student reference
  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || currentStudent;
  }, [students, selectedStudentId, currentStudent]);

  // Filter students for the selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return students;
    return students.filter((s) => s.classId === selectedClassId);
  }, [students, selectedClassId]);

  // View state: 'entry' (Soru Girişi) | 'weekly' (Haftalık Analiz) | 'monthly' (Aylık Analiz) | 'history' (Geçmiş Kayıtlar)
  const [activeTab, setActiveTab] = useState<'entry' | 'weekly' | 'monthly' | 'history'>('entry');

  // Determine whether active student is Ortaokul or Lise
  const studentSchoolLevel = useMemo(() => {
    return getStudentSchoolLevel(activeStudent, classes);
  }, [activeStudent, classes]);

  // Middle school vs High school subjects for active student
  const activeSubjects = useMemo(() => {
    return getStudentQuestionSubjects(activeStudent, classes);
  }, [activeStudent, classes]);

  // Form input mode: 'list' (Derslerin karşısına yazma) or 'single' (Ders seçip yazma)
  const [inputMode, setInputMode] = useState<'list' | 'single'>('list');

  // Question log form state
  const [entryDate, setEntryDate] = useState<string>(formatDateISO(new Date()));
  const [entryNotes, setEntryNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  // Mode 'list' rows
  const [listRows, setListRows] = useState<
    { subject: string; questionCount: string; correctCount: string; wrongCount: string; topic: string }[]
  >(() => {
    const subjects = getStudentQuestionSubjects(activeStudent, classes);
    return subjects.map((sub) => ({
      subject: sub,
      questionCount: '',
      correctCount: '',
      wrongCount: '',
      topic: '',
    }));
  });

  // Mode 'single' state
  const [singleSubject, setSingleSubject] = useState<string>(() => {
    const subjects = getStudentQuestionSubjects(activeStudent, classes);
    return subjects[0] || 'Matematik';
  });
  const [singleCount, setSingleCount] = useState<string>('');
  const [singleCorrect, setSingleCorrect] = useState<string>('');
  const [singleWrong, setSingleWrong] = useState<string>('');
  const [singleTopic, setSingleTopic] = useState<string>('');
  const [singleEntries, setSingleEntries] = useState<QuestionLogSubjectEntry[]>([]);

  // Analytics navigation state
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [monthDate, setMonthDate] = useState<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  // Question logs from dataService
  const [allLogs, setAllLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());

  useEffect(() => {
    const unsub = dataService.subscribe(() => {
      setAllLogs(dataService.getQuestionLogs());
    });
    return unsub;
  }, []);

  // Ensure singleSubject stays aligned when student/level changes
  useEffect(() => {
    if (!activeSubjects.includes(singleSubject)) {
      setSingleSubject(activeSubjects[0] || 'Matematik');
    }
  }, [activeSubjects, singleSubject]);

  // Check if an existing log exists for the chosen date & student to prefill
  useEffect(() => {
    const existing = allLogs.find((l) => l.studentId === activeStudent.id && l.date === entryDate);
    if (existing) {
      // Prefill list rows using active level subjects
      setListRows(
        activeSubjects.map((sub) => {
          const match = existing.entries.find((e) => e.subject === sub);
          return {
            subject: sub,
            questionCount: match && match.questionCount > 0 ? String(match.questionCount) : '',
            correctCount: match && match.correctCount !== undefined ? String(match.correctCount) : '',
            wrongCount: match && match.wrongCount !== undefined ? String(match.wrongCount) : '',
            topic: match?.topic || '',
          };
        })
      );
      setSingleEntries(existing.entries);
      setEntryNotes(existing.notes || '');
    } else {
      // Reset using active level subjects
      setListRows(
        activeSubjects.map((sub) => ({
          subject: sub,
          questionCount: '',
          correctCount: '',
          wrongCount: '',
          topic: '',
        }))
      );
      setSingleEntries([]);
      setEntryNotes('');
    }
  }, [entryDate, activeStudent.id, allLogs, activeSubjects]);

  // Handle row change for list mode
  const handleListRowChange = (index: number, field: string, value: string) => {
    setListRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Add single entry
  const handleAddSingleEntry = () => {
    const count = parseInt(singleCount, 10);
    if (!count || count <= 0) return;

    const correct = parseInt(singleCorrect, 10) || 0;
    const wrong = parseInt(singleWrong, 10) || 0;
    const empty = Math.max(0, count - correct - wrong);

    setSingleEntries((prev) => {
      const existing = prev.findIndex((e) => e.subject === singleSubject);
      if (existing !== -1) {
        const next = [...prev];
        next[existing] = {
          ...next[existing],
          questionCount: count,
          correctCount: correct,
          wrongCount: wrong,
          emptyCount: empty,
          topic: singleTopic,
        };
        return next;
      } else {
        return [
          ...prev,
          {
            subject: singleSubject,
            questionCount: count,
            correctCount: correct,
            wrongCount: wrong,
            emptyCount: empty,
            topic: singleTopic,
          },
        ];
      }
    });

    setSingleCount('');
    setSingleCorrect('');
    setSingleWrong('');
    setSingleTopic('');
  };

  const handleRemoveSingleEntry = (subject: string) => {
    setSingleEntries((prev) => prev.filter((e) => e.subject !== subject));
  };

  // Summary calculations for current form entry
  const formCalculations = useMemo(() => {
    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;

    if (inputMode === 'list') {
      listRows.forEach((r) => {
        const q = parseInt(r.questionCount, 10) || 0;
        const c = parseInt(r.correctCount, 10) || 0;
        const w = parseInt(r.wrongCount, 10) || 0;
        totalQuestions += q;
        totalCorrect += c;
        totalWrong += w;
      });
    } else {
      singleEntries.forEach((r) => {
        totalQuestions += r.questionCount;
        totalCorrect += r.correctCount || 0;
        totalWrong += r.wrongCount || 0;
      });
    }

    const totalEmpty = Math.max(0, totalQuestions - totalCorrect - totalWrong);
    const accuracy = totalQuestions > 0 && totalCorrect + totalWrong > 0
      ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100)
      : 0;

    return { totalQuestions, totalCorrect, totalWrong, totalEmpty, accuracy };
  }, [inputMode, listRows, singleEntries]);

  // Handle Save
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    let finalEntries: QuestionLogSubjectEntry[] = [];

    if (inputMode === 'list') {
      finalEntries = listRows
        .filter((r) => parseInt(r.questionCount, 10) > 0)
        .map((r) => {
          const q = parseInt(r.questionCount, 10);
          const c = parseInt(r.correctCount, 10) || 0;
          const w = parseInt(r.wrongCount, 10) || 0;
          return {
            subject: r.subject,
            questionCount: q,
            correctCount: c,
            wrongCount: w,
            emptyCount: Math.max(0, q - c - w),
            topic: r.topic.trim(),
          };
        });
    } else {
      finalEntries = singleEntries;
    }

    if (finalEntries.length === 0) {
      alert('Lütfen en az bir ders için çözülen soru sayısını giriniz.');
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
  };

  // Weekly Analytics computation
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

  // Monthly Analytics computation
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

  // Student logs for history table
  const studentHistoryLogs = useMemo(() => {
    return allLogs
      .filter((l) => l.studentId === activeStudent.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allLogs, activeStudent.id]);

  return (
    <div className="space-y-6">
      {/* Top Header Card with Student & Class Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md shadow-indigo-500/20">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Soru Sayısı Çalışma Modülü</h2>
                <p className="text-xs text-slate-400">
                  Derslerden çözdüğünüz soru sayılarını kaydedin, haftalık ve aylık ilerleme durumunuzu takip edin.
                </p>
              </div>
            </div>
          </div>

          {/* Student and Class selectors */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-800/80 p-2 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Sınıf Seçimi</label>
              <select
                id="student-module-class-select"
                value={selectedClassId}
                onChange={(e) => {
                  const newClassId = e.target.value;
                  setSelectedClassId(newClassId);
                  const firstInClass = students.find((s) => s.classId === newClassId);
                  if (firstInClass) {
                    setSelectedStudentId(firstInClass.id);
                  }
                }}
                className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Öğrenci İsmi</label>
              <select
                id="student-module-student-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs font-semibold text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.studentNumber || s.schoolLevel || 'Öğrenci'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-slate-800">
          <button
            id="tab-btn-question-entry"
            onClick={() => setActiveTab('entry')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'entry'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            Soru Sayısı Kaydet
          </button>

          <button
            id="tab-btn-question-weekly"
            onClick={() => setActiveTab('weekly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'weekly'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Haftalık Analiz & Grafik
          </button>

          <button
            id="tab-btn-question-monthly"
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'monthly'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Aylık Analiz & Grafik
          </button>

          <button
            id="tab-btn-question-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Geçmiş Kayıtlarım ({studentHistoryLogs.length})
          </button>
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {saveSuccessMsg && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
          <span className="text-sm font-medium">{saveSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: QUESTION ENTRY */}
      {activeTab === 'entry' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            {/* Top row: Date selection, school level badge & Input mode toggle */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Çalışma Tarihi</label>
                    <input
                      type="date"
                      id="question-entry-date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      max={formatDateISO(new Date())}
                      className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-0 sm:pl-3 sm:border-l sm:border-slate-800">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-sm ${
                      studentSchoolLevel === 'Lise'
                        ? 'bg-purple-950/60 text-purple-300 border-purple-800/70'
                        : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70'
                    }`}
                  >
                    {studentSchoolLevel === 'Lise' ? '🎓 Lise Müfredat Dersleri' : '🏫 Ortaokul Müfredat Dersleri'}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({activeSubjects.length} Ders)
                  </span>
                </div>
              </div>

              {/* Mode switch */}
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  id="btn-mode-list"
                  onClick={() => setInputMode('list')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    inputMode === 'list'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Derslerin Karşısına Yazma ({studentSchoolLevel === 'Lise' ? 'Lise' : 'Ortaokul'})
                </button>
                <button
                  type="button"
                  id="btn-mode-single"
                  onClick={() => setInputMode('single')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    inputMode === 'single'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ders Seçip Soru Sayısı Ekleme
                </button>
              </div>
            </div>

            {/* FORM BODY */}
            <form onSubmit={handleSave} className="mt-5 space-y-6">
              {/* MODE 1: LIST ACROSS SUBJECTS */}
              {inputMode === 'list' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Aşağıda çözdüğünüz derslerin karşısına soru sayılarını giriniz:</span>
                    <span className="text-slate-500">Doğru/Yanlış sayıları isteğe bağlıdır</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800/80 text-xs text-slate-400 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="px-4 py-3">Ders Adı</th>
                          <th className="px-4 py-3 text-center w-28">Soru Sayısı</th>
                          <th className="px-4 py-3 text-center w-24">Doğru (D)</th>
                          <th className="px-4 py-3 text-center w-24">Yanlış (Y)</th>
                          <th className="px-4 py-3">Çalışılan Konu / Test Adı (Opsiyonel)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                        {listRows.map((row, idx) => (
                          <tr key={row.subject} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-slate-200">
                              <span className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-indigo-400" />
                                {row.subject}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={row.questionCount}
                                onChange={(e) => handleListRowChange(idx, 'questionCount', e.target.value)}
                                className="w-20 text-center bg-slate-800 border border-slate-700 focus:border-indigo-500 text-white rounded-lg py-1 px-2 text-sm font-semibold focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={row.correctCount}
                                onChange={(e) => handleListRowChange(idx, 'correctCount', e.target.value)}
                                className="w-18 text-center bg-slate-800/70 border border-slate-700 focus:border-emerald-500 text-emerald-400 rounded-lg py-1 px-2 text-sm font-medium focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                value={row.wrongCount}
                                onChange={(e) => handleListRowChange(idx, 'wrongCount', e.target.value)}
                                className="w-18 text-center bg-slate-800/70 border border-slate-700 focus:border-rose-500 text-rose-400 rounded-lg py-1 px-2 text-sm font-medium focus:outline-none"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                type="text"
                                placeholder="Örn: Paragraf, Fonksiyonlar, vb."
                                value={row.topic}
                                onChange={(e) => handleListRowChange(idx, 'topic', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 text-slate-300 rounded-lg py-1 px-3 text-xs focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MODE 2: SINGLE SUBJECT SELECTION */}
              {inputMode === 'single' && (
                <div className="space-y-4">
                  <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Ders Seçin</label>
                        <select
                          value={singleSubject}
                          onChange={(e) => setSingleSubject(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-sm text-white rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                        >
                          {activeSubjects.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Soru Sayısı</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Örn: 40"
                          value={singleCount}
                          onChange={(e) => setSingleCount(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-sm text-white rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-emerald-400 mb-1">Doğru Sayısı (Opsiyonel)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={singleCorrect}
                          onChange={(e) => setSingleCorrect(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-sm text-emerald-300 rounded-lg p-2 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-rose-400 mb-1">Yanlış Sayısı (Opsiyonel)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={singleWrong}
                          onChange={(e) => setSingleWrong(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-sm text-rose-300 rounded-lg p-2 focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={handleAddSingleEntry}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-600/20"
                        >
                          <Plus className="w-4 h-4" />
                          Listeye Ekle
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <input
                        type="text"
                        placeholder="Çalışılan Konu / Test Adı (Opsiyonel)"
                        value={singleTopic}
                        onChange={(e) => setSingleTopic(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg py-1.5 px-3 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Added list */}
                  {singleEntries.length > 0 && (
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <div className="bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300">
                        Eklenen Dersler ({singleEntries.length})
                      </div>
                      <div className="divide-y divide-slate-800">
                        {singleEntries.map((e) => (
                          <div key={e.subject} className="flex items-center justify-between p-3 bg-slate-900/50">
                            <div className="flex items-center gap-3">
                              <BookOpen className="w-4 h-4 text-indigo-400" />
                              <div>
                                <span className="font-semibold text-slate-200 text-sm">{e.subject}</span>
                                {e.topic && <span className="text-xs text-slate-400 ml-2">({e.topic})</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm font-bold text-indigo-400">{e.questionCount} Soru</span>
                              <span className="text-xs text-emerald-400">{e.correctCount || 0} D</span>
                              <span className="text-xs text-rose-400">{e.wrongCount || 0} Y</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSingleEntry(e.subject)}
                                className="text-slate-500 hover:text-rose-400 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Notes Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Günün Çalışma Notu veya Hedef Değerlendirmesi (Opsiyonel)
                </label>
                <textarea
                  rows={2}
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  placeholder="Bugünkü çalışma hakkında notlarınız, zorlandığınız konular veya günlük başarı hedefleriniz..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                />
              </div>

              {/* Real-time calculated overview & save button */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Toplam Soru</span>
                    <span className="text-xl font-extrabold text-indigo-400">
                      {formCalculations.totalQuestions}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Toplam Doğru</span>
                    <span className="text-xl font-extrabold text-emerald-400">
                      {formCalculations.totalCorrect}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-400 font-medium">Toplam Yanlış</span>
                    <span className="text-xl font-extrabold text-rose-400">
                      {formCalculations.totalWrong}
                    </span>
                  </div>
                  {formCalculations.accuracy > 0 && (
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Başarı Oranı</span>
                      <span className="text-xl font-extrabold text-purple-400">
                        %{formCalculations.accuracy}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  id="btn-save-question-log"
                  className="w-full md:w-auto px-7 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Soru Sayısını Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: WEEKLY ANALYTICS & CHART */}
      {activeTab === 'weekly' && (
        <div className="space-y-6">
          {/* Week Navigation Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                title="Önceki Hafta"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center sm:text-left">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">
                  {weekOffset === 0 ? 'Bu Hafta (Aktif Hafta)' : weekOffset === -1 ? 'Geçen Hafta' : `${Math.abs(weekOffset)} Hafta Önce`}
                </span>
                <h3 className="text-base font-bold text-white">{weeklyAnalytics.weekLabel}</h3>
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

            {/* PDF Export Button */}
            <button
              id="btn-download-weekly-pdf"
              onClick={() => downloadWeeklyPDF(weeklyAnalytics, activeStudent)}
              className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Haftalık Raporu & Grafiği PDF İndir
            </button>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs text-slate-400 font-medium">Haftalık Toplam Çözülen</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-white">{weeklyAnalytics.totalQuestions}</span>
                <span className="text-xs text-slate-400">Soru</span>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Günlük ortalama: <strong className="text-slate-200">{weeklyAnalytics.dailyAverage} soru</strong>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs text-slate-400 font-medium">Aktif Soru Çözülen Günler</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-indigo-400">
                  {weeklyAnalytics.solvedDaysCount} <span className="text-base text-slate-400 font-medium">/ 7 Gün</span>
                </span>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Çalışma istikrarı: %{Math.round((weeklyAnalytics.solvedDaysCount / 7) * 100)}
              </div>
            </div>

            {/* Soru Çözülmeyen Günler Box (Explicit user requirement) */}
            <div className={`bg-slate-900 border rounded-2xl p-5 shadow-lg ${
              weeklyAnalytics.unsolvedDaysCount > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Soru Çözülmeyen Günler</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  weeklyAnalytics.unsolvedDaysCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {weeklyAnalytics.unsolvedDaysCount} Gün
                </span>
              </div>
              <div className="mt-2 min-h-[2.5rem]">
                {weeklyAnalytics.unsolvedDays.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {weeklyAnalytics.unsolvedDays.map((d) => (
                      <span key={d} className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-xs text-amber-300 font-medium">
                        {d}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400 font-medium flex items-center gap-1 mt-2">
                    <CheckCircle2 className="w-4 h-4" /> Tebrikler! Her gün soru çözüldü.
                  </p>
                )}
              </div>
            </div>

            {/* Progress vs past weeks (Explicit user requirement) */}
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

          {/* Graphical Representation: Bar Chart of Daily Questions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h4 className="text-base font-bold text-white">Haftalık Günlük Soru Çözüm Grafiği</h4>
                <p className="text-xs text-slate-400">
                  {weeklyAnalytics.studentName} — Haftanın günlerine göre soru sayıları ve soru çözülmeyen günler
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Soru Çözülen Gün
                </span>
                <span className="flex items-center gap-1.5 text-rose-400">
                  <span className="w-3 h-3 rounded bg-rose-500/80 inline-block" /> Soru Çözülmeyen Gün (0 Soru)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAnalytics.days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                            <p className="text-indigo-300 font-semibold">
                              Toplam: {data.totalQuestions} Soru
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
                        key={`cell-${index}`}
                        fill={entry.totalQuestions > 0 ? '#6366f1' : '#f43f5e'}
                        opacity={entry.totalQuestions > 0 ? 0.9 : 0.4}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Written Table & Success Assessment Report */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Written Daily Table */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h4 className="text-sm font-bold text-white mb-3">Günlük Soru Çözüm Çizelgesi</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">Gün</th>
                      <th className="px-3 py-2.5">Tarih</th>
                      <th className="px-3 py-2.5 text-center">Çözülen Soru</th>
                      <th className="px-3 py-2.5">Ders Dağılımları</th>
                      <th className="px-3 py-2.5 text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {weeklyAnalytics.days.map((d) => (
                      <tr key={d.dateStr} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-bold text-slate-200">{d.dayName}</td>
                        <td className="px-3 py-2 text-slate-400">{formatTurkishDate(d.dateStr)}</td>
                        <td className="px-3 py-2 text-center font-extrabold text-indigo-400">
                          {d.totalQuestions}
                        </td>
                        <td className="px-3 py-2 text-slate-300 truncate max-w-xs">{d.subjectsText}</td>
                        <td className="px-3 py-2 text-center">
                          {d.hasSolved ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300">
                              Çözüldü
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300">
                              Çözülmedi ⚠️
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Success & Progress Evaluation Report */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">İlerleme & Başarı Durumu</h4>
                </div>

                <div className="mb-4">
                  <span className={`inline-block text-xs font-bold px-3 py-1 rounded-lg border ${weeklyAnalytics.statusAssessment.badgeClass}`}>
                    {weeklyAnalytics.statusAssessment.badgeText}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  {weeklyAnalytics.statusAssessment.reportSummary}
                </p>

                {weeklyAnalytics.subjectBreakdown.length > 0 && (
                  <div className="mt-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                      Bu Haftanın En Çok Çalışılan Dersleri
                    </span>
                    <div className="space-y-2">
                      {weeklyAnalytics.subjectBreakdown.slice(0, 3).map((sub) => (
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
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 text-indigo-400" />
                  Haftalık Raporu PDF Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MONTHLY ANALYTICS & CHART */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Month Selector Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
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
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider block">
                  Aylık Gelişim Analizi
                </span>
                <h3 className="text-lg font-bold text-white">{monthlyAnalytics.monthLabel}</h3>
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

            {/* PDF Download Button */}
            <button
              id="btn-download-monthly-pdf"
              onClick={() => downloadMonthlyPDF(monthlyAnalytics, activeStudent)}
              className="w-full sm:w-auto px-5 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Aylık Raporu & Grafiği PDF İndir
            </button>
          </div>

          {/* Monthly Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs text-slate-400 font-medium">Soru Çözülen Aktif Günler</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-black text-white">{monthlyAnalytics.activeDaysCount}</span>
                <span className="text-xs text-slate-400">Gün</span>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Aylık çalışma disiplini: %{Math.round((monthlyAnalytics.activeDaysCount / 30) * 100)}
              </div>
            </div>

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
                Önceki Ay: <strong className="text-slate-200">{monthlyAnalytics.previousMonthTotal} soru</strong> ({monthlyAnalytics.monthlyGrowthRate >= 0 ? '+' : ''}%{monthlyGrowthRate(monthlyAnalytics)})
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs text-slate-400 font-medium">Aylık Başarı Değerlendirmesi</span>
              <div className="mt-3">
                <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-lg border ${monthlyAnalytics.statusAssessment.badgeClass}`}>
                  {monthlyAnalytics.statusAssessment.badgeText}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Bar Chart: Weekly Totals */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h4 className="text-base font-bold text-white">Aylık Hafta Bazında Soru Çözüm Grafiği</h4>
                <p className="text-xs text-slate-400">
                  {monthlyAnalytics.studentName} — {monthlyAnalytics.monthLabel} ayı haftalık toplam çözülen soru sayıları
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAnalytics.weeks} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                            <p className="text-slate-300">Aktif Gün: {data.activeDaysCount} gün</p>
                            <p className="text-indigo-300">Ağırlıklı Ders: {data.topSubject}</p>
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

          {/* Monthly Written Table & Pedagogical Report */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <h4 className="text-sm font-bold text-white mb-3">Haftalık Soru Çözüm Dökümü</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2.5">Hafta</th>
                      <th className="px-3 py-2.5 text-center">Toplam Soru</th>
                      <th className="px-3 py-2.5 text-center">Aktif Gün</th>
                      <th className="px-3 py-2.5">Ağırlıklı Çalışılan Ders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {monthlyAnalytics.weeks.map((w) => (
                      <tr key={w.weekIndex} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2.5 font-bold text-slate-200">{w.weekLabel}</td>
                        <td className="px-3 py-2.5 text-center font-extrabold text-purple-400">
                          {w.totalQuestions}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-300">{w.activeDaysCount} Gün</td>
                        <td className="px-3 py-2.5 font-medium text-indigo-300">{w.topSubject}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-5 h-5 text-purple-400" />
                  <h4 className="text-sm font-bold text-white">Geçmiş Aya Göre İlerleme</h4>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                  {monthlyAnalytics.statusAssessment.reportSummary}
                </p>

                {monthlyAnalytics.subjectBreakdown.length > 0 && (
                  <div className="mt-4">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                      Aylık Ders Dağılımı (İlk 4)
                    </span>
                    <div className="space-y-2">
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
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 text-purple-400" />
                  Aylık Raporu PDF Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HISTORY OF LOGS */}
      {activeTab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white">Geçmiş Soru Sayısı Kayıtları</h3>
              <p className="text-xs text-slate-400">
                {activeStudent.name} öğrencisinin sisteme kaydettiği tüm günlük soru çözümleri
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 bg-slate-800 rounded-lg text-slate-300">
              Toplam {studentHistoryLogs.length} Kayıt
            </span>
          </div>

          {studentHistoryLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Henüz kayıtlı soru çözümü bulunmuyor. "Soru Sayısı Kaydet" sekmesinden ilk kaydınızı oluşturabilirsiniz.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3 text-center">Toplam Soru</th>
                    <th className="px-4 py-3 text-center">Doğru</th>
                    <th className="px-4 py-3 text-center">Yanlış</th>
                    <th className="px-4 py-3">Dersler & Konular</th>
                    <th className="px-4 py-3">Not</th>
                    <th className="px-4 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {studentHistoryLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-semibold text-white">{formatTurkishDate(log.date)}</td>
                      <td className="px-4 py-3 text-center font-extrabold text-indigo-400 text-sm">
                        {log.totalQuestions}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-400">
                        {log.totalCorrect || 0}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-rose-400">
                        {log.totalWrong || 0}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="flex flex-wrap gap-1.5">
                          {log.entries.map((e) => (
                            <span key={e.subject} className="px-2 py-0.5 bg-slate-800 rounded text-[11px]">
                              {e.subject}: <strong className="text-indigo-400">{e.questionCount}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 italic max-w-xs truncate">{log.notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`${formatTurkishDate(log.date)} tarihli kaydı silmek istediğinize emin misiniz?`)) {
                              dataService.deleteQuestionLog(log.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Sil"
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
    </div>
  );
};

function monthlyGrowthRate(m: { monthlyGrowthRate: number }): number {
  return m.monthlyGrowthRate || 0;
}
