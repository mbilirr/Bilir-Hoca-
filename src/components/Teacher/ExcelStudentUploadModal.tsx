import React, { useState, useRef } from 'react';
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertCircle, Users, School, Trash2, Sparkles, Clipboard, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ClassGroup, Student, StudentAccountResult, StudentAccountFailure } from '../../types';
import { dataService } from '../../services/dataService';
import { detectSchoolLevelFromGrade, formatClassDisplayName } from '../../constants/schoolConstants';
import { Modal, Segmented, cx } from '../ui/kit';
import {
  STUDENT_COLUMNS,
  SheetRow,
  matrixToRows,
  textToMatrix,
  extractStudentRows,
  parseClassName,
  normalizeClassKey,
  currentAcademicYear,
  trFold,
  emailIssue,
  normalizeTurkishPhone,
  PHONE_ERROR,
} from '../../lib/importNormalize';

interface ExcelStudentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  existingStudents?: Student[];
  onUploadSuccess?: (createdStudents: Student[]) => void;
  // Hesapları açılan öğrencilerin giriş bilgileri (şifreler yalnızca bu an gösterilir)
  onAccountsCreated?: (result: StudentAccountResult) => void;
}

interface ParsedStudentRow {
  id: string;
  rowNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  className: string;
  matchedClassId: string;
  classError?: string;
  // Excel'de sınıf hücresi boştu: "Sınıfı boş satırlar için" seçimindeki sınıfa atanır
  usesDefaultClass: boolean;
  studentNumber: string;
  email: string;
  phone: string;
  password: string;
  isNewClass: boolean;
  isValid: boolean;
  validationError?: string;
}

interface ClassMatch {
  classId: string;
  className: string;
  isNew: boolean;
  error?: string;
}

const PASTE_HEADERS = ['Ad', 'Soyad', 'Sınıf', 'Öğrenci No', 'Telefon', 'E-Posta'];

// Sınıfın şube/sınıf bilgisi (ad çözümlenemezse sınıf seviyesi ve şube alanlarından)
function classGradeBranch(c: ClassGroup): { grade?: number; branch?: string } {
  const p = parseClassName(c.name);
  let grade = p.grade;
  let branch = p.branch;
  if (!grade && c.gradeLevel) grade = parseClassName(c.gradeLevel).grade;
  if (!branch && c.branch && /^[A-Za-zÇĞİÖŞÜçğıöşü]$/.test(c.branch.replace(/şube/gi, '').trim())) {
    branch = c.branch.replace(/şube/gi, '').trim();
  }
  return { grade, branch: branch ? trFold(branch) : undefined };
}

