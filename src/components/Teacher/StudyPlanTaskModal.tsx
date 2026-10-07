import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Plus, Search, X, CalendarRange } from 'lucide-react';
import { Modal, cx } from '../ui/kit';
import { FieldLabel, inputCls } from './FormParts';
import { PLAN_DAYS, dateOfDay, shortDayLabel, type PlanItemDraft, type StudentBook } from '../../services/studyPlanService';

// ============================================================================
// Haftalık plan: görev penceresi (Aşama 19)
// Gün → ders → kitap (açılır pencere; kayıtlı değilse en üstteki kutuya elle yazılır) → açıklama
// ============================================================================

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR').trim();

// ----------------------------------------------------------------------------- Kitap seçici
export const BookPicker: React.FC<{
  value: string;
  onChange: (title: string) => void;
  books: StudentBook[];
  subject: string;
}> = ({ value, onChange, books, subject }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const q = trLower(query);
  const typed = query.trim();
  // Aşama 21: yalnızca seçilen derse ait kitaplar (ve "her ders" için kaydedilenler) listelenir
  const { mine, general } = useMemo(() => {
    const match = (b: StudentBook) => !q || trLower(b.title).includes(q);
    return {
      mine: books.filter((b) => !!b.subject && b.subject === subject && match(b)),
      general: books.filter((b) => !b.subject && match(b)),
    };
  }, [books, subject, q]);
  const subjectBookCount = books.filter((b) => !b.subject || b.subject === subject).length;
  const exact = books.some((b) => (!b.subject || b.subject === subject) && trLower(b.title) === q);

  const pick = (title: string) => {
    onChange(title);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id="plan-book-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(inputCls, 'flex items-center justify-between gap-2 text-left cursor-pointer')}
      >
        <span className={cx('flex items-center gap-2 min-w-0', !value && 'text-subtle')}>
          <BookOpen className="w-4 h-4 shrink-0 text-muted" />
          <span className="truncate">{value || 'Kitap seçin (isteğe bağlı)'}</span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div
          id="plan-book-popover"
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-line-strong bg-surface shadow-pop overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="p-2 border-b border-line bg-surface-2/60">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                ref={inputRef}
                id="plan-book-search"
                type="text"
                value={query}
                maxLength={160}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typed) pick([...mine, ...general].find((b) => trLower(b.title) === q)?.title || typed);
                  }
                }}
                placeholder="Kitap adını yazın ya da arayın…"
                className={cx(inputCls, 'pl-8 py-1.5')}
              />
            </div>
            <p className="text-[11px] text-muted mt-1">Yalnızca <strong>{subject || 'seçilen ders'}</strong> kitapları listelenir. Kitap listede yoksa adını buraya yazıp onaylayın; bu dersin kitabı olarak eklenir.</p>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {typed && !exact && (
              <button
                type="button"
                id="plan-book-create"
                onClick={() => pick(typed)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-brand-fg bg-brand-soft/60 hover:bg-brand-soft cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="truncate">“{typed}” adını kullan ve listeye ekle</span>
              </button>
            )}
            {mine.length > 0 && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-subtle" id="plan-book-subject-head">
                {subject} kitapları
              </p>
            )}
            {mine.map((b) => (
              <BookRow key={b.id} book={b} active={b.title === value} onPick={() => pick(b.title)} />
            ))}
            {general.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-subtle">Her derste kullanılan kitaplar</p>
                {general.map((b) => (
                  <BookRow key={b.id} book={b} active={b.title === value} onPick={() => pick(b.title)} />
                ))}
              </>
            )}
            {!typed && subjectBookCount === 0 && (
              <p className="px-3 py-3 text-xs text-muted" id="plan-book-empty">
                Bu öğrenci için {subject ? `${subject} dersinde ` : ''}kayıtlı kitap yok. Yukarıya kitap adını yazarak ekleyebilirsiniz.
              </p>
            )}
            {value && (
              <button type="button" id="plan-book-clear" onClick={() => pick('')} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-muted hover:bg-surface-2 cursor-pointer border-t border-line">
                <X className="w-3.5 h-3.5" /> Kitap seçimini kaldır
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const BookRow: React.FC<{ book: StudentBook; active: boolean; onPick: () => void }> = ({ book, active, onPick }) => (
  <button
    type="button"
    role="option"
    aria-selected={active}
    data-book-option={book.title}
    onClick={onPick}
    className={cx('w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 cursor-pointer', active && 'bg-brand-soft/60 font-semibold')}
  >
    <span className="truncate">{book.title}</span>
    {book.subject && <span className="shrink-0 text-[10px] font-semibold text-muted">{book.subject}</span>}
  </button>
);

// ----------------------------------------------------------------------------- Görev penceresi
export interface TaskModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  weekStart: string;
  initial: PlanItemDraft;
  subjectOptions: string[];
  books: StudentBook[];
  studentName: string;
  onClose: () => void;
  // keepOpen: "Kaydet ve yeni görev ekle" (aynı gün açık kalır)
  onSave: (draft: PlanItemDraft, keepOpen: boolean) => Promise<void>;
}

export const StudyPlanTaskModal: React.FC<TaskModalProps> = ({ open, mode, weekStart, initial, subjectOptions, books, studentName, onClose, onSave }) => {
  const [day, setDay] = useState(initial.day);
  const [subject, setSubject] = useState(initial.subject || subjectOptions[0] || '');
  const [book, setBook] = useState(initial.book);
  const [note, setNote] = useState(initial.note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  // Pencere her açılışında başlangıç değerleriyle başlar
  useEffect(() => {
    if (!open) return;
    setDay(initial.day);
    setSubject(initial.subject || subjectOptions[0] || '');
    setBook(initial.book);
    setNote(initial.note);
    setError(null);
    setSaving(false);
    setSavedCount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (keepOpen: boolean) => {
    if (saving) return;
    if (!subject) return setError('Lütfen bir ders seçin.');
    if (!book.trim() && !note.trim()) return setError('Kitap seçin ya da yapılacakları (sayfa / konu) yazın.');
    setSaving(true);
    setError(null);
    try {
      await onSave({ day, subject, book: book.trim(), note: note.trim() }, keepOpen);
      if (keepOpen) {
        setBook('');
        setNote('');
        setSavedCount((n) => n + 1);
      }
    } catch (e: any) {
      setError(e?.message || 'Görev kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      id="plan-task-modal"
      icon={CalendarRange}
      tone="brand"
      title={mode === 'edit' ? 'Görevi düzenle' : 'Görev ekle'}
      description={studentName}
      footer={
        <>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
            {savedCount > 0 ? 'Kapat' : 'Vazgeç'}
          </button>
          {mode === 'add' && (
            <button type="button" id="plan-task-save-more" className="ui-btn ui-btn-secondary" disabled={saving} onClick={() => submit(true)}>
              Kaydet, yeni görev ekle
            </button>
          )}
          <button type="button" id="plan-task-save" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => submit(false)}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {savedCount > 0 && (
          <div role="status" id="plan-task-saved" className="rounded-xl bg-success-soft text-success-fg px-3 py-2 text-xs font-semibold">
            {savedCount} görev eklendi. Aynı güne yeni görev ekleyebilirsiniz.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="plan-task-day">Gün</FieldLabel>
            <select id="plan-task-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className={inputCls}>
              {PLAN_DAYS.map((n, i) => (
                <option key={n} value={i}>
                  {n} · {shortDayLabel(dateOfDay(weekStart, i))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="plan-task-subject">Ders</FieldLabel>
            <select
              id="plan-task-subject"
              value={subject}
              onChange={(e) => {
                const next = e.target.value;
                // Aşama 21: seçili kitap başka bir derse aitse ders değişince kitap seçimi kalkar
                const t = trLower(book);
                if (t) {
                  const fitsNext = books.some((b) => (!b.subject || b.subject === next) && trLower(b.title) === t);
                  const ofOther = books.some((b) => !!b.subject && b.subject !== next && trLower(b.title) === t);
                  if (ofOther && !fitsNext) setBook('');
                }
                setSubject(next);
              }}
              className={inputCls}
            >
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {subjectOptions.length === 1 && <p className="text-[11px] text-muted mt-1">Öğretmenler yalnızca kendi branşından görev verebilir.</p>}
          </div>
        </div>
        <div>
          <FieldLabel optional>Kitap</FieldLabel>
          <BookPicker value={book} onChange={setBook} books={books} subject={subject} />
        </div>
        <div>
          <FieldLabel htmlFor="plan-task-note" optional>
            Yapılacaklar
          </FieldLabel>
          <textarea
            id="plan-task-note"
            value={note}
            maxLength={1000}
            rows={4}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Örn: 45–52. sayfalardaki tüm soruları çöz / Üslü sayılar konusunu bitir ve sonundaki testi yap"
            className={cx(inputCls, 'resize-y')}
          />
        </div>
        {error && (
          <div role="alert" id="plan-task-error" className="rounded-xl bg-danger-soft text-danger-fg px-3 py-2 text-xs font-semibold">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
