import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Calendar,
  BookOpen,
  Info,
  Save,
  GraduationCap,
  Building2,
  School,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import confetti from 'canvas-confetti';
import { TeacherDocument, DocumentCategory } from '../../../types';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newDoc: Omit<TeacherDocument, 'id' | 'uploadedAt'>) => void;
}

const ORTAOKUL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilgisi',
  'Sosyal Bilgiler',
  'İngilizce',
];

const LISE_SUBJECTS = [
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Coğrafya',
  'Tarih',
  'Edebiyat',
];

const ALL_SUBJECTS = [
  'Matematik',
  'Türkçe',
  'Fen Bilgisi',
  'Sosyal Bilgiler',
  'İngilizce',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Coğrafya',
  'Tarih',
  'Edebiyat',
];

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  if (!isOpen) return null;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('yearly_plan');
  const [schoolType, setSchoolType] = useState<'Ortaokul' | 'Lise' | 'Diğer'>('Ortaokul');
  const [subject, setSubject] = useState('Fen Bilgisi');
  const [gradeLevel, setGradeLevel] = useState('5. Sınıf');
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<'pdf' | 'docx' | 'xlsx'>('pdf');
  const [fileSizeStr, setFileSizeStr] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Switch school type and adapt subject / grade automatically
  const handleSchoolTypeChange = (newSchool: 'Ortaokul' | 'Lise' | 'Diğer') => {
    setSchoolType(newSchool);
    if (newSchool === 'Ortaokul') {
      if (!ORTAOKUL_SUBJECTS.includes(subject)) {
        setSubject('Fen Bilgisi');
      }
      if (['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf'].includes(gradeLevel)) {
        setGradeLevel('5. Sınıf');
      }
    } else if (newSchool === 'Lise') {
      if (!LISE_SUBJECTS.includes(subject)) {
        setSubject('Matematik');
      }
      if (['5. Sınıf', '6. Sınıf', '7. Sınıf', '8. Sınıf'].includes(gradeLevel)) {
        setGradeLevel('9. Sınıf');
      }
    }
  };

  const availableSubjects =
    schoolType === 'Ortaokul'
      ? ORTAOKUL_SUBJECTS
      : schoolType === 'Lise'
      ? LISE_SUBJECTS
      : ALL_SUBJECTS;

  // Auto file processor
  const handleProcessFile = async (file: File) => {
    setErrorMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!ext || !['pdf', 'docx', 'xlsx', 'xls', 'doc'].includes(ext)) {
      setErrorMsg('Lütfen sadece .docx, .pdf veya .xlsx/.xls uzantılı belge yükleyin.');
      return;
    }

    const detectedFormat: 'pdf' | 'docx' | 'xlsx' =
      ext === 'pdf' ? 'pdf' : ['xlsx', 'xls'].includes(ext) ? 'xlsx' : 'docx';

    setFileFormat(detectedFormat);
    setSelectedFile(file);

    // Format size
    const sizeKB = file.size / 1024;
    const formattedSize =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB.toFixed(1)} KB`;
    setFileSizeStr(formattedSize);

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

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();

      let htmlPreview: string | undefined;
      let tableSheets: Array<{ name: string; rows: Array<Array<string | number>> }> | undefined;
      let fileData: string | undefined;

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
          htmlPreview = result.value;
        } catch (err) {
          console.warn('Mammoth docx parse error:', err);
        }
      }

      // 3. Convert file to Base64 Data URL for universal in-app preview & download
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(selectedFile);
      });
      fileData = await base64Promise;

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      onUploadSuccess({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        fileFormat,
        fileName: selectedFile.name,
        fileSize: fileSizeStr,
        fileData,
        uploadedBy: 'Öğretmen',
        academicYear,
        schoolType,
        subject,
        gradeLevel,
        tags: tags.length > 0 ? tags : [subject, category, schoolType, gradeLevel],
        htmlPreview,
        tableSheets,
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      onClose();
    } catch (err: any) {
      setErrorMsg('Dosya işlenirken bir hata oluştu: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Yeni Plan / Zümre Belgesi Yükle</h2>
              <p className="text-xs text-slate-400">
                Word (.docx), PDF veya Excel (.xlsx) formatında evrak ekleyin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* FILE DROPZONE */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Belge Dosyası (.docx, .pdf, .xlsx) *
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : selectedFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".docx,.doc,.pdf,.xlsx,.xls"
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {fileFormat === 'xlsx' ? (
                      <FileSpreadsheet className="w-6 h-6" />
                    ) : (
                      <FileText className="w-6 h-6" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400">
                      {fileSizeStr} • {fileFormat.toUpperCase()} • Dosyayı değiştirmek için tıklayın
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-200 mb-1">
                    Dosyayı buraya sürükleyin veya seçmek için tıklayın
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Desteklenenler: Microsoft Word (.docx), PDF (.pdf), Excel (.xlsx, .xls)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* DOCUMENT TITLE */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Belge Başlığı *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: 2026-2027 Fen Bilgisi 8. Sınıf Yıllık Planı"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* OKUL BUTONLARI (School Type Selector) */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                <School className="w-3.5 h-3.5 text-indigo-400" />
                <span>Okul / Kademe Seçimi *</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Seçime göre ders ve sınıf listesi otomatik güncellenir
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSchoolTypeChange('Ortaokul')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  schoolType === 'Ortaokul'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/40'
                    : 'bg-slate-900 text-slate-300 border-slate-750 hover:bg-slate-800'
                }`}
              >
                <span>🏫 Ortaokul</span>
              </button>
              <button
                type="button"
                onClick={() => handleSchoolTypeChange('Lise')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  schoolType === 'Lise'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/40'
                    : 'bg-slate-900 text-slate-300 border-slate-750 hover:bg-slate-800'
                }`}
              >
                <span>🎓 Lise</span>
              </button>
              <button
                type="button"
                onClick={() => handleSchoolTypeChange('Diğer')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                  schoolType === 'Diğer'
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/40'
                    : 'bg-slate-900 text-slate-300 border-slate-750 hover:bg-slate-800'
                }`}
              >
                <span>🏛️ Diğer / Tümü</span>
              </button>
            </div>
          </div>

          {/* CATEGORY & DERSLER (SUBJECT) GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Kategori *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="yearly_plan">Yıllık Ders Planı</option>
                <option value="weekly_plan">Haftalık Ders Planı</option>
                <option value="sample_exam">Örnek Yazılılar & Denemeler</option>
                <option value="meeting_minutes">Zümre Tutanakları & Kurul Kararları</option>
                <option value="curriculum">Müfredat & Kazanım Çizelgesi</option>
                <option value="other">Diğer Eğitim Dokümanları</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Dersler *</span>
                <span className="text-[10px] text-indigo-300 font-normal">
                  ({schoolType})
                </span>
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                {availableSubjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SINIF AÇILIR PENCERESİ & EĞİTİM ÖĞRETİM YILI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Sınıf Açılır Penceresi *
              </label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                {/* 5.Sınıf - 12.Sınıf tam listesi */}
                <optgroup label="Ortaokul Sınıfları (5-8)">
                  <option value="5. Sınıf">5. Sınıf</option>
                  <option value="6. Sınıf">6. Sınıf</option>
                  <option value="7. Sınıf">7. Sınıf</option>
                  <option value="8. Sınıf">8. Sınıf</option>
                </optgroup>
                <optgroup label="Lise Sınıfları (9-12)">
                  <option value="9. Sınıf">9. Sınıf</option>
                  <option value="10. Sınıf">10. Sınıf</option>
                  <option value="11. Sınıf">11. Sınıf</option>
                  <option value="12. Sınıf">12. Sınıf</option>
                </optgroup>
                <option value="Tüm Sınıflar">Tüm Sınıflar (Genel)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Eğitim Öğretim Yılı
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* DESCRIPTION & TAGS */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Açıklama / Zümre Notu
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Örn: 1. Dönem yazılı tarihleri ve soru dağılım tablosunu içerir..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Etiketler (Virgülle ayırın)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Örn: Yıllık Plan, Yazılı, Senaryo 1, Zümre Kararı"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* FOOTER BUTTONS */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isProcessing || !selectedFile}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30"
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>İşleniyor...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Belgeyi Arşive Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
