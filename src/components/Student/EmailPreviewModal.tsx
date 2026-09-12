import React, { useState } from 'react';
import {
  X,
  Mail,
  Calendar,
  User,
  Clock,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { createMailtoLink } from '../../lib/emailTemplates';

interface EmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: {
    subject: string;
    senderName: string;
    senderEmail?: string;
    recipientName: string;
    recipientEmail: string;
    sentAt: string;
    htmlContent: string;
    textContent: string;
    type?: 'homework_assigned' | 'etut_assigned';
    onNavigateAction?: () => void;
    actionLabel?: string;
  } | null;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({
  isOpen,
  onClose,
  email,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html');

  if (!isOpen || !email) return null;

  const handleCopyText = () => {
    navigator.clipboard.writeText(email.textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mailtoLink = createMailtoLink(
    email.recipientEmail,
    email.subject,
    email.textContent
  );

  const formattedDate = new Date(email.sentAt).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white tracking-wide">
                E-Posta Önizlemesi & İletim Kaydı
              </span>
              <div className="flex items-center space-x-1.5 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>Otomatik Olarak İletildi</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('html')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  viewMode === 'html'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                HTML Tasarımı
              </button>
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  viewMode === 'text'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Düz Metin
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Email Headers Meta Box */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 text-xs space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-semibold w-16 shrink-0">Konu:</span>
            <span className="font-bold text-white text-sm truncate">{email.subject}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center space-x-2 text-slate-300">
              <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-400">Gönderen:</span>
              <span className="font-semibold text-white">
                {email.senderName}{' '}
                <span className="text-slate-400 font-normal">
                  &lt;{email.senderEmail || 'sistem@ornek.k12.tr'}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-slate-300">
              <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">Alıcı:</span>
              <span className="font-semibold text-white">
                {email.recipientName}{' '}
                <span className="text-slate-400 font-normal">
                  &lt;{email.recipientEmail}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-400">Tarih:</span>
              <span className="text-slate-200">{formattedDate}</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Durum:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                ✓ Başarıyla Teslim Edildi
              </span>
            </div>
          </div>
        </div>

        {/* Email Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-950/40">
          {viewMode === 'html' ? (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 text-slate-900">
              <iframe
                title="Email HTML Preview"
                srcDoc={email.htmlContent}
                className="w-full min-h-[380px] sm:min-h-[460px] border-none"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner">
              {email.textContent}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyText}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Metni Kopyala</span>
                </>
              )}
            </button>

            <a
              href={mailtoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-slate-700 transition-colors"
              title="Varsayılan Mail Uygulamasında Aç"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mail İstemcisinde Aç</span>
            </a>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {email.onNavigateAction && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  email.onNavigateAction?.();
                }}
                className="flex-1 sm:flex-none px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors"
              >
                {email.actionLabel || 'İlgili Bölüme Git'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
