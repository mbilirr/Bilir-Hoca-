import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
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
import { KurumNameBadge } from './KurumNameBadge';

// ============================================================================
// ÖĞRETMEN ANA SAYFASI (Aşama 8)
// Selamlama + hızlı işlemler, "Bugün" özeti, özet kartlar ve aylık ajanda.
// Aşama 98:
//  * Düğmeler, kartlar ve bağlantılar kurum bölümüne / role uyar (kapalı bölüm görünmez; idare ödev oluşturmaz).
//  * "Bugün" sekmeli ve sade: Etütler / Ödevler / Teslimler / Sorular / Mesajlar — her sekmede en çok 6-8 kayıt
//    ve "+N daha". Etütler saate göre gruplanır. Başkalarının çalışmasını görenlerde "Benim / Kurumun" seçimi.
//  * Tarih dizini bir kez kurulur (etüt / ödev günleri); takvimin gün listesi en çok 8 kayıt.
//  * İdare (kurum yöneticisi, Müdür, Müdür Yrd.) üstte Kurum Özeti'ni görür (ayrı dosya, yalnızca idarede yüklenir).
// ============================================================================

const KurumOzeti = lazy(() => import('./KurumOzeti').then((m) => ({ default: m.KurumOzeti })));

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const LIST_LIMIT = 6; // bir sekmede gösterilen kayıt
const ETUT_LIMIT = 8; // etütler saat gruplarıyla daha sıkı
const DAY_LIMIT = 8; // takvimde seçili günün listesi
const SCOPE_KEY = 'edu_home_scope_v1';

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
const byTime = (a: Etut, b: Etut) => (a.time || '').localeCompare(b.time || '');

type TodayTab = 'etut' | 'odev' | 'teslim' | 'soru' | 'mesaj';
type Scope = 'mine' | 'all';
type Go = (tab: TeacherTabType, focus?: Parameters<typeof setQuickFocus>) => void;

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

