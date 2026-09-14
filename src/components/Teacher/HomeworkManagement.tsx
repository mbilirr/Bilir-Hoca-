import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Users,
  Target,
  Sparkles,
  Award,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Trash2,
  CalendarCheck,
  Send,
  Film,
  Video,
  Globe,
  Paperclip,
  FileSpreadsheet,
  Search,
  Check,
  RotateCcw,
  GraduationCap,
  Save,
  Edit3,
  Download,
  Eye,
  ChevronLeft,
  Printer,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Homework, HomeworkSubmission, Student, ClassGroup, HomeworkResource, HomeworkCheckStatus } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForHomework, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { HomeworkResourceUploader } from './HomeworkResourceUploader';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { EditHomeworkModal } from './EditHomeworkModal';
import { HomeworkDetailModal } from './HomeworkDetailModal';

interface HomeworkManagementProps {
  homeworks: Homework[];
  submissions?: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
  onNavigateToEtut?: (subject: string, outcome: string) => void;
}

const SCHOOL_SUBJECTS: Record<'Ortaokul' | 'Lise', string[]> = {
  Ortaokul: ['Matematik', 'Türkçe', 'Fen Bilgisi', 'Sosyal Bilgiler', 'İngilizce'],
  Lise: ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Coğrafya', 'Tarih', 'Edebiyat'],
};