export const ExcelStudentUploadModal: React.FC<ExcelStudentUploadModalProps> = ({
  isOpen,
  onClose,
  classes,
  existingStudents = [],
  onUploadSuccess,
  onAccountsCreated,
}) => {
  const isAdmin = dataService.isCurrentUserAdmin();
  const [activeInputMode, setActiveInputMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [defaultClassId, setDefaultClassId] = useState<string>(classes[0]?.id || '');
  const [autoCreateClasses, setAutoCreateClasses] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Excel'deki sınıf yazısını sistemdeki sınıfla eşleştirir: "8-A", "8/A", "8A", "8. Sınıf - A" aynı sayılır.
  // Yalnızca sınıf seviyesi ("8") yazılmışsa eşleştirme yapılmaz (hangi şube olduğu belli değil).
  const findMatchingClass = (rawClassName: string): ClassMatch => {
    const raw = (rawClassName || '').trim();
    if (!raw) {
      const defaultClass = classes.find((c) => c.id === defaultClassId) || classes[0];
      return {
        classId: defaultClass ? defaultClass.id : '',
        className: defaultClass ? defaultClass.name : '',
        isNew: false,
      };
    }

    const parsed = parseClassName(raw);
    if (parsed.grade && !parsed.branch && !parsed.rest) {
      return { classId: '', className: raw, isNew: false, error: 'Şube eksik: sınıfı "8/A" gibi şubesiyle yazın' };
    }

    const key = normalizeClassKey(raw);
    const exact = classes.filter((c) => normalizeClassKey(c.name) === key);
    if (exact.length > 0) {
      const year = currentAcademicYear();
      const pick = exact.find((c) => c.academicYear === year) || exact[0];
      return { classId: pick.id, className: pick.name, isNew: false };
    }

    // "12-A" <-> "12-A Sayısal": aynı sınıf + şubeye sahip TEK sınıf varsa onunla eşleştir
    if (parsed.grade && parsed.branch) {
      const branch = trFold(parsed.branch);
      const candidates = classes.filter((c) => {
        const gb = classGradeBranch(c);
        if (gb.grade !== parsed.grade || gb.branch !== branch) return false;
        return !parsed.rest || !parseClassName(c.name).rest;
      });
      if (candidates.length === 1) return { classId: candidates[0].id, className: candidates[0].name, isNew: false };
      if (candidates.length > 1) {
        return {
          classId: '',
          className: raw,
          isNew: false,
          error: `Birden fazla sınıfla eşleşiyor (${candidates.map((c) => c.name).join(', ')}); tam sınıf adını yazın`,
        };
      }
    }

    // Sistemde yok: yeni sınıf adı ("8-B" -> "8/B"; "12-A Sayısal" olduğu gibi)
    const displayName = parsed.grade && parsed.branch && !parsed.rest ? formatClassDisplayName(raw) : raw;
    return { classId: '', className: displayName, isNew: true };
  };

  // Satırları doğrula: isim, numara zorunlu/benzersiz, e-posta/telefon biçimi, sınıf sistemde olmalı
  // (yalnızca yönetici yeni sınıf açabilir)
  const validateRows = (rows: ParsedStudentRow[], allowNewClasses: boolean): ParsedStudentRow[] => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.studentNumber.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    const taken = new Set(existingStudents.map((s) => (s.studentNumber || '').trim().toLowerCase()).filter(Boolean));
    return rows.map((r) => {
      const num = r.studentNumber.trim();
      let error: string | undefined;
      if (!r.fullName.trim()) error = 'Ad soyad bulunamadı (isim sütunu boş)';
      else if (r.fullName.trim().length < 2) error = 'İsim bilgisi geçersiz';
      else if (!num) error = 'Öğrenci no zorunlu (giriş adı)';
      else if (!/^[0-9A-Za-z_-]{1,20}$/.test(num)) error = 'Numara yalnızca rakam/harf olmalı';
      else if ((counts.get(num.toLowerCase()) || 0) > 1) error = 'Numara listede tekrar ediyor';
      else if (taken.has(num.toLowerCase())) error = 'Bu numara sistemde kayıtlı';
      else if (r.password && r.password.trim().length > 0 && r.password.trim().length < 6) error = 'Şifre en az 6 karakter';
      else if (emailIssue(r.email)) error = emailIssue(r.email) || undefined;
      else if (!normalizeTurkishPhone(r.phone).valid) error = PHONE_ERROR;
      else if (r.classError) error = r.classError;
      else if (r.isNewClass && !(isAdmin && allowNewClasses)) error = isAdmin ? 'Sınıf sistemde yok' : 'Sınıf yok / yetkiniz yok';
      else if (!r.isNewClass && !r.matchedClassId) error = 'Sınıf seçilmedi';
      return { ...r, isValid: !error, validationError: error };
    });
  };

  const applyClassMatch = (row: ParsedStudentRow, rawClass: string): ParsedStudentRow => {
    const match = findMatchingClass(rawClass);
    return {
      ...row,
      className: match.className || rawClass,
      matchedClassId: match.classId,
      isNewClass: match.isNew,
      classError: match.error,
      usesDefaultClass: !(rawClass || '').trim(),
    };
  };

  // Başlık satırı bulunmuş hücre satırlarını önizleme satırlarına çevirir
  const processRows = (headers: string[], rows: SheetRow[]) => {
    if (!rows || rows.length === 0) {
      setErrorMessage('Yüklenen dosyada okunabilir öğrenci satırı bulunamadı.');
      return;
    }
    const fields = extractStudentRows(headers, rows);
    const stamp = Date.now();
    const mapped: ParsedStudentRow[] = fields.map((f, index) => {
      const phone = normalizeTurkishPhone(f.phone);
      const base: ParsedStudentRow = {
        id: `parsed-${index}-${stamp}`,
        rowNumber: f.rowNumber,
        firstName: f.firstName,
        lastName: f.lastName,
        fullName: f.fullName,
        className: '',
        matchedClassId: '',
        usesDefaultClass: false,
        studentNumber: f.studentNumber,
        email: f.email,
        phone: phone.valid ? phone.value : f.phone,
        password: f.password,
        isNewClass: false,
        isValid: false,
      };
      return applyClassMatch(base, f.className);
    });

    setParsedRows(validateRows(mapped, autoCreateClasses));
    setErrorMessage(null);
    setSuccessMessage(`${mapped.length} adet öğrenci satırı ayrıştırıldı. Lütfen aşağıdaki önizlemeyi kontrol ediniz.`);
  };

  // Handle file upload (.xlsx, .xls, .csv)
  const handleFileUpload = (file: File) => {
    setFileName(file.name);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(true);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        // Başlık satırını kendimiz buluyoruz (e-Okul çıktılarında üstte okul adı vb. satırlar olur)
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
        const { headers, rows } = matrixToRows(matrix, STUDENT_COLUMNS);
        processRows(headers, rows);
      } catch (err) {
        console.error('Excel parse error:', err);
        setErrorMessage('Dosya okunurken bir hata oluştu. Lütfen dosyanın geçerli bir Excel (.xlsx, .xls) veya CSV formatında olduğunu kontrol edin.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Dosya okuma başarısız oldu.');
      setIsProcessing(false);
    };

    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Excel'den kopyalanıp yapıştırılan tablo (başlık satırı varsa kullanılır, yoksa varsayılan sütun sırası)
  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Lütfen yapıştırmak istediğiniz veriyi metin alanına giriniz.');
      return;
    }
    try {
      const matrix = textToMatrix(pastedText);
      if (matrix.length === 0) {
        setErrorMessage('Geçerli bir veri satırı bulunamadı.');
        return;
      }
      const { headers, rows } = matrixToRows(matrix, STUDENT_COLUMNS, PASTE_HEADERS);
      processRows(headers, rows);
    } catch (err) {
      console.error('Paste parse error:', err);
      setErrorMessage('Yapıştırılan metin ayrıştırılırken hata oluştu.');
    }
  };

  const handleRemoveRow = (id: string) => {
    setParsedRows((prev) => validateRows(prev.filter((r) => r.id !== id), autoCreateClasses));
  };

  const handleUpdateRow = (id: string, field: keyof ParsedStudentRow, value: string) => {
    setParsedRows((prev) =>
      validateRows(
        prev.map((row) => {
          if (row.id !== id) return row;
          let updated: ParsedStudentRow = { ...row, [field]: value };
          if (field === 'firstName' || field === 'lastName') {
            updated.fullName = `${updated.firstName} ${updated.lastName}`.trim();
          }
          if (field === 'className') {
            updated = applyClassMatch(updated, value);
            updated.className = value;
          }
          return updated;
        }),
        autoCreateClasses
      )
    );
  };

  // Geçerli satırları kaydet: her öğrenci için kayıt + gerçek giriş hesabı açılır
  const handleCommitUpload = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('Kaydedilecek geçerli bir öğrenci satırı bulunmuyor.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Yalnızca yönetici: Excel'de olup sistemde olmayan sınıfları önce oluştur ("8-B" ve "8/B" tek sınıf olur)
      const createdClassIds = new Map<string, string>();
      const classFailures = new Map<string, string>();
      if (isAdmin && autoCreateClasses) {
        const academicYear = currentAcademicYear();
        const groups = new Map<string, string>();
        validRows.filter((r) => r.isNewClass).forEach((r) => {
          const key = normalizeClassKey(r.className);
          if (!groups.has(key)) groups.set(key, r.className.trim());
        });
        for (const [key, name] of groups) {
          // Önceki denemede oluşturulduysa yeniden oluşturma
          const already = dataService.findDuplicateClass(name, academicYear);
          if (already) {
            createdClassIds.set(key, already.id);
            continue;
          }
          const parsed = parseClassName(name);
          const gradeLevel = parsed.grade ? `${parsed.grade}. Sınıf` : undefined;
          try {
            const created = await dataService.addClass({
              name,
              branch: parsed.branch || 'Genel',
              gradeLevel,
              schoolLevel: detectSchoolLevelFromGrade(gradeLevel || name),
              academicYear,
              description: 'Excel yüklemesi ile oluşturuldu',
            });
            createdClassIds.set(key, created.id);
          } catch (err: any) {
            classFailures.set(key, err?.message || 'Sınıf oluşturulamadı');
          }
        }
      }

      const classFailed: StudentAccountFailure[] = [];
      const toCreate = validRows.filter((row) => {
        if (!row.isNewClass) return true;
        const key = normalizeClassKey(row.className);
        if (createdClassIds.has(key)) return true;
        classFailed.push({
          name: row.fullName,
          studentNumber: row.studentNumber.trim(),
          error: `Sınıf "${row.className}" oluşturulamadı: ${classFailures.get(key) || 'bilinmeyen hata'}`,
        });
        return false;
      });

      const result: StudentAccountResult =
        toCreate.length > 0
          ? await dataService.createStudentsWithAccounts(
              toCreate.map((row) => ({
                name: row.fullName.trim().replace(/\s+/g, ' '),
                studentNumber: row.studentNumber.trim(),
                classId: row.isNewClass ? createdClassIds.get(normalizeClassKey(row.className)) || '' : row.matchedClassId || defaultClassId,
                email: row.email ? row.email.trim() : '',
                phone: normalizeTurkishPhone(row.phone).value,
                password: row.password?.trim() || undefined,
              }))
            )
          : { created: [], failed: [] };
      const merged: StudentAccountResult = { created: result.created, failed: [...classFailed, ...result.failed] };

      if (onUploadSuccess) {
        onUploadSuccess(merged.created.map((c) => c.student));
      }
      if (onAccountsCreated) {
        onAccountsCreated(merged);
      }
      setParsedRows([]);
      setFileName(null);
      setSuccessMessage(null);
      onClose();
    } catch (err: any) {
      console.error('Commit error:', err);
      setErrorMessage(err?.message || 'Öğrenciler kaydedilirken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Örnek şablon: e-postalar açıkça örnek adresler (gerçek adresle değiştirilmeli veya silinmeli)
  const SAMPLE_ROWS = [
    { Ad: 'Ahmet Can', Soyad: 'Yılmaz', Sınıf: '8/A', 'Öğrenci No': '1051', Telefon: '0555 111 2233', 'E-Posta': 'ornek1@example.com' },
    { Ad: 'Merve', Soyad: 'Aydın', Sınıf: '8/A', 'Öğrenci No': '1052', Telefon: '0555 222 3344', 'E-Posta': 'ornek2@example.com' },
    { Ad: 'Mehmet', Soyad: 'Korkmaz', Sınıf: '8/B', 'Öğrenci No': '1085', Telefon: '0555 333 4455', 'E-Posta': '' },
    { Ad: 'Büşra', Soyad: 'Öztürk', Sınıf: '11-A Fen', 'Öğrenci No': '1210', Telefon: '0555 444 5566', 'E-Posta': 'ornek3@example.com' },
    { Ad: 'Kerem', Soyad: 'Demir', Sınıf: '10/A', 'Öğrenci No': '1380', Telefon: '', 'E-Posta': '' },
  ];

  const downloadSampleExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 18 }, { wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Listesi');
    XLSX.writeFile(workbook, 'Ogrenci_Yukleme_Sablonu.xlsx');
  };

  const downloadSampleCsv = () => {
    const header = Object.keys(SAMPLE_ROWS[0]);
    const csvContent = [header.join(','), ...SAMPLE_ROWS.map((r) => header.map((h) => (r as Record<string, string>)[h]).join(','))].join('\n') + '\n';
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ogrenci_Yukleme_Sablonu.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const detectedNewClasses = Array.from(new Set(parsedRows.filter((r) => r.isNewClass && r.className).map((r) => r.className)));
  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;
  const cellCls = 'bg-surface border rounded-lg px-2 py-1 text-fg text-xs w-full focus:ring-2 focus:ring-brand/25 focus:outline-none';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      size="full"
      icon={FileSpreadsheet}
      tone="success"
      title="Excel'den Toplu Öğrenci Yükleme"
      description=".xlsx / .xls / .csv dosyası veya Excel'den kopyala-yapıştır"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-muted">
            {parsedRows.length > 0 && (
              <>
                Toplam <strong>{parsedRows.length}</strong> öğrenci ({validCount} kaydedilebilir
                {invalidCount > 0 ? `, ${invalidCount} hatalı satır aktarılmaz` : ''})
              </>
            )}
          </span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">
            İptal
          </button>
          <button
            type="button"
            disabled={parsedRows.length === 0 || validCount === 0 || isProcessing}
            onClick={handleCommitUpload}
            className="ui-btn ui-btn-success ui-btn-sm"
          >
            {isProcessing ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-label="İşleniyor" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Öğrencileri Sisteme Aktar ({validCount})</span>
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {errorMessage && (
          <div role="alert" className="p-3 bg-danger-soft rounded-xl flex items-start gap-2 text-danger-fg text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-success-soft rounded-xl flex items-start gap-2 text-success-fg text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Segmented<'file' | 'paste'>
            value={activeInputMode}
            onChange={setActiveInputMode}
            size="sm"
            items={[
              { value: 'file', label: 'Excel / CSV Dosyası Yükle', icon: Upload },
              { value: 'paste', label: "Excel'den Kopyala-Yapıştır", icon: Clipboard },
            ]}
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Şablonlar:</span>
            <button type="button" onClick={downloadSampleExcel} className="ui-btn ui-btn-ghost ui-btn-sm" title="Örnek Excel Şablonu İndir">
              <Download className="w-3.5 h-3.5 text-success-fg" />
              Excel (.xlsx)
            </button>
            <button type="button" onClick={downloadSampleCsv} className="ui-btn ui-btn-ghost ui-btn-sm">
              CSV (.csv)
            </button>
          </div>
        </div>

        {activeInputMode === 'file' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cx(
              'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
              isDragOver ? 'border-brand bg-brand-soft' : 'border-line-strong hover:border-brand bg-surface-2/40'
            )}
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
            <div className="w-14 h-14 bg-success-soft rounded-2xl flex items-center justify-center mx-auto mb-3 text-success-fg">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <p className="text-base font-semibold text-fg mb-3">
              {isProcessing ? 'Dosya okunuyor...' : fileName ? fileName : 'Excel (.xlsx, .xls) veya CSV dosyanızı buraya sürükleyin'}
            </p>
            <span className="ui-btn ui-btn-secondary ui-btn-sm pointer-events-none">
              <Upload className="w-3.5 h-3.5" />
              <span>Dosya Seç</span>
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>Excel veya Google E-Tablolar'dan kopyaladığınız satırları (başlık satırıyla birlikte) buraya yapıştırın:</span>
              <span className="font-mono">Başlıksız sıra: Ad [Tab] Soyad [Tab] Sınıf [Tab] No</span>
            </div>
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Ad\tSoyad\tSınıf\tNo\nAhmet\tYılmaz\t12-A Sayısal\t1051\nZeynep\tKaya\t12-B Eşit Ağırlık\t1052\nMustafa\tÇelik\t11-A Fen\t1053`}
              className="w-full p-4 bg-surface border border-line-strong rounded-xl text-fg font-mono text-xs focus:ring-2 focus:ring-brand/25 focus:outline-none placeholder:text-subtle leading-relaxed"
            />
            <div className="flex justify-end">
              <button type="button" onClick={handleParsePastedText} className="ui-btn ui-btn-primary ui-btn-sm">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Verileri Ayrıştır ve Önizle</span>
              </button>
            </div>
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="p-4 bg-surface-2/60 rounded-xl border border-line space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-fg" />
                <span>Önizleme ve Aktarım Ayarları ({parsedRows.length} Öğrenci)</span>
              </h4>
              <label className="flex items-center gap-2 text-xs text-fg-2 font-medium">
                <span>Sınıfı boş satırlar için:</span>
                <select
                  value={defaultClassId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDefaultClassId(v);
                    // Sınıfı boş olan satırlar yeni varsayılana geçer
                    setParsedRows((prev) =>
                      validateRows(
                        prev.map((r) =>
                          r.usesDefaultClass ? { ...r, matchedClassId: v, className: classes.find((c) => c.id === v)?.name || '' } : r
                        ),
                        autoCreateClasses
                      )
                    );
                  }}
                  className="bg-surface border border-line text-fg text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand/25 focus:outline-none"
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {detectedNewClasses.length > 0 && (
              <div className="p-3 bg-warning-soft rounded-lg flex items-start gap-3 text-xs text-warning-fg">
                <School className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Excel'de sistemde olmayan sınıflar var: {detectedNewClasses.join(', ')}</p>
                  {isAdmin ? (
                    <label className="flex items-center gap-2 cursor-pointer text-fg-2 hover:text-fg">
                      <input
                        type="checkbox"
                        checked={autoCreateClasses}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAutoCreateClasses(checked);
                          setParsedRows((prev) => validateRows(prev, checked));
                        }}
                        className="rounded border-line bg-surface"
                      />
                      <span>Bu sınıfları {currentAcademicYear()} eğitim yılı için otomatik oluştur (şube sınıf adından alınır)</span>
                    </label>
                  ) : (
                    <p className="text-fg-2">
                      Bu sınıflar sistemde yok veya yetkiniz bulunmuyor. Satırlardaki sınıf adını yetkili olduğunuz bir
                      sınıfla değiştiriniz ya da yöneticinizden sınıf açmasını isteyiniz.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Yüklenecek Öğrenci Listesi ({validCount} Geçerli)
              </span>
              <span className="text-[11px] text-muted">Tablodaki alanları doğrudan tıklayarak düzenleyebilirsiniz.</span>
            </div>

            <div className="border border-line rounded-xl overflow-auto max-h-80">
              <table className="w-full text-left text-xs text-fg-2">
                <thead className="bg-surface-2 text-muted sticky top-0 uppercase tracking-wider font-semibold z-10">
                  <tr>
                    <th className="px-3 py-3">Satır</th>
                    <th className="px-3 py-3">İsim</th>
                    <th className="px-3 py-3">Soyisim</th>
                    <th className="px-3 py-3">Sınıf / Şube</th>
                    <th className="px-3 py-3">Öğrenci No</th>
                    <th className="px-3 py-3">İletişim (Tel / E-Posta)</th>
                    <th className="px-3 py-3 text-center">Durum</th>
                    <th className="px-3 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {parsedRows.map((row) => {
                    const mailBad = !!emailIssue(row.email);
                    const phoneBad = !normalizeTurkishPhone(row.phone).valid;
                    return (
                      <tr key={row.id} className={cx('transition-colors', !row.isValid ? 'bg-danger-soft/40' : 'hover:bg-surface-2/40')}>
                        <td className="px-3 py-2.5 font-mono text-muted">{row.rowNumber}</td>
                        <td className="px-3 py-2.5 min-w-[110px]">
                          <input
                            type="text"
                            value={row.firstName}
                            onChange={(e) => handleUpdateRow(row.id, 'firstName', e.target.value)}
                            aria-label={`${row.rowNumber}. satır isim`}
                            className={cx(cellCls, !row.fullName.trim() ? 'border-danger' : 'border-line')}
                          />
                        </td>
                        <td className="px-3 py-2.5 min-w-[110px]">
                          <input
                            type="text"
                            value={row.lastName}
                            onChange={(e) => handleUpdateRow(row.id, 'lastName', e.target.value)}
                            aria-label={`${row.rowNumber}. satır soyisim`}
                            className={cx(cellCls, 'border-line')}
                          />
                        </td>
                        <td className="px-3 py-2.5 min-w-[120px]">
                          <input
                            type="text"
                            value={row.className}
                            onChange={(e) => handleUpdateRow(row.id, 'className', e.target.value)}
                            placeholder="Sınıf adı..."
                            aria-label={`${row.rowNumber}. satır sınıf`}
                            className={cx(cellCls, row.classError ? 'border-danger' : row.isNewClass ? 'border-warning text-warning-fg' : 'border-line')}
                          />
                          {row.isNewClass && <span className="text-[10px] text-warning-fg block mt-0.5">Yeni sınıf</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            value={row.studentNumber}
                            onChange={(e) => handleUpdateRow(row.id, 'studentNumber', e.target.value)}
                            aria-label={`${row.rowNumber}. satır öğrenci no`}
                            className={cx(cellCls, 'font-mono w-20 border-line')}
                          />
                        </td>
                        <td className="px-3 py-2.5 min-w-[170px] space-y-1">
                          <input
                            type="text"
                            inputMode="tel"
                            value={row.phone}
                            onChange={(e) => handleUpdateRow(row.id, 'phone', e.target.value)}
                            onBlur={(e) => {
                              const n = normalizeTurkishPhone(e.target.value);
                              if (n.valid && n.value !== row.phone) handleUpdateRow(row.id, 'phone', n.value);
                            }}
                            placeholder="Telefon"
                            aria-label={`${row.rowNumber}. satır telefon`}
                            aria-invalid={phoneBad}
                            className={cx(cellCls, 'text-[11px]', phoneBad ? 'border-danger' : 'border-line')}
                          />
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) => handleUpdateRow(row.id, 'email', e.target.value)}
                            placeholder="E-Posta"
                            aria-label={`${row.rowNumber}. satır e-posta`}
                            aria-invalid={mailBad}
                            className={cx(cellCls, 'text-[11px]', mailBad ? 'border-danger' : 'border-line')}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center min-w-[140px]">
                          {row.isValid ? (
                            <span className="ui-chip ui-chip-success">Hazır</span>
                          ) : (
                            <span className="inline-block text-left text-[11px] font-semibold text-danger-fg" title={row.validationError}>
                              {row.validationError || 'Hatalı'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-icon hover:text-danger-fg"
                            title="Listeden Çıkar"
                            aria-label={`${row.rowNumber}. satırı listeden çıkar`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-surface-2/50 p-4 rounded-xl border border-line text-xs text-muted space-y-2">
          <div className="flex items-center gap-1.5 text-brand-fg font-semibold">
            <HelpCircle className="w-4 h-4" />
            <span>Excel Dosyası Hazırlama Rehberi</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>
              Sütun başlıkları olarak <strong>Ad</strong> (veya <strong>Öğrenci Adı</strong>, <strong>İsim</strong>),{' '}
              <strong>Soyad</strong> (veya <strong>Soyisim</strong>), <strong>Sınıf</strong>, <strong>Öğrenci No</strong>,{' '}
              <strong>Telefon</strong> ve <strong>E-Posta</strong> kullanabilirsiniz. Büyük/küçük harf ve Türkçe karakter fark etmez.
            </li>
            <li>
              Ad ve soyad tek sütunda (<strong>"Ad Soyad"</strong>, <strong>"Adı Soyadı"</strong>) ise sistem son kelimeyi soyad olarak ayırır.
              e-Okul listelerinde başlığın üstündeki okul adı satırları otomatik atlanır.
            </li>
            <li>
              Sınıf yazımı <em>8/A, 8-A, 8A, 8. Sınıf - A</em> şeklinde olabilir; sistemdeki sınıfla otomatik eşleşir. Yalnızca{' '}
              <em>8</em> yazmak yetmez, şube de gerekir.{' '}
              {isAdmin ? 'Sınıf henüz yoksa (seçeneği işaretlerseniz) yeni sınıf oluşturulur.' : 'Yalnızca yetkili olduğunuz sınıflara öğrenci ekleyebilirsiniz.'}
            </li>
            <li>
              <strong>Öğrenci No zorunludur</strong>: öğrenci sisteme bu numarayla giriş yapar ve her öğrencide farklı olmalıdır.
            </li>
            <li>
              Telefon <em>0532 123 45 67</em>, <em>5321234567</em> veya <em>+90 532 …</em> biçiminde olabilir. Geçersiz e-posta veya
              telefon içeren satırlar işaretlenir; düzeltin ya da alanı boşaltın.
            </li>
            <li>
              İsteğe bağlı <strong>Şifre</strong> sütunu ekleyebilirsiniz (en az 6 karakter). Boş bırakılırsa sistem her öğrenciye
              rastgele şifre üretir. Aktarım bitince tüm giriş bilgilerini Excel olarak indirebilirsiniz.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
