// ============================================================================
// Aşama 393: Oyunlar — PDF'den soru kesme
// PDF (ya da JPG/PNG sayfa) tarayıcıda açılır; öğretmen sayfada soruyu fareyle ya da parmakla çerçeveler. Kesilen parça
// küçültülüp soru formuna görsel olarak gelir; yapay zekâ görseldeki yazıyı okur, doğru şıkkı öğretmen seçer.
// Dosya hiçbir yere yüklenmez; yalnız kaydedilen sorunun kesilen görseli saklanır. Aynı dosyadan art arda soru kesilebilir.
// ============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, FileUp, Scissors } from 'lucide-react';
import { Modal, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { openKitapcik, type Kitapcik } from '../../../lib/deneme/kitapcik';
import { KESIM_EN_AZ, gorselHazirla, type KesimKutusu } from '../../../lib/oyunGorsel';
import { lazyNamed } from '../../../lib/lazyLoad';

const SoruFormu = lazyNamed<React.ComponentProps<typeof import('./SoruFormu').SoruFormu>>(() => import('./SoruFormu'), 'SoruFormu');

/** sayfa resmi genişliği (kesilen parça bundan küçültülür; okunaklı kalsın diye geniş) */
const SAYFA_GENIS = 1600;

export const PdfSoruKesici: React.FC<{
  baslangic?: { ders?: string; sinif?: number | null };
  onClose: () => void;
  /** her eklenen soruda (liste yenilenir; pencere açık kalır) */
  onEklendi: () => void;
}> = ({ baslangic, onClose, onEklendi }) => {
  const [kitap, setKitap] = useState<Kitapcik | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [resim, setResim] = useState<string | null>(null);
  const [kutu, setKutu] = useState<KesimKutusu | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kesilen, setKesilen] = useState<string | null>(null);
  const [eklenen, setEklenen] = useState(0);
  const dosyaRef = useRef<HTMLInputElement>(null);
  const alanRef = useRef<HTMLDivElement>(null);
  const cizim = useRef<{ x: number; y: number; id: number } | null>(null);
  const onbellek = useRef(new Map<number, string>());

  useEffect(() => () => kitap?.destroy(), [kitap]);

  const dosyaSec = async (file: File | undefined) => {
    if (!file) return;
    setHata(null);
    setDurum('Dosya açılıyor…');
    try {
      const k = await openKitapcik([file]);
      onbellek.current = new Map();
      setKutu(null);
      setResim(null);
      setSayfa(1);
      setKitap(k);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Dosya açılamadı.');
    } finally {
      setDurum(null);
    }
  };

  // seçilen sayfa resme çevrilir (bir kez; sonra bellekten)
  useEffect(() => {
    if (!kitap) return;
    let canli = true;
    const hazir = onbellek.current.get(sayfa);
    setKutu(null);
    if (hazir) {
      setResim(hazir);
      return;
    }
    setResim(null);
    setDurum('Sayfa hazırlanıyor…');
    void kitap
      .render(sayfa, SAYFA_GENIS, 0.92, 8_000_000)
      .then((r) => {
        onbellek.current.set(sayfa, r.dataUrl);
        if (canli) setResim(r.dataUrl);
      })
      .catch((e) => canli && setHata(e instanceof Error ? e.message : 'Sayfa açılamadı.'))
      .finally(() => canli && setDurum(null));
    return () => {
      canli = false;
    };
  }, [kitap, sayfa]);

  // çerçeve çizme: fare, kalem ve parmak (oranlar sayfa resmine göre 0-1)
  const nokta = (e: React.PointerEvent) => {
    const r = alanRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  const basla = (e: React.PointerEvent) => {
    if (!resim || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    alanRef.current?.setPointerCapture(e.pointerId);
    const p = nokta(e);
    cizim.current = { ...p, id: e.pointerId };
    setKutu({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const surukle = (e: React.PointerEvent) => {
    const c = cizim.current;
    if (!c || c.id !== e.pointerId) return;
    const p = nokta(e);
    setKutu({ x: Math.min(c.x, p.x), y: Math.min(c.y, p.y), w: Math.abs(p.x - c.x), h: Math.abs(p.y - c.y) });
  };
  const birak = (e: React.PointerEvent) => {
    if (!cizim.current || cizim.current.id !== e.pointerId) return;
    cizim.current = null;
    setKutu((k) => (k && k.w >= KESIM_EN_AZ && k.h >= KESIM_EN_AZ ? k : null));
  };

  const kes = async () => {
    if (!resim || !kutu) return;
    setHata(null);
    setDurum('Kesiliyor…');
    try {
      setKesilen(await gorselHazirla(resim, kutu));
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Kesilemedi.');
    } finally {
      setDurum(null);
    }
  };

  const git = useCallback((n: number) => kitap && setSayfa(Math.max(1, Math.min(kitap.pageCount, n))), [kitap]);

  // ← → ile sayfa değişir (form açıkken değil)
  useEffect(() => {
    if (!kitap || kesilen) return;
    const tus = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'ArrowLeft') git(sayfa - 1);
      if (e.key === 'ArrowRight') git(sayfa + 1);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [kitap, kesilen, sayfa, git]);

  if (kesilen) {
    return (
      <React.Suspense fallback={null}>
        <SoruFormu
          soru={null}
          baslangic={baslangic}
          gorselBaslangic={kesilen}
          onClose={() => setKesilen(null)}
          onSaved={() => {
            setKesilen(null);
            setKutu(null);
            setEklenen((n) => n + 1);
            onEklendi();
          }}
        />
      </React.Suspense>
    );
  }

  const kutuHazir = !!kutu && kutu.w >= KESIM_EN_AZ && kutu.h >= KESIM_EN_AZ;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={Scissors}
      title="PDF'den soru"
      description="Sayfada soruyu çerçeveleyin; kesilen parça sorunun görseli olur. Dosya hiçbir yere yüklenmez."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted" role="status">
            {eklenen > 0 ? `Bu dosyadan ${eklenen} soru eklendi.` : kitap ? (kutuHazir ? 'Seçim hazır.' : 'Soruyu çerçevelemek için sürükleyin.') : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              {eklenen > 0 ? 'Bitti' : 'Vazgeç'}
            </Button>
            {kitap && (
              <Button leftIcon={<Scissors className="w-3.5 h-3.5" />} disabled={!kutuHazir || !!durum} onClick={() => void kes()}>
                Kes ve soruyu yaz
              </Button>
            )}
          </div>
        </div>
      }
    >
      <input ref={dosyaRef} type="file" accept=".pdf,application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => void dosyaSec(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      {!kitap ? (
        <button
          type="button"
          onClick={() => dosyaRef.current?.click()}
          disabled={!!durum}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-12 text-center transition-colors hover:bg-surface"
        >
          <FileUp className="h-7 w-7 text-muted" aria-hidden />
          <span className="text-sm font-semibold text-fg">{durum || 'PDF ya da sayfa resmi seçin'}</span>
          <span className="text-xs text-muted">Test kitabı, çalışma kâğıdı ya da sayfa fotoğrafı (JPG, PNG)</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg-2" title={kitap.name}>
              {kitap.name}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" ikon aria-label="Önceki sayfa" disabled={sayfa <= 1} onClick={() => git(sayfa - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="min-w-[5.5rem] text-center text-xs font-semibold tabular-nums text-fg">
                Sayfa {sayfa} / {kitap.pageCount}
              </span>
              <Button variant="secondary" size="sm" ikon aria-label="Sonraki sayfa" disabled={sayfa >= kitap.pageCount} onClick={() => git(sayfa + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => dosyaRef.current?.click()}>
              Başka dosya
            </Button>
          </div>

          <div className="max-h-[62vh] overflow-auto rounded-xl border border-line bg-surface-2">
            {resim ? (
              <div
                ref={alanRef}
                className="relative mx-auto w-full max-w-3xl cursor-crosshair select-none touch-none overflow-hidden bg-white"
                onPointerDown={basla}
                onPointerMove={surukle}
                onPointerUp={birak}
                onPointerCancel={birak}
                role="application"
                aria-label={`Sayfa ${sayfa}: soruyu çerçevelemek için sürükleyin`}
              >
                <img src={resim} alt="" draggable={false} className="block w-full" />
                {kutu && (
                  <div
                    className={cx('pointer-events-none absolute rounded-sm border-2', kutuHazir ? 'border-brand' : 'border-dashed border-brand')}
                    style={{ left: `${kutu.x * 100}%`, top: `${kutu.y * 100}%`, width: `${kutu.w * 100}%`, height: `${kutu.h * 100}%`, boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.35)' }}
                  />
                )}
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center text-xs text-muted">{durum || ''}</div>
            )}
          </div>
        </div>
      )}

      {hata && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          {hata}
        </p>
      )}
    </Modal>
  );
};
