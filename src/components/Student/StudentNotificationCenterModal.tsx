import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  Mail,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ChevronRight,
  Sparkles,
  Trash2,
  CheckCheck,
  AlertCircle,
  ExternalLink,
  Award,
} from 'lucide-react';
import { StudentNotification, SentEmailLog, Student } from '../../types';
import { dataService } from '../../services/dataService';
import { EmailPreviewModal } from './EmailPreviewModal';
import { requestBrowserNotificationPermission } from '../../lib/browserNotifications';
import { StudentTabType } from './StudentHeroBanner';

interface StudentNotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStudent: Student;
  onNavigateTab?: (tab: StudentTabType) => void;
}

export const StudentNotificationCenterModal: React.FC<StudentNotificationCenterModalProps> = ({
  isOpen,
  onClose,
  currentStudent,
  onNavigateTab,
}) => {
  const [filter, setFilter] = useState<'all' | 'homework' | 'etuts' | 'emails'>('all');
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [emails, setEmails] = useState<SentEmailLog[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<{
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
  } | null>(null);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const refreshData = () => {
    if (!currentStudent) return;
    const notifs = dataService.getStudentNotifications(currentStudent.id);
    const sentMails = dataService.getSentEmails(currentStudent.id);
    setNotifications(notifs);
    setEmails(sentMails);
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }
  }, [isOpen, currentStudent.id]);

  if (!isOpen) return null;

  const handleEnableBrowserNotifications = async () => {
    const granted = await requestBrowserNotificationPermission();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const handleMarkAllRead = () => {
    dataService.markAllNotificationsAsRead(currentStudent.id);
    refreshData();
  };

  const handleItemClick = (notif: StudentNotification) => {
    dataService.markNotificationAsRead(notif.id);
    refreshData();

    if (notif.emailDetails) {
      setSelectedEmail({
        subject: notif.emailDetails.subject,
        senderName: notif.teacherName || 'Öğretmeniniz',
        senderEmail: 'bilgilendirme@ornek.k12.tr',
        recipientName: currentStudent.name,
        recipientEmail: currentStudent.email,
        sentAt: notif.emailDetails.sentAt || notif.createdAt,
        htmlContent: notif.emailDetails.bodyHtml,
        textContent: notif.message,
        type: notif.type === 'new_homework' ? 'homework_assigned' : 'etut_assigned',
        onNavigateAction: notif.linkTab
          ? () => {
              onClose();
              onNavigateTab?.(notif.linkTab!);
            }
          : undefined,
        actionLabel: notif.linkTab === 'homework' ? 'Ödeve Git' : 'Etütlere Git',
      });
    } else if (notif.linkTab) {
      onClose();
      onNavigateTab?.(notif.linkTab);
    }
  };

  const handleEmailClick = (email: SentEmailLog) => {
    setSelectedEmail({
      subject: email.subject,
      senderName: email.teacherName,
      senderEmail: 'bilgilendirme@ornek.k12.tr',
      recipientName: email.recipientName,
      recipientEmail: email.recipientEmail,
      sentAt: email.sentAt,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      type: email.type,
      onNavigateAction: () => {
        onClose();
        if (email.type === 'homework_assigned') {
          onNavigateTab?.('homework');
        } else if (email.type === 'etut_assigned') {
          onNavigateTab?.('etuts');
        } else {
          onNavigateTab?.('home');
        }
      },
      actionLabel:
        email.type === 'homework_assigned'
          ? 'Ödev Detayına Git'
          : email.type === 'etut_assigned'
          ? 'Etüt Takvimine Git'
          : 'Ana Sayfaya Git',
    });
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filter === 'homework') return n.type === 'new_homework';
    if (filter === 'etuts') return n.type === 'new_etut';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const modalContent = (
    <>
      <div
        className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 animate-fade-in"
        onClick={onClose}
      >
        <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
          <div
            className="bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 relative">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-black flex items-center justify-center ring-2 ring-slate-900">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">
                  Bildirimler & E-Posta Kutusu
                </h3>
                <p className="text-xs text-slate-400">
                  {currentStudent.name} • Yeni ödev ve etüt bildirimleri
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

          {/* Browser Notification Banner if not enabled */}
          {notificationPermission !== 'granted' && (
            <div className="bg-indigo-950/40 border-b border-indigo-500/20 px-5 py-2.5 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center space-x-2 text-indigo-200">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Yeni ödev ve etütlerden anında haberdar olmak için tarayıcı bildirimlerini açın.</span>
              </div>
              <button
                type="button"
                onClick={handleEnableBrowserNotifications}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg shrink-0 shadow transition-colors"
              >
                Bildirimleri Aç
              </button>
            </div>
          )}

          {/* Filter Bar & Quick Actions */}
          <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-1.5 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  filter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                Tümü ({notifications.length})
              </button>

              <button
                type="button"
                onClick={() => setFilter('homework')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors ${
                  filter === 'homework'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Ödevler</span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('etuts')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors ${
                  filter === 'etuts'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Etütler</span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('emails')}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1 transition-colors ${
                  filter === 'emails'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>E-Postalar ({emails.length})</span>
              </button>
            </div>

            {unreadCount > 0 && filter !== 'emails' && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Tümünü Okundu Say</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-950/30 min-h-[300px]">
            {filter === 'emails' ? (
              emails.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                  <Mail className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Henüz gelen e-posta kaydı bulunmuyor.</p>
                </div>
              ) : (
                emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => handleEmailClick(email)}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition-all cursor-pointer shadow-sm group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            email.type === 'homework_assigned'
                              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                              : 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                          }`}
                        >
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                              {email.subject}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              İletildi ✓
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                            Kimden: {email.teacherName} • Kime: {email.recipientEmail}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {new Date(email.sentAt).toLocaleString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center text-xs text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                        <span className="hidden sm:inline text-[11px] font-semibold mr-1">
                          E-Postayı Aç
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : filteredNotifs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                <Bell className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Bu filtrede henüz bir bildiriminiz bulunmuyor.</p>
              </div>
            ) : (
              filteredNotifs.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-sm group ${
                    notif.read
                      ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-850/90 border-indigo-500/40 hover:border-indigo-400 ring-1 ring-indigo-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          notif.type === 'praise'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 ring-2 ring-amber-500/20'
                            : notif.type === 'new_homework'
                            ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                            : notif.type === 'new_etut'
                            ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {notif.type === 'praise' ? (
                          <Award className="w-4 h-4 text-amber-300" />
                        ) : notif.type === 'new_homework' ? (
                          <BookOpen className="w-4 h-4" />
                        ) : notif.type === 'new_etut' ? (
                          <Calendar className="w-4 h-4" />
                        ) : (
                          <Bell className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-xs font-bold transition-colors ${
                              notif.read
                                ? 'text-slate-300 group-hover:text-white'
                                : 'text-white group-hover:text-indigo-300 font-extrabold'
                            }`}
                          >
                            {notif.title}
                          </span>

                          {!notif.read && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-indigo-600 text-white">
                              YENİ
                            </span>
                          )}

                          {notif.emailSent && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center space-x-1">
                              <Mail className="w-2.5 h-2.5" />
                              <span>Mail Gönderildi</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {notif.message}
                        </p>

                        <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-1.5">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {new Date(notif.createdAt).toLocaleString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>

                          {notif.teacherName && (
                            <span>Öğretmen: {notif.teacherName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center text-xs text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                      <span className="hidden sm:inline text-[11px] font-semibold mr-1">
                        Detayı Gör
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
            <span className="text-[11px]">
              Tüm ödev atamaları ve etüt planlamaları anında bildirim ve e-posta olarak iletilir.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-colors border border-slate-700 cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* Interactive Email Viewer Modal */}
      <EmailPreviewModal
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
        email={selectedEmail}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
