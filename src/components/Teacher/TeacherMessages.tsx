import React, { useState, useMemo } from 'react';
import { usePagedList, ShowMoreBar } from '../../lib/listPaging';
import {
  MessageSquare,
  Search,
  ExternalLink,
  Send,
  CheckCircle2,
  Clock,
  User,
  School,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '../ui/kit';
import { StudentMessage } from '../../types';
import { dataService } from '../../services/dataService';

interface TeacherMessagesProps {
  messages: StudentMessage[];
}

export const TeacherMessages: React.FC<TeacherMessagesProps> = ({ messages }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    messages[0]?.id || null
  );
  const [replyText, setReplyText] = useState('');

  const filteredMessages = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return messages.filter(
      (m) =>
        (m.studentName || '').toLowerCase().includes(term) ||
        (m.subject || '').toLowerCase().includes(term) ||
        (m.text || '').toLowerCase().includes(term)
    );
  }, [messages, searchTerm]);
  // Aşama 15: uzun mesaj listesi parça parça çizilir
  const pagedMessages = usePagedList(filteredMessages, searchTerm);

  const activeMessage = messages.find((m) => m.id === selectedMessageId) || filteredMessages[0];

  const handleSelectMessage = (msg: StudentMessage) => {
    setSelectedMessageId(msg.id);
    if (!msg.read) {
      dataService.markMessageAsRead(msg.id);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMessage || !replyText.trim()) return;

    try {
      await dataService.replyToMessage(activeMessage.id, replyText.trim());
      setReplyText('');
    } catch {
      // Hata uyarısı zaten gösterildi; yazılan cevap kaybolmasın diye kutu temizlenmez
    }
  };

  return (
    <div className="space-y-6">
      {/* Sayfa başlığı */}
      <PageHeader
        icon={MessageSquare}
        tone="danger"
        title="Mesajlar"
        description={
          messages.filter((m) => !m.read).length
            ? `${messages.filter((m) => !m.read).length} okunmamış mesaj`
            : 'Öğrencilerinizden gelen sorular ve mesajlar'
        }
      />

      {/* Main Split Inbox View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface border border-line rounded-2xl overflow-hidden shadow-card min-h-[550px]">
        {/* Left List Column */}
        <div className="lg:col-span-5 border-r border-line flex flex-col bg-surface/50">
          {/* Search bar */}
          <div className="p-4 border-b border-line">
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci veya konu ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-surface-2 border border-line rounded-xl text-fg text-xs placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[500px]">
            {filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                Aramanıza uygun mesaj bulunamadı.
              </div>
            ) : (
              pagedMessages.visible.map((msg) => {
                const isSelected = activeMessage?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`w-full p-4 text-left transition-all flex items-start space-x-3 ${
                      isSelected
                        ? 'bg-indigo-600/10 border-l-4 border-indigo-500'
                        : 'hover:bg-surface-2/40'
                    }`}
                  >
                    <img
                      src={
                        msg.studentAvatar ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                          msg.studentName
                        )}`
                      }
                      alt={msg.studentName}
                      className="w-10 h-10 rounded-full object-cover bg-surface-2 ring-2 ring-indigo-500/20 flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-fg truncate">
                          {msg.studentName}
                        </span>
                        <span className="text-[10px] text-muted font-mono">
                          {new Date(msg.createdAt).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-fg truncate mb-1">
                        {msg.subject}
                      </p>

                      <p className="text-[11px] text-muted line-clamp-1">{msg.text}</p>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] bg-surface-2 text-fg-2 px-2 py-0.5 rounded border border-line">
                          {msg.studentClass}
                        </span>

                        {msg.teacherReply ? (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Cevaplandı</span>
                          </span>
                        ) : !msg.read ? (
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            <ShowMoreBar
              id="messages-show-more"
              remaining={pagedMessages.remaining}
              total={pagedMessages.total}
              shown={pagedMessages.visible.length}
              onMore={pagedMessages.showMore}
            />
          </div>
        </div>

        {/* Right Message Detail Column */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 bg-surface/30">
          {activeMessage ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              {/* Message Header */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-line">
                  <div className="flex items-center space-x-3">
                    <img
                      src={
                        activeMessage.studentAvatar ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                          activeMessage.studentName
                        )}`
                      }
                      alt={activeMessage.studentName}
                      className="w-12 h-12 rounded-full bg-surface-2 ring-2 ring-indigo-500/30"
                    />
                    <div>
                      <h3 className="text-base font-bold text-fg">
                        {activeMessage.studentName}
                      </h3>
                    </div>
                  </div>

                  <span className="text-xs text-muted flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(activeMessage.createdAt).toLocaleString('tr-TR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </span>
                </div>

                {/* Subject & Text */}
                <div className="mt-5 space-y-4">
                  <h4 className="text-lg font-bold text-fg tracking-tight">
                    {activeMessage.subject}
                  </h4>

                  <div className="p-4 bg-surface-2/60 rounded-2xl border border-line text-sm text-fg leading-relaxed whitespace-pre-wrap">
                    {activeMessage.text}
                  </div>

                  {/* Attachment Link if provided */}
                  {activeMessage.linkUrl && (
                    <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <ExternalLink className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                            Öğrencinin Eklediği Bağlantı / Çözüm Görseli:
                          </p>
                          <p className="text-xs text-fg-2 truncate underline">
                            {activeMessage.linkUrl}
                          </p>
                        </div>
                      </div>
                      <a
                        href={activeMessage.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ml-3"
                      >
                        Bağlantıyı Aç
                      </a>
                    </div>
                  )}

                  {/* Existing Reply if already answered */}
                  {activeMessage.teacherReply && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                        <span>✓ Sizin Gönderdiğiniz Yanıt:</span>
                        {activeMessage.repliedAt && (
                          <span className="text-muted font-normal">
                            {new Date(activeMessage.repliedAt).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg leading-relaxed">
                        {activeMessage.teacherReply}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="pt-4 border-t border-line space-y-3">
                <label className="block text-xs font-semibold text-fg-2 uppercase tracking-wider">
                  {activeMessage.teacherReply ? 'Yanıtı Güncelle / Yeni Mesaj Yaz:' : 'Öğrenciye Cevap Yaz:'}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="Açıklamanızı ve yönlendirmenizi buraya yazın..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-surface-2 border border-line rounded-xl text-fg text-xs placeholder-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gönder</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-sm">
              İncelemek için sol listeden bir mesaj seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
