import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Sun, Moon } from 'lucide-react';
import { useTheme, THEME_SWITCH_ENABLED } from '../../lib/theme';

// ============================================================================
// ORTAK ARAYÜZ PARÇALARI (Aşama 8)
// Tüm ekranlar aynı başlık, kart, istatistik, boş durum ve pencere yapısını
// kullanır. Renkler index.css'teki tasarım belirteçlerinden gelir.
// ============================================================================

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneIconBox: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-fg',
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  neutral: 'bg-surface-2 text-fg-2',
};

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type IconType = React.ComponentType<{ className?: string }>;

// Renkli ikon kutusu
export const IconBox: React.FC<{ icon: IconType; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  icon: Icon,
  tone = 'brand',
  size = 'md',
  className,
}) => {
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-xl';
  const ic = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  return (
    <span className={cx('inline-flex items-center justify-center shrink-0', box, toneIconBox[tone], className)}>
      <Icon className={ic} />
    </span>
  );
};

// Sayfa / modül başlığı: başlık + kısa açıklama + sağda işlemler
export const PageHeader: React.FC<{
  icon?: IconType;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon, tone = 'brand', title, description, actions, className }) => (
  <div className={cx('flex flex-col sm:flex-row sm:items-center justify-between gap-3', className)}>
    <div className="flex items-center gap-3 min-w-0">
      {icon && <IconBox icon={icon} tone={tone} />}
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg truncate">{title}</h1>
        {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// Kart / panel
export const Panel: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  id?: string;
}> = ({ title, description, icon, tone = 'brand', actions, children, className, bodyClassName, padded = true, id }) => (
  <section id={id} className={cx('ui-card', className)}>
    {(title || actions) && (
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <IconBox icon={icon} tone={tone} size="sm" />}
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-fg truncate">{title}</h2>}
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
    )}
    <div className={cx(padded && (title || actions ? 'px-4 sm:px-5 pb-4 sm:pb-5' : 'ui-card-pad'), bodyClassName)}>
      {children}
    </div>
  </section>
);

// Sayı kartı
export const StatCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
  id?: string;
}> = ({ label, value, hint, icon, tone = 'brand', onClick, className, id }) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="ui-eyebrow">{label}</span>
        {icon && <IconBox icon={icon} tone={tone} size="sm" />}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-fg tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        onClick={onClick}
        className={cx(
          'ui-card ui-card-pad text-left w-full transition-all hover:border-line-strong hover:-translate-y-0.5 cursor-pointer',
          className
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <div id={id} className={cx('ui-card ui-card-pad', className)}>
      {content}
    </div>
  );
};

// Boş durum
export const EmptyState: React.FC<{
  icon?: IconType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cx('flex flex-col items-center text-center px-6 py-10', className)}>
    {icon && <IconBox icon={icon} tone="neutral" size="lg" className="mb-3" />}
    <p className="text-sm font-semibold text-fg">{title}</p>
    {description && <p className="text-xs text-muted mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// Bölüm içi sekmeler (segment düğmeleri)
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: Array<{ value: T; label: React.ReactNode; icon?: IconType; badge?: React.ReactNode; id?: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cx('inline-flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-line max-w-full overflow-x-auto', className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            id={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}

// Açılır pencere (Esc ile kapanır, arka plan kaydırılmaz)
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  closeOnBackdrop?: boolean;
}> = ({ open, onClose, title, description, icon, tone = 'brand', size = 'md', footer, children, id, closeOnBackdrop = true }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // onClose her çizimde yeni bir işlev olabilir; efekt onu yeniden başlatmasın (yoksa her harfte odak kutudan alınır)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Odağı yalnızca pencere ilk açıldığında ve içinde henüz bir şey odaklı değilse pencereye ver
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  const width =
    size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : size === 'xl' ? 'sm:max-w-5xl' : size === 'full' ? 'sm:max-w-[min(96vw,1400px)]' : 'sm:max-w-xl';

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/55 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id={id}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cx(
          'w-full bg-surface text-fg border border-line shadow-pop flex flex-col max-h-[92vh] outline-none',
          'rounded-t-2xl sm:rounded-2xl',
          width
        )}
      >
        {(title || icon) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <IconBox icon={icon} tone={tone} />}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-base sm:text-lg font-semibold text-fg">
                    {title}
                  </h2>
                )}
                {description && <p className="text-xs sm:text-sm text-muted mt-0.5">{description}</p>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="ui-btn ui-btn-ghost ui-btn-icon -mr-2 -mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2/60 rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

// Tema düğmesi (geçiş dönemi bitene kadar gizli)
export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const [theme, setTheme] = useTheme();
  if (!THEME_SWITCH_ENABLED) return null;
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      id="theme-toggle-btn"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={cx('ui-btn ui-btn-ghost ui-btn-icon', className)}
      title={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
};
