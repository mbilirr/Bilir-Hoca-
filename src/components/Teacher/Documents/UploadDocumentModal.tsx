import React, { useState, useRef, useMemo } from 'react';
import { Upload, FileText, FileSpreadsheet, AlertCircle, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import confetti from 'canvas-confetti';
import { TeacherDocument, DocumentCategory } from '../../../types';
import { dataService } from '../../../services/dataService';
import { sanitizeHtml } from '../../../lib/sanitizeHtml';
import { ORTAOKUL_SUBJECTS, LISE_SUBJECTS, ALL_SUBJECTS } from '../../../lib/subjects';
import { MAX_UPLOAD_BYTES, UPLOAD_LIMIT_MESSAGE, formatBytes } from '../../../lib/fileStorage';
import { Modal } from '../../ui/kit';
import { SelectBox, inputCls } from '../FormParts';

// Aşama 80: pencere sistemdeki diğer pencerelerle aynı (Modal); tüm kutular aynı yükseklik ve yazı boyutunda
const FIELD_CLS = `${inputCls} h-10`;
const SELECT_CLS = `${inputCls} h-10 cursor-pointer`;
type SchoolType = '' | 'Ortaokul' | 'Lise' | 'Diğer';
const ORTA_GRADES = ['5. Sınıf', '6. Sınıf', '7. Sınıf', '8. Sınıf'];
const LISE_GRADES = ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf'];
const CATEGORY_OPTIONS: Array<{ value: DocumentCategory; label: string }> = [
  { value: 'yearly_plan', label: 'Yıllık Ders Planı' },
  { value: 'weekly_plan', label: 'Haftalık Ders Planı' },
  { value: 'sample_exam', label: 'Örnek Yazılılar & Denemeler' },
  { value: 'meeting_minutes', label: 'Zümre Tutanakları & Kurul Kararları' },
  { value: 'curriculum', label: 'Müfredat & Kazanım Çizelgesi' },
  { value: 'other', label: 'Diğer Eğitim Dokümanları' },
];

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Belge bilgileri ve dosyanın kendisi; kayıt bitene kadar beklenir, hata olursa pencere açık kalır
  onUploadSuccess: (newDoc: Omit<TeacherDocument, 'id' | 'uploadedAt'>, file: File) => Promise<void>;
  // Varsayılan branş (öğretmenin kendi branşı veya arşivde seçili branş)
  defaultSubject?: string;
  // Aşama 80: arşivde seçili bölüm (kategori) yeni belgede de seçili gelir
  defaultCategory?: DocumentCategory;
}

// Pencere kapalıyken içerik bileşeni hiç kurulmaz; böylece React hook'ları her render'da aynı sırada çalışır.
export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <UploadDocumentModalContent {...props} />;
};

