import React, { useEffect, useState, startTransition } from 'react';
import { ChevronDown } from 'lucide-react';

// ============================================================================
// HIZ (Aşama 15): Uzun listeler parça parça çizilir.
// Yüzlerce satırı bir anda çizmek telefonu saniyelerce dondurur; ilk 50 satır gösterilir,
// "Daha fazla göster" ile devamı gelir. Arama / filtre değişince başa dönülür.
// ============================================================================

export const LIST_STEP = 50;

// Aşama 84: firstPaint verilirse sayfa önce o kadar satırla açılır, kalan satırlar hemen ardından arka planda
// eklenir (ekran beklemeden görünür; sonuçta yine `step` kadar satır gösterilir)
export function usePagedList<T>(list: T[], resetKey: unknown, step = LIST_STEP, firstPaint?: number) {
  const initial = firstPaint && firstPaint < step ? firstPaint : step;
  const [count, setCount] = useState(initial);
  useEffect(() => {
    setCount(initial);
    if (initial >= step) return;
    const t = setTimeout(() => startTransition(() => setCount((c) => Math.max(c, step))), 30);
    return () => clearTimeout(t);
  }, [resetKey, step, initial]);
  const visible = list.length > count ? list.slice(0, count) : list;
  return {
    visible,
    // ilk açılışta kalan satırlar eklenirken "Daha fazla göster" çubuğu zıplamasın
    remaining: Math.max(0, list.length - Math.max(count, step)),
    total: list.length,
    showMore: () => setCount((c) => Math.max(c, step) + step),
    showAll: () => setCount(list.length),
  };
}

// Ekran genişliği koşulu (ör. telefon görünümü). Gizli görünümü hiç çizmemek için kullanılır.
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return match;
}

export const ShowMoreBar: React.FC<{
  remaining: number;
  total: number;
  shown: number;
  onMore: () => void;
  onAll?: () => void;
  id?: string;
  step?: number;
}> = ({ remaining, total, shown, onMore, onAll, id, step = LIST_STEP }) => {
  if (remaining <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3 border-t border-line bg-surface-2/50" id={id}>
      <span className="text-xs text-muted">
        {shown} / {total} gösteriliyor
      </span>
      <button type="button" onClick={onMore} className="ui-btn ui-btn-secondary ui-btn-sm" data-testid="show-more">
        <ChevronDown className="w-3.5 h-3.5" />
        {Math.min(step, remaining)} tane daha göster
      </button>
      {onAll && remaining > step && (
        <button type="button" onClick={onAll} className="ui-btn ui-btn-ghost ui-btn-sm" data-testid="show-all">
          Tümünü göster ({total})
        </button>
      )}
    </div>
  );
};
