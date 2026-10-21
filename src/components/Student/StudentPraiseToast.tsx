import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { StudentNotification } from '../../types';

// ============================================================================
// Aşama 68: Öğretmenin tebrik mesajı — küçük ana ekran bildirimi
// Eskiden ana sayfanın en üstünde büyük turuncu bir duvar olarak çıkıyordu. Artık ekranın köşesinde küçük bir
// bildirim kartı olarak görünür; 15 saniye sonra kendiliğinden kaybolur (alttaki ince çubuk kalan süreyi gösterir).
// Kapanınca (süre dolunca ya da ✕ ile) okundu sayılır, sayfa yeniden açılınca tekrar çıkmaz.
// Tebrik bildirim zilinde (bildirim merkezi) her zaman durur.
// ============================================================================

const SHOW_MS = 15000;

export const StudentPraiseToast: React.FC<{
  /** Okunmamış tebrikler (en yeni önce) */
  praises: StudentNotification[];
  /** Gösterilen tebrikler okundu yapılır */
  onDone: (ids: string[]) => void;
}> = ({ praises, onDone }) => {
  const top = praises[0];
  const [run, setRun] = useState(false); // çubuğun azalmaya başlaması (ilk çizimden sonra)
  const key = top ? top.id : '';

  useEffect(() => {
    if (!key) return;
    setRun(false);
    const raf = window.requestAnimationFrame(() => setRun(true));
    const t = window.setTimeout(() => onDone(praises.map((p) => p.id)), SHOW_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!top) return null;
  const more = praises.length - 1;

  return (
    <div
      role="status"
      aria-live="polite"
      id="student-praise-toast"
      className="fixed z-[90] top-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[22rem] rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-surface shadow-pop overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-start gap-3 p-3.5">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shrink-0 text-lg shadow-sm" aria-hidden>
          ⭐
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-fg leading-snug">
            {top.teacherName ? `${top.teacherName} seni tebrik etti` : 'Öğretmenin seni tebrik etti'} 👏
          </p>
          {top.message && <p className="mt-0.5 text-xs text-fg-2 leading-relaxed line-clamp-3 break-words">{top.message}</p>}
          {(top.sourceTitle || more > 0) && (
            <p className="mt-1 text-[11px] text-muted truncate">
              {top.sourceTitle || ''}
              {top.sourceTitle && more > 0 ? ' · ' : ''}
              {more > 0 ? `+${more} tebrik daha (bildirimlerde)` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDone(praises.map((p) => p.id))}
          className="ui-btn ui-btn-ghost ui-btn-icon -mr-1 -mt-1 shrink-0"
          aria-label="Bildirimi kapat"
          title="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* kalan süre */}
      <div className="h-1 bg-amber-100 dark:bg-amber-500/15">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 ease-linear"
          style={{ width: run ? '0%' : '100%', transition: run ? `width ${SHOW_MS}ms linear` : 'none' }}
        />
      </div>
    </div>
  );
};
