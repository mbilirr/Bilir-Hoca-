import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, MailWarning, UserCheck } from 'lucide-react';
import type { EtutTeacherOption } from '../../services/dataService';
import { cx } from '../ui/kit';

// ============================================================================
// Etüt öğretmeni seçimi (Aşama 14): açılır pencere, üstte arama kutusu,
// her öğretmenin yanında kutucuk (birden çok öğretmen seçilebilir).
// Zümre kutucuğu zümredeki bütün öğretmenleri, ders kutucuğu o dersin öğretmenlerini seçer.
// ============================================================================

export interface TeacherGroup {
  key: string;
  title: string;
  options: EtutTeacherOption[];
}

const boxCls = 'w-4 h-4 shrink-0 accent-[var(--color-brand)] cursor-pointer';

export const EtutTeacherSelect: React.FC<{
  groups: TeacherGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  loading: boolean;
  placeholder: string;
  currentSubject: string;
  allLabel?: string; // ör. "Fen zümresinin tüm öğretmenleri"
}> = ({ groups, value, onChange, loading, placeholder, currentSubject, allLabel }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const all = useMemo(() => {
    const seen = new Set<string>();
    return groups.flatMap((g) => g.options).filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  }, [groups]);
  const selected = all.filter((o) => value.includes(o.id));
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, options: q ? g.options.filter((o) => o.name.toLocaleLowerCase('tr-TR').includes(q)) : g.options }))
        .filter((g) => g.options.length > 0),
    [groups, q]
  );
  const total = filtered.reduce((n, g) => n + g.options.length, 0);

  // Dışarı tıklayınca kapanır
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Seçim sırası listedeki sıraya göre tutulur (ilk sıradaki ana öğretmen olur)
  const ordered = (ids: string[]) => all.map((o) => o.id).filter((id) => ids.includes(id)).concat(ids.filter((id) => !all.some((o) => o.id === id)));
  const toggle = (id: string) => onChange(ordered(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]));
  const setMany = (ids: string[], on: boolean) =>
    onChange(ordered(on ? Array.from(new Set([...value, ...ids])) : value.filter((x) => !ids.includes(x))));
  const stateOf = (ids: string[]) => {
    const n = ids.filter((id) => value.includes(id)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  };

  const badges = (o: EtutTeacherOption) => (
    <span className="flex flex-wrap gap-1">
      {o.kind === 'external' && <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-info-soft text-info-fg">Dış öğretmen</span>}
      {o.subjects.length > 0 && !o.subjects.includes(currentSubject) && (
        <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-surface-3 text-muted">{o.subjects.slice(0, 2).join(', ')}</span>
      )}
      {!o.hasEmail && !o.isMe && (
        <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-warning-soft text-warning-fg inline-flex items-center gap-0.5">
          <MailWarning className="w-3 h-3" />
          e-posta yok
        </span>
      )}
    </span>
  );

  const label =
    selected.length === 0
      ? loading
        ? 'Öğretmenler yükleniyor…'
        : placeholder
      : selected.length <= 2
        ? selected.map((o) => o.name).join(', ')
        : `${selected.length} öğretmen: ${selected
            .slice(0, 2)
            .map((o) => o.name)
            .join(', ')}…`;
  const allIds = all.map((o) => o.id);
  const allState = stateOf(allIds);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        id="etut-teacher-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-surface text-left cursor-pointer transition-colors',
          open ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:border-line-strong'
        )}
      >
        <UserCheck className="w-4 h-4 text-info-fg shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cx('block text-sm truncate', selected.length ? 'font-semibold text-fg' : 'text-muted')} id="etut-teacher-selected">
            {label}
          </span>
          {selected.length === 1 && badges(selected[0])}
        </span>
        {selected.length > 1 && (
          <span className="text-[11px] font-semibold px-1.5 py-px rounded-full bg-info-soft text-info-fg shrink-0">{selected.length} öğretmen</span>
        )}
        <ChevronDown className={cx('w-4 h-4 text-muted shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1.5 w-full rounded-xl border border-line bg-surface shadow-pop overflow-hidden"
          id="etut-teacher-panel"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Yalnızca listeyi kapat; etüt penceresi açık kalsın
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setOpen(false);
              document.getElementById('etut-teacher-select')?.focus();
            }
          }}
        >
          <div className="p-2 border-b border-line">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                ref={searchRef}
                id="etut-teacher-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = filtered[0]?.options[0];
                    if (first) toggle(first.id);
                  }
                }}
                placeholder="Öğretmen ara"
                className="w-full bg-surface-2 border border-line rounded-lg pl-8 pr-2 py-1.5 text-sm text-fg focus:outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label="Etüt öğretmenleri" id="etut-teacher-list">
            {loading ? (
              <div className="py-4 text-center text-xs text-muted">Öğretmenler yükleniyor…</div>
            ) : total === 0 ? (
              <div className="py-4 text-center text-xs text-muted">{q ? 'Aramaya uyan öğretmen yok.' : 'Bu ders için öğretmen bulunamadı.'}</div>
            ) : (
              <>
                {!q && allLabel && groups.length > 1 && all.length > 1 && (
                  <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-line bg-info-soft/50 hover:bg-info-soft" id="etut-teacher-all">
                    <input
                      type="checkbox"
                      className={boxCls}
                      checked={allState === 'all'}
                      ref={(el) => {
                        if (el) el.indeterminate = allState === 'some';
                      }}
                      onChange={() => setMany(allIds, allState !== 'all')}
                    />
                    <span className="text-sm font-semibold text-fg flex-1">{allLabel}</span>
                    <span className="text-[11px] text-muted">{all.length} öğretmen</span>
                  </label>
                )}
                {filtered.map((g) => {
                  const ids = g.options.map((o) => o.id);
                  const st = stateOf(ids);
                  return (
                    <div key={g.key} data-group={g.key}>
                      <label className="sticky top-0 z-[1] flex items-center gap-2.5 px-3 py-1.5 bg-surface-2 border-b border-line cursor-pointer">
                        <input
                          type="checkbox"
                          className={boxCls}
                          data-group-check={g.key}
                          checked={st === 'all'}
                          ref={(el) => {
                            if (el) el.indeterminate = st === 'some';
                          }}
                          onChange={() => setMany(ids, st !== 'all')}
                        />
                        <span className="text-[11px] font-semibold text-muted flex-1">
                          {g.title} ({g.options.length})
                        </span>
                      </label>
                      {g.options.map((o) => {
                        const on = value.includes(o.id);
                        return (
                          <label
                            key={o.id}
                            role="option"
                            aria-selected={on}
                            data-teacher-id={o.id}
                            className={cx(
                              'flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-line last:border-b-0',
                              on ? 'bg-brand-soft' : 'hover:bg-surface-2'
                            )}
                          >
                            <input type="checkbox" className={boxCls} checked={on} onChange={() => toggle(o.id)} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-fg truncate">
                                {o.name}
                                {o.isMe && <span className="ml-1 text-[11px] font-medium text-muted">(ben)</span>}
                              </span>
                              {badges(o)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-line bg-surface-2/60">
            <span className="text-[11px] text-muted" id="etut-teacher-count">
              {value.length ? `${value.length} öğretmen seçili` : 'Öğretmen seçilmedi'}
            </span>
            <span className="flex gap-1.5">
              {value.length > 0 && (
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => onChange([])}>
                  Temizle
                </button>
              )}
              <button type="button" id="etut-teacher-done" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setOpen(false)}>
                Tamam
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
