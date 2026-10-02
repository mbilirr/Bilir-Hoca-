import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, School, BookOpen, CalendarDays, CornerDownLeft, X } from 'lucide-react';
import type { Student, ClassGroup, Homework, Etut, TeacherTabType } from '../../types';
import { teacherNavFor } from './navItems';
import { IconBox, cx, type Tone } from '../ui/kit';
import { setQuickFocus, type QuickFocusType } from '../../lib/quickFocus';

// Türkçe harfleri sadeleştirerek arama: "ogrenci" yazınca "Öğrenci" bulunur
export const normalizeTr = (s: string) =>
  (s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .trim();

const matches = (query: string, ...fields: Array<string | undefined>) => {
  const words = normalizeTr(query).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const hay = normalizeTr(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
};

const formatDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(d.length <= 10 ? d + 'T00:00' : d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

interface ResultItem {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  run: () => void;
}

export const OPEN_SEARCH_EVENT = 'app-open-search';
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

export const CommandPalette: React.FC<{
  isAdmin: boolean;
  students: Student[];
  classes: ClassGroup[];
  homeworks: Homework[];
  etuts: Etut[];
  onNavigate: (tab: TeacherTabType) => void;
}> = ({ isAdmin, students, classes, homeworks, etuts, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Kısayollar: Ctrl+K / Cmd+K her yerde, "/" yazı alanı dışında
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 0);
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const close = () => setOpen(false);

  const go = (tab: TeacherTabType, focus?: { type: QuickFocusType; id: string; label: string }) => {
    close();
    onNavigate(tab);
    if (focus) setTimeout(() => setQuickFocus(focus.type, focus.id, focus.label), 0);
  };

  const results: ResultItem[] = useMemo(() => {
    const q = query.trim();
    const pages = teacherNavFor(isAdmin)
      .filter((n) => !q || matches(q, n.title, n.description, n.keywords))
      .map<ResultItem>((n) => ({
        key: 'page-' + n.id,
        group: 'Sayfalar',
        title: n.title,
        subtitle: n.description,
        icon: n.icon,
        tone: n.tone,
        run: () => go(n.id),
      }));
    if (!q) return pages;

    const studentRes = students
      .filter((s) => matches(q, s.name, s.studentNumber, s.className, s.username))
      .slice(0, 6)
      .map<ResultItem>((s) => ({
        key: 'std-' + s.id,
        group: 'Öğrenciler',
        title: s.name,
        subtitle: [s.className, s.studentNumber ? `No: ${s.studentNumber}` : ''].filter(Boolean).join(' · '),
        icon: User,
        tone: 'brand',
        run: () => go('students', { type: 'student', id: s.id, label: s.name }),
      }));

    const classRes = classes
      .filter((c) => matches(q, c.name))
      .slice(0, 4)
      .map<ResultItem>((c) => ({
        key: 'cls-' + c.id,
        group: 'Sınıflar',
        title: c.name,
        subtitle: `${students.filter((s) => s.classId === c.id).length} öğrenci`,
        icon: School,
        tone: 'neutral',
        run: () => go('students', { type: 'class', id: c.id, label: c.name }),
      }));

    const hwRes = homeworks
      .filter((h) => matches(q, h.title, h.subject, h.description))
      .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
      .slice(0, 5)
      .map<ResultItem>((h) => ({
        key: 'hw-' + h.id,
        group: 'Ödevler',
        title: h.title,
        subtitle: [h.subject, h.dueDate ? `Son: ${formatDate(h.dueDate)}` : ''].filter(Boolean).join(' · '),
        icon: BookOpen,
        tone: 'success',
        run: () => go('homework', { type: 'homework', id: h.id, label: h.title }),
      }));

    const etutRes = etuts
      .filter((e) => matches(q, e.subject, e.topic, e.location, e.teacherName))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 4)
      .map<ResultItem>((e) => ({
        key: 'etut-' + e.id,
        group: 'Etütler',
        title: `${e.subject}${e.topic ? ' – ' + e.topic : ''}`,
        subtitle: [formatDate(e.date), e.time, e.location].filter(Boolean).join(' · '),
        icon: CalendarDays,
        tone: 'info',
        run: () => go('etuts', { type: 'etut', id: e.id, label: e.subject }),
      }));

    return [...pages, ...studentRes, ...classRes, ...hwRes, ...etutRes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isAdmin, students, classes, homeworks, etuts]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  let lastGroup = '';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh] bg-slate-950/55 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        id="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Hızlı arama"
        className="w-full max-w-xl bg-surface border border-line rounded-2xl shadow-pop overflow-hidden flex flex-col max-h-[75vh]"
      >
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="w-5 h-5 text-muted shrink-0" />
          <input
            ref={inputRef}
            id="command-palette-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Öğrenci, sınıf, ödev, etüt veya sayfa ara…"
            className="flex-1 bg-transparent py-4 text-base text-fg placeholder:text-subtle outline-none focus:outline-none focus-visible:outline-none"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[active] ? `cp-item-${active}` : undefined}
          />
          <button type="button" onClick={close} className="ui-btn ui-btn-ghost ui-btn-icon -mr-2" aria-label="Aramayı kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">“{query}” için sonuç bulunamadı.</div>
          ) : (
            results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <React.Fragment key={r.key}>
                  {header && <div className="px-3 pt-3 pb-1.5 ui-eyebrow">{header}</div>}
                  <button
                    type="button"
                    id={`cp-item-${i}`}
                    data-idx={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => r.run()}
                    className={cx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors',
                      i === active ? 'bg-brand-soft' : 'hover:bg-surface-2'
                    )}
                  >
                    <IconBox icon={r.icon} tone={r.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg truncate">{r.title}</span>
                      {r.subtitle && <span className="block text-xs text-muted truncate">{r.subtitle}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="w-4 h-4 text-brand-fg shrink-0" />}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-line text-[11px] text-muted bg-surface-2/60">
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface font-sans">↑</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface font-sans">↓</kbd> gezin
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface font-sans">Enter</kbd> aç
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface font-sans">Esc</kbd> kapat
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
