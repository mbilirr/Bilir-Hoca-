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

export const EditHomeworkModal: React.FC<EditHomeworkModalProps> = ({
  isOpen,
  onClose,
  homework,
  students,
  classes,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Matematik');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [outcomesText, setOutcomesText] = useState('');
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
      setSubject(homework.subject || 'Matematik');
      setDescription(homework.description || '');
      setDueDate(formatForDateTimeInput(homework.dueDate));
      setOutcomesText(
        (homework.outcomes && homework.outcomes.length > 0
          ? homework.outcomes
          : homework.learningOutcomes || []
        ).join('\n')
      );
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

    const outcomes = outcomesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const updates: Partial<Homework> = {
      title: title.trim(),
      subject,
      description: description.trim(),
      dueDate: new Date(dueDate).toISOString(),
      outcomes: outcomes.length > 0 ? outcomes : ['Müfredat pekiştirme ve soru çözümü'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Ödevi Düzenle</h3>
              <p className="text-xs text-slate-400 truncate max-w-md">{homework.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ödev Başlığı *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: Newton Hareket Yasaları Testi"
                className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Ders *</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="Fen Bilimleri">Fen Bilimleri</option>
                <option value="Matematik">Matematik</option>
                <option value="Fizik">Fizik</option>
                <option value="Kimya">Kimya</option>
                <option value="Biyoloji">Biyoloji</option>
                <option value="Türkçe">Türkçe / Edebiyat</option>
                <option value="Tarih">Tarih</option>
                <option value="Coğrafya">Coğrafya</option>
                <option value="İngilizce">İngilizce</option>
              </select>
            </div>
          </div>

          {/* Son Teslim Tarihi */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span>Son Teslim Tarihi ve Saati *</span>
            </label>
            <input
              type="datetime-local"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center space-x-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ödev Açıklaması ve Öğrenci Talimatları</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ödev ile ilgili açıklama, sayfa numaraları veya soru aralıkları..."
              className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Outcomes (Kazanımlar) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ödev Kazanımları (Her satıra bir kazanım yazınız)</span>
              </label>
            </div>
            <textarea
              rows={3}
              value={outcomesText}
              onChange={(e) => setOutcomesText(e.target.value)}
              placeholder="Örn: F.8.1: Mevsimlerin oluşumuna yönelik tahminlerde bulunur.&#10;F.8.2: İklim ve hava olayları arasındaki farkı açıklar."
              className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Atanacak Öğrenci Grubu */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ödev Kime Atanacak?</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setAssigneeMode('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                    assigneeMode === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Tüm Öğrenciler
                </button>
                <button
                  type="button"
                  onClick={() => setAssigneeMode('custom')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                    assigneeMode === 'custom'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Özel Seçim
                </button>
              </div>
            </div>

            {assigneeMode === 'custom' && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => handleSelectAllInClass(cls.id)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer border border-slate-700"
                    >
                      {cls.name} Sınıfını Seç/Kaldır
                    </button>
                  ))}
                </div>

                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 bg-slate-900 rounded-lg border border-slate-800">
                  {students.map((std) => (
                    <label
                      key={std.id}
                      className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-800/60 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(std.id)}
                        onChange={() => handleToggleStudent(std.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-white truncate">{std.name}</span>
                      <span className="text-slate-400 text-[10px]">({std.className})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Materyaller (Resources) */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ödev Materyalleri ({resources.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAddResource(!showAddResource)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
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
                    className="flex items-center justify-between px-3 py-2 bg-slate-900 rounded-lg border border-slate-800 text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      {res.type === 'video' && <Video className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      {res.type === 'link' && <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      {res.type === 'pdf' && <FileDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      <span className="text-white font-medium truncate">{res.title}</span>
                      <span className="text-slate-500 text-[10px] truncate max-w-[150px]">
                        ({res.url})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveResource(res.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
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
              <div className="p-3 bg-slate-900 rounded-xl border border-indigo-500/30 space-y-2 animate-in fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as HomeworkResourceType)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs"
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
                    className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="URL Adresi (https://... veya dosya linki) *"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddResource}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Ekle
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Geçmiş Ödev Erişimi */}
          <div className="p-3 bg-indigo-950/25 border border-indigo-500/20 rounded-xl flex items-center space-x-3">
            <input
              type="checkbox"
              id="edit-global-registration-access"
              checked={isGlobalForNewStudents}
              onChange={(e) => setIsGlobalForNewStudents(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
            />
            <label
              htmlFor="edit-global-registration-access"
              className="text-xs text-slate-300 cursor-pointer"
            >
              <strong className="text-indigo-300">Geçmiş Ödev Erişimi:</strong> Sonradan kayıt olan yeni
              öğrenciler de bu ödevi otomatik olarak görsün.
            </label>
          </div>

          {/* Sayfanın altına kaydet butonu (Guidelines: sayfanın altına kaydet butonu koyalım butona tıklamadan kaydetme olmasın) */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Değişiklikleri Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
