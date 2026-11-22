import React, { useState } from 'react';

import {
  Mail,
  User,
  Clock,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import { createMailtoLink } from '../../lib/emailTemplates';
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

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

  const altKisim = (
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyText}
              className="ui-btn ui-btn-sm flex-1 sm:flex-none bg-surface-2 hover:bg-surface-3 text-fg-2 border border-line"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success-fg" />
                  <span className="text-success-fg">Kopyalandı</span>
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
              className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-brand-fg text-xs font-semibold border border-line transition-colors"
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
                className="ui-btn ui-btn-sm flex-1 sm:flex-none bg-fg hover:opacity-90 text-canvas"
              >
                {email.actionLabel || 'İlgili Bölüme Git'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 border border-line min-w-24"
            >
              Kapat
            </button>
          </div>
        </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      layerClass="z-(--z-pencere-ust)"
      icon={Mail}
      title="E-Posta Önizlemesi & İletim Kaydı"
      description={
        <span className="inline-flex items-center gap-1.5 text-success-fg">
          <CheckCircle2 className="w-3 h-3" />
          Otomatik Olarak İletildi
        </span>
      }
      baslikSag={
        <>
            {/* View Mode Toggle */}
            <div className="ui-seg" role="group" aria-label="Görünüm">
              <button
                type="button"
                onClick={() => setViewMode('html')}
                className="ui-seg-btn" aria-pressed={viewMode === 'html'}
              >
                HTML Tasarımı
              </button>
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className="ui-seg-btn" aria-pressed={viewMode === 'text'}
              >
                Düz Metin
              </button>
            </div>
        </>
      }
      govdeClass="p-4 sm:p-5 bg-canvas/40"
      footer={altKisim}
      ust={
        <>
        {/* Email Headers Meta Box */}
        <div className="px-5 py-3.5 bg-surface border-b border-line text-xs space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-muted font-semibold w-16 shrink-0">Konu:</span>
            <span className="font-bold text-fg text-sm truncate">{email.subject}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-2 text-fg-2">
              <User className="w-3.5 h-3.5 text-brand-fg shrink-0" />
              <span className="text-muted">Gönderen:</span>
              <span className="font-semibold text-fg">
                {email.senderName}{' '}
                <span className="text-muted font-normal">
                  &lt;{email.senderEmail || 'sistem@ornek.k12.tr'}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-fg-2">
              <Mail className="w-3.5 h-3.5 text-success-fg shrink-0" />
              <span className="text-muted">Alıcı:</span>
              <span className="font-semibold text-fg">
                {email.recipientName}{' '}
                <span className="text-muted font-normal">
                  &lt;{email.recipientEmail}&gt;
                </span>
              </span>
            </div>

            <div className="flex items-center space-x-2 text-fg-2">
              <Clock className="w-3.5 h-3.5 text-info-fg shrink-0" />
              <span className="text-muted">Tarih:</span>
              <span className="text-fg">{formattedDate}</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-muted">Durum:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold bg-success/15 text-success-fg border border-success/30">
                ✓ Başarıyla Teslim Edildi
              </span>
            </div>
          </div>
        </div>

        </>
      }
    >
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
    </Modal>
  );
};
