import React, { useState, useMemo } from 'react';
import {
  X,
  Target,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  Sparkles,
  Plus,
  BarChart3,
  GraduationCap,
} from 'lucide-react';
import { Student, ClassGroup, WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { formatClassDisplayName } from '../../constants/schoolConstants';

interface ClassTargetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  students: Student[];
  allLogs: StudentQuestionLog[];
  onOpenTargetModalForClass: (cls: ClassGroup, existingTarget?: WeeklyQuestionTarget | null) => void;
  onSelectClassToAnalyze: (classId: string) => void;
}

export const ClassTargetsModal: React.FC<ClassTargetsModalProps> = ({
  isOpen,
  onClose,
  classes,
  students,
  allLogs,
  onOpenTargetModalForClass,
  onSelectClassToAnalyze,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const classTargets = useMemo(() => {
    return dataService.getClassQuestionTargets();
  }, [isOpen, classes]);

  // Sınıf bazlı genel istatistikleri ve ilerlemeleri hesapla
  const classTargetStats = useMemo(() => {
    return classTargets.map((target) => {
      const cls = classes.find((c) => c.id === target.classId);
      const className =
        cls?.name ||
        target.className ||
        (cls ? formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel) : 'İsimsiz Sınıf');

      const enrolledStudents = students.filter((s) => s.classId === target.classId);
      const studentCount = enrolledStudents.length;
      const enrolledStudentIds = new Set(enrolledStudents.map((s) => s.id));

      // Sınıfın logları
      const classLogs = allLogs.filter((l) => {
        if (l.classId === target.classId) return true;
        if (l.studentId && enrolledStudentIds.has(l.studentId)) return true;
        return false;
      });

      let totalSolvedQuestions = 0;
      if (target.weekStartDate && target.weekEndDate) {
        classLogs.forEach((l) => {
          if (l.date >= target.weekStartDate! && l.date <= target.weekEndDate!) {
            totalSolvedQuestions += l.totalQuestions || 0;
          }
        });
      } else {
        const days = target.targetDays || 7;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        classLogs.forEach((l) => {
          if (l.date >= cutoffStr) {
            totalSolvedQuestions += l.totalQuestions || 0;
          }
        });
      }

      const perStudentTarget = target.targetQuestions || target.weeklyTarget || 350;
      const classGrandTarget = perStudentTarget * Math.max(1, studentCount);
      const progressPercent = Math.min(
        100,
        Math.round((totalSolvedQuestions / Math.max(1, classGrandTarget)) * 100)
      );

      return {
        target,
        cls,
        className,
        studentCount,
        perStudentTarget,
        dailyTarget: target.dailyTarget || Math.round(perStudentTarget / (target.targetDays || 7)),
        targetDays: target.targetDays || 7,
        targetPeriodLabel:
          target.targetPeriodLabel ||
          (target.targetDays === 7 ? 'Haftalık (7 Gün)' : `${target.targetDays || 7} Günlük`),
        classGrandTarget,
        totalSolvedQuestions,
        progressPercent,
      };
    });
  }, [classTargets, classes, students, allLogs]);

  // Filtrelenmiş liste
  const filteredList = useMemo(() => {
    return classTargetStats.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return item.className.toLowerCase().includes(q);
      }
      return true;
    });
  }, [classTargetStats, searchQuery]);

  if (!isOpen) return null;

  const handleDeleteClassTarget = async (classId?: string, weekStartDate?: string) => {
    if (!classId) return;
    if (confirm('Bu sınıf için belirlenmiş toplu soru hedefini silmek istediğinize emin misiniz?')) {
      await dataService.deleteClassQuestionTarget(classId, weekStartDate);
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
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Sınıf Soru Hedefleri</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-extrabold dark:bg-indigo-950/60 dark:text-indigo-300">
                  {classTargets.length} Sınıf
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sınıflara toplu olarak atanmış soru hedefleri ve sınıfların genel ortalama başarı durumu
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

        {/* Filter & Add Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sınıf adı ara (Örn: 8/A, 11/B)..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTargetModalForClass(classes[0] || ({} as ClassGroup), null);
            }}
            className="w-full sm:w-auto px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Sınıfa Toplu Hedef Ver</span>
          </button>
        </div>

        {/* List Content */}
        <div className="p-6 overflow-y-auto space-y-3">
          {filteredList.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-400 flex items-center justify-center mb-3">
                <Users className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Kayıtlı Sınıf Hedefi Bulunamadı
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Henüz herhangi bir sınıfa toplu soru hedefi atanmamış. 'Sınıfa Toplu Hedef Ver' butonu ile hızlıca hedef belirleyebilirsiniz.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.target.id || item.target.classId}
                className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all"
              >
                {/* Class Info */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-sm shrink-0">
                    {item.className}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {item.className} Sınıfı
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {item.studentCount} Kayıtlı Öğrenci
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {item.targetPeriodLabel}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>
                        Öğrenci Başı: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{item.perStudentTarget} Soru</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Sınıf Toplam Hedef: <strong>{item.classGrandTarget.toLocaleString('tr-TR')} Soru</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress & Actions */}
                <div className="flex items-center gap-4 sm:shrink-0 justify-between sm:justify-end">
                  {/* Progress Bar & Stat */}
                  <div className="w-36 text-right">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-500 font-medium">Sınıf Toplam:</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">
                        {item.totalSolvedQuestions.toLocaleString('tr-TR')}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.progressPercent >= 100
                            ? 'bg-emerald-500'
                            : item.progressPercent >= 60
                            ? 'bg-indigo-600'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-extrabold text-right mt-0.5 text-indigo-600 dark:text-indigo-400">
                      %{item.progressPercent} Sınıf Başarısı
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectClassToAnalyze(item.target.classId || item.cls?.id || '');
                      }}
                      className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-xl transition-colors cursor-pointer"
                      title="Bu sınıfın soru analitiğine git"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenTargetModalForClass(item.cls || ({} as ClassGroup), item.target);
                      }}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                      title="Sınıf Hedefini Düzenle"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClassTarget(item.target.classId, item.target.weekStartDate)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                      title="Sınıf Hedefini Kaldır"
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
