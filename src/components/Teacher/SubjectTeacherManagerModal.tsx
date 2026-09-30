import React, { useState, useEffect } from 'react';
import { X, Users, Plus, Trash2, BookOpen, Check, Sparkles } from 'lucide-react';
import { dataService } from '../../services/dataService';

interface SubjectTeacherManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: string;
  onUpdate?: () => void;
}

const COMMON_SUBJECTS = [
  'Fen Bilimleri',
  'Matematik',
  'Türkçe',
  'Sosyal Bilgiler',
  'T.C. İnkılap Tarihi',
  'İngilizce',
  'Din Kültürü',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Geometri',
];

export const SubjectTeacherManagerModal: React.FC<SubjectTeacherManagerModalProps> = ({
  isOpen,
  onClose,
  initialSubject,
  onUpdate,
}) => {
  const [subjectMap, setSubjectMap] = useState<Record<string, string[]>>({});
  const [selectedSubject, setSelectedSubject] = useState<string>(
    initialSubject || 'Fen Bilimleri'
  );
  const [newTeacherName, setNewTeacherName] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = () => {
    const map = dataService.getSubjectTeachersMap();
    setSubjectMap(map);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialSubject) {
        setSelectedSubject(initialSubject);
      }
    }
  }, [isOpen, initialSubject]);

  if (!isOpen) return null;

  const currentTeachers = subjectMap[selectedSubject] || [];

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTeacherName.trim();
    if (!name) return;

    dataService.addTeacherToSubject(selectedSubject, name);
    dataService.setLastTeacherForSubject(selectedSubject, name);
    setNewTeacherName('');
    loadData();
    if (onUpdate) onUpdate();
    setSuccessMsg(`"${name}" kaydedildi ve varsayılan öğretmen olarak atandı`);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const handleRemoveTeacher = (teacherName: string) => {
    dataService.removeTeacherFromSubject(selectedSubject, teacherName);
    loadData();
    if (onUpdate) onUpdate();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Açılır Menü Öğretmen Listesi Yönetimi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ders bazlı etüt açılır butonuna öğretmen atayın ve silin
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Ders Seçici */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <span>Düzenlenecek Dersi Seçin:</span>
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {COMMON_SUBJECTS.map((subj) => (
                <option key={subj} value={subj}>
                  {subj} ({subjectMap[subj]?.length || 0} Öğretmen)
                </option>
              ))}
            </select>
          </div>

          {/* Yeni Öğretmen Ekleme Formu */}
          <form onSubmit={handleAddTeacher} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              {selectedSubject} Dersi Açılır Butonuna Yeni Öğretmen Ata:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
                placeholder="Örn: Mustafa Bilir"
                className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newTeacherName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Listeye Ata</span>
              </button>
            </div>
            {successMsg && (
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" />
                <span>{successMsg}</span>
              </p>
            )}
          </form>

          {/* Mevcut Öğretmen Listesi */}
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                {selectedSubject} Açılır Buton Seçenekleri:
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">
                {currentTeachers.length} Öğretmen
              </span>
            </div>

            {/* Sabit İlk Seçenek */}
            <div className="mb-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold italic">1. Seçenek: &quot;Öğretmen&quot; (Varsayılan Açılır Seçenek)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-bold">Sabit</span>
            </div>

            {currentTeachers.length > 0 ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {currentTeachers.map((teacher, idx) => (
                  <div
                    key={`${teacher}-${idx}`}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 group hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {teacher}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveTeacher(teacher)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Bu öğretmeni listeden sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/30 text-center text-xs text-amber-800 dark:text-amber-400">
                Bu derse atanmış öğretmen bulunamadı. Yukarıdan yeni öğretmen ekleyebilirsiniz.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Kapat ve Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};
