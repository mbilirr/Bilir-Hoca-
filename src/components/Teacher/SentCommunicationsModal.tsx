import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Search,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { SentEmailLog } from '../../types';
import { dataService } from '../../services/dataService';
import { EmailPreviewModal } from '../Student/EmailPreviewModal';

interface SentCommunicationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SentCommunicationsModal: React.FC<SentCommunicationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [emails, setEmails] = useState<SentEmailLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'homework' | 'etut'>('all');
  const [selectedEmail, setSelectedEmail] = useState<{
    subject: string;
    senderName: string;
    senderEmail?: string;
    recipientName: string;
    recipientEmail: string;
    sentAt: string;
    htmlContent: string;
    textContent: string;
    type?: 'homework_assigned' | 'etut_assigned';
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEmails(dataService.getSentEmails());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredEmails = emails.filter((item) => {
    const matchesSearch =
      item.recipientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.recipientEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.teacherName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      typeFilter === 'all'
        ? true
        : typeFilter === 'homework'
        ? item.type === 'homework_assigned'
        : item.type === 'etut_assigned';

    return matchesSearch && matchesType;
  });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">
                  Otomatik E-Posta & Bildirim İletim Günlüğü
                </h3>
                <p className="text-xs text-slate-400">
                  Öğrencilere tanımlanan ödev ve etütler için gönderilen tüm bilgilendirme kayıtları
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Controls Bar */}
          <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Öğrenci adı, e-posta veya konu ara..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-1.5 w-full sm:w-auto text-xs">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Tümü ({emails.length})
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter('homework')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors ${
                  typeFilter === 'homework'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ödevler</span>
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter('etut')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors ${
                  typeFilter === 'etut'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Etütler</span>
              </button>
            </div>
          </div>

          {/* Records Table / List */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/40">
            {filteredEmails.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs space-y-2">
                <Mail className="w-10 h-10 text-slate-600 mx-auto" />
                <p>Eşleşen e-posta iletim kaydı bulunamadı.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredEmails.map((item) => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setSelectedEmail({
                        subject: item.subject,
                        senderName: item.teacherName,
                        senderEmail: 'bilgilendirme@ornek.k12.tr',
                        recipientName: item.recipientName,
                        recipientEmail: item.recipientEmail,
                        sentAt: item.sentAt,
                        htmlContent: item.htmlContent,
                        textContent: item.textContent,
                        type: item.type,
                      })
                    }
                    className="p-3.5 sm:p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850/80 transition-all cursor-pointer shadow-sm group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            item.type === 'homework_assigned'
                              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                              : 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                          }`}
                        >
                          {item.type === 'homework_assigned' ? (
                            <BookOpen className="w-4 h-4" />
                          ) : (
                            <Calendar className="w-4 h-4" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-1">
                            <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                              {item.subject}
                            </span>
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                              İletildi
                            </span>
                          </div>

                          <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1 flex-wrap gap-y-1">
                            <span>
                              Alıcı: <strong className="text-slate-200">{item.recipientName}</strong> ({item.recipientEmail})
                            </span>
                            <span>•</span>
                            <span>Öğretmen: {item.teacherName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 sm:self-center shrink-0 text-xs">
                        <span className="text-[11px] text-slate-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(item.sentAt).toLocaleString('tr-TR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>

                        <div className="flex items-center text-indigo-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                          <span className="hidden sm:inline text-[11px] mr-1">Önizle</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
            <span>
              Toplam {filteredEmails.length} adet e-posta gönderimi listelendi.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors border border-slate-700 cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>

      <EmailPreviewModal
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
        email={selectedEmail}
      />
    </>
  );
};
