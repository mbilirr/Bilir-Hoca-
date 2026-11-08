import React, { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { safeHttpUrl } from '../../lib/fileStorage';
import { usePagedList, ShowMoreBar, useMediaQuery } from '../../lib/listPaging';
import { matchTurkishSearch, turkishCompare } from '../../utils/turkishSearch';
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
  Inbox,
  Megaphone,
  NotebookPen,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader, Segmented, cx } from '../ui/kit';
import { TeacherAnnouncements } from './TeacherAnnouncements';
import { ParentAnnouncements } from './ParentAnnouncements';
import { EtutNotesInbox, useEtutNotes } from './EtutNotesInbox';
import { StudentMessage } from '../../types';
import { dataService } from '../../services/dataService';
import { profilResmi } from '../../lib/profilResmi';
import { useHistoryState } from '../../lib/useHistoryState';

// Aşama 111: kurumun tüm mesajlarını gören (genel yönetici, idare, Rehberlik) için süzgeçler.
// İlk açılış "Bana gelenler + Cevapsız"; son seçim bu tarayıcıda hatırlanır.
type MsgFilters = { kime: string; durum: 'all' | 'open' | 'replied'; sinif: string; donem: 'week' | 'month' | 'all' };
const MSG_FILTER_KEY = 'bilir.messages.filters.v1';
const DEFAULT_MSG_FILTERS: MsgFilters = { kime: 'me', durum: 'open', sinif: '', donem: 'all' };
// Aşama 116: süzgeç seçimi hesaba özel saklanır (aynı cihazda başka hesap / kurum başkasının seçimini almaz)
const msgFilterKey = (uid: string) => (uid ? `${MSG_FILTER_KEY}:${uid}` : MSG_FILTER_KEY);
function readMsgFilters(uid: string): MsgFilters {
  try {
    const raw = localStorage.getItem(msgFilterKey(uid));
    if (raw) return { ...DEFAULT_MSG_FILTERS, ...JSON.parse(raw) };
  } catch {
    /* tarayıcı saklamaya izin vermiyorsa varsayılan */
  }
  return DEFAULT_MSG_FILTERS;
}
const msgSelectCls = 'h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-xs text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500';
// Aşama 206: arama ve cevap kutusu süzgeç kutularıyla aynı ölçü
const msgInputCls = 'h-8 w-full rounded-lg border border-line bg-surface-2 px-3 text-xs text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-indigo-500';

interface TeacherMessagesProps {
  messages: StudentMessage[];
}

