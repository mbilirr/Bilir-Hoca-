import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  MapPin,
  MessageSquare,
  Plus,
  Sun,
  Target,
  UserPlus,
  Users,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import { Teacher, Etut, Homework, HomeworkSubmission, Student, ClassGroup, StudentMessage, TeacherTabType, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { setQuickFocus } from '../../lib/quickFocus';
import { timeGreeting, firstNameOf } from '../../lib/greeting';
import { Panel, StatCard, EmptyState, IconBox, cx } from '../ui/kit';
import { TeacherEtutBell } from './TeacherEtutBell';
import { useSeenIds } from '../../lib/useSeenIds';
import { useArrivalFlash } from '../../lib/useArrivalFlash';
import { etutTeacherNames } from '../../lib/etutStatus';
import { PushOptInCard } from '../Common/PushOptInCard';

// ============================================================================
// ÖĞRETMEN ANA SAYFASI (Aşama 8)
// Selamlama + hızlı işlemler, "Bugün" özeti, 4 özet kart ve aylık ajanda.
// ============================================================================

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// Yerel tarih (Türkiye saatiyle) YYYY-MM-DD
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const longDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${d} ${MONTHS[m - 1]} ${DAYS[dt.getDay()]}`;
};

interface TeacherHomeProps {
  currentTeacher: Teacher | null;
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  etuts: Etut[];
  messages: StudentMessage[];
  onNavigateTab: (tab: TeacherTabType) => void;
  onOpenStudentView?: () => void;
}

export const TeacherHome: React.FC<TeacherHomeProps> = ({
  currentTeacher,
  students,
  classes,
  homeworks,
  submissions,
  etuts,
  messages,
  onNavigateTab,
  onOpenStudentView,
}) => {
  const [questionLogs, setQuestionLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  useEffect(() => dataService.subscribe(() => setQuestionLogs(dataService.getQuestionLogs())), []);

  // --- Aşama 28/29: yeni gelen bilgiler (soru girişi, ödev teslimi) ---
  // Görülen kayıtlar bu tarayıcıda hatırlanır; görülmemişler renkli yan-sön ile yanıp söner.
  const teacherKey = currentTeacher?.id || 'x';
  const [seenQLogIds, markQLogsSeen] = useSeenIds(`tchr_qlog_seen_${teacherKey}`);
  const [seenSubIds, markSubsSeen] = useSeenIds(`tchr_sub_seen_${teacherKey}`);

  const now = new Date();
  const todayStr = ymd(now);
  const tomorrowStr = ymd(addDays(now, 1));
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const weekStart = ymd(monday);
  const weekEnd = ymd(addDays(monday, 6));

  const go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
    if (focus) setTimeout(() => setQuickFocus(...focus), 0);
  };

  // Aşama 15: sınıf mevcutları ve teslim sayıları bir kez sayılır (her ödev için tüm listeler taranmaz)
  const classSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) m.set(s.classId, (m.get(s.classId) || 0) + 1);
    return m;
  }, [students]);
  const doneByHw = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of submissions) if (s.status === 'on_time' || s.status === 'late') m.set(s.homeworkId, (m.get(s.homeworkId) || 0) + 1);
    return m;
  }, [submissions]);
  // Bir ödevi kaç öğrencinin yapması gerekiyor
  const expectedFor = (hw: Homework) => {
    if (Array.isArray(hw.assignedTo)) return hw.assignedTo.length;
    if (hw.targetClassIds && hw.targetClassIds.length) return Array.from(new Set(hw.targetClassIds)).reduce((n, id) => n + (classSize.get(id) || 0), 0);
    if (hw.classId) return classSize.get(hw.classId) || 0;
    return students.length;
  };
  const doneFor = (hwId: string) => doneByHw.get(hwId) || 0;

  // --- Bugün ---
  const todayEtuts = useMemo(
    () => etuts.filter((e) => e.date === todayStr).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [etuts, todayStr]
  );
  const nextEtut = useMemo(
    () =>
      etuts
        .filter((e) => e.date > todayStr)
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0],
    [etuts, todayStr]
  );
  const dueSoon = useMemo(
    () =>
      homeworks
        .filter((h) => h.dueDate && (h.dueDate.slice(0, 10) === todayStr || h.dueDate.slice(0, 10) === tomorrowStr))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [homeworks, todayStr, tomorrowStr]
  );
  const unread = useMemo(
    () => messages.filter((m) => !m.read).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [messages]
  );
  // Son 3 günde girilen soru kayıtları (en yeni üstte); öğrenci adı + toplam soru sayısı
  const recentQuestionEntries = useMemo(() => {
    const cutoff = Date.now() - 3 * 86400000;
    const byId = new Map(students.map((st) => [st.id, st] as const));
    return questionLogs
      .filter((l) => (l.totalQuestions || 0) > 0 && byId.has(l.studentId) && new Date(l.createdAt || 0).getTime() >= cutoff)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((l) => ({
        id: l.id,
        studentId: l.studentId,
        name: byId.get(l.studentId)?.name || l.studentName,
        className: byId.get(l.studentId)?.className || l.className,
        total: l.totalQuestions || 0,
        date: l.date,
        createdAt: l.createdAt,
        subjects: Array.from(new Set((l.entries || []).filter((e) => (e.questionCount || 0) > 0).map((e) => e.subject))),
      }));
  }, [questionLogs, students]);
  const unseenQuestionEntries = recentQuestionEntries.filter((e) => !seenQLogIds.has(e.id));

  // Son 3 günde teslim edilen ödevler (en yeni üstte)
  const recentSubmissions = useMemo(() => {
    const cutoff = Date.now() - 3 * 86400000;
    const sById = new Map(students.map((st) => [st.id, st] as const));
    const hwById = new Map(homeworks.map((h) => [h.id, h] as const));
    return submissions
      .filter(
        (sub) =>
          (sub.status === 'on_time' || sub.status === 'late') &&
          sById.has(sub.studentId) &&
          hwById.has(sub.homeworkId) &&
          new Date(sub.submittedAt || 0).getTime() >= cutoff
      )
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
      .map((sub) => ({
        // Teslim güncellenirse (yeniden teslim) yeni bir bilgi sayılır ve yeniden yanıp söner
        id: `${sub.id}@${sub.submittedAt || ''}`,
        homeworkId: sub.homeworkId,
        title: hwById.get(sub.homeworkId)?.title || 'Ödev',
        name: sById.get(sub.studentId)?.name || sub.studentName,
        className: sById.get(sub.studentId)?.className || '',
        late: sub.status === 'late',
        submittedAt: sub.submittedAt,
      }));
  }, [submissions, students, homeworks]);
  const unseenSubmissions = recentSubmissions.filter((e) => !seenSubIds.has(e.id));

  // Sayfa açıkken yeni bir bilgi gelirse ilgili kutu birkaç saniye güçlü parlar
  const flashQuestions = useArrivalFlash(unseenQuestionEntries.length);
  const flashMessages = useArrivalFlash(unread.length);
  const flashSubmissions = useArrivalFlash(unseenSubmissions.length);
  const whenText = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const day = ymd(d);
    if (day === todayStr) return `bugün ${hm}`;
    if (day === ymd(addDays(now, -1))) return `dün ${hm}`;
    return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${hm}`;
  };

  const etutStudentCount = (e: Etut) => (e.assignedStudentIds === 'all' ? 'Tüm öğrenciler' : `${e.assignedStudentIds.length} öğrenci`);

  // --- Özet kartları ---
  const activeHomeworks = homeworks.filter((h) => h.dueDate && h.dueDate.slice(0, 10) >= todayStr);
  const nextDue = [...activeHomeworks].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  let expectedTotal = 0;
  let doneTotal = 0;
  homeworks.forEach((h) => {
    expectedTotal += expectedFor(h);
    doneTotal += doneFor(h.id);
  });
  const rate = expectedTotal > 0 ? Math.min(100, Math.round((doneTotal / expectedTotal) * 100)) : 0;
  const weekEtuts = etuts.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const studentIds = new Set(students.map((s) => s.id));
  const weekLogs = questionLogs.filter((l) => l.date >= weekStart && l.date <= weekEnd && (!studentIds.size || studentIds.has(l.studentId)));
  const weekQuestions = weekLogs.reduce((sum, l) => sum + (l.totalQuestions || 0), 0);
  const weekActiveStudents = new Set(weekLogs.filter((l) => (l.totalQuestions || 0) > 0).map((l) => l.studentId)).size;

  const firstName = firstNameOf(currentTeacher?.name, '');
  const branch = currentTeacher?.branch
    ? currentTeacher.branch.includes('Öğretmen')
      ? currentTeacher.branch
      : `${currentTeacher.branch} Öğretmeni`
    : 'Öğretmen';

  const summaryParts = [
    todayEtuts.length ? `${todayEtuts.length} etüt` : '',
    dueSoon.length ? `${dueSoon.length} ödev teslimi` : '',
    unread.length ? `${unread.length} okunmamış mesaj` : '',
    unseenSubmissions.length ? `${unseenSubmissions.length} yeni ödev teslimi` : '',
    unseenQuestionEntries.length ? `${unseenQuestionEntries.length} yeni soru girişi` : '',
  ].filter(Boolean);
  // Aşama 64: "Bugün" kutusu yeni gelen bilgiyle parlar (mesaj > ödev teslimi > soru girişi rengi)
  const todayFlash = flashMessages
    ? 'notify-flash notify-blink-rose'
    : flashSubmissions
    ? 'notify-flash notify-blink-emerald'
    : flashQuestions
    ? 'notify-flash notify-blink-amber'
    : undefined;
  const todayEmpty =
    todayEtuts.length === 0 && dueSoon.length === 0 && unread.length === 0 && recentSubmissions.length === 0 && recentQuestionEntries.length === 0;

  return (
    <div className="space-y-6 @container" id="teacher-home">
      {/* ===== Selamlama ve hızlı işlemler ===== */}
      <div className="flex flex-col @3xl:flex-row @3xl:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{longDate(todayStr)} · {branch}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg mt-1">
            {timeGreeting()} {firstName ? `${firstName} öğretmenim` : 'öğretmenim'}
          </h1>
        </div>
        {/* Aşama 32: yatay kaydırma kutusu zilin rozetini ve açılır listesini kesiyordu; artık satır sarar */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" id="home-action-homework" className="ui-btn ui-btn-primary shrink-0" onClick={() => go('homework', ['action', 'homework-create', ''])}>
            <Plus className="w-4 h-4" /> Ödev Oluştur
          </button>
          <button type="button" id="home-action-etut" className="ui-btn ui-btn-secondary shrink-0" onClick={() => go('etuts', ['action', 'etut-create', ''])}>
            <CalendarPlus className="w-4 h-4" /> Etüt Planla
          </button>
          <button type="button" id="home-action-student" className="ui-btn ui-btn-secondary shrink-0" onClick={() => go('students', ['action', 'student-create', ''])}>
            <UserPlus className="w-4 h-4" /> Öğrenci Ekle
          </button>
          <div className="shrink-0">
            <TeacherEtutBell etuts={etuts} students={students} onOpenEtutsTab={() => go('etuts')} />
          </div>
          {onOpenStudentView && (
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-icon shrink-0"
              onClick={onOpenStudentView}
              title="Öğrencilerin gördüğü ekranı incele"
              aria-label="Öğrenci görünümünü incele"
            >
              <Eye className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Aşama 34: telefon bildirimleri (kapalıysa açma kartı, açıksa tek satır) */}
      <PushOptInCard role="teacher" />

      {/* ===== Özet kartları ===== */}
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          id="home-stat-homework"
          label="Aktif Ödev"
          value={activeHomeworks.length}
          hint={nextDue ? `En yakın: ${nextDue.dueDate.slice(0, 10) === todayStr ? 'bugün' : longDate(nextDue.dueDate.slice(0, 10))}` : 'Yaklaşan ödev yok'}
          icon={BookOpen}
          tone="success"
          onClick={() => go('homework')}
        />
        <StatCard
          id="home-stat-rate"
          label="Teslim Oranı"
          value={`%${rate}`}
          hint={`${doneTotal} teslim · ${Math.max(0, expectedTotal - doneTotal)} bekliyor`}
          icon={CheckCircle2}
          tone="brand"
          onClick={() => go('homework')}
        />
        <StatCard
          id="home-stat-etut"
          label="Bu Hafta Etüt"
          value={weekEtuts.length}
          hint={todayEtuts.length ? `Bugün ${todayEtuts.length} etüt` : 'Bugün etüt yok'}
          icon={CalendarDays}
          tone="info"
          onClick={() => go('etuts')}
        />
        <StatCard
          id="home-stat-question"
          label="Bu Hafta Soru"
          value={weekQuestions.toLocaleString('tr-TR')}
          hint={`${weekActiveStudents} öğrenci çözüm girdi`}
          icon={Target}
          tone="warning"
          onClick={() => go('question_tracking')}
        />
      </div>

      {/* Aşama 64: "Bugün" ve takvim eşit genişlikte, yan yana aynı yükseklikte (simetrik) */}
      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 sm:gap-6 items-stretch" id="home-today-agenda">
        {/* ===== BUGÜN ===== */}
        <div className="min-w-0 flex flex-col">
        <Panel
          id="home-today-panel"
          className={cx('flex-1 flex flex-col', todayFlash)}
          bodyClassName="flex-1 min-h-0 @4xl:max-h-[46rem] @4xl:overflow-y-auto"
          icon={Sun}
          tone="warning"
          title="Bugün"
          description={summaryParts.length ? summaryParts.join(' · ') : 'Planlanmış bir iş yok'}
          actions={
            unread.length > 0 || unseenSubmissions.length > 0 || unseenQuestionEntries.length > 0 ? (
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                {unread.length > 0 && <span className="notify-badge notify-blink-rose">{unread.length} yeni mesaj</span>}
                {unseenSubmissions.length > 0 && <span className="notify-badge notify-blink-emerald">{unseenSubmissions.length} yeni teslim</span>}
                {unseenQuestionEntries.length > 0 && <span className="notify-badge notify-blink-amber">{unseenQuestionEntries.length} yeni giriş</span>}
              </span>
            ) : undefined
          }
        >
          {todayEmpty ? (
            <EmptyState
              icon={CheckCircle2}
              title="Bugün için bekleyen bir şey yok"
              description={
                nextEtut
                  ? `Sıradaki etüt: ${longDate(nextEtut.date)} ${nextEtut.time || ''} · ${nextEtut.subject}`
                  : 'Yeni bir ödev veya etüt planlayabilirsiniz.'
              }
              className="py-8"
            />
          ) : (
            <div className="space-y-5">
              {/* Etütler */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="ui-eyebrow">Etütler</h3>
                  <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('etuts')}>
                    Tümü
                  </button>
                </div>
                {todayEtuts.length === 0 ? (
                  <p className="text-sm text-muted">
                    Bugün etüt yok.
                    {nextEtut && ` Sıradaki: ${longDate(nextEtut.date)} ${nextEtut.time || ''}, ${nextEtut.subject}.`}
                  </p>
                ) : (
                  <StackGroup
                    id="home-stack-etuts"
                    noun="etüt"
                    tone="info"
                    items={todayEtuts.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => go('etuts')}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors"
                        >
                          <span className="ui-chip ui-chip-info tabular-nums text-xs px-2.5 py-1">{e.time || '—'}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-fg truncate">
                              {e.subject}
                              {e.topic ? ` – ${e.topic}` : ''}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted mt-0.5">
                              {/* Aşama 32: etüt öğretmeni */}
                              {etutTeacherNames(e).length > 0 && (
                                <span className="inline-flex items-center gap-1 font-semibold text-fg-2" data-etut-teacher>
                                  <User className="w-3.5 h-3.5" /> {etutTeacherNames(e).join(', ')}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" /> {etutStudentCount(e)}
                              </span>
                              {e.location && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <MapPin className="w-3.5 h-3.5" /> {e.location}
                                </span>
                              )}
                              {e.duration ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" /> {e.duration} dk
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                    ))}
                  />
                )}
              </section>

              {/* Teslimi yaklaşan ödevler */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="ui-eyebrow">Bugün ve yarın teslim</h3>
                  <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('homework')}>
                    Tümü
                  </button>
                </div>
                {dueSoon.length === 0 ? (
                  <p className="text-sm text-muted">Bugün ve yarın teslim edilecek ödev yok.</p>
                ) : (
                  <StackGroup
                    id="home-stack-due"
                    noun="ödev teslimi"
                    tone="success"
                    items={dueSoon.map((h) => {
                      const exp = expectedFor(h);
                      const done = doneFor(h.id);
                      const pct = exp ? Math.round((done / exp) * 100) : 0;
                      const isToday = h.dueDate.slice(0, 10) === todayStr;
                      return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => go('homework', ['homework', h.id, h.title])}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors"
                          >
                            <IconBox icon={BookOpen} tone="success" size="sm" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-fg truncate">{h.title}</span>
                              <span className="block text-xs text-muted">
                                {h.subject} · {isToday ? 'Bugün' : 'Yarın'}
                                {h.dueDate.includes('T') ? ` ${h.dueDate.slice(11, 16)}` : ''}
                              </span>
                            </span>
                            <span className="w-24 shrink-0 text-right">
                              <span className="block text-xs font-semibold text-fg tabular-nums">
                                {done}/{exp} teslim
                              </span>
                              <span className="mt-1 block h-1.5 rounded-full bg-surface-3 overflow-hidden">
                                <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                              </span>
                            </span>
                          </button>
                      );
                    })}
                  />
                )}
              </section>

              {/* Aşama 64: Yeni ödev teslimleri (son 3 gün; eskiden ayrı kutuydu) */}
              <section id="home-new-submissions">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                  <h3 className="ui-eyebrow flex items-center gap-2">
                    Yeni ödev teslimleri
                    {unseenSubmissions.length > 0 && <span className="notify-badge notify-blink-emerald">{unseenSubmissions.length} yeni</span>}
                  </h3>
                  <span className="flex items-center gap-3">
                    {unseenSubmissions.length > 0 && (
                      <button
                        type="button"
                        id="home-submissions-mark-all"
                        className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
                        onClick={() => markSubsSeen(recentSubmissions.map((e) => e.id))}
                      >
                        Tümünü okundu yap
                      </button>
                    )}
                    <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('homework')}>
                      Tümü
                    </button>
                  </span>
                </div>
                {recentSubmissions.length === 0 ? (
                  <p className="text-sm text-muted">Son 3 günde ödev teslimi yok.</p>
                ) : (
                  <StackGroup
                    id="home-stack-submissions"
                    noun="ödev teslimi"
                    tone="success"
                    items={recentSubmissions.slice(0, 30).map((e) => {
                      const isNew = !seenSubIds.has(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          data-submission={e.id}
                          onClick={() => {
                            markSubsSeen([e.id]);
                            go('homework', ['homework', e.homeworkId, e.title]);
                          }}
                          title={`${e.name} — ${e.title}`}
                          className={cx(
                            'w-full flex items-center gap-3 p-3 rounded-xl border border-transparent bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors',
                            isNew && 'notify-blink notify-blink-emerald'
                          )}
                        >
                          <IconBox icon={ClipboardCheck} tone="success" size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className={cx('block text-sm text-fg truncate', isNew ? 'font-bold' : 'font-medium')}>
                              {e.name} <span className="font-normal text-muted">teslim etti</span>
                              {e.className ? <span className="font-normal text-muted"> · {e.className}</span> : null}
                            </span>
                            <span className="block text-xs text-muted truncate">
                              {e.title} · {whenText(e.submittedAt)}
                              {e.late ? ' · geç teslim' : ''}
                            </span>
                          </span>
                          <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
                        </button>
                      );
                    })}
                    moreText={recentSubmissions.length > 30 ? `ve ${recentSubmissions.length - 30} teslim daha — Ödevler'e gidin` : undefined}
                  />
                )}
              </section>

              {/* Aşama 64: Öğrenci soru girişleri (son 3 gün; eskiden ayrı kutuydu). Ada tıklayınca öğrencinin Soru Takibi sayfası */}
              <section id="home-question-entries">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
                  <h3 className="ui-eyebrow flex items-center gap-2">
                    Öğrenci soru girişleri
                    {unseenQuestionEntries.length > 0 && <span className="notify-badge notify-blink-amber">{unseenQuestionEntries.length} yeni</span>}
                  </h3>
                  <span className="flex items-center gap-3">
                    {unseenQuestionEntries.length > 0 && (
                      <button
                        type="button"
                        id="home-qentries-mark-all"
                        className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
                        onClick={() => markQLogsSeen(recentQuestionEntries.map((e) => e.id))}
                      >
                        Tümünü okundu yap
                      </button>
                    )}
                    <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('question_tracking')}>
                      Tümü
                    </button>
                  </span>
                </div>
                {recentQuestionEntries.length === 0 ? (
                  <p className="text-sm text-muted">Son 3 günde soru girişi yok.</p>
                ) : (
                  <StackGroup
                    id="home-stack-questions"
                    noun="soru girişi"
                    tone="warning"
                    items={recentQuestionEntries.slice(0, 30).map((e) => {
                      const isNew = !seenQLogIds.has(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          data-qentry={e.studentId}
                          onClick={() => {
                            markQLogsSeen([e.id]);
                            go('question_tracking', ['student', e.studentId, e.name]);
                          }}
                          title={`${e.name} — Soru Takibi sayfasını aç`}
                          className={cx(
                            'w-full flex items-center gap-3 p-3 rounded-xl border border-transparent bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors',
                            isNew && 'notify-blink notify-blink-amber'
                          )}
                        >
                          <IconBox icon={HelpCircle} tone="warning" size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className={cx('block text-sm text-fg truncate', isNew ? 'font-bold' : 'font-medium')}>
                              <span className="underline decoration-dotted underline-offset-2">{e.name}</span> {e.total} soru girdi
                              {e.className ? <span className="font-normal text-muted"> · {e.className}</span> : null}
                            </span>
                            <span className="block text-xs text-muted truncate">
                              {whenText(e.createdAt)}
                              {e.subjects.length ? ` · ${e.subjects.slice(0, 3).join(', ')}${e.subjects.length > 3 ? ` +${e.subjects.length - 3}` : ''}` : ''}
                            </span>
                          </span>
                          <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
                        </button>
                      );
                    })}
                    moreText={recentQuestionEntries.length > 30 ? `ve ${recentQuestionEntries.length - 30} giriş daha — Soru Takibi'ne gidin` : undefined}
                  />
                )}
              </section>

              {/* Okunmamış mesajlar */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="ui-eyebrow">Okunmamış mesajlar</h3>
                  <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('messages')}>
                    Tümü
                  </button>
                </div>
                {unread.length === 0 ? (
                  <p className="text-sm text-muted">Okunmamış mesaj yok.</p>
                ) : (
                  <StackGroup
                    id="home-stack-messages"
                    noun="okunmamış mesaj"
                    tone="danger"
                    items={unread.slice(0, 30).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => go('messages')}
                          className="notify-blink notify-blink-rose w-full flex items-center gap-3 p-3 rounded-xl border border-transparent bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors"
                        >
                          <IconBox icon={MessageSquare} tone="danger" size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-fg truncate">
                              {m.studentName}
                              <span className="font-normal text-muted"> · {m.studentClass}</span>
                            </span>
                            <span className="block text-xs text-muted truncate">{m.text}</span>
                          </span>
                          <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
                        </button>
                    ))}
                    moreText={unread.length > 30 ? `ve ${unread.length - 30} mesaj daha — Mesajlar'a gidin` : undefined}
                  />
                )}
              </section>
            </div>
          )}
        </Panel>

        </div>

        {/* ===== AJANDA ===== */}
        <AgendaCalendar className="min-w-0 h-full flex flex-col" etuts={etuts} homeworks={homeworks} todayStr={todayStr} onOpen={go} />
      </div>

      {classes.length === 0 && (
        <p className="text-xs text-muted text-center">
          Henüz size tanımlı sınıf yok. Yöneticiniz sınıf izni verdiğinde öğrencileriniz burada görünecek.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// İç içe bildirim yığını (Aşama 30)
// Aynı bölümde 3'ten fazla bildirim varsa kartlar üst üste (iç içe) gösterilir: en üstte listenin ilk
// bildirimi (etütte en erken saat, ödevde en yakın teslim, mesajda en yeni mesaj), arkasında katmanlar ve "+N" rozeti. Yığına tıklayınca hepsi açılır, istenen seçilir.
// 3 ya da daha az bildirim normal liste olarak görünür.
// ---------------------------------------------------------------------------
const STACK_LIMIT = 3;
const STACK_TONE: Record<'info' | 'success' | 'danger' | 'warning', string> = {
  info: 'bg-sky-600',
  warning: 'bg-amber-600',
  success: 'bg-emerald-600',
  danger: 'bg-rose-600',
};

const StackGroup: React.FC<{
  id: string;
  /** "etüt", "ödev teslimi", "okunmamış mesaj" */
  noun: string;
  tone: 'info' | 'success' | 'danger' | 'warning';
  items: React.ReactElement[];
  moreText?: string;
}> = ({ id, noun, tone, items, moreText }) => {
  const [open, setOpen] = useState(false);
  const count = items.length;

  if (count <= STACK_LIMIT || open) {
    return (
      <div id={id} data-stack={count > STACK_LIMIT ? 'open' : 'list'}>
        <ul className="space-y-2">
          {items.map((node) => (
            <li key={String(node.key)}>{node}</li>
          ))}
          {moreText && <li className="text-xs text-muted pl-1">{moreText}</li>}
        </ul>
        {count > STACK_LIMIT && (
          <button
            type="button"
            id={`${id}-collapse`}
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" /> Daralt
          </button>
        )}
      </div>
    );
  }

  const expand = () => setOpen(true);
  return (
    <div id={id} data-stack="closed" className="pb-3">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`${count} ${noun} — tümünü göstermek için tıklayın`}
        onClick={expand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            expand();
          }
        }}
        className="relative block cursor-pointer group rounded-xl focus-visible:outline-2 focus-visible:outline-brand"
      >
        {/* Arkadaki katmanlar: iç içe geçmiş kartlar görünümü */}
        <span aria-hidden className="absolute inset-x-4 -bottom-3 h-full rounded-xl bg-surface-3 border border-line shadow-sm" />
        <span aria-hidden className="absolute inset-x-2 -bottom-1.5 h-full rounded-xl bg-surface-2 border border-line shadow-sm" />
        {/* En üstteki (ilk) bildirim — yığın kapalıyken yalnızca önizleme, tıklama yığını açar */}
        <div className="relative transition-transform group-hover:-translate-y-0.5" inert>
          {items[0]}
        </div>
        <span
          className={cx(
            'absolute -top-2 -right-2 z-10 min-w-[1.75rem] h-7 px-2 rounded-full text-white text-xs font-black flex items-center justify-center shadow-md ring-2 ring-surface',
            STACK_TONE[tone]
          )}
        >
          +{count - 1}
        </span>
      </div>
      <button
        type="button"
        id={`${id}-expand`}
        onClick={expand}
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
      >
        <ChevronDown className="w-3.5 h-3.5" /> {count} {noun} — tümünü göster
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Aylık ajanda: etüt ve ödev teslim günleri işaretli
// ---------------------------------------------------------------------------
const AgendaCalendar: React.FC<{
  etuts: Etut[];
  homeworks: Homework[];
  todayStr: string;
  className?: string;
  onOpen: (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;
}> = ({ etuts, homeworks, todayStr, className, onOpen }) => {
  const [ty, tm] = todayStr.split('-').map(Number);
  const [viewYear, setViewYear] = useState(ty);
  const [viewMonth, setViewMonth] = useState(tm - 1);
  const [selected, setSelected] = useState(todayStr);

  const etutDays = useMemo(() => new Set(etuts.map((e) => e.date)), [etuts]);
  const hwDays = useMemo(() => new Set(homeworks.filter((h) => h.dueDate).map((h) => h.dueDate.slice(0, 10))), [homeworks]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i);
      return { date: ymd(d), day: d.getDate(), inMonth: d.getMonth() === viewMonth };
    }).filter((c, i, arr) => i < 35 || arr.slice(35).some((x) => x.inMonth));
  }, [viewYear, viewMonth]);

  const shift = (n: number) => {
    const d = new Date(viewYear, viewMonth + n, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const isCurrentMonth = viewYear === ty && viewMonth === tm - 1;

  const dayEtuts = etuts.filter((e) => e.date === selected).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const dayHws = homeworks.filter((h) => h.dueDate && h.dueDate.slice(0, 10) === selected);

  return (
    <Panel
      id="home-agenda"
      className={className}
      bodyClassName="flex-1 min-h-0 flex flex-col"
      icon={CalendarDays}
      tone="brand"
      title={`${MONTHS[viewMonth]} ${viewYear}`}
      description="Ajanda"
      actions={
        <div className="flex items-center gap-1">
          {!isCurrentMonth && (
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-sm"
              onClick={() => {
                setViewYear(ty);
                setViewMonth(tm - 1);
                setSelected(todayStr);
              }}
            >
              Bugün
            </button>
          )}
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => shift(-1)} aria-label="Önceki ay">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => shift(1)} aria-label="Sonraki ay">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-7 text-center mb-1">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="text-[11px] font-semibold text-subtle py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const isToday = c.date === todayStr;
          const isSel = c.date === selected;
          const hasE = etutDays.has(c.date);
          const hasH = hwDays.has(c.date);
          return (
            <button
              key={c.date}
              type="button"
              onClick={() => setSelected(c.date)}
              aria-pressed={isSel}
              className={cx(
                'relative h-10 rounded-lg flex flex-col items-center justify-center text-sm tabular-nums cursor-pointer transition-colors',
                isSel ? 'bg-brand text-white font-semibold' : isToday ? 'bg-brand-soft text-brand-fg font-semibold' : 'hover:bg-surface-2',
                !isSel && !isToday && (c.inMonth ? 'text-fg-2' : 'text-subtle/60')
              )}
            >
              {c.day}
              {(hasE || hasH) && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {hasE && <span className={cx('w-1 h-1 rounded-full', isSel ? 'bg-white' : 'bg-info')} />}
                  {hasH && <span className={cx('w-1 h-1 rounded-full', isSel ? 'bg-white' : 'bg-warning')} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-info" /> Etüt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Ödev teslimi
        </span>
      </div>

      <div className="ui-divider mt-3 pt-3 flex-1 min-h-0 flex flex-col">
        <p className="text-xs font-semibold text-fg-2 mb-2">
          {longDate(selected)}
          {selected === todayStr && <span className="ui-chip ui-chip-brand ml-2">Bugün</span>}
        </p>
        {dayEtuts.length === 0 && dayHws.length === 0 ? (
          <p className="text-xs text-muted">Bu gün için kayıt yok.</p>
        ) : (
          <ul className="space-y-1.5 flex-1 min-h-0 max-h-40 @4xl:max-h-none overflow-y-auto">
            {dayEtuts.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen('etuts')}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2 text-left text-xs cursor-pointer"
                >
                  <span className="ui-chip ui-chip-info tabular-nums">{e.time || '—'}</span>
                  <span className="flex-1 truncate text-fg">
                    {e.subject}
                    {e.topic ? ` – ${e.topic}` : ''}
                  </span>
                </button>
              </li>
            ))}
            {dayHws.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onOpen('homework', ['homework', h.id, h.title])}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-2 text-left text-xs cursor-pointer"
                >
                  <span className="ui-chip ui-chip-warning">Teslim</span>
                  <span className="flex-1 truncate text-fg">
                    {h.subject}: {h.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
};
