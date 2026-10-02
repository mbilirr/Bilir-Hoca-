import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
  rightIconLabel?: string;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      onRightIconClick,
      rightIconLabel,
      id,
      className = '',
      containerClassName = '',
      disabled,
      ...rest
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className={`w-full space-y-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`block text-xs font-semibold uppercase tracking-wider ${
              hasError ? 'text-red-600 dark:text-red-300' : 'text-subtle'
            }`}
          >
            {label}
          </label>
        )}
        <div className="relative rounded-lg shadow-xs">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={hasError ? 'true' : 'false'}
            aria-describedby={
              hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            className={`block w-full rounded-lg text-sm transition-colors text-fg bg-surface placeholder-subtle py-2.5 ${
              leftIcon ? 'pl-10' : 'pl-3.5'
            } ${rightIcon ? 'pr-10' : 'pr-3.5'} border ${
              hasError
                ? 'border-red-300 dark:border-red-500/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                : 'border-line-strong focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
            } ${
              disabled
                ? 'bg-surface-2 text-muted cursor-not-allowed border-line'
                : ''
            } focus:outline-none ${className}`}
            {...rest}
          />
          {rightIcon && (
            onRightIconClick ? (
              <button
                type="button"
                onClick={onRightIconClick}
                aria-label={rightIconLabel || 'Girdi ikonu'}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-subtle cursor-pointer focus:outline-none"
              >
                {rightIcon}
              </button>
            ) : (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted">
                {rightIcon}
              </div>
            )
          )}
        </div>
        {hasError ? (
          <p id={`${inputId}-error`} className="text-xs text-red-600 dark:text-red-300 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-xs text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
