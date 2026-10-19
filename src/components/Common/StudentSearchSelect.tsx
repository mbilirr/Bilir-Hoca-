import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cx } from '../ui/kit';
import type { Student } from '../../types';

// ============================================================================
// Aşama 57: Aranabilir öğrenci açılır listesi (sitedeki öğrenci <select>'lerinin yerine)
//  * Tıklanınca önce ARAMA kutusu açılır: okul numarası ya da ad soyad yazılarak öğrenci bulunur.
//  * Yön tuşları + Enter ile seçilir, Esc ile kapanır. Liste sayfanın üstünde (portal) açılır;
//    pencere (modal) ya da kaydırma alanı tarafından kesilmez.
//  * value / onChange düz <select> ile aynıdır (boş metin = seçim yok).
// ============================================================================

const MAX_SHOWN = 80;
const digits = (s: string) => (s || '').replace(/\D+/g, '').replace(/^0+/, '');
const fold = (v: string) =>
  (v || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');

export const StudentSearchSelect: React.FC<{
  id?: string;
  students: Student[]; // gösterim sırası
  value: string;
  onChange: (id: string) => void;
  placeholder?: string; // seçim yokken düğmede yazan
  /** Verilirse "seçimi kaldır" seçeneği çıkar (boş değer) */
  clearLabel?: string;
  disabled?: boolean;
  showClass?: boolean;
  className?: string; // düğmenin görünümü (sayfadaki diğer kutularla aynı olsun diye)
  ariaLabel?: string;
}> = ({ id, students, value, onChange, placeholder = 'Öğrenci seçin', clearLabel, disabled, showClass = true, className, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sel = value ? students.find((s) => s.id === value) : undefined;

  const { shown, more } = useMemo(() => {
    const t = q.trim();
    if (!t) return { shown: students.slice(0, MAX_SHOWN), more: Math.max(0, students.length - MAX_SHOWN) };
    const compact = t.replace(/\s+/g, '');
    const onlyDigits = /^\d+$/.test(compact);
    const d = digits(t);
    const words = fold(t).split(/\s+/).filter(Boolean);
    const hit = (s: Student) => {
      const num = digits(s.studentNumber || '');
      if (onlyDigits) return !!num && num.startsWith(d);
      const name = fold(`${s.name} ${s.className || ''} ${s.studentNumber || ''}`);
      return words.every((w) => name.includes(w));
    };
    const all = students.filter(hit);
    if (onlyDigits) all.sort((a, b) => Number(digits(b.studentNumber || '') === d) - Number(digits(a.studentNumber || '') === d));
    else {
      // adı aranan kelimeyle BAŞLAYANLAR öne
      const f0 = words[0] || '';
      all.sort((a, b) => Number(fold(b.name).startsWith(f0)) - Number(fold(a.name).startsWith(f0)));
    }
    return { shown: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) };
  }, [q, students]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(window.innerWidth - 16, Math.max(r.width, 320));
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const up = r.bottom + 360 > window.innerHeight && r.top > 380;
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // açılınca etkin satır seçili öğrenci olsun; arama kutusuna odaklan
    const i = sel ? shown.findIndex((s) => s.id === sel.id) : -1;
    setActive(i >= 0 ? i : 0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (boxRef.current?.contains(n) || btnRef.current?.contains(n)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (boxRef.current && e.target instanceof Node && boxRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // etkin satır görünür kalsın
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (sid: string) => {
    onChange(sid);
    setOpen(false);
    setQ('');
    btnRef.current?.focus();
  };

  const text = (s: Student) => `${s.studentNumber ? `${s.studentNumber} · ` : ''}${s.name}${showClass && s.className ? ` — ${s.className}` : ''}`;

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          // kapalıyken yazmaya başlanırsa arama açılır ve harf kutuya yazılır
          if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setQ(e.key);
            setOpen(true);
          } else if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(className || 'ui-input', 'flex items-center gap-2 text-left w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={cx('truncate flex-1', !sel && 'text-muted')}>{sel ? text(sel) : placeholder}</span>
        <ChevronDown className={cx('w-4 h-4 shrink-0 text-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={boxRef}
            className="fixed z-[120] bg-surface border border-line rounded-xl shadow-pop overflow-hidden"
            style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            <div className="p-2 border-b border-line relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                ref={inputRef}
                className="ui-input py-1.5 pl-8 text-sm"
                placeholder="Okul numarası ya da ad soyad yazın…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(shown.length - 1, a + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (shown[active]) pick(shown[active].id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    btnRef.current?.focus();
                  } else if (e.key === 'Tab') {
                    setOpen(false);
                  }
                }}
                aria-label="Öğrenci ara"
                autoComplete="off"
              />
            </div>
            <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {shown.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  data-i={i}
                  aria-selected={s.id === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s.id)}
                  className={cx(
                    'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors cursor-pointer',
                    i === active ? 'bg-brand-soft text-fg' : 'text-fg-2 hover:bg-surface-2',
                    s.id === value && 'font-semibold'
                  )}
                >
                  <span className="tabular-nums text-muted w-16 shrink-0 text-xs">{s.studentNumber ? `No ${s.studentNumber}` : '—'}</span>
                  <span className="truncate flex-1">{s.name}</span>
                  {showClass && <span className="text-muted shrink-0 text-xs">{s.className || 'sınıfsız'}</span>}
                </button>
              ))}
              {!shown.length && <p className="px-3 py-3 text-xs text-subtle">{students.length ? 'Öğrenci bulunamadı.' : 'Listede öğrenci yok.'}</p>}
              {more > 0 && <p className="px-3 py-1.5 text-[11px] text-muted">… {more} öğrenci daha. Aramayı daraltın.</p>}
            </div>
            {clearLabel && value && (
              <div className="border-t border-line p-1.5">
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm w-full" onClick={() => pick('')}>
                  <X /> {clearLabel}
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
