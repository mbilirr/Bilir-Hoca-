import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, HelpCircle, Info } from 'lucide-react';
// Aşama 215: kit.tsx InfoTip'i kullandığı için döngüsel içe aktarma olmasın diye cx burada tanımlı (kit'tekiyle aynı)
const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// ============================================================================
// Aşama 182: SADE PENCERE PARÇALARI
// - InfoTip: uzun açıklamalar ekranda durmaz; küçük ⓘ simgesine gömülür.
//   Bilgisayarda üzerine gelince, telefonda dokununca açılır; Esc / dışarı dokunma kapatır.
// - CompactRow: "TC kimlik · Kayıtlı [Değiştir] [Sil]" gibi tek satırlık ayar satırı.
//   Ayrıntı (giriş kutusu vb.) yalnız gerektiğinde satırın altında açılır.
// - HelpDisclosure (Aşama 184): uzun "Nasıl çalışır?" rehberleri kapalı başlar, tıklayınca açılır.
// ============================================================================

const POP_W = 256; // 16rem
const EDGE = 8;

export const InfoTip: React.FC<{ text: React.ReactNode; label?: string; className?: string }> = ({ text, label = 'Açıklama', className }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const hoverable = useRef(false);

  useEffect(() => {
    try {
      hoverable.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      hoverable.current = false;
    }
  }, []);

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - POP_W / 2), vw - POP_W - EDGE);
    const popH = popRef.current?.offsetHeight || 0;
    const below = b.bottom + 6;
    const top = popH && below + popH > window.innerHeight - EDGE ? Math.max(EDGE, b.top - popH - 6) : below;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // önce bilgi kutusu kapanır, pencere açık kalır
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        title={label}
        onClick={() => setOpen((v) => (hoverable.current ? true : !v))}
        onMouseEnter={() => hoverable.current && setOpen(true)}
        onMouseLeave={() => hoverable.current && setOpen(false)}
        className={cx(
          'inline-flex items-center justify-center w-5 h-5 rounded-full text-subtle hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 cursor-pointer shrink-0',
          className
        )}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={id}
            role="tooltip"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POP_W }}
            className="fixed z-[10002] rounded-lg border border-line bg-surface text-fg-2 shadow-pop px-3 py-2 text-[11px] leading-relaxed"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
};

type IconType = React.ComponentType<{ className?: string }>;

export const CompactRow: React.FC<{
  /** Sol başta simge ya da küçük resim */
  icon?: IconType;
  lead?: React.ReactNode;
  title: React.ReactNode;
  /** Başlığın yanındaki durum (ör. <span className="ui-chip ui-chip-success">Kayıtlı</span>) */
  status?: React.ReactNode;
  info?: React.ReactNode;
  /** Sağdaki küçük düğmeler */
  actions?: React.ReactNode;
  /** Satırın altında açılan ayrıntı (giriş kutusu vb.) */
  children?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, lead, title, status, info, actions, children, className }) => (
  <div className={cx('rounded-xl border border-line bg-surface px-3 py-2', className)}>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-h-8">
      {lead ?? (Icon ? <Icon className="w-4 h-4 text-brand-fg shrink-0" /> : null)}
      <span className="text-xs font-bold text-fg-2">{title}</span>
      {status}
      {info && <InfoTip text={info} />}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </div>
    {children && <div className="pt-2">{children}</div>}
  </div>
);

/** Aşama 184: kapalı başlayan "Nasıl çalışır?" kutusu. İçerik yalnız açılınca çizilir. */
export const HelpDisclosure: React.FC<{
  title?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ title = 'Nasıl çalışır?', defaultOpen = false, children, className }) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cx('rounded-xl border border-line bg-surface-2/50', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 h-8 text-xs font-semibold text-brand-fg hover:text-fg rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cx('w-4 h-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={id} className="px-3 pb-3 text-xs text-muted space-y-2">
          {children}
        </div>
      )}
    </div>
  );
};
