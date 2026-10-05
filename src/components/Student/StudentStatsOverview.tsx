import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Award, BookOpen, CalendarDays, Target } from 'lucide-react';
import type { Etut, GradeRecord, Homework, HomeworkSubmission, Student, StudentQuestionLog } from '../../types';
import type { StudentTabType } from './StudentHeroBanner';
import { dataService } from '../../services/dataService';
import { formatDateISO, getMondayOfWeek, TURKISH_DAYS_SHORT, TURKISH_MONTHS } from '../../utils/questionAnalytics';
import { IconBox, cx, type Tone } from '../ui/kit';
import { etutEnd, etutStart, homeworkStateFor, parseLocalDateTime } from './StudentHomeUtils';

// ============================================================================
// ÖĞRENCİ ANA SAYFASI — "Durumum"
// Dört sakin özet kart: Ödevlerim, Etütlerim, Soru Çözümüm, Notlarım.
// Her kartta tek bir ana sayı, kısa bir açıklama ve ilgili sekmeye geçiş.
// ============================================================================

interface StudentStatsOverviewProps {
  student: Student;
  /** Bu öğrenciye atanmış ödevler */
  homeworks: Homework[];
  submissions: HomeworkSubmission[];
  /** Bu öğrenciye ait etütler */
  etuts: Etut[];
  /** Bu öğrencinin notları */
  grades: GradeRecord[];
  onNavigateTab: (tab: StudentTabType) => void;
}

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const dayIndexMonFirst = (d: Date) => (d.getDay() + 6) % 7;

