import React, { useMemo, useState } from 'react';
import { notSilindi } from '../../lib/geriAl';
import {
  FileSpreadsheet,
  Plus,
  Save,
  Search,
  Award,
  Trash2,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  BookOpen,
  Filter,
  Users,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GradeRecord, AttendanceRecord, Student, ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import { StudentSearchSelect } from '../Common/StudentSearchSelect'; // Aşama 57: aranabilir öğrenci listesi
import { useQuickFocus } from '../../lib/quickFocus';
import { matchTurkishSearch } from '../../utils/turkishSearch';
import { subjectsForBranch, subjectsForLevel } from '../../lib/subjects';
import { detectSchoolLevelFromGrade } from '../../constants/schoolConstants';
import { Modal, Segmented } from '../ui/kit'; // Aşama 191 · Aşama 208: Segmented

// Yerel tarih (UTC değil): Türkiye'de gece 00:00–03:00 arası bir önceki gün yazılmasın
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface GradeAttendanceProps {
  students: Student[];
  classes: ClassGroup[];
  grades: GradeRecord[];
  /** Aşama 198: artık okunmaz (eski etüt kopyaları silindi); çağıranlar değişmesin diye isteğe bağlı kaldı */
  attendance?: AttendanceRecord[];
}

export const GradeAttendance: React.FC<GradeAttendanceProps> = ({
  students,
  classes,
  grades,
}) => {
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  // Aşama 98: öğretmene göre (kaydı giren öğretmenin giriş hesabı); birden fazla öğretmenin kaydı görünüyorsa
  const [teacherFilter, setTeacherFilter] = useState('all');
  const teacherOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const g of grades) if (g.createdBy) ids.add(g.createdBy);
    return Array.from(ids)
      .map((id) => ({ id, name: dataService.teacherByAuthId(id)?.name || 'Bilinmeyen öğretmen' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [grades]);
  const byTeacher = (createdBy?: string) => teacherFilter === 'all' || createdBy === teacherFilter;
  // Kurum Özeti'nden gelen öğretmen: süzgeç seçilir, o öğretmenin en son kaydının sınıfı ve dersi açılır
  useQuickFocus(['teacher'], (f) => {
    const auth = dataService.getTeachers().find((t) => t.id === f.id)?.auth_user_id || '';
    if (!auth) return;
    setTeacherFilter(auth);
    const last = grades.filter((g) => g.createdBy === auth).map((g) => ({ d: g.date, c: g.classId, s: g.subject }))
      .sort((a, b) => (b.d || '').localeCompare(a.d || ''))[0];
    if (last) {
      setSelectedClassId(last.c);
      setSelectedSubject(last.s);
    }
  });

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
  useAutoDismiss(batchSaveFeedback, () => setBatchSaveFeedback(null)); // Aşama 32: 15 sn sonra kaybolur

  // Grade Modal State
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false);
  const [gradeStudentId, setGradeStudentId] = useState(students[0]?.id || '');
  const [examType, setExamType] = useState('1. Yazılı');
  const [score, setScore] = useState<number>(85);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [gradeRemarks, setGradeRemarks] = useState('');

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

  // Filter students of active class
  const classStudents = students.filter((s) => s.classId === selectedClassId);
  const activeClass = classes.find((c) => c.id === selectedClassId);

  // Aşama 116: ders listesi sınıfın kademesine göre (Ortaokul / Lise; kademe bilinmiyorsa ikisi birden).
  // Öğretmenin kendi branş dersleri en üstte; bu sınıfta daha önce not / yoklama girilmiş dersler ve seçili ders hep listede kalır.
  const subjectOptions = useMemo(() => {
    const level = activeClass ? activeClass.schoolLevel || detectSchoolLevelFromGrade(activeClass.gradeLevel || activeClass.name) || null : null;
    const out: string[] = [];
    const add = (x?: string | null) => {
      const v = (x || '').trim();
      if (v && !out.includes(v)) out.push(v);
    };
    subjectsForBranch(dataService.getCurrentTeacher()?.branch).forEach(add);
    subjectsForLevel(level).forEach(add);
    if (selectedClassId) {
      for (const g of grades) if (g.classId === selectedClassId) add(g.subject);
    }
    add(selectedSubject);
    return out;
  }, [activeClass, selectedClassId, grades, selectedSubject]);

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
  });

  const batchEnteredCount = Object.keys(batchGradesMap).filter((id) => {
    const val = batchGradesMap[id]?.score?.trim();
    return val !== undefined && val !== '' && !isNaN(Number(val));
  }).length;

  // Grade averages
  // Aşama 116: süzmeler yalnız kayıtlar ya da seçimler değişince yeniden yapılır (her tuşta tüm kayıtlar taranmaz)
  const classGrades = useMemo(
    () => grades.filter((g) => g.classId === selectedClassId && g.subject === selectedSubject && (teacherFilter === 'all' || g.createdBy === teacherFilter)),
    [grades, selectedClassId, selectedSubject, teacherFilter]
  );
  const averageScore = classGrades.length
    ? Math.round(classGrades.reduce((acc, g) => acc + g.score, 0) / classGrades.length)
    : 0;

  // Group grades by Exam Type
  const EXAM_TYPES = ['1. Yazılı', '2. Yazılı', 'Performans', 'Ödev Notu', 'Deneme Sınavı'];

  const toggleExamGroup = (type: string) => {
    setExpandedExamGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Filtered grades by search
  const filteredGrades = useMemo(
    () =>
      classGrades.filter((g) => {
        if (!searchGradeStudent.trim()) return true;
        const q = searchGradeStudent; // Aşama 116: Türkçe harf duyarsız
        return matchTurkishSearch(g.studentName, q) || matchTurkishSearch(g.examType, q) || matchTurkishSearch(g.remarks, q);
      }),
    [classGrades, searchGradeStudent]
  );

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
            <div className="w-9 h-9 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center text-brand-fg shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg tracking-tight flex items-center space-x-2">
                <span>Ders Notları</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${
                    activeClass && selectedSubject
                      ? 'bg-brand/10 text-brand-fg border border-brand/20'
                      : 'bg-warning/10 text-warning-fg border border-warning/20'
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 h-8 bg-canvas border border-line rounded-lg px-2.5">
            <Users className="w-3.5 h-3.5 text-brand-fg shrink-0" />
            <select
              aria-label="Sınıf"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
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

          <div className="flex items-center gap-1.5 h-8 bg-canvas border border-line rounded-lg px-2.5">
            <BookOpen className="w-3.5 h-3.5 text-success-fg shrink-0" />
            <select
              aria-label="Ders"
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
              }}
              className="bg-transparent text-fg text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="" disabled className="bg-surface text-muted">
                Ders Seçiniz
              </option>
              {subjectOptions.map((sub) => (
                <option key={sub} value={sub} className="bg-surface text-fg">
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* Aşama 98: öğretmene göre (birden fazla öğretmenin kaydı görünüyorsa) */}
          {(teacherOptions.length > 1 || teacherFilter !== 'all') && (
            <div className="flex items-center gap-1.5 h-8 bg-canvas border border-line rounded-lg px-2.5">
              <Filter className="w-3.5 h-3.5 text-warning-fg shrink-0" />
              <select
                id="grades-filter-teacher"
                aria-label="Öğretmene göre"
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="bg-transparent text-fg text-xs font-semibold focus:outline-none cursor-pointer max-w-[11rem]"
              >
                <option value="all" className="bg-surface text-fg">
                  Tüm Öğretmenler
                </option>
                {teacherOptions.map((o) => (
                  <option key={o.id} value={o.id} className="bg-surface text-fg">
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* KONTROL: Sınıf ve ders seçilmeden altta sınıf ve öğrenci listesi hemen açılmasın! */}
      {!selectedClassId || !selectedSubject ? (
        <div className="bg-surface/90 border border-line rounded-2xl p-10 sm:p-14 text-center shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 text-brand-fg flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-fg mb-2">
            Sınıf ve Ders Seçin
          </h3>
          <p className="text-xs text-muted max-w-lg mx-auto mb-6">Yukarıdaki kutulardan sınıf ve ders seçin.</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <div
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
                selectedClassId
                  ? 'bg-success/30 text-success-fg border-success/30'
                  : 'bg-canvas text-fg-2 border-line'
              }`}
            >
              <Users className="w-4 h-4 text-brand-fg" />
              <span>
                {selectedClassId ? `Sınıf Seçildi: ${activeClass?.name}` : '1. Adım: Yukarıdan Sınıf Seçiniz'}
              </span>
            </div>

            <div
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
                selectedSubject
                  ? 'bg-success/30 text-success-fg border-success/30'
                  : 'bg-canvas text-fg-2 border-line'
              }`}
            >
              <BookOpen className="w-4 h-4 text-success-fg" />
              <span>
                {selectedSubject ? `Ders Seçildi: ${selectedSubject}` : '2. Adım: Yukarıdan Ders Seçiniz'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between border-b border-line pb-3 flex-wrap gap-3">
        {/* Aşama 198: "Etüt yoklamaları" sekmesi kalktı (eski kopyalar silindi); etüt yoklaması Etüt ekranında */}
        <span id="grades-tab-grades" className="flex items-center gap-1.5 text-xs font-semibold text-fg">
          <Award className="w-3.5 h-3.5 text-brand-fg" />
          Not çizelgesi ({classGrades.length})
        </span>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle · Aşama 208: ortak sekme düğmesi */}
            <div className="hidden sm:block">
            <Segmented
              size="sm"
              value={gradeViewMode}
              onChange={(v) => setGradeViewMode(v)}
              items={[
                { value: 'grouped', label: 'Sınav grupları' },
                { value: 'table', label: 'Düz tablo' },
                {
                  value: 'batch',
                  label: 'Toplu not',
                  badge: batchEnteredCount > 0 ? <span className="w-2 h-2 rounded-full bg-warning/40 animate-pulse" aria-hidden="true"></span> : undefined,
                },
              ]}
            />
            </div>

            <button
              type="button"
              onClick={() => {
                setGradeStudentId(classStudents[0]?.id || students[0]?.id || '');
                setIsAddGradeOpen(true);
              }}
              className="ui-btn ui-btn-primary ui-btn-sm w-28"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni not</span>
            </button>
          </div>
      </div>

      {/* ========================================================= */}
      {/* 1. DERS NOT ÇİZELGESİ SECTION                             */}
      {/* ========================================================= */}
        <div className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted">Sınıf Başarı Ortalaması</span>
                <div className="text-xl font-extrabold text-fg mt-0.5 flex items-baseline space-x-1">
                  <span className={averageScore >= 70 ? 'text-success-fg' : averageScore >= 50 ? 'text-warning-fg' : 'text-danger-fg'}>
                    {averageScore > 0 ? averageScore : '-'}
                  </span>
                  <span className="text-xs text-subtle font-normal">/ 100</span>
                </div>
              </div>
              <Award className="w-6 h-6 text-brand-fg" />
            </div>

            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted">Toplam Not Kaydı</span>
                <div className="text-xl font-extrabold text-fg mt-0.5">{classGrades.length} Giriş</div>
              </div>
              <FileSpreadsheet className="w-6 h-6 text-info-fg" />
            </div>

            <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-muted">Kayıtlı Öğrenci Sayısı</span>
                <div className="text-xl font-extrabold text-brand-fg mt-0.5">{classStudents.length} Öğrenci</div>
              </div>
              <Users className="w-6 h-6 text-brand-fg" />
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
              className="ui-field w-full pl-9 pr-3"
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
                        <div className="w-7 h-7 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center text-brand-fg shrink-0">
                          <Award className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-xs sm:text-sm font-bold text-fg">{type}</h3>
                          <span className="px-2 py-0.5 rounded-lg text-2xs font-bold bg-brand/10 text-brand-fg border border-brand/20">
                            {groupGrades.length} Not
                          </span>
                          {groupAvg > 0 && (
                            <span className="text-xs text-muted hidden sm:inline">
                              • Grup Ortalaması: <strong className="text-success-fg">{groupAvg}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 text-muted text-xs shrink-0">
                        <span className="text-xs text-subtle hidden sm:inline">
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
                                  <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center text-2xs font-bold text-muted shrink-0">
                                    #{g.studentId.slice(-3)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs font-bold text-fg truncate">
                                        {g.studentName || 'Öğrenci'}
                                      </span>
                                      <span className="text-xs text-subtle hidden sm:inline">
                                        • {g.date}
                                      </span>
                                    </div>
                                    {g.remarks && (
                                      <p className="text-xs text-muted italic truncate max-w-sm">
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
                                          ? 'bg-success/10 text-success-fg border-success/20'
                                          : g.score >= 70
                                          ? 'bg-info/10 text-info-fg border-info/20'
                                          : g.score >= 50
                                          ? 'bg-warning/10 text-warning-fg border-warning/20'
                                          : 'bg-danger/10 text-danger-fg border-danger/20'
                                      }`}
                                    >
                                      {g.score}
                                      <span className="text-2xs text-subtle font-normal"> / {g.maxScore}</span>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setGradeToDelete(g)}
                                    className="ui-btn-mini ui-btn-mini-danger"
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
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-brand/10 text-brand-fg border border-brand/20">
                              {g.examType}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold">
                            <span
                              className={
                                g.score >= 85
                                  ? 'text-success-fg'
                                  : g.score >= 70
                                  ? 'text-info-fg'
                                  : g.score >= 50
                                  ? 'text-warning-fg'
                                  : 'text-danger-fg'
                              }
                            >
                              {g.score}
                            </span>
                            <span className="text-subtle font-normal text-2xs"> / {g.maxScore}</span>
                          </td>
                          <td className="px-4 py-3 text-muted">{g.date}</td>
                          <td className="px-4 py-3 text-muted italic">{g.remarks || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setGradeToDelete(g)}
                              className="ui-btn-mini ui-btn-mini-danger"
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
                  <div className="w-8 h-8 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center text-brand-fg shrink-0">
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
                    className="ui-field w-auto font-semibold cursor-pointer"
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
                              className="ui-field w-24 font-bold text-center"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              placeholder="Gelişim notu veya geri bildirim..."
                              value={entry.remarks}
                              onChange={(e) => handleBatchGradeChange(std.id, 'remarks', e.target.value)}
                              className="ui-field w-full"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasEntered ? (
                              <span className="px-2 py-0.5 rounded text-2xs font-bold bg-warning/20 text-warning-fg border border-warning/30">
                                Kaydedilmedi
                              </span>
                            ) : (
                              <span className="text-subtle text-xs">-</span>
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
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-success/15 text-success-fg border border-success/30 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success-fg" />
                      <span>{batchSaveFeedback}</span>
                    </span>
                  ) : batchEnteredCount > 0 ? (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-warning/15 text-warning-fg border border-warning/30 font-semibold animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning-fg" />
                      <span>{batchEnteredCount} öğrenci için not girildi</span>
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  {batchEnteredCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setBatchGradesMap({})}
                      className="ui-btn ui-btn-secondary ui-btn-sm flex-1 sm:flex-none sm:w-28"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Temizle</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveBatchGrades}
                    disabled={isSaving || batchEnteredCount === 0}
                    className="ui-btn ui-btn-primary ui-btn-sm flex-1 sm:flex-none sm:w-28"
                    title={batchEnteredCount > 0 ? `${batchEnteredCount} öğrencinin notunu kaydet` : undefined}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{batchEnteredCount > 0 ? `Kaydet (${batchEnteredCount})` : 'Kaydet'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        </>
      )}

      {/* ========================================================= */}
      {/* MODALS                                                    */}
      {/* ========================================================= */}

      {/* ADD GRADE MODAL */}
      <Modal
        open={isAddGradeOpen}
        onClose={() => setIsAddGradeOpen(false)}
        size="sm"
        icon={Award}
        title="Yeni Not / Değerlendirme Ekle"
        footer={
          <>
            <button type="button" onClick={() => setIsAddGradeOpen(false)} className="ui-btn ui-btn-secondary w-28">
              İptal
            </button>
            <button type="submit" form="not-ekle-formu" id="grade-save" disabled={isSaving} className="ui-btn ui-btn-primary w-28">
              <Save className="w-3.5 h-3.5" />
              <span>Kaydet</span>
            </button>
          </>
        }
      >
            <form id="not-ekle-formu" onSubmit={handleSaveGrade} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-fg-2 mb-1">Öğrenci *</label>
                <StudentSearchSelect
                  students={classStudents}
                  value={gradeStudentId}
                  onChange={setGradeStudentId}
                  placeholder="Öğrenci seçin"
                  className="ui-field h-8 py-0"
                  showClass={false}
                  ariaLabel="Öğrenci"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-2 mb-1">Sınav / Tür</label>
                  <select
                    value={examType}
                    onChange={(e) => setExamType(e.target.value)}
                    className="ui-field w-full"
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
                    className="ui-field w-full font-bold"
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
                  className="ui-field w-full"
                />
              </div>

            </form>
      </Modal>

      {/* CONFIRM DELETE GRADE MODAL */}
      <ConfirmDeleteModal
        isOpen={!!gradeToDelete}
        onClose={() => setGradeToDelete(null)}
        onConfirm={async () => {
          if (gradeToDelete) {
            const silinen = gradeToDelete;
            await dataService.deleteGrade(silinen.id);
            notSilindi(silinen); // Aşama 306: 10 sn "Geri al"
          }
        }}
        title="Not Kaydını Sil"
        itemBadge={gradeToDelete ? `${gradeToDelete.studentName} • ${gradeToDelete.examType} (${gradeToDelete.score}/${gradeToDelete.maxScore})` : undefined}
        description="Bu öğrenciye ait girilmiş olan sınav / performans not kaydını silmek istediğinize emin misiniz?"
        confirmButtonText="Notu Sil"
      />
    </div>
  );
};
