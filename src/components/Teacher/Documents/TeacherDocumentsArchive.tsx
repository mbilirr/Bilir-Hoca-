import React, { useState } from 'react';
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
  Plus,
  ChevronsUpDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TeacherDocument, DocumentCategory } from '../../../types';
import { dataService } from '../../../services/dataService';
import { DocumentViewerModal } from './DocumentViewerModal';
import { UploadDocumentModal } from './UploadDocumentModal';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal';

interface TeacherDocumentsArchiveProps {
  documents: TeacherDocument[];
  onDocumentsChange?: () => void;
}

interface CategoryConfig {
  id: DocumentCategory | 'all';
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
    color: 'text-emerald-400',
    bgLight: 'bg-emerald-950/40',
    borderLight: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'weekly_plan',
    title: 'Haftalık Ders Planları',
    description: 'Haftalık ünite ve konu işleniş çizelgeleri',
    icon: BookOpen,
    color: 'text-cyan-400',
    bgLight: 'bg-cyan-950/40',
    borderLight: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  },
  {
    id: 'sample_exam',
    title: 'Örnek Yazılılar & Denemeler',
    description: '1. ve 2. dönem yazılı sınav örnekleri ve cevap anahtarları',
    icon: Award,
    color: 'text-amber-400',
    bgLight: 'bg-amber-950/40',
    borderLight: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  {
    id: 'meeting_minutes',
    title: 'Zümre Tutanakları & Kararlar',
    description: 'Dönem başı/sonu zümre öğretmenler kurulu kararları',
    icon: Users,
    color: 'text-purple-400',
    bgLight: 'bg-purple-950/40',
    borderLight: 'border-purple-500/30',
    badgeClass: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  },
  {
    id: 'curriculum',
    title: 'Müfredat & Kazanım Çizelgesi',
    description: 'Öğrenme alanları ve ders kazanım tabloları',
    icon: Layers,
    color: 'text-indigo-400',
    bgLight: 'bg-indigo-950/40',
    borderLight: 'border-indigo-500/30',
    badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  },
];

