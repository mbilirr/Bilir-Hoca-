import React, { useState, useMemo } from 'react';
import {
  X,
  Target,
  User,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  Sparkles,
  Plus,
  Flame,
  Award,
  AlertTriangle,
} from 'lucide-react';
import { Student, ClassGroup, WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { formatClassDisplayName } from '../../constants/schoolConstants';

interface StudentTargetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  classes: ClassGroup[];
  allLogs: StudentQuestionLog[];
  onOpenTargetModalForStudent: (student: Student, existingTarget?: WeeklyQuestionTarget | null) => void;
  onSelectStudentToAnalyze: (studentId: string) => void;
}

export const StudentTargetsModal: React.FC<StudentTargetsModalProps> = ({
  isOpen,
  onClose,
  students,
  classes,
  allLogs,
  onOpenTargetModalForStudent,
  onSelectStudentToAnalyze,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  const targets = useMemo(() => {
    return dataService.getStudentQuestionTargets();
  }, [isOpen, students]);

  // Öğrenci bazlı soru çözüm ilerlemelerini hesapla
  const studentTargetStats = useMemo(() => {
    return targets.map((target) => {
      const student = students.find((s) => s.id === target.studentId);
      const studentName = student?.name || target.studentName || 'İsimsiz Öğrenci';
      const studentClass =
        student?.className ||
        target.className ||
        (student?.classId ? classes.find((c) => c.id === student.classId)?.name : '') ||
        'Sınıfsız';

      // Öğrencinin loglarını topla
      const sLogs = allLogs.filter((l) => l.studentId === target.studentId);
      let solvedQuestions = 0;

      if (target.weekStartDate && target.weekEndDate) {
        sLogs.forEach((l) => {
          if (l.date >= target.weekStartDate! && l.date <= target.weekEndDate!) {
            solvedQuestions += l.totalQuestions || 0;
          }
        });
      } else {
        // Son 7 günün veya hedefin gün sayısı kadar
        const days = target.targetDays || 7;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        sLogs.forEach((l) => {
          if (l.date >= cutoffStr) {
            solvedQuestions += l.totalQuestions || 0;
          }
        });
      }

      const targetTotal = target.targetQuestions || target.weeklyTarget || 350;
      const progressPercent = Math.min(100, Math.round((solvedQuestions / Math.max(1, targetTotal)) * 100));
      const isCompleted = solvedQuestions >= targetTotal;
      const remaining = Math.max(0, targetTotal - solvedQuestions);

      return {
        target,
        student,
        studentName,
        studentClass,
        targetTotal,
        dailyTarget: target.dailyTarget || Math.round(targetTotal / (target.targetDays || 7)),
        targetDays: target.targetDays || 7,
        targetPeriodLabel: target.targetPeriodLabel || (target.targetDays === 7 ? 'Haftalık (7 Gün)' : `${target.targetDays || 7} Günlük`),
        solvedQuestions,
        progressPercent,
        isCompleted,
        remaining,
      };
    });
  }, [targets, students, classes, allLogs]);

  // Filtrelenmiş liste
  const filteredList = useMemo(() => {
    return studentTargetStats.filter((item) => {
      if (selectedClassFilter !== 'all') {
        if (item.student?.classId !== selectedClassFilter && item.target.classId !== selectedClassFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.studentName.toLowerCase().includes(q);
        const matchesClass = item.studentClass.toLowerCase().includes(q);
        return matchesName || matchesClass;
      }
      return true;
    });
  }, [studentTargetStats, selectedClassFilter, searchQuery]);

  if (!isOpen) return null;

  const handleDeleteTarget = async (studentId: string, weekStartDate?: string) => {
    if (confirm('Bu öğrenci için belirlenmiş soru hedefini silmek istediğinize emin misiniz?')) {
      try {
        await dataService.deleteWeeklyQuestionTarget(studentId, weekStartDate);
      } catch {
        // hata uyarısı gösterildi, hedef geri getirildi
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Öğrenci Soru Hedefleri</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-extrabold dark:bg-orange-950/60 dark:text-orange-300">
                  {targets.length} Öğrenci
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Öğrencilere tanımlanmış soru sayısı hedefleri ve anlık çözüm ilerleme durumu
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

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
          <div className="flex-1 flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Öğrenci adı veya sınıf ara..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-white focus:outline-none cursor-pointer"
            >
              <option value="all">Tüm Sınıflar</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatClassDisplayName(c.name, c.branch, c.gradeLevel)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTargetModalForStudent(students[0] || ({} as Student), null);
            }}
            className="w-full sm:w-auto px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Hedef Belirle</span>
          </button>
        </div>

        {/* List Content */}
        <div className="p-6 overflow-y-auto space-y-3">
          {filteredList.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-50 dark:bg-orange-950/30 text-orange-400 flex items-center justify-center mb-3">
                <Target className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Kayıtlı Öğrenci Hedefi Bulunamadı
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Henüz öğrenci bazlı bir soru hedefi tanımlanmamış veya arama kriterlerine uygun kayıt bulunmuyor.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.target.id || item.target.studentId}
                className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-orange-300 dark:hover:border-orange-500/50 transition-all"
              >
                {/* Student Info */}
                <div className="flex items-center space-x-3 min-w-0">
                  <img
                    src={
                      item.student?.avatar ||
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                        item.studentName
                      )}`
                    }
                    alt={item.studentName}
                    className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 ring-2 ring-orange-200 dark:ring-orange-500/30"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {item.studentName}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {item.studentClass}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {item.targetPeriodLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>
                        Hedef: <strong className="text-orange-600 dark:text-orange-400 font-bold">{item.targetTotal} Soru</strong>
                      </span>
                      <span>•</span>
                      <span>Günlük: <strong>{item.dailyTarget} Soru/Gün</strong></span>
                    </div>
                  </div>
                </div>

                {/* Progress & Actions */}
                <div className="flex items-center gap-4 sm:shrink-0 justify-between sm:justify-end">
                  {/* Progress Bar & Stat */}
                  <div className="w-36 text-right">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-500 font-medium">Çözülen:</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">
                        {item.solvedQuestions} / {item.targetTotal}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.progressPercent >= 100
                            ? 'bg-emerald-500'
                            : item.progressPercent >= 60
                            ? 'bg-orange-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-extrabold text-right mt-0.5 text-orange-600 dark:text-orange-400">
                      %{item.progressPercent} Tamamlandı
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectStudentToAnalyze(item.target.studentId || item.student?.id || '');
                      }}
                      className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl transition-colors cursor-pointer"
                      title="Bu öğrencinin detaylı soru grafiğine git"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTargetModalForStudent(item.student || ({} as Student), item.target);
                      }}
                      className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                      title="Hedefi Düzenle"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTarget(item.target.studentId || '', item.target.weekStartDate)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                      title="Hedefi Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
