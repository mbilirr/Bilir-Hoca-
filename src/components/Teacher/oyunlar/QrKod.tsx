import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Aşama 381: bağlantıyı QR koda çevirir (tarayıcıda, dışarı veri gönderilmez). Telefon kamerasının okuması için
// zemin her temada beyaz, karakalem koyudur.
export const QrKod: React.FC<{ metin: string; boyut?: number; etiket?: string }> = ({ metin, boyut = 192, etiket = 'Oyun bağlantısı QR kodu' }) => {
  const { yol, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(metin);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      let basla = -1;
      for (let c = 0; c <= n; c++) {
        const koyu = c < n && q.isDark(r, c);
        if (koyu && basla < 0) basla = c;
        if (!koyu && basla >= 0) {
          d += `M${basla} ${r}h${c - basla}v1h-${c - basla}z`;
          basla = -1;
        }
      }
    }
    return { yol: d, n };
  }, [metin]);
  const kenar = 4;
  return (
    <svg role="img" aria-label={etiket} viewBox={`${-kenar} ${-kenar} ${n + kenar * 2} ${n + kenar * 2}`} width={boyut} height={boyut} className="rounded-xl bg-white" shapeRendering="crispEdges">
      <path d={yol} fill="#000" />
    </svg>
  );
};
