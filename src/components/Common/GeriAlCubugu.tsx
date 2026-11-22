import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import { GERI_AL_MS, geriAlKapat, useGeriAl } from '../../lib/geriAl';
import { agHatasiMi, baglantiNedeni } from '../../lib/baglanti';

// ============================================================================
// Aşama 306: "… silindi · Geri al" çubuğu (ekranın altında ortada; telefonda alt menünün üstünde).
// - 10 sn görünür; fare üstündeyken ya da klavyeyle odaktayken süre durur (okumaya / ulaşmaya zaman kalır).
// - Altındaki ince çizgi kalan süreyi gösterir. Esc kapatır.
// - Geri al: "Geri alınıyor…" → "Geri alındı" (2 sn). Olmazsa nedeni 6 sn görünür.
// ============================================================================

type Durum = 'bekliyor' | 'calisiyor' | 'tamam' | 'hata';

export const GeriAlCubugu: React.FC = () => {
  const kayit = useGeriAl();
  const [durum, setDurum] = useState<Durum>('bekliyor');
  const [hata, setHata] = useState('');
  const [durdu, setDurdu] = useState(false);
  const kalan = useRef(GERI_AL_MS);
  const basladi = useRef(0);

  // Yeni silmede baştan başlar
  useEffect(() => {
    setDurum('bekliyor');
    setHata('');
    setDurdu(false);
    kalan.current = GERI_AL_MS;
  }, [kayit?.no]);

  // Geri sayım (durunca kalan süre saklanır)
  useEffect(() => {
    if (!kayit || durum !== 'bekliyor' || durdu) return;
    basladi.current = Date.now();
    const t = setTimeout(() => geriAlKapat(kayit.no), kalan.current);
    return () => {
      clearTimeout(t);
      kalan.current = Math.max(0, kalan.current - (Date.now() - basladi.current));
    };
  }, [kayit, durum, durdu]);

  // Sonuç yazıları kendiliğinden kapanır
  useEffect(() => {
    if (!kayit || (durum !== 'tamam' && durum !== 'hata')) return;
    const t = setTimeout(() => geriAlKapat(kayit.no), durum === 'tamam' ? 2000 : 6000);
    return () => clearTimeout(t);
  }, [kayit, durum]);

  useEffect(() => {
    if (!kayit) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && durum !== 'calisiyor') geriAlKapat(kayit.no);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [kayit, durum]);

  if (!kayit) return null;

  const geriAl = async () => {
    if (durum !== 'bekliyor') return;
    setDurum('calisiyor');
    try {
      await kayit.geriAl();
      setDurum('tamam');
    } catch (e: any) {
      // Bağlantı hatası tarayıcının İngilizce yazısıyla değil, ne olduğuyla gösterilir (Aşama 304)
      const neden = agHatasiMi(e) ? baglantiNedeni() : String(e?.message || '').trim();
      setHata(neden ? `Geri alınamadı: ${neden}` : 'Geri alınamadı.');
      setDurum('hata');
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setDurdu(true)}
      onMouseLeave={() => setDurdu(false)}
      onFocus={() => setDurdu(true)}
      onBlur={() => setDurdu(false)}
      className="geri-al fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] md:bottom-6 z-(--z-bildirim) max-w-[calc(100vw-2rem)] overflow-hidden rounded-full bg-fg text-canvas text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
      id="geri-al-cubugu"
    >
      <div className="flex items-center gap-3 whitespace-nowrap pl-4 pr-1.5 py-1.5">
        {durum === 'tamam' ? (
          <span className="flex items-center gap-2 py-1 pr-2.5 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-success" aria-hidden /> Geri alındı
          </span>
        ) : durum === 'hata' ? (
          <span className="py-1 pr-2.5 font-semibold whitespace-normal">{hata}</span>
        ) : (
          <>
            <span className="min-w-0 font-semibold truncate">{kayit.metin}</span>
            <button data-serbest="koyu bildirim çubuğu"
              type="button"
              onClick={() => void geriAl()}
              disabled={durum === 'calisiyor'}
              aria-busy={durum === 'calisiyor'}
              className="inline-flex items-center gap-1.5 rounded-full bg-canvas/15 px-3 py-1 font-semibold text-canvas transition-colors hover:bg-canvas/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas disabled:cursor-progress"
              id="geri-al-dugmesi"
            >
              {durum === 'calisiyor' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Undo2 className="w-3.5 h-3.5" aria-hidden />
              )}
              {durum === 'calisiyor' ? 'Geri alınıyor…' : 'Geri al'}
            </button>
          </>
        )}
      </div>
      {durum === 'bekliyor' && (
        <span
          key={kayit.no}
          aria-hidden
          className="geri-al-sure absolute inset-x-0 bottom-0 h-0.5 origin-left bg-canvas/40"
          style={{ animationDuration: `${GERI_AL_MS}ms`, animationPlayState: durdu ? 'paused' : 'running' }}
        />
      )}
    </div>
  );
};
