import React, { useState } from 'react';
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
  Lock,
} from 'lucide-react';
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

  const filteredMessages = messages.filter((m) => {
    const term = searchTerm.toLowerCase();
    return (
      m.studentName.toLowerCase().includes(term) ||
      m.subject.toLowerCase().includes(term) ||
      m.text.toLowerCase().includes(term)
    );
  });

  const activeMessage = messages.find((m) => m.id === selectedMessageId) || filteredMessages[0];

  const handleSelectMessage = (msg: StudentMessage) => {
    setSelectedMessageId(msg.id);
    if (!msg.read) {
      dataService.markMessageAsRead(msg.id);
    }
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMessage || !replyText.trim()) return;

    dataService.replyToMessage(activeMessage.id, replyText.trim());
    setReplyText('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Öğrenci Soru & Mesaj Merkezi</h2>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-indigo-950/40 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-xs text-indigo-300">
          <Lock className="w-3.5 h-3.5" />
          <span>Gizli ve Uçtan Uca Öğretmen-Öğrenci Kanalı</span>
        </div>
      </div>

      {/* Main Split Inbox View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl min-h-[550px]">
        {/* Left List Column */}
        <div className="lg:col-span-5 border-r border-slate-800 flex flex-col bg-slate-900/50">
          {/* Search bar */}
          <div className="p-4 border-b border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Öğrenci veya konu ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 max-h-[500px]">
            {filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Aramanıza uygun mesaj bulunamadı.
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = activeMessage?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={`w-full p-4 text-left transition-all flex items-start space-x-3 ${
                      isSelected
                        ? 'bg-indigo-600/10 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-800/40'
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
                      className="w-10 h-10 rounded-full object-cover bg-slate-800 ring-2 ring-indigo-500/20 flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-white truncate">
                          {msg.studentName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(msg.createdAt).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <p className="text-xs font-medium text-slate-200 truncate mb-1">
                        {msg.subject}
                      </p>

                      <p className="text-[11px] text-slate-400 line-clamp-1">{msg.text}</p>

                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                          {msg.studentClass}
                        </span>

                        {msg.teacherReply ? (
                          <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
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
          </div>
        </div>

        {/* Right Message Detail Column */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 bg-slate-900/30">
          {activeMessage ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              {/* Message Header */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center space-x-3">
                    <img
                      src={
                        activeMessage.studentAvatar ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(
                          activeMessage.studentName
                        )}`
                      }
                      alt={activeMessage.studentName}
                      className="w-12 h-12 rounded-full bg-slate-800 ring-2 ring-indigo-500/30"
                    />
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {activeMessage.studentName}
                      </h3>
                      <p className="text-xs text-indigo-300 font-medium">
                        {activeMessage.studentClass} • Öğrenci
                      </p>
                    </div>
                  </div>

                  <span className="text-xs text-slate-500 flex items-center space-x-1">
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
                  <h4 className="text-lg font-bold text-white tracking-tight">
                    {activeMessage.subject}
                  </h4>

                  <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/80 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {activeMessage.text}
                  </div>

                  {/* Attachment Link if provided */}
                  {activeMessage.linkUrl && (
                    <div className="p-3.5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate">
                        <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-semibold text-indigo-300">
                            Öğrencinin Eklediği Bağlantı / Çözüm Görseli:
                          </p>
                          <p className="text-xs text-slate-300 truncate underline">
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
                    <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                        <span>✓ Sizin Gönderdiğiniz Yanıt:</span>
                        {activeMessage.repliedAt && (
                          <span className="text-slate-500 font-normal">
                            {new Date(activeMessage.repliedAt).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {activeMessage.teacherReply}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="pt-4 border-t border-slate-800 space-y-3">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {activeMessage.teacherReply ? 'Yanıtı Güncelle / Yeni Mesaj Yaz:' : 'Öğrenciye Cevap Yaz:'}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="Açıklamanızı ve yönlendirmenizi buraya yazın..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              İncelemek için sol listeden bir mesaj seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