export const TeacherMessages: React.FC<TeacherMessagesProps> = ({ messages }) => {
  const [searchTerm, setSearchTerm] = useState('');
  // Aşama 116: ilk açılışta seçim yok; ayrıntı paneli süzülmüş listenin ilk mesajını gösterir
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false); // Aşama 206: telefonda süzgeçler düğmeyle açılır
  const [isSendingReply, setIsSendingReply] = useState(false);
  // Aşama 28: 'inbox' = öğrencilerden gelenler, 'announce' = öğrencilere duyuru / not gönder
  // Aşama 32: 'etutNotes' = etüt yoklamasında öğrenciye anlatılan farklı konu ve öğrenci notları
  const [section, setSection] = useHistoryState<'inbox' | 'announce' | 'parents' | 'etutNotes'>('messages.section', 'inbox'); // Aşama 52: geri tuşu
  const etutNotes = useEtutNotes();

  const phone = useMediaQuery('(max-width: 639px)');
  const term = useDeferredValue(searchTerm.trim());
  const wide = dataService.seesAllEtuts();
  // Aşama 113: başka öğretmene gelen soruları yalnız idare (ve genel yönetici) alır; Rehberlik'te "Kime" süzgeci yok
  const idare = dataService.isHeadAdmin() || dataService.isKurumAdmin();
  const meId = dataService.getAuthSession()?.user.id || '';
  const [filters, setFilters] = useState<MsgFilters>(() => (wide ? readMsgFilters(meId) : { ...DEFAULT_MSG_FILTERS, kime: 'all', durum: 'all' }));
  useEffect(() => {
    if (!wide) return;
    try {
      localStorage.setItem(msgFilterKey(meId), JSON.stringify(filters));
    } catch {
      /* saklanamazsa yalnız bu oturumda geçerli */
    }
  }, [filters, wide, meId]);
  const setFilter = <K extends keyof MsgFilters>(k: K, v: MsgFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  // Aşama 113: sayaç üst menüyle aynı (yalnız bana gelen ve genel okunmamış mesajlar)
  const unreadCount = useMemo(() => messages.filter((m) => !m.read && dataService.isMessageForMe(m)).length, [messages]);
  // Kime / Sınıf seçenekleri yalnız listede gerçekten bulunanlardan oluşur
  const { teacherOpts, classOpts } = useMemo(() => {
    if (!wide) return { teacherOpts: [] as Array<[string, string]>, classOpts: [] as string[] };
    const t = new Map<string, string>();
    const c = new Set<string>();
    messages.forEach((m) => {
      if (idare && m.toTeacherId && m.toTeacherId !== meId) t.set(m.toTeacherId, m.toTeacherName || 'Öğretmen');
      if (m.studentClass) c.add(m.studentClass);
    });
    return {
      teacherOpts: Array.from(t.entries()).sort((a, b) => turkishCompare(a[1], b[1])),
      classOpts: Array.from(c).sort(turkishCompare),
    };
  }, [messages, wide, idare, meId]);

  // Aşama 116: kayıtlı "Kime" / "Sınıf" seçimi bu listede yoksa (başka kurum, silinen öğretmen) açılır kutu ile liste
  // aynı değeri kullanır: Kime → "Bana gelenler", Sınıf → "Tüm sınıflar". Liste henüz yüklenmediyse seçim korunur.
  const effKime =
    filters.kime === 'me' || filters.kime === 'all' || !messages.length || teacherOpts.some(([id]) => id === filters.kime) ? filters.kime : 'me';
  const effSinif = !filters.sinif || !messages.length || classOpts.includes(filters.sinif) ? filters.sinif : '';
  const filteredMessages = useMemo(() => {
    let since = 0;
    if (wide && filters.donem !== 'all') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      if (filters.donem === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      else d.setDate(1);
      since = d.getTime();
    }
    const kime = idare ? effKime : 'all';
    return messages.filter((m) => {
      if (wide) {
        if (kime === 'me' && m.toTeacherId && m.toTeacherId !== meId) return false;
        if (kime !== 'me' && kime !== 'all' && m.toTeacherId !== kime) return false;
        if (filters.durum === 'open' && m.teacherReply) return false;
        if (filters.durum === 'replied' && !m.teacherReply) return false;
        if (effSinif && m.studentClass !== effSinif) return false;
        if (since && new Date(m.createdAt).getTime() < since) return false;
      }
      if (!term) return true;
      return matchTurkishSearch(m.studentName, term) || matchTurkishSearch(m.subject, term) || matchTurkishSearch(m.text, term);
    });
  }, [messages, term, wide, idare, filters, meId, effKime, effSinif]);
  const filtersActive = wide && ((idare && effKime !== 'all') || filters.durum !== 'all' || !!effSinif || filters.donem !== 'all');
  const activeFilterCount = wide ? [idare && effKime !== 'all', filters.durum !== 'all', !!effSinif, filters.donem !== 'all'].filter(Boolean).length : 0;
  // Aşama 15: uzun mesaj listesi parça parça çizilir (Aşama 111: telefonda ilk 15)
  const pagedMessages = usePagedList(filteredMessages, `${term}|${effKime}|${filters.durum}|${effSinif}|${filters.donem}`, 50, phone ? 15 : undefined);

  const activeMessage = messages.find((m) => m.id === selectedMessageId) || filteredMessages[0];

  const handleSelectMessage = (msg: StudentMessage) => {
    setSelectedMessageId(msg.id);
    if (!msg.read) {
      dataService.markMessageAsRead(msg.id);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMessage || !replyText.trim() || isSendingReply) return;

    setIsSendingReply(true);
    try {
      await dataService.replyToMessage(activeMessage.id, replyText.trim());
      setReplyText('');
    } catch {
      // Hata uyarısı zaten gösterildi; yazılan cevap kaybolmasın diye kutu temizlenmez
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sayfa başlığı */}
      {/* Aşama 206: başlık tek satır, sekmeler başlığın yanında ve kısa adlarla */}
      <PageHeader
        icon={MessageSquare}
        tone="danger"
        title="Mesajlar"
        description={unreadCount ? `${unreadCount} okunmamış mesaj` : undefined}
        actions={
      <Segmented
        size="sm"
        value={section}
        onChange={setSection}
        items={[
          { value: 'inbox', label: `Gelen${unreadCount ? ` (${unreadCount})` : ''}`, icon: Inbox, id: 'messages-section-inbox' },
          ...(dataService.canSeeEtutNotesTab()
            ? [
                {
                  value: 'etutNotes' as const,
                  label: `Etüt notları${etutNotes.unseen ? ` (${etutNotes.unseen} yeni)` : ''}`,
                  icon: NotebookPen,
                  id: 'messages-section-etut-notes',
                },
              ]
            : []),
          { value: 'announce', label: 'Duyuru gönder', icon: Megaphone, id: 'messages-section-announce' },
          ...(dataService.canSendParentAnnouncements()
            ? [{ value: 'parents' as const, label: 'Veli duyurusu', icon: Users, id: 'messages-section-parents' }]
            : []),
        ]}
      />
        }
      />

      {section === 'announce' && <TeacherAnnouncements />}
      {section === 'parents' && dataService.canSendParentAnnouncements() && <ParentAnnouncements />}
      {section === 'etutNotes' && dataService.canSeeEtutNotesTab() && <EtutNotesInbox notes={etutNotes} />}

      {/* Main Split Inbox View */}
      {section === 'inbox' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-surface border border-line rounded-2xl overflow-hidden shadow-card min-h-[550px]">
        {/* Left List Column */}
        <div className="lg:col-span-5 border-r border-line flex flex-col bg-surface/50">
          {/* Search bar */}
          <div className="p-3 border-b border-line">
            {/* Aşama 206: arama 32 px; telefonda süzgeçler "Süzgeç" düğmesiyle açılır, bilgisayarda tek satır */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Mesaj ara"
                  placeholder="Öğrenci veya konu ara"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cx(msgInputCls, 'pl-8')}
                />
              </div>
              {wide && (
                <button
                  type="button"
                  id="messages-filters-toggle"
                  aria-expanded={filtersOpen}
                  aria-controls="messages-filters"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="sm:hidden ui-btn ui-btn-secondary ui-btn-sm w-28"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Süzgeç{activeFilterCount ? ` (${activeFilterCount})` : ''}
                </button>
              )}
            </div>
            {wide && (
              <div
                className={cx('mt-2 grid grid-cols-2 gap-2', idare ? 'sm:grid-cols-4' : 'sm:grid-cols-3', !filtersOpen && 'hidden sm:grid')}
                id="messages-filters"
              >
                {idare && (
                  <select id="messages-filter-kime" aria-label="Kime" value={effKime} onChange={(e) => setFilter('kime', e.target.value)} className={msgSelectCls}>
                    <option value="me">Bana gelenler</option>
                    <option value="all">Tüm öğretmenler</option>
                    {teacherOpts.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
                <select id="messages-filter-durum" aria-label="Durum" value={filters.durum} onChange={(e) => setFilter('durum', e.target.value as MsgFilters['durum'])} className={msgSelectCls}>
                  <option value="all">Tüm durumlar</option>
                  <option value="open">Cevapsız</option>
                  <option value="replied">Cevaplanan</option>
                </select>
                <select id="messages-filter-sinif" aria-label="Sınıf" value={effSinif} onChange={(e) => setFilter('sinif', e.target.value)} className={msgSelectCls}>
                  <option value="">Tüm sınıflar</option>
                  {classOpts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select id="messages-filter-donem" aria-label="Dönem" value={filters.donem} onChange={(e) => setFilter('donem', e.target.value as MsgFilters['donem'])} className={msgSelectCls}>
                  <option value="all">Tüm zamanlar</option>
                  <option value="week">Bu hafta</option>
                  <option value="month">Bu ay</option>
                </select>
              </div>
            )}
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[500px]">
            {filteredMessages.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs space-y-3">
                <p>{filtersActive ? 'Seçili süzgeçlere uygun mesaj yok.' : 'Aramanıza uygun mesaj bulunamadı.'}</p>
                {filtersActive && (
                  <button
                    type="button"
                    id="messages-filters-clear"
                    onClick={() => setFilters({ kime: 'all', durum: 'all', sinif: '', donem: 'all' })}
                    className="ui-btn ui-btn-secondary ui-btn-sm w-28 mx-auto"
                  >
                    Tümünü göster
                  </button>
                )}
              </div>
            ) : (
              pagedMessages.visible.map((msg) => {
                const isSelected = activeMessage?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg)}
                    className={cx(
                      'w-full px-3 py-2.5 text-left transition-colors flex items-start gap-2.5',
                      isSelected ? 'bg-indigo-600/10 shadow-[inset_3px_0_0_var(--color-brand)]' : 'hover:bg-surface-2/40'
                    )}
                  >
                    <img
                      src={
                        profilResmi(
                          { id: msg.studentId, name: msg.studentName, avatar: msg.studentAvatar, gender: dataService.studentById(msg.studentId)?.gender },
                          'student'
                        )
                      }
                      alt={msg.studentName}
                      className="w-8 h-8 rounded-full object-cover bg-surface-2 flex-shrink-0"
                    />

                    {/* Aşama 206: iki satır — ad · sınıf · tarih / konu; durum sağda küçük işaret */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className={cx('text-xs text-fg truncate', msg.read ? 'font-semibold' : 'font-bold')}>{msg.studentName}</span>
                        {msg.studentClass && <span className="text-[11px] text-muted shrink-0">{msg.studentClass}</span>}
                        <span className="ml-auto text-[11px] text-muted shrink-0">
                          {new Date(msg.createdAt).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-fg-2 truncate mt-0.5" title={msg.text}>
                        {msg.toTeacherId && (
                          <span className="mr-1 rounded bg-indigo-50 dark:bg-indigo-950/40 px-1 py-px text-[9px] font-bold text-indigo-700 dark:text-indigo-300" title="Öğrenci bu soruyu yalnızca bu öğretmene yazdı">
                            Özel{msg.toTeacherName ? ` → ${msg.toTeacherName}` : ''}
                          </span>
                        )}
                        {msg.subject}
                      </p>
                    </div>
                    <span className="shrink-0 mt-1 flex items-center">
                      {msg.teacherReply ? (
                        <span
                          className="text-emerald-700 dark:text-emerald-400"
                          title={wide && msg.repliedByName ? `Cevaplandı · ${msg.repliedByName}` : 'Cevaplandı'}
                          aria-label="Cevaplandı"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      ) : !msg.read ? (
                        <span className="w-2 h-2 rounded-full bg-red-600" aria-label="Okunmadı"></span>
                      ) : null}
                    </span>
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
        <div className="lg:col-span-7 flex flex-col justify-between p-4 sm:p-5 bg-surface/30">
          {activeMessage ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              {/* Message Header */}
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-line">
                  <div className="flex items-center space-x-3">
                    <img
                      src={
                        profilResmi(
                          { id: activeMessage.studentId, name: activeMessage.studentName, avatar: activeMessage.studentAvatar, gender: dataService.studentById(activeMessage.studentId)?.gender },
                          'student'
                        )
                      }
                      alt={activeMessage.studentName}
                      className="w-9 h-9 rounded-full bg-surface-2"
                    />
                    <div>
                      <h3 className="text-sm font-bold text-fg">
                        {activeMessage.studentName}
                      </h3>
                      {activeMessage.studentClass && <p className="text-[11px] text-muted">{activeMessage.studentClass}</p>}
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
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-bold text-fg">
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
                        href={safeHttpUrl(activeMessage.linkUrl) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ui-btn ui-btn-primary ui-btn-sm w-28 flex-shrink-0 ml-3"
                      >
                        Bağlantıyı aç
                      </a>
                    </div>
                  )}

                  {/* Existing Reply if already answered */}
                  {activeMessage.teacherReply && (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                        <span>✓ {activeMessage.repliedByName ? `${activeMessage.repliedByName} yanıtı:` : 'Sizin Gönderdiğiniz Yanıt:'}</span>
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
                <label htmlFor="teacher-reply-text" className="block text-xs font-semibold text-fg-2">
                  {activeMessage.teacherReply ? 'Yanıtı güncelle' : 'Öğrenciye cevap yaz'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="teacher-reply-text"
                    type="text"
                    required
                    placeholder="Cevabınızı yazın"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className={cx(msgInputCls, 'flex-1')}
                  />
                  <button
                    type="submit"
                    id="teacher-reply-send"
                    disabled={isSendingReply}
                    className="ui-btn ui-btn-primary ui-btn-sm w-28 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingReply ? 'Gönderiliyor' : 'Gönder'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-xs">
              İncelemek için soldan bir mesaj seçin.
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
