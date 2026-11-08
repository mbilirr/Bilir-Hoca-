import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cx, useOverlayLayer } from './kit';
import { useMediaQuery } from '../../lib/listPaging';

// ============================================================================
// Aşama 207: ortak "Diğer ⋯" menüsü
// Seyrek kullanılan işlemler tek düğmenin arkasında toplanır; her ekranda aynı görünüm ve davranış.
// - Bilgisayarda düğmenin altında 150 ms'de aşağı kayarak açılır (yalnız transform + opacity: hız etkilenmez).
// - Telefonda (≤639 px) alttan açılan panel; arka plan karartılır, dokununca kapanır.
// - Esc, dışarı tıklama, kaydırma / pencere boyutu değişince kapanır; Esc ortak katmana uyar (Aşama 191).
// - Klavye: ↑ / ↓ / Home / End ile gezilir, Enter / Space seçer; açılınca ilk maddeye, kapanınca düğmeye odak.
// - "Hareketi azalt" açık cihazlarda efekt kapanır (index.css).
// - Sayfa kesitleri (overflow-hidden kartlar) menüyü kırpmasın diye menü body'ye taşınır (portal).
// ============================================================================

export interface MoreMenuItem {
  label: React.ReactNode;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  /** Kırmızı, en altta çizgiyle ayrılır (ör. Sil). Onay sorusu çağıran ekranda kalır. */
  danger?: boolean;
  disabled?: boolean;
  /** false ise madde hiç gösterilmez (yetkiye göre gizleme için kolaylık) */
  show?: boolean;
  id?: string;
  title?: string;
}

export const MoreMenu: React.FC<{
  items: MoreMenuItem[];
  /** Verilirse düğme yazılı olur ("Diğer"); verilmezse 32x32 "⋯" simge düğmesi */
  label?: React.ReactNode;
  /** Simge düğmesinin ekran okuyucu adı */
  ariaLabel?: string;
  id?: string;
  className?: string;
  /** Menünün düğmeye göre hizası (bilgisayar) */
  align?: 'end' | 'start';
  /** Telefondaki panelin başlığı */
  sheetTitle?: React.ReactNode;
  /** Şerit (ExpandableStrip) işlemleri gibi çerçevesiz, sade simge düğmesi */
  quiet?: boolean;
}> = ({ items, label, ariaLabel = 'Diğer işlemler', id, className, align = 'end', sheetTitle, quiet }) => {
  const visible = items.filter((it) => it.show !== false);
  const normal = visible.filter((it) => !it.danger);
  const danger = visible.filter((it) => it.danger);
  const ordered = [...normal, ...danger];

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const phone = useMediaQuery('(max-width: 639px)');
  const menuId = useId();

  const close = useCallback((focusBtn = true) => {
    setOpen(false);
    if (focusBtn) btnRef.current?.focus();
  }, []);

  // Esc ortak katmandan; telefonda panel açıkken arka plan kaymaz
  useOverlayLayer(open, () => close(true), { lockScroll: phone });

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const top = b.bottom + 6;
    if (align === 'end') setPos({ top, right: Math.max(8, window.innerWidth - b.right) });
    else setPos({ top, left: Math.max(8, b.left) });
  }, [align]);

  useLayoutEffect(() => {
    if (open && !phone) place();
  }, [open, phone, place]);

  // Dışarı tıklama, kaydırma, boyut değişimi → kapan
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (phone || menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, phone, close]);

  // Açılınca ilk etkin maddeye odak
  useEffect(() => {
    if (!open) return;
    const i = ordered.findIndex((it) => !it.disabled);
    const t = window.setTimeout(() => itemRefs.current[i]?.focus(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (ordered.length === 0) return null;

  const onMenuKey = (e: React.KeyboardEvent) => {
    const enabled = ordered.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!enabled.length) return;
    const cur = itemRefs.current.findIndex((el) => el === document.activeElement);
    const at = enabled.indexOf(cur);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = enabled[(at + 1 + enabled.length) % enabled.length];
    else if (e.key === 'ArrowUp') next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    else if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      itemRefs.current[next]?.focus();
    }
  };

  const pick = (it: MoreMenuItem) => {
    if (it.disabled) return;
    close(true);
    it.onClick();
  };

  const list = (
    <>
      {ordered.map((it, i) => {
        const Icon = it.icon;
        const firstDanger = it.danger && i === normal.length && normal.length > 0;
        return (
          <React.Fragment key={it.id || i}>
            {firstDanger && <div role="separator" className="my-1 mx-1 h-px bg-line" />}
            <button
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              id={it.id}
              title={it.title}
              disabled={it.disabled}
              tabIndex={-1}
              onClick={() => pick(it)}
              className={cx(
                'w-full flex items-center gap-2.5 rounded-lg px-2.5 text-left text-xs cursor-pointer transition-colors',
                'h-9 sm:h-8 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                it.danger
                  ? 'font-semibold text-danger-fg hover:bg-danger-soft focus-visible:bg-danger-soft'
                  : 'font-medium text-fg hover:bg-surface-2 focus-visible:bg-surface-2'
              )}
            >
              {Icon && <Icon className={cx('w-3.5 h-3.5 shrink-0', it.danger ? 'text-danger-fg' : 'text-muted')} />}
              <span className="truncate">{it.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label ? undefined : ariaLabel}
        title={label ? undefined : ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          quiet
            ? 'p-1.5 rounded-lg transition-colors cursor-pointer text-subtle hover:text-fg-2 hover:bg-surface-2'
            : cx('ui-btn ui-btn-secondary ui-btn-sm', label ? 'w-28' : 'ui-btn-icon w-8 h-8'),
          open && (quiet ? 'bg-surface-2 text-fg-2' : 'bg-surface-2 border-line-strong'),
          className
        )}
      >
        {label ? (
          <>
            <span>{label}</span>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </>
        ) : (
          <MoreHorizontal className="w-4 h-4" />
        )}
      </button>
      {open &&
        createPortal(
          phone ? (
            <div className="fixed inset-0 z-[10050]" role="presentation">
              <div className="absolute inset-0 bg-black/40 ui-menu-fade" onClick={() => close(true)} />
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label={typeof sheetTitle === 'string' ? sheetTitle : ariaLabel}
                onKeyDown={onMenuKey}
                className="ui-sheet-in absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface border-t border-line shadow-2xl p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] max-h-[70vh] overflow-y-auto"
              >
                <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
                {sheetTitle && <div className="px-2.5 pb-1.5 text-xs font-semibold text-muted">{sheetTitle}</div>}
                {list}
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              onKeyDown={onMenuKey}
              style={pos ? { top: pos.top, left: pos.left, right: pos.right } : { visibility: 'hidden' }}
              className={cx(
                'ui-menu-in fixed z-[10050] min-w-48 max-w-72 rounded-xl border border-line bg-surface p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.06)]',
                align === 'end' ? 'origin-top-right' : 'origin-top-left'
              )}
            >
              {list}
            </div>
          ),
          document.body
        )}
    </>
  );
};
