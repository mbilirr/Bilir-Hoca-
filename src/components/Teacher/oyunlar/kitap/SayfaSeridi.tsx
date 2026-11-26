// ============================================================================
// Aşama 407: Kitaptan soru — sayfa şeridi. Küçük sayfa resimleri yalnız göründüklerinde ve sırayla çizilir
// (300 sayfalık kitapta bile açılış bekletmez). Soru işaretlenen sayfanın köşesinde sayısı görünür.
// ============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../../../ui/kit';
import type { Kitapcik } from '../../../../lib/deneme/kitapcik';

const KUCUK_GENIS = 96;

export const SayfaSeridi: React.FC<{
  kitap: Kitapcik;
  sayfa: number;
  /** sayfa → o sayfada işaretli soru sayısı */
  sayilar: Map<number, number>;
  /** daha önce soru eklenen sayfalar */
  eklenen: Map<number, unknown[]>;
  onSec: (n: number) => void;
}> = ({ kitap, sayfa, sayilar, eklenen, onSec }) => {
  const [resimler, setResimler] = useState<Map<number, string>>(() => new Map());
  const kapRef = useRef<HTMLDivElement>(null);
  const sira = useRef<Promise<void>>(Promise.resolve());
  const istenen = useRef(new Set<number>());

  // kitap değişince temizlenir
  useEffect(() => {
    setResimler(new Map());
    istenen.current = new Set();
  }, [kitap]);

  // görünen sayfalar istenir; çizim tek tek (pdf.js zaten sırayla çalışır, ana sayfa önde kalsın)
  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    let canli = true;
    const gozcu = new IntersectionObserver(
      (girdiler) => {
        for (const g of girdiler) {
          if (!g.isIntersecting) continue;
          const n = Number((g.target as HTMLElement).dataset.sayfa);
          if (!n || istenen.current.has(n)) continue;
          istenen.current.add(n);
          sira.current = sira.current.then(async () => {
            if (!canli) return;
            try {
              const r = await kitap.render(n, KUCUK_GENIS, 0.7, 60_000);
              if (canli) setResimler((m) => new Map(m).set(n, r.dataUrl));
            } catch {
              istenen.current.delete(n);
            }
          });
        }
      },
      { root: kap, rootMargin: '0px 240px' }
    );
    kap.querySelectorAll('[data-sayfa]').forEach((el) => gozcu.observe(el));
    return () => {
      canli = false;
      gozcu.disconnect();
    };
  }, [kitap]);

  // seçili sayfa görünür alana kayar
  useEffect(() => {
    kapRef.current?.querySelector(`[data-sayfa="${sayfa}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sayfa]);

  return (
    <div ref={kapRef} className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Sayfalar" role="list">
      {Array.from({ length: kitap.pageCount }, (_, i) => {
        const n = i + 1;
        const say = sayilar.get(n) || 0;
        const eski = eklenen.get(n)?.length || 0;
        const r = resimler.get(n);
        return (
          <button
            key={n}
            type="button"
            role="listitem"
            data-sayfa={n}
            onClick={() => onSec(n)}
            aria-current={n === sayfa ? 'page' : undefined}
            aria-label={`Sayfa ${n}${say ? `, ${say} soru işaretli` : ''}${eski ? `, ${eski} soru eklendi` : ''}`}
            className={cx(
              'relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-lg border bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              n === sayfa ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-line-strong'
            )}
          >
            {r ? <img src={r} alt="" className="h-full w-full object-cover object-top" draggable={false} /> : <span className="block h-full w-full bg-surface-2" />}
            <span className="absolute inset-x-0 bottom-0 bg-surface/90 text-center text-3xs font-semibold tabular-nums text-fg-2">{n}</span>
            {eski > 0 && !say && (
              <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-success text-white">
                <Check className="w-2.5 h-2.5" aria-hidden />
              </span>
            )}
            {say > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-3xs font-bold tabular-nums text-white">{say}</span>}
          </button>
        );
      })}
    </div>
  );
};
