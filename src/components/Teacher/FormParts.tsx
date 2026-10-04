import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Mail, AlertTriangle, Check, Users } from 'lucide-react';
import type { ClassGroup, Student } from '../../types';
import { cx } from '../ui/kit';
import { callMail, type MailResult } from '../../lib/mailApi';
import { detectSchoolLevelFromGrade } from '../../constants/schoolConstants';

// ============================================================================
// Ödev ve etüt formlarının ortak parçaları (Aşama 9)
// ============================================================================

export const FormSection: React.FC<{ title: string; hint?: React.ReactNode; children: React.ReactNode; id?: string }> = ({
  title,
  hint,
  children,
  id,
}) => (
  <section id={id} className="space-y-2.5">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
      {hint && <span className="text-[11px] text-muted text-right">{hint}</span>}
    </div>
    {children}
  </section>
);

export const FieldLabel: React.FC<{ htmlFor?: string; children: React.ReactNode; optional?: boolean }> = ({ htmlFor, children, optional }) => (
  <label htmlFor={htmlFor} className="flex items-center justify-between text-xs font-medium text-fg-2 mb-1">
    <span>{children}</span>
    {optional && <span className="text-[10px] font-normal text-subtle">isteğe bağlı</span>}
  </label>
);

export const inputCls =
  'w-full px-3 py-2 bg-surface border border-line-strong rounded-xl text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand disabled:opacity-60 disabled:cursor-not-allowed';

export const chipCls = (active: boolean) =>
  cx(
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer select-none',
    active ? 'bg-brand text-white border-brand' : 'bg-surface text-fg-2 border-line hover:border-line-strong hover:bg-surface-2'
  );

// Sınıfın kademesi (Ortaokul / Lise)
export function classLevel(cls?: ClassGroup | null): 'Ortaokul' | 'Lise' {
  if (!cls) return 'Ortaokul';
  if (cls.schoolLevel === 'Lise' || cls.schoolLevel === 'Ortaokul') return cls.schoolLevel;
  return detectSchoolLevelFromGrade(cls.gradeLevel || cls.name) || 'Ortaokul';
}

