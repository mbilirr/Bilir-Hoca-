import React, { useState } from 'react';
import {
  X,
  Printer,
  Download,
  Calendar,
  Clock,
  BookOpen,
  Target,
  FileText,
  Users,
  Paperclip,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  GraduationCap,
  Sparkles,
  Award,
} from 'lucide-react';
import { Homework, Student, ClassGroup, HomeworkSubmission } from '../../types';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';

interface HomeworkDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  homework: Homework | null;
  students: Student[];
  classes: ClassGroup[];
  submissions?: HomeworkSubmission[];
}

export const HomeworkDetailModal: React.FC<HomeworkDetailModalProps> = ({
  isOpen,
  onClose,
  homework,
  students,
  classes,
  submissions = [],
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen || !homework) return null;

  // Resolve target classes
  const targetClassNames = (homework.targetClassIds || [])
    .map((cid) => classes.find((c) => c.id === cid)?.name)
    .filter(Boolean);

  // Assigned students count
  const assignedCount =
    homework.assignedTo === 'all'
      ? students.length
      : Array.isArray(homework.assignedTo)
      ? homework.assignedTo.length
      : 0;

  // Submissions for this homework
  const hwSubmissions = submissions.filter((s) => s.homeworkId === homework.id);
  const yaptiCount = hwSubmissions.filter(
    (s) => s.checkStatus === 'yapti' || s.status === 'on_time' || s.status === 'late'
  ).length;
  const yapmadiCount = hwSubmissions.filter(
    (s) => s.checkStatus === 'yapmadi' || s.status === 'not_submitted'
  ).length;
  const eksikCount = hwSubmissions.filter((s) => s.checkStatus === 'eksik').length;

  const dueDateFormatted = new Date(homework.dueDate).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const dueTimeFormatted = new Date(homework.dueDate).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isOverdue = new Date() > new Date(homework.dueDate);

  // Generate & Download clean printable / Word Document
  const handleDownloadHomeworkDoc = () => {
    const docHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${homework.title}</title>
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
          <div class="meta-row"><strong>Ödev Başlığı:</strong> ${homework.title}</div>
          <div class="meta-row"><strong>Ders / Kademe:</strong> ${homework.subject} (${homework.schoolLevel || 'Ortaokul / Lise'})</div>
          <div class="meta-row"><strong>Hedef Sınıflar:</strong> ${targetClassNames.join(', ') || 'Tüm Şubeler'}</div>
          <div class="meta-row"><strong>Son Teslim Tarihi:</strong> ${dueDateFormatted} - ${dueTimeFormatted}</div>
          <div class="meta-row"><strong>Hedef Öğrenci Sayısı:</strong> ${assignedCount} Öğrenci</div>
        </div>

        <div class="section-title">ÖDEV YÖNERGESİ VE TALİMATLAR</div>
        <div class="description-box">
          ${(homework.description || 'Belirtilmedi').replace(/\n/g, '<br/>')}
        </div>

        ${
          homework.outcomes && homework.outcomes.length > 0
            ? `
          <div class="section-title">HEDEFLENEN KAZANIMLAR VE ÖĞRENME ALANLARI</div>
          <ul class="outcomes-list">
            ${homework.outcomes.map((o) => `<li>${o}</li>`).join('')}
          </ul>
        `
            : ''
        }

        <div class="signature-area">
          <div class="sig-box">
            <strong>Ders Öğretmeni</strong><br>
            Mustafa BİLİR<br>
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
    const safeTitle = homework.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_-]/g, '_');
    link.href = url;
    link.download = `${safeTitle}_Odev_Belgesi_2026_2027.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative bg-slate-900 border border-slate-750 w-full max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                {homework.schoolLevel && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
                    {homework.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  {homework.subject}
                </span>
                <span className="text-xs text-slate-400">2026-2027 Akademik Yılı</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-lg mt-0.5">
                {homework.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors text-xs flex items-center space-x-1.5"
              title="Yazdır"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Yazdır</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-colors"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MODAL BODY (AUTHENTIC A4 HOMEWORK DOCUMENT SHEET) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 bg-slate-900/60">
          {/* Printable Page Canvas Container */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-inner">
            {/* Ministry Header Simulation */}
            <div className="text-center border-b border-slate-800 pb-5 space-y-1">
              <p className="text-[11px] font-bold tracking-widest text-indigo-400 uppercase">
                T.C. MİLLÎ EĞİTİM BAKANLIĞI
              </p>
              <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                2026-2027 EĞİTİM-ÖĞRETİM YILI ÖDEV VE KAZANIM FORMU
              </h3>
              <p className="text-xs text-slate-400">
                {homework.subject} Dersi • {homework.schoolLevel || 'Ortaokul/Lise'} Kademesi
              </p>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                <span className="text-[11px] font-medium text-slate-400 flex items-center space-x-1 mb-1">
                  <Calendar className="w-3 h-3 text-indigo-400" />
                  <span>Son Teslim Tarihi</span>
                </span>
                <p className="text-xs font-bold text-white">{dueDateFormatted}</p>
                <p className="text-[10px] text-slate-400">{dueTimeFormatted}</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                <span className="text-[11px] font-medium text-slate-400 flex items-center space-x-1 mb-1">
                  <Users className="w-3 h-3 text-emerald-400" />
                  <span>Hedef Sınıflar</span>
                </span>
                <p className="text-xs font-bold text-white truncate">
                  {targetClassNames.length > 0 ? targetClassNames.join(', ') : 'Tüm Şubeler'}
                </p>
                <p className="text-[10px] text-slate-400">{assignedCount} Öğrenci</p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                <span className="text-[11px] font-medium text-slate-400 flex items-center space-x-1 mb-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Teslim Durumu</span>
                </span>
                <p
                  className={`text-xs font-bold ${
                    isOverdue ? 'text-rose-400' : 'text-amber-400'
                  }`}
                >
                  {isOverdue ? 'Süre Doldu' : 'Aktif Ödev'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {hwSubmissions.length} Öğrenci İşlendi
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                <span className="text-[11px] font-medium text-slate-400 flex items-center space-x-1 mb-1">
                  <Award className="w-3 h-3 text-indigo-400" />
                  <span>Ödev Kontrol Sonucu</span>
                </span>
                <div className="flex items-center space-x-2 text-[11px] font-semibold mt-0.5">
                  <span className="text-emerald-400 font-bold">✅ {yaptiCount}</span>
                  <span className="text-rose-400 font-bold">❌ {yapmadiCount}</span>
                  <span className="text-amber-400 font-bold">⚠️ {eksikCount}</span>
                </div>
              </div>
            </div>

            {/* Title & Detailed Description */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <BookOpen className="w-4 h-4" />
                <span>Ödev Başlığı & Yönergesi</span>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-2">
                <h4 className="text-base font-bold text-white tracking-tight">{homework.title}</h4>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {homework.description || 'Ödev için özel bir yönerge girilmemiştir.'}
                </p>
              </div>
            </div>

            {/* Kazanımlar / Öğrenme Alanları */}
            {homework.outcomes && homework.outcomes.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  <Target className="w-4 h-4" />
                  <span>Hedeflenen Kazanımlar ({homework.outcomes.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {homework.outcomes.map((outcome, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs text-slate-200 flex items-start space-x-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attached Resources / Videos / Links */}
            {((homework.resources && homework.resources.length > 0) || homework.attachmentUrl) && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  <Paperclip className="w-4 h-4" />
                  <span>Çalışma Materyalleri & Ek Kaynaklar</span>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-800">
                  <HomeworkResourceViewer
                    resources={homework.resources}
                    legacyAttachmentUrl={homework.attachmentUrl}
                  />
                </div>
              </div>
            )}

            {/* Teacher Signature Line */}
            <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
              <div>
                <span className="font-semibold text-white">Öğretmen:</span> Mustafa BİLİR (Fen Bilgisi & Matematik)
              </div>
              <div>
                <span className="font-semibold text-white">Hazırlanma Tarihi:</span> {new Date().toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER - SAYFA ALTINDA İNDİR BUTONU (CRUCIAL USER REQUIREMENT) */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            {downloadSuccess ? (
              <span className="inline-flex items-center space-x-1.5 text-emerald-400 font-semibold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>Ödev Belgesi (.DOC) başarıyla indirildi!</span>
              </span>
            ) : (
              <span className="text-slate-400 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                <span>Tüm ödev sayfası ve detayları görüntülendi</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* SAYFA ALTINDA İNDİR BUTONU */}
            <button
              type="button"
              onClick={handleDownloadHomeworkDoc}
              id="btn-download-homework-modal"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer hover:scale-105 active:scale-95"
              title="Ödev Belgesini Bilgisayara İndir"
            >
              <Download className="w-4 h-4" />
              <span>Ödevi İndir (.DOC / Yazdır)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              Pencereyi Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};
