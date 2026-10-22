import React, { useEffect, useMemo, useState } from 'react';
import { Target, Check, Sparkles, Award, CalendarDays } from 'lucide-react';
import type { WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { normalizeSubject, targetSubjectList, targetSubjectMatcher } from '../../lib/subjects';
import { formatTurkishDate } from '../../utils/questionAnalytics';
import { TargetDailyBreakdown } from './TargetDailyBreakdown';
import { isFlexibleTarget, isPlanCountTarget, isPlanMirrorTarget, targetForDay, targetEndDate } from '../../utils/targetDays';
import { loadSentPlanItemsInRange, type DatedPlanItem } from '../../services/studyPlanService';

// Öğrencinin bu haftaya denk gelen soru hedefleri (Aşama 10)
// Her öğretmenin hedefi ayrı kartta, kendi tarihleri ve (seçildiyse) kendi dersiyle gösterilir.

const subjectEntries = (t: WeeklyQuestionTarget): Array<[string, number]> => {
  const st = t.subjectTargets;
  if (!st) return [];
  if (Array.isArray(st)) return st.filter((x) => x && x.subject).map((x) => [normalizeSubject(x.subject), Number(x.target) || 0]);
  return Object.entries(st).map(([k, v]) => [normalizeSubject(k), Number(v) || 0]);
};

// Elle verilen (haftalık plandan gelmeyen) hedefler: eskisi gibi hedef kartı
const ManualTargetCards: React.FC<{
  targets: WeeklyQuestionTarget[];
  studentId: string;
  logs: StudentQuestionLog[];
  hideDailyBreakdown?: boolean;
}> = ({ targets, studentId, logs, hideDailyBreakdown }) => {
  if (!targets.length) return null;
  return (
    <div className="space-y-3">
      {targets.map((t) => {
        const p = dataService.questionTargetProgress(t, studentId, logs);
        const teacher = t.assignedByTeacherName || (t.assignedBy && t.assignedBy !== 'Öğretmen' ? t.assignedBy : 'Öğretmenin');
        const subs = targetSubjectList(t.subject).length === 1 ? [] : subjectEntries(t).filter(([, n]) => n > 0);
        return (
          <div key={t.id} className="rounded-2xl border border-warning/30 bg-warning-soft/60 p-4 space-y-3" data-testid="student-target-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-warning text-white flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-fg">
                    {t.subject ? `${t.subject} soru hedefi` : 'Soru hedefi'}: <span className="text-warning-fg">{p.total} soru</span>
                    <span className="text-xs font-semibold text-muted">
                      {isFlexibleTarget(t)
                        ? ' (gün gün farklı dağıtıldı)'
                        : ` (günde ${t.dailyTarget || Math.round(p.total / (t.targetDays || 7))})`}
                    </span>
                  </h4>
                  <p className="text-xs text-muted">
                    {formatTurkishDate(t.weekStartDate || '')} – {formatTurkishDate(dataService.questionTargetEnd(t))} · Veren: {teacher}
                    {t.targetType === 'class' ? ' · Sınıf hedefi' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-surface border border-line text-fg">%{p.percent}</span>
                {p.done ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-success text-white flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Hedef tamam!
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-warning text-white">{p.remaining} soru kaldı</span>
                )}
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
              <div className={`h-full rounded-full ${p.done ? 'bg-success' : 'bg-warning'}`} style={{ width: `${p.percent}%` }} />
            </div>
            <div className="text-[11px] text-muted">
              Çözülen: <strong className="text-fg">{p.solved}</strong> / {p.total}
              {t.subject ? ` (yalnızca ${t.subject} soruları sayılır)` : ''}
            </div>
            {t.notes && (
              <div className="p-2.5 rounded-xl bg-surface border border-line text-xs text-fg flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-warning-fg shrink-0 mt-0.5" />
                <span>
                  <strong className="block font-semibold mb-0.5">Öğretmeninin notu</strong>
                  <span className="text-fg-2">{t.notes}</span>
                </span>
              </div>
            )}
            {!hideDailyBreakdown && <TargetDailyBreakdown target={t} studentId={studentId} logs={logs} idPrefix={`tdb-${t.id}`} />}
            {subs.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {subs.map(([subj, n]) => {
                  const solved = p.bySubject[subj] || 0;
                  const ok = solved >= n;
                  return (
                    <div
                      key={subj}
                      className={`p-2 rounded-xl border text-xs ${ok ? 'bg-success-soft border-success/30 text-success-fg' : 'bg-surface border-line text-fg'}`}
                    >
                      <div className="font-semibold truncate">{subj}</div>
                      <div className="flex items-center justify-between mt-1 font-bold">
                        {solved} / {n}
                        {ok && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Aşama 63: HAFTALIK PLANDAN GELEN SORU HEDEFLERİ — GÜN GÜN DUVARLAR
//  * Plandan gelen ders hedefleri (Matematik 179 soru …) tek tek büyük kart olarak gösterilmez.
//  * Önce gri "Haftalık soru dağılımı" kutusu: her dersin haftalık toplamı ve çözülen.
//  * Sonra her gün için bir duvar: o gün plandaki dersler, kitap / sayfa açıklamaları ve
//    YALNIZCA O GÜNÜN soru sayısı. Çubuk o günün sorusu çözüldükçe dolar.
//  * Plandan soru hedefi verilmeyen güne duvar açılmaz.
//  * Duvarlar ekran genişliğine göre yan yana dizilir (yazı boyutuyla orantılı, rem ölçülü).
// ============================================================================
const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const parseYmd = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const itemText = (it: Pick<DatedPlanItem, 'book' | 'note'>) =>
  [it.book, it.note]
    .map((x) => (x || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' – ');

export interface DaySubject {
  subject: string;
  target: number;
  solved: number;
  topics: Array<{ text: string; done: boolean }>;
}
export interface DayWall {
  ymd: string;
  dayName: string;
  dateText: string;
  subjects: DaySubject[];
  target: number;
  solved: number; // derslerin hedefini aşan sorular sayılmaz (çubuk ders ders dolar)
}

export interface PlanWallData {
  walls: DayWall[];
  weekly: Array<{ subject: string; target: number; solved: number }>;
  teacher: string;
  range: { from: string; to: string };
  today: string;
}

/**
 * Aşama 66: plandan gelen ders hedeflerinin gün gün duvar verisi (öğrenci Soru Sayısı ve öğretmen Soru Takibi aynı hesabı kullanır).
 * targets: yalnızca plandan gelen, gün gün dağıtılmış ders hedefleri (isPlanCountTarget + isFlexibleTarget).
 */
export function usePlanWallData(targets: WeeklyQuestionTarget[], studentId: string, logs: StudentQuestionLog[]): PlanWallData {
  const range = useMemo(() => {
    let from = '';
    let to = '';
    for (const t of targets) {
      const s = t.weekStartDate || '';
      const e = targetEndDate(t);
      if (s && (!from || s < from)) from = s;
      if (e && (!to || e > to)) to = e;
    }
    return { from, to };
  }, [targets]);

  // Plandaki görevler (kitap / sayfa açıklaması için). Okunamazsa hedefteki konu metni kullanılır.
  const [items, setItems] = useState<DatedPlanItem[]>([]);
  useEffect(() => {
    let alive = true;
    if (!studentId || !range.from || !range.to) {
      setItems([]);
      return;
    }
    loadSentPlanItemsInRange(studentId, range.from, range.to)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [studentId, range.from, range.to]);

  const today = ymdOf(new Date());

  const { walls, weekly, teacher } = useMemo(() => {
    // dersin gün gün çözdüğü soru (yalnızca o dersin soruları)
    const solvedOn = (t: WeeklyQuestionTarget, ymd: string) => {
      const counts = targetSubjectMatcher(t.subject);
      let n = 0;
      for (const l of logs) {
        if (l.studentId !== studentId || l.date !== ymd) continue;
        for (const e of Array.isArray(l.entries) ? l.entries : []) if (counts(e.subject)) n += Number(e.questionCount) || 0;
      }
      return n;
    };
    const dates: string[] = [];
    const s0 = parseYmd(range.from);
    const e0 = parseYmd(range.to);
    if (s0 && e0) for (let d = new Date(s0); d <= e0 && dates.length < 62; d.setDate(d.getDate() + 1)) dates.push(ymdOf(d));

    const weeklyMap = new Map<string, { subject: string; target: number; solved: number }>();
    const walls: DayWall[] = [];
    for (const ymd of dates) {
      const subjects: DaySubject[] = [];
      for (const t of targets) {
        const target = targetForDay(t, ymd);
        if (target <= 0) continue;
        const subject = normalizeSubject(t.subject || '') || 'Tüm dersler';
        const solved = solvedOn(t, ymd);
        const own = items.filter((it) => it.date === ymd && normalizeSubject(it.subject) === subject);
        let topics = own.map((it) => ({ text: itemText(it), done: !!it.doneAt })).filter((x) => x.text);
        if (!topics.length) {
          const raw = (t.dailyTopics || {})[ymd] || '';
          topics = raw
            .split(/,\s+/)
            .map((x) => x.trim())
            .filter(Boolean)
            .map((text) => ({ text, done: false }));
        }
        subjects.push({ subject, target, solved, topics });
        const w = weeklyMap.get(subject) || { subject, target: 0, solved: 0 };
        w.target += target;
        w.solved += Math.min(solved, target);
        weeklyMap.set(subject, w);
      }
      if (!subjects.length) continue; // plandan soru verilmeyen güne duvar açılmaz
      const d = parseYmd(ymd)!;
      walls.push({
        ymd,
        dayName: GUN_ADI[d.getDay()],
        dateText: `${d.getDate()} ${AY_ADI[d.getMonth()]}`,
        subjects,
        target: subjects.reduce((a, x) => a + x.target, 0),
        solved: subjects.reduce((a, x) => a + Math.min(x.solved, x.target), 0),
      });
    }
    const t0 = targets[0];
    const teacher = t0 ? t0.assignedByTeacherName || (t0.assignedBy && t0.assignedBy !== 'Öğretmen' ? t0.assignedBy : '') : '';
    return { walls, weekly: Array.from(weeklyMap.values()), teacher };
  }, [targets, items, logs, studentId, range.from, range.to]);

  return { walls, weekly, teacher, range, today };
}

/** Haftalık soru dağılımı: gri kutu ("Haftalık Rehberlik Tavsiyesi" kutusuyla aynı görünüm) */
export const PlanWeekSummary: React.FC<{ data: PlanWallData; id?: string }> = ({ data, id }) => {
  const { walls, weekly, teacher, range } = data;
  if (!walls.length) return null;
  const weekTarget = weekly.reduce((a, x) => a + x.target, 0);
  const weekSolved = weekly.reduce((a, x) => a + x.solved, 0);
  const weekPct = weekTarget ? Math.min(100, Math.round((weekSolved / weekTarget) * 100)) : 0;
  return (
      <div id={id} className="p-3.5 bg-surface-2 rounded-xl border border-line text-xs text-fg-2 space-y-2.5" data-testid="plan-week-summary">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Award className="w-3.5 h-3.5 text-orange-600 dark:text-orange-300" />
            <span>Haftalık soru dağılımı</span>
          </div>
          <span className="text-muted">
            {formatTurkishDate(range.from)} – {formatTurkishDate(range.to)}
            {teacher ? ` · Veren: ${teacher}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {weekly.map((w) => {
            const ok = w.solved >= w.target;
            return (
              <span
                key={w.subject}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${ok ? 'bg-success-soft border-success/30 text-success-fg' : 'bg-surface border-line text-fg'}`}
              >
                <span className="font-semibold">{w.subject}</span>
                <span className="tabular-nums text-muted">
                  {w.solved}/<strong className="text-fg">{w.target}</strong> soru
                </span>
                {ok && <Check className="w-3.5 h-3.5" />}
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div className={`h-full rounded-full ${weekPct >= 100 ? 'bg-success' : 'bg-orange-500'}`} style={{ width: `${weekPct}%` }} />
          </div>
          <span className="tabular-nums text-muted">
            Hafta: {weekSolved} / {weekTarget} · %{weekPct}
          </span>
        </div>
      </div>
  );
};

/**
 * Gün gün duvarlar: plandaki dersler, kitap / sayfa açıklamaları, yalnızca o günün soru sayısı ve dolan çubuk.
 * Aşama 72: duvarlar TEK SATIRDA yan yana (6 günlük plan → 6 duvar, 7 günlük → 7 duvar), yazılar küçük.
 * Dar ekranda satır yana kaydırılır; 7'den fazla gün varsa her 7 gün yeni satıra geçer.
 */
export const PlanWallGrid: React.FC<{ data: PlanWallData; id?: string }> = ({ data, id }) => {
  const { walls, today } = data;
  if (!walls.length) return null;
  const rows: DayWall[][] = [];
  for (let i = 0; i < walls.length; i += 7) rows.push(walls.slice(i, i + 7));
  return (
      <div id={id} className="space-y-2">
        {rows.map((row, ri) => (
          <div key={ri} className="overflow-x-auto -mx-1 px-1 pb-1">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${row.length}, minmax(6.5rem, 1fr))` }}
            >
              {row.map((w) => {
                const pct = w.target ? Math.min(100, Math.round((w.solved / w.target) * 100)) : 0;
                const done = w.solved >= w.target;
                const isToday = w.ymd === today;
                const past = w.ymd < today;
                const left = Math.max(0, w.target - w.solved);
                return (
                  <div
                    key={w.ymd}
                    data-testid="plan-day-wall"
                    className={`flex flex-col rounded-xl border p-2 gap-1.5 min-w-0 ${
                      done
                        ? 'border-success/40 bg-success-soft/50'
                        : isToday
                          ? 'border-warning/50 bg-warning-soft/60 ring-2 ring-warning/25'
                          : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-fg leading-tight">
                          <CalendarDays className="w-3 h-3 text-warning-fg shrink-0" />
                          <span className="truncate">{w.dayName}</span>
                        </div>
                        <div className="text-[10px] text-muted leading-tight">
                          {w.dateText}
                          {isToday ? ' · Bugün' : ''}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 px-1.5 py-px rounded-full text-[10px] font-bold leading-tight ${
                          done ? 'bg-success text-white' : isToday ? 'bg-warning text-white' : 'bg-surface-2 border border-line text-fg'
                        }`}
                      >
                        {w.target}
                      </span>
                    </div>

                    <ul className="space-y-1 flex-1">
                      {w.subjects.map((s) => {
                        const ok = s.solved >= s.target;
                        return (
                          <li key={s.subject} className="text-[10px] min-w-0 leading-tight">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-fg truncate" title={s.subject}>
                                {s.subject}
                              </span>
                              <span className={`shrink-0 tabular-nums font-bold inline-flex items-center gap-0.5 ${ok ? 'text-success-fg' : 'text-fg'}`}>
                                {Math.min(s.solved, s.target)}/{s.target}
                                {ok && <Check className="w-2.5 h-2.5" />}
                              </span>
                            </div>
                            {s.topics.length > 0 && (
                              <ul className="mt-0.5 space-y-px">
                                {s.topics.map((tp, i) => (
                                  <li key={i} className="flex items-start gap-1 text-[9.5px] text-muted leading-snug">
                                    <span className={`mt-[0.28rem] w-1 h-1 rounded-full shrink-0 ${tp.done ? 'bg-success' : 'bg-subtle'}`} />
                                    <span className={`min-w-0 break-words ${tp.done ? 'line-through decoration-success/60' : ''}`}>{tp.text}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    <div className="space-y-0.5">
                      <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden border border-line/60">
                        <div className={`h-full rounded-full transition-all ${done ? 'bg-success' : 'bg-warning'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[10px] text-muted leading-tight">
                        <span className="tabular-nums">
                          <strong className="text-fg">{w.solved}</strong>/{w.target}
                        </span>
                        <span className={`font-semibold truncate ${done ? 'text-success-fg' : past ? 'text-danger-fg' : ''}`}>
                          {done ? 'Tamam' : past ? `${left} eksik` : `%${pct}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
  );
};

const PlanDayWalls: React.FC<{ targets: WeeklyQuestionTarget[]; studentId: string; logs: StudentQuestionLog[] }> = ({ targets, studentId, logs }) => {
  const data = usePlanWallData(targets, studentId, logs);
  if (!data.walls.length) return null;
  return (
    <div className="space-y-3" id="student-plan-day-walls">
      <PlanWeekSummary data={data} />
      <PlanWallGrid data={data} />
    </div>
  );
};

export const StudentTargetCards: React.FC<{
  targets: WeeklyQuestionTarget[];
  studentId: string;
  logs: StudentQuestionLog[];
  /** true: kartın içindeki "Gün gün durum" tablosu gösterilmez (bu bilgi birleşik günlük tabloda) */
  hideDailyBreakdown?: boolean;
}> = ({ targets, studentId, logs, hideDailyBreakdown }) => {
  const planTargets = targets.filter((t) => isPlanCountTarget(t) && isFlexibleTarget(t));
  // Aşama 64: plandaki sayılarla doldurulmuş genel hedef ayrıca kart olarak gösterilmez (sayıları gün gün duvarlardadır)
  const manual = targets.filter((t) => !planTargets.includes(t) && !isPlanMirrorTarget(t, targets));
  if (!targets.length) return null;
  return (
    <div className="space-y-3" id="student-target-cards">
      {planTargets.length > 0 && <PlanDayWalls targets={planTargets} studentId={studentId} logs={logs} />}
      <ManualTargetCards targets={manual} studentId={studentId} logs={logs} hideDailyBreakdown={hideDailyBreakdown} />
    </div>
  );
};
