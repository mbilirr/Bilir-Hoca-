import React, { useState, useMemo } from 'react';
import {
  FolderArchive,
  Folder,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  FileCode,
  Upload,
  Download,
  Eye,
  Trash2,
  Search,
  Calendar,
  Layers,
  BookOpen,
  Award,
  Sparkles,
  Users,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Plus,
  ChevronsUpDown,
  GraduationCap,
  Filter,
} from 'lucide-react';
import { PageHeader } from '../../ui/kit';
import * as XLSX from 'xlsx';
import { TeacherDocument, DocumentCategory, ClassGroup } from '../../../types';
import { dataService } from '../../../services/dataService';
import { DocumentViewerModal } from './DocumentViewerModal';
import { UploadDocumentModal } from './UploadDocumentModal';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal';
import { normalizeBranch } from '../../../lib/subjects';
import { getSignedFileUrl, dataUrlToBlobUrl } from '../../../lib/fileStorage';

interface TeacherDocumentsArchiveProps {
  documents: TeacherDocument[];
  onDocumentsChange?: () => void;
}

interface CategoryConfig {
  id: DocumentCategory;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgLight: string;
  borderLight: string;
  badgeClass: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'yearly_plan',
    title: 'Yıllık Ders Planları',
    description: 'MEB onaylı yıllık çalışma ve ders planları',
    icon: Calendar,
    color: 'text-emerald-700 dark:text-emerald-400',
    bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderLight: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'weekly_plan',
    title: 'Haftalık Ders Planları',
    description: 'Sınıf bazlı haftalık ünite ve konu işleniş çizelgeleri',
    icon: BookOpen,
    color: 'text-cyan-700 dark:text-cyan-400',
    bgLight: 'bg-cyan-50 dark:bg-cyan-950/40',
    borderLight: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'sample_exam',
    title: 'Örnek Yazılılar & Denemeler',
    description: '1. ve 2. dönem yazılı sınav örnekleri ve cevap anahtarları',
    icon: Award,
    color: 'text-amber-700 dark:text-amber-400',
    bgLight: 'bg-amber-50 dark:bg-amber-950/40',
    borderLight: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    id: 'meeting_minutes',
    title: 'Zümre Tutanakları & Kararlar',
    description: 'Dönem başı/sonu zümre öğretmenler kurulu kararları',
    icon: Users,
    color: 'text-purple-600 dark:text-purple-400',
    bgLight: 'bg-purple-50 dark:bg-purple-950/40',
    borderLight: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30',
  },
  {
    id: 'curriculum',
    title: 'Müfredat & Kazanım Çizelgesi',
    description: 'Öğrenme alanları ve ders kazanım tabloları',
    icon: Layers,
    color: 'text-indigo-600 dark:text-indigo-400',
    bgLight: 'bg-indigo-50 dark:bg-indigo-950/40',
    borderLight: 'border-indigo-500/30',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30',
  },
];

