import React from 'react';

/** Aşama 294: 6 haneli doğrulama kodu alanı (telefon klavyesi rakam açar, SMS / uygulama önerisi dolar) */
export const KodKutusu: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  onTam?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  hata?: boolean;
}> = ({ id, value, onChange, onTam, disabled, autoFocus, hata }) => (
  <input
    id={id}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]*"
    maxLength={6}
    aria-label="6 haneli kod"
    aria-invalid={hata || undefined}
    placeholder="••••••"
    autoFocus={autoFocus}
    disabled={disabled}
    value={value}
    onChange={(e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
      onChange(v);
      if (v.length === 6 && v !== value) onTam?.(v);
    }}
    className={`ui-input h-11 w-44 text-center text-xl font-bold tabular-nums tracking-[0.35em] pl-[0.35em] ${hata ? 'border-danger' : ''}`}
  />
);
