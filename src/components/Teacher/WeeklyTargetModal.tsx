import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Target,
  Save,
  Sparkles,
  BookOpen,
  Calendar,
  User,
  Users,
  CheckCircle2,
  Trash2,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, ClassGroup, WeeklyQuestionTarget } from '../../types';
import { dataService } from '../../services/dataService';
import { formatClassDisplayName } from '../../constants/schoolConstants';

interface WeeklyTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  targetClass?: ClassGroup | null;
  initialTargetType?: 'student' | 'class';
  classes?: ClassGroup[];
  students?: Student[];
  weekStartDate: string;
  weekEndDate: string;
  existingTarget?: WeeklyQuestionTarget | null;
  onSaved?: () => void;
}

const COMMON_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
  'Sosyal Bilgiler',
  'T.C. İnkılap Tarihi',
  'İngilizce',
  'Din Kültürü',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
];

const PRESET_DAYS = [
  { days: 1, label: '1 Gün' },
  { days: 3, label: '3 Gün' },
  { days: 5, label: '5 Gün' },
  { days: 7, label: '7 Gün (Haftalık)' },
  { days: 10, label: '10 Gün' },
  { days: 14, label: '14 Gün (2 Hafta)' },
  { days: 21, label: '21 Gün (3 Hafta)' },
  { days: 30, label: '30 Gün (Aylık)' },
];

const normalizeSubjectTargets = (targets: any): Record<string, number> => {
  if (!targets) return {};
  if (Array.isArray(targets)) {
    const res: Record<string, number> = {};
    for (const item of targets) {
      if (item && item.subject) {
        res[item.subject] = Number(item.target) || 0;
      }
    }
    return res;
  }
  if (typeof targets === 'object') {
    return { ...targets };
  }
  return {};
};