export const TeacherDocumentsArchive: React.FC<TeacherDocumentsArchiveProps> = ({
  documents: initialDocs,
  onDocumentsChange,
}) => {
  const [documents, setDocuments] = useState<TeacherDocument[]>(() =>
    initialDocs && initialDocs.length > 0
      ? initialDocs
      : dataService.getTeacherDocuments()
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArchiveCategory, setSelectedArchiveCategory] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');

  // Track which category accordions are expanded
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    yearly_plan: true,
    weekly_plan: true,
    sample_exam: true,
    meeting_minutes: true,
    curriculum: true,
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
    const allOpen = Object.values(expandedCategories).every(Boolean);
    const nextState: Record<string, boolean> = {};
    CATEGORIES.forEach((c) => {
      nextState[c.id] = !allOpen;
    });
    setExpandedCategories(nextState);
  };

  // Filtered documents
  const filteredDocuments = documents.filter((doc) => {
    const docCat = getDocCategoryKey(doc);
    if (selectedArchiveCategory !== 'all' && docCat !== selectedArchiveCategory) return false;
    if (selectedFormat !== 'all' && doc.fileFormat !== selectedFormat) return false;

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

  // Handle download
  const handleDownload = (doc: TeacherDocument) => {
    if (doc.fileData && doc.fileData.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = doc.fileData;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (doc.fileFormat === 'xlsx' && doc.tableSheets && doc.tableSheets.length > 0) {
      const wb = XLSX.utils.book_new();
      doc.tableSheets.forEach((sheet) => {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
      });
      XLSX.writeFile(wb, doc.fileName);
      return;
    }

    const content =
      doc.htmlPreview ||
      `${doc.title}\n${doc.subject} - ${doc.academicYear}\n\n${doc.description || ''}`;
    const blob = new Blob([content], {
      type: doc.fileFormat === 'pdf' ? 'application/pdf' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateDocument = (newDocData: Omit<TeacherDocument, 'id' | 'uploadedAt'>) => {
    dataService.addTeacherDocument(newDocData);
    setDocuments(dataService.getTeacherDocuments());
    if (onDocumentsChange) onDocumentsChange();
  };

  const handleDeleteDocument = (id: string) => {
    dataService.deleteTeacherDocument(id);
    setDocuments(dataService.getTeacherDocuments());
    setDocToDelete(null);
    if (onDocumentsChange) onDocumentsChange();
  };

  const getFormatBadge = (format: 'pdf' | 'docx' | 'xlsx') => {
    switch (format) {
      case 'pdf':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          label: 'PDF',
          icon: FileText,
        };
      case 'docx':
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          label: 'WORD',
          icon: FileCode,
        };
      case 'xlsx':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          label: 'EXCEL',
          icon: FileSpreadsheet,
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
          label: 'DOSYA',
          icon: FileText,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Sleek Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Plan & Zümre Arşivi</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                  {documents.length} Doküman
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Yıllık ve haftalık planları, yazılı sınavları ve zümre tutanaklarını iç içe klasör menüsünden yönetin.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Yeni Belge Yükle (.docx, .pdf, .xlsx)</span>
        </button>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Belge adı, zümre, konu veya etiket ara..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filters & Collapse All */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Archive Category Filter (Arşiv Menüsü) */}
          <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1">
            <FolderArchive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={selectedArchiveCategory}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedArchiveCategory(val);
                if (val !== 'all') {
                  setExpandedCategories((prev) => ({ ...prev, [val]: true }));
                }
              }}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">Arşiv: Tümü</option>
              <option value="yearly_plan" className="bg-slate-900 text-white">Yıllık Plan</option>
              <option value="weekly_plan" className="bg-slate-900 text-white">Haftalık Plan</option>
              <option value="sample_exam" className="bg-slate-900 text-white">Örnek Yazılılar</option>
              <option value="meeting_minutes" className="bg-slate-900 text-white">Zümre Tutanakları</option>
              <option value="curriculum" className="bg-slate-900 text-white">Müfredat & Kazanım</option>
            </select>
          </div>

          {/* Format Filter */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tüm Formatlar</option>
            <option value="pdf">PDF</option>
            <option value="docx">Word (.docx)</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>

          {/* Toggle All Accordions */}
          <button
            type="button"
            onClick={toggleAllCategories}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Tüm klasörleri aç veya kapat"
          >
            <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">
              {Object.values(expandedCategories).every(Boolean) ? 'Tümünü Kapat' : 'Tümünü Aç'}
            </span>
          </button>

          {(searchQuery || selectedArchiveCategory !== 'all' || selectedFormat !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedArchiveCategory('all');
                setSelectedFormat('all');
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 underline font-medium cursor-pointer"
            >
              Sıfırla
            </button>
          )}
        </div>
      </div>

      {/* NESTED COLLAPSIBLE FOLDER MENUS (İÇE İÇE AÇILIR MENÜ ŞEKLİNDE BELGELER) */}
      <div className="space-y-3">
        {CATEGORIES.filter((category) => {
          if (selectedArchiveCategory !== 'all') {
            return category.id === selectedArchiveCategory;
          }
          return true;
        }).map((category) => {
          const CatIcon = category.icon;
          const isExpanded = !!expandedCategories[category.id];

          // Documents belonging to this category and matching current filters
          const categoryDocs = filteredDocuments.filter(
            (doc) => getDocCategoryKey(doc) === category.id
          );

          // Total in category regardless of search/filter
          const allCatDocs = documents.filter((doc) => getDocCategoryKey(doc) === category.id);

          return (
            <div
              key={category.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
            >
              {/* Category Folder Accordion Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-850/60 transition-colors cursor-pointer"
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
                      <h3 className="text-sm font-bold text-white truncate">{category.title}</h3>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${category.badgeClass}`}>
                        {categoryDocs.length} {categoryDocs.length !== allCatDocs.length ? `/ ${allCatDocs.length}` : ''} Belge
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 hidden sm:block">
                      {category.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0 ml-3">
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {isExpanded ? 'Gizle' : 'Genişlet'}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-white' : ''
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </button>

              {/* Collapsible Documents Table/List */}
              {isExpanded && (
                <div className="border-t border-slate-800/80 bg-slate-950/40">
                  {categoryDocs.length > 0 ? (
                    <div className="divide-y divide-slate-800/60">
                      {categoryDocs.map((doc) => {
                        const formatBadge = getFormatBadge(doc.fileFormat);
                        const FormatIcon = formatBadge.icon;

                        return (
                          <div
                            key={doc.id}
                            className="p-3.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850/40 transition-colors"
                          >
                            {/* Left: Document Info */}
                            <div className="flex items-start sm:items-center space-x-3 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 mt-0.5 sm:mt-0 ${formatBadge.bg}`}
                              >
                                <FormatIcon className="w-4 h-4" />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate max-w-sm sm:max-w-md">
                                    {doc.title}
                                  </h4>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${formatBadge.bg}`}
                                  >
                                    {formatBadge.label}
                                  </span>
                                  {doc.gradeLevel && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                      {doc.gradeLevel}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5 flex-wrap gap-y-1">
                                  <span className="font-medium text-indigo-400">{doc.subject}</span>
                                  <span>•</span>
                                  <span>{doc.academicYear}</span>
                                  <span>•</span>
                                  <span>Yükleyen: {doc.authorName}</span>
                                  {doc.fileSize && (
                                    <>
                                      <span>•</span>
                                      <span>{doc.fileSize}</span>
                                    </>
                                  )}
                                  {doc.description && (
                                    <>
                                      <span className="hidden md:inline">•</span>
                                      <span className="text-slate-500 italic truncate max-w-xs hidden md:inline">
                                        {doc.description}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => setActiveViewingDoc(doc)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Görüntüle</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownload(doc)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700 transition-colors cursor-pointer"
                                title="Belgeyi İndir"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDocToDelete(doc)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg text-xs border border-slate-700 transition-colors cursor-pointer"
                                title="Belgeyi Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-xs">
                      Bu kategoride filtrelere uygun kayıtlı belge bulunmuyor.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DOCUMENT VIEWER MODAL */}
      {activeViewingDoc && (
        <DocumentViewerModal
          document={activeViewingDoc}
          isOpen={!!activeViewingDoc}
          onClose={() => setActiveViewingDoc(null)}
          onDownload={handleDownload}
        />
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      {isUploadModalOpen && (
        <UploadDocumentModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={handleCreateDocument}
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
