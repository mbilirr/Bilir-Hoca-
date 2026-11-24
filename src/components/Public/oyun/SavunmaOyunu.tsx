import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Castle, Check, Ghost, Heart, X, Zap } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type OyunEkrani, type OyunOzet, type QuizSoru, yalnizHarf } from './istek';

// Aşama 399: SAVUNMA — kaleye bir düşman yürür; düşmanın kaleye varması soru süresidir. Süresinde doğru cevap
// düşmanı durdurur (Soru yarışı puanı). Yanlış ya da süre dolması bir can götürür; 3 can biterse oyun biter.
// Bütün sorular bitince kalan her can 50 puan. Doğru cevap, süre ve puan sunucuda; tarayıcıdaki yürüyüş yalnız görüntü.
interface Sonuc {
  dogru: boolean;
  dogruSik: number;
  aciklama: string;
  kazanilan: number;
  can: number;
  bonus: number;
}
const HARF = ['A', 'B', 'C', 'D'];
/** kale vurulunca kısa sarsıntı (hareket azaltılmışsa yok); yalnız bu oyunun kullandığı sınıf, ortak CSS'e eklenmez */
const SARSIL_CSS =
  '@keyframes oyn-sarsil{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}' +
  '.oyn-sarsil{animation:oyn-sarsil .45s ease-in-out}@media (prefers-reduced-motion:reduce){.oyn-sarsil{animation:none}}';

/** Düşmanın yolu: kale solda 4.25rem yer kaplar; düşman (merkezi) kale kapısından sahnenin sağ ucuna kadar yürür.
 *  oran 1 = yolun başı, 0 = kale kapısı (rem ile: telefonda da kaleye binmez) */
const yolda = (oran: number) => `calc(5.75rem + (100% - 8.5rem) * ${Math.max(0, Math.min(1, oran)).toFixed(4)})`;

const Sahne: React.FC<{ oran: number; sonuc: Sonuc | null; secim: number | null; kalanSn: number; kalanDusman: number }> = ({ oran, sonuc, secim, kalanSn, kalanDusman }) => {
  const vurdu = !!sonuc && !sonuc.dogru; // düşman kaleye ulaştı
  const durdu = !!sonuc && sonuc.dogru;
  const az = oran < 0.25 && !sonuc;
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-line bg-surface-2" aria-hidden>
      <style>{SARSIL_CSS}</style>
      {/* yol */}
      <div className="absolute inset-x-0 bottom-2 h-px border-t border-dashed border-line-strong" />
      {/* bekleyen düşmanlar */}
      <div className="absolute right-3 top-2.5 flex items-center gap-1 text-3xs font-semibold text-subtle">
        {Array.from({ length: Math.min(kalanDusman, 6) }, (_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        ))}
        {kalanDusman > 6 && <span>+{kalanDusman - 6}</span>}
      </div>
      {/* süre */}
      {!sonuc && <span className={cx('absolute left-3 top-2 text-xs font-bold tabular-nums', az ? 'text-danger-fg' : 'text-muted')}>{kalanSn}</span>}
      {/* kale */}
      <div className={cx('absolute bottom-3 left-3 flex h-14 w-14 items-center justify-center rounded-xl border-2 bg-surface transition-colors', vurdu ? 'oyn-sarsil border-danger text-danger-fg' : durdu ? 'border-success text-success-fg' : 'border-brand text-brand-fg')}>
        <Castle className="w-7 h-7" />
      </div>
      {/* düşman */}
      <div
        className={cx(
          'absolute bottom-3 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border transition-[left,transform,opacity] ease-linear motion-reduce:transition-none',
          durdu ? 'scale-125 border-success bg-success-soft text-success-fg opacity-0 duration-700' : vurdu ? 'border-danger bg-danger-soft text-danger-fg duration-300' : 'border-danger/40 bg-danger-soft text-danger-fg duration-100'
        )}
        style={{ left: yolda(vurdu ? 0 : oran) }}
      >
        <Ghost className="w-6 h-6" />
      </div>
      {durdu && (
        <span className="absolute bottom-6 flex -translate-x-1/2 items-center gap-0.5 text-sm font-bold text-success-fg" style={{ left: yolda(oran) }}>
          <Zap className="w-4 h-4" />+{sonuc!.kazanilan}
        </span>
      )}
      {vurdu && (
        <span className="absolute left-20 top-2.5 text-xs font-bold text-danger-fg">{secim === null ? 'Süre doldu, kale vuruldu!' : 'Kale vuruldu!'}</span>
      )}
    </div>
  );
};

