import React, { useState } from 'react';
import {
  FileSpreadsheet,
  UserX,
  Plus,
  Check,
  Calendar,
  Save,
  Search,
  Award,
  Trash2,
  RotateCcw,
  History,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  BookOpen,
  Filter,
  Users,
  Clock,
  X,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GradeRecord, AttendanceRecord, Student, ClassGroup, AttendanceStatus } from '../../types';
import { dataService } from '../../services/dataService';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';

// Yerel tarih (UTC değil): Türkiye'de gece 00:00–03:00 arası bir önceki gün yazılmasın
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface GradeAttendanceProps {
  students: Student[];
  classes: ClassGroup[];
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
}

export const GradeAttendance: React.FC<GradeAttendanceProps> = ({
  students,
  classes,
  grades,
  attendance,
}) => {
  const [activeMainSection, setActiveMainSection] = useState<'grades' | 'attendance'>('grades');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');

  // Grades View Controls
  const [searchGradeStudent, setSearchGradeStudent] = useState('');
  const [gradeViewMode, setGradeViewMode] = useState<'grouped' | 'table' | 'batch'>('grouped');
  const [expandedExamGroups, setExpandedExamGroups] = useState<Record<string, boolean>>({
    '1. Yazılı': true,
    '2. Yazılı': true,
    Performans: true,
    'Ödev Notu': true,
    'Deneme Sınavı': true,
  });

  // Toplu Not Girişi State
  const [batchExamType, setBatchExamType] = useState<string>('1. Yazılı');
  const [batchGradesMap, setBatchGradesMap] = useState<Record<string, { score: string; remarks: string }>>({});
  const [batchSaveFeedback, setBatchSaveFeedback] = useState<string | null>(null);

  // Grade Modal State
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [gradeStudentId, setGradeStudentId] = useState(students[0]?.id || '');
  const [examType, setExamType] = useState('1. Yazılı');
  const [score, setScore] = useState<number>(85);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [gradeRemarks, setGradeRemarks] = useState('');

  // Attendance Controls
  const [isAttendanceSheetOpen, setIsAttendanceSheetOpen] = useState(true);
  const [isAttendanceHistoryOpen, setIsAttendanceHistoryOpen] = useState(true);
  const [expandedHistoryRecords, setExpandedHistoryRecords] = useState<Record<string, boolean>>({});

  // Attendance Sheet State
  const [attendanceDate, setAttendanceDate] = useState(todayLocal());
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { status: AttendanceStatus; note: string }>
  >({});
  const [saveFeedback, setSaveFeedback] = useState(false);
  // Aşama 17: kaydederken düğme kilitlenir, hata ekranda gösterilir (tarayıcı uyarı penceresi yok)
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const runSave = async (fn: () => Promise<void>) => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorText(null);
    try {
      await fn();
    } catch (e: any) {
      setErrorText((e?.message || 'Kaydedilemedi. Lütfen tekrar deneyin.').replace(/^\[\w+\]\s*/, ''));
    } finally {
      setIsSaving(false);
    }
  };

  // Deletion Modal States
  const [gradeToDelete, setGradeToDelete] = useState<GradeRecord | null>(null);
  const [attendanceToDelete, setAttendanceToDelete] = useState<AttendanceRecord | null>(null);
  const [isClearCurrentConfirmOpen, setIsClearCurrentConfirmOpen] = useState(false);

  // Filter students of active class
  const classStudents = students.filter((s) => s.classId === selectedClassId);
  const activeClass = classes.find((c) => c.id === selectedClassId);

  // Attendance helpers
  const currentAttendanceRecord = attendance.find(
    (a) =>
      a.date === attendanceDate &&
      a.classId === selectedClassId &&
      a.subject === selectedSubject
  );

  const getStudentAttendance = (studentId: string): { status: AttendanceStatus; note: string } => {
    if (attendanceMap[studentId]) return attendanceMap[studentId];
    if (currentAttendanceRecord) {
      const match = currentAttendanceRecord.records.find((r) => r.studentId === studentId);
      if (match) return { status: match.status, note: match.note || '' };
    }
    return { status: 'present', note: '' };
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    const current = getStudentAttendance(studentId);
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: { ...current, status },
    }));
  };

  const handleSetAllStatus = (status: AttendanceStatus) => {
    const nextMap: Record<string, { status: AttendanceStatus; note: string }> = {};
    classStudents.forEach((std) => {
      const current = getStudentAttendance(std.id);
      nextMap[std.id] = { ...current, status };
    });
    setAttendanceMap(nextMap);
  };

  const handleSaveAttendance = () => runSave(async () => {
    if (!selectedClassId || !selectedSubject) throw new Error('Önce sınıf ve ders seçin.');
    const records = classStudents.map((std) => {
      const current = getStudentAttendance(std.id);
      return {
        studentId: std.id,
        studentName: std.name,
        status: current.status,
        note: current.note,
      };
    });

    await dataService.recordAttendance({
      date: attendanceDate,
      classId: selectedClassId,
      subject: selectedSubject,
      records,
    });

    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2500);
  });

  const handleDeleteCurrentAttendance = async () => {
    if (currentAttendanceRecord) {
      await dataService.deleteAttendance(currentAttendanceRecord.id);
    } else {
      await dataService.deleteAttendanceForDate(attendanceDate, selectedClassId, selectedSubject);
    }
    setAttendanceMap({});
  };

  const handleClearForm = () => {
    const resetMap: Record<string, { status: AttendanceStatus; note: string }> = {};
    classStudents.forEach((std) => {
      resetMap[std.id] = { status: 'present', note: '' };
    });
    setAttendanceMap(resetMap);
  };

  const handleSaveGrade = (e: React.FormEvent) => {
    e.preventDefault();
    return runSave(async () => {
    const student = students.find((s) => s.id === gradeStudentId);
    if (!student) throw new Error('Öğrenci seçin.');
    if (!selectedSubject) throw new Error('Önce ders seçin.');

    await dataService.addGrade({
      studentId: gradeStudentId,
      classId: student.classId,
      subject: selectedSubject,
      examType,
      score: Number(score),
      maxScore: Number(maxScore),
      date: todayLocal(),
      remarks: gradeRemarks,
    });

    setIsAddGradeOpen(false);
    setGradeRemarks('');
    });
  };

  const handleBatchGradeChange = (studentId: string, field: 'score' | 'remarks', value: string) => {
    setBatchGradesMap((prev) => ({
      ...prev,
      [studentId]: {
        score: field === 'score' ? value : prev[studentId]?.score || '',
        remarks: field === 'remarks' ? value : prev[studentId]?.remarks || '',
      },
    }));
  };

  const handleSaveBatchGrades = () => runSave(async () => {
    const enteredStudentIds = Object.keys(batchGradesMap).filter((id) => {
      const val = batchGradesMap[id]?.score?.trim();
      return val !== undefined && val !== '' && !isNaN(Number(val));
    });

    if (enteredStudentIds.length === 0) throw new Error('Lütfen en az bir öğrenci için not puanı giriniz.');
    if (!selectedSubject) throw new Error('Önce ders seçin.');

    for (const studentId of enteredStudentIds) {
      const student = classStudents.find((s) => s.id === studentId);
      if (!student) continue;
      const scoreVal = Math.min(100, Math.max(0, Number(batchGradesMap[studentId].score)));
      const remarks = batchGradesMap[studentId].remarks || '';

      await dataService.addGrade({
        studentId: student.id,
        studentName: student.name,
        classId: selectedClassId,
        subject: selectedSubject,
        examType: batchExamType,
        score: scoreVal,
        maxScore: 100,
        date: todayLocal(),
        remarks,
      });
    }

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setBatchSaveFeedback(`✓ ${enteredStudentIds.length} öğrencinin notu başarıyla sisteme kaydedildi!`);
    setBatchGradesMap({});
    setTimeout(() => setBatchSaveFeedback(null), 3500);
  });

  const batchEnteredCount = Object.keys(batchGradesMap).filter((id) => {
    const val = batchGradesMap[id]?.score?.trim();
    return val !== undefined && val !== '' && !isNaN(Number(val));
  }).length;

  // Grade averages
  const classGrades = grades.filter(
    (g) => g.classId === selectedClassId && g.subject === selectedSubject
  );
  const averageScore = classGrades.length
    ? Math.round(classGrades.reduce((acc, g) => acc + g.score, 0) / classGrades.length)
    : 0;

  // Filter attendance records
  const classAttendanceRecords = attendance.filter(
    (a) => a.classId === selectedClassId && (selectedSubject ? a.subject === selectedSubject : true)
  );

  // Group grades by Exam Type
  const EXAM_TYPES = ['1. Yazılı', '2. Yazılı', 'Performans', 'Ödev Notu', 'Deneme Sınavı'];

  const toggleExamGroup = (type: string) => {
    setExpandedExamGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const toggleHistoryRecord = (recordId: string) => {
    setExpandedHistoryRecords((prev) => ({ ...prev, [recordId]: !prev[recordId] }));
  };

  // Filtered grades by search
  const filteredGrades = classGrades.filter((g) => {
    if (!searchGradeStudent.trim()) return true;
    const q = searchGradeStudent.toLowerCase();
    return (
      (g.studentName && g.studentName.toLowerCase().includes(q)) ||
      g.examType.toLowerCase().includes(q) ||
      (g.remarks && g.remarks.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6" id="grades-attendance-page">
      {errorText && (
        <div role="alert" id="grades-error" className="flex items-start justify-between gap-2 rounded-xl bg-danger-soft text-danger-fg px-3 py-2.5 text-sm font-semibold">
          <span>{errorText}</span>
          <button type="button" onClick={() => setErrorText(null)} className="text-xs underline cursor-pointer">
            Kapat
          </button>
        </div>
      )}
      {/* Sleek Top Control Bar */}
      <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg tracking-tight flex items-center space-x-2">
                <span>Ders Notları & Devamsızlık Defteri</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                    activeClass && selectedSubject
                      ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                  }`}
                >
                  {activeClass && selectedSubject
                    ? `${activeClass.name} • ${selectedSubject}`
                    : 'Sınıf & Ders Seçiniz'}
                </span>
              </h2>
            </div>
          </div>
        </div>

        {/* Class & Subject Selectors */}
        <div className="flex items-center space-x-2.5 flex-wrap">
          <div className="flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1">
            <Users className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-400 shrink-0" />
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setAttendanceMap({});
              }}
              className="bg-transparent text-fg text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="" disabled className="bg-surface text-muted">
                Sınıf Seçiniz
              </option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="bg-surface text-fg">
                  {cls.name} ({cls.academicYear})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-canvas border border-line rounded-xl px-2.5 py-1">
            <BookOpen className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setAttendanceMap({});
              }}
              className="bg-transparent text-fg text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="" disabled className="bg-surface text-muted">
                Ders Seçiniz
              </option>
              <option value="Matematik" className="bg-surface text-fg">Matematik</option>
              <option value="Fizik" className="bg-surface text-fg">Fizik</option>
              <option value="Kimya" className="bg-surface text-fg">Kimya</option>
              <option value="Biyoloji" className="bg-surface text-fg">Biyoloji</option>
              <option value="Türk Dili ve Edebiyatı" className="bg-surface text-fg">Türk Dili ve Edebiyatı</option>
              <option value="Tarih" className="bg-surface text-fg">Tarih</option>
            </select>
          </div>
        </div>
      </div>

      {/* KONTROL: Sınıf ve ders seçilmeden altta sınıf ve öğrenci listesi hemen açılmasın! */}
      {!selectedClassId || !selectedSubject ? (
        <div className="bg-surface/90 border border-line rounded-2xl p-10 sm:p-14 text-center shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-fg mb-2">
            Sınıf ve Ders Seçimi Yapınız
          </h3>
          <p className="text-xs sm:text-sm text-muted max-w-lg mx-auto mb-6 leading-relaxed">
            Ders notları, sınıf öğrenci listesi ve devamsızlık yoklama defterini görüntülemek için lütfen yukarıdaki açılır menülerden <strong className="text-indigo-700 dark:text-indigo-300">Sınıf Seçiniz</strong> ve <strong className="text-emerald-700 dark:text-emerald-300">Ders Seçiniz</strong> alanlarından seçiminizi yapınız.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <div
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
                selectedClassId
                  ? 'bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-canvas text-fg-2 border-line'
              }`}
            >
              <Users className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
              <span>
                {selectedClassId ? `Sınıf Seçildi: ${activeClass?.name}` : '1. Adım: Yukarıdan Sınıf Seçiniz'}
              </span>
            </div>

            <div
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
                selectedSubject
                  ? 'bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-canvas text-fg-2 border-line'
              }`}
            >
              <BookOpen className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>
                {selectedSubject ? `Ders Seçildi: ${selectedSubject}` : '2. Adım: Yukarıdan Ders Seçiniz'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* PRIMARY SECTION SELECTOR (NOTLAR vs DEVAMSIZLIK) */}
      <div className="flex items-center justify-between border-b border-line pb-3 flex-wrap gap-3">
        <div className="flex items-center space-x-2 bg-canvas/70 p-1 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setActiveMainSection('grades')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMainSection === 'grades'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-muted hover:text-fg hover:bg-surface-2/60'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Ders Not Çizelgesi ({classGrades.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainSection('attendance')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeMainSection === 'attendance'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-muted hover:text-fg hover:bg-surface-2/60'
            }`}
          >
            <UserX className="w-4 h-4" />
            <span>Devamsızlık Defteri ({classAttendanceRecords.length} Oturum)</span>
          </button>
        </div>

        {activeMainSection === 'grades' ? (
          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center space-x-1 bg-surface border border-line rounded-xl p-0.5 text-xs font-medium text-muted">
              <button
                type="button"
                onClick={() => setGradeViewMode('grouped')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  gradeViewMode === 'grouped' ? 'bg-surface-2 text-fg font-bold' : 'hover:text-fg'
                }`}
              >
                Sınav Grupları (İç İçe)
              </button>
              <button
                type="button"
                onClick={() => setGradeViewMode('table')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  gradeViewMode === 'table' ? 'bg-surface-2 text-fg font-bold' : 'hover:text-fg'
                }`}
              >
                Düz Tablo
              </button>
              <button
                type="button"
                onClick={() => setGradeViewMode('batch')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center space-x-1 ${
                  gradeViewMode === 'batch' ? 'bg-indigo-600 text-white font-bold' : 'hover:text-white'
                }`}
              >
                <span>Toplu Not Girişi</span>
                {batchEnteredCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setGradeStudentId(classStudents[0]?.id || students[0]?.id || '');
                setIsAddGradeOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Not Ekle</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            {currentAttendanceRecord && (
              <button
                type="button"
                onClick={() => setIsClearCurrentConfirmOpen(true)}
                className="flex items-center space-x-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                title="Bu tarihteki yoklamayı veritabanından sil"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                <span className="hidden sm:inline">Yoklamayı Sil</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={isSaving}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saveFeedback ? 'Yoklama Kaydedildi! ✓' : 'Yoklamayı Kaydet'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. DERS NOT ÇİZELGESİ SECTION                             */}
      {/* ========================================================= */}
      {activeMainSection === 'grades' ? (
        <div className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted">Sınıf Başarı Ortalaması</span>
                <div className="text-xl font-extrabold text-fg mt-0.5 flex items-baseline space-x-1">
                  <span className={averageScore >= 70 ? 'text-emerald-700 dark:text-emerald-400' : averageScore >= 50 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}>
                    {averageScore > 0 ? averageScore : '-'}
                  </span>
                  <span className="text-xs text-subtle font-normal">/ 100</span>
                </div>
              </div>
              <Award className="w-6 h-6 text-indigo-700 dark:text-indigo-400/60" />
            </div>

            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted">Toplam Not Kaydı</span>
                <div className="text-xl font-extrabold text-fg mt-0.5">{classGrades.length} Giriş</div>
              </div>
              <FileSpreadsheet className="w-6 h-6 text-blue-700 dark:text-blue-400/60" />
            </div>

            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-muted">Kayıtlı Öğrenci Sayısı</span>
                <div className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400 mt-0.5">{classStudents.length} Öğrenci</div>
              </div>
              <Users className="w-6 h-6 text-indigo-700 dark:text-indigo-400/60" />
            </div>
          </div>

          {/* Search student in grades */}
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchGradeStudent}
              onChange={(e) => setSearchGradeStudent(e.target.value)}
              placeholder="Öğrenci veya sınav türü ara..."
              className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-1.5 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* NESTED ACCORDION / GROUPED VIEW */}
          {gradeViewMode === 'grouped' ? (
            <div className="space-y-3">
              {EXAM_TYPES.map((type) => {
                const groupGrades = filteredGrades.filter((g) => g.examType === type);
                const isExpanded = !!expandedExamGroups[type];
                const groupAvg = groupGrades.length
                  ? Math.round(groupGrades.reduce((acc, g) => acc + g.score, 0) / groupGrades.length)
                  : 0;

                return (
                  <div
                    key={type}
                    className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm"
                  >
                    {/* Exam Group Header (Accordion toggle) */}
                    <button
                      type="button"
                      onClick={() => toggleExamGroup(type)}
                      className="w-full text-left p-3.5 sm:px-4 flex items-center justify-between hover:bg-surface-2/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 shrink-0">
                          <Award className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-xs sm:text-sm font-bold text-fg">{type}</h3>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                            {groupGrades.length} Not
                          </span>
                          {groupAvg > 0 && (
                            <span className="text-[11px] text-muted hidden sm:inline">
                              • Grup Ortalaması: <strong className="text-emerald-700 dark:text-emerald-400">{groupAvg}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 text-muted text-xs shrink-0">
                        <span className="text-[11px] text-subtle hidden sm:inline">
                          {isExpanded ? 'Gizle' : 'Genişlet'}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-fg' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Group Grade Rows */}
                    {isExpanded && (
                      <div className="border-t border-line bg-canvas/30">
                        {groupGrades.length > 0 ? (
                          <div className="divide-y divide-line">
                            {groupGrades.map((g) => (
                              <div
                                key={g.id}
                                className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                              >
                                <div className="flex items-center space-x-3 min-w-0">
                                  <div className="w-6 h-6 rounded-md bg-surface-2 flex items-center justify-center text-[10px] font-bold text-muted shrink-0">
                                    #{g.studentId.slice(-3)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs font-bold text-fg truncate">
                                        {g.studentName || 'Öğrenci'}
                                      </span>
                                      <span className="text-[11px] text-subtle hidden sm:inline">
                                        • {g.date}
                                      </span>
                                    </div>
                                    {g.remarks && (
                                      <p className="text-[11px] text-muted italic truncate max-w-sm">
                                        {g.remarks}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center space-x-3 shrink-0">
                                  <div className="text-right">
                                    <span
                                      className={`text-sm font-extrabold px-2 py-0.5 rounded-lg border ${
                                        g.score >= 85
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                          : g.score >= 70
                                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                                          : g.score >= 50
                                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                                      }`}
                                    >
                                      {g.score}
                                      <span className="text-[10px] text-subtle font-normal"> / {g.maxScore}</span>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setGradeToDelete(g)}
                                    className="p-1.5 text-subtle hover:text-rose-400 hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                                    title="Notu Sil"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-subtle text-xs">
                            Bu sınav türünde henüz kayıtlı not bulunmuyor.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* FLAT TABLE VIEW */
            <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-fg-2">
                  <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Öğrenci</th>
                      <th className="px-4 py-3 font-semibold">Sınav Türü</th>
                      <th className="px-4 py-3 font-semibold">Puan</th>
                      <th className="px-4 py-3 font-semibold">Tarih</th>
                      <th className="px-4 py-3 font-semibold">Açıklama</th>
                      <th className="px-4 py-3 font-semibold text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredGrades.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-subtle">
                          Kayıtlı not bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      filteredGrades.map((g) => (
                        <tr key={g.id} className="hover:bg-surface-2/30 transition-colors">
                          <td className="px-4 py-3 font-bold text-fg">{g.studentName}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              {g.examType}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold">
                            <span
                              className={
                                g.score >= 85
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : g.score >= 70
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : g.score >= 50
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }
                            >
                              {g.score}
                            </span>
                            <span className="text-subtle font-normal text-[10px]"> / {g.maxScore}</span>
                          </td>
                          <td className="px-4 py-3 text-muted">{g.date}</td>
                          <td className="px-4 py-3 text-muted italic">{g.remarks || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setGradeToDelete(g)}
                              className="p-1 text-subtle hover:text-rose-400 rounded transition-colors cursor-pointer"
                              title="Notu Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TOPLU NOT GİRİŞİ (BATCH ENTRY) */}
          {gradeViewMode === 'batch' && (
            <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 bg-surface/90 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center space-x-2">
                      <span>Sınıf Not Giriş Çizelgesi ({classStudents.length} Öğrenci)</span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-fg-2">Sınav / Not Türü:</span>
                  <select
                    value={batchExamType}
                    onChange={(e) => setBatchExamType(e.target.value)}
                    className="px-3 py-1.5 bg-canvas border border-line-strong rounded-xl text-fg text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="1. Yazılı">1. Yazılı Sınav</option>
                    <option value="2. Yazılı">2. Yazılı Sınav</option>
                    <option value="Performans">Performans Notu</option>
                    <option value="Ödev Notu">Ödev Notu</option>
                    <option value="Deneme Sınavı">Deneme Sınavı</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-fg-2">
                  <thead className="bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line">
                    <tr>
                      <th className="px-4 py-3 font-semibold w-16">No</th>
                      <th className="px-4 py-3 font-semibold">Öğrenci Adı Soyadı</th>
                      <th className="px-4 py-3 font-semibold w-36">Puan (0-100)</th>
                      <th className="px-4 py-3 font-semibold">Öğretmen Değerlendirmesi / Açıklama</th>
                      <th className="px-4 py-3 font-semibold text-right w-24">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {classStudents.map((std) => {
                      const entry = batchGradesMap[std.id] || { score: '', remarks: '' };
                      const hasEntered = entry.score !== '' && !isNaN(Number(entry.score));
                      return (
                        <tr key={std.id} className="hover:bg-surface-2/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-muted">
                            #{std.studentNumber || std.id.slice(-4)}
                          </td>
                          <td className="px-4 py-3 font-bold text-fg">
                            {std.name}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="0 - 100"
                              value={entry.score}
                              onChange={(e) => handleBatchGradeChange(std.id, 'score', e.target.value)}
                              className="w-24 px-2.5 py-1.5 bg-canvas border border-line-strong rounded-xl text-fg font-bold text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              placeholder="Gelişim notu veya geri bildirim..."
                              value={entry.remarks}
                              onChange={(e) => handleBatchGradeChange(std.id, 'remarks', e.target.value)}
                              className="w-full px-3 py-1.5 bg-canvas border border-line-strong rounded-xl text-fg text-xs focus:outline-none focus:border-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasEntered ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                Kaydedilmedi
                              </span>
                            ) : (
                              <span className="text-subtle text-[11px]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* SAYFA ALTI KAYDET BUTONU FOR BATCH GRADES */}
              <div className="p-4 bg-canvas/90 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-xs">
                  {batchSaveFeedback ? (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span>{batchSaveFeedback}</span>
                    </span>
                  ) : batchEnteredCount > 0 ? (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                      <span>{batchEnteredCount} öğrenci için not girildi</span>
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  {batchEnteredCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setBatchGradesMap({})}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Temizle</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveBatchGrades}
                    disabled={isSaving || batchEnteredCount === 0}
                    className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer ${
                      batchEnteredCount > 0
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 ring-2 ring-indigo-400/50 scale-[1.02]'
                        : 'bg-surface-2 text-subtle cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {batchEnteredCount > 0
                        ? `Notları Kaydet (${batchEnteredCount} Öğrenci)`
                        : 'Notları Kaydet'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================= */
        /* 2. DERS DEVAMSIZLIK DEFTERİ SECTION (İÇE İÇE AÇILIR MENÜ) */
        /* ========================================================= */
        <div className="space-y-4">
          {/* PANEL 1: GÜNLÜK YOKLAMA FORMU (ACCORDION) */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            {/* Header / Accordion Button */}
            <div className="p-3.5 sm:px-4 bg-surface/90 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsAttendanceSheetOpen(!isAttendanceSheetOpen)}
                className="flex items-center space-x-2.5 text-left cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
                  <UserX className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center space-x-2">
                    <span>Günlük Yoklama Formu</span>
                    {currentAttendanceRecord ? (
                      <span className="px-2 py-0.2 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                        Kayıtlı
                      </span>
                    ) : (
                      <span className="px-2 py-0.2 rounded-md bg-surface-2 text-muted border border-line-strong text-[10px] font-medium">
                        Yeni Giriş
                      </span>
                    )}
                  </h3>
                </div>
              </button>

              {/* Attendance Date & Fast Toggles */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <div className="flex items-center space-x-1.5 bg-canvas border border-line-strong rounded-xl px-2.5 py-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-700 dark:text-indigo-400" />
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => {
                      setAttendanceDate(e.target.value);
                      setAttendanceMap({});
                    }}
                    className="bg-transparent text-fg text-xs font-semibold focus:outline-none cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleSetAllStatus('present')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  Tümünü 'Var' Yap
                </button>

                <button
                  type="button"
                  onClick={handleClearForm}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-2 text-fg-2 hover:text-fg transition-colors cursor-pointer"
                >
                  Sıfırla
                </button>

                <button
                  type="button"
                  onClick={() => setIsAttendanceSheetOpen(!isAttendanceSheetOpen)}
                  className="p-1 text-muted hover:text-fg cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isAttendanceSheetOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Attendance Form Table Body */}
            {isAttendanceSheetOpen && (
              <div className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-fg-2">
                    <thead className="bg-surface-2/50 uppercase tracking-wider text-muted border-b border-line">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold w-24">No</th>
                        <th className="px-4 py-2.5 font-semibold">Öğrenci Adı</th>
                        <th className="px-4 py-2.5 font-semibold text-center w-72">Durum</th>
                        <th className="px-4 py-2.5 font-semibold">Açıklama / Gerekçe</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-12">Sıfırla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {classStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-subtle">
                            Bu sınıfta kayıtlı öğrenci bulunmuyor.
                          </td>
                        </tr>
                      ) : (
                        classStudents.map((std) => {
                          const att = getStudentAttendance(std.id);
                          return (
                            <tr key={std.id} className="hover:bg-surface-2/40 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-muted">
                                #{std.studentNumber}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-fg">
                                {std.name}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-center space-x-1">
                                  {/* Var */}
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(std.id, 'present')}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                      att.status === 'present'
                                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                        : 'bg-surface-2 border-line-strong text-muted hover:text-fg'
                                    }`}
                                  >
                                    Var
                                  </button>

                                  {/* Yok */}
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(std.id, 'absent')}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                      att.status === 'absent'
                                        ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                                        : 'bg-surface-2 border-line-strong text-muted hover:text-fg'
                                    }`}
                                  >
                                    Yok
                                  </button>

                                  {/* Geç */}
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(std.id, 'late')}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                      att.status === 'late'
                                        ? 'bg-amber-600 border-amber-500 text-white shadow-sm'
                                        : 'bg-surface-2 border-line-strong text-muted hover:text-fg'
                                    }`}
                                  >
                                    Geç
                                  </button>

                                  {/* İzinli */}
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(std.id, 'excused')}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                                      att.status === 'excused'
                                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                                        : 'bg-surface-2 border-line-strong text-muted hover:text-fg'
                                    }`}
                                  >
                                    İzinli
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="text"
                                  value={att.note}
                                  onChange={(e) =>
                                    setAttendanceMap((prev) => ({
                                      ...prev,
                                      [std.id]: { ...att, note: e.target.value },
                                    }))
                                  }
                                  placeholder="Gerekçe veya not..."
                                  className="w-full px-2.5 py-1 bg-canvas border border-line rounded-lg text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttendanceMap((prev) => ({
                                      ...prev,
                                      [std.id]: { status: 'present', note: '' },
                                    }));
                                  }}
                                  className="p-1 text-subtle hover:text-fg-2 rounded hover:bg-surface-2 transition-colors cursor-pointer"
                                  title="Var olarak sıfırla"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* SAYFA ALTI KAYDET BUTONU FOR ATTENDANCE */}
                <div className="p-4 bg-canvas/90 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 text-xs">
                    {saveFeedback && (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        <span>Yoklama başarıyla sisteme kaydedildi!</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setAttendanceMap({})}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Formu Sıfırla</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAttendance}
                      disabled={isSaving}
                      className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 cursor-pointer transition-all scale-[1.02]"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saveFeedback ? 'Yoklama Kaydedildi! ✓' : 'Yoklamayı Kaydet'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PANEL 2: GEÇMİŞ YOKLAMA ARŞİVİ (TARİHE GÖRE İÇE İÇE AÇILIR MENÜ) */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setIsAttendanceHistoryOpen(!isAttendanceHistoryOpen)}
              className="w-full text-left p-3.5 sm:px-4 bg-surface/90 border-b border-line flex items-center justify-between hover:bg-surface-2/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 shrink-0">
                  <History className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center space-x-2">
                    <span>Geçmiş Yoklama Kayıtları Arşivi</span>
                    <span className="px-2 py-0.2 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 text-[10px] font-bold">
                      {classAttendanceRecords.length} Oturum
                    </span>
                  </h3>
                </div>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-muted transition-transform duration-200 ${
                  isAttendanceHistoryOpen ? 'rotate-180 text-fg' : ''
                }`}
              />
            </button>

            {isAttendanceHistoryOpen && (
              <div className="divide-y divide-line bg-canvas/30">
                {classAttendanceRecords.length === 0 ? (
                  <div className="p-8 text-center text-subtle text-xs">
                    Bu sınıf ve ders için henüz kayıtlı geçmiş yoklama bulunmuyor.
                  </div>
                ) : (
                  classAttendanceRecords.map((rec) => {
                    const presentCount = rec.records.filter((r) => r.status === 'present').length;
                    const absentCount = rec.records.filter((r) => r.status === 'absent').length;
                    const lateCount = rec.records.filter((r) => r.status === 'late').length;
                    const excusedCount = rec.records.filter((r) => r.status === 'excused').length;
                    const isRecordExpanded = !!expandedHistoryRecords[rec.id];

                    return (
                      <div key={rec.id} className="transition-colors">
                        {/* Nested Session Header */}
                        <div className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-surface-2/40">
                          {/* Left: Click to toggle nested student list */}
                          <button
                            type="button"
                            onClick={() => toggleHistoryRecord(rec.id)}
                            className="flex items-center space-x-2.5 text-left min-w-0 cursor-pointer flex-1"
                          >
                            <div className="w-5 h-5 rounded-md bg-surface-2 flex items-center justify-center text-muted shrink-0">
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isRecordExpanded ? 'rotate-90 text-indigo-700 dark:text-indigo-400' : ''
                                }`}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-fg">
                                  {new Date(rec.date).toLocaleDateString('tr-TR', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  })}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                                  {rec.subject}
                                </span>
                              </div>
                            </div>
                          </button>

                          {/* Middle: Badges */}
                          <div className="flex items-center space-x-1.5 text-[11px] shrink-0">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                              {presentCount} Var
                            </span>
                            {absentCount > 0 && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 font-bold">
                                {absentCount} Yok
                              </span>
                            )}
                            {lateCount > 0 && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold">
                                {lateCount} Geç
                              </span>
                            )}
                            {excusedCount > 0 && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 font-bold">
                                {excusedCount} İzinli
                              </span>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => {
                                setAttendanceDate(rec.date);
                                setSelectedClassId(rec.classId);
                                setSelectedSubject(rec.subject);
                                setIsAttendanceSheetOpen(true);
                                const nextMap: Record<string, { status: AttendanceStatus; note: string }> = {};
                                rec.records.forEach((r) => {
                                  nextMap[r.studentId] = { status: r.status, note: r.note || '' };
                                });
                                setAttendanceMap(nextMap);
                              }}
                              className="px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-fg rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Forma Yükle
                            </button>
                            <button
                              type="button"
                              onClick={() => setAttendanceToDelete(rec)}
                              className="p-1.5 bg-surface-2 hover:bg-rose-900/40 text-muted hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                              title="Yoklamayı Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Nested Dropdown Student Details */}
                        {isRecordExpanded && (
                          <div className="bg-canvas/60 p-3 sm:px-6 border-t border-line text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {rec.records.map((r) => (
                                <div
                                  key={r.studentId}
                                  className="p-2 rounded-lg bg-surface border border-line flex items-center justify-between"
                                >
                                  <span className="font-semibold text-fg truncate max-w-[130px]">
                                    {r.studentName}
                                  </span>
                                  <div className="flex items-center space-x-1.5">
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                        r.status === 'present'
                                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                          : r.status === 'absent'
                                          ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                                          : r.status === 'late'
                                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                          : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                                      }`}
                                    >
                                      {r.status === 'present'
                                        ? 'Var'
                                        : r.status === 'absent'
                                        ? 'Yok'
                                        : r.status === 'late'
                                        ? 'Geç'
                                        : 'İzinli'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}

      {/* ========================================================= */}
      {/* MODALS                                                    */}
      {/* ========================================================= */}

      {/* ADD GRADE MODAL */}
      {isAddGradeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <h3 className="text-base font-bold text-fg flex items-center space-x-2">
                <Award className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                <span>Yeni Not / Değerlendirme Ekle</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddGradeOpen(false)}
                className="p-1 text-muted hover:text-fg rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGrade} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Öğrenci *</label>
                <select
                  value={gradeStudentId}
                  onChange={(e) => setGradeStudentId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-line-strong rounded-xl text-fg text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  {classStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.studentNumber} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-1">Sınav / Tür</label>
                  <select
                    value={examType}
                    onChange={(e) => setExamType(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-2 border border-line-strong rounded-xl text-fg text-xs focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="1. Yazılı">1. Yazılı Sınav</option>
                    <option value="2. Yazılı">2. Yazılı Sınav</option>
                    <option value="Performans">Performans Notu</option>
                    <option value="Ödev Notu">Ödev Notu</option>
                    <option value="Deneme Sınavı">Deneme Sınavı</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-1">Puan (0-100) *</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-surface-2 border border-line-strong rounded-xl text-fg text-xs focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Öğretmen Değerlendirme Notu</label>
                <input
                  type="text"
                  placeholder="Başarılı çalışma, konu tekrarı önerilir..."
                  value={gradeRemarks}
                  onChange={(e) => setGradeRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-line-strong rounded-xl text-fg text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-line flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddGradeOpen(false)}
                  className="px-3.5 py-1.5 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  id="grade-save"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center space-x-1.5 disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Notu Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE GRADE MODAL */}
      <ConfirmDeleteModal
        isOpen={!!gradeToDelete}
        onClose={() => setGradeToDelete(null)}
        onConfirm={async () => {
          if (gradeToDelete) {
            await dataService.deleteGrade(gradeToDelete.id);
          }
        }}
        title="Not Kaydını Sil"
        itemBadge={gradeToDelete ? `${gradeToDelete.studentName} • ${gradeToDelete.examType} (${gradeToDelete.score}/${gradeToDelete.maxScore})` : undefined}
        description="Bu öğrenciye ait girilmiş olan sınav / performans not kaydını silmek istediğinize emin misiniz?"
        confirmButtonText="Notu Sil"
      />

      {/* CONFIRM DELETE ATTENDANCE RECORD MODAL */}
      <ConfirmDeleteModal
        isOpen={!!attendanceToDelete}
        onClose={() => setAttendanceToDelete(null)}
        onConfirm={async () => {
          if (attendanceToDelete) {
            await dataService.deleteAttendance(attendanceToDelete.id);
            if (attendanceToDelete.date === attendanceDate && attendanceToDelete.classId === selectedClassId) {
              setAttendanceMap({});
            }
          }
        }}
        title="Yoklama Kaydını Sil"
        itemBadge={attendanceToDelete ? `${attendanceToDelete.date} • ${attendanceToDelete.subject}` : undefined}
        description="Bu tarihe ait tüm sınıf devamsızlık yoklama kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmButtonText="Yoklamayı Sil"
      />

      {/* CONFIRM CLEAR CURRENT ATTENDANCE MODAL */}
      <ConfirmDeleteModal
        isOpen={isClearCurrentConfirmOpen}
        onClose={() => setIsClearCurrentConfirmOpen(false)}
        onConfirm={handleDeleteCurrentAttendance}
        title="Günün Yoklamasını Sil"
        itemBadge={`${attendanceDate} • ${selectedSubject}`}
        description="Seçili tarihteki yoklama kaydını veritabanından kalıcı olarak silmek istediğinize emin misiniz?"
        confirmButtonText="Evet, Yoklamayı Sil"
      />
    </div>
  );
};
