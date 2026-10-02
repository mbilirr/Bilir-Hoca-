import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
    type?: 'homework_assigned' | 'etut_assigned' | 'student_welcome';
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-fg"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-canvas/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-fg tracking-wide">
                E-Posta Önizlemesi & İletim Kaydı
              </span>
              <div className="flex items-center space-x-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                <span>Otomatik Olarak İletildi</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-surface-2/80 p-0.5 rounded-lg border border-line text-xs">
              <button
                type="button"
                onClick={() => setViewMode('html')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  viewMode === 'html'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-muted hover:text-fg'
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
                    : 'text-muted hover:text-fg'
                }`}
              >
                Düz Metin
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-fg hover:bg-surface-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Email Headers Meta Box */}
        <div className="px-5 py-3.5 bg-surface border-b border-line text-xs space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-muted font-semibold w-16 shrink-0">Konu:</span>
            <span className="font-bold text-fg text-sm truncate">{email.subject}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center space-x-2 text-fg-2">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-muted">Gönderen:</span>
              <span className="font-semibold text-fg">
                {email.senderName}{' '}
                <span className="text-muted font-normal">
                  &lt;{email.senderEmail || 'sistem@ornek.k12.tr'}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-fg-2">
              <Mail className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="text-muted">Alıcı:</span>
              <span className="font-semibold text-fg">
                {email.recipientName}{' '}
                <span className="text-muted font-normal">
                  &lt;{email.recipientEmail}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-fg-2">
              <Clock className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400 shrink-0" />
              <span className="text-muted">Tarih:</span>
              <span className="text-fg">{formattedDate}</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-muted">Durum:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                ✓ Başarıyla Teslim Edildi
              </span>
            </div>
          </div>
        </div>

        {/* Email Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-canvas/40">
          {viewMode === 'html' ? (
            <div className="bg-surface rounded-xl shadow-lg overflow-hidden border border-line text-fg">
              <iframe
                title="Email HTML Preview"
                srcDoc={email.htmlContent}
                className="w-full min-h-[380px] sm:min-h-[460px] border-none"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="bg-surface rounded-xl p-4 border border-line font-mono text-xs text-fg-2 whitespace-pre-wrap leading-relaxed shadow-inner">
              {email.textContent}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-line bg-canvas/70">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyText}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-semibold border border-line transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">Kopyalandı</span>
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
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-indigo-600 dark:text-indigo-300 text-xs font-semibold border border-line transition-colors"
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
              className="px-4 py-1.5 bg-surface-2 hover:bg-surface-3 text-fg-2 text-xs font-semibold rounded-lg transition-colors border border-line cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
