// Etütler: sayfanın ortak yardımcıları (Aşama 362, EtutManagement.tsx bölündü)
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Etut, Student, ClassGroup } from '../../../types';
import { lazyNamed } from '../../../lib/lazyLoad';

// Aşama 111: TeacherHome ile ortak kapsam kaydı (Benim / Tümü)
export const HOME_SCOPE_KEY = 'edu_home_scope_v1';

// Aşama 111: Takip görünümü ve salt okunur ayrıntı penceresi ayrı parça (yalnız idare / Rehberlik açınca iner)
export const EtutTakipView = lazyNamed<React.ComponentProps<typeof import('../EtutTakipView').EtutTakipView>>(() => import('../EtutTakipView'), 'EtutTakipView');

export const EtutDetayModal = lazyNamed<React.ComponentProps<typeof import('../EtutTakipView').EtutDetayModal>>(() => import('../EtutTakipView'), 'EtutDetayModal');


// Aşama 24: tarih süzgeci
export type DatePreset = 'all' | 'today' | 'week' | 'month' | 'upcoming' | 'past' | 'range';

export const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'today', label: 'Bugün' },
  { value: 'week', label: 'Bu hafta' },
  { value: 'month', label: 'Bu ay' },
  { value: 'upcoming', label: 'Gelecek' },
  { value: 'past', label: 'Geçmiş' },
  { value: 'range', label: 'Tarih aralığı' },
];

// Aşama 30: ders saati süzgeci için yardımcılar
export const NO_TIME = 'none';

/** Etüdün başlangıç saati anahtarı ("09:05" biçiminde); saat yoksa NO_TIME */
export function etutTimeKey(e: Etut): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((e.time || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : NO_TIME;
}

/** Açılır listede görünen yazı: "15:00 – 15:45" (süre yoksa yalnız başlangıç) */
export function etutTimeLabel(e: Etut): string {
  const key = etutTimeKey(e);
  if (key === NO_TIME) return 'Saat belirtilmemiş';
  const dur = Number(e.duration) || 0;
  if (dur <= 0) return key;
  const [h, m] = key.split(':').map(Number);
  const end = h * 60 + m + dur;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${key} – ${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function presetBounds(p: DatePreset, from: string, to: string): [string, string] {
  const now = new Date();
  const today = ymdLocal(now);
  if (p === 'today') return [today, today];
  if (p === 'week') {
    const m = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const s = new Date(m.getFullYear(), m.getMonth(), m.getDate() + 6);
    return [ymdLocal(m), ymdLocal(s)];
  }
  if (p === 'month') return [ymdLocal(new Date(now.getFullYear(), now.getMonth(), 1)), ymdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  if (p === 'upcoming') return [today, ''];
  if (p === 'past') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return ['', ymdLocal(y)];
  }
  if (p === 'range') return from && to && from > to ? [to, from] : [from, to];
  return ['', ''];
}

export interface EtutManagementProps {
  etuts: Etut[];
  students: Student[];
  classes: ClassGroup[];
}

export const ATT_ETUT_KEY = 'bilir.etut.yoklama.secili.v1';

// ---------------------------------------------------------------------------
// Öğretmen süzgeci — özel açılır liste (Aşama 32)
// Aşama 211: kutu diğer süzgeçlerle aynı ortak ölçüde (ui-field: 32 px, 12 px yazı); liste maddeleri 12 px
// Yoklama görünümünde, biten etüdünün yoklamasını almamış öğretmenler kırmızı yanıp söner.
// ---------------------------------------------------------------------------
export const TeacherPicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Array<[string, number]>;
  missing: Map<string, number>;
  /** Yanıp sönmesi gereken öğretmenler (eksik yoklaması olup henüz tıklanmamış) */
  blinking: Set<string>;
  /** Yanıp sönen öğretmen seçilince çağrılır (o öğretmenin eksik etütleri "görüldü" sayılır) */
  onAcknowledge: (teacher: string) => void;
  blink: boolean;
}> = ({ value, onChange, allLabel, options, missing, blinking, onAcknowledge, blink }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const totalMissing = Array.from(missing.values()).reduce((a, b) => a + b, 0);
  const missingTeachers = options.filter(([t]) => (missing.get(t) || 0) > 0).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = value === 'all' ? allLabel : `${value} (${options.find(([t]) => t === value)?.[1] ?? 0})`;
  const currentMissing = value !== 'all' ? missing.get(value) || 0 : 0;
  const triggerBlink = blink && (value === 'all' ? blinking.size > 0 : blinking.has(value) && currentMissing > 0);

  const pick = (v: string) => {
    if (v !== 'all' && blinking.has(v)) onAcknowledge(v);
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        id="etut-list-teacher"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="etut-list-teacher-label etut-list-teacher"
        onClick={() => setOpen((o) => !o)}
        className={`ui-field w-full flex items-center justify-between gap-2 text-left cursor-pointer ${
          triggerBlink ? 'notify-blink notify-blink-rose' : ''
        }`}
      >
        {/* Görünmeyen ölçü yazıları: düğme, listedeki EN UZUN seçenek kadar geniş olur (diğer kutularla eşitlenebilsin) */}
        <span className="grid min-w-0">
          <span className="truncate [grid-area:1/1]">{current}</span>
          {[allLabel, ...options.map(([t, n]) => `${t} (${n})`)].map((label) => (
            <span key={label} aria-hidden className="invisible h-0 overflow-hidden whitespace-nowrap [grid-area:1/1]">
              {label}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {blink && totalMissing > 0 && (
            <span className="text-2xs font-bold text-danger-fg" title={`${missingTeachers} öğretmen, ${totalMissing} etüt yoklaması eksik`}>
              ⚠ {missingTeachers}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-labelledby="etut-list-teacher-label"
          className="absolute z-40 mt-1 left-0 right-0 max-h-72 overflow-y-auto bg-surface border border-line rounded-xl shadow-pop p-1.5 space-y-0.5"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === 'all'}
              onClick={() => pick('all')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${value === 'all' ? 'bg-brand-soft text-brand-fg font-semibold' : 'hover:bg-surface-2 text-fg'}`}
            >
              {allLabel}
            </button>
          </li>
          {options.map(([t, n]) => {
            const miss = missing.get(t) || 0;
            const flag = blink && miss > 0 && blinking.has(t); // yanıp sönme (tıklanınca durur)
            const showMiss = blink && miss > 0; // "N yoklama eksik" yazısı yoklama alınana kadar kalır
            return (
              <li key={t}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === t}
                  data-missing-attendance={miss || undefined}
                  onClick={() => pick(t)}
                  className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border border-transparent ${
                    flag ? 'notify-blink notify-blink-rose font-semibold text-fg' : value === t ? 'bg-brand-soft text-brand-fg font-semibold' : 'hover:bg-surface-2 text-fg'
                  }`}
                >
                  <span className="truncate">
                    {t} ({n})
                  </span>
                  {showMiss && <span className="shrink-0 text-xs font-bold text-danger-fg">{miss} yoklama eksik</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
