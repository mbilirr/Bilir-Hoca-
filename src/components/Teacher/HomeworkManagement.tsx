import React, { useState, useRef } from 'react';
import { ExpandableStrip, StripAction, StripProgress } from '../ui/ExpandableStrip';
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
  Copy,
  CalendarRange,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Homework, HomeworkSubmission, Student, ClassGroup, HomeworkResource, HomeworkCheckStatus } from '../../types';
import { dataService } from '../../services/dataService';
import { createGoogleCalendarUrlForHomework, downloadIcsFile } from '../../lib/calendar';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal';
import { HomeworkResourceUploader } from './HomeworkResourceUploader';
import { removeStoredFiles, storedPathsOf } from '../../lib/fileStorage';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { HomeworkFormModal, type HomeworkFormMode, type HomeworkFormSaved } from './HomeworkFormModal';
import { callMail, describeMailResult } from '../../lib/mailApi';
import { MailNoticeBar } from './FormParts';
import { HomeworkDetailModal } from './HomeworkDetailModal';
import {
  SubmissionViewModal,
  submissionHasContent,
  getSubmissionAttachmentCount,
} from './SubmissionViewModal';
import { useQuickFocus } from '../../lib/quickFocus';
import { PageHeader, Segmented } from '../ui/kit';
import { StudyPlanManager } from './StudyPlanManager';

interface HomeworkManagementProps {
  homeworks: Homework[];
  submissions?: HomeworkSubmission[];
  students: Student[];
  classes: ClassGroup[];
  onNavigateToEtut?: (subject: string, outcome: string) => void;
}


