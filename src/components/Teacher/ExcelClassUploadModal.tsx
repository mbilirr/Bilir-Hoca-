import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, Trash2, Sparkles, Clipboard, Info } from 'lucide-react';
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
import { Modal, Segmented, cx } from '../ui/kit';
import {
  CLASS_COLUMNS,
  SheetRow,
  matrixToRows,
  resolveColumns,
  textToMatrix,
  trFold,
  parseClassName,
  parseBranch,
  normalizeClassKey,
  normalizeAcademicYear,
  currentAcademicYear,
} from '../../lib/importNormalize';

interface ExcelClassUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: (createdClasses: ClassGroup[]) => void;
}

interface ParsedClassRow {
  id: string;
  rowNumber: number;
  schoolLevel: 'Ortaokul' | 'Lise';
  gradeLevel: string;
  branch: string;
  name: string;
  academicYear: string;
  description: string;
  isValid: boolean;
  validationError?: string;
  // Sistemde aynı ad + eğitim yılıyla kayıtlı sınıf (yüklemede atlanır)
  existingName?: string;
  result?: { status: 'created' | 'skipped' | 'failed'; message: string };
}

const PASTE_HEADERS = ['Okul', 'Sınıf', 'Şube', 'Eğitim Yılı', 'Açıklama'];

