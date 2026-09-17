import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  Save,
  Sparkles,
  BookOpen,
  Calendar,
  User,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student, WeeklyQuestionTarget } from '../../types';
import { dataService } from '../../services/dataService';

interface WeeklyTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  weekStartDate: string;
  weekEndDate: string;
  existingTarget?: WeeklyQuestionTarget | null;
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
  weekStartDate,
  weekEndDate,
  existingTarget,
}) => {
  const [targetCount, setTargetCount] = useState<number>(() => {
    return existingTarget?.targetQuestions || existingTarget?.weeklyTarget || 350;
  });

  const [dailyTargetCount, setDailyTargetCount] = useState<number>(() => {
    if (existingTarget?.dailyTarget) return existingTarget.dailyTarget;
    const weekly = existingTarget?.targetQuestions || existingTarget?.weeklyTarget || 350;
    return Math.round(weekly / 7);
  });

  const [notes, setNotes] = useState<string>(() => {
    return existingTarget?.notes || '';
  });

  const [subjectTargets, setSubjectTargets] = useState<Record<string, number>>(() => {
    return normalizeSubjectTargets(existingTarget?.subjectTargets);
  });

  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState<string>(COMMON_SUBJECTS[0]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (existingTarget) {
      const wTarget = existingTarget.targetQuestions || existingTarget.weeklyTarget || 350;
      setTargetCount(wTarget);
      setDailyTargetCount(existingTarget.dailyTarget || Math.round(wTarget / 7));
      setNotes(existingTarget.notes || '');
      setSubjectTargets(normalizeSubjectTargets(existingTarget.subjectTargets));
    } else {
      setTargetCount(350);
      setDailyTargetCount(50);
      setNotes('');
      setSubjectTargets({});
    }
  }, [existingTarget, student.id, weekStartDate]);

  const handleDailyTargetChange = (val: number) => {
    const cleanDaily = Math.max(5, val);
    setDailyTargetCount(cleanDaily);
    setTargetCount(cleanDaily * 7);
  };

  const handleWeeklyTargetChange = (val: number) => {
    const cleanWeekly = Math.max(35, val);
    setTargetCount(cleanWeekly);
    setDailyTargetCount(Math.round(cleanWeekly / 7));
  };

  if (!isOpen) return null;

  const handleAddSubjectTarget = () => {
    if (!subjectTargets[selectedSubjectToAdd]) {
      setSubjectTargets((prev) => ({
        ...prev,
        [selectedSubjectToAdd]: 50,
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

  const handleSave = () => {
    dataService.setWeeklyQuestionTarget({
      studentId: student.id,
      studentName: student.name,
      weekStartDate,
      weekEndDate,
      targetQuestions: targetCount,
      weeklyTarget: targetCount,
      dailyTarget: dailyTargetCount,
      subjectTargets: Object.keys(subjectTargets).length > 0 ? subjectTargets : undefined,
      notes: notes.trim() || undefined,
      assignedBy: 'Öğretmen',
      assignedDate: new Date().toISOString(),
    });

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleDelete = () => {
    dataService.deleteWeeklyQuestionTarget(student.id, weekStartDate);
    onClose();
  };

  const dailyAvg = Math.round(targetCount / 7);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Haftalık Soru Sayısı Hedefi Belirle</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1.5 mt-0.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{student.name}</span>
                <span>•</span>
                <span>{weekStartDate} - {weekEndDate}</span>
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
          {/* Öğrenci Bilgi Kartı */}
          <div className="flex items-center space-x-3 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/30 rounded-xl">
            <img
              src={
                student.avatar ||
                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`
              }
              alt={student.name}
              className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{student.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {student.className || 'Sınıf Belirtilmedi'} • No: #{student.studentNumber || '-'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase">Günlük Hedef</div>
              <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">{dailyTargetCount} Soru/Gün</div>
            </div>
          </div>

          {/* Günlük Soru Sayısı Hedefi Belirleme */}
          <div className="p-4 bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-500/30 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Target className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Günlük Soru Sayısı Hedefi Belirleme:</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="5"
                  max="500"
                  value={dailyTargetCount}
                  onChange={(e) => handleDailyTargetChange(Number(e.target.value) || 0)}
                  className="w-20 px-2.5 py-1 text-sm font-black text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800 border border-orange-300 dark:border-orange-500/50 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Soru/Gün</span>
              </div>
            </div>

            <input
              type="range"
              min="10"
              max="250"
              step="5"
              value={dailyTargetCount}
              onChange={(e) => handleDailyTargetChange(Number(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />

            {/* Hızlı Günlük Hedef Seçimi */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {[20, 30, 40, 50, 75, 100, 150].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleDailyTargetChange(preset)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    dailyTargetCount === preset
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-orange-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset} Soru/Gün
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              * Günlük hedef belirlendiğinde 7 günlük haftalık toplam soru hedefi otomatik olarak güncellenir.
            </p>
          </div>

          {/* Haftalık Toplam Hedef Girişi */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-orange-500" />
                <span>Haftalık Toplam Soru Hedefi:</span>
              </span>
              <span className="text-orange-600 dark:text-orange-400 font-mono font-extrabold text-sm">
                {targetCount} Soru (7 Günlük)
              </span>
            </label>

            <div className="space-y-3">
              <input
                type="range"
                min="50"
                max="2000"
                step="25"
                value={targetCount}
                onChange={(e) => handleWeeklyTargetChange(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
              />

              {/* Hızlı Seçim Butonları */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[140, 210, 350, 500, 700, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleWeeklyTargetChange(preset)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      targetCount === preset
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset} Soru
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* İsteğe Bağlı: Ders Bazlı Hedefler */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>Ders Bazlı Hedefler (İsteğe Bağlı)</span>
              </span>
              <span className="text-[10px] text-slate-500">Öğrenciye özel branş hedefleri</span>
            </div>

            {/* Ders Ekleme Satırı */}
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

            {/* Eklenmiş Ders Hedefleri Listesi */}
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

          {/* Öğretmen Notu / Tavsiyesi */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Öğrenciye Not veya Motivasyon Mesajı (İsteğe Bağlı)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Bu hafta özellikle Matematik yeni nesil sorulara ve Paragraf çözümlerine odaklanalım. Başarılar!"
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
              <span>{savedSuccess ? 'Kaydedildi!' : 'Hedefi Kaydet ve İlet'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
