// ============================================================================
// Aşama 407: Kitaptan soru — sayfa ve soru kutuları. Boş yere sürükleyince yeni kutu çizilir; kutunun içinden
// tutup taşınır, sağ alt köşesinden boyutlanır, × ile silinir. Fare, kalem ve parmak aynı çalışır.
// Oranlar sayfa resmine göre 0-1'dir; kesme ve okuma üst bileşende yapılır.
// Dokunmatik ekranda parmak boş yerde sayfayı kaydırır (çizmez); kutular yine parmakla taşınır / boyutlanır,
// yeni kutu "Kutu ekle" düğmesiyle gelir.
// ============================================================================
import React, { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cx } from '../../../ui/kit';
import { KESIM_EN_AZ, type KesimKutusu } from '../../../../lib/oyunGorsel';

export interface SayfaKutusu {
  id: string;
  kutu: KesimKutusu;
  etiket: string;
}

type Is = { tur: 'ciz'; x: number; y: number } | { tur: 'tasi' | 'boy'; id: string; x: number; y: number; ilk: KesimKutusu };

const sinirla = (k: KesimKutusu): KesimKutusu => {
  const w = Math.min(1, Math.max(KESIM_EN_AZ, k.w));
  const h = Math.min(1, Math.max(KESIM_EN_AZ, k.h));
  return { x: Math.min(1 - w, Math.max(0, k.x)), y: Math.min(1 - h, Math.max(0, k.y)), w, h };
};

