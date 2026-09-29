import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      title,
      subtitle,
      actions,
      className = '',
      headerClassName = '',
      bodyClassName = '',
      ...rest
    },
    ref
  ) => {
    const hasHeader = Boolean(title || subtitle || actions);

    return (
      <div
        ref={ref}
        className={`rounded-2xl border border-slate-200 bg-white shadow-sm p-6 ${className}`}
        {...rest}
      >
        {hasHeader && (
          <div
            className={`flex items-start justify-between gap-4 pb-4 mb-4 border-b border-slate-100 ${headerClassName}`}
          >
            <div className="space-y-1">
              {title && (
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )}
        <div className={bodyClassName}>{children}</div>
      </div>
    );
  }
);

Card.displayName = 'Card';
