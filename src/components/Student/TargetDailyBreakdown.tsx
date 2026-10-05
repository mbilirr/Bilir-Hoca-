import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Check, Minus } from 'lucide-react';
import type { WeeklyQuestionTarget, StudentQuestionLog } from '../../types';
import { formatDateISO } from '../../utils/questionAnalytics';
import { computeTargetDays, targetDayStatusText, TargetDayRow } from '../../utils/targetDays';
import { cx } from '../ui/kit';

// Bir soru hedefinin gün gün dökümü (Aşama 10b): her gün çözülen soru, günlük hedef ve durum + küçük grafik.
// Öğrenci ve öğretmen ekranlarında aynı bileşen kullanılır; hesap utils/targetDays.ts içindedir (PDF de aynısını kullanır).

const BAR_PX = 56;

export const TargetDailyBreakdown: React.FC<{
  target: WeeklyQuestionTarget;
  studentId: string;
  logs: StudentQuestionLog[];
  defaultOpen?: boolean;
  idPrefix?: string;
}> = ({ target, studentId, logs, defaultOpen, idPrefix = 'tdb' }) => {
  const today = formatDateISO(new Date());
  const res = useMemo(() => computeTargetDays(target, studentId, logs, today), [target, studentId, logs, today]);
  const { rows, daily, subject: subj, metDays, elapsedDays } = res;

  const [open, setOpen] = useState<boolean>(defaultOpen ?? rows.length <= 14);
  if (!rows.length) return null;

  const max = Math.max(daily, ...rows.map((r) => r.solved), 1);
  const targetLinePx = Math.round((daily / max) * BAR_PX);
  const statusText = (r: TargetDayRow) => targetDayStatusText(r, daily);

  return (
    <div className="rounded-xl border border-line bg-surface" id={`${idPrefix}-daily`} data-testid="target-daily">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg cursor-pointer"
      >
        <span>
          Gün gün durum ·{' '}
          <span className="text-muted font-medium" data-testid="target-daily-summary">
            {elapsedDays ? `${metDays}/${elapsedDays} günde hedef tuttu` : 'Henüz geçen gün yok'}
            {rows.some((r) => r.status === 'today') ? ' (bugün devam ediyor)' : ''}
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Küçük grafik: çubuk = çözülen, kesikli çizgi = günlük hedef */}
          <div className="overflow-x-auto">
            <div
              className="relative flex items-end gap-1 min-w-full"
              style={{ height: BAR_PX + 18, minWidth: rows.length > 14 ? rows.length * 18 : undefined }}
              role="img"
              aria-label={`Günlük hedef ${daily} soru; ${rows.map((r) => `${r.label}: ${r.solved}`).join(', ')}`}
            >
              <div
                className="absolute left-0 right-0 border-t border-dashed border-warning/70 pointer-events-none"
                style={{ bottom: 18 + targetLinePx }}
                aria-hidden
              />
              {rows.map((r) => {
                const h = r.solved > 0 ? Math.max(4, Math.round((r.solved / max) * BAR_PX)) : 2;
                return (
                  <div key={r.ymd} className="flex-1 min-w-[14px] flex flex-col items-center justify-end" title={`${r.label} ${r.weekday}: ${r.solved} soru`} aria-hidden>
                    <div
                      data-testid="target-daily-bar"
                      className={cx(
                        'w-full max-w-[22px] rounded-t',
                        r.status === 'met' ? 'bg-success' : r.status === 'future' ? 'bg-surface-3' : r.solved > 0 ? 'bg-warning' : 'bg-surface-3',
                        r.ymd === today && 'ring-2 ring-brand/60'
                      )}
                      style={{ height: h }}
                    />
                    <span className={cx('mt-1 text-[10px] leading-none', r.ymd === today ? 'text-fg font-bold' : 'text-subtle')}>
                      {rows.length > 14 ? r.label.split(' ')[0] : r.weekday}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tablo */}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted">
                <tr>
                  <th className="text-left font-semibold px-2.5 py-1.5">Gün</th>
                  <th className="text-right font-semibold px-2.5 py-1.5">Çözülen</th>
                  <th className="text-right font-semibold px-2.5 py-1.5">Hedef</th>
                  <th className="text-left font-semibold px-2.5 py-1.5">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ymd} data-testid="target-daily-row" className={cx('border-t border-line', r.ymd === today && 'bg-brand-soft/40')}>
                    <td className="px-2.5 py-1.5 text-fg whitespace-nowrap">
                      {r.label} <span className="text-muted">{r.weekday}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-fg tabular-nums">{r.status === 'future' ? '—' : r.solved}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted tabular-nums">{daily}</td>
                    <td className="px-2.5 py-1.5">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1 font-semibold',
                          r.status === 'met'
                            ? 'text-success-fg'
                            : r.status === 'partial'
                              ? 'text-warning-fg'
                              : r.status === 'none'
                                ? 'text-danger-fg'
                                : 'text-muted'
                        )}
                      >
                        {r.status === 'met' ? <Check className="w-3.5 h-3.5" /> : r.status === 'future' ? <Minus className="w-3.5 h-3.5" /> : null}
                        {statusText(r)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subj && <p className="text-[11px] text-muted">Yalnızca {subj} soruları sayılır.</p>}
        </div>
      )}
    </div>
  );
};
