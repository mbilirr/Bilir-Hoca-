import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  School,
  Trash2,
  Sparkles,
  Clipboard,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ClassGroup } from '../../types';
import { dataService } from '../../services/dataService';
import {
  MIDDLE_SCHOOL_GRADES,
  HIGH_SCHOOL_GRADES,
  ALL_GRADES,
  detectSchoolLevelFromGrade,
  formatClassDisplayName,
} from '../../constants/schoolConstants';

interface ExcelClassUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: (createdClasses: ClassGroup[]) => void;
}

interface ParsedClassRow {
  id: string;
  schoolLevel: 'Ortaokul' | 'Lise';
  gradeLevel: string;
  branch: string;
  name: string;
  academicYear: string;
  description: string;
  isValid: boolean;
  validationError?: string;
}

export const ExcelClassUploadModal: React.FC<ExcelClassUploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [activeInputMode, setActiveInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedClassRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Normalize grade string e.g. "5", "5.", "5. Sınıf", "5-A" -> "5. Sınıf"
  const normalizeGrade = (raw: string): string => {
    const trimmed = (raw || '').trim();
    const match = trimmed.match(/^(5|6|7|8|9|10|11|12)/);
    if (match) {
      return `${match[1]}. Sınıf`;
    }
    return trimmed;
  };

  // Normalize branch e.g. "A", "Şube A", "a" -> "A"
  const normalizeBranch = (raw: string): string => {
    const trimmed = (raw || '').trim().toUpperCase();
    const match = trimmed.match(/([A-ZÇĞİÖŞÜ])/);
    if (match) {
      return match[1];
    }
    return trimmed ? trimmed.replace(/şube/gi, '').trim() || 'A' : 'A';
  };

  // Parse generic row data from Excel or text
  const parseRawRows = (rows: Record<string, unknown>[]) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!rows || rows.length === 0) {
      setErrorMessage('Dosyada işlenebilecek veri satırı bulunamadı.');
      return;
    }

    const parsed: ParsedClassRow[] = [];

    rows.forEach((row, idx) => {
      // Find keys flexibly
      const keys = Object.keys(row);
      const getKeyVal = (...candidates: string[]) => {
        for (const cand of candidates) {
          const matchedKey = keys.find((k) =>
            k.toLowerCase().trim().replace(/[^a-z0-9çğıöşü]/g, '').includes(cand.toLowerCase())
          );
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
            return String(row[matchedKey]).trim();
          }
        }
        return '';
      };

      const rawOkul = getKeyVal('okul', 'kademe', 'tur', 'seviye');
      const rawGrade = getKeyVal('sinif', 'grade', 'kademe');
      const rawBranch = getKeyVal('sube', 'alan', 'branch');
      const rawName = getKeyVal('ad', 'isim', 'sinifadi', 'name');
      const rawYear = getKeyVal('yil', 'donem', 'akademik', 'year') || '2026-2027';
      const rawDesc = getKeyVal('aciklama', 'not', 'tanim', 'desc') || '';

      // Clean values
      const gradeLevel = normalizeGrade(rawGrade);
      const branch = normalizeBranch(rawBranch);

      let schoolLevel: 'Ortaokul' | 'Lise' = 'Ortaokul';
      if (rawOkul.toLowerCase().includes('lise')) {
        schoolLevel = 'Lise';
      } else if (rawOkul.toLowerCase().includes('orta')) {
        schoolLevel = 'Ortaokul';
      } else {
        // Auto-detect from grade
        schoolLevel = detectSchoolLevelFromGrade(gradeLevel) || 'Ortaokul';
      }

      // Generate clean name if not provided
      let name = rawName;
      if (!name) {
        if (gradeLevel && branch) {
          name = formatClassDisplayName('', branch, gradeLevel);
        } else if (gradeLevel) {
          name = `${gradeLevel}`;
        } else {
          name = `Sınıf ${idx + 1}`;
        }
      } else {
        name = formatClassDisplayName(name, branch, gradeLevel);
      }

      let isValid = true;
      let validationError: string | undefined;

      if (!ALL_GRADES.includes(gradeLevel)) {
        isValid = false;
        validationError = 'Geçersiz sınıf seviyesi (5-12 arası olmalıdır)';
      } else if (schoolLevel === 'Ortaokul' && !MIDDLE_SCHOOL_GRADES.includes(gradeLevel)) {
        isValid = false;
        validationError = 'Ortaokul için 5, 6, 7 veya 8. sınıf seçilmelidir';
      } else if (schoolLevel === 'Lise' && !HIGH_SCHOOL_GRADES.includes(gradeLevel)) {
        isValid = false;
        validationError = 'Lise için 9, 10, 11 veya 12. sınıf seçilmelidir';
      }

      parsed.push({
        id: `row-${Date.now()}-${idx}`,
        schoolLevel,
        gradeLevel,
        branch,
        name,
        academicYear: rawYear,
        description: rawDesc,
        isValid,
        validationError,
      });
    });

    if (parsed.length === 0) {
      setErrorMessage('Hiçbir geçerli sınıf satırı okunamadı.');
      return;
    }

    setParsedRows(parsed);
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      if (!jsonData || jsonData.length === 0) {
        throw new Error('Yüklenen Excel çalışma sayfası boş görünüyor.');
      }

      parseRawRows(jsonData);
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Dosya okunurken bir hata oluştu. Lütfen geçerli bir Excel (.xlsx, .xls) veya CSV dosyası yükleyin.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextParse = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Lütfen yapıştırılmış bir veri giriniz.');
      return;
    }

    const lines = pastedText.trim().split('\n');
    if (lines.length === 0) return;

    const separator = pastedText.includes('\t') ? '\t' : ',';
    const rows = lines.map((line) => line.split(separator).map((cell) => cell.trim()));

    // Check if first line is a header
    const firstLineJoined = lines[0].toLowerCase();
    const hasHeader =
      firstLineJoined.includes('okul') ||
      firstLineJoined.includes('sınıf') ||
      firstLineJoined.includes('sinif') ||
      firstLineJoined.includes('şube') ||
      firstLineJoined.includes('sube');

    const dataLines = hasHeader ? rows.slice(1) : rows;

    const objectRows: Record<string, unknown>[] = dataLines
      .filter((r) => r.some((c) => c.length > 0))
      .map((r) => ({
        okul: r[0] || '',
        sinif: r[1] || '',
        sube: r[2] || '',
        yil: r[3] || '2026-2027',
        aciklama: r[4] || '',
      }));

    parseRawRows(objectRows);
  };

  const downloadSampleExcel = () => {
    const sampleData = [
      {
        Okul: 'Ortaokul',
        Sınıf: '5. Sınıf',
        Şube: 'Şube A',
        'Sınıf Adı': '5. Sınıf - Şube A',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '5-A Şubesi Temel Eğitim Grubu',
      },
      {
        Okul: 'Ortaokul',
        Sınıf: '6. Sınıf',
        Şube: 'Şube B',
        'Sınıf Adı': '6. Sınıf - Şube B',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '6-B Şubesi',
      },
      {
        Okul: 'Ortaokul',
        Sınıf: '7. Sınıf',
        Şube: 'Şube C',
        'Sınıf Adı': '7. Sınıf - Şube C',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '7-C Şubesi',
      },
      {
        Okul: 'Ortaokul',
        Sınıf: '8. Sınıf',
        Şube: 'Şube A',
        'Sınıf Adı': '8. Sınıf - Şube A',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '8-A LGS Hazırlık Sınıfı',
      },
      {
        Okul: 'Lise',
        Sınıf: '9. Sınıf',
        Şube: 'Şube A',
        'Sınıf Adı': '9. Sınıf - Şube A',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '9-A Şubesi Anadolu Lisesi',
      },
      {
        Okul: 'Lise',
        Sınıf: '10. Sınıf',
        Şube: 'Şube B',
        'Sınıf Adı': '10. Sınıf - Şube B',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '10-B Şubesi',
      },
      {
        Okul: 'Lise',
        Sınıf: '11. Sınıf',
        Şube: 'Şube C',
        'Sınıf Adı': '11. Sınıf - Şube C',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '11-C Sayısal Sınıfı',
      },
      {
        Okul: 'Lise',
        Sınıf: '12. Sınıf',
        Şube: 'Şube D',
        'Sınıf Adı': '12. Sınıf - Şube D',
        'Eğitim Yılı': '2026-2027',
        Açıklama: '12-D YKS Hazırlık Sınıfı',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sınıflar');
    XLSX.writeFile(workbook, 'Ornek_Sinif_Yukleme_Sablonu.xlsx');
  };

  const handleSaveAllClasses = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('Kaydedilecek geçerli bir sınıf bulunmuyor.');
      return;
    }

    const createdClasses: ClassGroup[] = [];

    validRows.forEach((row) => {
      const newClass = dataService.addClass({
        name: row.name,
        branch: row.branch,
        schoolLevel: row.schoolLevel,
        gradeLevel: row.gradeLevel,
        academicYear: row.academicYear || '2026-2027',
        description: row.description,
      });
      createdClasses.push(newClass);
    });

    setSuccessMessage(`${createdClasses.length} sınıf sisteme başarıyla eklendi!`);
    if (onUploadSuccess) {
      onUploadSuccess(createdClasses);
    }

    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const removeRow = (id: string) => {
    setParsedRows((prev) => prev.filter((r) => r.id !== id));
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Excel'den Toplu Sınıf Yükleme</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Ortaokul & Lise
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Excel veya CSV dosyasından tüm sınıfları, şubeleri ve kademeleri tek tıkla sisteme aktarın.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadSampleExcel}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Örnek şablon indir"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Örnek Şablon (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Mode Switcher */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setActiveInputMode('file')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeInputMode === 'file'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel / CSV Dosyası Yükle</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveInputMode('paste')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeInputMode === 'paste'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Excel Tablosunu Yapıştır</span>
            </button>
          </div>

          {/* Input Method 1: File Upload */}
          {activeInputMode === 'file' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                isDragOver
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">
                {fileName ? fileName : 'Excel (.xlsx, .xls) veya CSV dosyanızı buraya sürükleyin'}
              </p>
              <p className="text-xs text-slate-400">
                veya bilgisayarınızdan seçmek için{' '}
                <span className="text-emerald-400 underline">tıklayın</span>
              </p>
              <div className="mt-3 flex items-center justify-center space-x-2 text-[11px] text-slate-500">
                <span>Desteklenen Sütunlar: Okul, Sınıf, Şube, Sınıf Adı, Eğitim Yılı, Açıklama</span>
              </div>
            </div>
          )}

          {/* Input Method 2: Paste Text */}
          {activeInputMode === 'paste' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Excel'den kopyaladığınız hücreleri doğrudan bu alana yapıştırın:</span>
                <span className="text-slate-500 text-[11px]">Sütunlar: Okul | Sınıf | Şube | Yıl | Açıklama</span>
              </div>
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Ortaokul	5. Sınıf	Şube A	2026-2027	5-A Temel Sınıf&#10;Lise	9. Sınıf	Şube B	2026-2027	9-B Hazırlık"
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleTextParse}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md cursor-pointer transition-all flex items-center space-x-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Yapıştırılan Tabloyu Çözümle</span>
              </button>
            </div>
          )}

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Parsed Results Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-white">Çözümlenen Sınıflar: {parsedRows.length} Adet</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                    {validCount} Geçerli
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                      {invalidCount} Hatalı
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setParsedRows([])}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Listeyi Temizle
                </button>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5 font-semibold">Okul</th>
                      <th className="p-2.5 font-semibold">Sınıf</th>
                      <th className="p-2.5 font-semibold">Şube</th>
                      <th className="p-2.5 font-semibold">Sınıf Adı</th>
                      <th className="p-2.5 font-semibold">Eğitim Yılı</th>
                      <th className="p-2.5 font-semibold">Durum</th>
                      <th className="p-2.5 text-right font-semibold">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {parsedRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-900/50">
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.schoolLevel === 'Ortaokul'
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                            }`}
                          >
                            {row.schoolLevel}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-white">{row.gradeLevel}</td>
                        <td className="p-2.5 font-semibold text-slate-300">{row.branch}</td>
                        <td className="p-2.5 text-indigo-300 font-medium">{row.name}</td>
                        <td className="p-2.5 text-slate-400 font-mono text-[11px]">{row.academicYear}</td>
                        <td className="p-2.5">
                          {row.isValid ? (
                            <span className="flex items-center space-x-1 text-emerald-400 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Hazır</span>
                            </span>
                          ) : (
                            <span
                              className="flex items-center space-x-1 text-rose-400 text-[11px]"
                              title={row.validationError}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>{row.validationError || 'Hatalı'}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Satırı Kaldır"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            Vazgeç
          </button>

          <button
            type="button"
            disabled={validCount === 0 || isProcessing}
            onClick={handleSaveAllClasses}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{validCount} Sınıfı Sisteme Yükle</span>
          </button>
        </div>
      </div>
    </div>
  );
};
