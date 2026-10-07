import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cx } from '../ui/kit';
import { inputCls } from './FormParts';

// ============================================================================
// Tik kutulu açılır liste (Aşama 23)
// Haftalık planda sınıf ve öğrenci seçimi: bir, birkaç ya da hepsi seçilebilir.
// Seçenekler gruplanabilir (ör. öğrenciler sınıflarına göre); grup başlığına dokunmak grubu seçer/kaldırır.
// ============================================================================

export interface CheckOption {
  id: string;
  label: string;
  sub?: string;
  group?: string;
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
// Telefonda arama kutusuna otomatik odaklanılmaz (klavye listeyi kapatmasın)
const finePointer = (() => {
  try {
    return window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
})();

export const MultiCheckSelect: React.FC<{
  id: string;
  options: CheckOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string; // hiçbiri seçili değilken
  allLabel: string; // hepsi seçiliyken (ör. "Tüm sınıflar")
  unit: string; // "sınıf" / "öğrenci"
  searchable?: boolean;
  disabled?: boolean;
  emptyText?: string;
}> = ({ id, options, selected, onChange, placeholder, allLabel, unit, searchable, disabled, emptyText }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sel = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const q = trLower(query.trim());
  const visible = useMemo(() => options.filter((o) => !q || trLower(o.label).includes(q) || trLower(o.sub || '').includes(q)), [options, q]);
  const groups = useMemo(() => {
    const m = new Map<string, CheckOption[]>();
    for (const o of visible) m.set(o.group || '', [...(m.get(o.group || '') || []), o]);
    return [...m.entries()];
  }, [visible]);

  const chosen = options.filter((o) => sel.has(o.id));
  const summary =
    chosen.length === 0
      ? placeholder
      : chosen.length === options.length
        ? `${allLabel} (${options.length})`
        : chosen.length <= 2
          ? chosen.map((o) => o.label).join(', ')
          : `${chosen.length} ${unit} seçili`;

  const visibleIds = visible.map((o) => o.id);
  const allVisibleOn = visibleIds.length > 0 && visibleIds.every((x) => sel.has(x));
  const toggleAllVisible = () =>
    onChange(allVisibleOn ? selected.filter((x) => !visibleIds.includes(x)) : Array.from(new Set([...selected, ...visibleIds])));
  const toggle = (oid: string) => onChange(sel.has(oid) ? selected.filter((x) => x !== oid) : [...selected, oid]);
  const toggleGroup = (list: CheckOption[]) => {
    const ids = list.map((o) => o.id);
    const on = ids.every((x) => sel.has(x));
    onChange(on ? selected.filter((x) => !ids.includes(x)) : Array.from(new Set([...selected, ...ids])));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(inputCls, 'flex items-center justify-between gap-2 text-left cursor-pointer')}
      >
        <span className={cx('truncate', chosen.length === 0 && 'text-subtle')} data-summary>
          {summary}
        </span>
        <ChevronDown className={cx('w-4 h-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          id={`${id}-popover`}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-40 mt-1 w-full min-w-[15rem] rounded-xl border border-line-strong bg-surface shadow-pop overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="p-2 border-b border-line bg-surface-2/60 space-y-2">
            {searchable && (
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  id={`${id}-search`}
                  type="text"
                  value={query}
                  autoFocus={finePointer}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ara…"
                  className={cx(inputCls, 'pl-8 py-1.5')}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                id={`${id}-all`}
                onClick={toggleAllVisible}
                disabled={visibleIds.length === 0}
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-fg cursor-pointer disabled:opacity-40"
              >
                <Box on={allVisibleOn} partial={!allVisibleOn && visibleIds.some((x) => sel.has(x))} />
                {allVisibleOn ? 'Hepsini kaldır' : 'Hepsini seç'}
              </button>
              <span className="text-[11px] text-muted">
                {chosen.length} / {options.length} seçili
              </span>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {visible.length === 0 && <p className="px-3 py-4 text-xs text-muted text-center">{q ? 'Eşleşen kayıt yok.' : emptyText || 'Seçenek yok.'}</p>}
            {groups.map(([g, list]) => {
              const gOn = list.every((o) => sel.has(o.id));
              const gSome = list.some((o) => sel.has(o.id));
              return (
                <div key={g || '_'} role="group" aria-label={g || undefined}>
                  {g && groups.length > 1 && (
                    <button
                      type="button"
                      data-group-toggle={g}
                      onClick={() => toggleGroup(list)}
                      className="w-full flex items-center gap-2 px-3 pt-2 pb-1 text-left text-[11px] font-bold uppercase tracking-wide text-subtle hover:text-fg cursor-pointer"
                    >
                      <Box on={gOn} partial={!gOn && gSome} small />
                      {g}
                    </button>
                  )}
                  {list.map((o) => {
                    const on = sel.has(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        data-option={o.id}
                        onClick={() => toggle(o.id)}
                        className={cx('w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-2 cursor-pointer', on && 'bg-brand-soft/40')}
                      >
                        <Box on={on} />
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.sub && <span className="shrink-0 text-[11px] text-muted">{o.sub}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-line flex justify-end">
            <button type="button" id={`${id}-done`} className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setOpen(false)}>
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Box: React.FC<{ on: boolean; partial?: boolean; small?: boolean }> = ({ on, partial, small }) => (
  <span
    aria-hidden
    className={cx(
      'shrink-0 rounded-[5px] border flex items-center justify-center',
      small ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]',
      on ? 'bg-brand border-brand text-white' : partial ? 'bg-brand/30 border-brand' : 'bg-surface border-line-strong'
    )}
  >
    {on && <Check className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={3} />}
    {!on && partial && <span className="w-2 h-0.5 bg-brand rounded" />}
  </span>
);