export const WeeklyTargetModal: React.FC<WeeklyTargetModalProps> = ({
  isOpen,
  onClose,
  student,
  targetClass,
  initialTargetType = 'student',
  classes = [],
  students = [],
  weekStartDate,
  weekEndDate,
  existingTarget,
  onSaved,
}) => {
  const [targetType, setTargetType] = useState<'student' | 'class'>(() => {
    if (existingTarget?.targetType) return existingTarget.targetType;
    if (initialTargetType) return initialTargetType;
    if (!student && targetClass) return 'class';
    return 'student';
  });

  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    return existingTarget?.studentId || student?.id || '';
  });

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return existingTarget?.classId || targetClass?.id || student?.classId || (classes[0]?.id || '');
  });

  // Hedef Gün Sayısı (Varsayılan 7 gün, manuel seçilebilir)
  const [targetDays, setTargetDays] = useState<number>(() => {
    return existingTarget?.targetDays || 7;
  });

  const [dailyTargetCount, setDailyTargetCount] = useState<number>(() => {
    if (existingTarget?.dailyTarget) return existingTarget.dailyTarget;
    const total = existingTarget?.targetQuestions || existingTarget?.weeklyTarget || 350;
    const days = existingTarget?.targetDays || 7;
    return Math.max(10, Math.round(total / days));
  });

  const [targetCount, setTargetCount] = useState<number>(() => {
    if (existingTarget?.targetQuestions) return existingTarget.targetQuestions;
    if (existingTarget?.weeklyTarget) return existingTarget.weeklyTarget;
    return (existingTarget?.dailyTarget || 50) * (existingTarget?.targetDays || 7);
  });

  const [notes, setNotes] = useState<string>(() => {
    return existingTarget?.notes || '';
  });

  const [subjectTargets, setSubjectTargets] = useState<Record<string, number>>(() => {
    return normalizeSubjectTargets(existingTarget?.subjectTargets);
  });

  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<string>(COMMON_SUBJECTS[0]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Güncelleme senkronizasyonu
  useEffect(() => {
    if (existingTarget) {
      const isClass = existingTarget.targetType === 'class' || (!!existingTarget.classId && !existingTarget.studentId);
      setTargetType(isClass ? 'class' : 'student');
      if (existingTarget.studentId) setSelectedStudentId(existingTarget.studentId);
      if (existingTarget.classId) setSelectedClassId(existingTarget.classId);

      const days = existingTarget.targetDays || 7;
      setTargetDays(days);

      const tQuestions = existingTarget.targetQuestions || existingTarget.weeklyTarget || 350;
      setTargetCount(tQuestions);
      setDailyTargetCount(existingTarget.dailyTarget || Math.round(tQuestions / days));
      setNotes(existingTarget.notes || '');
      setSubjectTargets(normalizeSubjectTargets(existingTarget.subjectTargets));
    } else {
      setTargetType(initialTargetType);
      if (student) setSelectedStudentId(student.id);
      if (targetClass) setSelectedClassId(targetClass.id);
      else if (student?.classId) setSelectedClassId(student.classId);

      setTargetDays(7);
      setDailyTargetCount(50);
      setTargetCount(350);
      setNotes('');
      setSubjectTargets({});
    }
  }, [existingTarget, student, targetClass, initialTargetType, isOpen]);

  // Gün Sayısı Değiştiğinde
  const handleDaysChange = (newDays: number) => {
    const cleanDays = Math.max(1, Math.min(365, newDays));
    setTargetDays(cleanDays);
    // Günlük hedefe göre toplam hedefi güncelle
    setTargetCount(dailyTargetCount * cleanDays);
  };

  // Günlük Hedef Değiştiğinde
  const handleDailyTargetChange = (val: number) => {
    const cleanDaily = Math.max(1, val);
    setDailyTargetCount(cleanDaily);
    setTargetCount(cleanDaily * targetDays);
  };

  // Toplam Hedef Değiştiğinde
  const handleTotalTargetChange = (val: number) => {
    const cleanTotal = Math.max(1, val);
    setTargetCount(cleanTotal);
    setDailyTargetCount(Math.max(1, Math.round(cleanTotal / targetDays)));
  };

  // Aktif seçili öğrenci ve sınıf
  const currentSelectedStudent = useMemo(() => {
    if (student && student.id === selectedStudentId) return student;
    return students.find((s) => s.id === selectedStudentId) || student || null;
  }, [students, selectedStudentId, student]);

  const currentSelectedClass = useMemo(() => {
    if (targetClass && targetClass.id === selectedClassId) return targetClass;
    return classes.find((c) => c.id === selectedClassId) || targetClass || null;
  }, [classes, selectedClassId, targetClass]);

  const classStudentsCount = useMemo(() => {
    if (!selectedClassId) return 0;
    return students.filter((s) => s.classId === selectedClassId).length;
  }, [students, selectedClassId]);

  if (!isOpen) return null;

  const handleAddSubjectTarget = () => {
    if (!subjectTargets[selectedSubjectToAdd]) {
      setSubjectTargets((prev) => ({
        ...prev,
        [selectedSubjectToAdd]: Math.max(10, Math.round(targetCount / 4)),
      }));
    }
  };

  const handleRemoveSubjectTarget = (sub: string) => {
    setSubjectTargets((prev) => {
      const copy = { ...prev };
      delete copy[sub];
      return copy;
    });
  };

  const handleSubjectTargetChange = (sub: string, val: number) => {
    setSubjectTargets((prev) => ({
      ...prev,
      [sub]: Math.max(0, val),
    }));
  };

  const handleSave = async () => {
    const periodLabel =
      targetDays === 7
        ? 'Haftalık (7 Gün)'
        : targetDays === 1
        ? '1 Günlük'
        : `${targetDays} Günlük`;

    if (targetType === 'class') {
      if (!selectedClassId) {
        alert('Lütfen hedef atanacak sınıfı seçiniz.');
        return;
      }
      const clsName =
        currentSelectedClass?.name ||
        formatClassDisplayName(
          currentSelectedClass?.name,
          currentSelectedClass?.branch,
          currentSelectedClass?.gradeLevel
        );

      await dataService.setClassQuestionTarget(
        selectedClassId,
        clsName,
        {
          targetDays,
          targetPeriodLabel: periodLabel,
          targetQuestions: targetCount,
          weeklyTarget: targetCount,
          dailyTarget: dailyTargetCount,
          weekStartDate,
          weekEndDate,
          subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
          notes: notes.trim() || undefined,
          assignedBy: 'Öğretmen',
        },
        true // Sınıftaki tüm öğrencilere de hedefi ata
      );
    } else {
      if (!selectedStudentId && !currentSelectedStudent) {
        alert('Lütfen hedef atanacak öğrenciyi seçiniz.');
        return;
      }
      const st = currentSelectedStudent || students.find((s) => s.id === selectedStudentId);

      await dataService.setWeeklyQuestionTarget({
        targetType: 'student',
        studentId: selectedStudentId || st?.id || '',
        studentName: st?.name,
        classId: st?.classId || selectedClassId,
        className: st?.className || currentSelectedClass?.name,
        targetDays,
        targetPeriodLabel: periodLabel,
        targetQuestions: targetCount,
        weeklyTarget: targetCount,
        dailyTarget: dailyTargetCount,
        weekStartDate,
        weekEndDate,
        subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
        notes: notes.trim() || undefined,
        assignedBy: 'Öğretmen',
        assignedDate: new Date().toISOString(),
      });
    }

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}

    setSavedSuccess(true);
    if (onSaved) onSaved();

    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1100);
  };

  const handleDelete = async () => {
    if (targetType === 'class' && selectedClassId) {
      await dataService.deleteClassQuestionTarget(selectedClassId, weekStartDate);
    } else if (selectedStudentId) {
      await dataService.deleteWeeklyQuestionTarget(selectedStudentId, weekStartDate);
    }
    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Soru Sayısı Hedefi Belirleme</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1.5 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {targetType === 'class'
                    ? `Sınıf: ${
                        currentSelectedClass
                          ? formatClassDisplayName(
                              currentSelectedClass.name,
                              currentSelectedClass.branch,
                              currentSelectedClass.gradeLevel
                            )
                          : 'Sınıf Seçiniz'
                      }`
                    : `Öğrenci: ${currentSelectedStudent?.name || 'Öğrenci Seçiniz'}`}
                </span>
                <span>•</span>
                <span>{targetDays === 7 ? 'Haftalık Hedef' : `${targetDays} Günlük Hedef`}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 1. HEDEF TİPİ SEÇİMİ (Öğrenci Bazlı / Sınıfa Toplu) */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTargetType('student')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                targetType === 'student'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Öğrenci Bazlı Hedef</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetType('class')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                targetType === 'class'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Sınıfa Toplu Soru Hedefi</span>
            </button>
          </div>

          {/* Sınıf veya Öğrenci Seçim Kartı */}
          {targetType === 'class' ? (
            <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/30 rounded-xl space-y-3">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-orange-600" />
                  <span>Hedef Verilecek Sınıf:</span>
                </span>
                <span className="text-xs font-bold text-orange-700 dark:text-orange-300">
                  {classStudentsCount} Öğrenciye Uygulanacak
                </span>
              </label>

              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/40 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
              >
                <option value="">Sınıf Seçiniz</option>
                {classes.map((cls) => {
                  const count = students.filter((s) => s.classId === cls.id).length;
                  return (
                    <option key={cls.id} value={cls.id}>
                      {formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel)} ({count} Öğrenci)
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                * Bu hedef kaydedildiğinde seçilen sınıftaki tüm öğrencilerin panelinde hedef olarak tanımlanacaktır.
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/30 rounded-xl flex items-center gap-3">
              {currentSelectedStudent ? (
                <>
                  <img
                    src={
                      currentSelectedStudent.avatar ||
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                        currentSelectedStudent.name
                      )}`
                    }
                    alt={currentSelectedStudent.name}
                    className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0 ring-2 ring-orange-300 dark:ring-orange-500/40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {currentSelectedStudent.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {currentSelectedStudent.className || 'Sınıf Belirtilmedi'} • No: #
                      {currentSelectedStudent.studentNumber || '-'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Hedef Verilecek Öğrenciyi Seçiniz:
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/40 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                  >
                    <option value="">Öğrenci Seçiniz</option>
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.className || 'Sınıfsız'}) - #{st.studentNumber || '-'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 2. HEDEF GÜN SAYISI SEÇİM BUTONLARI (HAFTALIK / ÖZEL GÜN SAYISI) */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Hedef Süresi / Gün Sayısı Seçimi:</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={targetDays}
                  onChange={(e) => handleDaysChange(Number(e.target.value) || 1)}
                  className="w-16 px-2 py-1 text-xs font-extrabold text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/50 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Gün</span>
              </div>
            </div>

            {/* Hızlı Gün Butonları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PRESET_DAYS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => handleDaysChange(preset.days)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer border ${
                    targetDays === preset.days
                      ? 'bg-orange-500 text-white border-orange-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-orange-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. GÜNLÜK VE TOPLAM SORU HEDEFİ GİRİŞİ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Günlük Hedef */}
            <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/30 rounded-xl space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Günlük Soru Hedefi:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="1000"
                  step="5"
                  value={dailyTargetCount}
                  onChange={(e) => handleDailyTargetChange(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-base font-black text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/50 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Soru/Gün
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="250"
                step="5"
                value={dailyTargetCount}
                onChange={(e) => handleDailyTargetChange(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
              />
            </div>

            {/* Toplam Soru Hedefi (Seçilen Gün Sayısına Göre) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {targetDays} Günlük Toplam Hedef:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="10000"
                  step="25"
                  value={targetCount}
                  onChange={(e) => handleTotalTargetChange(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-base font-black text-slate-900 dark:text-white bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Toplam Soru
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="3000"
                step="25"
                value={targetCount}
                onChange={(e) => handleTotalTargetChange(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
              />
            </div>
          </div>

          {/* Hızlı Toplam Hedef Presetleri */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Hızlı Seçim:</span>
            {[140, 210, 350, 500, 700, 1000, 1500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleTotalTargetChange(preset)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  targetCount === preset
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {preset} Soru
              </button>
            ))}
          </div>

          {/* 4. DERS BAZLI HEDEFLER (İsteğe Bağlı) */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ders Bazlı Branş Hedefleri (İsteğe Bağlı)</span>
              </span>
              <span className="text-[10px] text-slate-500">Özel ders hedefleri ekle</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSubjectToAdd}
                onChange={(e) => setSelectedSubjectToAdd(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
              >
                {COMMON_SUBJECTS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddSubjectTarget}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                + Ders Ekle
              </button>
            </div>

            {Object.keys(subjectTargets).length > 0 && (
              <div className="space-y-2 pt-1">
                {Object.entries(subjectTargets).map(([sub, count]) => (
                  <div
                    key={sub}
                    className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                  >
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{sub}</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        step="10"
                        value={count}
                        onChange={(e) => handleSubjectTargetChange(sub, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-bold text-slate-900 dark:text-white"
                      />
                      <span className="text-[11px] text-slate-400">Soru</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubjectTarget(sub)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                        title="Ders hedefini kaldır"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. ÖĞRETMEN NOTU & TAVSİYESİ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Öğrencilere / Sınıfa Motivasyon Notu (İsteğe Bağlı)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Bu dönem özellikle yeni nesil sorulara odaklanalım ve günlük hedefleri aksatmayalım. Başarılar!"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs placeholder-slate-400 focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div>
            {existingTarget && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hedefi Sil</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-500/25 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {savedSuccess
                  ? 'Kaydedildi!'
                  : targetType === 'class'
                  ? 'Sınıfa Hedefi Tanımla ve İlet'
                  : 'Hedefi Kaydet ve İlet'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