export const TeacherDocumentsArchive: React.FC<TeacherDocumentsArchiveProps> = ({
  documents: initialDocs,
  onDocumentsChange,
}) => {
  // Belgeler her zaman güncel listeden okunur (başka öğretmen belge ekleyince ekran kendiliğinden yenilenir)
  const documents: TeacherDocument[] = initialDocs || dataService.getTeacherDocuments();

  // Branş klasörleri: varsayılan olarak öğretmenin kendi branşı açılır
  const teacherBranch = useMemo(() => normalizeBranch(dataService.getCurrentTeacher()?.branch), []);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => teacherBranch || 'all');
  const branchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    documents.forEach((d) => {
      const key = d.subject || 'Genel';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (teacherBranch && !counts.has(teacherBranch)) counts.set(teacherBranch, 0);
    if (selectedBranch !== 'all' && !counts.has(selectedBranch)) counts.set(selectedBranch, 0);
    return Array.from(counts.entries()).sort((a, b) => {
      if (a[0] === teacherBranch) return -1;
      if (b[0] === teacherBranch) return 1;
      return b[1] - a[1] || a[0].localeCompare(b[0], 'tr');
    });
  }, [documents, teacherBranch, selectedBranch]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | undefined>(undefined);

  const [availableClasses] = useState<ClassGroup[]>(() => dataService.getClasses());

  const [searchQuery, setSearchQuery] = useState('');
  // Arşiv Seçimi: Varsayılan olarak boş / "none" -> Bütün belgeler kapalı başlar
  const [selectedArchiveCategory, setSelectedArchiveCategory] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');

  // Haftalık Planlar için özel sınıf filtresi (varsayılan boş, kullanıcı seçince açılır)
  const [weeklyPlanSelectedClass, setWeeklyPlanSelectedClass] = useState<string>('');

  // Track which category accordions are expanded (Başlangıçta hepsi KAPALI)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    yearly_plan: false,
    weekly_plan: false,
    sample_exam: false,
    meeting_minutes: false,
    curriculum: false,
  });

  // Modals
  const [activeViewingDoc, setActiveViewingDoc] = useState<TeacherDocument | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<TeacherDocument | null>(null);

  // Helper to categorize docs properly
  const getDocCategoryKey = (doc: TeacherDocument): string => {
    if (doc.category === 'yearly_plan') return 'yearly_plan';
    if (doc.category === 'weekly_plan') return 'weekly_plan';
    if (doc.category === 'lesson_plan') {
      return doc.title.toLowerCase().includes('yıllık') ? 'yearly_plan' : 'weekly_plan';
    }
    return doc.category;
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const toggleAllCategories = () => {
    const anyOpen = Object.values(expandedCategories).some(Boolean);
    const nextState: Record<string, boolean> = {};
    CATEGORIES.forEach((c) => {
      nextState[c.id] = !anyOpen;
    });
    setExpandedCategories(nextState);
  };

  const scrollCategoryTrack = (catId: string, distance: number) => {
    const el = document.getElementById(`doc-track-${catId}`);
    if (el) {
      el.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  // Distinct class list for weekly plan filtering - Only pure grade level names (8/a, 8/B gibi şubeler YOK, sadece sınıf isimleri)
  const distinctWeeklyPlanClasses = useMemo(() => {
    return [
      '5. Sınıf',
      '6. Sınıf',
      '7. Sınıf',
      '8. Sınıf',
      '9. Sınıf',
      '10. Sınıf',
      '11. Sınıf',
      '12. Sınıf',
    ];
  }, []);

  // Filtered documents
  const filteredDocuments = documents.filter((doc) => {
    if (selectedBranch !== 'all' && (doc.subject || 'Genel') !== selectedBranch) return false;
    const docCat = getDocCategoryKey(doc);
    if (selectedArchiveCategory && selectedArchiveCategory !== 'all' && docCat !== selectedArchiveCategory) return false;
    if (selectedFormat !== 'all' && doc.fileFormat !== selectedFormat) return false;

    if (selectedSchool !== 'all') {
      if (doc.schoolType && doc.schoolType !== selectedSchool) return false;
      if (!doc.schoolType) {
        const isOrtaGrade = ['5.', '6.', '7.', '8.'].some((g) => (doc.gradeLevel || '').includes(g));
        const isLiseGrade = ['9.', '10.', '11.', '12.'].some((g) => (doc.gradeLevel || '').includes(g));
        if (selectedSchool === 'Ortaokul' && isLiseGrade) return false;
        if (selectedSchool === 'Lise' && isOrtaGrade) return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = doc.title.toLowerCase().includes(q);
      const matchDesc = doc.description?.toLowerCase().includes(q) || false;
      const matchSubject = doc.subject.toLowerCase().includes(q);
      const matchTags = doc.tags?.some((t) => t.toLowerCase().includes(q)) || false;
      if (!matchTitle && !matchDesc && !matchSubject && !matchTags) return false;
    }

    return true;
  });

  const clickDownload = (href: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Belgeyi indir: depodaki dosya imzalı bağlantıyla, eski belgeler kayıttaki içerikle indirilir
  const handleDownload = async (doc: TeacherDocument) => {
    setActionError(null);
    try {
      if (doc.storagePath) {
        clickDownload(await getSignedFileUrl(doc.storagePath, doc.fileName || doc.title), doc.fileName || doc.title);
        return;
      }
      const full = await dataService.getTeacherDocumentDetail(doc);
      if (full.fileData && full.fileData.startsWith('data:')) {
        const blobUrl = dataUrlToBlobUrl(full.fileData);
        clickDownload(blobUrl || full.fileData, full.fileName);
        if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return;
      }

      if (full.fileFormat === 'xlsx' && full.tableSheets && full.tableSheets.length > 0) {
        const wb = XLSX.utils.book_new();
        full.tableSheets.forEach((sheet) => {
          const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
          XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
        });
        XLSX.writeFile(wb, full.fileName);
        return;
      }

      const content =
        full.htmlPreview ||
        `${full.title}\n${full.subject} - ${full.academicYear}\n\n${full.description || ''}`;
      const blob = new Blob([content], {
        type: full.htmlPreview ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      clickDownload(url, full.htmlPreview ? `${full.title}.html` : `${full.title}.txt`);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setActionError(e?.message || 'Belge indirilemedi.');
    }
  };

  // Belgeyi aç: önizleme içeriği ve PDF adresi gerektiğinde yüklenir
  const handleOpenDocument = async (doc: TeacherDocument) => {
    setActionError(null);
    setOpeningDocId(doc.id);
    try {
      const full = await dataService.getTeacherDocumentDetail(doc);
      let pdfUrl: string | undefined;
      if (full.fileFormat === 'pdf') {
        if (full.storagePath) pdfUrl = await getSignedFileUrl(full.storagePath);
        else if (full.fileData && full.fileData.startsWith('data:')) pdfUrl = dataUrlToBlobUrl(full.fileData) || undefined;
      }
      setActivePdfUrl(pdfUrl);
      setActiveViewingDoc(full);
    } catch (e: any) {
      setActionError(e?.message || 'Belge açılamadı.');
    } finally {
      setOpeningDocId(null);
    }
  };

  const handleCloseViewer = () => {
    if (activePdfUrl && activePdfUrl.startsWith('blob:')) URL.revokeObjectURL(activePdfUrl);
    setActivePdfUrl(undefined);
    setActiveViewingDoc(null);
  };

  const handleCreateDocument = async (newDocData: Omit<TeacherDocument, 'id' | 'uploadedAt'>, file: File) => {
    await dataService.addTeacherDocument(newDocData, file); // hata olursa yükleme penceresi mesajı gösterir
    // Yüklenen belgenin branşı ve kategorisi açılır
    setSelectedBranch(newDocData.subject || 'all');
    const cat = getDocCategoryKey(newDocData as TeacherDocument);
    setSelectedArchiveCategory(cat);
    setExpandedCategories((prev) => ({ ...prev, [cat]: true }));
    if (cat === 'weekly_plan' && newDocData.gradeLevel) {
      setWeeklyPlanSelectedClass(newDocData.gradeLevel);
    }
    if (onDocumentsChange) onDocumentsChange();
  };

  const handleDeleteDocument = async (id: string) => {
    setActionError(null);
    setDocToDelete(null);
    try {
      await dataService.deleteTeacherDocument(id);
    } catch (e: any) {
      setActionError(e?.message || 'Belge silinemedi.');
    }
    if (onDocumentsChange) onDocumentsChange();
  };

  const getFormatBadge = (format: 'pdf' | 'docx' | 'xlsx') => {
    switch (format) {
      case 'pdf':
        return {
          bg: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
          label: 'PDF',
          icon: FileText,
        };
      case 'docx':
        return {
          bg: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
          label: 'WORD',
          icon: FileCode,
        };
      case 'xlsx':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
          label: 'EXCEL',
          icon: FileSpreadsheet,
        };
      default:
        return {
          bg: 'bg-surface-2 text-fg-2 border-line',
          label: 'DOSYA',
          icon: FileText,
        };
    }
  };

  // Visible categories based on user selection: Yalnızca açılır pencereden seçilen belge türü açılır
  const visibleCategories = useMemo(() => {
    if (!selectedArchiveCategory) {
      return [];
    }
    return CATEGORIES.filter((c) => c.id === selectedArchiveCategory);
  }, [selectedArchiveCategory]);

  return (
    <div className="space-y-6">
      {/* Sayfa başlığı */}
      <PageHeader
        icon={FolderArchive}
        tone="warning"
        title="Arşiv"
        description={`Plan ve zümre evrakları · ${documents.length} belge`}
        actions={
          <button type="button" onClick={() => setIsUploadModalOpen(true)} className="ui-btn ui-btn-primary">
            <Upload className="w-4 h-4" />
            <span>Yeni Belge Yükle</span>
          </button>
        }
      />

      {/* BRANŞ KLASÖRLERİ */}
      <div className="bg-surface border border-line rounded-2xl p-3.5 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-fg flex items-center space-x-1.5">
            <GraduationCap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Branş Klasörleri</span>
          </span>
          <span className="text-[11px] text-muted hidden sm:inline">Belgeler yüklendikleri branşın klasöründe durur</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Branş seçimi">
          <button
            type="button"
            onClick={() => setSelectedBranch('all')}
            aria-pressed={selectedBranch === 'all'}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              selectedBranch === 'all'
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-canvas text-fg-2 border-line hover:border-indigo-500'
            }`}
          >
            Tüm Branşlar ({documents.length})
          </button>
          {branchCounts.map(([branch, count]) => (
            <button
              key={branch}
              type="button"
              onClick={() => setSelectedBranch(branch)}
              aria-pressed={selectedBranch === branch}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                selectedBranch === branch
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : 'bg-canvas text-fg-2 border-line hover:border-indigo-500'
              }`}
            >
              {branch} ({count}){branch === teacherBranch ? ' · Branşım' : ''}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold text-rose-600 dark:text-rose-200 hover:text-fg cursor-pointer">
            Tamam
          </button>
        </div>
      )}

      {/* SEARCH & FILTERS BAR */}
      <div className="bg-surface border border-line rounded-2xl p-3.5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Belge adı, zümre, konu veya etiket ara..."
            className="w-full bg-canvas border border-line rounded-xl pl-9 pr-3 py-1.5 text-xs text-fg placeholder-subtle focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Archive Category Filter ("Arşiv Seç" Açılır Menüsü) */}
          <div className="flex items-center space-x-1.5 bg-canvas border border-indigo-500/40 rounded-xl px-2.5 py-1">
            <FolderArchive className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <select
              value={selectedArchiveCategory}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedArchiveCategory(val);
                if (val) {
                  const nextState: Record<string, boolean> = {
                    yearly_plan: false,
                    weekly_plan: false,
                    sample_exam: false,
                    meeting_minutes: false,
                    curriculum: false,
                  };
                  nextState[val] = true;
                  setExpandedCategories(nextState);
                }
              }}
              className="bg-transparent text-indigo-600 dark:text-indigo-200 text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-surface text-fg-2">📂 Arşiv Seç</option>
              <option value="yearly_plan" className="bg-surface text-fg">Yıllık Planlar</option>
              <option value="weekly_plan" className="bg-surface text-fg">Haftalık Planlar</option>
              <option value="sample_exam" className="bg-surface text-fg">Örnek Yazılılar</option>
              <option value="meeting_minutes" className="bg-surface text-fg">Zümre Tutanakları</option>
              <option value="curriculum" className="bg-surface text-fg">Müfredat & Kazanım</option>
            </select>
          </div>

          {/* School Kademe Filter */}
          <select
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
            className="bg-canvas border border-line text-fg-2 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
          >
            <option value="all">Tüm Kademeler</option>
            <option value="Ortaokul">🏫 Ortaokul</option>
            <option value="Lise">🎓 Lise</option>
          </select>

          {/* Format Filter */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="bg-canvas border border-line text-fg-2 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
          >
            <option value="all">Tüm Formatlar</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>

          {(searchQuery || selectedArchiveCategory || selectedFormat !== 'all' || selectedSchool !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedArchiveCategory('');
                setSelectedFormat('all');
                setSelectedSchool('all');
                setWeeklyPlanSelectedClass('');
                setExpandedCategories({
                  yearly_plan: false,
                  weekly_plan: false,
                  sample_exam: false,
                  meeting_minutes: false,
                  curriculum: false,
                });
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 px-2 py-1 underline font-medium cursor-pointer"
            >
              Sıfırla
            </button>
          )}
        </div>
      </div>

      {/* SEÇİLEN BELGE TÜRÜ AÇILIR (SADECE SEÇİLEN KATEGORİ) */}
      {visibleCategories.length > 0 && (
        <div className="space-y-3">
          {visibleCategories.map((category) => {
            const CatIcon = category.icon;
            const isExpanded = !!expandedCategories[category.id];

            // Documents belonging to this category and matching current general filters
            let categoryDocs = filteredDocuments.filter(
              (doc) => getDocCategoryKey(doc) === category.id
            );

            // If this is weekly_plan and user selected a specific class, filter by class
            const isWeeklyPlanCat = category.id === 'weekly_plan';
            if (isWeeklyPlanCat && weeklyPlanSelectedClass) {
              categoryDocs = categoryDocs.filter((doc) => {
                if (doc.gradeLevel === weeklyPlanSelectedClass) return true;
                if (doc.gradeLevel && weeklyPlanSelectedClass && doc.gradeLevel.startsWith(weeklyPlanSelectedClass.split('.')[0])) return true;
                if (doc.tags?.some((t) => t.toLowerCase().includes(weeklyPlanSelectedClass.toLowerCase()))) return true;
                return false;
              });
            }

            // Total in category regardless of search/filter
            const allCatDocs = documents.filter((doc) => getDocCategoryKey(doc) === category.id);

            return (
              <div
                key={category.id}
                className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm transition-all"
              >
                {/* Category Folder Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCategory(category.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleCategory(category.id);
                    }
                  }}
                  className="w-full text-left p-4 flex items-center justify-between hover:bg-surface-2/60 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${category.bgLight} ${category.borderLight} ${category.color}`}
                    >
                      {isExpanded ? (
                        <FolderOpen className="w-4 h-4" />
                      ) : (
                        <Folder className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-fg truncate">{category.title}</h3>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${category.badgeClass}`}>
                          {categoryDocs.length} {categoryDocs.length !== allCatDocs.length ? `/ ${allCatDocs.length}` : ''} Belge
                        </span>
                      </div>
                      <p className="text-[11px] text-muted truncate mt-0.5 hidden sm:block">
                        {category.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    {/* Horizontal Scroll Controls */}
                    {isExpanded && categoryDocs.length > 1 && (
                      <div className="flex items-center space-x-1 bg-surface-2/80 p-0.5 rounded-lg border border-line">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollCategoryTrack(category.id, -340);
                          }}
                          className="p-1 text-muted hover:text-fg rounded hover:bg-surface-3 transition-colors cursor-pointer"
                          title="Sola Kaydır"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            scrollCategoryTrack(category.id, 340);
                          }}
                          className="p-1 text-muted hover:text-fg rounded hover:bg-surface-3 transition-colors cursor-pointer"
                          title="Sağa Kaydır"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <span className="text-xs text-muted hidden sm:inline">
                      {isExpanded ? 'Kapat' : 'Aç'}
                    </span>
                    <div
                      className={`w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center text-muted transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-fg' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Collapsible Documents Track */}
                {isExpanded && (
                  <div className="border-t border-line bg-canvas/50 p-4 sm:p-5">
                    {/* HAFTALIK PLAN ÖZEL SINIF SEÇİM AÇILIR PENCERESİ (YALNIZCA SINIF İSİMLERİ: 5. Sınıf - 12. Sınıf) */}
                    {isWeeklyPlanCat && (
                      <div className="mb-4 p-3.5 bg-surface border border-cyan-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-2.5">
                          <GraduationCap className="w-4 h-4 text-cyan-700 dark:text-cyan-400 shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-fg">Sınıf Seçimi</p>
                            <p className="text-[11px] text-muted">
                              Haftalık planları sınıf bazında incelemek için sınıf seçin
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <select
                            value={weeklyPlanSelectedClass}
                            onChange={(e) => setWeeklyPlanSelectedClass(e.target.value)}
                            className="bg-canvas border border-cyan-500/50 text-cyan-700 dark:text-cyan-200 text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-cyan-400 cursor-pointer min-w-[180px]"
                          >
                            <option value="">📋 Sınıf Seç (Planları Gör)</option>
                            {distinctWeeklyPlanClasses.map((cls) => (
                              <option key={cls} value={cls}>
                                {cls}
                              </option>
                            ))}
                          </select>

                          {weeklyPlanSelectedClass && (
                            <button
                              type="button"
                              onClick={() => setWeeklyPlanSelectedClass('')}
                              className="text-xs text-cyan-700 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline font-medium px-1 cursor-pointer"
                            >
                              Tüm Sınıflar
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Haftalık plan seçimi yapılmadıysa ve kullanıcı sınıf seçmek istiyorsa */}
                    {isWeeklyPlanCat && !weeklyPlanSelectedClass && allCatDocs.length > 0 ? (
                      <div className="p-6 text-center bg-surface/60 border border-line rounded-xl">
                        <BookOpen className="w-8 h-8 text-cyan-700/80 dark:text-cyan-400/80 mx-auto mb-2" />
                        <p className="text-xs font-bold text-fg mb-1">
                          Haftalık Planlar Kapalı Durumda
                        </p>
                        <p className="text-[11px] text-muted max-w-md mx-auto mb-3">
                          Planları görüntülemek için yukarıdaki <strong>"Sınıf Seç"</strong> açılır penceresinden ilgili sınıfı seçin veya aşağıdaki hızlı butonlara tıklayın.
                        </p>
                        <div className="flex flex-wrap justify-center gap-1.5 max-w-xl mx-auto">
                          {distinctWeeklyPlanClasses.map((cls) => (
                            <button
                              key={cls}
                              type="button"
                              onClick={() => setWeeklyPlanSelectedClass(cls)}
                              className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/60 text-xs font-medium transition-colors cursor-pointer"
                            >
                              {cls}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : categoryDocs.length > 0 ? (
                      <div className="relative">
                        {/* Kaydırma İpucu */}
                        <div className="pb-2.5 flex items-center justify-between text-[11px] text-muted">
                          <span className="flex items-center space-x-1.5">
                            <span>👉</span>
                            <span>
                              {isWeeklyPlanCat && weeklyPlanSelectedClass
                                ? `${weeklyPlanSelectedClass} Haftalık Planları (${categoryDocs.length} belge)`
                                : `Yan yana kayan özet sayfalar (${categoryDocs.length} belge)`}
                            </span>
                          </span>
                          <span className="hidden sm:inline font-mono text-muted">Kaydır ⇄</span>
                        </div>

                        {/* Yan Yana Kayan Özet Sayfalar Konteyneri */}
                        <div
                          id={`doc-track-${category.id}`}
                          className="flex items-stretch space-x-4 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory scroll-smooth"
                        >
                          {categoryDocs.map((doc) => {
                            const formatBadge = getFormatBadge(doc.fileFormat);
                            const FormatIcon = formatBadge.icon;

                            return (
                              <div
                                key={doc.id}
                                className="w-80 sm:w-88 shrink-0 snap-start bg-surface hover:bg-surface border border-line hover:border-indigo-400 rounded-2xl p-4 sm:p-4.5 flex flex-col justify-between shadow-md transition-all group hover:shadow-xl hover:-translate-y-0.5 text-fg"
                              >
                                {/* Üst Kısım */}
                                <div>
                                  <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <div className="flex items-center space-x-1.5 flex-wrap">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider flex items-center space-x-1 ${formatBadge.bg}`}
                                      >
                                        <FormatIcon className="w-3 h-3 mr-1 inline" />
                                        <span>{formatBadge.label}</span>
                                      </span>

                                      {doc.schoolType && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                                          {doc.schoolType === 'Ortaokul'
                                            ? '🏫 Ortaokul'
                                            : doc.schoolType === 'Lise'
                                            ? '🎓 Lise'
                                            : doc.schoolType}
                                        </span>
                                      )}
                                    </div>

                                    {doc.gradeLevel && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-2 text-fg-2 border border-line">
                                        {doc.gradeLevel}
                                      </span>
                                    )}
                                  </div>

                                  {/* Belge Başlığı */}
                                  <h4
                                    className="text-sm font-bold text-fg group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors line-clamp-2 min-h-[40px] mb-2 leading-snug"
                                    title={doc.title}
                                  >
                                    {doc.title}
                                  </h4>

                                  {/* Özet Sayfa Görsel Kartı */}
                                  <div className="bg-surface-2/90 rounded-xl p-3 border border-line mb-3 space-y-1.5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-500/10 rounded-bl-xl border-b border-l border-indigo-200 dark:border-indigo-500/30" />

                                    <div className="flex items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold border-b border-line pb-1 pr-6">
                                      <span>{doc.subject}</span>
                                      <span className="text-muted font-mono">{doc.academicYear || '2026-2027'}</span>
                                    </div>

                                    <p className="text-xs text-muted line-clamp-3 leading-relaxed">
                                      {doc.description ||
                                        'MEB müfredat standartlarına uygun 2026-2027 yıllık/haftalık plan ve zümre kararları özeti.'}
                                    </p>

                                    {doc.tags && doc.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {doc.tags.slice(0, 3).map((tag, idx) => (
                                          <span
                                            key={idx}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted border border-line font-medium"
                                          >
                                            #{tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Yazar & Dosya Boyutu */}
                                  <div className="flex items-center justify-between text-[11px] text-muted mb-3 px-0.5">
                                    <span className="truncate max-w-[170px] text-fg-2 font-medium" title={doc.authorName}>
                                      ✍️ {doc.authorName || 'Öğretmen'}
                                    </span>
                                    <span className="font-mono text-[10px] text-subtle">
                                      {doc.fileSize || 'Belge'}
                                    </span>
                                  </div>
                                </div>

                                {/* Alt Aksiyon Butonları */}
                                <div className="pt-3 border-t border-line flex items-center space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDocument(doc)}
                                    disabled={openingDocId === doc.id}
                                    className="flex-1 py-2 px-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                                    title="Tam Sayfa Olarak Aç ve İncele"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>{openingDocId === doc.id ? 'Açılıyor…' : 'Görüntüle'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDownload(doc)}
                                    className="p-2 bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg rounded-xl text-xs border border-line transition-colors cursor-pointer"
                                    title="Belgeyi Bilgisayara İndir"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>

                                  {dataService.canManageDocument(doc) && (
                                    <button
                                      type="button"
                                      onClick={() => setDocToDelete(doc)}
                                      className="p-2 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-300 rounded-xl text-xs border border-rose-200 dark:border-rose-500/30 transition-colors cursor-pointer"
                                      title="Belgeyi Sil"
                                      aria-label="Belgeyi Sil"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-muted text-xs bg-surface/40 rounded-xl">
                        Bu kategoride seçilen filtrelere uygun kayıtlı belge bulunmuyor.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DOCUMENT VIEWER MODAL */}
      {activeViewingDoc && (
        <DocumentViewerModal
          document={activeViewingDoc}
          isOpen={!!activeViewingDoc}
          onClose={handleCloseViewer}
          onDownload={handleDownload}
          pdfUrl={activePdfUrl}
        />
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      {isUploadModalOpen && (
        <UploadDocumentModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={handleCreateDocument}
          defaultSubject={selectedBranch !== 'all' ? selectedBranch : teacherBranch || undefined}
        />
      )}

      {/* CONFIRM DELETE MODAL */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={!!docToDelete}
          title="Belgeyi Sil"
          itemBadge={`${docToDelete.title} (${docToDelete.fileFormat.toUpperCase()})`}
          description={`"${docToDelete.title}" isimli belge arşivden kalıcı olarak silinecektir. Bu işlem geri alınamaz.`}
          confirmButtonText="Belgeyi Sil"
          onConfirm={() => handleDeleteDocument(docToDelete.id)}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};

