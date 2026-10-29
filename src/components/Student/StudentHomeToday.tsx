import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Megaphone,
  Plus,
  StickyNote,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Minus,
  BarChart3,
} from 'lucide-react';
import type { Etut, GradeRecord, Homework, HomeworkSubmission, Student, StudentMessage, StudentQuestionLog } from '../../types';
import type { StudentTabType } from './StudentHeroBanner';
import { dataService } from '../../services/dataService';
import { homeworkStateFor } from './StudentHomeUtils';
import { StudentTodayPlan } from './StudentTodayPlan';
import { buildStudentQuestionSummary } from '../../utils/studentQuestionSummary';
import { computeTargetDays, isPendingPlanTarget, weekDayGoal } from '../../utils/targetDays';
import { formatDateISO, getWeekStartOf } from '../../utils/questionAnalytics';
import { useLiveNow } from '../../lib/useLiveNow';
import { useDataVersion } from '../../lib/useDataVersion';
import { Panel, cx } from '../ui/kit';

// ============================================================================
// ÖĞRENCİ ANA SAYFASI — "BUGÜN" ve "BU HAFTA" (Aşama 66)
// Eski "Duyurular + takvim" ve "Durumum" duvarlarının yerine iki eş duvar (öğretmen ana sayfasıyla aynı düzen):
//  * Bugün: soru hedefi (çubuk + Soru gir), plan görevleri (yaptım işareti), bugün/yarın teslim ödevler,
//    bugünkü etütler, öğretmen duyuruları ve yeni notlar.
//  * Bu hafta: gün gün mini görünüm (doluluk renkleri), haftanın durumu (hedef tutulan gün, art arda çalışma),
//    son deneme özeti (toplam net, değişim, en zayıf 3 kazanım → çalışma önerisi) ve notlar.
// Sayılar Soru Takibi sayfasıyla AYNI fonksiyonlardan gelir (buildStudentQuestionSummary, weekDayGoal).
// ============================================================================

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const fmt = (n: number) => n.toLocaleString('tr-TR');
const fmtNet = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

const GRADE_DAYS = 7; // son kaç günün notu "yeni" sayılır
const TEACHER_ANNOUNCEMENT_DAYS = 14; // öğretmen duyurusu kaç gün görünür

type DayState = 'met' | 'partial' | 'none' | 'today' | 'future' | 'free' | 'rest';
const DAY_STYLE: Record<DayState, string> = {
  met: 'bg-success-soft border-success/40 text-success-fg',
  partial: 'bg-warning-soft border-warning/40 text-warning-fg',
  none: 'bg-danger-soft border-danger/30 text-danger-fg',
  today: 'bg-brand-soft border-brand/50 text-brand-fg',
  future: 'bg-surface-2 border-line text-muted',
  free: 'bg-info-soft border-info/30 text-info-fg', // hedef yok ama soru çözdü
  rest: 'bg-surface-2 border-line text-subtle', // hedef yok, soru yok
};
const DAY_LABEL: Record<DayState, string> = {
  met: 'Hedef tamam',
  partial: 'Hedefin altında',
  none: 'Soru girilmedi',
  today: 'Bugün',
  future: 'Henüz gelmedi',
  free: 'Hedef yok · çalıştın',
  rest: 'Hedef yok',
};

interface DenemeSummary {
  name: string;
  date: string;
  net: number | null;
  prevNet: number | null;
  weak: Array<{ key: string; label: string; subject: string; rate: number }>;
}