export const HomeworkManagement: React.FC<HomeworkManagementProps> = ({
  homeworks,
  submissions: propSubmissions,
  students,
  classes,
  onNavigateToEtut,
}) => {
  const [localSubmissions, setLocalSubmissions] = useState<HomeworkSubmission[]>(() =>
    propSubmissions || dataService.getSubmissions() || []
  );
  const submissions = localSubmissions;

  // View Mode: 'tracker' (Ödev Kontrol Çizelgesi) | 'all' (Tüm Oluşturulan Ödevler)
  const [activeTab, setActiveTab] = useState<'tracker' | 'all'>('tracker');

  // Ödev Kontrol Seçimleri
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>(homeworks[0]?.id || '');
  const [selectedClassIdForCheck, setSelectedClassIdForCheck] = useState<string>('');
  const [selectedStudentIdForCheck, setSelectedStudentIdForCheck] = useState<string>('');
  const [studentSearchInput, setStudentSearchInput] = useState<string>('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Taslak / Henüz Kaydedilmemiş Ödev Kontrol Durumları (studentId -> status)
  const [draftCheckStatuses, setDraftCheckStatuses] = useState<Record<string, HomeworkCheckStatus>>({});

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedHwForGrading, setSelectedHwForGrading] = useState<Homework | null>(null);
  const [expandedHwId, setExpandedHwId] = useState<string | null>(homeworks[0]?.id || null);
  const [homeworkToDelete, setHomeworkToDelete] = useState<Homework | null>(null);
  const [editingHomework, setEditingHomework] = useState<Homework | null>(null);
  const [editingResourcesHw, setEditingResourcesHw] = useState<Homework | null>(null);
  const [editingResourcesList, setEditingResourcesList] = useState<HomeworkResource[]>([]);

  // Kolay Ödev Bulma & Filtreleme Açılır Penceresi State'leri
  const [hwSearchQuery, setHwSearchQuery] = useState('');
  const [hwFilterSubject, setHwFilterSubject] = useState('all');
  const [hwFilterClassId, setHwFilterClassId] = useState('all');
  const [isHwSearchDropdownOpen, setIsHwSearchDropdownOpen] = useState(false);

  // Ödev Kontrol Bölümü Buton Seçimleri: Tüm Ödevler, Tüm Sınıflar, Tüm Dersler
  const [trackerFilterHwId, setTrackerFilterHwId] = useState<string>('all');
  const [trackerFilterClassId, setTrackerFilterClassId] = useState<string>('all');
  const [trackerFilterSubject, setTrackerFilterSubject] = useState<string>('all');
  const [isTrackerCarouselVisible, setIsTrackerCarouselVisible] = useState<boolean>(true);

  // Sayfanın Hepsi Açılsın Modal State'i (Görüntüle Butonu)
  const [activeViewingHomework, setActiveViewingHomework] = useState<Homework | null>(null);

  const scrollTrackerHwTrack = (distance: number) => {
    const el = document.getElementById('tracker-hw-carousel-track');
    if (el) {
      el.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  const scrollAllHwTrack = (distance: number) => {
    const el = document.getElementById('all-hw-carousel-track');
    if (el) {
      el.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  // Ödev Belgesini Temiz Word / Yazdırma Belgesi Olarak İndirme Fonksiyonu
  const handleDownloadHomeworkDoc = (hw: Homework) => {
    const targetClassNames = (hw.targetClassIds || [])
      .map((cid) => classes.find((c) => c.id === cid)?.name)
      .filter(Boolean);

    const assignedCount =
      hw.assignedTo === 'all'
        ? students.length
        : Array.isArray(hw.assignedTo)
        ? hw.assignedTo.length
        : 0;

    const dueDateFormatted = new Date(hw.dueDate).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const dueTimeFormatted = new Date(hw.dueDate).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${hw.title}</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 15px; margin-bottom: 25px; }
          .header h2 { margin: 0; font-size: 18pt; color: #0f172a; text-transform: uppercase; }
          .header h3 { margin: 5px 0; font-size: 14pt; color: #334155; font-weight: 600; }
          .header h4 { margin: 0; font-size: 12pt; color: #475569; }
          .meta-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
          .meta-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11pt; }
          .section-title { font-size: 13pt; font-weight: bold; color: #4338ca; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px; margin-bottom: 12px; }
          .description-box { font-size: 11pt; line-height: 1.8; background: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; }
          .outcomes-list { padding-left: 20px; margin: 10px 0; }
          .outcomes-list li { margin-bottom: 6px; font-size: 10.5pt; color: #334155; }
          .signature-area { margin-top: 50px; display: flex; justify-content: space-between; }
          .sig-box { text-align: center; width: 220px; border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>T.C. MİLLÎ EĞİTİM BAKANLIĞI</h2>
          <h3>2026-2027 EĞİTİM-ÖĞRETİM YILI</h3>
          <h4>KAZANIM ODAKLI ÖDEV VE ÇALIŞMA FORMU</h4>
        </div>

        <div class="meta-box">
          <div class="meta-row"><strong>Ödev Başlığı:</strong> ${hw.title}</div>
          <div class="meta-row"><strong>Ders / Kademe:</strong> ${hw.subject} (${hw.schoolLevel || 'Ortaokul / Lise'})</div>
          <div class="meta-row"><strong>Hedef Sınıflar:</strong> ${targetClassNames.join(', ') || 'Tüm Şubeler'}</div>
          <div class="meta-row"><strong>Son Teslim Tarihi:</strong> ${dueDateFormatted} - ${dueTimeFormatted}</div>
          <div class="meta-row"><strong>Hedef Öğrenci Sayısı:</strong> ${assignedCount} Öğrenci</div>
        </div>

        <div class="section-title">ÖDEV YÖNERGESİ VE TALİMATLAR</div>
        <div class="description-box">
          ${(hw.description || 'Belirtilmedi').replace(/\n/g, '<br/>')}
        </div>

        ${
          hw.outcomes && hw.outcomes.length > 0
            ? `
          <div class="section-title">HEDEFLENEN KAZANIMLAR VE ÖĞRENME ALANLARI</div>
          <ul class="outcomes-list">
            ${hw.outcomes.map((o) => `<li>${o}</li>`).join('')}
          </ul>
        `
            : ''
        }

        <div class="signature-area">
          <div class="sig-box">
            <strong>Ders Öğretmeni</strong><br>
            Mustafa BİLİR<br>
            İmza
          </div>
          <div class="sig-box">
            <strong>Zümre Başkanı / Okul İdaresi</strong><br>
            Kontrol & Onay<br>
            İmza
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = hw.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_');
    link.href = url;
    link.download = `${safeTitle}_Odev_Belgesi_2026_2027.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSaveFeedback(`"${hw.title}" ödev belgesi başarıyla indirildi.`);
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  // Form State
  const [schoolLevel, setSchoolLevel] = useState<'Ortaokul' | 'Lise'>('Ortaokul');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Matematik');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [targetClassIds, setTargetClassIds] = useState<string[]>(classes.map((c) => c.id));
  const [assigneeMode, setAssigneeMode] = useState<'all' | 'custom'>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [resources, setResources] = useState<HomeworkResource[]>([]);

  const handleSchoolLevelChange = (level: 'Ortaokul' | 'Lise') => {
    setSchoolLevel(level);
    const subjects = SCHOOL_SUBJECTS[level];
    if (!subjects.includes(subject)) {
      setSubject(subjects[0]);
    }
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
  };

  const handleToggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleCreateHomework = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    const currentTeacher = dataService.getCurrentTeacher();
    const newHw = dataService.createHomework({
      title: title.trim(),
      subject,
      schoolLevel,
      description: description.trim(),
      dueDate,
      outcomes: [],
      assignedTo: assigneeMode === 'all' ? 'all' : selectedStudentIds,
      targetClassIds: targetClassIds.length > 0 ? targetClassIds : undefined,
      resources,
      isGlobalForNewStudents: true,
      createdByName: currentTeacher?.name || 'Öğretmen',
      teacherId: currentTeacher?.id,
    });

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
    });

    setIsCreateModalOpen(false);
    resetForm();
    setActiveTab('all');
    setExpandedHwId(newHw.id);
  };

  const resetForm = () => {
    setTitle('');
    setSchoolLevel('Ortaokul');
    setSubject('Matematik');
    setDescription('');
    setDueDate('');
    setTargetClassIds(classes.map((c) => c.id));
    setAssigneeMode('all');
    setSelectedStudentIds([]);
    setResources([]);
  };

  const handleOpenEditResources = (hw: Homework) => {
    setEditingResourcesHw(hw);
    setEditingResourcesList(hw.resources || []);
  };

  const handleSaveEditedResources = () => {
    if (editingResourcesHw) {
      dataService.updateHomework(editingResourcesHw.id, {
        resources: editingResourcesList,
      });
      setEditingResourcesHw(null);
    }
  };

  // Selected Homework for Tracking
  const selectedHomework =
    homeworks.find((h) => h.id === selectedHomeworkId) || homeworks[0] || null;

  // Ödev Kontrol Filtreleme Seçenekleri ve Listesi
  const trackerAvailableSubjects = Array.from(new Set(homeworks.map((h) => h.subject))).filter(Boolean);

  const filteredTrackerHomeworks = homeworks.filter((hw) => {
    if (trackerFilterHwId !== 'all' && hw.id !== trackerFilterHwId) {
      return false;
    }
    if (trackerFilterSubject !== 'all' && hw.subject !== trackerFilterSubject) {
      return false;
    }
    if (trackerFilterClassId !== 'all') {
      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
        if (!hw.targetClassIds.includes(trackerFilterClassId)) return false;
      }
    }
    return true;
  });

  // Is any class or student selected? (Açılır pencerelerden biri seçilmeden sayfa altında ödev bilgileri çıkmasın)
  const isSelectionActive = Boolean(
    selectedClassIdForCheck || selectedStudentIdForCheck || studentSearchInput.trim()
  );

  // Filter students for the check table based on selection
  const targetStudentsForCheck = students.filter((std) => {
    // If specific single student selected via dropdown
    if (selectedStudentIdForCheck) {
      return std.id === selectedStudentIdForCheck;
    }
    // If student search input is used
    if (studentSearchInput.trim()) {
      const q = studentSearchInput.toLowerCase().trim();
      const matchName = std.name.toLowerCase().includes(q);
      const matchNo = std.studentNumber?.toLowerCase().includes(q) || false;
      const matchClass = std.className?.toLowerCase().includes(q) || false;
      if (!matchName && !matchNo && !matchClass) return false;
      if (selectedClassIdForCheck && std.classId !== selectedClassIdForCheck) return false;
      return true;
    }
    // If class selected
    if (selectedClassIdForCheck) {
      return std.classId === selectedClassIdForCheck;
    }
    return false;
  });

  const getStudentCheckStatus = (studentId: string): HomeworkCheckStatus | '' => {
    if (draftCheckStatuses[studentId] !== undefined) {
      return draftCheckStatuses[studentId];
    }
    if (!selectedHomework) return '';
    const sub = submissions.find(
      (s) => s.homeworkId === selectedHomework.id && s.studentId === studentId
    );
    if (!sub) return '';
    if (sub.checkStatus) return sub.checkStatus;
    if (sub.status === 'on_time' || sub.status === 'late') return 'yapti';
    return '';
  };

  const isStudentStatusDraftModified = (studentId: string): boolean => {
    return draftCheckStatuses[studentId] !== undefined;
  };

  const handleCheckStatusChange = (studentId: string, status: HomeworkCheckStatus) => {
    setDraftCheckStatuses((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    const labels: Record<HomeworkCheckStatus, string> = {
      yapti: 'Yaptı',
      yapmadi: 'Yapmadı',
      eksik: 'Eksik',
      gelmedi: 'Gelmedi',
    };
    setSaveFeedback(`${labels[status]} seçildi. Kaydetmek için sayfanın altındaki butona tıklayınız.`);
  };

  const handleBatchStatus = (status: HomeworkCheckStatus) => {
    if (!selectedHomework || targetStudentsForCheck.length === 0) return;
    setDraftCheckStatuses((prev) => {
      const next = { ...prev };
      targetStudentsForCheck.forEach((std) => {
        next[std.id] = status;
      });
      return next;
    });
    const labels: Record<HomeworkCheckStatus, string> = {
      yapti: 'Yaptı',
      yapmadi: 'Yapmadı',
      eksik: 'Eksik',
      gelmedi: 'Gelmedi',
    };
    setSaveFeedback(`Listedeki tüm öğrenciler "${labels[status]}" olarak seçildi. Kaydetmek için sayfanın altındaki "Değişiklikleri Kaydet" butonuna tıklayınız.`);
  };

  const handleSaveAllChecks = () => {
    if (!selectedHomework) return;
    const modifiedStudentIds = Object.keys(draftCheckStatuses);
    if (modifiedStudentIds.length === 0) {
      setSaveFeedback('Kaydedilecek yeni bir değişiklik bulunmuyor.');
      setTimeout(() => setSaveFeedback(null), 2500);
      return;
    }

    modifiedStudentIds.forEach((studentId) => {
      const status = draftCheckStatuses[studentId];
      dataService.updateHomeworkCheckStatus(selectedHomework.id, studentId, status);
    });

    setLocalSubmissions(dataService.getSubmissions());
    const count = modifiedStudentIds.length;
    setDraftCheckStatuses({});
    setSaveFeedback(`✓ ${count} öğrencinin ödev kontrol durumu başarıyla sisteme kaydedildi!`);
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const handleResetDraftChecks = () => {
    setDraftCheckStatuses({});
    setSaveFeedback('Kaydedilmemiş değişiklikler sıfırlandı.');
    setTimeout(() => setSaveFeedback(null), 2500);
  };

  const unsavedCount = Object.keys(draftCheckStatuses).length;
  const hasUnsavedChecks = unsavedCount > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner & 3 Action Buttons Side-by-Side */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-2.5">
          <Target className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold text-white">Ödev Yönetimi</h2>
        </div>

        {/* 3 Buttons Side by Side: Ödev Oluştur, Ödev Kontrol, Tüm Oluşturulan Ödevler */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
            id="btn-create-homework"
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-indigo-600/25 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Ödev Oluştur</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            id="btn-tab-tracker"
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'tracker'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/20'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Ödev Kontrol</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            id="btn-tab-all"
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer border ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/20'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tüm Oluşturulan Ödevler</span>
          </button>
        </div>
      </div>

      {saveFeedback && (
        <div className="flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold animate-in fade-in">
          <Check className="w-3.5 h-3.5" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* TAB 1: TRACKER / CHECK VIEW */}
      {activeTab === 'tracker' && (
        <div className="space-y-5">
          {/* 3 Ana Seçim Butonu: TÜM ÖDEVLER, TÜM SINIFLAR, TÜM DERSLER */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Ödev Kontrol & Filtreleme Butonları</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aşağıdaki butonlardan seçim yaparak ilgili ödevleri yan yana kayan özet sayfalar halinde görüntüleyin.
                </p>
              </div>

              {/* Buton Seçim Durumu Rozeti */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {filteredTrackerHomeworks.length} Ödev Görünüyor
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTrackerFilterHwId('all');
                    setTrackerFilterClassId('all');
                    setTrackerFilterSubject('all');
                    setIsTrackerCarouselVisible(true);
                  }}
                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Tümünü Göster
                </button>
              </div>
            </div>

            {/* 3 Buton Izgarası */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. TÜM ÖDEVLER BUTONU */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 hover:border-indigo-500/50 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tüm Ödevler Butonu</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {trackerFilterHwId === 'all' ? 'Tümü Açık' : '1 Ödev Seçili'}
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={trackerFilterHwId}
                    onChange={(e) => {
                      setTrackerFilterHwId(e.target.value);
                      setIsTrackerCarouselVisible(true);
                      if (e.target.value !== 'all') {
                        setSelectedHomeworkId(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                  >
                    <option value="all">📚 Tüm Ödevler ({homeworks.length})</option>
                    {homeworks.map((hw) => (
                      <option key={hw.id} value={hw.id}>
                        {hw.title} ({hw.subject})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. TÜM SINIFLAR BUTONU */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 hover:border-indigo-500/50 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tüm Sınıflar Butonu</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {trackerFilterClassId === 'all' ? 'Tüm Sınıflar' : classes.find((c) => c.id === trackerFilterClassId)?.name}
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={trackerFilterClassId}
                    onChange={(e) => {
                      setTrackerFilterClassId(e.target.value);
                      setIsTrackerCarouselVisible(true);
                      if (e.target.value !== 'all') {
                        setSelectedClassIdForCheck(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                  >
                    <option value="all">🏫 Tüm Sınıflar ({classes.length})</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.academicYear})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. TÜM DERSLER BUTONU */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 hover:border-indigo-500/50 transition-colors">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                    <Target className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tüm Dersler Butonu</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {trackerFilterSubject === 'all' ? 'Tüm Dersler' : trackerFilterSubject}
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={trackerFilterSubject}
                    onChange={(e) => {
                      setTrackerFilterSubject(e.target.value);
                      setIsTrackerCarouselVisible(true);
                    }}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                  >
                    <option value="all">📖 Tüm Dersler</option>
                    {trackerAvailableSubjects.map((sbj) => (
                      <option key={sbj} value={sbj}>
                        {sbj}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* YAN YANA KAYAN ÖZET SAYFALAR (AÇILAN ÖDEVLER) */}
          {isTrackerCarouselVisible && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {/* Carousel Başlık & Sağa/Sola Kaydırma Butonları */}
              <div className="p-4 sm:px-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-white">
                    Açılan Ödevler (Yan Yana Kayan Özet Sayfalar)
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                    {filteredTrackerHomeworks.length} Özet Sayfa
                  </span>
                </div>

                {/* Kaydırma Kontrolleri */}
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => scrollTrackerHwTrack(-340)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Sola Kaydır"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTrackerHwTrack(340)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Sağa Kaydır"
                  >
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                  </button>
                </div>
              </div>

              {/* Yatay Kayar Parça / Carousel Track */}
              {filteredTrackerHomeworks.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Seçilen buton kriterlerine uygun ödev bulunamadı. Lütfen "Tümünü Göster" butonuna tıklayarak filtreleri sıfırlayabilirsiniz.
                </div>
              ) : (
                <div
                  id="tracker-hw-carousel-track"
                  className="flex items-stretch space-x-4 overflow-x-auto p-4 sm:p-5 scrollbar-thin snap-x snap-mandatory scroll-smooth"
                >
                  {filteredTrackerHomeworks.map((hw) => {
                    const isSelectedForCheck = selectedHomeworkId === hw.id;
                    const targetClasses = (hw.targetClassIds || [])
                      .map((cid) => classes.find((c) => c.id === cid)?.name)
                      .filter(Boolean);

                    const hwSubmissions = submissions.filter((s) => s.homeworkId === hw.id);
                    const doneCount = hwSubmissions.filter(
                      (s) => s.checkStatus === 'yapti' || s.status === 'on_time' || s.status === 'late'
                    ).length;
                    const missingCount = hwSubmissions.filter(
                      (s) => s.checkStatus === 'eksik'
                    ).length;
                    const notDoneCount = hwSubmissions.filter(
                      (s) => s.checkStatus === 'yapmadi' || s.status === 'not_submitted'
                    ).length;

                    return (
                      <div
                        key={hw.id}
                        className={`w-84 sm:w-92 shrink-0 snap-start bg-slate-900/95 rounded-2xl p-4 sm:p-4.5 flex flex-col justify-between shadow-lg transition-all border group hover:shadow-indigo-500/10 hover:-translate-y-0.5 ${
                          isSelectedForCheck
                            ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                            : 'border-slate-800 hover:border-indigo-500/40'
                        }`}
                      >
                        {/* Sayfa Başlığı ve Rozetler */}
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                                {hw.subject}
                              </span>
                              {hw.schoolLevel && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                                  {hw.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                              2026-2027
                            </span>
                          </div>

                          <h4
                            className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 min-h-[38px] mb-2 leading-snug"
                            title={hw.title}
                          >
                            {hw.title}
                          </h4>

                          {/* Özet Sayfa Kartı (Mini A4 Doküman Görünümü) */}
                          <div className="bg-slate-950/90 rounded-xl p-3 border border-slate-800/80 mb-3 space-y-2 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-500/10 rounded-bl-xl border-b border-l border-indigo-500/20" />

                            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-800">
                              <span className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{new Date(hw.dueDate).toLocaleDateString('tr-TR')}</span>
                              </span>
                              <span className="font-semibold text-indigo-300 truncate max-w-[120px]">
                                {targetClasses.join(', ') || 'Tüm Şubeler'}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                              {hw.description || 'Kazanım odaklı çalışma ve ödev föyü talimatları.'}
                            </p>

                            {/* Kontrol İstatistikleri */}
                            <div className="flex items-center justify-between pt-1 text-[10px] font-bold border-t border-slate-900">
                              <span className="text-emerald-400 flex items-center space-x-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{doneCount} Yaptı</span>
                              </span>
                              <span className="text-rose-400 flex items-center space-x-0.5">
                                <X className="w-3 h-3" />
                                <span>{notDoneCount} Yapmadı</span>
                              </span>
                              <span className="text-amber-400 flex items-center space-x-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                <span>{missingCount} Eksik</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Aksiyon Butonları: Görüntüle, İndir, Kontrol Et */}
                        <div className="space-y-2 pt-2 border-t border-slate-800/60">
                          <div className="grid grid-cols-2 gap-2">
                            {/* GÖRÜNTÜLE BUTONU (Sayfanın hepsi açılır, sayfa altında indir butonu vardır) */}
                            <button
                              type="button"
                              onClick={() => setActiveViewingHomework(hw)}
                              className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm cursor-pointer"
                              title="Ödev Sayfasının Hepsini Aç"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Görüntüle</span>
                            </button>

                            {/* İNDİR BUTONU */}
                            <button
                              type="button"
                              onClick={() => handleDownloadHomeworkDoc(hw)}
                              className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-all cursor-pointer"
                              title="Ödev Belgesini İndir (.doc)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>İndir</span>
                            </button>
                          </div>

                          {/* Kontrol Et Butonu */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHomeworkId(hw.id);
                              if (hw.targetClassIds && hw.targetClassIds.length > 0) {
                                setSelectedClassIdForCheck(hw.targetClassIds[0]);
                              }
                              setDraftCheckStatuses({});
                              setSaveFeedback(null);
                            }}
                            className={`w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelectedForCheck
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{isSelectedForCheck ? '✓ Bu Ödev Seçili (Aşağıda Kontrol Ediliyor)' : 'Bu Ödevi Kontrol Çizelgesinde Seç'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Controls Bar: Ödev Seçiniz, Sınıf Seçiniz, Öğrenci Seçiniz, Öğrenci Arama */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Öğrenci Değerlendirme & Kontrol Çizelgesi</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* 1. Ödev Seçiniz */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Kontrol Edilecek Ödev *
                </label>
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                  <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <select
                    value={selectedHomeworkId}
                    onChange={(e) => {
                      setSelectedHomeworkId(e.target.value);
                      setDraftCheckStatuses({});
                      setSaveFeedback(null);
                    }}
                    className="w-full bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
                  >
                    {homeworks.map((hw) => (
                      <option key={hw.id} value={hw.id} className="bg-slate-900 text-white">
                        {hw.title} ({hw.subject})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Sınıf Seçiniz */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Sınıf Seçiniz *
                </label>
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <select
                    value={selectedClassIdForCheck}
                    onChange={(e) => {
                      setSelectedClassIdForCheck(e.target.value);
                      setSelectedStudentIdForCheck('');
                    }}
                    className="w-full bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-slate-400">
                      Sınıf Seçiniz...
                    </option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id} className="bg-slate-900 text-white">
                        {cls.name} ({cls.academicYear})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Öğrenci Seçiniz (Açılır Pencere) */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Öğrenci Seçiniz
                </label>
                <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <select
                    value={selectedStudentIdForCheck}
                    onChange={(e) => {
                      setSelectedStudentIdForCheck(e.target.value);
                      if (e.target.value) {
                        setStudentSearchInput('');
                      }
                    }}
                    className="w-full bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-slate-400">
                      Öğrenci Seçiniz (Tüm Sınıf)...
                    </option>
                    {(selectedClassIdForCheck
                      ? students.filter((s) => s.classId === selectedClassIdForCheck)
                      : students
                    ).map((std) => (
                      <option key={std.id} value={std.id} className="bg-slate-900 text-white">
                        #{std.studentNumber || std.id.slice(-4)} - {std.name} ({std.className})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Tek Öğrenci Arama Kutusu ve Butonu */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Öğrenci İsmi ile Ara
                </label>
                <div className="flex items-center space-x-1.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearchInput}
                      onChange={(e) => {
                        setStudentSearchInput(e.target.value);
                        if (e.target.value) {
                          setSelectedStudentIdForCheck('');
                        }
                      }}
                      placeholder="Öğrenci ismi yazarak ara..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  {studentSearchInput && (
                    <button
                      type="button"
                      onClick={() => setStudentSearchInput('')}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl text-xs cursor-pointer"
                      title="Aramayı Temizle"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* KURAL KONTROLÜ: Açılır pencerelerden biri seçilmeden sayfanın altında ödev bilgileri çıkmasın */}
          {!isSelectionActive ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-10 sm:p-14 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Ödev Kontrolü İçin Sınıf veya Öğrenci Seçiniz
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto mb-6 leading-relaxed">
                Ödev bilgilerini, sınıf listesini ve teslim kontrol durumlarını (yaptı, yapmadı, eksik, gelmedi) görüntülemek için lütfen yukarıdaki menüden bir <strong className="text-indigo-300">Sınıf Seçiniz</strong> veya <strong className="text-emerald-300">Öğrenci</strong> arayınız.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassIdForCheck(cls.id)}
                    className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{cls.name} Sınıfını Kontrol Et</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* SINIF LİSTESİ ÜZERİNDE VERİLEN ÖDEVİN BİLGİSİ */}
              {selectedHomework && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {selectedHomework.subject}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            Son Teslim:{' '}
                            {new Date(selectedHomework.dueDate).toLocaleDateString('tr-TR')} -{' '}
                            {new Date(selectedHomework.dueDate).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          Sınıf:{' '}
                          {classes.find((c) => c.id === selectedClassIdForCheck)?.name ||
                            'Tüm Seçili Öğrenciler'}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                        {selectedHomework.title}
                      </h3>

                      {selectedHomework.description && (
                        <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                          {selectedHomework.description}
                        </p>
                      )}
                    </div>

                    {/* İstatistik Sayaçları */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-center min-w-[65px]">
                        <div className="text-[10px] text-slate-400 font-semibold">TOPLAM</div>
                        <div className="text-sm font-bold text-white">
                          {targetStudentsForCheck.length}
                        </div>
                      </div>
                      <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3 py-1.5 text-center min-w-[65px]">
                        <div className="text-[10px] text-emerald-400 font-semibold">YAPTI</div>
                        <div className="text-sm font-bold text-emerald-300">
                          {
                            targetStudentsForCheck.filter(
                              (s) => getStudentCheckStatus(s.id) === 'yapti'
                            ).length
                          }
                        </div>
                      </div>
                      <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-1.5 text-center min-w-[65px]">
                        <div className="text-[10px] text-rose-400 font-semibold">YAPMADI</div>
                        <div className="text-sm font-bold text-rose-300">
                          {
                            targetStudentsForCheck.filter(
                              (s) => getStudentCheckStatus(s.id) === 'yapmadi'
                            ).length
                          }
                        </div>
                      </div>
                      <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-1.5 text-center min-w-[65px]">
                        <div className="text-[10px] text-amber-400 font-semibold">EKSİK</div>
                        <div className="text-sm font-bold text-amber-300">
                          {
                            targetStudentsForCheck.filter(
                              (s) => getStudentCheckStatus(s.id) === 'eksik'
                            ).length
                          }
                        </div>
                      </div>
                      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-1.5 text-center min-w-[65px]">
                        <div className="text-[10px] text-slate-400 font-semibold">GELMEDİ</div>
                        <div className="text-sm font-bold text-slate-300">
                          {
                            targetStudentsForCheck.filter(
                              (s) => getStudentCheckStatus(s.id) === 'gelmedi'
                            ).length
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Müfredat Kazanımları Rozetleri */}
                  {selectedHomework.outcomes && selectedHomework.outcomes.length > 0 && (
                    <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-indigo-400 font-semibold flex items-center space-x-1 mr-1">
                        <Target className="w-3.5 h-3.5" />
                        <span>Müfredat Kazanımları:</span>
                      </span>
                      {selectedHomework.outcomes.map((oc, i) => (
                        <span
                          key={i}
                          className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700 font-mono text-[11px]"
                        >
                          {oc}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Seçili Ödev Alt Eylem Butonları: Düzenle & Sil */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">
                      Bu ödevin bilgilerini güncellemek veya sistemden silmek için:
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setEditingHomework(selectedHomework)}
                        id="btn-edit-selected-homework"
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                        title="Seçili Ödevi Düzenle"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Ödevi Düzenle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHomeworkToDelete(selectedHomework)}
                        id="btn-delete-selected-homework"
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-500 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
                        title="Seçili Ödevi Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Ödevi Sil</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ÖĞRENCİ KONTROL LİSTESİ */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Ödev Kontrol Çizelgesi ({targetStudentsForCheck.length} Öğrenci)
                    </h4>
                  </div>

                  <div className="flex items-center space-x-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleBatchStatus('yapti')}
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      ✅ Tümünü Yaptı İşaretle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClassIdForCheck('');
                        setSelectedStudentIdForCheck('');
                        setStudentSearchInput('');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Seçimi Temizle
                    </button>
                  </div>
                </div>

                {/* Öğrenci Satırları */}
                {targetStudentsForCheck.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Seçilen kriterlere uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {targetStudentsForCheck.map((student) => {
                      const currentStatus = getStudentCheckStatus(student.id);
                      return (
                        <div
                          key={student.id}
                          className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850/40 transition-colors"
                        >
                          <div className="flex items-center space-x-3 min-w-[220px]">
                            <img
                              src={
                                student.avatar ||
                                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                  student.name
                                )}`
                              }
                              alt={student.name}
                              className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 shrink-0"
                            />
                            <div>
                              <div className="font-semibold text-xs text-white flex items-center space-x-1.5 flex-wrap">
                                <span>{student.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  #{student.studentNumber || student.id.slice(-4)}
                                </span>
                                {isStudentStatusDraftModified(student.id) && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                    Kaydedilmedi
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {student.className || 'Sınıf Belirtilmemiş'}
                              </div>
                            </div>
                          </div>

                          {/* Açılır Pencere (Yaptı, Yapmadı, Eksik, Gelmedi) */}
                          <div className="flex items-center space-x-2 flex-wrap sm:justify-end">
                            <select
                              value={currentStatus}
                              onChange={(e) =>
                                handleCheckStatusChange(
                                  student.id,
                                  e.target.value as HomeworkCheckStatus
                                )
                              }
                              className={`text-xs font-bold rounded-xl px-3 py-1.5 border focus:outline-none cursor-pointer transition-all ${
                                currentStatus === 'yapti'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : currentStatus === 'yapmadi'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : currentStatus === 'eksik'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : currentStatus === 'gelmedi'
                                  ? 'bg-slate-700/40 text-slate-300 border-slate-600'
                                  : 'bg-slate-950 text-slate-400 border-slate-700'
                              }`}
                            >
                              <option value="" disabled className="bg-slate-900 text-slate-400">
                                Durum Seçiniz...
                              </option>
                              <option value="yapti" className="bg-slate-900 text-emerald-400">
                                ✅ Yaptı
                              </option>
                              <option value="yapmadi" className="bg-slate-900 text-rose-400">
                                ❌ Yapmadı
                              </option>
                              <option value="eksik" className="bg-slate-900 text-amber-400">
                                ⚠️ Eksik
                              </option>
                              <option value="gelmedi" className="bg-slate-900 text-slate-300">
                                ⚪ Gelmedi
                              </option>
                            </select>

                            {/* Hızlı Butonlar */}
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleCheckStatusChange(student.id, 'yapti')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  currentStatus === 'yapti'
                                    ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm'
                                    : 'bg-slate-950 hover:bg-emerald-950/30 text-emerald-400 border-emerald-500/20'
                                }`}
                                title="Yaptı Olarak İşaretle"
                              >
                                Yaptı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCheckStatusChange(student.id, 'yapmadi')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  currentStatus === 'yapmadi'
                                    ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                                    : 'bg-slate-950 hover:bg-rose-950/30 text-rose-400 border-rose-500/20'
                                }`}
                                title="Yapmadı Olarak İşaretle"
                              >
                                Yapmadı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCheckStatusChange(student.id, 'eksik')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  currentStatus === 'eksik'
                                    ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                                    : 'bg-slate-950 hover:bg-amber-950/30 text-amber-400 border-amber-500/20'
                                }`}
                                title="Eksik Olarak İşaretle"
                              >
                                Eksik
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCheckStatusChange(student.id, 'gelmedi')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                  currentStatus === 'gelmedi'
                                    ? 'bg-slate-600 text-white border-slate-500 shadow-sm'
                                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                                title="Gelmedi Olarak İşaretle"
                              >
                                Gelmedi
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* SAYFA ALTI KAYDET BUTONU & AKSİYON BARI */}
                <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 text-xs">
                    {hasUnsavedChecks ? (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>{unsavedCount} öğrenci için kaydedilmemiş değişiklik var (Butona tıklamadan kaydedilmez)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tüm ödev kontrolleri kaydedildi ve güncel</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    {hasUnsavedChecks && (
                      <button
                        type="button"
                        onClick={handleResetDraftChecks}
                        className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>İptal Et</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveAllChecks}
                      disabled={!hasUnsavedChecks}
                      className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer ${
                        hasUnsavedChecks
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 ring-2 ring-indigo-400/50 scale-[1.02]'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {hasUnsavedChecks
                          ? `Ödev Kontrolünü Kaydet (${unsavedCount} Öğrenci)`
                          : 'Ödev Kontrolünü Kaydet'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: ALL CREATED HOMEWORKS */}
      {activeTab === 'all' && (() => {
        const availableSubjects = Array.from(new Set(homeworks.map((h) => h.subject))).filter(Boolean);
        const filteredHomeworks = homeworks.filter((hw) => {
          if (hwFilterSubject !== 'all' && hw.subject !== hwFilterSubject) {
            return false;
          }
          if (hwFilterClassId !== 'all') {
            if (hw.targetClassIds && hw.targetClassIds.length > 0) {
              if (!hw.targetClassIds.includes(hwFilterClassId)) return false;
            }
          }
          if (hwSearchQuery.trim()) {
            const q = hwSearchQuery.toLowerCase();
            const matchTitle = hw.title.toLowerCase().includes(q);
            const matchSubj = hw.subject.toLowerCase().includes(q);
            const matchDesc = hw.description?.toLowerCase().includes(q);
            const matchOutcomes = hw.outcomes?.some((o) => o.toLowerCase().includes(q));
            if (!matchTitle && !matchSubj && !matchDesc && !matchOutcomes) {
              return false;
            }
          }
          return true;
        });

        const isFiltered = hwSearchQuery.trim() !== '' || hwFilterSubject !== 'all' || hwFilterClassId !== 'all';

        return (
          <div className="space-y-4">
            {/* ÖDEVLERİ KOLAY BULMA AÇILIR PENCERE VE FİLTRELEME ÇUBUĞU */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Sol: Kolay Bul Açılır Pencere Butonu & Arama Kutusu */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Ödevleri Kolay Bul Açılır Pencere Butonu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsHwSearchDropdownOpen(!isHwSearchDropdownOpen)}
                      className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
                        isHwSearchDropdownOpen
                          ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40'
                          : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40 hover:border-indigo-400'
                      }`}
                      title="Tüm oluşturulan ödevler arasında arama yap ve doğrudan seç"
                    >
                      <Search className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Ödevleri Kolay Bul (Açılır Pencere)</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isHwSearchDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Açılır Pencere Menüsü (Popover) */}
                    {isHwSearchDropdownOpen && (
                      <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-slate-950/95 backdrop-blur-xl border-2 border-indigo-500/50 rounded-2xl shadow-2xl z-50 p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <div className="flex items-center space-x-2">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              Ödev Hızlı Bulucu
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsHwSearchDropdownOpen(false)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Açılır Pencere İçi Arama Girdisi */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            autoFocus
                            value={hwSearchQuery}
                            onChange={(e) => setHwSearchQuery(e.target.value)}
                            placeholder="Ödev adı veya ders yazın..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        {/* Ödev Sonuçları Listesi */}
                        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                          {filteredHomeworks.length === 0 ? (
                            <div className="text-center py-6 text-xs text-slate-500">
                              Aramanızla eşleşen ödev bulunamadı.
                            </div>
                          ) : (
                            filteredHomeworks.map((hw) => (
                              <button
                                key={hw.id}
                                type="button"
                                onClick={() => {
                                  setExpandedHwId(hw.id);
                                  setHwSearchQuery(hw.title);
                                  setIsHwSearchDropdownOpen(false);
                                  const el = document.getElementById(`hw-card-${hw.id}`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }}
                                className="w-full text-left p-2.5 rounded-xl bg-slate-900 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 transition-all flex items-start space-x-2.5 group cursor-pointer"
                              >
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 mt-0.5">
                                  {hw.subject}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-white group-hover:text-indigo-300 truncate">
                                    {hw.title}
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                                    <span>Son: {new Date(hw.dueDate).toLocaleDateString('tr-TR')}</span>
                                    <span>•</span>
                                    <span>{hw.targetClassIds?.length || 1} Sınıf</span>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>

                        {isFiltered && (
                          <button
                            type="button"
                            onClick={() => {
                              setHwSearchQuery('');
                              setHwFilterSubject('all');
                              setHwFilterClassId('all');
                            }}
                            className="w-full py-1.5 text-center text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold"
                          >
                            Tüm Filtreleri Temizle
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Doğrudan Hızlı Arama Kutusu */}
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={hwSearchQuery}
                      onChange={(e) => setHwSearchQuery(e.target.value)}
                      placeholder="Ödev başlığı veya kazanım ara..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    {hwSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHwSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sınıf Filtresi Açılır Kutusu */}
                  <div className="flex items-center space-x-1.5">
                    <select
                      value={hwFilterClassId}
                      onChange={(e) => setHwFilterClassId(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="all">Tüm Sınıflar</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders / Branş Filtresi Açılır Kutusu */}
                  <div className="flex items-center space-x-1.5">
                    <select
                      value={hwFilterSubject}
                      onChange={(e) => setHwFilterSubject(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="all">Tüm Dersler</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtreleri Temizle Butonu */}
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => {
                        setHwSearchQuery('');
                        setHwFilterSubject('all');
                        setHwFilterClassId('all');
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç & Yeni Ödev Butonu */}
                <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                  <span className="text-xs text-slate-400 font-medium">
                    Toplam <strong>{filteredHomeworks.length}</strong> / {homeworks.length} ödev
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Ödev Oluştur</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Ödev Kartları Listesi */}
            {filteredHomeworks.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 space-y-3">
                <Search className="w-8 h-8 mx-auto text-slate-500" />
                <p className="text-sm font-semibold text-white">Arama kriterlerinize uygun ödev bulunamadı.</p>
                <p className="text-xs text-slate-500">
                  Farklı bir ders, sınıf veya anahtar kelime seçebilir ya da filtreleri temizleyebilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHwSearchQuery('');
                    setHwFilterSubject('all');
                    setHwFilterClassId('all');
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              filteredHomeworks.map((hw) => {
                const hwSubmissions = submissions.filter((s) => s.homeworkId === hw.id);
                const isExpanded = expandedHwId === hw.id;

                const assignedCount =
                  hw.assignedTo === 'all'
                    ? students.length
                    : Array.isArray(hw.assignedTo)
                    ? hw.assignedTo.length
                    : 0;

                const isOverdue = new Date() > new Date(hw.dueDate);

                return (
                  <div
                    key={hw.id}
                    id={`hw-card-${hw.id}`}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition-all shadow-md scroll-mt-24"
                  >
              {/* Card Header */}
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {hw.schoolLevel && (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {hw.schoolLevel}
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {hw.subject}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-medium flex items-center space-x-1 ${
                        isOverdue
                          ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>
                        Son Teslim: {new Date(hw.dueDate).toLocaleDateString('tr-TR')} -{' '}
                        {new Date(hw.dueDate).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>

                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                      {hw.assignedTo === 'all'
                        ? '👥 Tüm Öğrenciler'
                        : `🎯 ${assignedCount} Özel Seçili Öğrenci`}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white tracking-tight">{hw.title}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{hw.description}</p>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center space-x-2 self-end md:self-center flex-wrap gap-y-2">
                  {/* GÖRÜNTÜLE BUTONU (Sayfanın hepsi açılır, sayfa altında indir butonu vardır) */}
                  <button
                    type="button"
                    onClick={() => setActiveViewingHomework(hw)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                    title="Ödev Sayfasının Hepsini Aç"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Görüntüle</span>
                  </button>

                  {/* İNDİR BUTONU */}
                  <button
                    type="button"
                    onClick={() => handleDownloadHomeworkDoc(hw)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    title="Ödev Belgesini İndir (.doc)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">İndir</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditResources(hw)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all"
                    title="Ödeve Video, Link veya PDF Ekle / Düzenle"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>Materyaller ({hw.resources?.length || (hw.attachmentUrl ? 1 : 0)})</span>
                  </button>

                  {/* Google Calendar Link Button */}
                  <a
                    href={createGoogleCalendarUrlForHomework(hw)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition-all"
                    title="Google Takvime Etkinlik Olarak İşle"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Google Takvime Ekle</span>
                  </a>

                  <button
                    onClick={() =>
                      downloadIcsFile(
                        `odev-${hw.title.slice(0, 15)}`,
                        `[ÖDEV] ${hw.subject}: ${hw.title}`,
                        hw.description,
                        hw.dueDate
                      )
                    }
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                    title=".ics Takvim Dosyası İndir"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setHomeworkToDelete(hw)}
                    className="p-2 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-xl text-xs transition-colors"
                    title="Ödevi Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setExpandedHwId(isExpanded ? null : hw.id)}
                    className="flex items-center space-x-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all"
                  >
                    <span>
                      Teslimler ({hwSubmissions.length}/{assignedCount})
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Resources / Attachments Section (Video, Link, PDF) */}
              {((hw.resources && hw.resources.length > 0) || hw.attachmentUrl) && (
                <div className="px-5 py-3.5 bg-slate-950/70 border-t border-slate-800/80">
                  <HomeworkResourceViewer
                    resources={hw.resources}
                    legacyAttachmentUrl={hw.attachmentUrl}
                  />
                </div>
              )}

              {/* Outcomes Section if present */}
              {hw.outcomes && hw.outcomes.length > 0 && (
                <div className="px-5 py-2.5 bg-slate-950/40 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-indigo-400 font-semibold flex items-center space-x-1">
                    <Target className="w-3.5 h-3.5" />
                    <span>Kazanımlar:</span>
                  </span>
                  {hw.outcomes.map((outcome, idx) => (
                    <span
                      key={idx}
                      className="bg-slate-800/90 text-slate-300 px-2.5 py-0.5 rounded-lg border border-slate-700 font-mono text-[11px]"
                    >
                      {outcome}
                    </span>
                  ))}
                </div>
              )}

              {/* Expandable Submissions Tracker */}
              {isExpanded && (
                <div className="p-5 border-t border-slate-800 bg-slate-900/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                      <Award className="w-4 h-4 text-indigo-400" />
                      <span>Öğrenci Teslim & Değerlendirme Çizelgesi</span>
                    </h4>
                    <span className="text-xs text-slate-400">
                      Zamanında: 🌟 🎉 | Gecikmeli: ⚠️ ⏳ | Teslim Edilmedi: 🚨 ❌
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {students
                      .filter((std) => {
                        if (hw.assignedTo === 'all') return true;
                        return Array.isArray(hw.assignedTo) && hw.assignedTo.includes(std.id);
                      })
                      .map((student) => {
                        const sub = hwSubmissions.find((s) => s.studentId === student.id);

                        if (sub) {
                          const isOnTime = sub.status === 'on_time';
                          return (
                            <div
                              key={student.id}
                              className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                                isOnTime
                                  ? 'bg-emerald-950/20 border-emerald-500/30'
                                  : 'bg-amber-950/20 border-amber-500/30'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <img
                                      src={
                                        student.avatar ||
                                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                          student.name
                                        )}`
                                      }
                                      alt={student.name}
                                      className="w-7 h-7 rounded-full bg-slate-800"
                                    />
                                    <span className="font-semibold text-xs text-white">
                                      {student.name}
                                    </span>
                                  </div>

                                  {/* Status Emoji Badge */}
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 ${
                                      isOnTime
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-amber-500/20 text-amber-300'
                                    }`}
                                  >
                                    <span>{isOnTime ? '🌟 🎉 Zamanında' : '⚠️ ⏳ Geç Teslim'}</span>
                                  </span>
                                </div>

                                <p className="text-xs text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800 my-2">
                                  "{sub.notes || 'Ödev teslim edildi.'}"
                                </p>

                                {/* Student Submitted Resources (PDF, Video, Link) */}
                                {sub.resources && sub.resources.length > 0 && (
                                  <div className="my-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                    <span className="text-[10px] font-bold text-indigo-300 uppercase block mb-1">
                                      Öğrencinin Yüklediği Materyaller:
                                    </span>
                                    <HomeworkResourceViewer resources={sub.resources} isCompact />
                                  </div>
                                )}

                                {sub.attachmentLink && !sub.resources && (
                                  <a
                                    href={sub.attachmentLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-1 text-[11px] text-indigo-400 hover:text-indigo-300 underline mb-2"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Ekli Bağlantıyı İncele</span>
                                  </a>
                                )}
                              </div>

                              {/* Score & Grading Input */}
                              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                                <span className="text-[11px] text-slate-400">
                                  Not: {sub.score !== null && sub.score !== undefined ? `${sub.score}/100` : 'Puanlanmadı'}
                                </span>
                                <button
                                  onClick={() => {
                                    const scoreStr = prompt(
                                      `${student.name} için ödev notu (0-100):`,
                                      sub.score?.toString() || '100'
                                    );
                                    if (scoreStr !== null) {
                                      const score = parseInt(scoreStr, 10);
                                      const feedback = prompt(
                                        'Öğretmen Geri Bildirimi / Notu:',
                                        sub.feedback || 'Tebrikler, ödevin incelendi.'
                                      );
                                      if (!isNaN(score)) {
                                        dataService.gradeSubmission(sub.id, score, feedback || '');
                                      }
                                    }
                                  }}
                                  className="text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                                >
                                  {sub.score ? 'Puanı Güncelle' : 'Puanla & Yorum Yaz'}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // NOT SUBMITTED STUDENT
                        return (
                          <div
                            key={student.id}
                            className="p-3.5 rounded-xl border bg-rose-950/10 border-rose-500/20 flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <img
                                  src={
                                    student.avatar ||
                                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                                      student.name
                                    )}`
                                  }
                                  alt={student.name}
                                  className="w-7 h-7 rounded-full opacity-60 bg-slate-800"
                                />
                                <span className="font-semibold text-xs text-slate-300">
                                  {student.name}
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300">
                                🚨 ⏳ Teslim Edilmedi
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-2">
                              Öğrenci henüz teslim yapmadı veya süresi doldu.
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* ÖDEVİN ALTINDAKİ DÜZENLEME VE SİLME BUTONLARI (Alt Eylem Çubuğu) */}
              <div className="px-5 py-3.5 bg-slate-950/85 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Oluşturulma:{' '}
                    {new Date(hw.createdAt || hw.dueDate).toLocaleDateString('tr-TR')}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-300 font-medium">{hw.subject}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">
                    {hw.assignedTo === 'all'
                      ? 'Tüm Öğrenciler'
                      : `${Array.isArray(hw.assignedTo) ? hw.assignedTo.length : 0} Öğrenci`}
                  </span>
                </div>

                <div className="flex items-center space-x-2.5 self-end sm:self-center">
                  {/* Düzenleme Butonu */}
                  <button
                    type="button"
                    onClick={() => setEditingHomework(hw)}
                    id={`btn-edit-hw-${hw.id}`}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-indigo-600/20"
                    title="Ödevi Düzenle (Başlık, Tarih, Açıklama, Kazanımlar, Materyaller)"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Ödevi Düzenle</span>
                  </button>

                  {/* Silme Butonu */}
                  <button
                    type="button"
                    onClick={() => setHomeworkToDelete(hw)}
                    id={`btn-delete-hw-${hw.id}`}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-500 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-rose-600/20"
                    title="Ödevi ve Bağlı Teslimleri Sistemden Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ödevi Sil</span>
                  </button>
                </div>
              </div>
            </div>
          );
        }))}
      </div>
    );
  })()}

      {/* CREATE HOMEWORK MODAL */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center space-x-2">
                  <Target className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-bold text-white">Yeni Kazanımlı Ödev Tanımla</h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            <form onSubmit={handleCreateHomework} className="space-y-4">
              {/* Okul ve Dersler Açılır Pencereleri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Okul *
                  </label>
                  <select
                    value={schoolLevel}
                    onChange={(e) =>
                      handleSchoolLevelChange(e.target.value as 'Ortaokul' | 'Lise')
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
                  >
                    <option value="Ortaokul">Ortaokul</option>
                    <option value="Lise">Lise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Dersler *
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
                  >
                    {SCHOOL_SUBJECTS[schoolLevel].map((subj) => (
                      <option key={subj} value={subj}>
                        {subj}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ödev Başlığı */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ödev Başlığı *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ödev başlığını giriniz..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Ödev Açıklaması */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ödev Açıklaması
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ödev açıklaması, teslim şartları ve detayları..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Tarih (Son Teslim) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tarih (Son Teslim Tarihi ve Saati) *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Video Ekleme, İnternet Linki Ekleme, PDF Ekleme */}
              <HomeworkResourceUploader
                resources={resources}
                onChange={setResources}
              />

              {/* Sınıf Seçme */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Sınıf Seçimi
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (targetClassIds.length === classes.length) {
                        setTargetClassIds([]);
                      } else {
                        setTargetClassIds(classes.map((c) => c.id));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      targetClassIds.length === classes.length
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tüm Sınıflar ({classes.length})
                  </button>
                  {classes.map((cls) => {
                    const isSelected = targetClassIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setTargetClassIds(targetClassIds.filter((id) => id !== cls.id));
                          } else {
                            setTargetClassIds([...targetClassIds, cls.id]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                            : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700/80 hover:text-slate-200'
                        }`}
                      >
                        {cls.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Öğrenci Seçme */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Öğrenci Seçimi
                </label>
                <div className="flex items-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAssigneeMode('all');
                      setSelectedStudentIds([]);
                    }}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      assigneeMode === 'all'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    👥 Tüm Öğrenciler ({students.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigneeMode('custom')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      assigneeMode === 'custom'
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🎯 Öğrenci Seç ({selectedStudentIds.length})
                  </button>
                </div>

                {assigneeMode === 'custom' && (
                  <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                      <span className="text-xs text-slate-400 font-medium">Öğrenci Listesi:</span>
                      <button
                        type="button"
                        onClick={handleSelectAllStudents}
                        className="text-xs text-indigo-400 hover:underline font-semibold cursor-pointer"
                      >
                        {selectedStudentIds.length === students.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {students
                        .filter(
                          (std) =>
                            targetClassIds.length === 0 ||
                            (std.classId && targetClassIds.includes(std.classId))
                        )
                        .map((std) => (
                          <label
                            key={std.id}
                            className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer text-xs"
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

              <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Ödevi Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* EDIT HOMEWORK RESOURCES MODAL */}
      {editingResourcesHw && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={() => setEditingResourcesHw(null)}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center space-x-2">
                  <Paperclip className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-bold text-white">Ödev Materyallerini Düzenle</h3>
                    <p className="text-xs text-slate-400 truncate max-w-md">{editingResourcesHw.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingResourcesHw(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <HomeworkResourceUploader
                  resources={editingResourcesList}
                  onChange={setEditingResourcesList}
                />

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingResourcesHw(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditedResources}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Materyalleri Kaydet</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HOMEWORK MODAL */}
      <EditHomeworkModal
        isOpen={!!editingHomework}
        onClose={() => setEditingHomework(null)}
        homework={editingHomework}
        students={students}
        classes={classes}
        onSuccess={() => {
          setSaveFeedback('Ödev başarıyla güncellendi.');
          setTimeout(() => setSaveFeedback(null), 4000);
        }}
      />

      {/* CONFIRM DELETE HOMEWORK MODAL */}
      <ConfirmDeleteModal
        isOpen={!!homeworkToDelete}
        onClose={() => setHomeworkToDelete(null)}
        onConfirm={() => {
          if (homeworkToDelete) {
            const deletedId = homeworkToDelete.id;
            dataService.deleteHomework(deletedId);
            if (selectedHomeworkId === deletedId) {
              const remaining = homeworks.filter((h) => h.id !== deletedId);
              setSelectedHomeworkId(remaining[0]?.id || '');
            }
            setSaveFeedback('Ödev başarıyla silindi.');
            setTimeout(() => setSaveFeedback(null), 4000);
            setHomeworkToDelete(null);
          }
        }}
        title="Ödevi Sil"
        itemBadge={homeworkToDelete ? `${homeworkToDelete.subject} • Son Teslim: ${new Date(homeworkToDelete.dueDate).toLocaleDateString('tr-TR')}` : undefined}
        description={`"${homeworkToDelete?.title}" başlıklı ödevi silmek istediğinize emin misiniz? Bu ödeve ait tüm öğrenci teslimleri ve değerlendirmeler de silinecektir.`}
        confirmButtonText="Ödevi Sil"
      />
      {/* HOMEWORK DETAIL MODAL (Sayfanın hepsi açılır, sayfa altında indir butonu vardır) */}
      <HomeworkDetailModal
        isOpen={!!activeViewingHomework}
        onClose={() => setActiveViewingHomework(null)}
        homework={activeViewingHomework}
        students={students}
        classes={classes}
        submissions={submissions}
      />
    </div>
  );
};
