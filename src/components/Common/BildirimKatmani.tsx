import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { bildirimKapat, useBildirimler, type Bildirim } from '../../lib/bildirim';
import { useGeriAl } from '../../lib/geriAl';
import { cx } from '../ui/kit';

// ============================================================================
// Aşama 348: ortak bildirim katmanı (lib/bildirim.ts). App'te bir kez durur.
// Masaüstünde sağ alt köşe; telefonda alt menünün üstünde tam genişlik. "Geri al" çubuğu açıkken onun üstüne kayar.
// Yaylı giriş (yalnız transform/opacity); hareket azaltma tercihinde yalnız belirir.
// ============================================================================

const SIMGE = { basari: CheckCircle2, hata: AlertTriangle, bilgi: Info } as const;
const RENK = { basari: 'text-success-fg', hata: 'text-danger-fg', bilgi: 'text-brand-fg' } as const;

const Oge: React.FC<{ b: Bildirim }> = ({ b }) => {
  const [durdu, setDurdu] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);
  const kalan = useRef(b.sure);
  const basladi = useRef(0);

  // Aynı yazı yeniden gelince süre baştan
  useEffect(() => {
    kalan.current = b.sure;
  }, [b.tazelendi, b.sure]);

  useEffect(() => {
    if (durdu || calisiyor) return;
    basladi.current = Date.now();
    const t = setTimeout(() => bildirimKapat(b.no), kalan.current);
    return () => {
      clearTimeout(t);
      kalan.current = Math.max(1500, kalan.current - (Date.now() - basladi.current));
    };
  }, [b.no, b.tazelendi, durdu, calisiyor]);

  const Simge = SIMGE[b.tur];
  const eylem = async () => {
    if (!b.eylem || calisiyor) return;
    setCalisiyor(true);
    try {
      await b.eylem.calistir();
      bildirimKapat(b.no);
    } catch {
      /* eylem kendi hatasını yeni bildirimle söyler */
      setCalisiyor(false);
    }
  };

  return (
    <div
      role={b.tur === 'hata' ? 'alert' : 'status'}
      className="bildirim pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-fg shadow-pop"
      onMouseEnter={() => setDurdu(true)}
      onMouseLeave={() => setDurdu(false)}
      onFocus={() => setDurdu(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDurdu(false);
      }}
    >
      <Simge className={cx('mt-px w-4 h-4 shrink-0', RENK[b.tur])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-5 break-words">{b.baslik}</p>
        {b.ayrinti && <p className="text-xs leading-snug text-muted break-words">{b.ayrinti}</p>}
        {b.eylem && (
          <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary mt-2" onClick={() => void eylem()} disabled={calisiyor} aria-busy={calisiyor}>
            {calisiyor ? 'Bekleyin…' : b.eylem.ad}
          </button>
        )}
      </div>
      <button type="button" onClick={() => bildirimKapat(b.no)} aria-label="Bildirimi kapat" className="ui-btn ui-btn-ghost ui-btn-icon -mr-1.5 -my-1 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const BildirimKatmani: React.FC = () => {
  const liste = useBildirimler();
  const geriAl = useGeriAl();
  if (!liste.length) return null;
  return (
    <div
      aria-live="polite"
      className={cx(
        'bildirim-katmani pointer-events-none fixed z-(--z-bildirim) flex flex-col gap-2',
        'inset-x-4 md:inset-x-auto md:right-6 md:w-[22rem]',
        geriAl ? 'bildirim-katmani-yukari' : ''
      )}
    >
      {liste.map((b) => (
        <Oge key={b.no} b={b} />
      ))}
    </div>
  );
};
