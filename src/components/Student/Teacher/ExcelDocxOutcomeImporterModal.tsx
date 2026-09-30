import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Target,
  BookOpen,
  ArrowRight,
  Filter,
  CheckSquare,
  Square,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import confetti from 'canvas-confetti';
import { ExtractedOutcomeItem, ClassGroup, Student } from '../../types';

interface ExcelDocxOutcomeImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassGroup[];
  students: Student[];
  onImportToNewHomework: (data: {
    subject: string;
    topic: string;
    outcomes: string[];
  }) => void;
  onBulkCreateHomework?: (data: {
    title: string;
    subject: string;
    outcomes: string[];
    dueDate: string;
    targetClassId: string;
  }) => void;
}

export const ExcelDocxOutcomeImporterModal: React.FC<ExcelDocxOutcomeImporterModalProps> = ({
  isOpen,
  onClose,
  classes,
  students,
  onImportToNewHomework,
  onBulkCreateHomework,
}) => {
  if (!isOpen) return null;

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'xlsx' | 'docx' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Extracted outcomes state
  const [extractedOutcomes, setExtractedOutcomes] = useState<ExtractedOutcomeItem[]>([]);
  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');

  // Quick download sample excel template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Ders: 'Matematik',
        Sınıf: '12. Sınıf',
        Konu: 'Fonksiyonlarda Limit ve Süreklilik',
        'Kazanım Kodu': 'M.12.1.1',
        'Kazanım Açıklaması':
          'Bir fonksiyonun bir noktadaki limitini cebirsel ve grafiksel yöntemlerle açıklar.',
        Hafta: '1. Hafta',
      },
      {
        Ders: 'Matematik',
        Sınıf: '12. Sınıf',
        Konu: 'Türev Alma Kuralları',
        'Kazanım Kodu': 'M.12.2.1',
        'Kazanım Açıklaması':
          'Bir fonksiyonun anlık değişim oranını türevle açıklar ve teğetin eğimini hesaplar.',
        Hafta: '4. Hafta',
      },
      {
        Ders: 'Matematik',
        Sınıf: '12. Sınıf',
        Konu: 'Türevin Geometrik Yorumu',
        'Kazanım Kodu': 'M.12.2.4',
        'Kazanım Açıklaması':
          'Türev yardımıyla teğet ve normal doğrularının denklemlerini kurar.',
        Hafta: '7. Hafta',
      },
      {
        Ders: 'Fizik',
        Sınıf: '12. Sınıf',
        Konu: 'Elektromanyetik İndüksiyon',
        'Kazanım Kodu': 'F.11.2.3',
        'Kazanım Açıklaması':
          'Manyetik akı değişiminin indüksiyon emk si ve akımı oluşturduğunu gösterir.',
        Hafta: '5. Hafta',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Konu ve Kazanımlar');
    XLSX.writeFile(wb, 'Ornek_Konu_ve_Kazanim_Sablonu.xlsx');
  };

  // Quick demo loader
  const handleLoadDemoData = () => {
    const demoItems: ExtractedOutcomeItem[] = [
      {
        id: 'demo-1',
        code: 'M.12.1.1',
        topic: 'Fonksiyonlarda Limit Kavramı',
        outcome:
          'Bir fonksiyonun bir noktadaki limitini sezgisel olarak açıklar ve limit kurallarını uygular.',
        subject: 'Matematik',
        gradeLevel: '12. Sınıf',
        week: '1. Hafta',
      },
      {
        id: 'demo-2',
        code: 'M.12.1.2',
        topic: 'Sağdan ve Soldan Limit',
        outcome:
          'Parçalı ve mutlak değerli fonksiyonların kritik noktalardaki tek taraflı limitlerini hesaplar.',
        subject: 'Matematik',
        gradeLevel: '12. Sınıf',
        week: '2. Hafta',
      },
      {
        id: 'demo-3',
        code: 'M.12.2.1',
        topic: 'Türev ve Değişim Oranı',
        outcome:
          'Bir fonksiyonun anlık değişim oranını türev olarak tanımlar ve teğetin eğimini bulur.',
        subject: 'Matematik',
        gradeLevel: '12. Sınıf',
        week: '4. Hafta',
      },
      {
        id: 'demo-4',
        code: 'M.12.2.3',
        topic: 'Bileşke Fonksiyonun Türevi (Zincir Kuralı)',
        outcome:
          'Bileşke fonksiyonların türevinde zincir kuralını uygulayarak karmaşık fonksiyonların türevini alır.',
        subject: 'Matematik',
        gradeLevel: '12. Sınıf',
        week: '6. Hafta',
      },
      {
        id: 'demo-5',
        code: 'M.12.3.2',
        topic: 'Maksimum ve Minimum Problemleri',
        outcome:
          'Türev yardımıyla gerçek hayat durumlarını modelleyen optimizasyon (en büyük / en küçük değer) problemlerini çözer.',
        subject: 'Matematik',
        gradeLevel: '12. Sınıf',
        week: '10. Hafta',
      },
      {
        id: 'demo-6',
        code: 'F.11.2.3',
        topic: 'Manyetizma & İndüksiyon',
        outcome:
          'Manyetik akı değişiminin indüksiyon emk si oluşturduğunu deneyle gösterir ve Faraday kanununu açıklar.',
        subject: 'Fizik',
        gradeLevel: '12. Sınıf',
        week: '6. Hafta',
      },
    ];

    setExtractedOutcomes(demoItems);
    setSelectedOutcomeIds(demoItems.map((d) => d.id));
    setFileName('MEB_12_Sinif_Matematik_Fizik_Kazanimlari.xlsx');
    setFileType('xlsx');
    setErrorMsg(null);
  };

  // Parser: handles both Excel and Word
  const parseFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMsg(null);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (!ext || !['xlsx', 'xls', 'docx', 'doc'].includes(ext)) {
      setErrorMsg('Lütfen geçerli bir Excel (.xlsx, .xls) veya Word (.docx) dosyası seçin.');
      setIsProcessing(false);
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedItems: ExtractedOutcomeItem[] = [];

      // A. EXCEL PARSER
      if (['xlsx', 'xls'].includes(ext)) {
        setFileType('xlsx');
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Iterate all sheets or first sheet
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
            defval: '',
          });

          rawRows.forEach((row, idx) => {
            // Flexible key finding
            const keys = Object.keys(row);
            const topicKey = keys.find((k) =>
              /konu|topic|ünite|unite|başlık/i.test(k)
            );
            const outcomeKey = keys.find((k) =>
              /kazanım|kazanim|outcome|hedef|açıklama|aciklama/i.test(k)
            );
            const codeKey = keys.find((k) =>
              /kod|code|no|numara/i.test(k)
            );
            const subjectKey = keys.find((k) =>
              /ders|subject|alan/i.test(k)
            );
            const weekKey = keys.find((k) =>
              /hafta|week|tarih/i.test(k)
            );

            const topicVal = (topicKey ? String(row[topicKey]) : '').trim();
            const outcomeVal = (outcomeKey ? String(row[outcomeKey]) : '').trim();
            let codeVal = (codeKey ? String(row[codeKey]) : '').trim();
            const subjectVal = (subjectKey ? String(row[subjectKey]) : 'Matematik').trim();
            const weekVal = (weekKey ? String(row[weekKey]) : '').trim();

            // If outcome description is missing but topic has content, or vice versa
            const mainText = outcomeVal || topicVal;
            if (!mainText) return;

            // Try to extract outcome code from text if not in codeVal
            if (!codeVal) {
              const codeMatch = mainText.match(/[A-ZÇĞİÖŞÜ]\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?/i);
              if (codeMatch) {
                codeVal = codeMatch[0];
              } else {
                codeVal = `KAZ-${idx + 1}`;
              }
            }

            parsedItems.push({
              id: `ext-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
              code: codeVal,
              topic: topicVal || mainText.substring(0, 50),
              outcome: outcomeVal || mainText,
              subject: subjectVal || 'Matematik',
              gradeLevel: '12. Sınıf',
              week: weekVal || undefined,
            });
          });
        });
      }

      // B. WORD (.DOCX) PARSER
      else if (['docx', 'doc'].includes(ext)) {
        setFileType('docx');
        const result = await mammoth.extractRawText({ arrayBuffer });
        const rawText = result.value;
        const lines = rawText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 5);

        let currentTopic = 'Genel Konu';
        let currentSubject = 'Matematik';

        lines.forEach((line, idx) => {
          // Detect header / topic lines
          if (
            line.toLowerCase().startsWith('ünite:') ||
            line.toLowerCase().startsWith('konu:') ||
            line.toLowerCase().startsWith('ders:')
          ) {
            currentTopic = line.replace(/^(ünite|konu|ders):\s*/i, '');
            return;
          }

          // Check if line looks like an outcome (e.g. M.12.1.1, bullet, or numbered)
          const codeMatch = line.match(/^[A-ZÇĞİÖŞÜ]\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?/i);
          const numberedMatch = line.match(/^(\d{1,2}\.|\*|-|•)\s*/);

          let outcomeCode = `KAZ-${idx + 1}`;
          let outcomeText = line;

          if (codeMatch) {
            outcomeCode = codeMatch[0];
            outcomeText = line.substring(outcomeCode.length).replace(/^[:\-\s]+/, '');
          } else if (numberedMatch) {
            outcomeText = line.replace(/^(\d{1,2}\.|\*|-|•)\s*/, '');
          }

          if (outcomeText.length > 8) {
            parsedItems.push({
              id: `ext-docx-${Date.now()}-${idx}`,
              code: outcomeCode,
              topic: currentTopic,
              outcome: outcomeText,
              subject: currentSubject,
              gradeLevel: '12. Sınıf',
            });
          }
        });
      }

      if (parsedItems.length === 0) {
        setErrorMsg(
          'Dosyada uygun konu veya kazanım satırları tespit edilemedi. Lütfen örnek şablon formatına uygun bir dosya yükleyin veya demo verisini deneyin.'
        );
      } else {
        setExtractedOutcomes(parsedItems);
        setSelectedOutcomeIds(parsedItems.map((p) => p.id));
        setFileName(file.name);
      }
    } catch (err: any) {
      setErrorMsg('Dosya okunurken bir hata oluştu: ' + (err?.message || 'Bilinmeyen hata'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  // Toggle selection
  const toggleSelectOutcome = (id: string) => {
    setSelectedOutcomeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedOutcomeIds(filteredOutcomes.map((o) => o.id));
  };

  const deselectAll = () => {
    setSelectedOutcomeIds([]);
  };

  // Filtered outcomes
  const filteredOutcomes = extractedOutcomes.filter((item) => {
    if (selectedSubjectFilter !== 'all' && item.subject !== selectedSubjectFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.code.toLowerCase().includes(q) ||
        item.topic.toLowerCase().includes(q) ||
        item.outcome.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Action 1: Transfer selected to Homework Creation form
  const handleTransferToNewHomework = () => {
    const selected = extractedOutcomes.filter((o) => selectedOutcomeIds.includes(o.id));
    if (selected.length === 0) {
      setErrorMsg('Lütfen ödeve aktarmak için en az bir kazanım seçin.');
      return;
    }

    const primarySubject = selected[0].subject || 'Matematik';
    const primaryTopic = selected[0].topic || 'Kazanım Pekiştirme Ödevi';
    const outcomesFormatted = selected.map((s) => `${s.code}: ${s.outcome}`);

    onImportToNewHomework({
      subject: primarySubject,
      topic: primaryTopic,
      outcomes: outcomesFormatted,
    });

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Excel veya Word'den Konu & Kazanımları Otomatik Yükle
              </h2>
              <p className="text-xs text-slate-400">
                .xlsx, .xls veya .docx dosyanızı yükleyin; konu ve MEB kazanımları ödev çizelgesine anında aktarılsın
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

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* DROPZONE & TEMPLATE BUTTONS */}
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : fileName
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.docx,.doc"
                className="hidden"
              />

              {fileName ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {fileType === 'xlsx' ? (
                      <FileSpreadsheet className="w-7 h-7" />
                    ) : (
                      <FileText className="w-7 h-7" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{fileName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {extractedOutcomes.length} Kazanım Ayrıştırıldı
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">
                      Farklı bir Excel veya Word dosyası seçmek için buraya tıklayın
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-200 mb-1">
                    Excel (.xlsx, .xls) veya Word (.docx) dosyanızı buraya bırakın
                  </p>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    Müfredat listesi, haftalık ders planı veya kazanım tablonuzu yükleyerek konuları ve kazanım kodlarını saniyeler içinde çıkarın.
                  </p>
                </div>
              )}
            </div>

            {/* ACTION SHORTCUTS */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center space-x-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Örnek Excel Şablonu İndir (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadDemoData}
                  className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30 flex items-center space-x-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Örnek MEB Kazanımlarını Doldur</span>
                </button>
              </div>

              {extractedOutcomes.length > 0 && (
                <div className="text-slate-400">
                  <strong className="text-indigo-400">{selectedOutcomeIds.length}</strong> /{' '}
                  {extractedOutcomes.length} kazanım seçildi
                </div>
              )}
            </div>
          </div>

          {/* EXTRACTED OUTCOMES SELECTION TABLE */}
          {extractedOutcomes.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Tümünü Seç</span>
                  </button>
                  <span className="text-slate-700">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs text-slate-400 hover:text-slate-300 flex items-center space-x-1"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Seçimi Temizle</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Kazanımlarda ara..."
                      className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* LIST */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredOutcomes.map((item) => {
                  const isSelected = selectedOutcomeIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelectOutcome(item.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start space-x-3 select-none ${
                        isSelected
                          ? 'bg-indigo-950/30 border-indigo-500/50 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by container onClick
                          className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 cursor-pointer"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {item.code}
                          </span>
                          <span className="text-xs font-bold text-white truncate">
                            {item.topic}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-auto">
                            {item.subject} {item.week ? `• ${item.week}` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {item.outcome}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {extractedOutcomes.length > 0 ? (
              <span>
                <strong className="text-emerald-400">{selectedOutcomeIds.length}</strong> kazanım ödeve eklenmeye hazır
              </span>
            ) : (
              <span>Lütfen önce bir dosya yükleyin veya örnek veriyi doldurun</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              Vazgeç
            </button>

            <button
              type="button"
              disabled={selectedOutcomeIds.length === 0}
              onClick={handleTransferToNewHomework}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 shadow-lg shadow-indigo-600/30"
            >
              <Target className="w-4 h-4" />
              <span>Seçilenleri Yeni Ödeve Aktar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