// Yerel tarih yardımcıları (saat dilimi kaymasını önler)
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const localDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const addDays = (base: Date, days: number) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
};
const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const TR_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const shortTrDate = (dateStr: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return dateStr || '-';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${+m[3]} ${TR_MONTHS[+m[2] - 1]} ${TR_DAYS[d.getDay()]}`;
};

// ----------------------------------------------------------------------------- Kapatma onayı
export const DiscardBar: React.FC<{ onKeep: () => void; onDiscard: () => void }> = ({ onKeep, onDiscard }) => (
  <div role="alert" className="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft text-warning-fg px-3 py-2 text-xs font-semibold">
    <span className="flex items-center gap-1.5">
      <AlertTriangle className="w-4 h-4" />
      Kaydedilmemiş bilgiler silinsin mi?
    </span>
    <span className="flex gap-2">
      <button type="button" onClick={onKeep} className="ui-btn ui-btn-secondary ui-btn-sm">
        Forma dön
      </button>
      <button type="button" onClick={onDiscard} className="ui-btn ui-btn-danger ui-btn-sm">
        Sil ve kapat
      </button>
    </span>
  </div>
);

// ----------------------------------------------------------------------------- E-posta durumu ve kutusu
let statusCache: { at: number; data: MailResult } | null = null;
export function useMailStatus(enabled = true): MailResult | null {
  const [st, setSt] = useState<MailResult | null>(statusCache && Date.now() - statusCache.at < 5 * 60000 ? statusCache.data : null);
  useEffect(() => {
    if (!enabled || st) return;
    let alive = true;
    callMail('status').then((r) => {
      statusCache = { at: Date.now(), data: r };
      if (alive) setSt(r);
    });
    return () => {
      alive = false;
    };
  }, [enabled, st]);
  return st;
}
export const invalidateMailStatus = () => {
  statusCache = null;
};

export const MailOptIn: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id?: string }> = ({
  checked,
  onChange,
  label,
  hint,
  id,
}) => {
  const status = useMailStatus(true);
  const notReady = status && (!status.ok || status.canSend === false);
  return (
    <div className={cx('rounded-xl border px-3 py-2.5', checked ? 'border-brand/40 bg-brand-soft/60' : 'border-line bg-surface-2/60')}>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[var(--color-brand)] cursor-pointer"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Mail className="w-4 h-4 text-brand-fg" />
            {label}
          </span>
          {hint && <span className="block text-[11px] text-muted mt-0.5">{hint}</span>}
          {checked && notReady && (
            <span className="block text-[11px] text-warning-fg mt-1">
              {status && !status.ok
                ? `E-posta servisi şu an kullanılamıyor: ${status.error}`
                : 'E-posta hesabı henüz ayarlanmamış; kayıt yapılır ama e-posta gitmez. Profil menüsü > E-posta Ayarları.'}
            </span>
          )}
        </span>
      </label>
    </div>
  );
};

// ----------------------------------------------------------------------------- Öğrenci seçici
// variant 'classes': ödev — seçilen sınıflar hedeftir; sınıf seçilince öğrencileri de seçilir.
// variant 'filter' : etüt — sınıf yalnızca listeyi süzer; seçilen öğrenciler her zaman özette görünür.
export const StudentPicker: React.FC<{
  variant: 'classes' | 'filter';
  classes: ClassGroup[];
  students: Student[];
  classIds: string[];
  onClassIdsChange: (ids: string[]) => void;
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  idPrefix: string;
}> = ({ variant, classes, students, classIds, onClassIdsChange, selectedIds, onSelectedChange, idPrefix }) => {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byClass = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) {
      const arr = m.get(s.classId) || [];
      arr.push(s);
      m.set(s.classId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return m;
  }, [students]);
  const className = (id: string) => classes.find((c) => c.id === id)?.name || students.find((s) => s.classId === id)?.className || id;
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const match = (s: Student) =>
    !q || s.name.toLocaleLowerCase('tr-TR').includes(q) || (s.studentNumber || '').toLowerCase().includes(q);

  const toggleClass = (id: string) => {
    const on = classIds.includes(id);
    if (variant === 'classes') {
      const ids = (byClass.get(id) || []).map((s) => s.id);
      onClassIdsChange(on ? classIds.filter((x) => x !== id) : [...classIds, id]);
      onSelectedChange(on ? selectedIds.filter((x) => !ids.includes(x)) : Array.from(new Set([...selectedIds, ...ids])));
    } else {
      onClassIdsChange(on ? [] : [id]);
    }
  };
  const toggleStudent = (id: string) =>
    onSelectedChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const visibleClassIds = variant === 'classes' ? classIds : classIds.length ? classIds : Array.from(byClass.keys());
  const groups = visibleClassIds
    .map((cid) => ({ cid, list: (byClass.get(cid) || []).filter(match) }))
    .filter((g) => g.list.length > 0 || variant === 'classes');
  const visibleIds = groups.flatMap((g) => g.list.map((s) => s.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleVisible = () =>
    onSelectedChange(
      allVisibleSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds]))
    );
  const selectedStudents = students.filter((s) => selected.has(s.id));
  const showList = variant === 'classes' ? classIds.length > 0 : true;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sınıflar">
        {variant === 'filter' && (
          <button type="button" id={`${idPrefix}-class-all`} className={chipCls(classIds.length === 0)} onClick={() => onClassIdsChange([])}>
            Tüm sınıflar
          </button>
        )}
        {classes.map((c) => {
          const on = classIds.includes(c.id);
          const count = (byClass.get(c.id) || []).length;
          return (
            <button
              key={c.id}
              type="button"
              id={`${idPrefix}-class-${c.id}`}
              aria-pressed={on}
              className={chipCls(on)}
              onClick={() => toggleClass(c.id)}
            >
              {variant === 'classes' && on && <Check className="w-3.5 h-3.5" />}
              {c.name}
              <span className={cx('text-[10px] font-medium', on ? 'text-white/80' : 'text-subtle')}>{count}</span>
            </button>
          );
        })}
        {classes.length === 0 && <span className="text-xs text-muted">Size tanımlı sınıf bulunmuyor.</span>}
      </div>

      {showList ? (
        <div className="rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                id={`${idPrefix}-student-search`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Öğrenci adı veya numarası ara"
                className="w-full bg-surface-2 border border-line rounded-lg pl-8 pr-2 py-1.5 text-xs text-fg placeholder:text-subtle focus:outline-none focus:border-brand"
              />
            </div>
            <span className="text-[11px] text-muted">{selectedIds.length} seçili</span>
            <button
              type="button"
              id={`${idPrefix}-toggle-visible`}
              onClick={toggleVisible}
              disabled={visibleIds.length === 0}
              className="text-xs font-semibold text-brand-fg hover:underline disabled:opacity-40 cursor-pointer"
            >
              {allVisibleSelected ? 'Görünenleri kaldır' : 'Görünenlerin tümünü seç'}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto p-2 space-y-2">
            {groups.length === 0 || visibleIds.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted">
                <Users className="w-5 h-5 mx-auto mb-1 text-subtle" />
                {q ? `"${query}" ile eşleşen öğrenci yok.` : 'Bu seçimde kayıtlı öğrenci yok.'}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.cid}>
                  {groups.length > 1 && <div className="px-1 pb-1 text-[11px] font-semibold text-muted">{className(g.cid)}</div>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {g.list.map((s) => {
                      const on = selected.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className={cx(
                            'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors',
                            on ? 'bg-brand-soft border-brand/40 text-fg font-semibold' : 'bg-surface-2/60 border-line text-fg-2 hover:bg-surface-2'
                          )}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggleStudent(s.id)} className="w-3.5 h-3.5 accent-[var(--color-brand)]" />
                          <span className="truncate flex-1">{s.name}</span>
                          {s.studentNumber && !/atan/i.test(s.studentNumber) && (
                            <span className="text-[10px] text-subtle font-mono shrink-0">{s.studentNumber}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">
          Önce yukarıdan sınıf seçin.
        </div>
      )}

      {variant === 'filter' && selectedStudents.length > 0 && (
        <div className="rounded-xl bg-surface-2/60 border border-line px-3 py-2">
          <div className="text-[11px] font-semibold text-muted mb-1.5">Seçilen öğrenciler ({selectedStudents.length})</div>
          <div className="flex flex-wrap gap-1.5" id={`${idPrefix}-selected`}>
            {selectedStudents.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-surface border border-line text-[11px] text-fg">
                {s.name}
                <span className="text-subtle">· {className(s.classId)}</span>
                <button
                  type="button"
                  onClick={() => toggleStudent(s.id)}
                  aria-label={`${s.name} seçimini kaldır`}
                  className="p-0.5 rounded-full hover:bg-surface-3 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------- Etiket (kazanım) girişi
export const TagInput: React.FC<{ value: string[]; onChange: (v: string[]) => void; placeholder: string; id?: string }> = ({
  value,
  onChange,
  placeholder,
  id,
}) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft
      .split(/\n|;/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...value, ...parts])).slice(0, 20));
    setDraft('');
  };
  return (
    <div className="rounded-xl border border-line-strong bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand/25 focus-within:border-brand">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-info-soft text-info-fg text-[11px] font-semibold max-w-full">
            <span className="truncate">{t}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`${t} kaldır`} className="p-0.5 rounded-full hover:bg-surface cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={add}
          placeholder={value.length ? '' : placeholder}
          className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-sm text-fg placeholder:text-subtle focus:outline-none"
        />
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------- E-posta sonucu şeridi
export const MailNoticeBar: React.FC<{
  notice: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };
  onClose: () => void;
  action?: React.ReactNode;
}> = ({ notice, onClose, action }) => {
  const toneCls =
    notice.tone === 'success'
      ? 'bg-success-soft text-success-fg border-success/30'
      : notice.tone === 'warning'
        ? 'bg-warning-soft text-warning-fg border-warning/30'
        : notice.tone === 'danger'
          ? 'bg-danger-soft text-danger-fg border-danger/30'
          : 'bg-info-soft text-info-fg border-info/30';
  return (
    <div role="status" id="mail-notice" className={cx('flex items-start gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold', toneCls)}>
      <Mail className="w-4 h-4 shrink-0 mt-px" />
      <span className="flex-1">{notice.text}</span>
      {action}
      <button type="button" onClick={onClose} aria-label="Kapat" className="p-0.5 rounded hover:bg-surface/60 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
