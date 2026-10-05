import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, BookOpen } from 'lucide-react';
import { cx } from '../ui/kit';

// ============================================================================
// Ders seçimi (Aşama 14): açılır pencere, her dersin yanında kutucuk.
// Hiç ders seçilmezse "Tüm dersler" anlamına gelir (allowAll açıksa).
// ============================================================================

export const SubjectMultiSelect: React.FC<{
  id: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  allowAll: boolean;
  allLabel?: string;
}> = ({ id, options, value, onChange, allowAll, allLabel = 'Tüm dersler (genel hedef)' }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Seçim sırası ders listesindeki sıraya göre tutulur
  const ordered = (list: string[]) => options.filter((o) => list.includes(o)).concat(list.filter((x) => !options.includes(x)));
  const toggle = (s: string) => {
    const on = value.includes(s);
    if (on && !allowAll && value.length === 1) return; // en az bir ders kalmalı
    onChange(ordered(on ? value.filter((x) => x !== s) : [...value, s]));
  };

  const label =
    value.length === 0
      ? allowAll
        ? allLabel
        : 'Ders seçin'
      : value.length <= 3
        ? value.join(', ')
        : `${value.length} ders: ${value.slice(0, 2).join(', ')}…`;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-surface text-left cursor-pointer transition-colors',
          open ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:border-line-strong'
        )}
      >
        <BookOpen className="w-4 h-4 text-warning-fg shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-fg truncate" id={`${id}-label`}>
          {label}
        </span>
        {value.length > 1 && (
          <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-warning-soft text-warning-fg shrink-0">{value.length} ders</span>
        )}
        <ChevronDown className={cx('w-4 h-4 text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1.5 w-full rounded-xl border border-line bg-surface shadow-pop overflow-hidden"
          id={`${id}-panel`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Yalnızca listeyi kapat; hedef penceresi açık kalsın
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setOpen(false);
              document.getElementById(id)?.focus();
            }
          }}
        >
          <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {allowAll && (
              <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-line bg-surface-2/60 hover:bg-surface-2">
                <input
                  type="checkbox"
                  data-subject=""
                  checked={value.length === 0}
                  onChange={() => onChange([])}
                  className="w-4 h-4 accent-[var(--color-brand)] cursor-pointer"
                />
                <span className="text-sm font-semibold text-fg">{allLabel}</span>
              </label>
            )}
            {options.map((s) => {
              const on = value.includes(s);
              return (
                <label key={s} className={cx('flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-line last:border-b-0', on ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                  <input
                    type="checkbox"
                    data-subject={s}
                    checked={on}
                    onChange={() => toggle(s)}
                    className="w-4 h-4 accent-[var(--color-brand)] cursor-pointer"
                  />
                  <span className="text-sm text-fg">{s}</span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-line bg-surface-2/60">
            <span className="text-[11px] text-muted">
              {value.length === 0 ? (allowAll ? 'Tüm derslerin soruları sayılır' : 'En az bir ders seçin') : `${value.length} ders seçili`}
            </span>
            <button type="button" id={`${id}-done`} className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setOpen(false)}>
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