export const HomeworkManagement: React.FC<HomeworkManagementProps> = ({
  homeworks,
  submissions: propSubmissions,
  students,
  classes,
  onNavigateToEtut,
}) => {
  // Teslimler her zaman güncel veriden okunur (öğrenci teslim edince öğretmen ekranı kendiliğinden yenilenir)
  const submissions: HomeworkSubmission[] = propSubmissions || dataService.getSubmissions() || [];

  // View Mode: 'tracker' (Ödev Kontrol Çizelgesi) | 'all' (Tüm Oluşturulan Ödevler)
  const [activeTab, setActiveTab] = useState<'tracker' | 'all' | 'plan'>('tracker');

  // Ödev Kontrol Seçimleri
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>(''); // Ödev Kontrol'de açık olan şerit
  const [selectedClassIdForCheck, setSelectedClassIdForCheck] = useState<string>('');
  const [selectedStudentIdForCheck, setSelectedStudentIdForCheck] = useState<string>('');
  const [studentSearchInput, setStudentSearchInput] = useState<string>('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingChecks, setIsSavingChecks] = useState(false);
  const showSaveError = (err: any, fallback: string) => {
    setSaveFeedback(null);
    setSaveError(err?.message || fallback);
    setTimeout(() => setSaveError(null), 6000);
  };

  // Taslak / Henüz Kaydedilmemiş Ödev Kontrol Durumları (studentId -> status)
  const [draftCheckStatuses, setDraftCheckStatuses] = useState<Record<string, HomeworkCheckStatus>>({});


  // Bir ödevi "Ödev Kontrol" ekranında açar: uygun sınıfı seçer, süzgeçleri temizler
  const focusHomeworkInTracker = (hw: Homework, switchTab = true) => {
    const targetIds = (hw.targetClassIds || []).filter(Boolean);
    const ids =
      Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0
        ? Array.from(new Set(students.filter((s) => (hw.assignedTo as string[]).includes(s.id)).map((s) => s.classId).filter(Boolean) as string[]))
        : targetIds.length > 0
          ? targetIds
          : hw.classId && hw.classId !== 'class-default'
            ? [hw.classId]
            : [];
    setSelectedClassIdForCheck((prev) => {
      if (prev && (ids.length === 0 || ids.includes(prev))) return prev;
      return ids.find((id) => classes.some((c) => c.id === id)) || prev || classes[0]?.id || '';
    });
    setSelectedHomeworkId(hw.id);
    setTrackerSearch('');
    setTrackerFilterSubject('all');
    setStudentSearchInput('');
    setDraftCheckStatuses({});
    if (switchTab) setActiveTab('tracker');
  };

  // Hızlı arama / ana sayfa kısayolu: seçilen ödevi kontrol ekranında aç veya yeni ödev penceresini aç
  useQuickFocus(['homework', 'action'], (f) => {
    if (f.type === 'homework') {
      const hw = homeworks.find((h) => h.id === f.id);
      if (hw) focusHomeworkInTracker(hw);
      else {
        setActiveTab('tracker');
        setSelectedHomeworkId(f.id);
      }
    } else if (f.id === 'homework-create') {
      openHomeworkForm('create');
    }
  });
  const [selectedHwForGrading, setSelectedHwForGrading] = useState<Homework | null>(null);
  const [expandedHwId, setExpandedHwId] = useState<string | null>(null);
  const [homeworkToDelete, setHomeworkToDelete] = useState<Homework | null>(null);
  // Öğretmenin incelediği öğrenci teslimi (ödev + öğrenci). Teslim her zaman güncel listeden okunur.
  const [viewingSubmissionKey, setViewingSubmissionKey] = useState<{ homeworkId: string; studentId: string } | null>(null);
  const [editingResourcesHw, setEditingResourcesHw] = useState<Homework | null>(null);
  const [editingResourcesList, setEditingResourcesList] = useState<HomeworkResource[]>([]);

  // Kolay Ödev Bulma & Filtreleme Açılır Penceresi State'leri
  const [hwSearchQuery, setHwSearchQuery] = useState('');
  const [hwFilterSubject, setHwFilterSubject] = useState('all');
  const [hwFilterClassId, setHwFilterClassId] = useState('all');
  const [isHwSearchDropdownOpen, setIsHwSearchDropdownOpen] = useState(false);


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

  // Ödev Kontrol süzgeçleri: arama + ders (sınıf: selectedClassIdForCheck)
  const [trackerSearch, setTrackerSearch] = useState<string>('');
  const [trackerFilterSubject, setTrackerFilterSubject] = useState<string>('all');

  // Sayfanın Hepsi Açılsın Modal State'i (Görüntüle Butonu)
  const [activeViewingHomework, setActiveViewingHomework] = useState<Homework | null>(null);

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

    const assignedCount = students.filter((std) => dataService.isHomeworkForStudent(hw, std)).length;

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
            ${String(hw.teacherName || hw.createdByName || '').replace(/[<>&]/g, '') || '&nbsp;'}<br>
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

  // Materyal düzenleme penceresi durumları
  const [editingPendingResource, setEditingPendingResource] = useState<HomeworkResource | null>(null);
  const [isSavingResources, setIsSavingResources] = useState(false);
  const [isEditUploadBusy, setIsEditUploadBusy] = useState(false);

  // Ödev oluştur / kopyala / düzenle penceresi (Aşama 9)
  const [homeworkForm, setHomeworkForm] = useState<{ mode: HomeworkFormMode; source: Homework | null } | null>(null);
  const openHomeworkForm = (mode: HomeworkFormMode, source: Homework | null = null) => setHomeworkForm({ mode, source });
  // Otomatik e-posta sonucu (kapatılana kadar görünür)
  const [mailNotice, setMailNotice] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null);

  const handleHomeworkSaved = ({ homework: hw, mode, sendMail }: HomeworkFormSaved) => {
    setHomeworkForm(null);
    setSaveError(null);
    if (mode === 'edit') {
      setSaveFeedback('Ödev güncellendi.');
      setTimeout(() => setSaveFeedback(null), 3500);
      return;
    }
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    setActiveTab('all');
    setExpandedHwId(hw.id);
    focusHomeworkInTracker(hw, false);
    setSaveFeedback(`"${hw.title}" ödevi kaydedildi.`);
    setTimeout(() => setSaveFeedback(null), 3500);
    if (sendMail) {
      setMailNotice({ tone: 'info', text: 'Öğrencilere e-posta gönderiliyor…' });
      callMail('homework-created', { homeworkId: hw.id }).then((r) => setMailNotice(describeMailResult(r)));
    } else {
      setMailNotice(null);
    }
  };


  const closeEditResourcesModal = () => {
    if (isSavingResources) return;
    if (editingResourcesHw) {
      const saved = new Set(storedPathsOf(editingResourcesHw.resources));
      const unsaved = storedPathsOf(editingResourcesList).filter((p) => !saved.has(p));
      if (unsaved.length > 0) removeStoredFiles(unsaved);
    }
    setEditingResourcesHw(null);
    setEditingPendingResource(null);
  };

  const handleOpenEditResources = (hw: Homework) => {
    setEditingResourcesHw(hw);
    setEditingResourcesList(hw.resources || []);
  };

  const handleSaveEditedResources = async () => {
    if (!editingResourcesHw || isSavingResources) return;
    const finalResources = editingPendingResource
      ? [...editingResourcesList, { ...editingPendingResource, id: `res-${Date.now()}` }]
      : editingResourcesList;
    setIsSavingResources(true);
    try {
      await dataService.updateHomework(editingResourcesHw.id, { resources: finalResources });
      setEditingResourcesHw(null);
      setEditingPendingResource(null);
      setSaveError(null);
      setSaveFeedback('Ödev materyalleri kaydedildi.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } catch (err: any) {
      showSaveError(err, 'Materyaller kaydedilemedi.');
    } finally {
      setIsSavingResources(false);
    }
  };

  // Selected Homework for Tracking
  const selectedHomework =
    homeworks.find((h) => h.id === selectedHomeworkId) || homeworks[0] || null;

  // ---- Ödev Kontrol yardımcıları ----
  // Ödev bu sınıfa verilmiş mi? (öğrenciye özel ödevlerde sınıftan en az bir öğrenci olmalı)
  const homeworkTargetsClass = (hw: Homework, classId: string, classStudents: Student[]): boolean => {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) {
      const ids = hw.assignedTo;
      return classStudents.some((s) => ids.includes(s.id));
    }
    const targetIds = (hw.targetClassIds || []).filter(Boolean);
    if (targetIds.length > 0) return targetIds.includes(classId);
    if (hw.classId && hw.classId !== 'class-default') return hw.classId === classId;
    return true; // hedefi belirtilmemiş eski ödevler tüm sınıflarda görünür
  };

  // Sınıftaki öğrencilerden bu ödevin verildikleri
  const studentsForHomeworkInClass = (hw: Homework, classStudents: Student[]): Student[] => {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) {
      const ids = hw.assignedTo;
      return classStudents.filter((s) => ids.includes(s.id));
    }
    return classStudents;
  };

  // Kayıtlı kontrol durumu (teslim zamanında/geç ise "Yaptı" sayılır)
  const savedCheckStatusOf = (sub?: HomeworkSubmission): HomeworkCheckStatus | '' => {
    if (!sub) return '';
    if (sub.checkStatus) return sub.checkStatus;
    if (sub.status === 'on_time' || sub.status === 'late') return 'yapti';
    return '';
  };

  // Son teslim etiketi: "3 gün kaldı", "Bugün son gün", "Süresi doldu"
  const dueInfoOf = (dueDate?: string): { label: string; cls: string } => {
    const d = dueDate ? new Date(dueDate) : null;
    if (!d || isNaN(d.getTime())) return { label: 'Tarih yok', cls: 'bg-surface-2 text-muted' };
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(d) - startOf(new Date())) / 86400000);
    if (diff < 0) return { label: 'Süresi doldu', cls: 'bg-surface-2 text-muted' };
    if (diff === 0) return { label: 'Bugün son gün', cls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' };
    if (diff === 1) return { label: 'Yarın son gün', cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' };
    if (diff <= 3) return { label: `${diff} gün kaldı`, cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' };
    return { label: `${diff} gün kaldı`, cls: 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300' };
  };

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

  const handleSaveAllChecks = async () => {
    if (!selectedHomework) return;
    const modifiedStudentIds = Object.keys(draftCheckStatuses);
    if (modifiedStudentIds.length === 0) {
      setSaveFeedback('Kaydedilecek yeni bir değişiklik bulunmuyor.');
      setTimeout(() => setSaveFeedback(null), 2500);
      return;
    }

    if (isSavingChecks) return;
    setIsSavingChecks(true);
    try {
      await dataService.saveHomeworkCheckStatuses(
        selectedHomework.id,
        modifiedStudentIds.map((studentId) => ({ studentId, checkStatus: draftCheckStatuses[studentId] }))
      );
      const count = modifiedStudentIds.length;
      setDraftCheckStatuses({});
      setSaveError(null);
      setSaveFeedback(`✓ ${count} öğrencinin ödev kontrol durumu başarıyla sisteme kaydedildi!`);
      setTimeout(() => setSaveFeedback(null), 3500);
    } catch (err: any) {
      showSaveError(err, 'Ödev kontrol durumları kaydedilemedi.');
    } finally {
      setIsSavingChecks(false);
    }
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
      {/* Sayfa başlığı */}
      <PageHeader
        icon={BookOpen}
        tone="success"
        title="Ödevler"
        description="Ödev oluşturun, teslimleri kontrol edin"
        actions={
          <button
            type="button"
            onClick={() => {
              openHomeworkForm('create');
            }}
            id="btn-create-homework"
            className="ui-btn ui-btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span>Ödev Oluştur</span>
          </button>
        }
      />
      <Segmented
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        items={[
          { value: 'tracker', label: 'Ödev Kontrol', icon: CheckCircle2, id: 'btn-tab-tracker' },
          { value: 'all', label: `Tüm Ödevler (${homeworks.length})`, icon: FileText, id: 'btn-tab-all' },
          { value: 'plan', label: 'Haftalık Plan', icon: CalendarRange, id: 'btn-tab-plan' },
        ]}
      />

      {saveFeedback && (
        <div className="flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-semibold animate-in fade-in">
          <Check className="w-3.5 h-3.5" />
          <span>{saveFeedback}</span>
        </div>
      )}
      {saveError && (
        <div role="alert" className="flex items-center space-x-1.5 px-4 py-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{saveError}</span>
        </div>
      )}
      {mailNotice && <MailNoticeBar notice={mailNotice} onClose={() => setMailNotice(null)} />}

      {/* TAB 3: HAFTALIK ÇALIŞMA PLANI (Aşama 19) */}
      {activeTab === 'plan' && <StudyPlanManager students={students} classes={classes} />}

      {/* TAB 1: ÖDEV KONTROL — üstte arama/sınıf/ders çubuğu, altta ödev şeritleri */}
      {activeTab === 'tracker' && (() => {
        if (homeworks.length === 0) {
          return (
            <div className="bg-surface border border-line rounded-2xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-fg mb-2">Henüz Kayıtlı Ödev Bulunmuyor</h3>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                Ödev kontrolü yapabilmek için lütfen önce sisteme bir ödev ekleyiniz.
              </p>
              <button
                type="button"
                onClick={() => openHomeworkForm('create')}
                className="ui-btn ui-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Ödevi Oluştur</span>
              </button>
            </div>
          );
        }

        // 1. Seçili sınıf (tek sınıf varsa kendiliğinden seçilir)
        const effectiveClassId =
          selectedClassIdForCheck && classes.some((c) => c.id === selectedClassIdForCheck)
            ? selectedClassIdForCheck
            : classes.length === 1
              ? classes[0].id
              : '';
        const currentClass = classes.find((c) => c.id === effectiveClassId) || null;
        const classAllStudents = currentClass ? students.filter((s) => s.classId === currentClass.id) : [];

        // 2. Bu sınıfa verilen ödevler ve dersleri
        const classHomeworks = currentClass
          ? homeworks.filter((hw) => homeworkTargetsClass(hw, currentClass.id, classAllStudents))
          : [];
        const classSubjects = Array.from(new Set(classHomeworks.map((h) => h.subject).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b, 'tr')
        );
        const subjectFilter =
          trackerFilterSubject !== 'all' && classSubjects.includes(trackerFilterSubject) ? trackerFilterSubject : 'all';

        // 3. Arama + ders süzgeci. Sıralama: önce süresi bugün dolan/dolmuş ödevler (en yenisi üstte),
        //    sonra yaklaşan ödevler (en yakını üstte)
        const endOfToday = (() => {
          const d = new Date();
          d.setHours(23, 59, 59, 999);
          return d.getTime();
        })();
        const dueMs = (hw: Homework) => {
          const t = new Date(hw.dueDate).getTime();
          return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
        };
        const searchQ = trackerSearch.trim().toLocaleLowerCase('tr-TR');
        const stripHomeworks = classHomeworks
          .filter((hw) => subjectFilter === 'all' || hw.subject === subjectFilter)
          .filter((hw) => {
            if (!searchQ) return true;
            const hay = [hw.title, hw.subject, hw.description, ...(hw.outcomes || [])]
              .filter(Boolean)
              .join(' ')
              .toLocaleLowerCase('tr-TR');
            return hay.includes(searchQ);
          })
          .sort((a, b) => {
            const ta = dueMs(a);
            const tb = dueMs(b);
            const pa = ta <= endOfToday;
            const pb = tb <= endOfToday;
            if (pa !== pb) return pa ? -1 : 1;
            return pa ? tb - ta : ta - tb;
          });

        const isTrackerFiltered = Boolean(selectedClassIdForCheck) || subjectFilter !== 'all' || searchQ !== '';

        // 4. Açık olan ödev şeridi ve öğrencileri
        const currentHw = stripHomeworks.find((h) => h.id === selectedHomeworkId) || null;
        const classStudents = currentHw ? studentsForHomeworkInClass(currentHw, classAllStudents) : [];

        const displayedStudents = classStudents.filter((std) => {
          if (!studentSearchInput.trim()) return true;
          const q = studentSearchInput.toLocaleLowerCase('tr-TR').trim();
          return (
            std.name.toLocaleLowerCase('tr-TR').includes(q) ||
            (std.studentNumber && std.studentNumber.includes(q))
          );
        });

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
        const handleStatusClick = async (studentId: string, status: HomeworkCheckStatus) => {
          if (!currentHw) return;
          setDraftCheckStatuses((prev) => {
            const next = { ...prev };
            delete next[studentId];
            return next;
          });
          try {
            await dataService.saveHomeworkCheckStatuses(currentHw.id, [{ studentId, checkStatus: status }]);
            setSaveError(null);
          } catch (err: any) {
            showSaveError(err, 'Kontrol durumu kaydedilemedi.');
          }
        };

        // Toplu durum belirleme
        const handleBulkStatusChange = async (status: HomeworkCheckStatus) => {
          if (!currentHw || classStudents.length === 0 || isSavingChecks) return;
          setIsSavingChecks(true);
          try {
            await dataService.saveHomeworkCheckStatuses(
              currentHw.id,
              classStudents.map((std) => ({ studentId: std.id, checkStatus: status }))
            );
          } catch (err: any) {
            showSaveError(err, 'Toplu kontrol durumu kaydedilemedi.');
            return;
          } finally {
            setIsSavingChecks(false);
          }
          setDraftCheckStatuses({});
          setSaveError(null);
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

        const toggleStrip = (hw: Homework) => {
          setDraftCheckStatuses({});
          setStudentSearchInput('');
          if (currentHw && currentHw.id === hw.id) {
            setSelectedHomeworkId('');
            return;
          }
          setSelectedHomeworkId(hw.id);
          setTimeout(() => {
            document.getElementById(`hw-strip-${hw.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        };

        const clearTrackerFilters = () => {
          setTrackerSearch('');
          setTrackerFilterSubject('all');
          setSelectedClassIdForCheck('');
          setSelectedHomeworkId('');
        };

        return (
          <div className="space-y-4">
            {/* Arama ve süzgeç çubuğu (Tüm Ödevler ekranıyla aynı düzen) */}
            <div id="tracker-filter-bar" className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Hızlı Arama Kutusu */}
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                    <input
                      type="text"
                      id="tracker-search-input"
                      value={trackerSearch}
                      onChange={(e) => setTrackerSearch(e.target.value)}
                      placeholder="Ödev başlığı, ders veya konu ara..."
                      className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-8 py-2 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500 focus:bg-surface transition-colors"
                    />
                    {trackerSearch && (
                      <button
                        type="button"
                        onClick={() => setTrackerSearch('')}
                        aria-label="Aramayı temizle"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Sınıf Seçimi */}
                  <div className="flex items-center">
                    <select
                      id="tracker-class-select"
                      aria-label="Sınıf seçiniz"
                      value={effectiveClassId}
                      onChange={(e) => {
                        setSelectedClassIdForCheck(e.target.value);
                        setDraftCheckStatuses({});
                        setStudentSearchInput('');
                      }}
                      className={`bg-surface-2 border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-surface cursor-pointer ${
                        effectiveClassId ? 'border-line text-fg-2' : 'border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      <option value="">Sınıf Seçiniz</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ders Seçimi */}
                  <div className="flex items-center">
                    <select
                      id="tracker-subject-select"
                      aria-label="Ders seçiniz"
                      value={subjectFilter}
                      onChange={(e) => setTrackerFilterSubject(e.target.value)}
                      disabled={!currentClass}
                      className="bg-surface-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-2 font-medium focus:outline-none focus:border-indigo-500 focus:bg-surface cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="all">Tüm Dersler</option>
                      {classSubjects.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtreleri Temizle */}
                  {isTrackerFiltered && (
                    <button
                      type="button"
                      onClick={clearTrackerFilters}
                      className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Filtreleri Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç */}
                <div className="flex items-center lg:justify-end shrink-0">
                  <span className="text-xs text-muted font-medium">
                    {currentClass ? (
                      <>
                        <strong className="text-fg">{currentClass.name}</strong> · {stripHomeworks.length} ödev ·{' '}
                        {classAllStudents.length} öğrenci
                      </>
                    ) : (
                      <>Toplam {homeworks.length} ödev</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Sınıf seçilmeden önce yönlendirme */}
            {!currentClass ? (
              <div className="bg-surface border border-line rounded-2xl p-10 text-center shadow-sm space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center mx-auto">
                  <School className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-fg">Kontrol edilecek sınıfı seçin</p>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Yukarıdaki <strong>Sınıf Seçiniz</strong> kutusundan sınıfı, isterseniz dersi de seçin. O sınıfın ödevleri
                  burada şerit hâlinde listelenir; kontrol etmek için ödevin üzerine tıklayın.
                </p>
              </div>
            ) : stripHomeworks.length === 0 ? (
              <div className="bg-surface border border-line rounded-2xl p-10 text-center shadow-sm space-y-3">
                <Search className="w-10 h-10 mx-auto text-subtle" />
                <p className="text-sm font-bold text-fg">
                  {classHomeworks.length === 0
                    ? `${currentClass.name} sınıfına verilmiş ödev bulunmuyor.`
                    : 'Seçimlerinize uygun ödev bulunamadı.'}
                </p>
                {classHomeworks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackerSearch('');
                      setTrackerFilterSubject('all');
                    }}
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                  >
                    Ders ve aramayı sıfırla
                  </button>
                )}
              </div>
            ) : (
              <div id="tracker-hw-strips" className="space-y-2.5">
                {stripHomeworks.map((hw) => {
                  const isOpen = currentHw?.id === hw.id;
                  const hwStudents = studentsForHomeworkInClass(hw, classAllStudents);
                  const total = hwStudents.length;
                  const tally = { yapti: 0, yapmadi: 0, eksik: 0, izinli: 0, gelmedi: 0 } as Record<HomeworkCheckStatus, number>;
                  let delivered = 0;
                  hwStudents.forEach((std) => {
                    const sub = submissions.find((s) => s.homeworkId === hw.id && s.studentId === std.id);
                    if (sub && submissionHasContent(sub)) delivered++;
                    const st = savedCheckStatusOf(sub);
                    if (st) tally[st]++;
                  });
                  const checked = tally.yapti + tally.yapmadi + tally.eksik + tally.izinli + tally.gelmedi;
                  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
                  const due = dueInfoOf(hw.dueDate);
                  const resourceCount = (hw.resources?.length || 0) + (hw.attachmentUrl ? 1 : 0);

                  return (
                    <div
                      key={hw.id}
                      className={`rounded-2xl border bg-surface transition-all scroll-mt-24 ${
                        isOpen
                          ? 'border-indigo-400 dark:border-indigo-500/60 ring-2 ring-indigo-500/15 shadow-md'
                          : 'border-line hover:border-line-strong shadow-sm'
                      }`}
                      id={`hw-strip-${hw.id}`}
                    >
                      {/* Şerit: ödev özet bilgileri */}
                      <button
                        type="button"
                        onClick={() => toggleStrip(hw)}
                        aria-expanded={isOpen}
                        className="w-full text-left p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-5 cursor-pointer"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                                {hw.subject}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${due.cls}`}
                              >
                                <Clock className="w-3 h-3" />
                                {due.label}
                              </span>
                              {resourceCount > 0 && (
                                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-2 text-muted inline-flex items-center gap-1">
                                  <Paperclip className="w-3 h-3" />
                                  {resourceCount} kaynak
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-fg truncate">{hw.title}</h4>
                            <p className="text-xs text-muted truncate mt-0.5">
                              Son teslim: {formatDueDateTurkish(hw.dueDate)}
                              {hw.description ? ` · ${hw.description}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 md:w-[24rem] shrink-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px] font-semibold">
                              <span className="text-muted">Kontrol</span>
                              <span className="text-fg">
                                {checked}/{total}
                                <span className="text-muted font-medium"> · Teslim {delivered}</span>
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all ${checked === total && total > 0 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[11px] font-semibold">
                              <span className="text-emerald-700 dark:text-emerald-300">Yaptı {tally.yapti}</span>
                              <span className="text-rose-700 dark:text-rose-300">Yapmadı {tally.yapmadi}</span>
                              <span className="text-amber-700 dark:text-amber-300">Eksik {tally.eksik}</span>
                              {tally.izinli > 0 && <span className="text-sky-700 dark:text-sky-300">İzinli {tally.izinli}</span>}
                              {tally.gelmedi > 0 && <span className="text-purple-700 dark:text-purple-300">Gelmedi {tally.gelmedi}</span>}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                              isOpen ? 'bg-indigo-600 text-white' : 'bg-surface-2 text-fg-2 border border-line'
                            }`}
                          >
                            {isOpen ? 'Kapat' : 'Kontrol Et'}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </span>
                        </div>
                      </button>

                      {/* Açılan kontrol paneli: öğrenci listesi ve durumlar */}
                      {isOpen && currentHw && currentClass && (
                        <div id="hw-check-panel" className="border-t border-line p-3.5 sm:p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3 className="text-sm sm:text-base font-bold text-fg truncate">
                                {currentClass.name} — Öğrenci Listesi
                              </h3>
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shrink-0">
                                {classStudents.length} öğrenci
                              </span>
                            </div>
                            <div className="relative w-full sm:w-64">
                              <Search className="w-3.5 h-3.5 text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={studentSearchInput}
                                onChange={(e) => setStudentSearchInput(e.target.value)}
                                placeholder="Öğrenci adı veya numarası ara..."
                                className="w-full bg-surface-2 border border-line rounded-xl pl-8 pr-3 py-1.5 text-xs text-fg placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                            </div>
                          </div>

                          {/* Sayaçlar */}
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            <div className="p-2.5 rounded-xl bg-surface-2 border border-line text-center">
                              <span className="text-[10px] uppercase font-bold text-muted block">Toplam</span>
                              <span className="text-base font-bold text-fg">{classStudents.length}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-center">
                              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 block">Yaptı</span>
                              <span className="text-base font-bold text-emerald-800 dark:text-emerald-200">{countYapti}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-center">
                              <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-300 block">Yapmadı</span>
                              <span className="text-base font-bold text-rose-800 dark:text-rose-200">{countYapmadi}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-center">
                              <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 block">Eksik</span>
                              <span className="text-base font-bold text-amber-800 dark:text-amber-200">{countEksik}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-center">
                              <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-300 block">İzinli</span>
                              <span className="text-base font-bold text-sky-800 dark:text-sky-200">{countIzinli}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 text-center">
                              <span className="text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300 block">Gelmedi</span>
                              <span className="text-base font-bold text-purple-800 dark:text-purple-200">{countGelmedi}</span>
                            </div>
                          </div>

                          {/* Toplu İşlem Butonları */}
                          <div className="p-3 rounded-xl bg-surface-2/80 border border-line flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-fg-2">
                              Sınıf İçin Hızlı İşlem:
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('yapti')}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                ✓ Tümünü Yaptı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('yapmadi')}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                ✕ Tümünü Yapmadı
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('eksik')}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                ⚠ Tümünü Eksik
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('izinli')}
                                className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                ℹ Tümünü İzinli
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBulkStatusChange('gelmedi')}
                                className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-bold transition-all cursor-pointer"
                              >
                                ○ Tümünü Gelmedi
                              </button>
                            </div>
                          </div>

                          {/* ALT ALTA SIRALANMIŞ BEYAZ MİNİMALİST ÖĞRENCİ LİSTESİ */}
                          {classStudents.length === 0 ? (
                            <div className="py-8 text-center text-subtle text-xs">
                              "{currentClass.name}" sınıfına henüz kayıtlı öğrenci bulunmuyor.
                            </div>
                          ) : displayedStudents.length === 0 ? (
                            <div className="py-8 text-center text-subtle text-xs">
                              "{studentSearchInput}" aramasına uygun öğrenci bulunamadı.
                            </div>
                          ) : (
                            <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface shadow-xs">
                              {displayedStudents.map((std, idx) => {
                                const currentStatus = getStudentCheckStatus(std.id);
                                return (
                                  <div
                                    key={std.id}
                                    className="p-3 sm:p-3.5 hover:bg-surface-2/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                                  >
                                    {/* Öğrenci Bilgisi */}
                                    <div className="flex items-center space-x-3 min-w-0">
                                      <span className="w-6 text-center text-xs font-mono text-subtle font-semibold shrink-0">
                                        {idx + 1}
                                      </span>
                                      <img
                                        src={std.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(std.name)}`}
                                        alt={std.name}
                                        className="w-8 h-8 rounded-full bg-surface-2 object-cover border border-line shrink-0"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-fg truncate">{std.name}</h4>
                                        {(() => {
                                          const stdSub = currentHw
                                            ? submissions.find((s) => s.homeworkId === currentHw.id && s.studentId === std.id)
                                            : undefined;
                                          if (!currentHw || !stdSub || !submissionHasContent(stdSub)) return null;
                                          const attachCount = getSubmissionAttachmentCount(stdSub);
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => setViewingSubmissionKey({ homeworkId: currentHw.id, studentId: std.id })}
                                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 hover:underline cursor-pointer"
                                            >
                                              <Paperclip className="w-3 h-3" />
                                              <span>
                                                Teslimi Gör{attachCount > 0 ? ` (${attachCount} ek)` : ' (not)'}
                                                {stdSub.status === 'late' ? ' · Geç' : ''}
                                              </span>
                                            </button>
                                          );
                                        })()}
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
                                            : 'bg-surface-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-fg-2 hover:text-emerald-700 dark:hover:text-emerald-300 border border-line hover:border-emerald-300 dark:hover:border-emerald-500/30'
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
                                            : 'bg-surface-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-fg-2 hover:text-rose-700 dark:hover:text-rose-300 border border-line hover:border-rose-300 dark:hover:border-rose-500/30'
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
                                            : 'bg-surface-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-fg-2 hover:text-amber-700 dark:hover:text-amber-300 border border-line hover:border-amber-300 dark:hover:border-amber-500/30'
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
                                            : 'bg-surface-2 hover:bg-sky-50 dark:hover:bg-sky-500/10 text-fg-2 hover:text-sky-700 dark:hover:text-sky-300 border border-line hover:border-sky-300 dark:hover:border-sky-500/30'
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
                                            : 'bg-surface-2 hover:bg-purple-50 dark:hover:bg-purple-500/10 text-fg-2 hover:text-purple-700 dark:hover:text-purple-300 border border-line hover:border-purple-300 dark:hover:border-purple-500/30'
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
                })}
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
            <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Sol: Arama Kutusu ve Dropdown Filtreler */}
                <div className="flex flex-wrap items-center gap-2.5 flex-1">
                  {/* Hızlı Arama Kutusu */}
                  <div className="relative min-w-[220px] flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                    <input
                      type="text"
                      value={hwSearchQuery}
                      onChange={(e) => setHwSearchQuery(e.target.value)}
                      placeholder="Ödev başlığı, ders veya konu ara..."
                      className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-8 py-2 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500 focus:bg-surface transition-colors"
                    />
                    {hwSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setHwSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
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
                      className="bg-surface-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-2 font-medium focus:outline-none focus:border-indigo-500 focus:bg-surface cursor-pointer"
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
                      className="bg-surface-2 border border-line rounded-xl px-3 py-2 text-xs text-fg-2 font-medium focus:outline-none focus:border-indigo-500 focus:bg-surface cursor-pointer"
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
                      className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-muted text-xs font-semibold cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Filtreleri Temizle</span>
                    </button>
                  )}
                </div>

                {/* Sağ: Sayaç & Yeni Ödev Butonu */}
                <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                  <span className="text-xs text-muted font-medium">
                    Toplam <strong>{filteredHomeworks.length}</strong> / {homeworks.length} ödev
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      openHomeworkForm('create');
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
              <div className="bg-surface border border-line rounded-2xl p-12 text-center text-muted space-y-3 shadow-sm">
                <Search className="w-10 h-10 mx-auto text-subtle" />
                <p className="text-sm font-bold text-fg">Arama kriterlerinize uygun ödev bulunamadı.</p>
                <p className="text-xs text-muted max-w-sm mx-auto">
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
              <div className="space-y-2" id="hw-all-strips">
                {filteredHomeworks.map((hw) => {
                  const hwSubmissions = submissions.filter((s) => s.homeworkId === hw.id);
                  const isExpanded = expandedHwId === hw.id;

                  const hwStudents = students.filter((std) => dataService.isHomeworkForStudent(hw, std));
                  const assignedCount = hwStudents.length;

                  const isOverdue = new Date() > new Date(hw.dueDate);
                  const targetClassNames = (hw.targetClassIds || [])
                    .map((cid) => classes.find((c) => c.id === cid)?.name)
                    .filter(Boolean);
                  const resourceCount = (hw.resources?.length || 0) + (hw.attachmentUrl ? 1 : 0);
                  const classText = targetClassNames.length > 0 ? targetClassNames.join(', ') : 'Tüm Sınıflar';
                  const whoText = hw.assignedTo === 'all' ? 'Tüm Öğrenciler' : `${assignedCount} Öğrenci`;
                  const allOutcomes = Array.from(new Set([...(hw.outcomes || []), ...(hw.learningOutcomes || [])].filter(Boolean)));

                  return (
                    <ExpandableStrip
                      key={hw.id}
                      id={`hw-card-${hw.id}`}
                      noun="Ödev"
                      open={isExpanded}
                      onToggle={() => setExpandedHwId(isExpanded ? null : hw.id)}
                      accent={isOverdue ? 'border-l-slate-300 dark:border-l-slate-600' : 'border-l-indigo-500'}
                      badges={
                        <>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                            {hw.subject}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                              isOverdue
                                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {new Date(hw.dueDate).toLocaleDateString('tr-TR')}
                          </span>
                          {resourceCount > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-2 text-muted inline-flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              {resourceCount}
                            </span>
                          )}
                        </>
                      }
                      title={hw.title}
                      meta={`${classText} · ${whoText}${hw.description ? ` · ${hw.description}` : ''}`}
                      stats={<StripProgress label="Teslim" value={hwSubmissions.length} total={assignedCount} />}
                      actions={
                        <>
                          <StripAction label="Ödevi görüntüle" onClick={() => setActiveViewingHomework(hw)}>
                            <Eye className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="Kontrol Et" tone="success" onClick={() => focusHomeworkInTracker(hw)}>
                            <CheckCircle2 className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="İndir (.doc)" onClick={() => handleDownloadHomeworkDoc(hw)}>
                            <Download className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="Kopyala (başka sınıfa da ver)" id={`btn-copy-hw-${hw.id}`} onClick={() => openHomeworkForm('copy', hw)}>
                            <Copy className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="Ödevi düzenle" id={`btn-edit-hw-${hw.id}`} onClick={() => openHomeworkForm('edit', hw)}>
                            <Edit3 className="w-4 h-4" />
                          </StripAction>
                          <StripAction label="Ödevi sil" tone="danger" onClick={() => setHomeworkToDelete(hw)}>
                            <Trash2 className="w-4 h-4" />
                          </StripAction>
                        </>
                      }
                    >
                      <div className="grid gap-4 lg:grid-cols-2" data-hw-detail>
                        <div className="space-y-3 min-w-0">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Açıklama</p>
                            <p className="text-sm text-fg-2 whitespace-pre-wrap break-words mt-1">
                              {hw.description || 'Ödev açıklaması bulunmuyor.'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-1">
                              <School className="w-3.5 h-3.5" /> <strong className="text-fg-2">{classText}</strong>
                            </span>
                            <span>{whoText}</span>
                            <span>Son teslim: {formatDueDateTurkish(hw.dueDate)}</span>
                            {hw.schoolLevel && <span>{hw.schoolLevel}</span>}
                          </div>
                          {allOutcomes.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Kazanımlar</p>
                              <ul className="mt-1 space-y-0.5 text-xs text-fg-2 list-disc pl-4">
                                {allOutcomes.map((o, i) => (
                                  <li key={i}>{o}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {resourceCount > 0 && (
                            <HomeworkResourceViewer resources={hw.resources} legacyAttachmentUrl={hw.attachmentUrl} isCompact />
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveViewingHomework(hw)}
                              className="ui-btn ui-btn-primary ui-btn-sm"
                              title="Ödev detayını tam sayfa görüntüle"
                            >
                              <Eye className="w-3.5 h-3.5" /> Görüntüle
                            </button>
                            <button
                              type="button"
                              onClick={() => focusHomeworkInTracker(hw)}
                              className="ui-btn ui-btn-secondary ui-btn-sm"
                              title="Ödev kontrol çizelgesini aç"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Kontrol Et
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditResources(hw)}
                              className="ui-btn ui-btn-secondary ui-btn-sm"
                              title="Materyalleri yönet"
                            >
                              <Paperclip className="w-3.5 h-3.5" /> Materyal
                            </button>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1.5">
                            Öğrenci Teslim Listesi ({hwSubmissions.length}/{assignedCount})
                          </h4>
                          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                            {hwStudents.length === 0 && <p className="text-xs text-muted">Bu ödeve atanmış öğrenci yok.</p>}
                            {hwStudents.map((student) => {
                              const sub = hwSubmissions.find((s) => s.studentId === student.id);
                              return (
                                <div
                                  key={student.id}
                                  className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                                    sub
                                      ? 'bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                                      : 'bg-surface-2 border-line text-muted'
                                  }`}
                                >
                                  <span className="font-semibold truncate">{student.name}</span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] font-bold">
                                      {sub
                                        ? sub.status === 'late'
                                          ? '⚠️ Geç Teslim'
                                          : sub.status === 'not_submitted'
                                            ? 'Teslim Edilmedi'
                                            : '✓ Teslim Edildi'
                                        : 'Teslim Edilmedi'}
                                    </span>
                                    {sub && submissionHasContent(sub) && (
                                      <button
                                        type="button"
                                        onClick={() => setViewingSubmissionKey({ homeworkId: hw.id, studentId: student.id })}
                                        className="px-2 py-0.5 rounded-lg bg-surface border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-[11px] font-bold cursor-pointer"
                                      >
                                        Gör
                                      </button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </ExpandableStrip>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* CREATE HOMEWORK MODAL */}
      {/* EDIT HOMEWORK RESOURCES MODAL */}
      {editingResourcesHw && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
          onClick={closeEditResourcesModal}
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
            <div
              className="relative w-full max-w-2xl bg-surface border border-line rounded-2xl shadow-2xl p-6 max-h-[88vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
                <div className="flex items-center space-x-2">
                  <Paperclip className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-lg font-bold text-fg">Ödev Materyallerini Düzenle</h3>
                    <p className="text-xs text-muted truncate max-w-md">{editingResourcesHw.title}</p>
                  </div>
                </div>
                <button
                  onClick={closeEditResourcesModal}
                  className="p-1 text-muted hover:text-fg rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <HomeworkResourceUploader
                  resources={editingResourcesList}
                  onChange={setEditingResourcesList}
                  onPendingChange={setEditingPendingResource}
                  storageFolder={`odev/${editingResourcesHw.id}`}
                  onBusyChange={setIsEditUploadBusy}
                />

                <div className="pt-4 border-t border-line flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={closeEditResourcesModal}
                    className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-fg-2 rounded-xl text-sm font-medium cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditedResources}
                    disabled={isSavingResources || isEditUploadBusy}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSavingResources ? 'Kaydediliyor…' : 'Materyalleri Kaydet'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEV OLUŞTUR / KOPYALA / DÜZENLE */}
      <HomeworkFormModal
        open={!!homeworkForm}
        mode={homeworkForm?.mode || 'create'}
        source={homeworkForm?.source || null}
        students={students}
        classes={classes}
        onClose={() => setHomeworkForm(null)}
        onSaved={handleHomeworkSaved}
      />

      {/* CONFIRM DELETE HOMEWORK MODAL */}
      <ConfirmDeleteModal
        isOpen={!!homeworkToDelete}
        onClose={() => setHomeworkToDelete(null)}
        onConfirm={async () => {
          if (homeworkToDelete) {
            const deletedId = homeworkToDelete.id;
            setHomeworkToDelete(null);
            try {
              await dataService.deleteHomework(deletedId);
              if (selectedHomeworkId === deletedId) {
                setSelectedHomeworkId('');
              }
              setSaveError(null);
              setSaveFeedback('Ödev başarıyla silindi.');
              setTimeout(() => setSaveFeedback(null), 4000);
            } catch (err: any) {
              showSaveError(err, 'Ödev silinemedi.');
            }
          }
        }}
        title="Ödevi Sil"
        itemBadge={homeworkToDelete ? `${homeworkToDelete.subject} • Son Teslim: ${new Date(homeworkToDelete.dueDate).toLocaleDateString('tr-TR')}` : undefined}
        description={`"${homeworkToDelete?.title}" başlıklı ödevi silmek istediğinize emin misiniz? Bu ödeve ait tüm öğrenci teslimleri ve değerlendirmeler de silinecektir.`}
        confirmButtonText="Ödevi Sil"
      />
      {/* ÖĞRENCİ TESLİMİNİ GÖRÜNTÜLEME */}
      <SubmissionViewModal
        homework={viewingSubmissionKey ? homeworks.find((h) => h.id === viewingSubmissionKey.homeworkId) || null : null}
        student={viewingSubmissionKey ? students.find((st) => st.id === viewingSubmissionKey.studentId) || null : null}
        submission={
          viewingSubmissionKey
            ? submissions.find(
                (sb) => sb.homeworkId === viewingSubmissionKey.homeworkId && sb.studentId === viewingSubmissionKey.studentId
              ) || null
            : null
        }
        onClose={() => setViewingSubmissionKey(null)}
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
