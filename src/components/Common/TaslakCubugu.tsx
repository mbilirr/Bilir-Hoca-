import React from 'react';
import { History } from 'lucide-react';
import { taslakZamani } from '../../lib/taslak';

// Aşama 344: formun üstünde "yarım kalan taslak" satırı. İki düğme aynı ölçüde (h-8, w-24).
export const TaslakCubugu: React.FC<{ zaman: number; onGeriYukle: () => void; onSil: () => void; id?: string }> = ({
  zaman,
  onGeriYukle,
  onSil,
  id,
}) => (
  <div
    role="status"
    id={id}
    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/25 bg-brand-soft/60 px-3 py-2 text-xs text-fg-2"
  >
    <span className="flex items-center gap-1.5 min-w-0">
      <History className="w-4 h-4 shrink-0 text-brand-fg" />
      <span className="font-semibold text-fg">Kaydedilmemiş taslağınız var</span>
      <span className="text-muted truncate">· {taslakZamani(zaman)}</span>
    </span>
    <span className="flex gap-2 ml-auto">
      <button type="button" onClick={onSil} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-24">
        Sil
      </button>
      <button type="button" onClick={onGeriYukle} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-24">
        Geri yükle
      </button>
    </span>
  </div>
);
