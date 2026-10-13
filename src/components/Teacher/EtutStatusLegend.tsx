import React from 'react';
import { ETUT_STATUS_ORDER, ETUT_STATUS_STYLE } from '../../lib/etutStatus';

// Etüt renklerinin açıklaması (takvim ve liste üstünde küçük renk anahtarı)
export const EtutStatusLegend: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted ${className}`} id="etut-status-legend">
    {ETUT_STATUS_ORDER.map((k) => (
      <span key={k} className="inline-flex items-center gap-1.5" title={ETUT_STATUS_STYLE[k].hint}>
        <span className={`w-2.5 h-2.5 rounded-sm ${ETUT_STATUS_STYLE[k].dot}`} />
        {ETUT_STATUS_STYLE[k].label}
      </span>
    ))}
  </div>
);