const readScope = (fallback: Scope): Scope => {
  try {
    const v = window.localStorage.getItem(SCOPE_KEY);
    return v === 'mine' || v === 'all' ? v : fallback;
  } catch {
    return fallback;
  }
};

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

  // --- Aşama 98: bölüm / rol izinleri (veritabanı ayrıca denetler)
  const can = {
    homework: dataService.canUseTab('homework'),
    etuts: dataService.canUseTab('etuts'),
    questions: dataService.canUseTab('question_tracking'),
    messages: dataService.canUseTab('messages'),
    students: dataService.canUseTab('students'),
  };
  const canGiveHomework = dataService.canGiveHomework();
  const canPlanEtut = dataService.canPlanEtut();
  const canAddStudent = can.students && dataService.canManageStudents();
  const idare = dataService.showsKurumOzeti();
  const canScope = dataService.seesOthersWork();
  const [scope, setScopeState] = useState<Scope>(() => (canScope ? readScope(idare ? 'all' : 'mine') : 'all'));
  const setScope = (s: Scope) => {
    setScopeState(s);
    try {
      window.localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* depolama kapalı */
    }
  };
  const mineOnly = canScope && scope === 'mine';

  // --- Aşama 28/29: yeni gelen bilgiler (soru girişi, ödev teslimi) ---
  const teacherKey = currentTeacher?.id || 'x';
  const [seenQLogIds, markQLogsSeen] = useSeenIds(`tchr_qlog_seen_${teacherKey}`);
  const [seenSubIds, markSubsSeen] = useSeenIds(`tchr_sub_seen_${teacherKey}`);

  // Gün değişince (gece yarısı) yeniden hesaplanır; her çizimde yeni tarih nesnesi kurulmaz
  const todayStr = ymd(new Date());
  const dates = useMemo(() => {
    const now = new Date();
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    return {
      tomorrow: ymd(addDays(now, 1)),
      yesterday: ymd(addDays(now, -1)),
      weekStart: ymd(monday),
      weekEnd: ymd(addDays(monday, 6)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

  const go: Go = useCallback(
    (tab, focus) => {
      onNavigateTab(tab);
      window.scrollTo({ top: 0 });
      if (focus) setTimeout(() => setQuickFocus(...focus), 0);
    },
    [onNavigateTab]
  );

  // --- Kapsam: "Benim" ise yalnızca kendi etüt / ödevlerim
  const scopedEtuts = useMemo(() => (can.etuts ? (mineOnly ? etuts.filter((e) => dataService.isMine(e)) : etuts) : []), [etuts, mineOnly, can.etuts]);
  const scopedHomeworks = useMemo(
    () => (can.homework ? (mineOnly ? homeworks.filter((h) => dataService.isMine(h)) : homeworks) : []),
    [homeworks, mineOnly, can.homework]
  );

  // --- Tarih dizini (bir kez): gün → etütler (saate göre), gün → teslim tarihi o gün olan ödevler
  const etutByDay = useMemo(() => {
    const m = new Map<string, Etut[]>();
    for (const e of scopedEtuts) {
      const l = m.get(e.date);
      if (l) l.push(e);
      else m.set(e.date, [e]);
    }
    m.forEach((l) => l.sort(byTime));
    return m;
  }, [scopedEtuts]);
  const hwByDay = useMemo(() => {
    const m = new Map<string, Homework[]>();
    for (const h of scopedHomeworks) {
      if (!h.dueDate) continue;
      const d = h.dueDate.slice(0, 10);
      const l = m.get(d);
      if (l) l.push(h);
      else m.set(d, [h]);
    }
    return m;
  }, [scopedHomeworks]);

  // Aşama 15: sınıf mevcutları ve teslim sayıları bir kez sayılır
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
  const expectedFor = useCallback(
    (hw: Homework) => {
      if (Array.isArray(hw.assignedTo)) return hw.assignedTo.length;
      if (hw.targetClassIds && hw.targetClassIds.length) return Array.from(new Set(hw.targetClassIds)).reduce((n, id) => n + (classSize.get(id) || 0), 0);
      if (hw.classId) return classSize.get(hw.classId) || 0;
      return students.length;
    },
    [classSize, students.length]
  );
  const doneFor = (hwId: string) => doneByHw.get(hwId) || 0;

  // --- Bugün ---
  const todayEtuts = etutByDay.get(todayStr) || [];
  const nextEtut = useMemo(() => {
    let best: Etut | undefined;
    for (const e of scopedEtuts) {
      if (e.date <= todayStr) continue;
      if (!best || (e.date + (e.time || '')).localeCompare(best.date + (best.time || '')) < 0) best = e;
    }
    return best;
  }, [scopedEtuts, todayStr]);
  const dueSoon = useMemo(
    () => [...(hwByDay.get(todayStr) || []), ...(hwByDay.get(dates.tomorrow) || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [hwByDay, todayStr, dates.tomorrow]
  );
  const unread = useMemo(
    // Aşama 116: üst menü rozeti ve Mesajlar sayfasıyla aynı kural (yalnız bana gelen + alıcısız genel okunmamışlar)
    () =>
      can.messages
        ? messages.filter((m) => !m.read && dataService.isMessageForMe(m)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        : [],
    [messages, can.messages]
  );
  const studentById = useMemo(() => new Map(students.map((st) => [st.id, st] as const)), [students]);
  // Son 3 günde girilen soru kayıtları (en yeni üstte)
  const recentQuestionEntries = useMemo(() => {
    if (!can.questions) return [];
    const cutoff = Date.now() - 3 * 86400000;
    return questionLogs
      .filter((l) => (l.totalQuestions || 0) > 0 && studentById.has(l.studentId) && new Date(l.createdAt || 0).getTime() >= cutoff)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((l) => ({
        id: l.id,
        studentId: l.studentId,
        name: studentById.get(l.studentId)?.name || l.studentName,
        className: studentById.get(l.studentId)?.className || l.className,
        total: l.totalQuestions || 0,
        createdAt: l.createdAt,
        subjects: Array.from(new Set((l.entries || []).filter((e) => (e.questionCount || 0) > 0).map((e) => e.subject))),
      }));
  }, [questionLogs, studentById, can.questions]);
  const unseenQuestionEntries = useMemo(() => recentQuestionEntries.filter((e) => !seenQLogIds.has(e.id)), [recentQuestionEntries, seenQLogIds]);

  // Son 3 günde teslim edilen ödevler (kapsamdaki ödevlerin teslimleri; en yeni üstte)
  const recentSubmissions = useMemo(() => {
    if (!can.homework) return [];
    const cutoff = Date.now() - 3 * 86400000;
    const hwById = new Map(scopedHomeworks.map((h) => [h.id, h] as const));
    return submissions
      .filter(
        (sub) =>
          (sub.status === 'on_time' || sub.status === 'late') &&
          studentById.has(sub.studentId) &&
          hwById.has(sub.homeworkId) &&
          new Date(sub.submittedAt || 0).getTime() >= cutoff
      )
      .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
      .map((sub) => ({
        id: `${sub.id}@${sub.submittedAt || ''}`,
        homeworkId: sub.homeworkId,
        title: hwById.get(sub.homeworkId)?.title || 'Ödev',
        name: studentById.get(sub.studentId)?.name || sub.studentName,
        className: studentById.get(sub.studentId)?.className || '',
        late: sub.status === 'late',
        submittedAt: sub.submittedAt,
      }));
  }, [submissions, studentById, scopedHomeworks, can.homework]);
  const unseenSubmissions = useMemo(() => recentSubmissions.filter((e) => !seenSubIds.has(e.id)), [recentSubmissions, seenSubIds]);

  const flashQuestions = useArrivalFlash(unseenQuestionEntries.length);
  const flashMessages = useArrivalFlash(unread.length);
  const flashSubmissions = useArrivalFlash(unseenSubmissions.length);
  const whenText = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const day = ymd(d);
    if (day === todayStr) return `bugün ${hm}`;
    if (day === dates.yesterday) return `dün ${hm}`;
    return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${hm}`;
  };

  // --- Özet kartları (bir kez hesaplanır)
  const stats = useMemo(() => {
    let active = 0;
    let nextDue: Homework | undefined;
    let expectedTotal = 0;
    let doneTotal = 0;
    for (const h of scopedHomeworks) {
      expectedTotal += expectedFor(h);
      doneTotal += doneByHw.get(h.id) || 0;
      if (h.dueDate && h.dueDate.slice(0, 10) >= todayStr) {
        active++;
        if (!nextDue || h.dueDate < nextDue.dueDate) nextDue = h;
      }
    }
    let weekEtuts = 0;
    etutByDay.forEach((l, d) => {
      if (d >= dates.weekStart && d <= dates.weekEnd) weekEtuts += l.length;
    });
    let weekQuestions = 0;
    const activeStudents = new Set<string>();
    for (const l of questionLogs) {
      if (l.date < dates.weekStart || l.date > dates.weekEnd || (studentById.size && !studentById.has(l.studentId))) continue;
      weekQuestions += l.totalQuestions || 0;
      if ((l.totalQuestions || 0) > 0) activeStudents.add(l.studentId);
    }
    return {
      active,
      nextDue,
      expectedTotal,
      doneTotal,
      rate: expectedTotal > 0 ? Math.min(100, Math.round((doneTotal / expectedTotal) * 100)) : 0,
      weekEtuts,
      weekQuestions,
      weekActiveStudents: activeStudents.size,
    };
  }, [scopedHomeworks, expectedFor, doneByHw, todayStr, etutByDay, dates.weekStart, dates.weekEnd, questionLogs, studentById]);

  const firstName = firstNameOf(currentTeacher?.name, '');
  const branch = idare
    ? 'Kurum Yönetimi'
    : currentTeacher?.branch
      ? currentTeacher.branch.includes('Öğretmen')
        ? currentTeacher.branch
        : `${currentTeacher.branch} Öğretmeni`
      : 'Öğretmen';

  // --- "Bugün" sekmeleri (yalnızca açık bölümler)
  const tabs = useMemo(() => {
    const list: Array<{ key: TodayTab; label: string; icon: React.ComponentType<{ className?: string }>; count: number; fresh: number }> = [];
    if (can.etuts) list.push({ key: 'etut', label: 'Etütler', icon: CalendarDays, count: todayEtuts.length, fresh: 0 });
    if (can.homework) list.push({ key: 'odev', label: 'Ödevler', icon: BookOpen, count: dueSoon.length, fresh: 0 });
    if (can.homework) list.push({ key: 'teslim', label: 'Teslimler', icon: ClipboardCheck, count: recentSubmissions.length, fresh: unseenSubmissions.length });
    if (can.questions) list.push({ key: 'soru', label: 'Sorular', icon: HelpCircle, count: recentQuestionEntries.length, fresh: unseenQuestionEntries.length });
    if (can.messages) list.push({ key: 'mesaj', label: 'Mesajlar', icon: MessageSquare, count: unread.length, fresh: unread.length });
    return list;
  }, [can.etuts, can.homework, can.questions, can.messages, todayEtuts.length, dueSoon.length, recentSubmissions.length, unseenSubmissions.length, recentQuestionEntries.length, unseenQuestionEntries.length, unread.length]);
  const [tabPick, setTab] = useState<TodayTab | null>(null);
  // Kullanıcı seçmediyse: önce yeni bilgi olan, yoksa kaydı olan ilk sekme
  const tab: TodayTab | null =
    (tabPick && tabs.some((t) => t.key === tabPick) ? tabPick : null) ||
    tabs.find((t) => t.fresh > 0)?.key ||
    tabs.find((t) => t.count > 0)?.key ||
    tabs[0]?.key ||
    null;

  const summaryParts = [
    todayEtuts.length ? `${todayEtuts.length} etüt` : '',
    dueSoon.length ? `${dueSoon.length} ödev teslimi` : '',
    unread.length ? `${unread.length} okunmamış mesaj` : '',
    unseenSubmissions.length ? `${unseenSubmissions.length} yeni teslim` : '',
    unseenQuestionEntries.length ? `${unseenQuestionEntries.length} yeni soru girişi` : '',
  ].filter(Boolean);
  const todayFlash = flashMessages
    ? 'notify-flash notify-blink-rose'
    : flashSubmissions
      ? 'notify-flash notify-blink-emerald'
      : flashQuestions
        ? 'notify-flash notify-blink-amber'
        : undefined;

  const statCards = [
    can.homework && (
      <StatCard
        key="hw"
        id="home-stat-homework"
        label="Aktif Ödev"
        value={stats.active}
        hint={stats.nextDue ? `En yakın: ${stats.nextDue.dueDate.slice(0, 10) === todayStr ? 'bugün' : longDate(stats.nextDue.dueDate.slice(0, 10))}` : 'Yaklaşan ödev yok'}
        icon={BookOpen}
        tone="success"
        onClick={() => go('homework')}
      />
    ),
    can.homework && (
      <StatCard
        key="rate"
        id="home-stat-rate"
        label="Teslim Oranı"
        value={`%${stats.rate}`}
        hint={`${stats.doneTotal} teslim · ${Math.max(0, stats.expectedTotal - stats.doneTotal)} bekliyor`}
        icon={CheckCircle2}
        tone="brand"
        onClick={() => go('homework')}
      />
    ),
    can.etuts && (
      <StatCard
        key="etut"
        id="home-stat-etut"
        label="Bu Hafta Etüt"
        value={stats.weekEtuts}
        hint={todayEtuts.length ? `Bugün ${todayEtuts.length} etüt` : 'Bugün etüt yok'}
        icon={CalendarDays}
        tone="info"
        onClick={() => go('etuts')}
      />
    ),
    can.questions && (
      <StatCard
        key="q"
        id="home-stat-question"
        label="Bu Hafta Soru"
        value={stats.weekQuestions.toLocaleString('tr-TR')}
        hint={`${stats.weekActiveStudents} öğrenci çözüm girdi`}
        icon={Target}
        tone="warning"
        onClick={() => go('question_tracking')}
      />
    ),
  ].filter(Boolean) as React.ReactElement[];

  const showAgenda = can.etuts || can.homework;

  return (
    <div className="space-y-6 @container" id="teacher-home">
      {/* ===== Selamlama ve hızlı işlemler ===== */}
      <div className="flex flex-col @3xl:flex-row @3xl:items-end justify-between gap-4">
        <div className="min-w-0">
          <KurumNameBadge />
          <p className="text-sm text-muted">
            {longDate(todayStr)} · {branch}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg mt-1">
            {timeGreeting()} {idare ? firstName || '' : firstName ? `${firstName} öğretmenim` : 'öğretmenim'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canGiveHomework && (
            <button type="button" id="home-action-homework" className="ui-btn ui-btn-primary shrink-0" onClick={() => go('homework', ['action', 'homework-create', ''])}>
              <Plus className="w-4 h-4" /> Ödev Oluştur
            </button>
          )}
          {canPlanEtut && (
            <button type="button" id="home-action-etut" className="ui-btn ui-btn-secondary shrink-0" onClick={() => go('etuts', ['action', 'etut-create', ''])}>
              <CalendarPlus className="w-4 h-4" /> Etüt Planla
            </button>
          )}
          {canAddStudent && (
            <button type="button" id="home-action-student" className="ui-btn ui-btn-secondary shrink-0" onClick={() => go('students', ['action', 'student-create', ''])}>
              <UserPlus className="w-4 h-4" /> Öğrenci Ekle
            </button>
          )}
          {can.etuts && (
            <div className="shrink-0">
              <TeacherEtutBell etuts={etuts} students={students} onOpenEtutsTab={() => go('etuts')} />
            </div>
          )}
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

      <PushOptInCard role="teacher" />

      {/* ===== Aşama 98: idare için Kurum Özeti ===== */}
      {idare && (
        <Suspense fallback={<div className="ui-card ui-card-pad text-xs text-muted">Kurum özeti hazırlanıyor…</div>}>
          <KurumOzeti etuts={etuts} homeworks={homeworks} submissions={submissions} students={students} classes={classes} messages={messages} onGo={go} />
        </Suspense>
      )}

      {/* ===== Özet kartları ===== */}
      {statCards.length > 0 && (
        <div className={cx('grid grid-cols-2 gap-3 sm:gap-4', statCards.length >= 4 ? '@3xl:grid-cols-4' : statCards.length === 3 ? '@3xl:grid-cols-3' : '')}>
          {statCards}
        </div>
      )}

      {tabs.length > 0 && (
        <div className={cx('grid grid-cols-1 gap-4 sm:gap-6 items-stretch', showAgenda && '@4xl:grid-cols-2')} id="home-today-agenda">
          {/* ===== BUGÜN ===== */}
          <div className="min-w-0 flex flex-col">
            <Panel
              id="home-today-panel"
              className={cx('flex-1 flex flex-col', todayFlash)}
              bodyClassName="flex-1 min-h-0 flex flex-col gap-3"
              icon={Sun}
              tone="warning"
              title="Bugün"
              description={summaryParts.length ? summaryParts.join(' · ') : 'Planlanmış bir iş yok'}
              actions={
                canScope ? (
                  <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Kapsam" id="home-scope">
                    {(['mine', 'all'] as Scope[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        id={`home-scope-${s}`}
                        aria-pressed={scope === s}
                        onClick={() => setScope(s)}
                        className={cx(
                          'h-7 w-16 inline-flex items-center justify-center rounded-md text-xs font-semibold transition-colors cursor-pointer',
                          scope === s ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
                        )}
                      >
                        {s === 'mine' ? 'Benim' : 'Kurumun'}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            >
              {/* Sekmeler: eşit genişlikte, sayı rozetli */}
              <div
                role="tablist"
                aria-label="Bugün"
                className="grid gap-1 p-1 rounded-xl bg-surface-2 border border-line"
                style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
                id="home-today-tabs"
              >
                {tabs.map((t) => {
                  const TabIcon = t.icon;
                  return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    id={`home-tab-${t.key}`}
                    aria-selected={tab === t.key}
                    aria-label={`${t.label} (${t.count})`}
                    title={t.label}
                    onClick={() => setTab(t.key)}
                    className={cx(
                      'h-8 min-w-0 inline-flex items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold transition-colors cursor-pointer',
                      tab === t.key ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
                    )}
                  >
                    <TabIcon className="w-3.5 h-3.5 shrink-0 @xl:hidden" />
                    <span className="truncate hidden @xl:inline">{t.label}</span>
                    <span
                      className={cx(
                        'min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center tabular-nums',
                        t.fresh > 0 ? 'bg-rose-600 text-white' : t.count > 0 ? 'bg-surface-3 text-fg-2' : 'bg-transparent text-subtle'
                      )}
                    >
                      {t.count > 99 ? '99+' : t.count}
                    </span>
                  </button>
                  );
                })}
              </div>

              <div className="flex-1 min-h-0" role="tabpanel" aria-labelledby={tab ? `home-tab-${tab}` : undefined}>
                {tab === 'etut' && (
                  <EtutTab
                    list={todayEtuts}
                    nextEtut={nextEtut}
                    onOpen={() => go('etuts')}
                  />
                )}
                {tab === 'odev' && (
                  <ListOrEmpty
                    id="home-list-due"
                    empty="Bugün ve yarın teslim edilecek ödev yok."
                    total={dueSoon.length}
                    more={() => go('homework')}
                    moreLabel="Ödevler"
                  >
                    {dueSoon.slice(0, LIST_LIMIT).map((h) => {
                      const exp = expectedFor(h);
                      const done = doneFor(h.id);
                      const pct = exp ? Math.round((done / exp) * 100) : 0;
                      const isToday = h.dueDate.slice(0, 10) === todayStr;
                      return (
                        <Row key={h.id} onClick={() => go('homework', ['homework', h.id, h.title])}>
                          <IconBox icon={BookOpen} tone="success" size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-fg truncate">{h.title}</span>
                            <span className="block text-xs text-muted truncate">
                              {h.subject} · {isToday ? 'Bugün' : 'Yarın'}
                              {h.dueDate.includes('T') ? ` ${h.dueDate.slice(11, 16)}` : ''}
                              {!mineOnly && canScope && h.teacherName ? ` · ${h.teacherName}` : ''}
                            </span>
                          </span>
                          <span className="w-20 shrink-0 text-right">
                            <span className="block text-xs font-semibold text-fg tabular-nums">
                              {done}/{exp}
                            </span>
                            <span className="mt-1 block h-1.5 rounded-full bg-surface-3 overflow-hidden">
                              <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                        </Row>
                      );
                    })}
                  </ListOrEmpty>
                )}
                {tab === 'teslim' && (
                  <ListOrEmpty
                    id="home-new-submissions"
                    empty="Son 3 günde ödev teslimi yok."
                    total={recentSubmissions.length}
                    more={() => go('homework')}
                    moreLabel="Ödevler"
                    markAll={unseenSubmissions.length ? () => markSubsSeen(recentSubmissions.map((e) => e.id)) : undefined}
                    markAllId="home-submissions-mark-all"
                  >
                    {recentSubmissions.slice(0, LIST_LIMIT).map((e) => {
                      const isNew = !seenSubIds.has(e.id);
                      return (
                        <Row
                          key={e.id}
                          data={{ 'data-submission': e.id }}
                          fresh={isNew ? 'emerald' : undefined}
                          title={`${e.name} — ${e.title}`}
                          onClick={() => {
                            markSubsSeen([e.id]);
                            go('homework', ['homework', e.homeworkId, e.title]);
                          }}
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
                        </Row>
                      );
                    })}
                  </ListOrEmpty>
                )}
                {tab === 'soru' && (
                  <ListOrEmpty
                    id="home-question-entries"
                    empty="Son 3 günde soru girişi yok."
                    total={recentQuestionEntries.length}
                    more={() => go('question_tracking')}
                    moreLabel="Soru Takibi"
                    markAll={unseenQuestionEntries.length ? () => markQLogsSeen(recentQuestionEntries.map((e) => e.id)) : undefined}
                    markAllId="home-qentries-mark-all"
                  >
                    {recentQuestionEntries.slice(0, LIST_LIMIT).map((e) => {
                      const isNew = !seenQLogIds.has(e.id);
                      return (
                        <Row
                          key={e.id}
                          data={{ 'data-qentry': e.studentId }}
                          fresh={isNew ? 'amber' : undefined}
                          title={`${e.name} — Soru Takibi sayfasını aç`}
                          onClick={() => {
                            markQLogsSeen([e.id]);
                            go('question_tracking', ['student', e.studentId, e.name]);
                          }}
                        >
                          <IconBox icon={HelpCircle} tone="warning" size="sm" />
                          <span className="flex-1 min-w-0">
                            <span className={cx('block text-sm text-fg truncate', isNew ? 'font-bold' : 'font-medium')}>
                              {e.name} <span className="font-normal">{e.total} soru girdi</span>
                              {e.className ? <span className="font-normal text-muted"> · {e.className}</span> : null}
                            </span>
                            <span className="block text-xs text-muted truncate">
                              {whenText(e.createdAt)}
                              {e.subjects.length ? ` · ${e.subjects.slice(0, 3).join(', ')}${e.subjects.length > 3 ? ` +${e.subjects.length - 3}` : ''}` : ''}
                            </span>
                          </span>
                          <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
                        </Row>
                      );
                    })}
                  </ListOrEmpty>
                )}
                {tab === 'mesaj' && (
                  <ListOrEmpty id="home-list-messages" empty="Okunmamış mesaj yok." total={unread.length} more={() => go('messages')} moreLabel="Mesajlar">
                    {unread.slice(0, LIST_LIMIT).map((m) => (
                      <Row key={m.id} fresh="rose" onClick={() => go('messages')}>
                        <IconBox icon={MessageSquare} tone="danger" size="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-fg truncate">
                            {m.studentName}
                            <span className="font-normal text-muted"> · {m.studentClass}</span>
                          </span>
                          <span className="block text-xs text-muted truncate">{m.text}</span>
                        </span>
                        <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
                      </Row>
                    ))}
                  </ListOrEmpty>
                )}
              </div>
            </Panel>
          </div>

          {/* ===== AJANDA ===== */}
          {showAgenda && (
            <AgendaCalendar className="min-w-0 h-full flex flex-col" etutByDay={etutByDay} hwByDay={hwByDay} todayStr={todayStr} onOpen={go} />
          )}
        </div>
      )}

      {classes.length === 0 && !idare && (
        <p className="text-xs text-muted text-center">Henüz size tanımlı sınıf yok. Yöneticiniz sınıf izni verdiğinde öğrencileriniz burada görünecek.</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Satır ve liste parçaları (Aşama 98: tek tip, sade)
// ---------------------------------------------------------------------------
const FRESH: Record<'rose' | 'emerald' | 'amber', string> = {
  rose: 'notify-blink notify-blink-rose',
  emerald: 'notify-blink notify-blink-emerald',
  amber: 'notify-blink notify-blink-amber',
};

const Row: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  fresh?: 'rose' | 'emerald' | 'amber';
  data?: Record<string, string>;
}> = ({ onClick, children, title, fresh, data }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...data}
      className={cx(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors',
        fresh && FRESH[fresh]
      )}
    >
      {children}
    </button>
  </li>
);

const ListOrEmpty: React.FC<{
  id: string;
  empty: string;
  total: number;
  more: () => void;
  moreLabel: string;
  limit?: number;
  markAll?: () => void;
  markAllId?: string;
  children: React.ReactNode;
}> = ({ id, empty, total, more, moreLabel, limit = LIST_LIMIT, markAll, markAllId, children }) => {
  if (total === 0) return <p className="text-sm text-muted py-2">{empty}</p>;
  return (
    <div id={id} className="space-y-2">
      <ul className="space-y-1.5">{children}</ul>
      <div className="flex items-center justify-between gap-2">
        {markAll ? (
          <button type="button" id={markAllId} onClick={markAll} className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer">
            Tümünü okundu yap
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={more} className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer inline-flex items-center gap-1" id={`${id}-more`}>
          {total > limit ? `+${total - limit} daha · ${moreLabel}` : `Tümü · ${moreLabel}`}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/** Bugünün etütleri saate göre gruplu; en çok ETUT_LIMIT etüt çizilir */
const EtutTab: React.FC<{ list: Etut[]; nextEtut?: Etut; onOpen: () => void }> = ({ list, nextEtut, onOpen }) => {
  const groups = useMemo(() => {
    const out: Array<{ time: string; items: Etut[] }> = [];
    for (const e of list.slice(0, ETUT_LIMIT)) {
      const t = e.time || '—';
      const last = out[out.length - 1];
      if (last && last.time === t) last.items.push(e);
      else out.push({ time: t, items: [e] });
    }
    return out;
  }, [list]);
  if (!list.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Bugün etüt yok"
        description={nextEtut ? `Sıradaki: ${longDate(nextEtut.date)} ${nextEtut.time || ''} · ${nextEtut.subject}` : undefined}
        className="py-6"
      />
    );
  }
  return (
    <div id="home-stack-etuts" className="space-y-2">
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.time} className="flex gap-2.5">
            <span className="ui-chip ui-chip-info tabular-nums text-xs h-6 px-2 shrink-0 mt-1.5">{g.time}</span>
            <ul className="flex-1 min-w-0 space-y-1.5">
              {g.items.map((e) => {
                const names = etutTeacherNames(e);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={onOpen}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-left cursor-pointer transition-colors"
                    >
                      <span className="block text-sm font-semibold text-fg truncate">
                        {e.subject}
                        {e.topic ? ` – ${e.topic}` : ''}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted mt-0.5">
                        {names.length > 0 && (
                          <span className="inline-flex items-center gap-1 font-semibold text-fg-2" data-etut-teacher>
                            <User className="w-3.5 h-3.5" /> {names.join(', ')}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> {e.assignedStudentIds === 'all' ? 'Tüm öğrenciler' : `${e.assignedStudentIds.length} öğrenci`}
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
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <button type="button" onClick={onOpen} id="home-stack-etuts-more" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer inline-flex items-center gap-1">
          {list.length > ETUT_LIMIT ? `+${list.length - ETUT_LIMIT} etüt daha · Etütler` : 'Tümü · Etütler'}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Aylık ajanda: etüt ve ödev teslim günleri işaretli (tarih dizini ana sayfadan gelir)
// ---------------------------------------------------------------------------
const AgendaCalendar: React.FC<{
  etutByDay: Map<string, Etut[]>;
  hwByDay: Map<string, Homework[]>;
  todayStr: string;
  className?: string;
  onOpen: Go;
}> = ({ etutByDay, hwByDay, todayStr, className, onOpen }) => {
  const [ty, tm] = todayStr.split('-').map(Number);
  const [viewYear, setViewYear] = useState(ty);
  const [viewMonth, setViewMonth] = useState(tm - 1);
  const [selected, setSelected] = useState(todayStr);

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

  const dayEtuts = etutByDay.get(selected) || [];
  const dayHws = hwByDay.get(selected) || [];
  const dayTotal = dayEtuts.length + dayHws.length;
  const shownEtuts = dayEtuts.slice(0, DAY_LIMIT);
  const shownHws = dayHws.slice(0, Math.max(0, DAY_LIMIT - shownEtuts.length));
  const hidden = dayTotal - shownEtuts.length - shownHws.length;

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
          const hasE = etutByDay.has(c.date);
          const hasH = hwByDay.has(c.date);
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
          {dayTotal > 0 && <span className="ml-2 font-normal text-muted">{dayTotal} kayıt</span>}
        </p>
        {dayTotal === 0 ? (
          <p className="text-xs text-muted">Bu gün için kayıt yok.</p>
        ) : (
          <ul className="space-y-1" id="home-agenda-day">
            {shownEtuts.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpen('etuts')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 text-left text-xs cursor-pointer"
                >
                  <span className="ui-chip ui-chip-info tabular-nums">{e.time || '—'}</span>
                  <span className="flex-1 truncate text-fg">
                    {e.subject}
                    {e.topic ? ` – ${e.topic}` : ''}
                  </span>
                </button>
              </li>
            ))}
            {shownHws.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onOpen('homework', ['homework', h.id, h.title])}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 text-left text-xs cursor-pointer"
                >
                  <span className="ui-chip ui-chip-warning">Teslim</span>
                  <span className="flex-1 truncate text-fg">
                    {h.subject}: {h.title}
                  </span>
                </button>
              </li>
            ))}
            {hidden > 0 && (
              <li>
                <button
                  type="button"
                  id="home-agenda-more"
                  onClick={() => onOpen(dayEtuts.length > shownEtuts.length ? 'etuts' : 'homework')}
                  className="w-full px-2.5 py-1.5 text-left text-xs font-semibold text-brand-fg hover:underline cursor-pointer"
                >
                  +{hidden} kayıt daha
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
};
