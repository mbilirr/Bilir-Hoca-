import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Save,
  Calendar,
  BookOpen,
  Target,
  FileText,
  Users,
  Paperclip,
  Plus,
  Trash2,
  Video,
  Link2,
  FileDown,
} from 'lucide-react';
import { Homework, Student, ClassGroup, HomeworkResource, HomeworkResourceType } from '../../types';
import { dataService } from '../../services/dataService';

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

export const EditHomeworkModal: React.FC<EditHomeworkModalProps> = ({
  isOpen,
  onClose,
  homework,
  students,
  classes,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [schoolLevel, setSchoolLevel] = useState<'Ortaokul' | 'Lise'>('Ortaokul');
  const [subject, setSubject] = useState('Matematik');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeMode, setAssigneeMode] = useState<'all' | 'custom'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
  const [isGlobalForNewStudents, setIsGlobalForNewStudents] = useState(true);
  const [resources, setResources] = useState<HomeworkResource[]>([]);

  // New resource inline state
  const [resType, setResType] = useState<HomeworkResourceType>('link');
  const [resTitle, setResTitle] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [showAddResource, setShowAddResource] = useState(false);

  // Helper to format ISO to datetime-local
  const formatForDateTimeInput = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (homework) {
      setTitle(homework.title || '');
      const hwSchool = homework.schoolLevel || 'Ortaokul';
      setSchoolLevel(hwSchool);
      setSubject(homework.subject || 'Matematik');
      setDescription(homework.description || '');
      setDueDate(formatForDateTimeInput(homework.dueDate));
      if (homework.assignedTo === 'all') {
        setAssigneeMode('all');
        setSelectedStudentIds([]);
      } else {
        setAssigneeMode('custom');
        setSelectedStudentIds(Array.isArray(homework.assignedTo) ? homework.assignedTo : []);
      }
      setTargetClassIds(homework.targetClassIds || classes.map((c) => c.id));
      setIsGlobalForNewStudents(homework.isGlobalForNewStudents ?? true);
      setResources(homework.resources || []);
      setShowAddResource(false);
      setResTitle('');
      setResUrl('');
    }
  }, [homework, classes]);

  if (!isOpen || !homework) return null;

  const handleSchoolLevelChange = (level: 'Ortaokul' | 'Lise') => {
    setSchoolLevel(level);
    const subjects = SCHOOL_SUBJECTS[level];
    if (!subjects.includes(subject)) {
      setSubject(subjects[0]);
    }
  };

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleSelectAllInClass = (classId: string) => {
    const classStudentIds = students.filter((s) => s.classId === classId).map((s) => s.id);
    const allSelected = classStudentIds.every((id) => selectedStudentIds.includes(id));

    if (allSelected) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => !classStudentIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedStudentIds, ...classStudentIds]));
      setSelectedStudentIds(merged);
    }
  };

  const handleAddResource = () => {
    if (!resTitle.trim() || !resUrl.trim()) return;

    const newRes: HomeworkResource = {
      id: `res-${Date.now()}`,
      type: resType,
      title: resTitle.trim(),
      url: resUrl.trim(),
    };

    setResources([...resources, newRes]);
    setResTitle('');
    setResUrl('');
    setShowAddResource(false);
  };

  const handleRemoveResource = (id: string) => {
    setResources(resources.filter((r) => r.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    const updates: Partial<Homework> = {
      title: title.trim(),
      subject,
      schoolLevel,
      description: description.trim(),
      dueDate: new Date(dueDate).toISOString(),
      assignedTo: assigneeMode === 'all' ? 'all' : selectedStudentIds,
      targetClassIds,
      isGlobalForNewStudents,
      resources,
    };

    dataService.updateHomework(homework.id, updates);

    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
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
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Okul *
                  </label>
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Dersler *</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  >
                    {SCHOOL_SUBJECTS[schoolLevel].map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Ödev Başlığı *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ödev başlığını giriniz"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-slate-400 shadow-2xs"
              />
            </div>

            {/* Son Teslim Tarihi */}
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

            {/* Açıklama */}
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

            {/* Sınıf & Öğrenci Seçimi */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Öğrenci Seçimi ({selectedStudentIds.length} / {students.length} Seçili)</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentIds.length === students.length) {
                      setSelectedStudentIds([]);
                    } else {
                      setSelectedStudentIds(students.map((s) => s.id));
                    }
                  }}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  {selectedStudentIds.length === students.length ? 'Seçimi Kaldır' : 'Hepsi Seç'}
                </button>
              </div>

              {/* Sınıf Hızlı Seçim Butonları */}
              <div className="flex flex-wrap gap-1.5">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => handleSelectAllInClass(cls.id)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs"
                  >
                    {cls.name} Sınıfını Seç/Kaldır
                  </button>
                ))}
              </div>

              <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                {students.map((std) => (
                  <label
                    key={std.id}
                    className={`flex items-center space-x-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedStudentIds.includes(std.id)
                        ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(std.id)}
                      onChange={() => handleToggleStudent(std.id)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <span className="truncate flex-1">{std.name}</span>
                    <span className="text-[10px] text-slate-500">({std.className})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Materyaller (Resources) */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Paperclip className="w-4 h-4 text-indigo-600" />
                  <span>Ödev Materyalleri ({resources.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddResource(!showAddResource)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-slate-200 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Materyal Ekle</span>
                </button>
              </div>

              {/* Existing Resources List */}
              {resources.length > 0 && (
                <div className="space-y-1.5">
                  {resources.map((res) => (
                    <div
                      key={res.id}
                      className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs shadow-2xs"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {res.type === 'video' && <Video className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                        {res.type === 'link' && <Link2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                        {res.type === 'pdf' && <FileDown className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                        <span className="text-slate-900 font-semibold truncate">{res.title}</span>
                        <span className="text-slate-500 text-[10px] truncate max-w-[150px]">
                          ({res.url})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveResource(res.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                        title="Materyali Kaldır"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline Add Resource Form */}
              {showAddResource && (
                <div className="p-3 bg-white rounded-xl border border-indigo-200 space-y-2 shadow-2xs animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={resType}
                      onChange={(e) => setResType(e.target.value as HomeworkResourceType)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 text-xs font-semibold"
                    >
                      <option value="link">Web Bağlantısı (Link)</option>
                      <option value="video">Ders Videosu (YouTube / MP4)</option>
                      <option value="pdf">PDF / Doküman Dosyası</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Materyal Başlığı *"
                      value={resTitle}
                      onChange={(e) => setResTitle(e.target.value)}
                      className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="URL Adresi (https://... veya dosya linki) *"
                      value={resUrl}
                      onChange={(e) => setResUrl(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 text-xs focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddResource}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Ekle
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Geçmiş Ödev Erişimi */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center space-x-3">
              <input
                type="checkbox"
                id="edit-global-registration-access"
                checked={isGlobalForNewStudents}
                onChange={(e) => setIsGlobalForNewStudents(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <label
                htmlFor="edit-global-registration-access"
                className="text-xs text-slate-700 cursor-pointer"
              >
                <strong className="text-indigo-900">Geçmiş Ödev Erişimi:</strong> Sonradan kayıt olan yeni
                öğrenciler de bu ödevi otomatik olarak görsün.
              </label>
            </div>

            {/* Sayfanın altına kaydet butonu */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Save className="w-4 h-4" />
                <span>Değişiklikleri Kaydet</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
