import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cx } from '../ui/kit';
import type { Student } from '../../types';
import { foldTr } from '../../lib/deneme/optik';

// ============================================================================
// Aranabilir öğrenci seçici (Aşama 48f): okul numarası ya da ad soyad yazarak bulunur.
// Liste, tablonun kaydırma alanı tarafından kesilmesin diye sayfanın üstünde (portal) açılır.
// ============================================================================

const digits = (s: string) => (s || '').replace(/\D+/g, '').replace(/^0+/, '');
const MAX_SHOWN = 60;

export const OgrenciSecici: React.FC<{
  students: Student[]; // sıralı liste
  byId: Map<string, Student>;
  candidates: string[]; // öneriler (önce gösterilir)
  value: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
}> = ({ students, byId, candidates, value, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sel = value ? byId.get(value) : undefined;

  const label = (s: Student) => `${s.name}${s.className ? ` — ${s.className}` : ''}`;

  const list = useMemo(() => {
    const t = q.trim();
    const cand = candidates.map((id) => byId.get(id)).filter((s): s is Student => !!s);
    if (!t) return { cand, rest: students.filter((s) => !candidates.includes(s.id)).slice(0, MAX_SHOWN), more: Math.max(0, students.length - candidates.length - MAX_SHOWN) };
    const d = digits(t);
    const f = foldTr(t);
    const words = f.split(/\s+/).filter(Boolean);
    const hit = (s: Student) => {
      const num = digits(s.studentNumber || '');
      if (d && /^\d+$/.test(t.replace(/\s+/g, ''))) return !!num && num.startsWith(d);
      const name = foldTr(`${s.name} ${s.className || ''}`);
      return words.every((w) => name.includes(w)) || (!!d && !!num && num.startsWith(d));
    };
    const all = students.filter(hit);
    // tam numara eşleşmesi en üste
    all.sort((a, b) => Number(digits(b.studentNumber || '') === d) - Number(digits(a.studentNumber || '') === d));
    return { cand: [] as Student[], rest: all.slice(0, MAX_SHOWN), more: Math.max(0, all.length - MAX_SHOWN) };
  }, [q, students, candidates, byId]);
  const flat = [...list.cand, ...list.rest];

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 340);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const up = r.bottom + 340 > window.innerHeight && r.top > 360;
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, width, up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(0);
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
  }, [open]);

  const pick = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQ('');
    btnRef.current?.focus();
  };

  const row = (s: Student, i: number) => (
    <button
      key={s.id}
      type="button"
      role="option"
      aria-selected={s.id === value}
      onMouseEnter={() => setActive(i)}
      onClick={() => pick(s.id)}
      className={cx(
        'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors',
        i === active ? 'bg-brand-soft text-fg' : 'text-fg-2 hover:bg-surface-2',
        s.id === value && 'font-semibold'
      )}
    >
      <span className="tabular-nums text-muted w-14 shrink-0">{s.studentNumber ? `No ${s.studentNumber}` : '—'}</span>
      <span className="truncate flex-1">{s.name}</span>
      <span className="text-muted shrink-0">{s.className || 'sınıfsız'}</span>
    </button>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cx('ui-input py-1 text-xs flex items-center gap-2 text-left w-full', !sel && 'text-muted')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sistemdeki öğrenci"
      >
        <span className="truncate flex-1">{sel ? `${sel.studentNumber ? `${sel.studentNumber} · ` : ''}${label(sel)}` : 'Öğrenci seçin'}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-subtle" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={boxRef}
            className="fixed z-[90] bg-surface border border-line rounded-xl shadow-pop overflow-hidden"
            style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            <div className="p-2 border-b border-line relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                ref={inputRef}
                className="ui-input py-1.5 pl-8 text-xs"
                placeholder="Okul numarası ya da ad soyad yazın…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive((a) => Math.min(flat.length - 1, a + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (flat[active]) pick(flat[active].id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                aria-label="Öğrenci ara"
              />
            </div>
            <div role="listbox" className="max-h-72 overflow-y-auto py-1">
              {list.cand.length > 0 && <p className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted">Öneriler</p>}
              {list.cand.map((s, i) => row(s, i))}
              {list.cand.length > 0 && list.rest.length > 0 && <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-muted">Tüm öğrenciler</p>}
              {list.rest.map((s, i) => row(s, list.cand.length + i))}
              {!flat.length && <p className="px-3 py-3 text-xs text-subtle">Öğrenci bulunamadı.</p>}
              {list.more > 0 && <p className="px-3 py-1.5 text-[11px] text-muted">… {list.more} öğrenci daha. Aramayı daraltın.</p>}
            </div>
            {value && (
              <div className="border-t border-line p-1.5">
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm w-full" onClick={() => pick(null)}>
                  <X /> Seçimi kaldır
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
