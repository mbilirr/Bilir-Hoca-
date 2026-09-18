import React, { useState, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Users,
  School,
  Trash2,
  Sparkles,
  Clipboard,
  FileText,
  HelpCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ClassGroup, Student } from '../../types';
import { dataService } from '../../services/dataService';

interface ExcelStudentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  onUploadSuccess?: (createdStudents: Student[]) => void;
}

interface ParsedStudentRow {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  className: string;
  matchedClassId: string;
  studentNumber: string;
  email: string;
  phone: string;
  isNewClass: boolean;
  isValid: boolean;
  validationError?: string;
}

export const ExcelStudentUploadModal: React.FC<ExcelStudentUploadModalProps> = ({
  isOpen,
  onClose,
  classes,
  onUploadSuccess,
}) => {
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

  // Clean Turkish character normalization for matching
  const normalizeStr = (str: string) => {
    return str
      .trim()
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');
  };

  // Find matching class ID by class name or keywords
  const findMatchingClass = (rawClassName: string): { classId: string; className: string; isNew: boolean } => {
    if (!rawClassName || rawClassName.trim() === '') {
      const defaultClass = classes.find((c) => c.id === defaultClassId) || classes[0];
      return {
        classId: defaultClass ? defaultClass.id : '',
        className: defaultClass ? defaultClass.name : 'Genel',
        isNew: false,
      };
    }

    const normRaw = normalizeStr(rawClassName);

    // Exact match
    const exact = classes.find((c) => normalizeStr(c.name) === normRaw);
    if (exact) return { classId: exact.id, className: exact.name, isNew: false };

    // Partial / Starts with match (e.g., "12-A" matches "12-A Sayısal")
    const partial = classes.find((c) => {
      const normC = normalizeStr(c.name);
      return normC.startsWith(normRaw) || normRaw.startsWith(normC) || normC.includes(normRaw);
    });

    if (partial) return { classId: partial.id, className: partial.name, isNew: false };

    // It's a new class name
    return {
      classId: '',
      className: rawClassName.trim(),
      isNew: true,
    };
  };

  // Process raw object rows from XLSX or CSV
  const processRawData = (rows: Record<string, unknown>[]) => {
    if (!rows || rows.length === 0) {
      setErrorMessage('Yüklenen dosyada okunabilir öğrenci satırı bulunamadı.');
      return;
    }

    const mapped: ParsedStudentRow[] = [];

    rows.forEach((row, index) => {
      // Find key mappings case-insensitively
      const keys = Object.keys(row);
      const getVal = (...possibleKeys: string[]): string => {
        for (const pKey of possibleKeys) {
          const normP = normalizeStr(pKey);
          const foundKey = keys.find((k) => normalizeStr(k) === normP || normalizeStr(k).includes(normP));
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            return String(row[foundKey]).trim();
          }
        }
        return '';
      };

      const rawFullName = getVal('ad soyad', 'isim soyisim', 'adi soyadi', 'ogrenci adi', 'full name', 'ad-soyad');
      let firstName = getVal('ad', 'isim', 'adi', 'first name', 'adiniz', 'ogrenci ad');
      let lastName = getVal('soyad', 'soyisim', 'soyadi', 'last name', 'soyadiniz', 'ogrenci soyad');

      if (!firstName && !lastName && rawFullName) {
        const parts = rawFullName.trim().split(/\s+/);
        if (parts.length === 1) {
          firstName = parts[0];
          lastName = '';
        } else {
          lastName = parts.pop() || '';
          firstName = parts.join(' ');
        }
      }

      const finalFullName = (
        rawFullName ||
        `${firstName} ${lastName}`.trim() ||
        `Öğrenci ${index + 1}`
      ).trim();

      const rawClass = getVal('sinif', 'sinifi', 'sube', 'subesi', 'class', 'grade', 'alan', 'sinif/sube');
      const studentNumber = getVal('numara', 'ogrenci no', 'okul no', 'no', 'number', 'student no', 'id') || `${1000 + index + Math.floor(Math.random() * 8999)}`;
      const email = getVal('eposta', 'e-posta', 'email', 'mail') || '';
      const phone = getVal('telefon', 'tel', 'phone', 'gsm', 'veli tel') || '';

      const match = findMatchingClass(rawClass);

      // Validate
      const isValid = finalFullName.length >= 2;
      const validationError = !isValid ? 'İsim bilgisi geçersiz' : undefined;

      mapped.push({
        id: `parsed-${index}-${Date.now()}`,
        firstName: firstName || finalFullName.split(' ')[0] || '',
        lastName: lastName || finalFullName.split(' ').slice(1).join(' ') || '',
        fullName: finalFullName,
        className: match.className,
        matchedClassId: match.classId,
        studentNumber,
        email,
        phone,
        isNewClass: match.isNew,
        isValid,
        validationError,
      });
    });

    setParsedRows(mapped);
    setErrorMessage(null);
    setSuccessMessage(`${mapped.length} adet öğrenci satırı başarıyla ayrıştırıldı. Lütfen aşağıdaki önizlemeyi kontrol ediniz.`);
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
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to JSON objects with header row
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
          raw: false,
        });

        processRawData(jsonData);
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

  // Handle Drag and Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Handle Paste from Clipboard (Excel table copy-paste)
  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Lütfen yapıştırmak istediğiniz veriyi metin alanına giriniz.');
      return;
    }

    try {
      const lines = pastedText.trim().split(/\r?\n/);
      if (lines.length === 0) {
        setErrorMessage('Geçerli bir veri satırı bulunamadı.');
        return;
      }

      // Check if first line contains headers
      const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      const firstLineTokens = lines[0].split(delimiter).map((t) => t.trim());

      const isHeaderLine = firstLineTokens.some((t) => {
        const n = normalizeStr(t);
        return n.includes('ad') || n.includes('isim') || n.includes('sinif') || n.includes('no') || n.includes('soyad');
      });

      let headers: string[] = [];
      let dataLines: string[] = [];

      if (isHeaderLine) {
        headers = firstLineTokens;
        dataLines = lines.slice(1);
      } else {
        // Assume default columns: [Ad, Soyad, Sınıf, Öğrenci No, Telefon, E-Posta]
        headers = ['Ad', 'Soyad', 'Sınıf', 'Öğrenci No', 'Telefon', 'E-Posta'];
        dataLines = lines;
      }

      const rows: Record<string, unknown>[] = [];

      dataLines.forEach((line) => {
        if (!line.trim()) return;
        const tokens = line.split(delimiter).map((t) => t.trim().replace(/^["']|["']$/g, ''));
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          obj[h] = tokens[i] !== undefined ? tokens[i] : '';
        });
        rows.push(obj);
      });

      processRawData(rows);
    } catch (err) {
      console.error('Paste parse error:', err);
      setErrorMessage('Yapıştırılan metin ayrıştırılırken hata oluştu.');
    }
  };

  // Remove a row from parsed rows
  const handleRemoveRow = (id: string) => {
    setParsedRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Update a row in parsed rows
  const handleUpdateRow = (id: string, field: keyof ParsedStudentRow, value: string) => {
    setParsedRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        if (field === 'firstName' || field === 'lastName') {
          updated.fullName = `${updated.firstName} ${updated.lastName}`.trim();
        }
        if (field === 'className') {
          const match = findMatchingClass(value);
          updated.className = value;
          updated.matchedClassId = match.classId;
          updated.isNewClass = match.isNew;
        }
        return updated;
      })
    );
  };

  // Save all parsed valid students to dataService
  const handleCommitUpload = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('Kaydedilecek geçerli bir öğrenci satırı bulunmuyor.');
      return;
    }

    setIsProcessing(true);

    try {
      const studentPayloads = validRows.map((row) => {
        const rawFirstName = row.firstName || row.fullName.trim().split(' ')[0] || 'ogrenci';
        const cleanAd = normalizeStr(rawFirstName).toLowerCase().replace(/[^a-z0-9]/g, '') || 'ogrenci';
        return {
          name: row.fullName,
          username: cleanAd,
          email: row.email ? row.email.trim() : '',
          password: '54321',
          mustChangePassword: true,
          classId: row.matchedClassId || defaultClassId,
          className: row.className,
          studentNumber: row.studentNumber,
          phone: row.phone,
          autoCreateClass: autoCreateClasses,
        };
      });

      const created = dataService.registerStudentsBulk(studentPayloads);

      if (onUploadSuccess) {
        onUploadSuccess(created);
      }

      setSuccessMessage(`${created.length} öğrenci başarıyla sisteme aktarıldı ve sınıflarına yerleştirildi!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Commit error:', err);
      setErrorMessage('Öğrenciler kaydedilirken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Download Sample Excel Template
  const downloadSampleExcel = () => {
    const sampleData = [
      {
        'Ad': 'Ahmet Can',
        'Soyad': 'Yılmaz',
        'Sınıf': '12-A Sayısal',
        'Öğrenci No': '1051',
        'Telefon': '0555 111 2233',
        'E-Posta': 'ahmet.yilmaz@ornek.k12.tr',
      },
      {
        'Ad': 'Merve',
        'Soyad': 'Aydın',
        'Sınıf': '12-A Sayısal',
        'Öğrenci No': '1052',
        'Telefon': '0555 222 3344',
        'E-Posta': 'merve.aydin@ornek.k12.tr',
      },
      {
        'Ad': 'Mehmet',
        'Soyad': 'Korkmaz',
        'Sınıf': '12-B Eşit Ağırlık',
        'Öğrenci No': '1085',
        'Telefon': '0555 333 4455',
        'E-Posta': 'mehmet.korkmaz@ornek.k12.tr',
      },
      {
        'Ad': 'Büşra',
        'Soyad': 'Öztürk',
        'Sınıf': '11-A Fen',
        'Öğrenci No': '1210',
        'Telefon': '0555 444 5566',
        'E-Posta': 'busra.ozturk@ornek.k12.tr',
      },
      {
        'Ad': 'Kerem',
        'Soyad': 'Demir',
        'Sınıf': '10-A Anadolu',
        'Öğrenci No': '1380',
        'Telefon': '0555 555 6677',
        'E-Posta': 'kerem.demir@ornek.k12.tr',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Öğrenci Listesi');

    // Auto-fit column widths
    const maxCols = [
      { wch: 18 }, // Ad
      { wch: 18 }, // Soyad
      { wch: 22 }, // Sınıf
      { wch: 15 }, // Öğrenci No
      { wch: 18 }, // Telefon
      { wch: 30 }, // E-Posta
    ];
    worksheet['!cols'] = maxCols;

    XLSX.writeFile(workbook, 'Ogrenci_Yukleme_Sablonu.xlsx');
  };

  // Download Sample CSV Template
  const downloadSampleCsv = () => {
    const csvContent =
      'Ad,Soyad,Sınıf,Öğrenci No,Telefon,E-Posta\n' +
      'Ahmet Can,Yılmaz,12-A Sayısal,1051,0555 111 2233,ahmet.yilmaz@ornek.k12.tr\n' +
      'Merve,Aydın,12-A Sayısal,1052,0555 222 3344,merve.aydin@ornek.k12.tr\n' +
      'Mehmet,Korkmaz,12-B Eşit Ağırlık,1085,0555 333 4455,mehmet.korkmaz@ornek.k12.tr\n' +
      'Büşra,Öztürk,11-A Fen,1210,0555 444 5566,busra.ozturk@ornek.k12.tr\n';

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ogrenci_Yukleme_Sablonu.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const detectedNewClasses = Array.from(
    new Set(parsedRows.filter((r) => r.isNewClass && r.className).map((r) => r.className))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Excel'den Toplu Öğrenci Yükleme</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  .xlsx / .xls / .csv
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={downloadSampleExcel}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
              title="Örnek Excel Şablonu İndir"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Örnek Excel İndir</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-grow">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center space-x-3 text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Upload Method Tabs */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-800/40 p-1.5 rounded-xl border border-slate-800">
            <div className="flex space-x-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveInputMode('file')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeInputMode === 'file'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Excel / CSV Dosyası Yükle</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveInputMode('paste')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeInputMode === 'paste'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Excel'den Kopyala-Yapıştır</span>
              </button>
            </div>

            {/* Template shortcuts for mobile/small screen */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-500 hidden sm:inline">Şablonlar:</span>
              <button
                type="button"
                onClick={downloadSampleExcel}
                className="text-emerald-400 hover:text-emerald-300 underline font-medium"
              >
                Excel (.xlsx)
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="text-slate-400 hover:text-slate-300 underline font-medium"
              >
                CSV (.csv)
              </button>
            </div>
          </div>

          {/* INPUT SECTION */}
          {activeInputMode === 'file' ? (
            /* Drag and Drop Zone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
                  : 'border-slate-700 hover:border-indigo-500/60 bg-slate-800/30 hover:bg-slate-800/50'
              }`}
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
              <div className="w-16 h-16 bg-gradient-to-tr from-emerald-600/20 to-indigo-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-inner">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <p className="text-base font-semibold text-white mb-3">
                {fileName ? fileName : 'Excel (.xlsx, .xls) veya CSV dosyanızı buraya sürükleyin'}
              </p>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-indigo-300 border border-slate-700">
                <Upload className="w-3.5 h-3.5" />
                <span>Dosya Seç</span>
              </span>
            </div>
          ) : (
            /* Copy-Paste Textarea */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Excel veya Google E-Tablolar'dan kopyaladığınız satırları buraya yapıştırın:</span>
                <span className="font-mono text-slate-500">Sütunlar: Ad [Tab] Soyad [Tab] Sınıf</span>
              </div>
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`Ad\tSoyad\tSınıf\tNo\nAhmet\tYılmaz\t12-A Sayısal\t1051\nZeynep\tKaya\t12-B Eşit Ağırlık\t1052\nMustafa\tÇelik\t11-A Fen\t1053`}
                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-slate-600 leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Verileri Ayrıştır ve Önizle</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Mapping & Global Settings */}
          {parsedRows.length > 0 && (
            <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Önizleme ve Aktarım Ayarları ({parsedRows.length} Öğrenci)</span>
                  </h4>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-300 font-medium">Varsayılan Sınıf:</span>
                    <select
                      value={defaultClassId}
                      onChange={(e) => setDefaultClassId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {detectedNewClasses.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start space-x-3 text-xs text-amber-200">
                  <School className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-300">
                      Excel'de yeni sınıflar tespit edildi: {detectedNewClasses.join(', ')}
                    </p>
                    <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={autoCreateClasses}
                        onChange={(e) => setAutoCreateClasses(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Bu sınıfları sistemde otomatik olarak yeni sınıf grubu olarak oluştur</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PARSED DATA PREVIEW TABLE */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Yüklenecek Öğrenci Listesi ({parsedRows.filter((r) => r.isValid).length} Geçerli)
                </span>
                <span className="text-[11px] text-slate-500">
                  Tablodaki alanları doğrudan tıklayarak düzenleyebilirsiniz.
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden shadow-inner max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800 text-slate-400 sticky top-0 uppercase tracking-wider font-semibold z-10">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">İsim</th>
                      <th className="px-4 py-3">Soyisim</th>
                      <th className="px-4 py-3">Sınıf / Şube</th>
                      <th className="px-4 py-3">Öğrenci No</th>
                      <th className="px-4 py-3">İletişim (Tel / E-Posta)</th>
                      <th className="px-4 py-3 text-center">Durum</th>
                      <th className="px-4 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                    {parsedRows.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          !row.isValid ? 'bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={row.firstName}
                            onChange={(e) => handleUpdateRow(row.id, 'firstName', e.target.value)}
                            className="bg-slate-800/90 border border-slate-700 rounded px-2 py-1 text-white text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={row.lastName}
                            onChange={(e) => handleUpdateRow(row.id, 'lastName', e.target.value)}
                            className="bg-slate-800/90 border border-slate-700 rounded px-2 py-1 text-white text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="relative">
                            <input
                              type="text"
                              value={row.className}
                              onChange={(e) => handleUpdateRow(row.id, 'className', e.target.value)}
                              placeholder="Sınıf adı..."
                              className={`bg-slate-800/90 border rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                                row.isNewClass
                                  ? 'border-amber-500/50 text-amber-200'
                                  : 'border-slate-700 text-white'
                              }`}
                            />
                            {row.isNewClass && (
                              <span className="text-[9px] text-amber-400 block mt-0.5">Yeni sınıf</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="text"
                            value={row.studentNumber}
                            onChange={(e) => handleUpdateRow(row.id, 'studentNumber', e.target.value)}
                            className="bg-slate-800/90 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs w-20 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-[11px] space-y-1">
                          <input
                            type="text"
                            value={row.phone}
                            onChange={(e) => handleUpdateRow(row.id, 'phone', e.target.value)}
                            placeholder="Telefon"
                            className="bg-slate-800/90 border border-slate-700 rounded px-2 py-0.5 text-slate-300 text-[11px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none mb-1"
                          />
                          <input
                            type="email"
                            value={row.email}
                            onChange={(e) => handleUpdateRow(row.id, 'email', e.target.value)}
                            placeholder="E-Posta"
                            className="bg-slate-800/90 border border-slate-700 rounded px-2 py-0.5 text-slate-300 text-[11px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.isValid ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Hazır
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Hatalı
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Listeden Çıkar"
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

          {/* Guide / Instruction Box */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-400 space-y-2">
            <div className="flex items-center space-x-1.5 text-indigo-300 font-semibold">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <span>Excel Dosyası Hazırlama Rehberi</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-400">
              <li>
                Excel dosyanızda sütun başlıkları olarak <strong>Ad</strong> (veya <strong>İsim</strong>),{' '}
                <strong>Soyad</strong> (veya <strong>Soyisim</strong>), <strong>Sınıf</strong>,{' '}
                <strong>Öğrenci No</strong> ve <strong>Telefon</strong> kullanabilirsiniz.
              </li>
              <li>
                Eğer tek bir sütunda <strong>"Ad Soyad"</strong> şeklinde yazılmışsa sistem bunu otomatik olarak ad ve soyada ayırır.
              </li>
              <li>
                Excel'deki sınıf isimleri (örn: <em>12-A Sayısal</em>) sistemdeki sınıflarla otomatik eşleştirilir. Eğer sınıf henüz yoksa otomatik olarak yeni sınıf oluşturulur.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-400">
            {parsedRows.length > 0 && (
              <span>
                Toplam <strong>{parsedRows.length}</strong> öğrenci ({parsedRows.filter((r) => r.isValid).length} kaydedilebilir)
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              disabled={parsedRows.length === 0 || parsedRows.filter((r) => r.isValid).length === 0 || isProcessing}
              onClick={handleCommitUpload}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Öğrencileri Sisteme Aktar ({parsedRows.filter((r) => r.isValid).length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
