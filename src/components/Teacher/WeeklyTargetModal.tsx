import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Target,
  Save,
  Sparkles,
  BookOpen,
  Calendar,
  CalendarDays,
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
import { formatTurkishDate, formatDateISO } from '../../utils/questionAnalytics';

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
  weekStartDate: defaultStartDate,
  weekEndDate: defaultEndDate,
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

  // Tarih Aralığı (Start Date - End Date)
  const [startDate, setStartDate] = useState<string>(() => {
    return existingTarget?.weekStartDate || defaultStartDate || formatDateISO(new Date());
  });

  const [endDate, setEndDate] = useState<string>(() => {
    if (existingTarget?.weekEndDate) return existingTarget.weekEndDate;
    if (defaultEndDate) return defaultEndDate;
    const end = new Date();
    end.setDate(end.getDate() + 6);
    return formatDateISO(end);
  });

  // Hedef Gün Sayısı
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

      const sDate = existingTarget.weekStartDate || defaultStartDate || formatDateISO(new Date());
      const eDate = existingTarget.weekEndDate || defaultEndDate || formatDateISO(new Date());
      setStartDate(sDate);
      setEndDate(eDate);

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

      const sDate = defaultStartDate || formatDateISO(new Date());
      const eDate = defaultEndDate || (() => {
        const d = new Date(sDate);
        d.setDate(d.getDate() + 6);
        return formatDateISO(d);
      })();

      setStartDate(sDate);
      setEndDate(eDate);
      setTargetDays(7);
      setDailyTargetCount(50);
      setTargetCount(350);
      setNotes('');
      setSubjectTargets({});
    }
    // Yalnızca pencere açıldığında veya gerçekten başka bir öğrenci/sınıf seçildiğinde doldurulur.
    // (Arka plan eşitlemesi kayıtları yeniden getirdiğinde öğretmenin yazdıkları silinmez.)
  }, [student?.id, targetClass?.id, initialTargetType, isOpen]);

  // Tarihler değiştiğinde gün sayısını ve hedefi otomatik hesapla
  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (newStart && endDate) {
      const s = new Date(newStart + 'T00:00:00');
      const e = new Date(endDate + 'T00:00:00');
      if (e >= s) {
        const diffDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        setTargetDays(diffDays);
        setTargetCount(dailyTargetCount * diffDays);
      } else {
        // Otomatik end date'i start + targetDays yap
        const newEnd = new Date(s);
        newEnd.setDate(s.getDate() + targetDays - 1);
        setEndDate(formatDateISO(newEnd));
      }
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    setEndDate(newEnd);
    if (startDate && newEnd) {
      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(newEnd + 'T00:00:00');
      if (e >= s) {
        const diffDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        setTargetDays(diffDays);
        setTargetCount(dailyTargetCount * diffDays);
      }
    }
  };

  // Hızlı Ön Tanımlı Tarih Aralıkları (Preset Quick Dates)
  const applyDatePreset = (presetType: 'this_week' | 'next_week' | '15_days' | 'this_month') => {
    const today = new Date();
    if (presetType === 'this_week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      const mon = new Date(today.setDate(diff));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setStartDate(formatDateISO(mon));
      setEndDate(formatDateISO(sun));
      setTargetDays(7);
      setTargetCount(dailyTargetCount * 7);
    } else if (presetType === 'next_week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1) + 7;
      const mon = new Date(today.setDate(diff));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      setStartDate(formatDateISO(mon));
      setEndDate(formatDateISO(sun));
      setTargetDays(7);
      setTargetCount(dailyTargetCount * 7);
    } else if (presetType === '15_days') {
      const start = new Date();
      const end = new Date();
      end.setDate(start.getDate() + 14);
      setStartDate(formatDateISO(start));
      setEndDate(formatDateISO(end));
      setTargetDays(15);
      setTargetCount(dailyTargetCount * 15);
    } else if (presetType === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(formatDateISO(start));
      setEndDate(formatDateISO(end));
      const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      setTargetDays(diffDays);
      setTargetCount(dailyTargetCount * diffDays);
    }
  };

  // Gün Sayısı Değiştiğinde
  const handleDaysChange = (newDays: number) => {
    const cleanDays = Math.max(1, Math.min(365, newDays));
    setTargetDays(cleanDays);
    // End Date'i start + cleanDays - 1 olarak güncelle
    if (startDate) {
      const s = new Date(startDate + 'T00:00:00');
      const e = new Date(s);
      e.setDate(s.getDate() + cleanDays - 1);
      setEndDate(formatDateISO(e));
    }
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
    const formattedRange = `${formatTurkishDate(startDate)} - ${formatTurkishDate(endDate)}`;
    const periodLabel = `${formattedRange} (${targetDays} Gün)`;

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

      try {
        await dataService.setClassQuestionTarget(
          selectedClassId,
          clsName,
          {
            targetDays,
            targetPeriodLabel: periodLabel,
            targetQuestions: targetCount,
            weeklyTarget: targetCount,
            dailyTarget: dailyTargetCount,
            weekStartDate: startDate,
            weekEndDate: endDate,
            subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
            notes: notes.trim() || undefined,
            assignedBy: 'Öğretmen',
          },
          true // Sınıftaki tüm öğrencilere de hedefi ata
        );
      } catch {
        return; // hata uyarısı gösterildi; form açık kalır
      }
    } else {
      if (!selectedStudentId && !currentSelectedStudent) {
        alert('Lütfen hedef atanacak öğrenciyi seçiniz.');
        return;
      }
      const st = currentSelectedStudent || students.find((s) => s.id === selectedStudentId);

      try {
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
          weekStartDate: startDate,
          weekEndDate: endDate,
          subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
          notes: notes.trim() || undefined,
          assignedBy: 'Öğretmen',
          assignedDate: new Date().toISOString(),
        });
      } catch {
        return; // hata uyarısı gösterildi; form açık kalır
      }
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
    try {
      if (targetType === 'class' && selectedClassId) {
        await dataService.deleteClassQuestionTarget(selectedClassId, startDate);
      } else if (selectedStudentId) {
        await dataService.deleteWeeklyQuestionTarget(selectedStudentId, startDate);
      }
    } catch {
      return; // hata uyarısı gösterildi
    }
    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-fg flex items-center space-x-2">
                <span>Soru Sayısı Hedefi Belirleme</span>
              </h3>
              <p className="text-xs text-muted flex items-center space-x-1.5 mt-0.5">
                <span className="font-semibold text-fg-2">
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
                <span className="text-orange-600 dark:text-orange-300 font-bold">{targetDays} Günlük Hedef</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-subtle hover:text-fg-2 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* 1. HEDEF TİPİ SEÇİMİ (Öğrenci Bazlı / Sınıfa Toplu) */}
          <div className="bg-surface-2 p-1 rounded-xl flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTargetType('student')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                targetType === 'student'
                  ? 'bg-surface text-orange-600 dark:text-orange-300 shadow-xs'
                  : 'text-muted hover:text-fg'
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
                  ? 'bg-surface text-orange-600 dark:text-orange-300 shadow-xs'
                  : 'text-muted hover:text-fg'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Sınıfa Toplu Soru Hedefi</span>
            </button>
          </div>

          {/* Sınıf veya Öğrenci Seçim Kartı */}
          {targetType === 'class' ? (
            <div className="p-4 bg-orange-50/70 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl space-y-2.5 shadow-2xs">
              <label className="block text-xs font-bold text-fg flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                  <span>Hedef Verilecek Sınıf:</span>
                </span>
                <span className="text-xs font-bold text-orange-800 dark:text-orange-200 bg-surface px-2 py-0.5 rounded border border-orange-200 dark:border-orange-500/30">
                  {classStudentsCount} Öğrenciye Uygulanacak
                </span>
              </label>

              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-orange-300 dark:border-orange-500/30 rounded-xl text-xs font-bold text-fg focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-2xs"
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
            </div>
          ) : (
            <div className="p-3.5 bg-orange-50/70 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl flex items-center gap-3 shadow-2xs">
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
                    className="w-11 h-11 rounded-full bg-surface-3 shrink-0 ring-2 ring-orange-300 dark:ring-orange-500/30 shadow-2xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-fg truncate">
                      {currentSelectedStudent.name}
                    </div>
                    <div className="text-[11px] text-muted">
                      {currentSelectedStudent.className || 'Sınıf Belirtilmedi'} • No: #
                      {currentSelectedStudent.studentNumber || '-'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1">
                  <label className="block text-xs font-bold text-fg mb-1">
                    Hedef Verilecek Öğrenciyi Seçiniz:
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-orange-300 dark:border-orange-500/30 rounded-xl text-xs font-bold text-fg focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-2xs"
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

          {/* 2. TARİH SEÇİMİ BÖLÜMÜ (BAŞLANGIÇ VE BİTİŞ TARİHLERİ) */}
          <div className="p-4 bg-surface-2 border border-line rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <label className="text-xs font-bold text-fg flex items-center space-x-1.5">
                <CalendarDays className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                <span>Hedef Tarih Seçimi:</span>
              </label>
              <span className="text-[11px] font-bold text-orange-700 dark:text-orange-300 bg-orange-100/70 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/30 px-2 py-0.5 rounded-md">
                {targetDays} Günlük Süre
              </span>
            </div>

            {/* Başlangıç ve Bitiş Tarihleri */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-fg-2 mb-1">
                  Başlangıç Tarihi:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-line-strong rounded-xl text-xs font-bold text-fg focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-fg-2 mb-1">
                  Bitiş Tarihi:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  min={startDate}
                  className="w-full px-3 py-2 bg-surface border border-line-strong rounded-xl text-xs font-bold text-fg focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* 3. GÜNLÜK VE TOPLAM SORU HEDEFİ GİRİŞİ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Günlük Hedef */}
            <div className="p-4 bg-orange-50/70 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl space-y-2 shadow-2xs">
              <label className="block text-[11px] font-bold text-fg">
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
                  className="w-full px-3 py-2 text-base font-black text-orange-700 dark:text-orange-300 bg-surface border border-orange-300 dark:border-orange-500/30 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-2xs"
                />
                <span className="text-xs font-bold text-muted whitespace-nowrap">
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
                className="w-full accent-orange-500 cursor-pointer h-1.5 bg-surface-3 rounded-lg"
              />
            </div>

            {/* Toplam Soru Hedefi (Seçilen Gün Sayısına Göre) */}
            <div className="p-4 bg-surface-2 border border-line rounded-xl space-y-2 shadow-2xs">
              <label className="block text-[11px] font-bold text-fg">
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
                  className="w-full px-3 py-2 text-base font-black text-fg bg-surface border border-line-strong rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-2xs"
                />
                <span className="text-xs font-bold text-muted whitespace-nowrap">
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
                className="w-full accent-orange-500 cursor-pointer h-1.5 bg-surface-3 rounded-lg"
              />
            </div>
          </div>

          {/* Hızlı Toplam Hedef Presetleri */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-muted mr-1">Hızlı Soru Hedefi:</span>
            {[140, 210, 350, 500, 700, 1000, 1500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleTotalTargetChange(preset)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  targetCount === preset
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-surface text-fg-2 hover:bg-surface-2 border border-line'
                }`}
              >
                {preset} Soru
              </button>
            ))}
          </div>

          {/* 4. DERS BAZLI HEDEFLER (İsteğe Bağlı) */}
          <div className="p-4 bg-surface-2 border border-line rounded-xl space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fg flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
                <span>Ders Bazlı Branş Hedefleri (İsteğe Bağlı)</span>
              </span>
              <span className="text-[10px] text-muted">Özel ders hedefleri ekle</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedSubjectToAdd}
                onChange={(e) => setSelectedSubjectToAdd(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-surface border border-line-strong rounded-lg text-xs font-semibold text-fg"
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
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                + Ders Ekle
              </button>
            </div>

            {Object.keys(subjectTargets).length > 0 && (
              <div className="space-y-2 pt-1">
                {Object.entries(subjectTargets).map(([sub, count]) => (
                  <div
                    key={sub}
                    className="flex items-center justify-between p-2 bg-surface border border-line rounded-lg text-xs shadow-2xs"
                  >
                    <span className="font-bold text-fg">{sub}</span>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        step="10"
                        value={count}
                        onChange={(e) => handleSubjectTargetChange(sub, Number(e.target.value))}
                        className="w-16 px-2 py-1 text-center bg-surface-2 border border-line-strong rounded text-xs font-bold text-fg"
                      />
                      <span className="text-[11px] text-muted">Soru</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubjectTarget(sub)}
                        className="text-subtle hover:text-rose-600 dark:hover:text-rose-300 p-1"
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
            <label className="block text-xs font-bold text-fg-2 mb-1">
              Öğrencilere / Sınıfa Motivasyon Notu (İsteğe Bağlı)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Bu dönem özellikle yeni nesil sorulara odaklanalım ve günlük hedefleri aksatmayalım. Başarılar!"
              className="w-full px-3 py-2 bg-surface-2 hover:bg-surface-2/50 border border-line rounded-xl text-fg text-xs placeholder-subtle focus:bg-surface focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-line bg-surface-2 shrink-0">
          <div>
            {existingTarget && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-rose-600 dark:text-rose-300 hover:text-rose-800 dark:hover:text-rose-200 font-bold flex items-center space-x-1 cursor-pointer"
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
              className="px-4 py-2 bg-surface-3 hover:bg-surface-3 text-fg-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/25 cursor-pointer"
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
