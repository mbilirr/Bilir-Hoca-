import React, { useState } from 'react';
import {
  X,
  Mail,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Key,
  User,
  GraduationCap,
  Sparkles,
  Send,
  MessageCircle,
  Share2,
  CheckCircle2,
} from 'lucide-react';
import { Student } from '../../types';
import {
  generateStudentWelcomeEmail,
  createMailtoLink,
  createGmailComposeLink,
} from '../../lib/emailTemplates';

interface StudentWelcomeCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  teacherName?: string;
}

export const StudentWelcomeCredentialsModal: React.FC<StudentWelcomeCredentialsModalProps> = ({
  isOpen,
  onClose,
  student,
  teacherName = 'Öğretmen',
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  if (!isOpen || !student) return null;

  const emailData = generateStudentWelcomeEmail({
    studentName: student.name,
    studentEmail: student.email || '',
    username: student.username,
    studentNumber: student.studentNumber,
    password: student.password || '123456',
    className: student.className,
    teacherName,
  });

  const mailtoUrl = student.email
    ? createMailtoLink(student.email, emailData.subject, emailData.text)
    : '';

  const gmailUrl = student.email
    ? createGmailComposeLink(student.email, emailData.subject, emailData.text)
    : '';

  const formattedSummary = `Sayın ${student.name},\nEğitim & Öğrenci Portalı sistemine kaydınız tamamlanmıştır.\n\n👤 Kullanıcı Adı: ${student.username}\n🔑 Şifre: ${student.password || '123456'}\n🏫 Sınıf: ${student.className || '-'}\n🆔 Öğrenci No: ${student.studentNumber || '-'}\n\nSisteme öğrenci portalı üzerinden kullanıcı adı ve şifrenizle giriş yapabilirsiniz.`;

  const cleanPhone = (student.phone || '').replace(/[^0-9]/g, '');
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone.startsWith('90') ? cleanPhone : cleanPhone.startsWith('0') ? '9' + cleanPhone : '90' + cleanPhone}&text=${encodeURIComponent(formattedSummary)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(formattedSummary)}`;

  const handleCopyPassword = () => {
    navigator.clipboard?.writeText(student.password || '123456');
    setCopiedKey('password');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyAll = () => {
    navigator.clipboard?.writeText(formattedSummary);
    setCopiedKey('all');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenGmail = () => {
    if (gmailUrl) {
      window.open(gmailUrl, '_blank');
      setDispatchStatus('Gmail oluşturma sayfası açıldı.');
      setTimeout(() => setDispatchStatus(null), 4000);
    }
  };

  const handleOpenMailto = () => {
    if (mailtoUrl) {
      window.location.href = mailtoUrl;
      setDispatchStatus('Varsayılan e-posta istemcisi tetiklendi.');
      setTimeout(() => setDispatchStatus(null), 4000);
    }
  };

  const handleOpenWhatsapp = () => {
    window.open(whatsappUrl, '_blank');
    setDispatchStatus('WhatsApp mesajı hazırlandı.');
    setTimeout(() => setDispatchStatus(null), 4000);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl text-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-indigo-900/80 via-slate-900 to-indigo-950/70 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">Öğrenci Giriş Bilgileri & Mail Gönderimi</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Kayıt Başarılı
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Kullanıcı adı ve şifreyi öğrencinin e-postasına veya WhatsApp'a iletin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Student Identity Card */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold text-sm">
                  {student.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{student.name}</h4>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span>{student.className || 'Sınıf Atanmadı'}</span>
                    <span>•</span>
                    <span>No: #{student.studentNumber || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Credentials Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[11px] text-slate-400 font-medium block">Kullanıcı Adı:</span>
                <span className="text-xs font-mono font-bold text-indigo-300 select-all">
                  {student.username}
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Giriş Şifresi:</span>
                  <span className="text-xs font-mono font-bold text-amber-300 select-all">
                    {student.password || '123456'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                  title="Şifreyi Kopyala"
                >
                  {copiedKey === 'password' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="sm:col-span-2 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Öğrenci E-Posta Adresi:</span>
                  <span className="text-xs font-medium text-slate-200">
                    {student.email || 'E-posta girilmedi'}
                  </span>
                </div>
                {student.email && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    Hazır
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Automatic Email Confirmation Banner */}
          {student.email ? (
            <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-start space-x-3 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-300">E-Posta Sistem Tarafından Otomatik Gönderildi:</span>
                <p className="text-[11.5px] text-slate-300 mt-0.5">
                  Giriş bilgileri ve hoş geldin e-postası <strong>{student.email}</strong> adresine başarıyla iletildi. Öğrenci ayrıca kendi portal bildirimlerinde bu şifreyi görebilir.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
              <span className="text-sm">⚠️</span>
              <span>Öğrencinin e-posta adresi kayıtlı olmadığından otomatik mail gönderilemedi. Bilgileri WhatsApp ile iletebilirsiniz.</span>
            </div>
          )}

          {/* Dispatch Status Feedback */}
          {dispatchStatus && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center space-x-2 text-xs text-emerald-300 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{dispatchStatus}</span>
            </div>
          )}

          {/* Email & WhatsApp Dispatch Actions */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-slate-300 block">
              Öğrenciye WhatsApp veya Ekstra Kanalla İletin:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* WhatsApp Direct Share */}
              <button
                id="credentials-modal-whatsapp-btn"
                type="button"
                onClick={handleOpenWhatsapp}
                className="flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-md shadow-emerald-700/20 cursor-pointer text-center"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp ile İlet</span>
              </button>

              {/* Quick Copy for WhatsApp / SMS */}
              <button
                id="credentials-modal-copy-all-btn"
                type="button"
                onClick={handleCopyAll}
                className="flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                {copiedKey === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Panoya Kopyalandı!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-indigo-400" />
                    <span>Bilgileri Kopyala</span>
                  </>
                )}
              </button>
            </div>

            {student.email && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {/* Gmail Web Compose Button */}
                <button
                  id="credentials-modal-gmail-btn"
                  type="button"
                  onClick={handleOpenGmail}
                  className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-200 border border-slate-700 hover:border-red-500/40 text-xs font-medium transition-all cursor-pointer text-center"
                  title="Manuel olarak Gmail üzerinden de göndermek için"
                >
                  <Mail className="w-3.5 h-3.5 text-red-400" />
                  <span>Gmail ile Manuel Aç</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </button>

                {/* Default Mail Client (mailto) */}
                <button
                  id="credentials-modal-mailto-btn"
                  type="button"
                  onClick={handleOpenMailto}
                  className="flex items-center justify-center space-x-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-indigo-900/40 text-slate-300 hover:text-indigo-200 border border-slate-700 hover:border-indigo-500/40 text-xs font-medium transition-all cursor-pointer text-center"
                >
                  <Send className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Mail İstemcisiyle Aç</span>
                </button>
              </div>
            )}
          </div>

          {/* Email Preview Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <span>{showPreview ? '▼ E-Posta Şablonunu Gizle' : '▶ E-Posta Şablonunu Önizle'}</span>
            </button>

            {showPreview && (
              <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                {emailData.text}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/60 px-5 py-3 border-t border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