export const SavunmaOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { soru: QuizSoru; puan: number; can: number; canEnCok: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [soru, setSoru] = useState<QuizSoru>(ilk.soru);
  const [puan, setPuan] = useState(ilk.puan);
  const [can, setCan] = useState(ilk.can);
  const canEnCok = ilk.canEnCok || 3;
  const [secim, setSecim] = useState<number | null>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [bitenOzet, setBitenOzet] = useState<OyunOzet | null>(null);
  const [kalan, setKalan] = useState(ilk.soru.kalanMs);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const bitis = useRef(performance.now() + ilk.soru.kalanMs);
  const gonderildi = useRef(false);
  const sonOran = useRef(1);

  const kur = (s: QuizSoru, c?: number) => {
    setSoru(s);
    setSecim(null);
    setSonuc(null);
    setKalan(s.kalanMs);
    setHata(null);
    if (typeof c === 'number') setCan(c);
    gonderildi.current = false;
    bitis.current = performance.now() + s.kalanMs;
  };

  const durumaDon = async () => {
    const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
    if (g.tur === 'savunma') kur(g.soru, g.can);
    else if (g.tur === 'bitti') onBitti(g.sonuc);
  };

  const cevapla = useCallback(
    async (s: number | null) => {
      if (gonderildi.current) return;
      gonderildi.current = true;
      sonOran.current = Math.max(0, Math.min(1, (bitis.current - performance.now()) / (soru.sureSn * 1000)));
      setSecim(s);
      setMesgul(true);
      setHata(null);
      try {
        const r = await oyunCagri<{ sonuc: Sonuc; puan: number; can: number; bitti: boolean; ozet?: OyunOzet }>(token, 'cevap', { studentId, no: soru.no, secim: s });
        setSonuc(r.sonuc);
        setPuan(r.puan);
        setCan(r.can);
        if (r.bitti && r.ozet) setBitenOzet(r.ozet);
      } catch (e) {
        if (e instanceof OyunHatasi && e.kod !== 'ag') {
          try {
            await durumaDon();
            return;
          } catch {
            /* aşağıda hata gösterilir */
          }
        }
        gonderildi.current = false;
        setSecim(null);
        setHata(e instanceof Error ? e.message : 'Cevap gönderilemedi.');
      } finally {
        setMesgul(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, studentId, soru.no, soru.sureSn, onBitti]
  );

  // düşmanın yürüyüşü = geri sayım (yalnız görünüm); süre dolunca boş cevap gönderilir
  useEffect(() => {
    if (sonuc) return;
    const id = window.setInterval(() => {
      const k = Math.max(0, bitis.current - performance.now());
      setKalan(k);
      if (k <= 0 && !gonderildi.current) void cevapla(null);
    }, 100);
    return () => window.clearInterval(id);
  }, [sonuc, cevapla]);

  const sonraki = async () => {
    if (bitenOzet) return onBitti(bitenOzet);
    setMesgul(true);
    setHata(null);
    try {
      await durumaDon();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Soru getirilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const harfli = !!soru.gorsel && yalnizHarf(soru.siklar);
  const oran = sonuc || gonderildi.current ? sonOran.current : Math.max(0, Math.min(1, kalan / (soru.sureSn * 1000)));
  const kalanDusman = Math.max(0, soru.toplam - soru.no);

  return (
    <div className="space-y-4" id="oyun-savunma">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          Düşman {soru.no} / {soru.toplam}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-0.5" role="img" aria-label={`${can} can kaldı`}>
            {Array.from({ length: canEnCok }, (_, i) => (
              <Heart key={i} className={cx('w-4 h-4', i < can ? 'fill-current text-danger' : 'text-line-strong')} aria-hidden />
            ))}
          </span>
          <span className="tabular-nums text-fg">{puan} puan</span>
        </span>
      </div>

      <div className="ui-card space-y-4 p-5">
        <Sahne oran={oran} sonuc={sonuc} secim={secim} kalanSn={Math.ceil(kalan / 1000)} kalanDusman={kalanDusman} />
        {soru.gorsel ? (
          <figure className="overflow-hidden rounded-xl border border-line bg-white">
            <img src={soru.gorsel} alt={soru.metin} className="mx-auto block max-h-[50vh] w-auto max-w-full object-contain" />
          </figure>
        ) : (
          <p className="text-base font-semibold leading-snug text-fg">{soru.metin}</p>
        )}

        <ul className={cx('grid gap-2.5', harfli ? 'grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
          {soru.siklar.map((s, i) => {
            const dogru = !!sonuc && i === sonuc.dogruSik;
            const yanlis = !!sonuc && secim === i && !sonuc.dogru;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={mesgul || !!sonuc}
                  onClick={() => void cevapla(i)}
                  className={cx(
                    'flex h-full w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors disabled:cursor-default',
                    harfli && 'justify-center',
                    dogru ? 'border-success bg-success-soft text-success-fg font-semibold' : yanlis ? 'border-danger bg-danger-soft text-danger-fg font-semibold' : 'border-line bg-surface text-fg hover:bg-surface-2',
                    !sonuc && secim === i && 'border-brand'
                  )}
                >
                  <span className={cx('flex shrink-0 items-center justify-center rounded-lg font-bold', harfli ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-2xs', dogru || yanlis ? 'bg-surface text-current' : 'bg-surface-2 text-fg-2')}>
                    {dogru ? <Check className="w-3.5 h-3.5" aria-hidden /> : yanlis ? <X className="w-3.5 h-3.5" aria-hidden /> : HARF[i]}
                  </span>
                  {!harfli && <span className="min-w-0 flex-1 break-words">{s}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {sonuc && (
          <div role="status" className={cx('rounded-xl px-3.5 py-3 text-sm', sonuc.dogru ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>
            <p className="font-semibold">
              {sonuc.dogru ? `Düşman durdu! +${sonuc.kazanilan} puan` : sonuc.can > 0 ? `Bir can gitti, ${sonuc.can} can kaldı.` : 'Canların bitti, kale düştü.'}
              {sonuc.bonus > 0 && ` Kalan canların +${sonuc.bonus} puan getirdi.`}
            </p>
            {sonuc.aciklama && <p className="mt-1 text-xs leading-relaxed">{sonuc.aciklama}</p>}
          </div>
        )}
        {hata && (
          <p role="alert" className="text-xs text-danger-fg">
            {hata}
          </p>
        )}
      </div>

      {sonuc && (
        <div className="flex justify-end">
          <Button genislik="uzun" onClick={() => void sonraki()} isLoading={mesgul}>
            {bitenOzet ? 'Sonucu gör' : 'Sıradaki düşman'}
          </Button>
        </div>
      )}
    </div>
  );
};
