import React, { useState } from 'react';
import {
  CalendarDays,
  Clock,
  MapPin,
  Mail,
  Send,
  ExternalLink,
  Copy,
  Check,
  X,
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
Eğitim & Öğrenci Takip Sistemi`.trim();
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
    setTimeout(() => setDispatchFeedback(null), 3500);
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
    setTimeout(() => setDispatchFeedback(null), 3500);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-teal-900/80 via-slate-900 to-indigo-950/80 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>Etüt Bilgilendirme & İletişim</span>
              </h3>
              <p className="text-xs text-slate-300">
                Öğrenciye WhatsApp ve Otomatik E-Posta ile etüt randevu bildirimi iletin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Automatic System Delivery Banner */}
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-start space-x-3 text-xs text-emerald-200 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-emerald-300">E-Posta Sistemi Tarafından Otomatik Gönderildi:</span>
              <p className="text-[11.5px] text-slate-300">
                Bu etüt kaydı oluşturulduğunda sistem bilgilendirme e-postasını ve bildirim kartını otomatik olarak ilgili öğrencilerin e-posta adresine ve öğrenci portalına ulaştırdı.
              </p>
            </div>
          </div>

          {/* Etut Summary Card */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Ders & Konu</span>
                <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>{etut.subject}:</span>
                  <span className="text-teal-300">{etut.topic}</span>
                </h4>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Danışman Öğretmen</span>
                <p className="text-xs font-semibold text-slate-200">{effectiveTeacher}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Tarih:</span>
                <span className="font-semibold text-slate-200">{formattedDate}</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium">Saat & Süre:</span>
                <span className="font-semibold text-slate-200">{etut.time} ({etut.duration} dk)</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 block font-medium">Derslik / Yer:</span>
                <span className="font-semibold text-slate-200">{etut.location}</span>
              </div>
            </div>

            {etut.notes && (
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs text-slate-300">
                <span className="text-[10px] font-bold text-slate-400 block">Öğretmen Notu:</span>
                <p className="mt-0.5">{etut.notes}</p>
              </div>
            )}

            {etut.teacherFeedback && (
              <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/25 text-xs text-amber-200">
                <span className="text-[10px] font-bold text-amber-300 block">💬 Öğretmen Düşünce ve Görüşleri:</span>
                <p className="mt-0.5 italic text-slate-200">"{etut.teacherFeedback}"</p>
              </div>
            )}
          </div>

          {/* Feedback message */}
          {dispatchFeedback && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center space-x-2 text-xs text-emerald-300 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{dispatchFeedback}</span>
            </div>
          )}

          {/* Target Students WhatsApp / Communication List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-teal-400" />
                <span>Atanan Öğrenciler ({targetStudents.length}) - Hızlı WhatsApp İletimi:</span>
              </h4>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                title="Tüm metni kopyala"
              >
                {copiedKey === 'all' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Metni Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {targetStudents.length === 0 ? (
              <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl text-xs text-slate-400 text-center">
                Bu etüte atanmış belirli bir öğrenci bulunmuyor (Tüm kademe veya serbest etüt).
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {targetStudents.map((std) => (
                  <div
                    key={std.id}
                    className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 font-bold text-xs shrink-0">
                        {std.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">{std.name}</span>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                          <span>{std.className || 'Sınıf Yok'}</span>
                          {std.phone && (
                            <>
                              <span>•</span>
                              <span className="text-slate-300 font-mono">{std.phone}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
                      {/* WhatsApp Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenStudentWhatsApp(std)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-emerald-700/20 cursor-pointer"
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
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                          title={`${std.name} için Gmail'de Aç`}
                        >
                          <Mail className="w-3.5 h-3.5 text-red-400" />
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
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block flex items-center space-x-1">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hazır Bildirim Mesajı Önizlemesi:</span>
            </span>
            <pre className="text-[11px] text-slate-300 font-sans whitespace-pre-wrap bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed select-all">
              {universalMessage}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950/80 px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Eğitim Portalı • Otomatik İletişim Servisi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