export const SayfaKutulari: React.FC<{
  resim: string;
  sayfa: number;
  kutular: SayfaKutusu[];
  /** bu sayfadan daha önce eklenen soruların kutuları (yalnız gösterilir) */
  eklenen: KesimKutusu[];
  secili: string | null;
  onSec: (id: string | null) => void;
  onYeni: (k: KesimKutusu) => void;
  onDegisti: (id: string, k: KesimKutusu) => void;
  onSil: (id: string) => void;
}> = ({ resim, sayfa, kutular, eklenen, secili, onSec, onYeni, onDegisti, onSil }) => {
  const alanRef = useRef<HTMLDivElement>(null);
  const is = useRef<(Is & { pid: number }) | null>(null);
  const [cizilen, setCizilen] = useState<KesimKutusu | null>(null);
  const [oynayan, setOynayan] = useState<{ id: string; kutu: KesimKutusu } | null>(null);

  const nokta = (e: React.PointerEvent) => {
    const r = alanRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };

  const basla = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-sil]')) return;
    const hedef = (e.target as HTMLElement).closest<HTMLElement>('[data-kutu]');
    const id = hedef?.dataset.kutu;
    const k = id ? kutular.find((x) => x.id === id) : null;
    if (!k && e.pointerType === 'touch') return; // parmak boş yerde: sayfa kaydırılır
    e.preventDefault();
    alanRef.current?.setPointerCapture(e.pointerId);
    const p = nokta(e);
    if (k) {
      onSec(k.id);
      is.current = { tur: (e.target as HTMLElement).closest('[data-boy]') ? 'boy' : 'tasi', id: k.id, x: p.x, y: p.y, ilk: k.kutu, pid: e.pointerId };
      setOynayan({ id: k.id, kutu: k.kutu });
    } else {
      onSec(null);
      is.current = { tur: 'ciz', x: p.x, y: p.y, pid: e.pointerId };
      setCizilen({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  };

  const surukle = (e: React.PointerEvent) => {
    const c = is.current;
    if (!c || c.pid !== e.pointerId) return;
    const p = nokta(e);
    if (c.tur === 'ciz') setCizilen({ x: Math.min(c.x, p.x), y: Math.min(c.y, p.y), w: Math.abs(p.x - c.x), h: Math.abs(p.y - c.y) });
    else if (c.tur === 'tasi') setOynayan({ id: c.id, kutu: sinirla({ ...c.ilk, x: c.ilk.x + p.x - c.x, y: c.ilk.y + p.y - c.y }) });
    else setOynayan({ id: c.id, kutu: sinirla({ ...c.ilk, w: Math.min(1 - c.ilk.x, c.ilk.w + p.x - c.x), h: Math.min(1 - c.ilk.y, c.ilk.h + p.y - c.y) }) });
  };

  const birak = (e: React.PointerEvent) => {
    const c = is.current;
    if (!c || c.pid !== e.pointerId) return;
    is.current = null;
    if (c.tur === 'ciz') {
      if (cizilen && cizilen.w >= KESIM_EN_AZ && cizilen.h >= KESIM_EN_AZ) onYeni(cizilen);
      setCizilen(null);
    } else if (oynayan) {
      const d = oynayan.kutu;
      // yerinde tıklama (kıpırdamadan) değişiklik sayılmaz: kesme ve okuma yeniden yapılmaz
      if (Math.abs(d.x - c.ilk.x) + Math.abs(d.y - c.ilk.y) + Math.abs(d.w - c.ilk.w) + Math.abs(d.h - c.ilk.h) > 0.004) onDegisti(c.id, d);
      setOynayan(null);
    }
  };

  const yuzde = (k: KesimKutusu) => ({ left: `${k.x * 100}%`, top: `${k.y * 100}%`, width: `${k.w * 100}%`, height: `${k.h * 100}%` });

  return (
    <div
      ref={alanRef}
      className="relative mx-auto w-full max-w-3xl cursor-crosshair select-none touch-pan-y overflow-hidden bg-white"
      onPointerDown={basla}
      onPointerMove={surukle}
      onPointerUp={birak}
      onPointerCancel={birak}
      role="application"
      aria-label={`Sayfa ${sayfa}: soruyu çerçevelemek için sürükleyin. Kutuyu taşımak için içinden, boyutlamak için sağ alt köşesinden tutun.`}
    >
      <img src={resim} alt="" draggable={false} className="block w-full" />
      {eklenen.map((k, i) => (
        <div key={`e${i}`} aria-hidden className="pointer-events-none absolute rounded-sm border-2 border-dashed border-success bg-success/5" style={yuzde(k)}>
          <span className="absolute left-0 top-0 flex items-center gap-0.5 rounded-br-lg bg-success px-1.5 py-px text-3xs font-bold text-white">
            <Check className="w-2.5 h-2.5" />
            Eklendi
          </span>
        </div>
      ))}
      {kutular.map((k) => {
        const kutu = oynayan?.id === k.id ? oynayan.kutu : k.kutu;
        const acik = secili === k.id;
        return (
          <div
            key={k.id}
            data-kutu={k.id}
            className={cx('absolute cursor-move touch-none rounded-sm border-2 transition-colors', acik ? 'border-brand bg-brand/10' : 'border-brand/70 bg-brand/5 hover:bg-brand/10')}
            style={yuzde(kutu)}
          >
            <span className="pointer-events-none absolute left-0 top-0 rounded-br-lg bg-brand px-1.5 py-px text-3xs font-bold tabular-nums text-white">{k.etiket}</span>
            <button
              type="button"
              data-sil
              onClick={() => onSil(k.id)}
              aria-label={`${k.etiket}. kutuyu sil`}
              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-fg-2 shadow-card hover:bg-danger-soft hover:text-danger-fg"
            >
              <X className="w-3 h-3" aria-hidden />
            </button>
            <span data-boy aria-hidden className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-brand bg-surface" />
          </div>
        );
      })}
      {cizilen && (
        <div
          className={cx('pointer-events-none absolute rounded-sm border-2', cizilen.w >= KESIM_EN_AZ && cizilen.h >= KESIM_EN_AZ ? 'border-brand' : 'border-dashed border-brand')}
          style={{ ...yuzde(cizilen), boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.25)' }}
        />
      )}
    </div>
  );
};
