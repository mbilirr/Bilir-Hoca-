import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sun, Moon, SunMoon, Check } from 'lucide-react';
import { useThemeChoice, THEME_SWITCH_ENABLED, type ThemeChoice } from '../../lib/theme';
import { InfoTip } from './Compact'; // Aşama 215
import { baslik } from '../../lib/baslik'; // Aşama 331: başlıklar tek düzende

// Aşama 215: uzun açıklama başlığın altında durmaz; başlığın yanındaki (i) simgesine taşınır.
// Kısa açıklamalar (sayı, tarih vb.) eskisi gibi görünür.
const LONG_DESC = 80;
const isLongDesc = (d: React.ReactNode) => typeof d === 'string' && d.trim().length > LONG_DESC;
const DescTip: React.FC<{ d: React.ReactNode }> = ({ d }) => (isLongDesc(d) ? <InfoTip text={d} /> : null);

// ============================================================================
// ORTAK ARAYÜZ PARÇALARI (Aşama 8)
// Tüm ekranlar aynı başlık, kart, istatistik, boş durum ve pencere yapısını
// kullanır. Renkler index.css'teki tasarım belirteçlerinden gelir.
// ============================================================================

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneIconBox: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-fg',
  success: 'bg-success-soft text-success-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  neutral: 'bg-surface-2 text-fg-2',
};

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type IconType = React.ComponentType<{ className?: string }>;

// Renkli ikon kutusu
export const IconBox: React.FC<{ icon: IconType; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  icon: Icon,
  tone = 'brand',
  size = 'md',
  className,
}) => {
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-xl';
  const ic = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  return (
    <span className={cx('inline-flex items-center justify-center shrink-0', box, toneIconBox[tone], className)}>
      <Icon className={ic} />
    </span>
  );
};

// Sayfa / modül başlığı: başlık + kısa açıklama + sağda işlemler
export const PageHeader: React.FC<{
  icon?: IconType;
  tone?: Tone;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon, tone = 'brand', title, description, actions, className }) => (
  <div className={cx('flex flex-col sm:flex-row sm:items-center justify-between gap-3', className)}>
    <div className="flex items-center gap-3 min-w-0">
      {icon && <IconBox icon={icon} tone={tone} />}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg truncate">{baslik(title)}</h1>
          <DescTip d={description} />
        </div>
        {description && !isLongDesc(description) && <p className="text-sm text-muted mt-0.5">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// Kart / panel
export const Panel: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  id?: string;
}> = ({ title, description, icon, tone = 'brand', actions, children, className, bodyClassName, padded = true, id }) => (
  <section id={id} className={cx('ui-card', className)}>
    {(title || actions) && (
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <IconBox icon={icon} tone={tone} size="sm" />}
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-base font-semibold text-fg truncate">{baslik(title)}</h2>
                <DescTip d={description} />
              </div>
            )}
            {description && !(title && isLongDesc(description)) && <p className="text-xs text-muted mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
    )}
    <div className={cx(padded && (title || actions ? 'px-4 sm:px-5 pb-4 sm:pb-5' : 'ui-card-pad'), bodyClassName)}>
      {children}
    </div>
  </section>
);

// Sayı kartı
export const StatCard: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
  id?: string;
}> = ({ label, value, hint, icon, tone = 'brand', onClick, className, id }) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="ui-eyebrow">{label}</span>
        {icon && <IconBox icon={icon} tone={tone} size="sm" />}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-fg tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        onClick={onClick}
        className={cx(
          'ui-card ui-card-pad text-left w-full transition hover:border-line-strong hover:-translate-y-0.5 cursor-pointer',
          className
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <div id={id} className={cx('ui-card ui-card-pad', className)}>
      {content}
    </div>
  );
};

// Boş durum
export const EmptyState: React.FC<{
  icon?: IconType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cx('flex flex-col items-center text-center px-6 py-10', className)}>
    {icon && <IconBox icon={icon} tone="neutral" size="lg" className="mb-3" />}
    <p className="text-sm font-semibold text-fg">{title}</p>
    {description && <p className="text-xs text-muted mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// Bölüm içi sekmeler (segment düğmeleri)
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: Array<{ value: T; label: React.ReactNode; icon?: IconType; badge?: React.ReactNode; id?: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  // Aşama 58: sığmayan sekmeler gizli kaydırma yerine alt satıra geçer (ekran küçülünce hepsi görünür kalır)
  return (
    <div
      role="tablist"
      className={cx('ui-seg', className)}
    >
      {items.map((it) => {
        const active = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            id={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            // Aşama 352: görünüm index.css .ui-seg-btn (h-8, 12 px); seçili olanı aria-selected boyar
            className={cx('ui-seg-btn', size === 'sm' && 'px-2.5')}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {it.label}
            {it.badge}
          </button>
        );
      })}
    </div>
  );
}

// Açık pencereler yığını: iç içe pencerelerde Esc yalnızca en üstteki pencereyi kapatır
const modalStack: number[] = [];
let modalSeq = 0;

// Aşama 347: klavye odağı. Tab ile ulaşılabilen öğeler (gizli ve kapalı olanlar hariç).
const ODAKLANIR =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
function odaklanirlar(kap: HTMLElement): HTMLElement[] {
  return Array.from(kap.querySelectorAll<HTMLElement>(ODAKLANIR)).filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('inert') && el.getClientRects().length > 0
  );
}
/** Aşama 347: pencere dışına taşan açılır listeler (portal) bu işareti taşır; odak oradayken tuzak karışmaz. */
export const ACILIR_ISARET = 'data-acilir';

