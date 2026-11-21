import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Aşama 347: TEK DÜĞME. Bütün site için ortak düğme; görünümü index.css'teki .ui-btn ailesinden gelir:
 * boy her zaman 32 px (h-8, dokunmatikte en az 36 px), yazı xs, köşe rounded-lg.
 * Yeni kodda elle <button className="h-9 …"> yazılmaz; bu bileşen ya da .ui-btn sınıfları kullanılır.
 *
 *  variant  : primary (lacivert ana iş) | secondary (çerçeveli) | ghost (zeminsiz) | danger | danger-soft | success | warning
 *  size     : sm | md | lg  → yalnız yan boşluk değişir, boy aynı kalır
 *  genislik : kisa | orta | uzun → en az 6 / 7 / 8 rem (yan yana düğmeler simetrik dursun diye)
 *  ikon     : yalnız simgeli kare düğme (aria-label verin)
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-soft' | 'success' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonGenislik = 'kisa' | 'orta' | 'uzun';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  genislik?: ButtonGenislik;
  ikon?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARYANT: Record<ButtonVariant, string> = {
  primary: 'ui-btn-primary',
  secondary: 'ui-btn-secondary',
  outline: 'ui-btn-secondary', // eski ad; secondary ile aynı
  ghost: 'ui-btn-ghost',
  danger: 'ui-btn-danger',
  'danger-soft': 'ui-btn-danger-soft',
  success: 'ui-btn-success',
  warning: 'ui-btn-warning',
};
const BOY: Record<ButtonSize, string> = { sm: 'ui-btn-sm', md: '', lg: 'ui-btn-lg' };
const GENISLIK: Record<ButtonGenislik, string> = { kisa: 'min-w-24', orta: 'min-w-28', uzun: 'min-w-32' };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      genislik,
      ikon = false,
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const kapali = disabled || isLoading;
    const sinif = ['ui-btn', VARYANT[variant], ikon ? 'ui-btn-icon' : BOY[size], genislik && !ikon ? GENISLIK[genislik] : '', className]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} type={type} disabled={kapali} aria-busy={isLoading || undefined} className={sinif} {...rest}>
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            {!ikon && <span>{loadingText || 'Yükleniyor…'}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
