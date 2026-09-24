import React, { useState, useRef } from 'react';
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
  ChevronRight,
  Printer,
  School,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
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

  // Ödev Kontrol: Açılır Pencere (Modal) ve Sınıf Açılır Menü State'leri
  const [isHwCheckModalOpen, setIsHwCheckModalOpen] = useState(false);
  const [hwCheckSearchQuery, setHwCheckSearchQuery] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  // Tüm Oluşturulan Ödevler Yana Yana Kayan Sayfalar (Slider / Carousel)
  const allHwSliderRef = useRef<HTMLDivElement>(null);
  const [allHwActiveIndex, setAllHwActiveIndex] = useState(0);

  const scrollAllHwSlider = (direction: 'prev' | 'next') => {
    if (!allHwSliderRef.current) return;
    const container = allHwSliderRef.current;
    const cardWidth = container.firstElementChild
      ? (container.firstElementChild as HTMLElement).clientWidth + 20
      : 500;
    const scrollAmount = direction === 'prev' ? -cardWidth : cardWidth;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

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

  const formatDueDateTurkish = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
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
      izinli: 'İzinli',
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
      izinli: 'İzinli',
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
      {activeTab === 'tracker' && (() => {
        // 1. Seçili ödev (Açılır pencere / Dropdown ile seçilir)
        const currentHw = homeworks.find((h) => h.id === selectedHomeworkId) || homeworks[0] || null;

        // 2. Seçtiğimiz ödevi olan sınıflar listesi
        const hwClasses = (() => {
          if (!currentHw) return [];
          if (currentHw.targetClassIds && currentHw.targetClassIds.length > 0) {
            const matched = classes.filter((c) => currentHw.targetClassIds!.includes(c.id));
            if (matched.length > 0) return matched;
          }
          if (currentHw.classId) {
            const matched = classes.filter((c) => c.id === currentHw.classId);
            if (matched.length > 0) return matched;
          }
          return classes;
        })();

        // 3. Seçilen sınıf (varsayılan olarak ilk sınıf)
        const activeClassId =
          selectedClassIdForCheck && hwClasses.some((c) => c.id === selectedClassIdForCheck)
            ? selectedClassIdForCheck
            : (hwClasses[0]?.id || '');
        const currentClass = classes.find((c) => c.id === activeClassId) || null;

        // 4. Seçilen sınıfın öğrencileri alt alta sıralanır
        const classStudents = activeClassId
          ? students.filter((s) => s.classId === activeClassId)
          : [];

        // Öğrenci içi hızlı filtreleme
        const displayedStudents = classStudents.filter((std) => {
          if (!studentSearchInput.trim()) return true;
          const q = studentSearchInput.toLowerCase().trim();
          return (
            std.name.toLowerCase().includes(q) ||
            (std.studentNumber && std.studentNumber.includes(q))
          );
        });

        // Sayaçlar
        let countYapti = 0;
        let countYapmadi = 0;
        let countEksik = 0;
        let countIzinli = 0;
        let countGelmedi = 0;

        classStudents.forEach((std) => {
          const status = getStudentCheckStatus(std.id);
          if (status === 'yapti') countYapti++;
          else if (status === 'yapmadi') countYapmadi++;
          else if (status === 'eksik') countEksik++;
          else if (status === 'izinli') countIzinli++;
          else if (status === 'gelmedi') countGelmedi++;
        });

        // Durum butonuna tıklandığında anında kaydet
        const handleStatusClick = (studentId: string, status: HomeworkCheckStatus) => {
          if (!currentHw) return;
          dataService.updateHomeworkCheckStatus(currentHw.id, studentId, status);
          setLocalSubmissions(dataService.getSubmissions());
          setDraftCheckStatuses((prev) => {
            const next = { ...prev };
            delete next[studentId];
            return next;
          });
        };

        // Toplu durum belirleme
        const handleBulkStatusChange = (status: HomeworkCheckStatus) => {
          if (!currentHw || classStudents.length === 0) return;
          classStudents.forEach((std) => {
            dataService.updateHomeworkCheckStatus(currentHw.id, std.id, status);
          });
          setLocalSubmissions(dataService.getSubmissions());
          setDraftCheckStatuses({});
          const labels: Record<HomeworkCheckStatus, string> = {
            yapti: 'Yaptı',
            yapmadi: 'Yapmadı',
            eksik: 'Eksik',
            izinli: 'İzinli',
            gelmedi: 'Gelmedi',
          };
          setSaveFeedback(`✓ ${currentClass?.name || 'Sınıf'} için tüm öğrenciler "${labels[status]}" olarak kaydedildi.`);
          setTimeout(() => setSaveFeedback(null), 3000);
        };

        if (homeworks.length === 0) {
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Henüz Kayıtlı Ödev Bulunmuyor</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Ödev kontrolü yapabilmek için lütfen önce "Yeni Ödev Oluştur" butonu ile sisteme bir ödev ekleyiniz.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/25 cursor-pointer inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Ödevi Oluştur</span>
              </button>
            </div>
          );
        }

        const filteredHwsForCheckModal = homeworks.filter((hw) => {
          if (!hwCheckSearchQuery.trim()) return true;
          const q = hwCheckSearchQuery.toLowerCase();
          return (
            hw.title.toLowerCase().includes(q) ||
            hw.subject.toLowerCase().includes(q) ||
            (hw.description && hw.description.toLowerCase().includes(q))
          );
        });

        return (
          <div className="space-y-5">
            {/* 1 & 2: ÖDEV SEÇİMİ (AÇILIR PENCERE BUTONU) & SINIF SEÇİMİ (SINIF ADINDA AÇILIR DÜĞME) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* ÖDEV SEÇİMİ - AÇILIR PENCERE BUTONU */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">Ödev Seçiniz</h3>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {homeworks.length} Ödev
                  </span>
                </div>

                {/* ÖDEV AÇILIR PENCERE DÜĞMESİ */}
                <button
                  type="button"
                  id="btn-open-hw-check-modal"
                  onClick={() => {
                    setHwCheckSearchQuery('');
                    setIsHwCheckModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 border border-slate-200 text-left transition-all cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {currentHw?.subject || 'Ders'}
                        </span>
                        <span className="text-xs text-slate-500">
                          Son: {currentHw ? formatDueDateTurkish(currentHw.dueDate) : '-'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 truncate mt-0.5">
                        {currentHw ? currentHw.title : 'Kontrol Edilecek Ödevi Seçiniz'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-xs group-hover:bg-indigo-500 transition-colors">
                      Değiştir
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 group-hover:translate-y-0.5 transition-transform" />
                  </div>
                </button>
              </div>

              {/* SINIF SEÇİMİ - SINIF ADINDA AÇILIR DÜĞME */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                      <School className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900">Sınıf Seçiniz</h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {hwClasses.length} Sınıf
                  </span>
                </div>

                {/* SINIF ADINDA AÇILIR DÜĞME */}
                {hwClasses.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    Bu ödev için tanımlı sınıf bulunamadı.
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      id="btn-class-select-dropdown"
                      onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
                      className="w-full flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 border border-slate-200 text-left transition-all cursor-pointer group shadow-xs"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                          <School className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 truncate">
                            {currentClass ? currentClass.name : 'Sınıf Seçiniz'}
                            {currentClass?.branch ? ` (${currentClass.branch})` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0 ml-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {classStudents.length} Öğrenci
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isClassDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* SINIF SEÇİM AÇILIR LİSTESİ */}
                    {isClassDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                          Sınıf Seçiniz ({hwClasses.length})
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                          {hwClasses.map((cls) => {
                            const isSelected = cls.id === activeClassId;
                            const countInClass = students.filter((s) => s.classId === cls.id).length;
                            return (
                              <button
                                key={cls.id}
                                type="button"
                                onClick={() => {
                                  setSelectedClassIdForCheck(cls.id);
                                  setIsClassDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <School className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-indigo-600'}`} />
                                  <span className="text-sm">{cls.name}</span>
                                  {cls.branch && (
                                    <span className="text-xs opacity-75 font-normal">({cls.branch})</span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-xs opacity-80">{countInClass} Öğrenci</span>
                                  {isSelected && <Check className="w-4 h-4" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* KONTROL EDİLECEK ÖDEV AÇILIR PENCERESİ (MODAL) */}
            {isHwCheckModalOpen && (
              <div
                className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
                onClick={() => setIsHwCheckModalOpen(false)}
              >
                <div
                  className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] my-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Kontrol Edilecek Ödevi Seçiniz</h3>
                        <span className="text-xs text-slate-500">Mevcut {homeworks.length} ödev listeleniyor</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHwCheckModalOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Modal Search */}
                  <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-white">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={hwCheckSearchQuery}
                        onChange={(e) => setHwCheckSearchQuery(e.target.value)}
                        placeholder="Ödev başlığı, ders veya konu ara..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Modal Homework Cards */}
                  <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2.5 max-h-[50vh] bg-slate-50/50">
                    {filteredHwsForCheckModal.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        Aramanıza uygun ödev bulunamadı.
                      </div>
                    ) : (
                      filteredHwsForCheckModal.map((hw) => {
                        const isSelected = hw.id === selectedHomeworkId;
                        return (
                          <button
                            key={hw.id}
                            type="button"
                            onClick={() => {
                              setSelectedHomeworkId(hw.id);
                              if (hw.targetClassIds && hw.targetClassIds.length > 0) {
                                setSelectedClassIdForCheck(hw.targetClassIds[0]);
                              } else if (hw.classId) {
                                setSelectedClassIdForCheck(hw.classId);
                              } else if (classes[0]) {
                                setSelectedClassIdForCheck(classes[0].id);
                              }
                              setIsHwCheckModalOpen(false);
                            }}
                            className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/30 shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {hw.subject}
                                </span>
                                {hw.schoolLevel && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    {hw.schoolLevel}
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  <span>Son Teslim: {formatDueDateTurkish(hw.dueDate)}</span>
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-slate-900 truncate">{hw.title}</h4>
                              {hw.description && (
                                <p className="text-xs text-slate-500 line-clamp-1">{hw.description}</p>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center space-x-2 ml-2">
                              {isSelected ? (
                                <span className="flex items-center space-x-1 text-xs font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-xl">
                                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                                  <span>Seçili</span>
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-slate-700 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                                  Seç
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsHwCheckModalOpen(false)}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 rounded-xl cursor-pointer"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. MODERN MİNİMALİST BEYAZ ÖĞRENCİ LİSTESİ VE DURUMLAR */}
            {currentClass && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                {/* Header & Arama (Açıklamasız, sade ve net) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {currentClass.name} — Öğrenci Listesi
                    </h3>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {classStudents.length} Kayıtlı Öğrenci
                    </span>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                      placeholder="Öğrenci adı veya numarası ara..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Sayaçlar */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Toplam</span>
                    <span className="text-base font-bold text-slate-900">{classStudents.length}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Yaptı</span>
                    <span className="text-base font-bold text-emerald-800">{countYapti}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-rose-700 block">Yapmadı</span>
                    <span className="text-base font-bold text-rose-800">{countYapmadi}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">Eksik</span>
                    <span className="text-base font-bold text-amber-800">{countEksik}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-sky-700 block">İzinli</span>
                    <span className="text-base font-bold text-sky-800">{countIzinli}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-center">
                    <span className="text-[10px] uppercase font-bold text-purple-700 block">Gelmedi</span>
                    <span className="text-base font-bold text-purple-800">{countGelmedi}</span>
                  </div>
                </div>

                {/* Toplu İşlem Butonları */}
                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Sınıf İçin Hızlı İşlem:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkStatusChange('yapti')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      ✓ Tümünü Yaptı
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkStatusChange('yapmadi')}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      ✕ Tümünü Yapmadı
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkStatusChange('eksik')}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      ⚠ Tümünü Eksik
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkStatusChange('izinli')}
                      className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      ℹ Tümünü İzinli
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkStatusChange('gelmedi')}
                      className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      ○ Tümünü Gelmedi
                    </button>
                  </div>
                </div>

                {/* ALT ALTA SIRALANMIŞ BEYAZ MİNİMALİST ÖĞRENCİ LİSTESİ */}
                {classStudents.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    "{currentClass.name}" sınıfına henüz kayıtlı öğrenci bulunmuyor.
                  </div>
                ) : displayedStudents.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    "{studentSearchInput}" aramasına uygun öğrenci bulunamadı.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    {displayedStudents.map((std, idx) => {
                      const currentStatus = getStudentCheckStatus(std.id);
                      return (
                        <div
                          key={std.id}
                          className="p-3 sm:p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          {/* Öğrenci Bilgisi */}
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 text-center text-xs font-mono text-slate-400 font-semibold shrink-0">
                              {idx + 1}
                            </span>
                            <img
                              src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                              alt={std.name}
                              className="w-8 h-8 rounded-full bg-slate-100 object-cover border border-slate-200 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-slate-900 truncate">{std.name}</h4>
                            </div>
                          </div>

                          {/* İSİMLERİN KARŞISINDA 'YAPTI, YAPMADI, EKSİK, İZİNLİ VE GELMEDİ' BUTONLARI */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                            {/* Yaptı */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(std.id, 'yapti')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'yapti'
                                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400'
                                  : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Yaptı</span>
                            </button>

                            {/* Yapmadı */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(std.id, 'yapmadi')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'yapmadi'
                                  ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-400'
                                  : 'bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300'
                              }`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Yapmadı</span>
                            </button>

                            {/* Eksik */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(std.id, 'eksik')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'eksik'
                                  ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-400'
                                  : 'bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-700 border border-slate-200 hover:border-amber-300'
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Eksik</span>
                            </button>

                            {/* İzinli */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(std.id, 'izinli')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'izinli'
                                  ? 'bg-sky-600 text-white shadow-xs ring-2 ring-sky-400'
                                  : 'bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 hover:border-sky-300'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>İzinli</span>
                            </button>

                            {/* Gelmedi */}
                            <button
                              type="button"
                              onClick={() => handleStatusClick(std.id, 'gelmedi')}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                                currentStatus === 'gelmedi'
                                  ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-400'
                                  : 'bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-300'
                              }`}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>Gelmedi</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
              <div className="space-y-3">
                {/* Carousel Kontrol & Bilgi Çubuğu */}
                <div className="flex items-center justify-between px-3 py-2 bg-slate-950/60 rounded-2xl border border-slate-800/80 text-xs shadow-sm">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs">
                      {filteredHomeworks.length}
                    </div>
                    <span className="font-bold text-white">Özet Ödev Sayfaları</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 hidden sm:inline">Yana Kaydırılabilir Kartlar (⇄)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => scrollAllHwSlider('prev')}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer flex items-center space-x-1 font-semibold"
                      title="Önceki Ödev Sayfası"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="text-xs">Önceki</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollAllHwSlider('next')}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer flex items-center space-x-1 font-semibold"
                      title="Sonraki Ödev Sayfası"
                    >
                      <span className="text-xs">Sonraki</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* YANA YANA KAYAN ÖDEV SAYFALARI PİSTİ */}
                <div
                  ref={allHwSliderRef}
                  className="flex overflow-x-auto snap-x snap-mandatory gap-4 sm:gap-5 pb-5 pt-1 px-1 scroll-smooth scrollbar-thin"
                >
                  {filteredHomeworks.map((hw) => {
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
                        className="w-[86vw] sm:w-[480px] md:w-[520px] lg:w-[560px] flex-shrink-0 snap-center bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between transition-all"
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

                  {/* Özet Teslim İlerlemesi */}
                  <div className="pt-2 flex items-center space-x-3">
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${assignedCount > 0 ? Math.min(100, Math.round((hwSubmissions.length / assignedCount) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                      {hwSubmissions.length} / {assignedCount} Teslim ({assignedCount > 0 ? Math.round((hwSubmissions.length / assignedCount) * 100) : 0}%)
                    </span>
                  </div>
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

                  {/* ÖDEVİ KONTROL ET BUTONU */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHomeworkId(hw.id);
                      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
                        setSelectedClassIdForCheck(hw.targetClassIds[0]);
                      } else if (hw.classId) {
                        setSelectedClassIdForCheck(hw.classId);
                      }
                      setActiveTab('tracker');
                    }}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                    title="Bu Ödevi Kontrol Et"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Kontrol Et</span>
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
        })}
                </div>
              </div>
            )}
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