export const StudentHomeToday: React.FC<{
  student: Student;
  homeworks: Homework[];
  etuts: Etut[];
  submissions: HomeworkSubmission[];
  grades: GradeRecord[];
  announcements: StudentMessage[];
  onNavigateTab: (tab: StudentTabType) => void;
  /** Deneme Sonuçlarım sayfasını "Çalışma planı" karnesiyle açar */
  onOpenStudyPlan: () => void;
  onOpenAvatarModal: () => void;
}> = ({ student, homeworks, etuts, submissions, grades, announcements, onNavigateTab, onOpenStudyPlan, onOpenAvatarModal }) => {
  const now = useLiveNow();
  const dataVersion = useDataVersion();
  const todayStr = useMemo(() => ymdOf(now), [now]);
  const tomorrowStr = useMemo(() => ymdOf(addDays(now, 1)), [now]);
  const [openAnn, setOpenAnn] = useState<string | null>(null);

  const [logs, setLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  useEffect(() => dataService.subscribe(() => setLogs(dataService.getQuestionLogs())), []);

  const go = (tab: StudentTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };
  const openEntry = () => {
    // Soru Sayısı sayfası "+ Soru Kaydet" sekmesiyle açılır
    window.history.pushState(null, '', '#/student/questions/entry');
    go('questions');
  };

  // ------------------------------------------------------------------ Soru: bugün ve bu hafta
  const q = useMemo(() => buildStudentQuestionSummary(student.id, now, logs), [student.id, now, logs, dataVersion]);
  const goalPct = q.todayGoal > 0 ? Math.min(100, Math.round((q.todayGoalSolved / q.todayGoal) * 100)) : 0;
  const goalDone = q.todayGoal > 0 && q.todayGoalSolved >= q.todayGoal;

  const week = useMemo(() => {
    const start = getWeekStartOf(now, dataService.getStudentWeekStartDay(student.id));
    const days = Array.from({ length: 7 }, (_, i) => formatDateISO(addDays(start, i)));
    const targets = dataService
      .getQuestionTargetsForStudent(student.id, days[0], days[6])
      .filter((t) => !isPendingPlanTarget(t))
      .map((t) => ({ t, res: computeTargetDays(t, student.id, logs, todayStr) }));
    const perDay = new Map<string, number>();
    for (const l of logs) {
      if (l.studentId !== student.id) continue;
      const d = (l.date || '').slice(0, 10);
      perDay.set(d, (perDay.get(d) || 0) + (Number(l.totalQuestions) || 0));
    }
    const tiles = days.map((ymd) => {
      const count = perDay.get(ymd) || 0;
      const goal = weekDayGoal(ymd, targets).goal;
      let state: DayState;
      if (ymd > todayStr) state = 'future';
      else if (goal > 0 && count >= goal) state = 'met';
      else if (ymd === todayStr) state = 'today';
      else if (goal > 0) state = count > 0 ? 'partial' : 'none';
      else state = count > 0 ? 'free' : 'rest';
      const d = parseYmd(ymd)!;
      return { ymd, count, goal, state, day: GUN_KISA[d.getDay()], date: d.getDate() };
    });
    const goalDays = tiles.filter((t) => t.goal > 0 && (t.ymd < todayStr || t.state === 'met'));
    const metDays = goalDays.filter((t) => t.state === 'met').length;
    // Art arda çalışılan gün: bugünden (bugün henüz girilmediyse dünden) geriye, soru girilen ardışık günler
    let streak = 0;
    let cur = (perDay.get(todayStr) || 0) > 0 ? now : addDays(now, -1);
    for (let i = 0; i < 366; i++) {
      if ((perDay.get(ymdOf(cur)) || 0) <= 0) break;
      streak++;
      cur = addDays(cur, -1);
    }
    const weekTotal = tiles.reduce((a, t) => a + t.count, 0);
    const weekGoal = tiles.reduce((a, t) => a + t.goal, 0);
    return { tiles, metDays, goalDays: goalDays.length, streak, weekTotal, weekGoal };
  }, [student.id, logs, now, todayStr, dataVersion]);

  // ------------------------------------------------------------------ Ödev, etüt, duyuru
  const subOf = (hw: Homework) =>
    submissions.find((s) => s.homeworkId === hw.id && s.studentId === student.id) ||
    (Array.isArray(hw.submissions) ? hw.submissions.find((s) => s.studentId === student.id) : undefined);

  const todayEtuts = useMemo(
    () => etuts.filter((e) => e.date === todayStr).sort((a, b) => (a.time || '').localeCompare(b.time || '')),
    [etuts, todayStr]
  );
  const dueHomeworks = useMemo(() => {
    const nowMs = Date.now();
    return homeworks
      .filter((hw) => {
        const day = (hw.dueDate || '').slice(0, 10);
        if (day !== todayStr && day !== tomorrowStr) return false;
        const st = homeworkStateFor(hw, subOf(hw), nowMs);
        return st === 'open' || st === 'overdue';
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeworks, submissions, todayStr, tomorrowStr, dataVersion]);
  const newHomeworks = useMemo(
    () => homeworks.filter((hw) => !dueHomeworks.includes(hw) && (hw.assignedDate || hw.createdAt || '').slice(0, 10) === todayStr),
    [homeworks, dueHomeworks, todayStr]
  );

  const notices = useMemo(() => {
    const list: Array<{ id: string; kind: 'duyuru' | 'not_ogretmen' | 'not'; title: string; detail?: string; body?: string }> = [];
    const cutoff = Date.now() - TEACHER_ANNOUNCEMENT_DAYS * 86400000;
    announcements
      .filter((a) => (a.kind === 'announcement' || a.kind === 'note') && new Date(a.createdAt).getTime() >= cutoff)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .forEach((a) =>
        list.push({
          id: `ann-${a.id}`,
          kind: a.kind === 'note' ? 'not_ogretmen' : 'duyuru',
          title: a.subject,
          detail: `${a.senderName ? `${a.senderName} · ` : ''}${new Date(a.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`,
          body: a.text,
        })
      );
    const gCut = ymdOf(addDays(now, -GRADE_DAYS));
    grades
      .filter((g) => g.studentId === student.id && (g.date || '').slice(0, 10) >= gCut)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 3)
      .forEach((g) => {
        const max = Number(g.maxScore) > 0 ? Number(g.maxScore) : 100;
        list.push({
          id: `not-${g.id}`,
          kind: 'not',
          title: `Yeni not: ${g.subject} ${g.examType} — ${g.score}${max !== 100 ? `/${max}` : ''}`,
          detail: g.remarks || undefined,
        });
      });
    return list;
  }, [announcements, grades, student.id, now]);

  // ------------------------------------------------------------------ Notlar
  const gradeInfo = useMemo(() => {
    const valid = grades
      .filter((g) => g.studentId === student.id && Number.isFinite(Number(g.score)))
      .map((g) => {
        const max = Number(g.maxScore) > 0 ? Number(g.maxScore) : 100;
        return { g, max, pct: (Number(g.score) / max) * 100 };
      });
    if (!valid.length) return null;
    const avg = valid.reduce((s, x) => s + x.pct, 0) / valid.length;
    const last = [...valid].sort((a, b) => (b.g.date || '').localeCompare(a.g.date || ''))[0];
    return { count: valid.length, average: Math.round(avg * 10) / 10, last };
  }, [grades, student.id]);

  // ------------------------------------------------------------------ Son deneme (deneme kodları ayrı yüklenir)
  const [deneme, setDeneme] = useState<DenemeSummary | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [svc, kk, km] = await Promise.all([
          import('../../services/denemeService'),
          import('../../lib/deneme/kazanimKarne'),
          import('../../lib/deneme/karneModel'),
        ]);
        const r = await svc.loadMyDenemeler();
        const mine = r.results.filter((x) => x.studentId === student.id);
        const exams = r.exams
          .filter((e) => mine.some((x) => x.examId === e.id))
          .sort((a, b) => (a.examDate || '').localeCompare(b.examDate || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
        if (!exams.length) {
          if (alive) setDeneme(null);
          return;
        }
        const last = exams[exams.length - 1];
        const prev = exams.length > 1 ? exams[exams.length - 2] : null;
        const netOf = (examId: string) => {
          const res = mine.find((x) => x.examId === examId);
          return res && res.totalNet !== null && Number.isFinite(Number(res.totalNet)) ? Number(res.totalNet) : null;
        };
        let weak: DenemeSummary['weak'] = [];
        try {
          const subs = km.usedSubjects(exams);
          weak = kk.studySuggestions(kk.kazanimTracking(exams, mine, subs), 3).map((s) => ({
            key: s.row.key,
            label: s.row.short || s.row.label,
            subject: s.subject.name,
            rate: Math.round(s.row.lastRate ?? s.row.rate),
          }));
        } catch {
          weak = [];
        }
        if (alive) setDeneme({ name: last.name, date: last.examDate, net: netOf(last.id), prevNet: prev ? netOf(prev.id) : null, weak });
      } catch {
        if (alive) setDeneme(null); // deneme bölümü kurulmamış ya da okunamadı: kart gizlenir
      }
    })();
    return () => {
      alive = false;
    };
  }, [student.id]);

  const dateText = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const avatarUrl = student.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;
  const summary = [
    q.todayGoal > 0 ? (goalDone ? 'soru hedefi tamam' : `${fmt(Math.max(0, q.todayGoal - q.todayGoalSolved))} soru kaldı`) : '',
    dueHomeworks.length ? `${dueHomeworks.length} ödev teslimi` : '',
    todayEtuts.length ? `${todayEtuts.length} etüt` : '',
  ].filter(Boolean);
  const netDiff = deneme && deneme.net !== null && deneme.prevNet !== null ? Math.round((deneme.net - deneme.prevNet) * 100) / 100 : null;

  return (
    <div className="@container" id="student-home-today" data-v={dataVersion}>
    <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 sm:gap-6 items-stretch">
      {/* ============================== BUGÜN ============================== */}
      <Panel
        id="student-today-panel"
        className="min-w-0 h-full flex flex-col"
        bodyClassName="flex-1 min-h-0 space-y-5"
        icon={Sun}
        tone="warning"
        title="Bugün"
        description={<span className="capitalize">{dateText}{summary.length ? ` · ${summary.join(' · ')}` : ''}</span>}
        actions={
          <button
            type="button"
            data-yazma
            onClick={onOpenAvatarModal}
            className="relative p-0.5 rounded-full ring-2 ring-brand/40 hover:ring-brand transition-all cursor-pointer"
            title="Profil resmini değiştir"
          >
            <img src={avatarUrl} alt={student.name} className="w-7 h-7 rounded-full object-cover bg-surface" />
          </button>
        }
      >
        {/* Soru hedefi */}
        <section id="student-today-goal">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="ui-eyebrow">Soru hedefi</h3>
            <button type="button" id="student-today-add-questions" className="ui-btn ui-btn-primary ui-btn-sm" onClick={openEntry}>
              <Plus /> Soru gir
            </button>
          </div>
          {q.todayGoal > 0 ? (
            <div className={cx('rounded-xl border p-3', goalDone ? 'border-success/40 bg-success-soft/50' : 'border-line bg-surface-2')}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-fg">
                  <strong className="text-xl font-bold tabular-nums">{fmt(q.todayGoalSolved)}</strong>
                  <span className="text-muted"> / {fmt(q.todayGoal)} soru</span>
                </span>
                <span className={cx('text-xs font-semibold', goalDone ? 'text-success-fg' : 'text-muted')}>
                  {goalDone ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Hedef tamam
                    </span>
                  ) : (
                    `${fmt(q.todayGoal - q.todayGoalSolved)} soru kaldı · %${goalPct}`
                  )}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPct} aria-label="Bugünkü soru hedefi">
                <div className={cx('h-full rounded-full transition-all', goalDone ? 'bg-success' : 'bg-warning')} style={{ width: `${goalPct}%` }} />
              </div>
              {q.todayGoalSubjects.length > 0 && <p className="mt-1.5 text-[11px] text-muted">{q.todayGoalSubjects.join(', ')}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Bugün için soru hedefi verilmedi.{q.today > 0 ? ` Bugün ${fmt(q.today)} soru çözdün.` : ''}
            </p>
          )}
        </section>

        {/* Plan görevleri (yaptım işareti; görevin soruları soru kaydına aktarılır) */}
        <section id="student-today-tasks">
          <h3 className="ui-eyebrow mb-2">Görevlerim</h3>
          <StudentTodayPlan compact />
        </section>

        {/* Ödevler ve etütler */}
        <section id="student-today-schedule">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="ui-eyebrow">Ödev ve etütler</h3>
            <span className="flex items-center gap-3">
              <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('homework')}>
                Ödevlerim
              </button>
              <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('etuts')}>
                Etütlerim
              </button>
            </span>
          </div>
          {todayEtuts.length === 0 && dueHomeworks.length === 0 && newHomeworks.length === 0 ? (
            <p className="text-sm text-muted">Bugün etüdün yok; bugün ve yarın teslim edilecek ödevin de yok.</p>
          ) : (
            <ul className="space-y-1.5">
              {todayEtuts.map((e) => (
                <li key={`e-${e.id}`}>
                  <RowButton icon={Clock} tone="info" onClick={() => go('etuts')} title={`${e.time ? `${e.time} · ` : ''}${e.subject} etüdü`} detail={[e.topic, e.location].filter(Boolean).join(' · ')} />
                </li>
              ))}
              {dueHomeworks.map((hw) => {
                const isToday = hw.dueDate.slice(0, 10) === todayStr;
                const time = hw.dueDate.includes('T') ? hw.dueDate.slice(11, 16) : '';
                return (
                  <li key={`h-${hw.id}`}>
                    <RowButton
                      icon={BookOpen}
                      tone="warning"
                      onClick={() => go('homework')}
                      title={`${isToday ? 'Bugün' : 'Yarın'} teslim: ${hw.title}`}
                      detail={`${hw.subject}${time ? ` · saat ${time}` : ''}`}
                    />
                  </li>
                );
              })}
              {newHomeworks.map((hw) => (
                <li key={`n-${hw.id}`}>
                  <RowButton icon={BookOpen} tone="brand" onClick={() => go('homework')} title={`Yeni ödev: ${hw.title}`} detail={hw.subject} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Öğretmen duyuruları ve yeni notlar */}
        {notices.length > 0 && (
          <section id="student-today-notices">
            <h3 className="ui-eyebrow mb-2">Duyurular</h3>
            <ul className="space-y-1.5">
              {notices.map((n) => {
                const open = openAnn === n.id;
                const Icon = n.kind === 'not' ? Award : n.kind === 'not_ogretmen' ? StickyNote : Megaphone;
                return (
                  <li key={n.id}>
                    <RowButton
                      icon={Icon}
                      tone={n.kind === 'not' ? 'brand' : 'danger'}
                      onClick={() => (n.body ? setOpenAnn(open ? null : n.id) : go('grades'))}
                      title={n.title}
                      detail={n.detail}
                      expandable={!!n.body}
                      open={open}
                    />
                    {open && n.body && (
                      <div className="mt-1 ml-10 px-3 py-2 rounded-lg bg-surface-2 border border-line text-xs text-fg-2 leading-relaxed whitespace-pre-wrap break-words">
                        {n.body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </Panel>

      {/* ============================== BU HAFTA ============================== */}
      <Panel
        id="student-week-panel"
        className="min-w-0 h-full flex flex-col"
        bodyClassName="flex-1 min-h-0 space-y-5"
        icon={CalendarDays}
        tone="brand"
        title="Bu hafta"
        description={`${fmt(week.weekTotal)} soru${week.weekGoal > 0 ? ` · hedef ${fmt(week.weekGoal)}` : ''}`}
        actions={
          <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer inline-flex items-center gap-1" onClick={() => go('questions')}>
            Soru takibi <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        {/* Gün gün mini görünüm */}
        <section id="student-week-days">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {week.tiles.map((t) => (
              <button
                key={t.ymd}
                type="button"
                data-day-state={t.state}
                onClick={() => go('questions')}
                title={`${t.day} ${t.date}: ${t.count} soru${t.goal > 0 ? ` / hedef ${t.goal}` : ''} · ${DAY_LABEL[t.state]}`}
                className={cx(
                  'min-w-0 rounded-xl border px-0.5 py-2 flex flex-col items-center gap-0.5 cursor-pointer transition-transform hover:-translate-y-0.5',
                  DAY_STYLE[t.state],
                  t.ymd === todayStr && 'ring-2 ring-brand/50'
                )}
              >
                <span className="text-[11px] font-semibold leading-none">{t.day}</span>
                <span className="text-[10px] opacity-75 leading-none">{t.date}</span>
                <span className="mt-1 text-sm font-bold tabular-nums leading-none">{t.state === 'future' ? '—' : fmt(t.count)}</span>
                <span className="text-[10px] tabular-nums leading-none opacity-80 truncate max-w-full">{t.goal > 0 ? `/${fmt(t.goal)}` : ' '}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <Legend cls="bg-success" text="Hedef tamam" />
            <Legend cls="bg-warning" text="Hedefin altında" />
            <Legend cls="bg-danger" text="Soru girilmedi" />
            <Legend cls="bg-info" text="Hedef yok, çalıştın" />
          </div>
        </section>

        {/* Haftanın durumu */}
        <section id="student-week-status" className="grid grid-cols-1 @md:grid-cols-3 gap-2">
          <StatTile icon={Target} tone="success" value={week.goalDays ? `${week.metDays}/${week.goalDays}` : '—'} label={week.goalDays ? 'günde hedef tuttun' : 'bu hafta hedef günü yok'} />
          <StatTile icon={Flame} tone="warning" value={fmt(week.streak)} label={week.streak > 0 ? 'gündür art arda çalışıyorsun' : 'art arda çalışma yok'} />
          <StatTile icon={BarChart3} tone="brand" value={fmt(week.weekTotal)} label="soru bu hafta" />
        </section>

        {/* Son deneme */}
        {deneme && (
          <section id="student-week-deneme">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="ui-eyebrow">Son deneme</h3>
              <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('deneme')}>
                Deneme sonuçlarım
              </button>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{deneme.name}</p>
                  <p className="text-[11px] text-muted">{deneme.date ? parseYmd(deneme.date)?.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-fg">
                    <strong className="text-xl font-bold tabular-nums">{deneme.net !== null ? fmtNet(deneme.net) : '—'}</strong>
                    <span className="text-muted"> net</span>
                  </span>
                  {netDiff !== null && (
                    <span
                      className={cx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold',
                        netDiff > 0 ? 'bg-success-soft text-success-fg' : netDiff < 0 ? 'bg-danger-soft text-danger-fg' : 'bg-surface-3 text-muted'
                      )}
                      title="Önceki denemeye göre"
                    >
                      {netDiff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : netDiff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      {netDiff > 0 ? '+' : ''}
                      {fmtNet(netDiff)}
                    </span>
                  )}
                </div>
              </div>
              {deneme.weak.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold text-muted mb-1">Önce çalışman gereken kazanımlar</p>
                  <ul className="space-y-1">
                    {deneme.weak.map((w) => (
                      <li key={w.key}>
                        <button
                          type="button"
                          onClick={onOpenStudyPlan}
                          title="Çalışma önerisini aç"
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-line hover:border-brand/50 text-left cursor-pointer transition-colors"
                        >
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-danger-soft text-danger-fg text-[10px] font-bold tabular-nums">%{w.rate}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-fg truncate">{w.label}</span>
                            <span className="block text-[10px] text-muted truncate">{w.subject}</span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-subtle shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-[11px] text-muted">Bu denemede öne çıkan zayıf kazanım yok.</p>
              )}
            </div>
          </section>
        )}

        {/* Notlarım */}
        <section id="student-week-grades">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="ui-eyebrow">Notlarım</h3>
            <button type="button" className="text-xs font-semibold text-brand-fg hover:underline cursor-pointer" onClick={() => go('grades')}>
              Notlarıma git
            </button>
          </div>
          {gradeInfo ? (
            <p className="text-sm text-fg">
              <strong className="tabular-nums">{gradeInfo.average.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</strong>
              <span className="text-muted"> / 100 ortalama · {gradeInfo.count} not · son: {gradeInfo.last.g.subject}{gradeInfo.last.g.examType ? ` ${gradeInfo.last.g.examType}` : ''} {Number(gradeInfo.last.g.score).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}/{gradeInfo.last.max}</span>
            </p>
          ) : (
            <p className="text-sm text-muted">Henüz notun girilmedi.</p>
          )}
        </section>
      </Panel>
    </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
type IconType = React.ComponentType<{ className?: string }>;
const ROW_TONE: Record<'info' | 'warning' | 'brand' | 'danger', string> = {
  info: 'bg-info-soft text-info-fg',
  warning: 'bg-warning-soft text-warning-fg',
  brand: 'bg-brand-soft text-brand-fg',
  danger: 'bg-danger-soft text-danger-fg',
};

const RowButton: React.FC<{
  icon: IconType;
  tone: keyof typeof ROW_TONE;
  title: string;
  detail?: string;
  onClick: () => void;
  expandable?: boolean;
  open?: boolean;
}> = ({ icon: Icon, tone, title, detail, onClick, expandable, open }) => (
  <button
    type="button"
    onClick={onClick}
    aria-expanded={expandable ? !!open : undefined}
    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-transparent text-left cursor-pointer transition-colors"
  >
    <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', ROW_TONE[tone])}>
      <Icon className="w-4 h-4" />
    </span>
    <span className="flex-1 min-w-0">
      <span className={cx('block text-sm font-semibold text-fg', open ? 'break-words' : 'truncate')}>{title}</span>
      {detail && <span className="block text-xs text-muted truncate">{detail}</span>}
    </span>
    {expandable ? (
      <ChevronRight className={cx('w-4 h-4 text-subtle shrink-0 transition-transform', open && 'rotate-90')} />
    ) : (
      <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
    )}
  </button>
);

const Legend: React.FC<{ cls: string; text: string }> = ({ cls, text }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cx('w-2 h-2 rounded-full', cls)} /> {text}
  </span>
);

const StatTile: React.FC<{ icon: IconType; tone: 'success' | 'warning' | 'brand'; value: string; label: string }> = ({ icon: Icon, tone, value, label }) => (
  <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 min-w-0">
    <span className={cx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tone === 'success' ? 'bg-success-soft text-success-fg' : tone === 'warning' ? 'bg-warning-soft text-warning-fg' : 'bg-brand-soft text-brand-fg')}>
      <Icon className="w-4 h-4" />
    </span>
    <span className="min-w-0">
      <span className="block text-base font-bold text-fg tabular-nums leading-tight">{value}</span>
      <span className="block text-[11px] text-muted leading-snug">{label}</span>
    </span>
  </div>
);
