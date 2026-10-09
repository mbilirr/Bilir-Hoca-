import React from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { planDayName, weekRangeLabel, WEEK_START_DAY_OPTIONS, type WeekStartDay } from '../../services/studyPlanService';
import { cx } from '../ui/kit';
import { inputCls } from './FormParts';

// ============================================================================
// Haftalık plan — hafta çubuğu (öğrenci ve sınıf görünümünde ortak)
//  * Üst satır: önceki / sonraki hafta, büyük hafta etiketi, "Bu hafta" ve tarihle seçim.
//  * Alt satır: belirgin "Hafta başlangıç günü" seçicisi (7 gün düğmesi; mobilde kısa adlar).
// ============================================================================

const SHORT_DAY: Record<WeekStartDay, string> = { 0: 'Paz', 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt' };

export const StudyPlanWeekBar: React.FC<{
  weekStart: string;
  thisWeek: string;
  startDay: WeekStartDay;
  onShift: (delta: number) => void;
  onToday: () => void;
  onPickDate: (date: string) => void;
  onStartDayChange: (v: WeekStartDay) => void;
}> = ({ weekStart, thisWeek, startDay, onShift, onToday, onPickDate, onStartDayChange }) => {
  const isThisWeek = weekStart === thisWeek;
  const status = isThisWeek
    ? { text: 'Bu hafta', cls: 'ui-chip-success' }
    : weekStart > thisWeek
      ? { text: 'Gelecek hafta', cls: 'ui-chip-info' }
      : { text: 'Geçmiş hafta', cls: 'ui-chip-neutral' };

  return (
    <section id="plan-week-bar" aria-label="Hafta seçimi" className="rounded-2xl border border-line bg-surface-2/50 p-3 sm:p-4 space-y-3">
      {/* Hafta gezgini */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            id="plan-week-prev"
            aria-label="Önceki hafta"
            title="Önceki hafta"
            className="ui-btn ui-btn-secondary ui-btn-icon shrink-0 w-10 h-10"
            onClick={() => onShift(-1)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 rounded-xl bg-surface border border-line px-3 py-2 text-center shadow-card">
            <span className={cx('ui-chip text-[10px] py-0', status.cls)} id="plan-week-status">
              {status.text}
            </span>
            <p id="plan-week-label" className="mt-0.5 text-base sm:text-lg font-bold text-fg leading-tight">
              {weekRangeLabel(weekStart)}
            </p>
            <p id="plan-week-days" className="text-xs text-muted">
              {planDayName(weekStart, 0)} – {planDayName(weekStart, 6)}
            </p>
          </div>
          <button
            type="button"
            id="plan-week-next"
            aria-label="Sonraki hafta"
            title="Sonraki hafta"
            className="ui-btn ui-btn-secondary ui-btn-icon shrink-0 w-10 h-10"
            onClick={() => onShift(1)}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 md:shrink-0">
          {!isThisWeek && (
            <button type="button" id="plan-week-today" className="ui-btn ui-btn-secondary shrink-0" onClick={onToday}>
              <RotateCcw className="w-4 h-4" /> Bu hafta
            </button>
          )}
          <div className="relative flex-1 md:flex-none">
            <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
            <input
              type="date"
              aria-label="Haftayı tarihle seç"
              title="Haftayı tarihle seç"
              id="plan-week-date"
              value={weekStart}
              onChange={(e) => e.target.value && onPickDate(e.target.value)}
              className={cx(inputCls, 'pl-9 md:w-[11rem]')}
            />
          </div>
        </div>
      </div>

      {/* Hafta başlangıç günü */}
      <div className="pt-3 border-t border-line">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-soft text-brand-fg shrink-0">
            <CalendarRange className="w-4 h-4" />
          </span>
          <h3 id="plan-week-start-day-label" className="text-sm font-semibold text-fg">
            Hafta başlangıç günü
          </h3>
          <span className="text-xs text-muted">
            Plan <b className="text-fg-2">{planDayName(weekStart, 0)}</b> günü başlar, <b className="text-fg-2">{planDayName(weekStart, 6)}</b> günü biter.
          </span>
        </div>
        <div
          id="plan-week-start-day"
          role="group"
          aria-labelledby="plan-week-start-day-label"
          title="Haftalık plan hangi gün başlasın? (varsayılan: Pazartesi)"
          className="grid grid-cols-7 gap-1 sm:gap-2"
        >
          {WEEK_START_DAY_OPTIONS.map((o) => {
            const active = o.value === startDay;
            return (
              <button
                key={o.value}
                type="button"
                id={`plan-week-start-day-${o.value}`}
                data-week-start-day={o.value}
                aria-pressed={active}
                aria-label={o.label}
                onClick={() => !active && onStartDayChange(o.value)}
                className={cx(
                  'h-10 sm:h-11 rounded-xl border px-1 text-xs sm:text-sm font-semibold transition-colors cursor-pointer select-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  active
                    ? 'bg-brand text-white border-brand shadow-card'
                    : 'bg-surface text-fg-2 border-line hover:border-line-strong hover:bg-surface-2 hover:text-fg'
                )}
              >
                <span className="sm:hidden">{SHORT_DAY[o.value]}</span>
                <span className="hidden sm:inline">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
