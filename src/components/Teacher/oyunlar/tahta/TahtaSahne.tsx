// ============================================================================
// Aşama 383: TAHTADA OYNA — tam ekran sahne (akıllı tahta / projeksiyon için büyük yazı ve düğmeler)
// Düello: iki takımın kendi şık düğmeleri yan yana. Grup: sıradaki grup ortak şıklardan seçer.
// Kurallar ./kurallar.ts'te; burada yalnız görünüm ve süre sayacı var. Kayıt tutulmaz.
// ============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Maximize2, Minimize2, Presentation, RotateCcw, Settings2, Trophy, X } from 'lucide-react';
import { Modal, cx } from '../../../ui/kit';
import { Button } from '../../../ui/Button';
import type { OyunSoru } from '../../../../services/oyunService';
import { siralama, tahtaCevap, tahtaKapat, tahtaKur, tahtaSonraki, type TahtaDurum, type TahtaMod } from './kurallar';

const HARF = ['A', 'B', 'C', 'D'];
const TON = [
  { chip: 'bg-brand-soft text-brand-fg', kenar: 'border-brand' },
  { chip: 'bg-warning-soft text-warning-fg', kenar: 'border-warning' },
  { chip: 'bg-info-soft text-info-fg', kenar: 'border-info' },
  { chip: 'bg-success-soft text-success-fg', kenar: 'border-success' },
  { chip: 'bg-danger-soft text-danger-fg', kenar: 'border-danger' },
  { chip: 'bg-surface-2 text-fg-2', kenar: 'border-line-strong' },
];

const Sik: React.FC<{ harf: string; metin: string; durum: 'bos' | 'dogru' | 'yanlis' | 'soluk'; disabled: boolean; onClick: () => void; buyuk?: boolean }> = ({ harf, metin, durum, disabled, onClick, buyuk }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cx(
      'flex w-full items-center gap-3 rounded-2xl border-2 px-4 text-left font-semibold transition-colors disabled:cursor-default',
      buyuk ? 'py-5 text-xl sm:text-2xl' : 'py-3.5 text-lg sm:text-xl',
      durum === 'dogru' ? 'border-success bg-success-soft text-success-fg' : durum === 'yanlis' ? 'border-danger bg-danger-soft text-danger-fg' : durum === 'soluk' ? 'border-line bg-surface text-subtle' : 'border-line bg-surface text-fg hover:bg-surface-2'
    )}
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-base font-bold text-fg-2">
      {durum === 'dogru' ? <Check className="w-5 h-5 text-success-fg" aria-hidden /> : durum === 'yanlis' ? <X className="w-5 h-5 text-danger-fg" aria-hidden /> : harf}
    </span>
    <span className="min-w-0 flex-1 break-words">{metin}</span>
  </button>
);

