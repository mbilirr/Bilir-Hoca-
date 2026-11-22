import React, { useState } from 'react';
import {
  CalendarDays,
  Mail,
  Copy,
  Check,
  CheckCircle2,
  Users,
  MessageCircle,
  FileText,
} from 'lucide-react';
import { Etut, Student } from '../../types';
import {
  formatEtutDateTurkish,
  generateEtutEmail,
  createGmailComposeLink,
  createMailtoLink,
} from '../../lib/emailTemplates';
import { useAutoDismiss } from '../../lib/useAutoDismiss';
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

interface EtutNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  etut: Etut | null;
  students: Student[];
  teacherName?: string;
}

export const EtutNotificationModal: React.FC<EtutNotificationModalProps> = ({
  isOpen,
  onClose,
  etut,
  students,
  teacherName = 'Öğretmen',
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);
  useAutoDismiss(dispatchFeedback, () => setDispatchFeedback(null)); // Aşama 32: 15 sn sonra kaybolur

  if (!isOpen || !etut) return null;

  // Determine target students
  const targetStudents: Student[] =
    etut.assignedStudentIds === 'all'
      ? students
      : Array.isArray(etut.assignedStudentIds)
      ? students.filter((s) => etut.assignedStudentIds.includes(s.id))
      : [];

  const formattedDate = formatEtutDateTurkish(etut.date);
  const effectiveTeacher = etut.teacherName || teacherName;

  // Generate WhatsApp message for a given student
  const generateWhatsAppMessage = (studentName: string) => {
    return `📅 *ETÜT VE BİREBİR DERS BİLGİLENDİRMESİ*

Sayın *${studentName}*,
${effectiveTeacher} öğretmeniniz ile etüt dersiniz planlanmıştır.

📚 *Ders:* ${etut.subject}
🎯 *Konu / Odak:* ${etut.topic}
📅 *Tarih:* ${formattedDate}
🕒 *Saat:* ${etut.time} (${etut.duration} dakika)
📍 *Derslik:* ${etut.location}
${etut.notes ? `📝 *Öğretmen Notu:* ${etut.notes}\n` : ''}${etut.teacherFeedback ? `💬 *Öğretmen Görüşü:* ${etut.teacherFeedback}\n` : ''}
Lütfen belirtilen tarih ve saatte derslikte hazır bulununuz. Başarılar dileriz!

*${effectiveTeacher}*
biliredu`.trim();
  };

  const universalMessage = generateWhatsAppMessage(
    targetStudents.length === 1 ? targetStudents[0].name : 'Öğrencimiz'
  );

  const handleCopyMessage = () => {
    navigator.clipboard?.writeText(universalMessage);
    setCopiedKey('all');
    setDispatchFeedback('Etüt bilgilendirme metni panoya kopyalandı.');
    setTimeout(() => {
      setCopiedKey(null);
      setDispatchFeedback(null);
    }, 3000);
  };

  const handleOpenStudentWhatsApp = (std: Student) => {
    const text = generateWhatsAppMessage(std.name);
    const cleanPhone = (std.phone || '').replace(/[^0-9]/g, '');
    let url = '';
    if (cleanPhone) {
      const phoneParam = cleanPhone.startsWith('90')
        ? cleanPhone
        : cleanPhone.startsWith('0')
        ? '9' + cleanPhone
        : '90' + cleanPhone;
      url = `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(text)}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    }
    window.open(url, '_blank');
    setDispatchFeedback(`${std.name} için WhatsApp mesajı açıldı.`);
  };

  const handleManualEmailClient = (std: Student) => {
    if (!std.email) return;
    const emailData = generateEtutEmail({
      studentName: std.name,
      studentEmail: std.email,
      teacherName: effectiveTeacher,
      subject: etut.subject,
      topic: etut.topic,
      date: etut.date,
      time: etut.time,
      duration: etut.duration,
      location: etut.location,
      notes: etut.notes,
      teacherFeedback: etut.teacherFeedback,
    });
    const gmailUrl = createGmailComposeLink(std.email, emailData.subject, emailData.text);
    window.open(gmailUrl, '_blank');
    setDispatchFeedback(`${std.name} için Gmail gönderme penceresi açıldı.`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={CalendarDays}
      tone="success"
      title="Etüt Bilgilendirme & İletişim"
      description="Öğrenciye WhatsApp ve Otomatik E-Posta ile etüt randevu bildirimi iletin"
      govdeClass="p-5 sm:p-6 space-y-4"
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Eğitim Portalı • Otomatik İletişim Servisi</span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary min-w-24">
            Kapat
          </button>
        </div>
      }
    >
          {/* Automatic System Delivery Banner */}
          {/* Aşama 185: büyük kutu tek satıra indi */}
          <div className="px-3 py-2 bg-success-soft border border-success/30 rounded-xl flex items-center gap-2 text-xs text-success-fg">
            <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" />
            <span className="font-semibold">E-posta ve bildirim öğrencilere otomatik gönderildi.</span>
          </div>

          {/* Etut Summary Card */}
          <div className="bg-canvas/60 border border-line rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-success-fg">Ders & Konu</span>
                <h4 className="text-sm font-bold text-fg flex items-center space-x-2">
                  <span>{etut.subject}:</span>
                  <span className="text-success-fg">{etut.topic}</span>
                </h4>
              </div>
              <div className="text-right">
                <span className="text-2xs font-bold uppercase tracking-wider text-muted">Danışman Öğretmen</span>
                <p className="text-xs font-semibold text-fg">{effectiveTeacher}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-surface/80 p-2 rounded-lg border border-line">
                <span className="text-2xs text-muted block font-medium">Tarih:</span>
                <span className="font-semibold text-fg">{formattedDate}</span>
              </div>
              <div className="bg-surface/80 p-2 rounded-lg border border-line">
                <span className="text-2xs text-muted block font-medium">Saat & Süre:</span>
                <span className="font-semibold text-fg">{etut.time} ({etut.duration} dk)</span>
              </div>
              <div className="bg-surface/80 p-2 rounded-lg border border-line col-span-2 sm:col-span-1">
                <span className="text-2xs text-muted block font-medium">Derslik / Yer:</span>
                <span className="font-semibold text-fg">{etut.location}</span>
              </div>
            </div>

            {etut.notes && (
              <div className="bg-surface/60 p-2.5 rounded-lg border border-line text-xs text-fg-2">
                <span className="text-2xs font-bold text-muted block">Öğretmen Notu:</span>
                <p className="mt-0.5">{etut.notes}</p>
              </div>
            )}

            {etut.teacherFeedback && (
              <div className="bg-warning/10 p-2.5 rounded-lg border border-warning/25 text-xs text-warning-fg">
                <span className="text-2xs font-bold text-warning-fg block">💬 Öğretmen Düşünce ve Görüşleri:</span>
                <p className="mt-0.5 italic text-fg">"{etut.teacherFeedback}"</p>
              </div>
            )}
          </div>

          {/* Feedback message */}
          {dispatchFeedback && (
            <div className="p-3 bg-success/15 border border-success/30 rounded-xl flex items-center space-x-2 text-xs text-success-fg animate-in fade-in">
              <Check className="w-4 h-4 text-success-fg shrink-0" />
              <span className="font-semibold">{dispatchFeedback}</span>
            </div>
          )}

          {/* Target Students WhatsApp / Communication List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-fg flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-success-fg" />
                <span>Atanan Öğrenciler ({targetStudents.length}) - Hızlı WhatsApp İletimi:</span>
              </h4>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 border border-line min-w-24"
                title="Tüm metni kopyala"
              >
                {copiedKey === 'all' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success-fg" />
                    <span className="text-success-fg">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
                    <span>Metni Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {targetStudents.length === 0 ? (
              <div className="p-3 bg-canvas/40 border border-line rounded-xl text-xs text-muted text-center">
                Bu etüte atanmış belirli bir öğrenci bulunmuyor (Tüm kademe veya serbest etüt).
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {targetStudents.map((std) => (
                  <div
                    key={std.id}
                    className="p-2.5 bg-canvas/60 border border-line rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-line transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-success/20 border border-success/40 flex items-center justify-center text-success-fg font-bold text-xs shrink-0">
                        {std.name.substring(0, 2).toLocaleUpperCase('tr-TR')}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-fg block">{std.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
                      {/* WhatsApp Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenStudentWhatsApp(std)}
                        className="ui-btn ui-btn-success ui-btn-sm min-w-24"
                        title={`${std.name} için WhatsApp ile Gönder`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      {/* Manual Gmail Compose fallback */}
                      {std.email && (
                        <button
                          type="button"
                          onClick={() => handleManualEmailClient(std)}
                          className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 hover:text-fg border border-line min-w-24"
                          title={`${std.name} için Gmail'de Aç`}
                        >
                          <Mail className="w-3.5 h-3.5 text-danger-fg" />
                          <span className="hidden sm:inline">Gmail</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Copy / Preview Box */}
          <div className="p-3 bg-canvas/80 border border-line rounded-xl space-y-1.5">
            <span className="text-xs font-bold text-muted block flex items-center space-x-1">
              <FileText className="w-3.5 h-3.5 text-brand-fg" />
              <span>Hazır Bildirim Mesajı Önizlemesi:</span>
            </span>
            <pre className="text-xs text-fg-2 font-sans whitespace-pre-wrap bg-surface/80 p-2.5 rounded-lg border border-line leading-relaxed select-all">
              {universalMessage}
            </pre>
          </div>
    </Modal>
  );
};
