import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Award, Target } from 'lucide-react';
import type { Etut, GradeRecord, Homework, HomeworkSubmission, Student, StudentQuestionLog } from '../../types';
import type { StudentTabType } from './StudentHeroBanner';
import { dataService } from '../../services/dataService';
import { buildStudentQuestionSummary, isTargetDone } from '../../utils/studentQuestionSummary';
import { useLiveNow } from '../../lib/useLiveNow';
import { IconBox, cx, type Tone } from '../ui/kit';

// ============================================================================
// ÖĞRENCİ ANA SAYFASI — "Durumum"
// Özet kartlar: Soru Çözümüm ve Notlarım (en sağda); en solda "Bugün yapılması gerekenler" paneli. Ödevler ve etütler yukarıdaki
// "Duyurular" panosunda gösterildiği için burada ayrıca kart olarak yer almaz.
// Her kartta tek bir ana sayı, kısa bir açıklama ve ilgili sekmeye geçiş.
// ============================================================================

interface StudentStatsOverviewProps {
  student: Student;
  /** Artık kullanılmıyor (ödevler/etütler Duyurular panosunda). Eski çağrılar bozulmasın diye isteğe bağlı. */
  homeworks?: Homework[];
  submissions?: HomeworkSubmission[];
  etuts?: Etut[];
  /** Bu öğrencinin notları */
  grades: GradeRecord[];
  onNavigateTab: (tab: StudentTabType) => void;
  /** Kartların yanına yerleştirilen panel (öğrenci ana sayfasında küçük "Bugün yapılması gerekenler") */
  sidePanel?: React.ReactNode;
}

const fmtNumber = (n: number) => n.toLocaleString('tr-TR');
const fmtAverage = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export const StudentStatsOverview: React.FC<StudentStatsOverviewProps> = ({
  student,
  grades,
  onNavigateTab,
  sidePanel,
}) => {
  // Saat ilerledikçe (gece yarısı, sekmeye dönüş vb.) "bugün" güncel kalır
  const now = useLiveNow();

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

  // ------------------------------------------------------------------ Sorular
  // "Duyurular" ve Soru Takibi ile AYNI hesap (utils/studentQuestionSummary.ts)
  const q = useMemo(() => {
    const s = buildStudentQuestionSummary(student.id, now, questionLogs);
    return {
      days: s.weekDays,
      week: s.week,
      today: s.today,
      todayYmd: s.todayYmd,
      todayGoal: s.todayGoal,
      todayGoalSolved: s.todayGoalSolved,
      max: Math.max(1, ...s.weekDays.map((d) => d.count)),
      target: s.primary
        ? {
            ...s.primary,
            p: { solved: s.primary.res.solved, total: s.primary.res.total, percent: s.primary.res.percent, done: isTargetDone(s.primary.res) },
          }
        : null,
      otherTargets: s.otherTargets,
    };
  }, [questionLogs, student.id, now, dataVersion]);
  const todayYmd = q.todayYmd;

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
  return (
    <section id="student-home-stats" aria-labelledby="student-home-stats-title" className="space-y-3 @container">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="student-home-stats-title" className="text-base sm:text-lg font-semibold text-fg">
            Durumum
          </h2>
          <p className="text-xs text-muted mt-0.5">Notların ve soru çözümün bir bakışta</p>
        </div>
      </div>

      {/* Yerleşim: 1. sütun küçültülmüş "Bugün yapılması gerekenler" (en solda), 2. sütun Soru Çözümüm,
          3. sütun Notlarım (en sağda). Telefonda tek sütun; plan en üstte. */}
      <div
        id="student-home-stats-grid"
        className={cx('grid grid-cols-1 @2xl:grid-cols-2 gap-3 sm:gap-4 items-start', sidePanel ? '@5xl:grid-cols-3' : '')}
      >
        {/* Sol: küçültülmüş "Bugün yapılması gerekenler" (telefonda da en üstte) */}
        {sidePanel && (
          <div className="min-w-0 @2xl:col-span-2 @5xl:col-span-1" id="student-home-stats-side">
            {sidePanel}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:gap-4 min-w-0" id="student-home-stats-col-questions">
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
          {q.todayGoal > 0 && (
            <ContextLine>
              Bugünkü hedef:{' '}
              <span className="text-fg font-semibold tabular-nums">
                {fmtNumber(q.todayGoalSolved)}/{fmtNumber(q.todayGoal)}
              </span>
              {q.todayGoalSolved >= q.todayGoal ? ' · tamam' : ` · ${fmtNumber(q.todayGoal - q.todayGoalSolved)} soru kaldı`}
            </ContextLine>
          )}
          <WeekBars days={q.days} max={q.max} todayYmd={todayYmd} />
        </SummaryCard>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4 min-w-0" id="student-home-stats-col-grades">
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
