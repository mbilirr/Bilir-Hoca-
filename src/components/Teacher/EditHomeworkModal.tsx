import React, { useState, useMemo } from 'react';
import { X, Edit3, Save, Calendar, FileText, Users, School, AlertCircle, Loader2 } from 'lucide-react';
import { Homework, Student, ClassGroup, HomeworkResource } from '../../types';
import { dataService } from '../../services/dataService';
import { HomeworkResourceUploader } from './HomeworkResourceUploader';
import { removeStoredFiles, storedPathsOf } from '../../lib/fileStorage';

interface EditHomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  homework: Homework | null;
  students: Student[];
  classes: ClassGroup[];
  onSuccess?: () => void;
}

const SCHOOL_SUBJECTS: Record<'Ortaokul' | 'Lise', string[]> = {
  Ortaokul: ['Matematik', 'Türkçe', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İngilizce'],
  Lise: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Coğrafya', 'Tarih', 'Edebiyat'],
};

// ISO / yerel tarih metnini datetime-local kutusunun biçimine çevirir
const formatForDateTimeInput = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
};

// Pencere kapalıyken hiçbir kanca çalışmaz; her açılışta form ödevin güncel hâliyle bir kez doldurulur
// ve arka planda gelen eşitlemeler yazılanları SİLMEZ.
export const EditHomeworkModal: React.FC<EditHomeworkModalProps> = (props) =>
  props.isOpen && props.homework ? (
    <EditHomeworkModalContent key={props.homework.id} {...props} homework={props.homework} />
  ) : null;