export const TahtaSahne: React.FC<{
  mod: TahtaMod;
  takimAdlari: string[];
  sorular: OyunSoru[];
  sureSn: number;
  onClose: () => void;
  onKur: () => void;
}> = ({ mod, takimAdlari, sorular, sureSn, onClose, onKur }) => {
  const kur = useCallback(() => tahtaKur(mod, takimAdlari, sorular.map((s) => ({ id: s.id, metin: s.metin, siklar: s.siklar, dogru: s.dogru, aciklama: s.aciklama }))), [mod, takimAdlari, sorular]);
  const [d, setD] = useState<TahtaDurum>(kur);
  const sureMs = sureSn * 1000;
  const [kalan, setKalan] = useState(sureMs);
  const basla = useRef(performance.now());
  const [tamEkran, setTamEkran] = useState(false);

  // her yeni soruda sayaç baştan; süre dolunca soru kapanır
  useEffect(() => {
    if (d.asama !== 'soru') return;
    basla.current = performance.now();
    setKalan(sureMs);
    const id = window.setInterval(() => {
      const k = Math.max(0, sureMs - (performance.now() - basla.current));
      setKalan(k);
      if (k <= 0) setD((x) => tahtaKapat(x));
    }, 100);
    return () => window.clearInterval(id);
  }, [d.i, d.asama, sureMs]);

  useEffect(() => {
    const dinle = () => setTamEkran(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', dinle);
    return () => {
      document.removeEventListener('fullscreenchange', dinle);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const tamEkranDegistir = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const cevapla = (takim: number, secim: number) => setD((x) => tahtaCevap(x, takim, secim, performance.now() - basla.current, sureMs));
  const soru = d.sorular[d.i];
  const oran = Math.max(0, Math.min(1, kalan / sureMs));
  const kazanan = d.cevaplar.find((c) => c.dogru);

  const skorlar = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {d.takimlar.map((t, k) => (
        <span key={k} className={cx('inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-sm font-semibold', TON[k % TON.length].chip, d.mod === 'grup' && d.asama === 'soru' && d.sira === k ? TON[k % TON.length].kenar : 'border-transparent')}>
          <span className="max-w-40 truncate">{t.ad}</span>
          <span className="tabular-nums">{t.puan}</span>
        </span>
      ))}
    </div>
  );

  const sikDurumu = (takim: number | null, i: number): 'bos' | 'dogru' | 'yanlis' | 'soluk' => {
    const kendi = takim === null ? d.cevaplar[0] : d.cevaplar.find((c) => c.takim === takim);
    if (d.asama === 'sonuc') {
      if (i === soru.dogru) return 'dogru';
      if (kendi && kendi.secim === i) return 'yanlis';
      return 'soluk';
    }
    if (kendi && kendi.secim === i) return 'yanlis';
    return kendi ? 'soluk' : 'bos';
  };

  let govde: React.ReactNode;
  if (d.asama === 'bitti') {
    const sira = siralama(d);
    const ilk = sira[0];
    const berabere = sira.length > 1 && sira[1].puan === ilk.puan && sira[1].dogru === ilk.dogru;
    govde = (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center" id="tahta-bitti">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success-soft text-success-fg">
          <Trophy className="w-8 h-8" aria-hidden />
        </span>
        <h2 className="text-3xl font-bold text-fg">{berabere ? 'Berabere!' : `${ilk.ad} kazandı!`}</h2>
        <ol className="w-full space-y-2">
          {sira.map((t, i) => (
            <li key={t.k} className={cx('flex items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left', i === 0 && !berabere ? 'border-success' : 'border-line')}>
              <span className="w-8 text-2xl font-bold tabular-nums text-muted">{i + 1}</span>
              <span className={cx('rounded-lg px-2 py-1 text-lg font-semibold', TON[t.k % TON.length].chip)}>{t.ad}</span>
              <span className="flex-1 text-sm text-muted">{t.dogru} doğru</span>
              <span className="text-2xl font-bold tabular-nums text-fg">{t.puan}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" leftIcon={<Settings2 className="w-3.5 h-3.5" />} onClick={onKur}>
            Ayarları değiştir
          </Button>
          <Button leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => setD(kur())}>
            Yeniden oyna
          </Button>
        </div>
      </div>
    );
  } else {
    govde = (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5" id="tahta-sahne">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-muted">
            Soru {d.i + 1} / {d.sorular.length}
          </span>
          <Clock className={cx('w-4 h-4 shrink-0', oran < 0.25 && d.asama === 'soru' ? 'text-danger-fg' : 'text-muted')} aria-hidden />
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className={cx('h-full rounded-full', oran < 0.25 ? 'bg-danger' : 'bg-brand')} style={{ width: `${(d.asama === 'soru' ? oran : 0) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-lg font-bold tabular-nums text-fg">{d.asama === 'soru' ? Math.ceil(kalan / 1000) : ''}</span>
        </div>

        <p className="text-center text-2xl font-bold leading-snug text-fg sm:text-3xl">{soru.metin}</p>

        {d.mod === 'duello' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {d.takimlar.map((t, k) => {
              const kilit = d.cevaplar.some((c) => c.takim === k);
              return (
                <section key={k} className={cx('space-y-3 rounded-2xl border-2 p-4', TON[k % TON.length].kenar)} aria-label={t.ad}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cx('rounded-lg px-2.5 py-1 text-base font-bold', TON[k % TON.length].chip)}>{t.ad}</span>
                    <span className="text-2xl font-bold tabular-nums text-fg">{t.puan}</span>
                  </div>
                  {soru.siklar.map((s, i) => (
                    <Sik key={i} harf={HARF[i]} metin={s} durum={sikDurumu(k, i)} disabled={d.asama !== 'soru' || kilit} onClick={() => cevapla(k, i)} />
                  ))}
                  {kilit && d.asama === 'soru' && <p className="text-center text-sm font-semibold text-danger-fg">Yanlış! Bu soruda bekle.</p>}
                </section>
              );
            })}
          </div>
        ) : (
          <>
            {skorlar}
            {d.asama === 'soru' && (
              <p className="text-center text-lg font-semibold text-fg">
                Sıra: <span className={cx('rounded-lg px-2 py-0.5', TON[d.sira % TON.length].chip)}>{d.takimlar[d.sira].ad}</span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {soru.siklar.map((s, i) => (
                <Sik key={i} buyuk harf={HARF[i]} metin={s} durum={sikDurumu(null, i)} disabled={d.asama !== 'soru'} onClick={() => cevapla(d.sira, i)} />
              ))}
            </div>
          </>
        )}

        {d.asama === 'sonuc' ? (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <p className={cx('text-xl font-bold', kazanan ? 'text-success-fg' : 'text-danger-fg')}>
              {kazanan ? `${d.takimlar[kazanan.takim].ad} bildi! +${kazanan.kazanilan}` : d.cevaplar.length ? 'Olmadı.' : 'Süre doldu.'}
            </p>
            {soru.aciklama && <p className="max-w-3xl text-base text-muted">{soru.aciklama}</p>}
            <Button size="lg" genislik="uzun" onClick={() => setD((x) => tahtaSonraki(x))}>
              {d.i + 1 >= d.sorular.length ? 'Sonuçlar' : 'Sıradaki soru'}
            </Button>
          </div>
        ) : (
          d.mod === 'grup' && (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={() => setD((x) => tahtaKapat(x))}>
                Pas geç
              </Button>
            </div>
          )
        )}
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      tamEkran
      closeOnBackdrop={false}
      icon={Presentation}
      title={d.mod === 'duello' ? 'Düello' : 'Grup yarışması'}
      baslikSag={
        <Button variant="ghost" size="sm" ikon aria-label={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} title={tamEkran ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={tamEkranDegistir}>
          {tamEkran ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      }
      govdeClass="px-4 py-5 sm:px-8"
    >
      {govde}
    </Modal>
  );
};
