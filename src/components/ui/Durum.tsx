import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cx } from './kit';

// ============================================================================
// Aşama 305: TEK TİP "YÜKLENİYOR" VE "OKUNAMADI" GÖRÜNÜMÜ
// - Yukleniyor: küçük dönen halka + yazı (Aşama 348: liste/sayfa için iskelet seçeneği). Kısa sürede biten yüklemelerde ekranda yanıp sönmesin diye 250 ms sonra
//   yumuşakça belirir (yeri baştan ayrılır, sayfa zıplamaz). Hareket azaltma tercihinde halka dönmez.
// - YuklemeHatasi: okunamayan bölümde nedeni ve "Tekrar dene" düğmesi. Düğme deneme sürerken döner ve kilitlenir;
//   eskiden tek çare sayfayı yenilemekti.
// Boş durum için kit.tsx'teki EmptyState kullanılır.
// ============================================================================

/** Aşama 348: tek iskelet kutusu (boyu sınıfla verilir, ör. "h-4 w-40") */
export const Iskelet: React.FC<{ className?: string }> = ({ className }) => <span aria-hidden className={cx('iskelet block', className)} />;

/** Aşama 348: liste yer tutucusu. Satırlar gerçek satır boyunda (2,75 rem); kısa yüklemede yanıp sönmez (250 ms sonra belirir). */
export const IskeletListe: React.FC<{ satir?: number; className?: string; metin?: string }> = ({ satir = 4, className, metin = 'Yükleniyor…' }) => (
  <div role="status" aria-live="polite" className={cx('durum-gecikmeli space-y-2', className)}>
    <span className="sr-only">{metin}</span>
    {Array.from({ length: satir }, (_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 h-11">
        <Iskelet className="size-6 shrink-0 rounded-full" />
        <Iskelet className={cx('h-3', ['w-2/5', 'w-1/2', 'w-1/3', 'w-3/5'][i % 4])} />
        <Iskelet className="ml-auto h-3 w-16 shrink-0" />
      </div>
    ))}
  </div>
);

/** Aşama 348: sayfa yer tutucusu (başlık + üç kart + liste); bölüm parçası ya da sayfa verisi gelene kadar */
export const IskeletSayfa: React.FC<{ className?: string; metin?: string }> = ({ className, metin = 'Yükleniyor…' }) => (
  <div role="status" aria-live="polite" className={cx('durum-gecikmeli space-y-4', className)}>
    <span className="sr-only">{metin}</span>
    <div className="space-y-2">
      <Iskelet className="h-6 w-48" />
      <Iskelet className="h-3 w-72 max-w-full" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <Iskelet className="h-3 w-24" />
          <Iskelet className="h-7 w-16" />
        </div>
      ))}
    </div>
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 h-11">
          <Iskelet className="size-6 shrink-0 rounded-full" />
          <Iskelet className={cx('h-3', ['w-2/5', 'w-1/2', 'w-1/3', 'w-3/5'][i])} />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Yükleniyor göstergesi. Aşama 348: satir verilirse liste iskeleti, sayfa verilirse sayfa iskeleti çizer
 * (veri gelince kutular boy değiştirmez); verilmezse küçük dönen halka + yazı (dar yerler için).
 */
export const Yukleniyor: React.FC<{ metin?: string; className?: string; satir?: number; sayfa?: boolean }> = ({
  metin = 'Yükleniyor…',
  className,
  satir,
  sayfa,
}) => {
  if (sayfa) return <IskeletSayfa className={className} metin={metin} />;
  if (satir) return <IskeletListe satir={satir} className={className} metin={metin} />;
  return (
    <p role="status" aria-live="polite" className={cx('durum-gecikmeli inline-flex items-center gap-2 text-xs text-muted', className)}>
      <span
        aria-hidden
        className="inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent opacity-70 animate-spin motion-reduce:animate-none"
      />
      {metin}
    </p>
  );
};

/** Deneme sürerken kilitlenen tekrar düğmesinin ortak durumu */
function useDeneme(onTekrar?: () => unknown) {
  const [deniyor, setDeniyor] = useState(false);
  const acik = useRef(true);
  useEffect(() => {
    acik.current = true; // Aşama 306: bileşen yeniden bağlanınca (geliştirme kipindeki çift bağlanma) düğme kilitli kalmasın
    return () => {
      acik.current = false;
    };
  }, []);
  const dene = async () => {
    if (!onTekrar || deniyor) return;
    setDeniyor(true);
    try {
      await onTekrar();
    } catch {
      /* hata yeni iletiyle bölümde gösterilir */
    } finally {
      if (acik.current) setDeniyor(false);
    }
  };
  return { deniyor, dene };
}

/** Ana sayfa kartları gibi dar yerlerde hata yazısının yanına konan yazı biçiminde "Tekrar dene" */
export const TekrarDugmesi: React.FC<{ onTekrar: () => unknown }> = ({ onTekrar }) => {
  const { deniyor, dene } = useDeneme(onTekrar);
  return (
    <button type="button" className="durum-tekrar" onClick={() => void dene()} disabled={deniyor} aria-busy={deniyor}>
      {deniyor ? 'Deneniyor…' : 'Tekrar dene'}
    </button>
  );
};

export const YuklemeHatasi: React.FC<{
  mesaj: React.ReactNode;
  /** Verilirse "Tekrar dene" düğmesi çıkar; söz (Promise) dönerse bitene kadar düğme kilitli kalır */
  onTekrar?: () => unknown;
  className?: string;
}> = ({ mesaj, onTekrar, className }) => {
  const { deniyor, dene } = useDeneme(onTekrar);
  return (
    <div
      role="alert"
      className={cx(
        'flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg',
        className,
      )}
    >
      <span className="min-w-0">{mesaj}</span>
      {onTekrar && (
        <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary shrink-0" onClick={() => void dene()} disabled={deniyor} aria-busy={deniyor}>
          <RefreshCw className={cx('w-3.5 h-3.5', deniyor && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          {deniyor ? 'Deneniyor…' : 'Tekrar dene'}
        </button>
      )}
    </div>
  );
};