const EditHomeworkModalContent: React.FC<EditHomeworkModalProps & { homework: Homework }> = ({
  onClose,
  homework,
  students,
  classes,
  onSuccess,
}) => {
  const initialSubject = homework.subject || 'Matematik';
  const initialLevel: 'Ortaokul' | 'Lise' =
    homework.schoolLevel || (SCHOOL_SUBJECTS.Lise.includes(initialSubject) && !SCHOOL_SUBJECTS.Ortaokul.includes(initialSubject) ? 'Lise' : 'Ortaokul');

  const [title, setTitle] = useState(homework.title || '');
  const [schoolLevel, setSchoolLevel] = useState<'Ortaokul' | 'Lise'>(initialLevel);
  const [subject, setSubject] = useState(initialSubject);
  const [description, setDescription] = useState(homework.description || '');
  const [dueDate, setDueDate] = useState(formatForDateTimeInput(homework.dueDate));
  const [targetClassIds, setTargetClassIds] = useState<string[]>(() => {
    if (homework.targetClassIds && homework.targetClassIds.length > 0) return homework.targetClassIds;
    if (homework.classId && homework.classId !== 'class-default') return [homework.classId];
    return [];
  });
  const [assigneeMode, setAssigneeMode] = useState<'class' | 'custom'>(
    Array.isArray(homework.assignedTo) && homework.assignedTo.length > 0 ? 'custom' : 'class'
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    Array.isArray(homework.assignedTo) ? homework.assignedTo : []
  );
  const [resources, setResources] = useState<HomeworkResource[]>(homework.resources || []);
  const [pendingResource, setPendingResource] = useState<HomeworkResource | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadBusy, setIsUploadBusy] = useState(false);

  // Kaydetmeden kapatılırsa bu pencerede yüklenen (ödevde kayıtlı olmayan) dosyalar depodan silinir
  const handleCancel = () => {
    if (isSaving) return;
    const saved = new Set(storedPathsOf(homework.resources));
    const unsaved = storedPathsOf(resources).filter((p) => !saved.has(p));
    if (unsaved.length > 0) removeStoredFiles(unsaved);
    onClose();
  };
  const [errorText, setErrorText] = useState<string | null>(null);

  // Öğretmenin göremediği (yetkisi olmayan) eski hedef sınıflar da listede görünsün ki kaybolmasın
  const classOptions = useMemo(() => {
    const known = new Set(classes.map((c) => c.id));
    const extra = targetClassIds
      .filter((id) => !known.has(id))
      .map((id) => ({ id, name: `${id} (erişiminiz yok)` } as ClassGroup));
    return [...classes, ...extra];
  }, [classes, targetClassIds]);

  const studentsInTargets = useMemo(
    () => students.filter((s) => targetClassIds.includes(s.classId)),
    [students, targetClassIds]
  );

  const handleSchoolLevelChange = (level: 'Ortaokul' | 'Lise') => {
    setSchoolLevel(level);
    if (!SCHOOL_SUBJECTS[level].includes(subject)) setSubject(SCHOOL_SUBJECTS[level][0]);
  };

  const toggleClass = (classId: string) => {
    setTargetClassIds((prev) => (prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]));
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleAllInClass = (classId: string) => {
    const ids = students.filter((s) => s.classId === classId).map((s) => s.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedStudentIds.includes(id));
    setSelectedStudentIds((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setErrorText(null);
    if (!title.trim() || !dueDate) {
      setErrorText('Başlık ve son teslim tarihi zorunludur.');
      return;
    }
    if (targetClassIds.length === 0) {
      setErrorText('En az bir sınıf seçmelisiniz.');
      return;
    }
    const targetStudentIds =
      assigneeMode === 'custom'
        ? selectedStudentIds.filter((id) => studentsInTargets.some((s) => s.id === id))
        : [];
    if (assigneeMode === 'custom' && targetStudentIds.length === 0) {
      setErrorText('"Yalnızca seçtiğim öğrenciler" seçiliyken en az bir öğrenci işaretlemelisiniz.');
      return;
    }

    const finalResources = pendingResource
      ? [...resources, { ...pendingResource, id: `res-${Date.now()}` }]
      : resources;

    const updates: Partial<Homework> = {
      title: title.trim(),
      subject,
      schoolLevel,
      description: description.trim(),
      dueDate: new Date(dueDate).toISOString(),
      targetClassIds,
      assignedTo: targetStudentIds.length > 0 ? targetStudentIds : 'all',
      resources: finalResources,
    };

    setIsSaving(true);
    try {
      await dataService.updateHomework(homework.id, updates);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorText(err?.message || 'Ödev kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Başlık */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Ödevi Düzenle</h3>
                <p className="text-xs text-slate-500 truncate max-w-md">{homework.title}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Okul *</label>
                  <select
                    value={schoolLevel}
                    onChange={(e) => handleSchoolLevelChange(e.target.value as 'Ortaokul' | 'Lise')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="Ortaokul">🏫 Ortaokul</option>
                    <option value="Lise">🎓 Lise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ders *</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    {Array.from(new Set([...SCHOOL_SUBJECTS[schoolLevel], subject])).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Ödev Başlığı *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ödev başlığını giriniz"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-slate-400 shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Son Teslim Tarihi ve Saati *</span>
              </label>
              <input
                type="datetime-local"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Ödev Açıklaması</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ödev ile ilgili açıklama, sayfa numaraları veya soru aralıkları..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-slate-400 shadow-2xs resize-y"
              />
            </div>

            {/* Hedef: sınıflar + (isteğe bağlı) öğrenciler */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <School className="w-4 h-4 text-indigo-600" />
                <span>Hedef Sınıflar * ({targetClassIds.length} seçili)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {classOptions.map((cls) => {
                  const on = targetClassIds.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.id)}
                      aria-pressed={on}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        on
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cls.name}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                <label className="flex items-start space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="edit-assignee-mode"
                    checked={assigneeMode === 'class'}
                    onChange={() => setAssigneeMode('class')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    <strong className="text-slate-900">Seçili sınıfların tüm öğrencileri</strong> (sınıfa sonradan
                    katılan öğrenciler de görür)
                  </span>
                </label>
                <label className="flex items-start space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="edit-assignee-mode"
                    checked={assigneeMode === 'custom'}
                    onChange={() => setAssigneeMode('custom')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    <strong className="text-slate-900">Yalnızca seçtiğim öğrenciler</strong>
                  </span>
                </label>
              </div>

              {assigneeMode === 'custom' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <span>
                        Öğrenci Seçimi (
                        {selectedStudentIds.filter((id) => studentsInTargets.some((s) => s.id === id)).length} /{' '}
                        {studentsInTargets.length})
                      </span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {classes
                        .filter((c) => targetClassIds.includes(c.id))
                        .map((cls) => (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => toggleAllInClass(cls.id)}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold cursor-pointer"
                          >
                            {cls.name}: tümü
                          </button>
                        ))}
                    </div>
                  </div>
                  {studentsInTargets.length === 0 ? (
                    <div className="py-3 text-center text-xs text-slate-500">Seçili sınıflarda öğrenci bulunamadı.</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      {studentsInTargets.map((std) => {
                        const checked = selectedStudentIds.includes(std.id);
                        return (
                          <label
                            key={std.id}
                            className={`flex items-center space-x-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-semibold'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleStudent(std.id)}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            />
                            <span className="truncate flex-1">{std.name}</span>
                            <span className="text-[10px] text-slate-500">({std.className})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Materyaller: oluştururken kullanılan bölümün aynısı */}
            <HomeworkResourceUploader
              resources={resources}
              onChange={setResources}
              onPendingChange={setPendingResource}
              storageFolder={`odev/${homework.id}`}
              onBusyChange={setIsUploadBusy}
            />
            {pendingResource && (
              <p className="text-[11px] text-indigo-700 -mt-2">
                Yazdığınız bağlantı ("{pendingResource.title}") kaydederken otomatik olarak eklenecek.
              </p>
            )}

            {errorText && (
              <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorText}</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={isSaving || isUploadBusy}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 cursor-pointer transition-all disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSaving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
