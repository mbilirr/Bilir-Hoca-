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
  const [selectedCreateClassId, setSelectedCreateClassId] = useState<string>('all');
  const [targetClassIds, setTargetClassIds] = useState<string[]>(classes.map((c) => c.id));
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() => students.map((s) => s.id));
  const [resources, setResources] = useState<HomeworkResource[]>([]);

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

  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    const currentTeacher = dataService.getCurrentTeacher();
    const finalTargetClasses =
      selectedCreateClassId === 'all'
        ? classes.map((c) => c.id)
        : [selectedCreateClassId];

    const isAllSelected =
      selectedStudentIds.length === 0 ||
      (selectedCreateClassId === 'all' && selectedStudentIds.length === students.length);

    const newHw = await dataService.createHomework({
      title: title.trim(),
      subject,
      schoolLevel,
      description: description.trim(),
      dueDate,
      outcomes: [],
      assignedTo: isAllSelected ? 'all' : selectedStudentIds,
      targetClassIds: finalTargetClasses.length > 0 ? finalTargetClasses : undefined,
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
    setSelectedCreateClassId('all');
    setTargetClassIds(classes.map((c) => c.id));
    setSelectedStudentIds(students.map((s) => s.id));
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
    setSaveFeedback(`${labels[status]} seçildi.`);
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
    setSaveFeedback(`Listedeki tüm öğrenciler "${labels[status]}" olarak seçildi.`);
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
                Ödev kontrolü yapabilmek için lütfen önce sisteme bir ödev ekleyiniz.
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
          <div className="space-y-5">
            {/* Minimalist Beyaz Filtreleme ve Arama Çubuğu */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Sol: Arama Kutusu ve Dropdown Filtreler */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Hızlı Arama Kutusu */}
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={hwSearchQuery}
                      onChange={(e) => setHwSearchQuery(e.target.value)}
                      placeholder="Ödev başlığı, ders veya konu ara..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                    />
                    {hwSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHwSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sınıf Filtresi */}
                  <div className="flex items-center">
                    <select
                      value={hwFilterClassId}
                      onChange={(e) => setHwFilterClassId(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                    >
                      <option value="all">Tüm Sınıflar</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders Filtresi */}
                  <div className="flex items-center">
                    <select
                      value={hwFilterSubject}
                      onChange={(e) => setHwFilterSubject(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                    >
                      <option value="all">Tüm Dersler</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtreleri Temizle */}
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => {
                        setHwSearchQuery('');
                        setHwFilterSubject('all');
                        setHwFilterClassId('all');
                      }}
                      className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Filtreleri Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç & Yeni Ödev Butonu */}
                <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                  <span className="text-xs text-slate-500 font-medium">
                    Toplam <strong>{filteredHomeworks.length}</strong> / {homeworks.length} ödev
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsCreateModalOpen(true);
                    }}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Ödev Oluştur</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sade, Minimalist ve Beyaz Arka Yüzeyli Ödev Kartları Grid */}
            {filteredHomeworks.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3 shadow-sm">
                <Search className="w-10 h-10 mx-auto text-slate-400" />
                <p className="text-sm font-bold text-slate-800">Arama kriterlerinize uygun ödev bulunamadı.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Farklı bir ders, sınıf veya anahtar kelime seçebilir ya da filtreleri sıfırlayabilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHwSearchQuery('');
                    setHwFilterSubject('all');
                    setHwFilterClassId('all');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
                  const submissionRate = assignedCount > 0 ? Math.round((hwSubmissions.length / assignedCount) * 100) : 0;

                  const targetClassNames = (hw.targetClassIds || [])
                    .map((cid) => classes.find((c) => c.id === cid)?.name)
                    .filter(Boolean);

                  return (
                    <div
                      key={hw.id}
                      id={`hw-card-${hw.id}`}
                      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between group"
                    >
                      <div className="space-y-3">
                        {/* Kart Üst Rozetleri */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {hw.subject}
                            </span>
                            {hw.schoolLevel && (
                              <span className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600">
                                {hw.schoolLevel}
                              </span>
                            )}
                          </div>

                          {/* Son Teslim Tarihi */}
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center space-x-1 ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>
                              {new Date(hw.dueDate).toLocaleDateString('tr-TR')}
                            </span>
                          </span>
                        </div>

                        {/* Ödev Başlığı */}
                        <div>
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {hw.title}
                          </h3>
                          <p className="text-xs text-slate-600 line-clamp-2 mt-1 leading-relaxed">
                            {hw.description || 'Ödev açıklaması bulunmuyor.'}
                          </p>
                        </div>

                        {/* Hedef Sınıf / Öğrenci Bilgisi */}
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                          <div className="flex items-center space-x-1 truncate max-w-[190px]">
                            <School className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate font-medium text-slate-700">
                              {targetClassNames.length > 0 ? targetClassNames.join(', ') : 'Tüm Sınıflar'}
                            </span>
                          </div>
                          <span className="font-medium text-slate-600 shrink-0">
                            {hw.assignedTo === 'all' ? 'Tüm Öğrenciler' : `${assignedCount} Öğrenci`}
                          </span>
                        </div>

                        {/* Teslim İlerleme Çubuğu */}
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-700">Teslim Durumu</span>
                            <span className="font-bold text-indigo-600">
                              {hwSubmissions.length} / {assignedCount} ({submissionRate}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, submissionRate)}%` }}
                            />
                          </div>
                        </div>

                        {/* Ekli Materyaller ve Kazanımlar Rozeti */}
                        {((hw.resources && hw.resources.length > 0) || hw.attachmentUrl) && (
                          <div className="pt-2 border-t border-slate-100">
                            <HomeworkResourceViewer
                              resources={hw.resources}
                              legacyAttachmentUrl={hw.attachmentUrl}
                              isCompact
                            />
                          </div>
                        )}
                      </div>

                      {/* Kart Aksiyon Butonları (Açıklamasız, Sade ve Profesyonel) */}
                      <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
                        {/* Üst Sıra Ana Butonlar: Görüntüle, Kontrol Et, İndir */}
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveViewingHomework(hw)}
                            className="w-full py-2 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition-colors cursor-pointer shadow-sm"
                            title="Ödev detayını tam sayfa görüntüle"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Görüntüle</span>
                          </button>

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
                            className="w-full py-2 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                            title="Ödev kontrol çizelgesini aç"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Kontrol Et</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadHomeworkDoc(hw)}
                            className="w-full py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                            title="Ödev belgesini indir (.doc)"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>İndir</span>
                          </button>
                        </div>

                        {/* Alt Sıra Yardımcı Butonlar: Materyaller, Düzenle, Sil, Teslimler */}
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditResources(hw)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                              title="Materyalleri yönet"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>Materyal</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingHomework(hw)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                              title="Ödevi düzenle"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Düzenle</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setHomeworkToDelete(hw)}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                              title="Ödevi sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedHwId(isExpanded ? null : hw.id)}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer py-1 px-1.5 rounded hover:bg-indigo-50 transition-colors"
                          >
                            <span>Teslimler ({hwSubmissions.length})</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Açılır Teslim Listesi */}
                        {isExpanded && (
                          <div className="pt-3 border-t border-slate-100 space-y-2 mt-2">
                            <h4 className="text-[11px] font-bold text-slate-700">Öğrenci Teslim Listesi</h4>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                              {students
                                .filter((std) => {
                                  if (hw.assignedTo === 'all') return true;
                                  return Array.isArray(hw.assignedTo) && hw.assignedTo.includes(std.id);
                                })
                                .map((student) => {
                                  const sub = hwSubmissions.find((s) => s.studentId === student.id);
                                  return (
                                    <div
                                      key={student.id}
                                      className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                                        sub
                                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                                          : 'bg-slate-50 border-slate-200 text-slate-600'
                                      }`}
                                    >
                                      <span className="font-semibold truncate max-w-[150px]">
                                        {student.name}
                                      </span>
                                      <span className="text-[11px] font-bold">
                                        {sub ? (sub.status === 'on_time' ? '✓ Teslim Edildi' : '⚠️ Geç Teslim') : 'Teslim Edilmedi'}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* CREATE HOMEWORK MODAL */}
      {isCreateModalOpen && (() => {
        const currentClassStudents =
          selectedCreateClassId === 'all'
            ? students
            : students.filter(
                (s) =>
                  s.classId === selectedCreateClassId ||
                  (s.className && s.className.includes(selectedCreateClassId))
              );

        const currentClassStudentIds = currentClassStudents.map((s) => s.id);
        const allCurrentSelected =
          currentClassStudentIds.length > 0 &&
          currentClassStudentIds.every((id) => selectedStudentIds.includes(id));

        const selectedInCurrentCount = selectedStudentIds.filter((id) =>
          currentClassStudentIds.includes(id)
        ).length;

        const handleToggleAllCurrentClass = () => {
          if (allCurrentSelected) {
            setSelectedStudentIds(
              selectedStudentIds.filter((id) => !currentClassStudentIds.includes(id))
            );
          } else {
            const merged = Array.from(new Set([...selectedStudentIds, ...currentClassStudentIds]));
            setSelectedStudentIds(merged);
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5"
            onClick={() => setIsCreateModalOpen(false)}
          >
            <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
              <div
                className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                      <Target className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">ÖDEV</h3>
                  </div>
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateHomework} className="space-y-4">
                  {/* Okul ve Dersler Açılır Pencereleri */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                      <span className="text-xs font-bold text-indigo-900 flex items-center space-x-1.5">
                        <School className="w-4 h-4 text-indigo-600" />
                        <span>Ders & Kademe Seçimi</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Okul *
                        </label>
                        <select
                          value={schoolLevel}
                          onChange={(e) =>
                            handleSchoolLevelChange(e.target.value as 'Ortaokul' | 'Lise')
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                        >
                          <option value="Ortaokul">🏫 Ortaokul</option>
                          <option value="Lise">🎓 Lise</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Dersler *
                        </label>
                        <select
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                        >
                          {SCHOOL_SUBJECTS[schoolLevel].map((subj) => (
                            <option key={subj} value={subj}>
                              {subj}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Ödev Başlığı */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Ödev Başlığı *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ödev başlığını giriniz..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-slate-400 shadow-2xs"
                    />
                  </div>

                  {/* Ödev Açıklaması */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Ödev Açıklaması
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ödev açıklaması, teslim şartları ve detayları..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder-slate-400 shadow-2xs resize-y"
                    />
                  </div>

                  {/* Tarih (Son Teslim) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Tarih (Son Teslim Tarihi ve Saati) *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs"
                    />
                  </div>

                  {/* Video Ekleme, İnternet Linki Ekleme, PDF Ekleme */}
                  <HomeworkResourceUploader
                    resources={resources}
                    onChange={setResources}
                  />

                  {/* Sınıf Seçimi ve Öğrenci Listesi */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                    {/* Sınıf Seçimi */}
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                        <span className="flex items-center space-x-1.5">
                          <School className="w-4 h-4 text-indigo-600" />
                          <span>Sınıf Seçimi *</span>
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          Seçilen sınıfa ait öğrenciler aşağıda listelenir
                        </span>
                      </label>
                      <select
                        value={selectedCreateClassId}
                        onChange={(e) => {
                          const newClassId = e.target.value;
                          setSelectedCreateClassId(newClassId);
                          const targetStudents =
                            newClassId === 'all'
                              ? students
                              : students.filter(
                                  (s) =>
                                    s.classId === newClassId ||
                                    (s.className && s.className.includes(newClassId))
                                );
                          setSelectedStudentIds(targetStudents.map((s) => s.id));
                        }}
                        className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                      >
                        <option value="all">
                          🏫 Tüm Sınıflar ({classes.length} Sınıf, {students.length} Öğrenci)
                        </option>
                        {classes.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Öğrenci Listesi & Hepsi Seç Butonu */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-bold text-slate-800">
                            Öğrenci Seçimi ({selectedInCurrentCount} / {currentClassStudents.length} Seçili)
                          </span>
                        </div>

                        {currentClassStudents.length > 0 && (
                          <button
                            type="button"
                            onClick={handleToggleAllCurrentClass}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1"
                          >
                            <span>{allCurrentSelected ? 'Seçimi Kaldır' : 'Hepsi Seç'}</span>
                          </button>
                        )}
                      </div>

                      {currentClassStudents.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-500 font-medium">
                          Bu sınıfa kayıtlı öğrenci bulunamadı.
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                          {currentClassStudents.map((std) => {
                            const isChecked = selectedStudentIds.includes(std.id);
                            return (
                              <label
                                key={std.id}
                                className={`flex items-center space-x-2.5 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-semibold shadow-2xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleStudent(std.id)}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                />
                                <span className="truncate flex-1">{std.name}</span>
                                <span className="text-[11px] text-slate-500 shrink-0 font-normal">
                                  ({std.className || std.studentNumber || '-'})
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2.5">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 cursor-pointer transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>Ödevi Kaydet</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );
      })()}

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
