import React from 'react';
import { Target, Check, Sparkles } from 'lucide-react';
import type { WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { dataService } from '../../services/dataService';
import { normalizeSubject } from '../../lib/subjects';
import { formatTurkishDate } from '../../utils/questionAnalytics';
import { TargetDailyBreakdown } from './TargetDailyBreakdown';

// Öğrencinin bu haftaya denk gelen soru hedefleri (Aşama 10)
// Her öğretmenin hedefi ayrı kartta, kendi tarihleri ve (seçildiyse) kendi dersiyle gösterilir.

const subjectEntries = (t: WeeklyQuestionTarget): Array<[string, number]> => {
  const st = t.subjectTargets;
  if (!st) return [];
  if (Array.isArray(st)) return st.filter((x) => x && x.subject).map((x) => [normalizeSubject(x.subject), Number(x.target) || 0]);
  return Object.entries(st).map(([k, v]) => [normalizeSubject(k), Number(v) || 0]);
};

export const StudentTargetCards: React.FC<{ targets: WeeklyQuestionTarget[]; studentId: string; logs: StudentQuestionLog[] }> = ({
  targets,
  studentId,
  logs,
}) => {
  if (!targets.length) return null;
  return (
    <div className="space-y-3" id="student-target-cards">
      {targets.map((t) => {
        const p = dataService.questionTargetProgress(t, studentId, logs);
        const teacher = t.assignedByTeacherName || (t.assignedBy && t.assignedBy !== 'Öğretmen' ? t.assignedBy : 'Öğretmenin');
        const subs = t.subject ? [] : subjectEntries(t).filter(([, n]) => n > 0);
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
                    <span className="text-xs font-semibold text-muted"> (günde {t.dailyTarget || Math.round(p.total / (t.targetDays || 7))})</span>
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
            <TargetDailyBreakdown target={t} studentId={studentId} logs={logs} idPrefix={`tdb-${t.id}`} />
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