export const ExcelClassUploadModal: React.FC<ExcelClassUploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [activeInputMode, setActiveInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedClassRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const parseRows = (headers: string[], rows: SheetRow[]) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (rows.length === 0) {
      setErrorMessage('Dosyada işlenebilecek veri satırı bulunamadı.');
      return;
    }

    const cols = resolveColumns(headers, CLASS_COLUMNS);
    if (!cols.grade && !cols.name) {
      setErrorMessage('Sınıf bilgisi içeren sütun bulunamadı. Başlık satırında "Sınıf" ve "Şube" (veya "Sınıf Adı") sütunları olmalıdır.');
      return;
    }
    const get = (row: SheetRow, field: keyof typeof CLASS_COLUMNS) => {
      const key = cols[field];
      return key ? (row.values[key] || '').trim() : '';
    };

    const seenKeys = new Set<string>();
    const parsed: ParsedClassRow[] = rows.map((row, idx) => {
      const rawOkul = get(row, 'schoolLevel');
      const rawGrade = get(row, 'grade');
      const rawBranch = get(row, 'branch');
      const rawName = get(row, 'name');
      const rawYear = get(row, 'academicYear');
      const rawDesc = get(row, 'description');

      const fromGrade = parseClassName(rawGrade);
      const fromName = parseClassName(rawName);
      const gradeNum = fromGrade.grade ?? fromName.grade;
      const gradeLevel = gradeNum ? `${gradeNum}. Sınıf` : rawGrade;
      const branch = (rawBranch ? parseBranch(rawBranch) : '') || fromGrade.branch || fromName.branch || '';

      const okul = trFold(rawOkul);
      let schoolLevel: 'Ortaokul' | 'Lise';
      if (okul.includes('lise')) schoolLevel = 'Lise';
      else if (okul.includes('orta')) schoolLevel = 'Ortaokul';
      else schoolLevel = detectSchoolLevelFromGrade(gradeLevel) || 'Ortaokul';

      let name = '';
      if (rawName) {
        // "12-A Sayısal" gibi ekli adlar olduğu gibi kalır; "8. Sınıf - Şube A" -> "8/A"
        name = fromName.rest || !gradeNum || !branch ? rawName : formatClassDisplayName(rawName, branch, gradeLevel);
      } else if (gradeNum && branch) {
        name = formatClassDisplayName('', branch, gradeLevel);
      }

      const academicYear = rawYear ? normalizeAcademicYear(rawYear) : currentAcademicYear();

      let validationError: string | undefined;
      if (!ALL_GRADES.includes(gradeLevel)) {
        validationError = 'Geçersiz sınıf seviyesi (5-12 arası olmalıdır)';
      } else if (schoolLevel === 'Ortaokul' && !MIDDLE_SCHOOL_GRADES.includes(gradeLevel)) {
        validationError = 'Ortaokul için 5, 6, 7 veya 8. sınıf seçilmelidir';
      } else if (schoolLevel === 'Lise' && !HIGH_SCHOOL_GRADES.includes(gradeLevel)) {
        validationError = 'Lise için 9, 10, 11 veya 12. sınıf seçilmelidir';
      } else if (!branch) {
        validationError = rawBranch ? `Geçersiz şube: "${rawBranch}" (tek harf olmalı)` : 'Şube belirtilmemiş';
      } else if (!academicYear) {
        validationError = `Eğitim yılı "${rawYear}" anlaşılamadı (örn. ${currentAcademicYear()})`;
      }

      let existingName: string | undefined;
      if (!validationError) {
        const dupKey = `${normalizeClassKey(name)}|${academicYear}`;
        if (seenKeys.has(dupKey)) {
          validationError = 'Bu sınıf listede tekrar ediyor';
        } else {
          seenKeys.add(dupKey);
          existingName = dataService.findDuplicateClass(name, academicYear)?.name;
        }
      }

      return {
        id: `row-${Date.now()}-${idx}`,
        rowNumber: row.rowNumber,
        schoolLevel,
        gradeLevel,
        branch,
        name: name || rawName || rawGrade || '-',
        academicYear: academicYear || rawYear,
        description: rawDesc,
        isValid: !validationError,
        validationError,
        existingName,
      };
    });

    setParsedRows(parsed);
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
      if (!matrix || matrix.length === 0) {
        throw new Error('Yüklenen Excel çalışma sayfası boş görünüyor.');
      }
      const { headers, rows } = matrixToRows(matrix, CLASS_COLUMNS);
      parseRows(headers, rows);
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
    const matrix = textToMatrix(pastedText);
    const { headers, rows } = matrixToRows(matrix, CLASS_COLUMNS, PASTE_HEADERS);
    parseRows(headers, rows);
  };

  const downloadSampleExcel = () => {
    const year = currentAcademicYear();
    const sample: Array<[string, string, string, string]> = [
      ['Ortaokul', '5. Sınıf', 'Şube A', '5-A Şubesi Temel Eğitim Grubu'],
      ['Ortaokul', '6. Sınıf', 'Şube B', '6-B Şubesi'],
      ['Ortaokul', '7. Sınıf', 'Şube C', '7-C Şubesi'],
      ['Ortaokul', '8. Sınıf', 'Şube A', '8-A LGS Hazırlık Sınıfı'],
      ['Lise', '9. Sınıf', 'Şube A', '9-A Şubesi Anadolu Lisesi'],
      ['Lise', '10. Sınıf', 'Şube B', '10-B Şubesi'],
      ['Lise', '11. Sınıf', 'Şube C', '11-C Sayısal Sınıfı'],
      ['Lise', '12. Sınıf', 'Şube D', '12-D YKS Hazırlık Sınıfı'],
    ];
    const sampleData = sample.map(([okul, sinif, sube, aciklama]) => ({
      Okul: okul,
      Sınıf: sinif,
      Şube: sube,
      'Sınıf Adı': `${sinif} - ${sube}`,
      'Eğitim Yılı': year,
      Açıklama: aciklama,
    }));

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 32 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sınıflar');
    XLSX.writeFile(workbook, 'Ornek_Sinif_Yukleme_Sablonu.xlsx');
  };

  // Her satırı ayrı dene: kayıtlı olanları atla, hata olsa da kalanlarla devam et, satır satır sonuç göster
  const handleSaveAllClasses = async () => {
    const pending = parsedRows.filter((r) => r.isValid && !r.existingName && r.result?.status !== 'created');
    if (pending.length === 0) {
      setErrorMessage('Kaydedilecek yeni ve geçerli bir sınıf bulunmuyor.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);
    const createdClasses: ClassGroup[] = [];
    const results = new Map<string, ParsedClassRow['result']>();

    for (const row of pending) {
      const existing = dataService.findDuplicateClass(row.name, row.academicYear);
      if (existing) {
        results.set(row.id, { status: 'skipped', message: `Zaten kayıtlı: ${existing.name}` });
        continue;
      }
      try {
        const newClass = await dataService.addClass({
          name: row.name,
          branch: row.branch,
          schoolLevel: row.schoolLevel,
          gradeLevel: row.gradeLevel,
          academicYear: row.academicYear,
          description: row.description,
        });
        createdClasses.push(newClass);
        results.set(row.id, { status: 'created', message: 'Eklendi' });
      } catch (err: any) {
        results.set(row.id, { status: 'failed', message: err?.message || 'Eklenemedi' });
      }
    }

    setParsedRows((prev) => prev.map((r) => (results.has(r.id) ? { ...r, result: results.get(r.id) } : r)));
    setIsSaving(false);

    const skipped = Array.from(results.values()).filter((r) => r?.status === 'skipped').length + parsedRows.filter((r) => r.isValid && r.existingName).length;
    const failed = Array.from(results.values()).filter((r) => r?.status === 'failed').length;
    const parts = [`${createdClasses.length} sınıf eklendi`];
    if (skipped > 0) parts.push(`${skipped} sınıf zaten kayıtlı olduğu için atlandı`);
    if (failed > 0) parts.push(`${failed} sınıf eklenemedi (satırlardaki hata mesajlarına bakınız)`);
    if (failed > 0) setErrorMessage(parts.join(', ') + '.');
    else setSuccessMessage(parts.join(', ') + '.');

    if (createdClasses.length > 0 && onUploadSuccess) onUploadSuccess(createdClasses);
  };

  const removeRow = (id: string) => setParsedRows((prev) => prev.filter((r) => r.id !== id));

  const handleClose = () => {
    if (isSaving) return;
    // Yükleme tamamlandıysa bir sonraki açılışta temiz başla
    if (parsedRows.length > 0 && parsedRows.every((r) => r.result || !r.isValid || r.existingName)) {
      setParsedRows([]);
      setFileName(null);
      setSuccessMessage(null);
      setErrorMessage(null);
    }
    onClose();
  };

  const pendingCount = parsedRows.filter((r) => r.isValid && !r.existingName && r.result?.status !== 'created').length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;
  const existingCount = parsedRows.filter((r) => r.isValid && r.existingName).length;
  const finished = parsedRows.some((r) => r.result) && pendingCount === 0;

  const statusCell = (row: ParsedClassRow) => {
    if (row.result) {
      const tone =
        row.result.status === 'created' ? 'text-success-fg' : row.result.status === 'skipped' ? 'text-warning-fg' : 'text-danger-fg';
      const Icon = row.result.status === 'created' ? CheckCircle2 : row.result.status === 'skipped' ? Info : AlertCircle;
      return (
        <span className={cx('flex items-start gap-1 text-[11px]', tone)}>
          <Icon className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{row.result.message}</span>
        </span>
      );
    }
    if (!row.isValid) {
      return (
        <span className="flex items-start gap-1 text-danger-fg text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{row.validationError || 'Hatalı'}</span>
        </span>
      );
    }
    if (row.existingName) {
      return (
        <span className="flex items-start gap-1 text-warning-fg text-[11px]">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>Zaten kayıtlı ({row.existingName}), atlanacak</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-success-fg text-[11px]">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Hazır</span>
      </span>
    );
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      closeOnBackdrop={false}
      size="xl"
      icon={FileSpreadsheet}
      tone="success"
      title="Excel'den Toplu Sınıf Yükleme"
      description="Excel veya CSV dosyasından sınıfları, şubeleri ve kademeleri sisteme aktarın. Kayıtlı sınıflar atlanır."
      footer={
        <>
          <button type="button" onClick={downloadSampleExcel} className="ui-btn ui-btn-ghost ui-btn-sm mr-auto">
            <Download className="w-3.5 h-3.5 text-success-fg" />
            <span>Örnek Şablon (.xlsx)</span>
          </button>
          <button type="button" onClick={handleClose} disabled={isSaving} className="ui-btn ui-btn-secondary ui-btn-sm">
            {finished ? 'Kapat' : 'Vazgeç'}
          </button>
          <button
            type="button"
            disabled={pendingCount === 0 || isProcessing || isSaving}
            onClick={handleSaveAllClasses}
            className="ui-btn ui-btn-success ui-btn-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSaving ? 'Yükleniyor...' : `${pendingCount} Sınıfı Sisteme Yükle`}</span>
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Segmented<'file' | 'paste'>
          value={activeInputMode}
          onChange={setActiveInputMode}
          size="sm"
          items={[
            { value: 'file', label: 'Excel / CSV Dosyası Yükle', icon: Upload },
            { value: 'paste', label: 'Excel Tablosunu Yapıştır', icon: Clipboard },
          ]}
        />

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
            className={cx(
              'border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer',
              isDragOver ? 'border-success bg-success-soft' : 'border-line-strong hover:border-success bg-surface-2/40'
            )}
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
                e.target.value = '';
              }}
            />
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-success-soft flex items-center justify-center text-success-fg">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-fg mb-1">
              {isProcessing ? 'Dosya okunuyor...' : fileName ? fileName : 'Excel (.xlsx, .xls) veya CSV dosyanızı buraya sürükleyin'}
            </p>
            <p className="text-xs text-muted">
              veya bilgisayarınızdan seçmek için <span className="text-success-fg underline">tıklayın</span>
            </p>
            <p className="mt-3 text-[11px] text-muted">
              Desteklenen sütunlar: Okul, Sınıf, Şube, Sınıf Adı, Eğitim Yılı, Açıklama. Başlık satırı üstte başka satırlar olsa da bulunur.
            </p>
          </div>
        )}

        {activeInputMode === 'paste' && (
          <div className="space-y-3">
            <div className="text-xs text-muted flex flex-wrap items-center justify-between gap-2">
              <span>Excel'den kopyaladığınız hücreleri (başlık satırıyla veya başlıksız) bu alana yapıştırın:</span>
              <span className="text-[11px]">Başlıksız sıra: Okul | Sınıf | Şube | Yıl | Açıklama</span>
            </div>
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Ortaokul\t5. Sınıf\tŞube A\t${currentAcademicYear()}\t5-A Temel Sınıf\nLise\t9. Sınıf\tŞube B\t${currentAcademicYear()}\t9-B Hazırlık`}
              className="w-full p-3 bg-surface border border-line-strong rounded-xl text-xs text-fg font-mono focus:ring-2 focus:ring-brand/25 focus:outline-none"
            />
            <button type="button" onClick={handleTextParse} className="ui-btn ui-btn-success ui-btn-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Yapıştırılan Tabloyu Çözümle</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="p-3 bg-danger-soft rounded-xl flex items-start gap-2 text-xs text-danger-fg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-success-soft rounded-xl flex items-start gap-2 text-xs text-success-fg">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            <span>{successMessage}</span>
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-fg">Çözümlenen Sınıflar: {parsedRows.length} Adet</span>
                <span className="ui-chip ui-chip-success">{pendingCount} Yüklenecek</span>
                {existingCount > 0 && <span className="ui-chip ui-chip-warning">{existingCount} Zaten Kayıtlı</span>}
                {invalidCount > 0 && <span className="ui-chip ui-chip-danger">{invalidCount} Hatalı</span>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setParsedRows([]);
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
                disabled={isSaving}
                className="ui-btn ui-btn-ghost ui-btn-sm"
              >
                Listeyi Temizle
              </button>
            </div>

            <div className="border border-line rounded-xl overflow-auto max-h-72">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-muted sticky top-0 border-b border-line">
                  <tr>
                    <th className="p-2.5 font-semibold">Satır</th>
                    <th className="p-2.5 font-semibold">Okul</th>
                    <th className="p-2.5 font-semibold">Sınıf</th>
                    <th className="p-2.5 font-semibold">Şube</th>
                    <th className="p-2.5 font-semibold">Sınıf Adı</th>
                    <th className="p-2.5 font-semibold">Eğitim Yılı</th>
                    <th className="p-2.5 font-semibold">Açıklama</th>
                    <th className="p-2.5 font-semibold">Durum</th>
                    <th className="p-2.5 text-right font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {parsedRows.map((row) => (
                    <tr key={row.id} className={cx(!row.isValid || row.result?.status === 'failed' ? 'bg-danger-soft/40' : 'hover:bg-surface-2/50')}>
                      <td className="p-2.5 font-mono text-muted">{row.rowNumber}</td>
                      <td className="p-2.5">
                        <span className={cx('ui-chip', row.schoolLevel === 'Ortaokul' ? 'ui-chip-warning' : 'ui-chip-brand')}>{row.schoolLevel}</span>
                      </td>
                      <td className="p-2.5 font-semibold text-fg">{row.gradeLevel || '-'}</td>
                      <td className="p-2.5 font-semibold text-fg-2">{row.branch || '-'}</td>
                      <td className="p-2.5 text-brand-fg font-medium">{row.name}</td>
                      <td className="p-2.5 text-muted font-mono text-[11px]">{row.academicYear || '-'}</td>
                      <td className="p-2.5 text-muted max-w-[180px] truncate" title={row.description}>
                        {row.description || '-'}
                      </td>
                      <td className="p-2.5 min-w-[160px]">{statusCell(row)}</td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={isSaving}
                          className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon hover:text-danger-fg"
                          title="Satırı Kaldır"
                          aria-label={`${row.rowNumber}. satırı kaldır`}
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
    </Modal>
  );
};