/** "bugün", "yarın" veya "8 Ekim Per" */
const relativeDay = (d: Date, now: Date) => {
  const key = formatDateISO(d);
  if (key === formatDateISO(now)) return 'bugün';
  if (key === formatDateISO(addDays(now, 1))) return 'yarın';
  return `${d.getDate()} ${TURKISH_MONTHS[d.getMonth()]} ${TURKISH_DAYS_SHORT[dayIndexMonFirst(d)]}`;
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const fmtNumber = (n: number) => n.toLocaleString('tr-TR');
const fmtAverage = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export const StudentStatsOverview: React.FC<StudentStatsOverviewProps> = ({
  student,
  homeworks,
  submissions,
  etuts,
  grades,
  onNavigateTab,
}) => {
  // Saat ilerledikçe (ör. gece yarısı, ödev saati geçince) değerler güncel kalsın
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Soru kayıtları ve hedefler veri servisinden gelir; değiştiğinde yeniden oku
  const [questionLogs, setQuestionLogs] = useState<StudentQuestionLog[]>(() => dataService.getQuestionLogs());
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(
    () =>
      dataService.subscribe(() => {
        setQuestionLogs(dataService.getQuestionLogs());
        setDataVersion((v) => v + 1);
      }),
    []
  );

  const todayYmd = formatDateISO(now);
  const monday = useMemo(() => getMondayOfWeek(now), [now]);

  // ------------------------------------------------------------------ Ödevler
  const hw = useMemo(() => {
    const nowMs = now.getTime();
    const byHw = new Map<string, HomeworkSubmission>();
    submissions.forEach((s) => {
      if (s.studentId === student.id && !byHw.has(s.homeworkId)) byHw.set(s.homeworkId, s);
    });
    let done = 0;
    let excused = 0;
    let overdue = 0;
    const open: Array<{ hw: Homework; due: Date | null }> = [];
    homeworks.forEach((h) => {
      const sub = byHw.get(h.id) || (Array.isArray(h.submissions) ? h.submissions.find((s) => s.studentId === student.id) : undefined);
      const state = homeworkStateFor(h, sub, nowMs);
      if (state === 'done') done++;
      else if (state === 'excused') excused++;
      else if (state === 'overdue') overdue++;
      else open.push({ hw: h, due: parseLocalDateTime(h.dueDate) });
    });
    open.sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
    const counted = homeworks.length - excused; // izinli ödevler orana katılmaz
    return {
      total: homeworks.length,
      done,
      overdue,
      openCount: open.length,
      next: open[0],
      counted,
      percent: counted > 0 ? Math.round((done / counted) * 100) : 0,
    };
  }, [homeworks, submissions, student.id, now]);

  // ------------------------------------------------------------------ Etütler
  const et = useMemo(() => {
    const nowMs = now.getTime();
    const weekEnd = addDays(monday, 7).getTime(); // Pazar 24:00
    const upcoming = etuts
      .map((e) => ({ e, start: etutStart(e), end: etutEnd(e) }))
      .filter((x): x is { e: Etut; start: Date; end: Date } => !!x.start && !!x.end && x.end.getTime() > nowMs)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const thisWeek = upcoming.filter((x) => x.start.getTime() < weekEnd).length;

    // Kendi katılımın: yalnızca yoklaması alınmış etütler (izinli sayılmaz)
    let attended = 0;
    let marked = 0;
    etuts.forEach((e) => {
      const st = e.studentAttendance?.[student.id]?.status;
      if (st === 'present' || st === 'late') {
        attended++;
        marked++;
      } else if (st === 'absent') {
        marked++;
      }
    });
    return {
      total: etuts.length,
      thisWeek,
      next: upcoming[0],
      attended,
      marked,
      rate: marked > 0 ? Math.round((attended / marked) * 100) : null,
    };
  }, [etuts, student.id, monday, now]);

  // ------------------------------------------------------------------ Sorular
  const q = useMemo(() => {
    const mine = questionLogs.filter((l) => l.studentId === student.id);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { ymd: formatDateISO(d), label: TURKISH_DAYS_SHORT[i], count: 0 };
    });
    const index = new Map(days.map((d, i) => [d.ymd, i]));
    mine.forEach((l) => {
      const i = index.get((l.date || '').slice(0, 10));
      if (i !== undefined) days[i].count += Number(l.totalQuestions) || 0;
    });
    const week = days.reduce((s, d) => s + d.count, 0);
    const today = days.find((d) => d.ymd === todayYmd)?.count ?? 0;

    // Bugün geçerli olan hedefler; en anlamlısı: henüz bitmemiş ve bitiş tarihi en yakın olan
    const targets = dataService
      .getQuestionTargetsForStudent(student.id, todayYmd, todayYmd)
      .map((t) => ({ t, p: dataService.questionTargetProgress(t, student.id, mine), end: dataService.questionTargetEnd(t) }))
      .sort((a, b) => Number(a.p.done) - Number(b.p.done) || a.end.localeCompare(b.end));
    const top = targets[0];
    const teacher = top ? top.t.assignedByTeacherName || (top.t.assignedBy && top.t.assignedBy !== 'Öğretmen' ? top.t.assignedBy : '') : '';
    return {
      days,
      week,
      today,
      max: Math.max(1, ...days.map((d) => d.count)),
      target: top ? { ...top, teacher, subject: top.t.subject || 'Tüm dersler' } : null,
      otherTargets: Math.max(0, targets.length - 1),
    };
  }, [questionLogs, student.id, monday, todayYmd, dataVersion]);

  // ------------------------------------------------------------------ Notlar
  const gr = useMemo(() => {
    const valid = grades
      .filter((g) => g.studentId === student.id && Number.isFinite(Number(g.score)))
      .map((g) => {
        const max = Number(g.maxScore) > 0 ? Number(g.maxScore) : 100;
        return { g, max, pct: (Number(g.score) / max) * 100 };
      });
    if (valid.length === 0) return null;
    const avg = valid.reduce((s, x) => s + x.pct, 0) / valid.length;
    const last = [...valid].sort((a, b) => (b.g.date || '').localeCompare(a.g.date || ''))[0];
    return { count: valid.length, average: Math.round(avg * 10) / 10, last };
  }, [grades, student.id]);

  const go = (tab: StudentTabType) => {
    onNavigateTab(tab);
    window.scrollTo({ top: 0 });
  };

  // ------------------------------------------------------------------ Görünüm
  const nextDueLabel = (() => {
    const n = hw.next;
    if (!n) return null;
    if (!n.due) return `Sıradaki: ${n.hw.subject || n.hw.title}`;
    const hasTime = /T\d{2}:\d{2}/.test(n.hw.dueDate);
    return `En yakın teslim: ${relativeDay(n.due, now)}${hasTime ? ` ${hhmm(n.due)}` : ''} · ${n.hw.subject || n.hw.title}`;
  })();

  const nextEtutLabel = (() => {
    const n = et.next;
    if (!n) return null;
    const live = n.start.getTime() <= now.getTime();
    const when = live ? 'Şu an' : `Sıradaki: ${relativeDay(n.start, now)} ${hhmm(n.start)}`;
    return [when, n.e.subject, n.e.teacherName].filter(Boolean).join(' · ');
  })();

  return (
    <section id="student-home-stats" aria-labelledby="student-home-stats-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="student-home-stats-title" className="text-base sm:text-lg font-semibold text-fg">
            Durumum
          </h2>
          <p className="text-xs text-muted mt-0.5">Ödevlerin, etütlerin, soru çözümün ve notların bir bakışta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* ---------------- Ödevlerim ---------------- */}
        <SummaryCard
          id="student-home-stat-homework"
          label="Ödevlerim"
          icon={BookOpen}
          tone="success"
          goLabel="Ödevlerime git"
          onClick={() => go('homework')}
        >
          {hw.total === 0 ? (
            <CardEmpty title="Şu an ödevin yok" hint="Yeni ödev verildiğinde burada göreceksin." />
          ) : (
            <>
              <MainValue value={hw.openCount} unit="bekleyen ödev" />
              <ContextLine>
                {nextDueLabel ?? (hw.overdue > 0 ? 'Yeni bekleyen ödevin yok' : 'Bütün ödevlerin tamam, tebrikler')}
              </ContextLine>
              <div className="mt-3 space-y-1.5">
                <ProgressBar percent={hw.percent} tone="success" label={`Ödev tamamlama oranı %${hw.percent}`} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="tabular-nums">
                    {hw.done}/{hw.counted} tamamlandı
                  </span>
                  {hw.overdue > 0 && (
                    <span id="student-home-stat-homework-overdue" className="ui-chip ui-chip-danger">
                      {hw.overdue} ödevin süresi geçti
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </SummaryCard>

        {/* ---------------- Etütlerim ---------------- */}
        <SummaryCard
          id="student-home-stat-etuts"
          label="Etütlerim"
          icon={CalendarDays}
          tone="info"
          goLabel="Etütlerime git"
          onClick={() => go('etuts')}
        >
          {et.total === 0 ? (
            <CardEmpty title="Henüz etüdün yok" hint="Öğretmenin etüt planladığında burada görünecek." />
          ) : (
            <>
              <MainValue value={et.thisWeek} unit="etüt bu hafta" />
              <ContextLine>{nextEtutLabel ?? 'Planlanmış yeni etüdün yok'}</ContextLine>
              <div className="mt-3 text-xs text-muted">
                Katılımın:{' '}
                {et.rate === null ? (
                  <span className="text-fg-2 font-semibold" title="Henüz yoklama girilmedi">
                    —
                  </span>
                ) : (
                  <>
                    <span className="text-fg font-semibold tabular-nums">%{et.rate}</span>{' '}
                    <span className="tabular-nums">
                      ({et.attended}/{et.marked} etüt)
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </SummaryCard>

        {/* ---------------- Soru Çözümüm ---------------- */}
        <SummaryCard
          id="student-home-stat-questions"
          label="Soru Çözümüm"
          icon={Target}
          tone="warning"
          goLabel="Soru takibine git"
          onClick={() => go('questions')}
        >
          <MainValue value={fmtNumber(q.week)} unit="soru bu hafta" />
          {q.target ? (
            <div id="student-home-stat-questions-target" className="mt-1.5 space-y-1.5">
              <p className="text-xs text-muted">
                Hedef:{' '}
                <span className="text-fg font-semibold tabular-nums">
                  {fmtNumber(q.target.p.solved)}/{fmtNumber(q.target.p.total)}
                </span>{' '}
                ({q.target.subject}
                {q.target.teacher ? ` – ${q.target.teacher}` : ''})
                {q.otherTargets > 0 && <span> · +{q.otherTargets} hedef daha</span>}
              </p>
              <ProgressBar
                percent={q.target.p.percent}
                tone={q.target.p.done ? 'success' : 'warning'}
                label={`Hedef ilerlemesi %${q.target.p.percent}`}
              />
            </div>
          ) : (
            <ContextLine>{q.week > 0 ? `Bugün ${fmtNumber(q.today)} soru` : 'Bu hafta henüz soru girmedin'}</ContextLine>
          )}
          <WeekBars days={q.days} max={q.max} todayYmd={todayYmd} />
        </SummaryCard>

        {/* ---------------- Notlarım ---------------- */}
        <SummaryCard
          id="student-home-stat-grades"
          label="Notlarım"
          icon={Award}
          tone="brand"
          goLabel="Notlarıma git"
          onClick={() => go('grades')}
        >
          {gr === null ? (
            <CardEmpty title="Henüz notun girilmedi" hint="Sınav ve performans notların burada görünecek." />
          ) : (
            <>
              <MainValue value={fmtAverage(gr.average)} unit="/ 100 ortalama" />
              <ContextLine>
                Son not: {gr.last.g.subject}
                {gr.last.g.examType ? ` · ${gr.last.g.examType}` : ''} ·{' '}
                <span className="tabular-nums">
                  {fmtAverage(Number(gr.last.g.score))}/{fmtAverage(gr.last.max)}
                </span>
              </ContextLine>
              <div className="mt-3 text-xs text-muted tabular-nums">{gr.count} not kaydı</div>
            </>
          )}
        </SummaryCard>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Parçalar
// ---------------------------------------------------------------------------
type IconType = React.ComponentType<{ className?: string }>;

const SummaryCard: React.FC<{
  id: string;
  label: string;
  icon: IconType;
  tone: Tone;
  goLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ id, label, icon, tone, goLabel, onClick, children }) => (
  <button
    type="button"
    id={id}
    onClick={onClick}
    className="ui-card ui-card-pad group w-full min-w-0 text-left flex flex-col cursor-pointer transition-colors hover:border-line-strong"
  >
    <span className="flex items-start justify-between gap-3 w-full">
      <span className="ui-eyebrow">{label}</span>
      <IconBox icon={icon} tone={tone} size="sm" />
    </span>
    <span className="block flex-1 w-full min-w-0">{children}</span>
    <span className="mt-4 pt-3 border-t border-line w-full flex items-center justify-between text-xs font-semibold text-brand-fg">
      <span>{goLabel}</span>
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  </button>
);

const MainValue: React.FC<{ value: React.ReactNode; unit: string }> = ({ value, unit }) => (
  <span className="mt-2 flex items-baseline gap-1.5 flex-wrap">
    <span className="text-2xl sm:text-3xl font-bold tracking-tight text-fg tabular-nums">{value}</span>
    <span className="text-sm text-muted">{unit}</span>
  </span>
);

const ContextLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mt-1.5 block text-xs text-fg-2 leading-relaxed break-words">{children}</span>
);

const CardEmpty: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <span className="mt-3 block">
    <span className="block text-sm font-semibold text-fg">{title}</span>
    <span className="block text-xs text-muted mt-1">{hint}</span>
  </span>
);

const barTone: Record<'success' | 'warning', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
};

const ProgressBar: React.FC<{ percent: number; tone: 'success' | 'warning'; label: string }> = ({ percent, tone, label }) => {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-label={label}
      className="block h-1.5 w-full rounded-full bg-surface-3 overflow-hidden"
    >
      <span className={cx('block h-full rounded-full', barTone[tone])} style={{ width: `${p}%` }} />
    </span>
  );
};

// Bu haftanın (Pazartesi–Pazar) günlük soru sayıları — sabit piksel yükseklikli çubuklar
const BAR_MAX_PX = 32;
const WeekBars: React.FC<{ days: Array<{ ymd: string; label: string; count: number }>; max: number; todayYmd: string }> = ({
  days,
  max,
  todayYmd,
}) => (
  <span className="mt-3 block" id="student-home-stat-questions-week">
    <span className="sr-only">
      Bu haftaki günlük soru sayıları: {days.map((d) => `${d.label} ${d.count}`).join(', ')}
    </span>
    <span className="grid grid-cols-7 gap-1.5" aria-hidden="true">
      {days.map((d) => {
        const isToday = d.ymd === todayYmd;
        const isFuture = d.ymd > todayYmd;
        const h = d.count > 0 ? Math.max(4, Math.round((d.count / max) * BAR_MAX_PX)) : 2;
        return (
          <span key={d.ymd} className="flex flex-col items-center gap-1 min-w-0" title={`${d.label}: ${d.count} soru`}>
            <span className="flex items-end w-full justify-center" style={{ height: BAR_MAX_PX }}>
              <span
                className={cx(
                  'block w-full max-w-[18px] rounded-t',
                  d.count === 0 ? 'bg-surface-3' : isToday ? 'bg-warning' : 'bg-warning/45'
                )}
                style={{ height: h }}
              />
            </span>
            <span
              className={cx(
                'text-[11px] leading-none tabular-nums',
                isToday ? 'font-semibold text-fg' : isFuture ? 'text-subtle' : 'text-muted'
              )}
            >
              {d.label}
            </span>
          </span>
        );
      })}
    </span>
  </span>
);
