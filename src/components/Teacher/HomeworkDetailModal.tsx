import React from 'react';
import {
  Printer,
  Download,
  Calendar,
  Clock,
  BookOpen,
  Target,
  FileText,
  Users,
  Paperclip,
  Award,
} from 'lucide-react';
import { Homework, Student, ClassGroup, HomeworkSubmission } from '../../types';
import { HomeworkResourceViewer } from '../Common/HomeworkResourceViewer';
import { dataService } from '../../services/dataService';
import { basariBildir } from '../../lib/bildirim'; // Aşama 353
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

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

  if (!isOpen || !homework) return null;

  // Resolve target classes
  const targetClassNames = (homework.targetClassIds || [])
    .map((cid) => classes.find((c) => c.id === cid)?.name)
    .filter(Boolean);

  // Assigned students count
  const assignedCount = students.filter((s) => dataService.isHomeworkForStudent(homework, s)).length;

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
            ${String(homework.teacherName || homework.createdByName || '').replace(/[<>&]/g, '') || '&nbsp;'}<br>
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

    basariBildir('Ödev belgesi (.doc) indirildi.'); // Aşama 353: ortak bildirim
  };

  const handlePrint = () => {
    window.print();
  };

  // Aşama 351: ortak pencere kabuğu
  const ustBilgi = (
    <span className="flex items-center gap-1.5 flex-wrap">
      {homework.schoolLevel && (
        <span className="px-2 py-0.5 rounded text-2xs font-bold bg-brand-soft text-brand-fg border border-brand/30">
          {homework.schoolLevel === 'Ortaokul' ? '🏫 Ortaokul' : '🎓 Lise'}
        </span>
      )}
      <span className="px-2 py-0.5 rounded text-2xs font-bold bg-info/10 text-info-fg border border-info/30">{homework.subject}</span>
      <span className="text-xs text-muted">2026-2027 Akademik Yılı</span>
    </span>
  );
  // SAYFA ALTINDA İNDİR BUTONU (kullanıcı isteği)
  const altKisim = (
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-muted flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-brand/40"></span>
              <span>Tüm ödev sayfası ve detayları görüntülendi</span>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            {/* SAYFA ALTINDA İNDİR BUTONU */}
            <button
              type="button"
              onClick={handleDownloadHomeworkDoc}
              id="btn-download-homework-modal"
              className="ui-btn ui-btn-sm ui-btn-primary min-w-24"
              title="Ödev Belgesini Bilgisayara İndir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ödevi İndir (.DOC / Yazdır)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg min-w-24"
            >
              Pencereyi Kapat
            </button>
          </div>
        </div>
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={FileText}
      title={homework.title}
      description={ustBilgi}
      govdeClass="p-5 sm:p-8 space-y-6 bg-surface/60"
      baslikSag={
        <button type="button" onClick={handlePrint} className="ui-btn ui-btn-secondary ui-btn-sm" title="Yazdır">
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Yazdır</span>
        </button>
      }
      footer={altKisim}
    >
          {/* Printable Page Canvas Container */}
          <div className="bg-canvas/90 border border-line rounded-2xl p-6 sm:p-8 space-y-6 shadow-inner">
            {/* Ministry Header Simulation */}
            <div className="text-center border-b border-line pb-5 space-y-1">
              <p className="text-xs font-bold tracking-widest text-brand-fg uppercase">
                T.C. MİLLÎ EĞİTİM BAKANLIĞI
              </p>
              <h3 className="text-base sm:text-lg font-extrabold text-fg tracking-tight">
                2026-2027 EĞİTİM-ÖĞRETİM YILI ÖDEV VE KAZANIM FORMU
              </h3>
              <p className="text-xs text-muted">
                {homework.subject} Dersi • {homework.schoolLevel || 'Ortaokul/Lise'} Kademesi
              </p>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface/80 border border-line p-3 rounded-xl">
                <span className="text-xs font-medium text-muted flex items-center space-x-1 mb-1">
                  <Calendar className="w-3 h-3 text-brand-fg" />
                  <span>Son Teslim Tarihi</span>
                </span>
                <p className="text-xs font-bold text-fg">{dueDateFormatted}</p>
                <p className="text-2xs text-muted">{dueTimeFormatted}</p>
              </div>

              <div className="bg-surface/80 border border-line p-3 rounded-xl">
                <span className="text-xs font-medium text-muted flex items-center space-x-1 mb-1">
                  <Users className="w-3 h-3 text-success-fg" />
                  <span>Hedef Sınıflar</span>
                </span>
                <p className="text-xs font-bold text-fg truncate">
                  {targetClassNames.length > 0 ? targetClassNames.join(', ') : 'Tüm Şubeler'}
                </p>
                <p className="text-2xs text-muted">{assignedCount} Öğrenci</p>
              </div>

              <div className="bg-surface/80 border border-line p-3 rounded-xl">
                <span className="text-xs font-medium text-muted flex items-center space-x-1 mb-1">
                  <Clock className="w-3 h-3 text-warning-fg" />
                  <span>Teslim Durumu</span>
                </span>
                <p
                  className={`text-xs font-bold ${
                    isOverdue ? 'text-danger-fg' : 'text-warning-fg'
                  }`}
                >
                  {isOverdue ? 'Süre Doldu' : 'Aktif Ödev'}
                </p>
                <p className="text-2xs text-muted">
                  {hwSubmissions.length} Öğrenci İşlendi
                </p>
              </div>

              <div className="bg-surface/80 border border-line p-3 rounded-xl">
                <span className="text-xs font-medium text-muted flex items-center space-x-1 mb-1">
                  <Award className="w-3 h-3 text-brand-fg" />
                  <span>Ödev Kontrol Sonucu</span>
                </span>
                <div className="flex items-center space-x-2 text-xs font-semibold mt-0.5">
                  <span className="text-success-fg font-bold">✅ {yaptiCount}</span>
                  <span className="text-danger-fg font-bold">❌ {yapmadiCount}</span>
                  <span className="text-warning-fg font-bold">⚠️ {eksikCount}</span>
                </div>
              </div>
            </div>

            {/* Title & Detailed Description */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-brand-fg uppercase tracking-wider">
                <BookOpen className="w-4 h-4" />
                <span>Ödev Başlığı & Yönergesi</span>
              </div>
              <div className="bg-surface/90 border border-line rounded-xl p-4 sm:p-5 space-y-2">
                <h4 className="text-base font-bold text-fg tracking-tight">{homework.title}</h4>
                <p className="text-sm text-fg-2 leading-relaxed whitespace-pre-line">
                  {homework.description || 'Ödev için özel bir yönerge girilmemiştir.'}
                </p>
              </div>
            </div>

            {/* Kazanımlar / Öğrenme Alanları */}
            {homework.outcomes && homework.outcomes.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-brand-fg uppercase tracking-wider">
                  <Target className="w-4 h-4" />
                  <span>Hedeflenen Kazanımlar ({homework.outcomes.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {homework.outcomes.map((outcome, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-surface/60 border border-line rounded-xl text-xs text-fg flex items-start space-x-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-brand/20 text-brand-fg flex items-center justify-center font-bold text-2xs shrink-0 mt-0.5">
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
                <div className="flex items-center space-x-2 text-xs font-bold text-brand-fg uppercase tracking-wider">
                  <Paperclip className="w-4 h-4" />
                  <span>Çalışma Materyalleri & Ek Kaynaklar</span>
                </div>
                <div className="bg-surface/50 rounded-xl p-3 border border-line">
                  <HomeworkResourceViewer
                    resources={homework.resources}
                    legacyAttachmentUrl={homework.attachmentUrl}
                  />
                </div>
              </div>
            )}

            {/* Teacher Signature Line */}
            <div className="pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between text-xs text-muted gap-3">
              <div>
                <span className="font-semibold text-fg">Öğretmen:</span>{' '}
                {homework.teacherName || homework.createdByName || 'Öğretmen'} ({homework.subject})
              </div>
              <div>
                <span className="font-semibold text-fg">Hazırlanma Tarihi:</span> {new Date().toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>
    </Modal>
  );
};