const UploadDocumentModalContent: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  defaultSubject,
  defaultCategory,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Öğretmenin branşı (ya da arşivde seçili ders): okul seçilince listede varsa kendiliğinden seçilir
  const initialSubject = defaultSubject && defaultSubject !== 'all' ? defaultSubject : '';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>(() => defaultCategory || '');
  const [schoolType, setSchoolType] = useState<SchoolType>('');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<'pdf' | 'docx' | 'xlsx'>('pdf');
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const subjectsFor = (school: SchoolType): string[] => {
    if (!school) return [];
    const base = school === 'Ortaokul' ? ORTAOKUL_SUBJECTS : school === 'Lise' ? LISE_SUBJECTS : ALL_SUBJECTS;
    // Öğretmenin listede olmayan branşı da seçilebilsin
    return initialSubject && !base.includes(initialSubject) ? [initialSubject, ...base] : base;
  };
  const gradesFor = (school: SchoolType): string[] =>
    school === 'Ortaokul' ? ORTA_GRADES : school === 'Lise' ? LISE_GRADES : school === 'Diğer' ? [...ORTA_GRADES, ...LISE_GRADES] : [];

  const availableSubjects = useMemo(() => subjectsFor(schoolType), [schoolType]); // eslint-disable-line react-hooks/exhaustive-deps
  const availableGrades = useMemo(() => gradesFor(schoolType), [schoolType]);

  // Okul seçilince sınıf ve ders listeleri ona göre gelir; listede olmayan seçim temizlenir
  const handleSchoolTypeChange = (next: SchoolType) => {
    setSchoolType(next);
    const grades = gradesFor(next);
    if (gradeLevel && gradeLevel !== 'Tüm Sınıflar' && !grades.includes(gradeLevel)) setGradeLevel('');
    const subjects = subjectsFor(next);
    if (subject && !subjects.includes(subject)) setSubject('');
    if (!subject && initialSubject && subjects.includes(initialSubject)) setSubject(initialSubject);
  };

  // Auto file processor
  const handleProcessFile = async (file: File) => {
    setErrorMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!ext || !['pdf', 'docx', 'xlsx', 'xls', 'doc'].includes(ext)) {
      setErrorMsg('Lütfen sadece .docx, .pdf veya .xlsx/.xls uzantılı belge yükleyin.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMsg(UPLOAD_LIMIT_MESSAGE);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const detectedFormat: 'pdf' | 'docx' | 'xlsx' =
      ext === 'pdf' ? 'pdf' : ['xlsx', 'xls'].includes(ext) ? 'xlsx' : 'docx';

    setFileFormat(detectedFormat);
    setSelectedFile(file);

    setFileSizeStr(formatBytes(file.size));

    // Auto title if empty
    if (!title) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Lütfen yüklenecek bir belge seçin.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Lütfen belge için bir başlık girin.');
      return;
    }
    if (!academicYear.trim()) {
      setErrorMsg('Lütfen eğitim öğretim yılını yazın.');
      return;
    }
    if (!schoolType) {
      setErrorMsg('Lütfen okul seçiniz.');
      return;
    }
    if (!gradeLevel) {
      setErrorMsg('Lütfen sınıf seçiniz.');
      return;
    }
    if (!subject) {
      setErrorMsg('Lütfen ders seçiniz.');
      return;
    }
    if (!category) {
      setErrorMsg('Lütfen kategori seçiniz.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      let htmlPreview: string | undefined;
      let tableSheets: Array<{ name: string; rows: Array<Array<string | number>> }> | undefined;

      // 1. If Excel: extract sheets & rows
      if (fileFormat === 'xlsx') {
        try {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          tableSheets = workbook.SheetNames.map((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<Array<string | number>>(worksheet, {
              header: 1,
              defval: '',
            });
            return {
              name: sheetName,
              rows: rows as Array<Array<string | number>>,
            };
          });
        } catch (err) {
          console.warn('Excel parse error:', err);
        }
      }

      // 2. If Docx: convert to formatted HTML with mammoth
      if (fileFormat === 'docx') {
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          // GÜVENLİK: Word'den üretilen HTML kaydedilmeden önce temizlenir
          htmlPreview = sanitizeHtml(result.value);
        } catch (err) {
          console.warn('Mammoth docx parse error:', err);
        }
      }

      // 3. Dosyanın kendisi depoya yüklenir (kayıt içine gömülmez)
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await onUploadSuccess({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category as DocumentCategory,
        fileFormat,
        fileName: selectedFile.name,
        fileSize: fileSizeStr,
        uploadedBy: 'Öğretmen',
        academicYear: academicYear.trim(),
        schoolType: schoolType as 'Ortaokul' | 'Lise' | 'Diğer',
        subject,
        gradeLevel,
        tags: tags.length > 0 ? tags : [subject, category, schoolType, gradeLevel],
        htmlPreview,
        tableSheets,
      }, selectedFile);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Belge kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      icon={Upload}
      title="Yeni Belge Yükle"
      description="Word (.docx), PDF veya Excel (.xlsx) formatında plan / zümre evrakı ekleyin"
      size="md"
      closeOnBackdrop={false}
      id="upload-document-modal"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary h-10">
            İptal
          </button>
          <button type="submit" form="upload-document-form" disabled={isProcessing || !selectedFile} className="ui-btn ui-btn-primary h-10">
            {isProcessing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
                <span>Yükleniyor...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Belgeyi Arşive Kaydet</span>
              </>
            )}
          </button>
        </>
      }
    >
      <form id="upload-document-form" onSubmit={handleSubmit} className="space-y-3.5">
        {errorMsg && (
          <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Sıra: Eğitim Öğretim Yılı → Okul → Sınıf → Ders → Kategori */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="doc-year" className="ui-label">
              Eğitim Öğretim Yılı *
            </label>
            <input id="doc-year" type="text" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="Örn: 2026-2027" className={FIELD_CLS} />
          </div>
          <div>
            <label htmlFor="doc-school" className="ui-label">
              Okul *
            </label>
            <SelectBox id="doc-school" value={schoolType} onChange={(e) => handleSchoolTypeChange(e.target.value as SchoolType)} className={SELECT_CLS}>
              <option value="">Okul seçiniz</option>
              <option value="Ortaokul">Ortaokul</option>
              <option value="Lise">Lise</option>
              <option value="Diğer">Diğer / Tümü</option>
            </SelectBox>
          </div>
          <div>
            <label htmlFor="doc-grade" className="ui-label">
              Sınıf *
            </label>
            <SelectBox id="doc-grade" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} disabled={!schoolType} className={SELECT_CLS}>
              <option value="">{schoolType ? 'Sınıf seçiniz' : 'Sınıf seçiniz (önce okul)'}</option>
              {availableGrades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
              {schoolType && <option value="Tüm Sınıflar">Tüm Sınıflar (Genel)</option>}
            </SelectBox>
          </div>
          <div>
            <label htmlFor="doc-subject" className="ui-label">
              Ders *
            </label>
            <SelectBox id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!schoolType} className={SELECT_CLS}>
              <option value="">{schoolType ? 'Ders seçiniz' : 'Ders seçiniz (önce okul)'}</option>
              {availableSubjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </SelectBox>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="doc-category" className="ui-label">
              Kategori *
            </label>
            <SelectBox id="doc-category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')} className={SELECT_CLS}>
              <option value="">Kategori seçiniz</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectBox>
          </div>
        </div>

        {/* Belge dosyası */}
        <div>
          <span className="ui-label">Belge Dosyası (.docx, .pdf, .xlsx) *</span>
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
              isDragOver ? 'border-brand bg-brand-soft/40' : selectedFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-line bg-surface-2/50 hover:border-line-strong'
            }`}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx,.doc,.pdf,.xlsx,.xls" className="hidden" />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                  {fileFormat === 'xlsx' ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted">
                    {fileSizeStr} • {fileFormat.toUpperCase()} • Değiştirmek için tıklayın
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 text-muted mx-auto mb-1.5" />
                <p className="text-sm font-semibold text-fg">Dosyayı sürükleyin veya seçmek için tıklayın</p>
                <p className="text-xs text-muted mt-0.5">Word (.docx), PDF (.pdf), Excel (.xlsx, .xls) — en fazla 10 MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Belge başlığı */}
        <div>
          <label htmlFor="doc-title" className="ui-label">
            Belge Başlığı *
          </label>
          <input
            id="doc-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: 2026-2027 Fen Bilgisi 8. Sınıf Yıllık Planı"
            className={FIELD_CLS}
          />
        </div>

        {/* Açıklama ve etiketler */}
        <div>
          <label htmlFor="doc-desc" className="ui-label">
            Açıklama / Zümre Notu
          </label>
          <textarea
            id="doc-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Örn: 1. Dönem yazılı tarihleri ve soru dağılım tablosunu içerir..."
            className={`${inputCls} resize-none`}
          />
        </div>
        <div>
          <label htmlFor="doc-tags" className="ui-label">
            Etiketler (virgülle ayırın)
          </label>
          <input
            id="doc-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Örn: Yıllık Plan, Yazılı, Senaryo 1, Zümre Kararı"
            className={FIELD_CLS}
          />
        </div>
      </form>
    </Modal>
  );
};
