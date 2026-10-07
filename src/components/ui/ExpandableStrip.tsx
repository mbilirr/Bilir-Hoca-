import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx } from './kit';

// ============================================================================
// Yatay şerit (Aşama 21)
// Listelerde büyük kart yerine tek satırlık özet. Şeridin sol tarafına (özet alanı) ya da sağdaki
// ok düğmesine tıklanınca şerit büyür ve ayrıntılar altında açılır. Sağdaki küçük işlem düğmeleri
// (düzenle, kopyala, sil…) şerit kapalıyken de kullanılabilir.
// ============================================================================

export interface ExpandableStripProps {
  id?: string;
  open: boolean;
  onToggle: () => void;
  /** Özet alanının başındaki küçük rozetler (ders, tarih…) */
  badges?: React.ReactNode;
  title: React.ReactNode;
  /** Başlığın altındaki tek satırlık bilgi */
  meta?: React.ReactNode;
  /** Sağda gösterilen sayısal özet (teslim, yoklama, öğrenci sayısı…) */
  stats?: React.ReactNode;
  /** Sağdaki küçük işlem düğmeleri */
  actions?: React.ReactNode;
  /** Şerit açıldığında görünen ayrıntılar */
  children?: React.ReactNode;
  /** Ok düğmesinin erişilebilir adı için konu (ör. "ödev", "etüt") */
  noun?: string;
  className?: string;
  accent?: string; // sol kenar rengi (Tailwind sınıfı)
}

export const ExpandableStrip: React.FC<ExpandableStripProps> = ({
  id,
  open,
  onToggle,
  badges,
  title,
  meta,
  stats,
  actions,
  children,
  noun = 'kayıt',
  className,
  accent = 'border-l-indigo-500',
}) => (
  <div
    id={id}
    data-strip
    data-open={open ? '1' : '0'}
    className={cx(
      'rounded-xl border border-l-4 bg-surface transition-all scroll-mt-24',
      accent,
      open ? 'border-indigo-300 dark:border-indigo-500/50 shadow-md ring-1 ring-indigo-500/10' : 'border-line hover:border-line-strong shadow-sm',
      className
    )}
  >
    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-2.5 py-2 sm:px-3">
      {/* Sol: özet alanı (tıklayınca açılır/kapanır) */}
      <button
        type="button"
        data-strip-toggle
        aria-expanded={open}
        onClick={onToggle}
        className="flex items-start gap-2 min-w-0 flex-1 text-left cursor-pointer rounded-lg -m-1 p-1 hover:bg-surface-2/60"
      >
        <ChevronRight className={cx('w-4 h-4 mt-1 shrink-0 text-muted transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="min-w-0 flex-1">
          {badges && <span className="flex flex-wrap items-center gap-1.5 mb-0.5">{badges}</span>}
          <span className="block text-sm font-bold text-fg truncate" data-strip-title>{title}</span>
          {meta && <span className="block text-xs text-muted truncate mt-0.5">{meta}</span>}
        </span>
      </button>

      {/* Sağ: sayılar, işlemler ve aç/kapat oku */}
      <div className="flex items-center gap-2 sm:gap-3 pl-6 md:pl-0 shrink-0 flex-wrap md:flex-nowrap">
        {stats && <div className="min-w-[7.5rem] flex-1 md:flex-none md:w-56">{stats}</div>}
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
        <button
          type="button"
          data-strip-expand
          aria-expanded={open}
          aria-label={open ? `${noun} ayrıntılarını kapat` : `${noun} ayrıntılarını aç`}
          title={open ? 'Kapat' : 'Ayrıntılar'}
          onClick={onToggle}
          className={cx(
            // Telefonda gizli: şeridin kendisine dokunmak yeterli (yer kazanmak için)
            'hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors border',
            open ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-surface-2 border-line text-fg-2 hover:bg-surface-3'
          )}
        >
          <span>{open ? 'Kapat' : 'Ayrıntı'}</span>
          <ChevronDown className={cx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
    </div>
    {open && children && <div className="border-t border-line px-3 py-3 sm:px-4 sm:py-4">{children}</div>}
  </div>
);

/** Şeritteki küçük simge düğme */
export const StripAction: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' | 'success' }
> = ({ label, tone = 'default', className, children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    {...rest}
    className={cx(
      'p-1.5 rounded-lg transition-colors cursor-pointer text-subtle',
      tone === 'danger'
        ? 'hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10'
        : tone === 'success'
          ? 'hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
          : 'hover:text-fg-2 hover:bg-surface-2',
      className
    )}
  >
    {children}
  </button>
);

/** Şerit sağındaki ince ilerleme özeti */
export const StripProgress: React.FC<{ label: string; value: number; total: number; suffix?: string; done?: boolean }> = ({
  label,
  value,
  total,
  suffix,
  done,
}) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold gap-2">
        <span className="text-muted">{label}</span>
        <span className="text-fg tabular-nums whitespace-nowrap">
          {value} / {total}
          <span className="hidden sm:inline"> ({pct}%)</span>
          {suffix ? <span className="text-muted font-medium"> {suffix}</span> : null}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1">
        <div className={cx('h-full rounded-full transition-all', done || (total > 0 && value >= total) ? 'bg-emerald-500' : 'bg-indigo-500')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
};