/**
 * Aşama 191: ortak pencere katmanı. Modal ve eski usul (fixed inset-0) pencereler aynı yığını kullanır:
 * Esc yalnız en üstteki pencereyi kapatır, pencere açıkken arka plan kaymaz.
 * onClose verilmezse (zorunlu pencere) Esc hiçbir şeyi kapatmaz ama alttaki pencerelere de geçmez.
 * Aşama 347: kap (pencere kutusu) verilirse odak tuzağı: Tab / Shift+Tab pencerenin içinde döner, açılınca odak
 * pencereye gelir. Her durumda pencere kapanınca odak, pencereyi açan düğmeye geri döner.
 */
export function useOverlayLayer(
  open: boolean,
  onClose?: (() => void) | null,
  opts?: { lockScroll?: boolean; kap?: () => HTMLElement | null }
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const kapRef = useRef(opts?.kap);
  kapRef.current = opts?.kap;
  const lockScroll = opts?.lockScroll !== false;
  useEffect(() => {
    if (!open) return;
    const token = ++modalSeq;
    modalStack.push(token);
    const geri = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const ustte = () => modalStack[modalStack.length - 1] === token;
    const kap = () => kapRef.current?.() || null;

    // Açılışta odak pencereye (içinde zaten odaklı bir öğe yoksa)
    const k0 = kap();
    if (k0 && !k0.contains(document.activeElement)) {
      if (!k0.hasAttribute('tabindex')) k0.setAttribute('tabindex', '-1');
      k0.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (!ustte()) return;
      if (e.key === 'Escape') {
        const fn = onCloseRef.current;
        if (fn) fn();
        return;
      }
      if (e.key !== 'Tab') return;
      const k = kap();
      if (!k) return;
      const aktif = document.activeElement as HTMLElement | null;
      if (aktif?.closest(`[${ACILIR_ISARET}]`)) return;
      const liste = odaklanirlar(k);
      if (!liste.length) {
        e.preventDefault();
        k.focus({ preventScroll: true });
        return;
      }
      const ilk = liste[0];
      const son = liste[liste.length - 1];
      const icerde = !!aktif && k.contains(aktif);
      if (e.shiftKey) {
        if (!icerde || aktif === ilk || aktif === k) {
          e.preventDefault();
          son.focus();
        }
      } else if (!icerde || aktif === son) {
        e.preventDefault();
        ilk.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      if (lockScroll) document.body.style.overflow = modalStack.length ? 'hidden' : prev;
      // Odak geri: yalnız odak boşta (pencereyle gitti) ya da hâlâ kapanan pencerenin içindeyse
      if (geri && geri.isConnected) {
        const k = kap();
        const a = document.activeElement;
        if (!a || a === document.body || (k && k.contains(a))) {
          try {
            geri.focus({ preventScroll: true });
          } catch {
            /* odaklanamıyorsa geç */
          }
        }
      }
    };
  }, [open, lockScroll]);
}

/** Aşama 191: eski usul pencerelerin içine konur; pencere açıkken (bu parça görünürken) katmana katılır.
 *  Aşama 347: kendini saran sabit (fixed) kutuyu pencere sayar: odak tuzağı, odak geri dönüşü ve
 *  ekran okuyucu için role="dialog" ona da uygulanır. */
function sabitAta(el: HTMLElement | null): HTMLElement | null {
  let n = el?.parentElement || null;
  while (n && n !== document.body) {
    if (getComputedStyle(n).position === 'fixed') return n;
    n = n.parentElement;
  }
  return null;
}
export const OverlayLayer: React.FC<{ onClose?: (() => void) | null; lockScroll?: boolean }> = ({ onClose, lockScroll }) => {
  const isaret = useRef<HTMLSpanElement | null>(null);
  const kap = useRef<HTMLElement | null>(null);
  const bul = () => {
    if (!kap.current || !kap.current.isConnected) {
      const k = sabitAta(isaret.current);
      if (k) {
        // İçerideki asıl pencere kutusu role="dialog" taşıyorsa ona dokunma
        if (!k.querySelector('[role="dialog"]') && !k.hasAttribute('role')) {
          k.setAttribute('role', 'dialog');
          k.setAttribute('aria-modal', 'true');
        }
        if (!k.hasAttribute('tabindex')) k.setAttribute('tabindex', '-1');
        k.style.outline = 'none';
      }
      kap.current = k;
    }
    return kap.current;
  };
  useOverlayLayer(true, onClose, { lockScroll, kap: bul });
  return <span ref={isaret} hidden aria-hidden="true" />;
};

// Açılır pencere (Esc ile kapanır, arka plan kaydırılmaz)
// Aşama 351: BÜTÜN PENCERELER BU KABUKTA. Elle yazılan (fixed inset-0) pencereler kaldırıldı; hepsi aynı zemin, aynı katman,
// aynı açılış hareketi, telefonda alttan çekmece, odak tuzağı ve Esc. Özel düzenli pencereler için:
//   ust        : başlığın altında sabit şerit (sekmeler, araç çubuğu, uyarı); kaymaz
//   baslikSag  : başlıktaki Kapat düğmesinin solunda ek düğmeler
//   govdeClass : gövde boşluğu (varsayılan px-5 py-4; kendi düzeni olan içerik için "p-0")
//   yukseklik  : "icerik" (içerik kadar, en çok %92) | "tam" (görüntüleyici: hep %92)
//   kapatma    : false → başlıkta Kapat yok, zemine tıklayınca kapanmaz (zorunlu pencere; Esc onClose'a bağlı)
//   tamEkran   : true → bütün ekranı kaplar (belge görüntüleyicide tam ekran düğmesi)
export type ModalBoy = 'sm' | 'md' | 'lg' | 'xl' | 'full';
const MODAL_GENISLIK: Record<ModalBoy, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
  full: 'sm:max-w-[min(96vw,1400px)]',
};
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconType;
  tone?: Tone;
  size?: ModalBoy;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  closeOnBackdrop?: boolean;
  /** Aşama 146/347: katman sınıfı; varsayılan z-(--z-pencere). Pencerenin üstündeki onay vb. için z-(--z-pencere-ust) */
  layerClass?: string;
  ust?: React.ReactNode;
  baslikSag?: React.ReactNode;
  govdeClass?: string;
  yukseklik?: 'icerik' | 'tam';
  kapatma?: boolean;
  /** başlığın yanında yazı yerine ekran okuyucuya söylenecek ad (başlıksız pencere) */
  ariaLabel?: string;
  tamEkran?: boolean;
}> = ({
  open,
  onClose,
  title,
  description,
  icon,
  tone = 'brand',
  size = 'md',
  footer,
  children,
  id,
  closeOnBackdrop = true,
  layerClass = 'z-(--z-pencere)',
  ust,
  baslikSag,
  govdeClass = 'px-5 py-4',
  yukseklik = 'icerik',
  kapatma = true,
  ariaLabel,
  tamEkran = false,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Zemine basılıp pencere içinde bırakılırsa (yazı seçerken) kapanmasın: basma ve bırakma ikisi de zeminde olmalı
  const zemindeBasti = useRef(false);

  // Aşama 191: Esc ve kaydırma kilidi ortak katmandan (useOverlayLayer); onClose her çizimde yeni olabilir, katman onu ref ile tutar
  // Aşama 347: odak tuzağı + kapanınca açan düğmeye dönüş de katmanda (kap = pencere kutusu)
  useOverlayLayer(open, onClose, { kap: () => panelRef.current });

  if (!open) return null;
  const zemindenKapanir = closeOnBackdrop && kapatma;

  return createPortal(
    <div
      className={cx('ui-modal-zemin fixed inset-0 flex items-end sm:items-center justify-center p-0', !tamEkran && 'sm:p-4', layerClass)}
      onMouseDown={(e) => {
        zemindeBasti.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (zemindenKapanir && zemindeBasti.current && e.target === e.currentTarget) onClose();
        zemindeBasti.current = false;
      }}
    >
      <div
        id={id}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        className={cx(
          'ui-modal-panel w-full bg-surface text-fg border border-line shadow-pop flex flex-col outline-none',
          tamEkran ? 'h-dvh rounded-none' : cx('max-h-[92dvh] rounded-t-2xl sm:rounded-2xl', yukseklik === 'tam' && 'h-[92dvh]', MODAL_GENISLIK[size])
        )}
      >
        {(title || icon) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <IconBox icon={icon} tone={tone} />}
              <div className="min-w-0">
                {title && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 id={titleId} className="text-base sm:text-lg font-semibold text-fg truncate">
                      {baslik(title)}
                    </h2>
                    <DescTip d={description} />
                  </div>
                )}
                {description && !(title && isLongDesc(description)) && <p className="text-xs sm:text-sm text-muted mt-0.5">{description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 -mr-2 -mt-1">
              {baslikSag}
              {kapatma && (
                <button type="button" onClick={onClose} aria-label="Kapat" className="ui-btn ui-btn-ghost ui-btn-icon">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        )}
        {ust && <div className="shrink-0">{ust}</div>}
        <div className={cx('flex-1 min-h-0 overflow-y-auto', govdeClass)}>{children}</div>
        {/* Aşama 190: ui-modal-footer, içindeki düğmeleri eşit boy yapar (index.css) */}
        {footer && (
          <div className={cx('ui-modal-footer shrink-0 flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2/60', !tamEkran && 'sm:rounded-b-2xl')}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// Aşama 340: tema düğmesi = Otomatik (cihaza uyar) / Açık / Koyu seçimi. Düğmedeki simge seçimi gösterir.
const TEMA_SECENEKLERI: { k: ThemeChoice; ad: string; Icon: typeof Sun }[] = [
  { k: 'auto', ad: 'Otomatik', Icon: SunMoon },
  { k: 'light', ad: 'Açık', Icon: Sun },
  { k: 'dark', ad: 'Koyu', Icon: Moon },
];

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const [choice, , setChoice] = useThemeChoice();
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement | null>(null);
  const dugmeRef = useRef<HTMLButtonElement | null>(null);
  const ogeRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) setAcik(false);
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAcik(false);
        dugmeRef.current?.focus();
      } else if (e.key === 'Tab') {
        setAcik(false); // Aşama 340b: Tab ile menüden çıkınca menü açık kalmaz
      }
    };
    document.addEventListener('pointerdown', disari);
    document.addEventListener('keydown', tus);
    // açılınca seçili öğeye odak (klavyeyle gezilebilir)
    const i = Math.max(0, TEMA_SECENEKLERI.findIndex((o) => o.k === choice));
    requestAnimationFrame(() => ogeRef.current[i]?.focus());
    return () => {
      document.removeEventListener('pointerdown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, [acik]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!THEME_SWITCH_ENABLED) return null;
  const secili = TEMA_SECENEKLERI.find((o) => o.k === choice) || TEMA_SECENEKLERI[0];
  const SeciliIcon = secili.Icon;

  const okTusu = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = TEMA_SECENEKLERI.length;
    const h = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    ogeRef.current[h]?.focus();
  };

  return (
    <div className="relative" ref={kutuRef}>
      <button
        type="button"
        id="theme-toggle-btn"
        ref={dugmeRef}
        onClick={() => setAcik((a) => !a)}
        className={cx('ui-btn ui-btn-ghost ui-btn-icon', acik && 'bg-surface-2', className)}
        title={`Tema: ${secili.ad}`}
        aria-label={`Tema: ${secili.ad}`}
        aria-haspopup="menu"
        aria-expanded={acik}
      >
        <SeciliIcon className="w-[18px] h-[18px]" />
      </button>
      {acik && (
        <div
          role="menu"
          aria-label="Tema"
          className="ui-menu-in absolute right-0 top-full mt-2 min-w-52 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-pop z-50"
        >
          <p className="ui-eyebrow px-2.5 pt-1 pb-1">Tema</p>
          {TEMA_SECENEKLERI.map((o, i) => {
            const on = o.k === choice;
            return (
              <button
                key={o.k}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                ref={(el) => {
                  ogeRef.current[i] = el;
                }}
                onKeyDown={(e) => okTusu(e, i)}
                onClick={() => {
                  setChoice(o.k);
                  setAcik(false);
                }}
                className={cx(
                  // Aşama 340: "Diğer ⋯" menüsüyle aynı satır ölçüsü (h-9 telefonda, h-8 bilgisayarda), basınca hafif yay
                  'flex w-full h-9 sm:h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-xs cursor-pointer',
                  'transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.98]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  on ? 'bg-surface-2 text-fg font-semibold' : 'text-fg-2 hover:bg-surface-2'
                )}
              >
                <o.Icon className={cx('w-4 h-4 shrink-0', on ? 'text-brand-fg' : 'text-muted')} />
                <span className="flex-1 min-w-0 truncate">
                  {o.ad}
                  {o.k === 'auto' && <span className="ml-1.5 font-normal text-subtle">Cihaza uyar</span>}
                </span>
                <Check className={cx('w-4 h-4 shrink-0 text-brand-fg transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
