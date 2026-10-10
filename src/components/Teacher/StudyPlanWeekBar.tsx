import React from 'react';
import { CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { normalizeWeekStartDay, planDayName, weekRangeLabel, WEEK_START_DAY_OPTIONS, type WeekStartDay } from '../../services/studyPlanService';
import { cx } from '../ui/kit';
import { inputCls } from './FormParts';

// ============================================================================
// Haftalık plan — kompakt hafta ve işlem paneli (öğrenci ve sınıf görünümünde ortak)
//  * Sol sütun (sabit genişlik): "Hafta başlangıç günü" açılır listesi, hemen altında
//    aynı boyutta hafta gezgini (← hafta →), en altta "Bu hafta" ve tarihle seçim.
//  * Sağ sütun: durum çipleri, gönder düğme(ler)i ve işlem döşemeleri
//    (PDF, Excel, Başkalarına / başka haftaya uygula, Kitaplar).
//  * Mobilde tüm bölümler alt alta dizilir.
// ============================================================================

// Dar ekranda hafta günleri kısa adla gösterilir
const SHORT_DAY: Record<string, string> = { Pazartesi: 'Pzt', Salı: 'Sal', Çarşamba: 'Çar', Perşembe: 'Per', Cuma: 'Cum', Cumartesi: 'Cmt', Pazar: 'Paz' };

/** Gönder satırındaki düğmeler için ortak sınıf (varyantı çağıran ekler: ui-btn-primary vb.). */
export const planMainBtnCls = 'ui-btn ui-btn-sm min-h-10 w-full whitespace-normal text-center leading-tight';
/** İşlem döşemeleri için ortak sınıf (ikon üstte, etiket altta). */
export const planTileCls =
  'ui-btn ui-btn-secondary relative w-full min-h-[3.75rem] flex-col gap-1 px-2 py-2 text-xs leading-tight whitespace-normal text-center';

/** Panelin sağ sütununa yerleşen içerik (öğrenci ve sınıf görünümü kendi düğmelerini verir). */
export type PlanWeekBarSlots = {
  /** Durum çipleri (sağ sütunun üstü) */
  status?: React.ReactNode;
  /** Durum satırının sağ ucu (ör. "Planı temizle") */
  statusEnd?: React.ReactNode;
  /** Gönder / geri çek düğmeleri */
  primary?: React.ReactNode;
  /** İşlem döşemeleri: PDF, Excel, uygula, kitaplar */
  actions?: React.ReactNode;
  /** Sağ sütunun altındaki kısa not */
  footer?: React.ReactNode;
};

export const StudyPlanWeekBar: React.FC<
  {
    weekStart: string;
    thisWeek: string;
    startDay: WeekStartDay;
    onShift: (delta: number) => void;
    onToday: () => void;
    onPickDate: (date: string) => void;
    onStartDayChange: (v: WeekStartDay) => void;
  } & PlanWeekBarSlots
> = ({ weekStart, thisWeek, startDay, onShift, onToday, onPickDate, onStartDayChange, status, statusEnd, primary, actions, footer }) => {
  const isThisWeek = weekStart === thisWeek;
  const weekState = isThisWeek
    ? { text: 'Bu hafta', cls: 'ui-chip-success' }
    : weekStart > thisWeek
      ? { text: 'Gelecek hafta', cls: 'ui-chip-info' }
      : { text: 'Geçmiş hafta', cls: 'ui-chip-neutral' };
  const label = weekRangeLabel(weekStart);
  const firstDay = planDayName(weekStart, 0);
  const lastDay = planDayName(weekStart, 6);
  const hasSide = Boolean(status || statusEnd || primary || actions || footer);

  return (
    <section id="plan-week-bar" aria-label="Hafta seçimi ve plan işlemleri" className="rounded-2xl border border-line bg-surface-2/50 p-3 sm:p-4">
      <div className={cx('grid gap-3 sm:gap-4', hasSide && 'lg:grid-cols-[19rem_minmax(0,1fr)]')}>
        {/* ---------------- Sol: başlangıç günü + hafta gezgini (aynı genişlik) ---------------- */}
        <div id="plan-week-controls" className={cx('flex min-w-0 flex-col gap-2', !hasSide && 'sm:max-w-[19rem]')}>
          {/* 1) Hafta başlangıç günü — kompakt açılır liste */}
          <div className="relative h-14 rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-line-strong focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg bg-brand-soft text-brand-fg">
              <CalendarRange className="h-4 w-4" />
            </span>
            <label id="plan-week-start-day-label" htmlFor="plan-week-start-day" className="pointer-events-none absolute left-14 top-2 text-[11px] font-medium text-muted">
              Hafta başlangıç günü
            </label>
            <select
              id="plan-week-start-day"
              value={startDay}
              onChange={(e) => onStartDayChange(normalizeWeekStartDay(e.target.value))}
              title={`Plan ${firstDay} günü başlar, ${lastDay} günü biter. (Varsayılan: Pazartesi)`}
              className="h-full w-full cursor-pointer appearance-none rounded-xl bg-transparent pl-14 pr-9 pt-4 text-sm font-bold text-fg focus:outline-none"
            >
              {WEEK_START_DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          </div>

          {/* 2) Hafta gezgini — açılır listeyle aynı boyutta */}
          <div className="flex h-14 items-stretch overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <button
              type="button"
              id="plan-week-prev"
              aria-label="Önceki hafta"
              title="Önceki hafta"
              className="grid w-11 shrink-0 cursor-pointer place-items-center border-r border-line text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:bg-surface-2"
              onClick={() => onShift(-1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 text-center" aria-live="polite">
              <div className="flex min-w-0 max-w-full items-center gap-1.5">
                <span id="plan-week-status" className={cx('ui-chip shrink-0 px-1.5 py-0 text-[10px] leading-4', weekState.cls)}>
                  {weekState.text}
                </span>
                <span id="plan-week-days" className="truncate text-[11px] text-muted" title={`${firstDay} – ${lastDay}`}>
                  <span className="sm:hidden">
                    {SHORT_DAY[firstDay] || firstDay} – {SHORT_DAY[lastDay] || lastDay}
                  </span>
                  <span className="hidden sm:inline">
                    {firstDay} – {lastDay}
                  </span>
                </span>
              </div>
              <p id="plan-week-label" title={label} className="mt-0.5 max-w-full truncate text-sm font-bold leading-tight text-fg">
                {label}
              </p>
            </div>
            <button
              type="button"
              id="plan-week-next"
              aria-label="Sonraki hafta"
              title="Sonraki hafta"
              className="grid w-11 shrink-0 cursor-pointer place-items-center border-l border-line text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg focus:outline-none focus-visible:bg-surface-2"
              onClick={() => onShift(1)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* 3) Kısayollar: bu haftaya dön + tarihle seç */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="plan-week-today"
              className="ui-btn ui-btn-secondary ui-btn-sm h-9 shrink-0"
              onClick={onToday}
              disabled={isThisWeek}
              title={isThisWeek ? 'Zaten bu haftadasınız' : 'Bu haftaya dön'}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Bu hafta
            </button>
            <div className="relative min-w-0 flex-1">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-subtle sm:block" />
              <input
                type="date"
                aria-label="Haftayı tarihle seç"
                title="Haftayı tarihle seç"
                id="plan-week-date"
                value={weekStart}
                onChange={(e) => e.target.value && onPickDate(e.target.value)}
                className={cx(inputCls, 'h-9 py-1 sm:pl-9')}
              />
            </div>
          </div>
        </div>

        {/* ---------------- Sağ: durum + işlemler ---------------- */}
        {hasSide && (
          <div id="plan-week-side" className="flex min-w-0 flex-col gap-2.5 border-t border-line pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            {(status || statusEnd) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">{status}</div>
                {statusEnd}
              </div>
            )}
            {primary && (
              <div id="plan-week-primary" className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
                {primary}
              </div>
            )}
            {actions && (
              <div id="plan-week-actions" role="toolbar" aria-label="Plan işlemleri" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {actions}
              </div>
            )}
            {footer}
          </div>
        )}
      </div>
    </section>
  );
};
