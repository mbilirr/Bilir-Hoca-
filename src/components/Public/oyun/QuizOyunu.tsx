import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type OyunEkrani, type OyunOzet, type QuizSoru } from './istek';

// Aşama 381: SORU YARIŞI — tek soru, 4 şık, geri sayım. Doğru cevap yalnız cevap verildikten sonra gelir;
// süre ve puan sunucuda hesaplanır (tarayıcıdaki sayaç yalnız görüntüdür).
interface Sonuc {
  dogru: boolean;
  dogruSik: number;
  aciklama: string;
  kazanilan: number;
}
const HARF = ['A', 'B', 'C', 'D'];

export const QuizOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { soru: QuizSoru; puan: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [soru, setSoru] = useState<QuizSoru>(ilk.soru);
  const [puan, setPuan] = useState(ilk.puan);
  const [secim, setSecim] = useState<number | null>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [bitenOzet, setBitenOzet] = useState<OyunOzet | null>(null);
  const [kalan, setKalan] = useState(ilk.soru.kalanMs);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const bitis = useRef(performance.now() + ilk.soru.kalanMs);
  const gonderildi = useRef(false);

  const kur = (s: QuizSoru) => {
    setSoru(s);
    setSecim(null);
    setSonuc(null);
    setKalan(s.kalanMs);
    setHata(null);
    gonderildi.current = false;
    bitis.current = performance.now() + s.kalanMs;
  };

  const cevapla = useCallback(
    async (s: number | null) => {
      if (gonderildi.current) return;
      gonderildi.current = true;
      setSecim(s);
      setMesgul(true);
      setHata(null);
      try {
        const r = await oyunCagri<{ sonuc: Sonuc; puan: number; bitti: boolean; ozet?: OyunOzet }>(token, 'cevap', { studentId, no: soru.no, secim: s });
        setSonuc(r.sonuc);
        setPuan(r.puan);
        if (r.bitti && r.ozet) setBitenOzet(r.ozet);
      } catch (e) {
        // sıra karıştıysa (başka sekme / yenileme) sunucudaki duruma dönülür
        if (e instanceof OyunHatasi && e.kod !== 'ag') {
          try {
            const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
            if (g.tur === 'quiz') kur(g.soru);
            else if (g.tur === 'bitti') onBitti(g.sonuc);
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
    [token, studentId, soru.no, onBitti]
  );

  // geri sayım (yalnız görünüm); süre dolunca boş cevap gönderilir
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
      const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
      if (g.tur === 'quiz') kur(g.soru);
      else if (g.tur === 'bitti') onBitti(g.sonuc);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Soru getirilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const oran = Math.max(0, Math.min(1, kalan / (soru.sureSn * 1000)));
  const az = oran < 0.25;

  return (
    <div className="space-y-4" id="oyun-quiz">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          Soru {soru.no} / {soru.toplam}
        </span>
        <span className="tabular-nums text-fg">{puan} puan</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Soru ilerlemesi" aria-valuemin={0} aria-valuemax={soru.toplam} aria-valuenow={soru.no - 1}>
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${((soru.no - (sonuc ? 0 : 1)) / soru.toplam) * 100}%` }} />
      </div>

      <div className="ui-card p-5 space-y-4">
        <div className="flex items-center gap-2" aria-live="off">
          <Clock className={cx('w-4 h-4 shrink-0', az && !sonuc ? 'text-danger-fg' : 'text-muted')} aria-hidden />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className={cx('h-full rounded-full', az && !sonuc ? 'bg-danger' : 'bg-brand')} style={{ width: `${(sonuc ? 0 : oran) * 100}%` }} />
          </div>
          <span className={cx('w-8 text-right text-xs font-semibold tabular-nums', az && !sonuc ? 'text-danger-fg' : 'text-muted')}>{sonuc ? '' : Math.ceil(kalan / 1000)}</span>
        </div>
        <p className="text-base font-semibold leading-snug text-fg">{soru.metin}</p>

        <ul className="grid grid-cols-1 gap-2.5">
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
                    'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors disabled:cursor-default',
                    dogru ? 'border-success bg-success-soft text-success-fg font-semibold' : yanlis ? 'border-danger bg-danger-soft text-danger-fg font-semibold' : 'border-line bg-surface text-fg hover:bg-surface-2',
                    !sonuc && secim === i && 'border-brand'
                  )}
                >
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-2xs font-bold', dogru || yanlis ? 'bg-surface text-current' : 'bg-surface-2 text-fg-2')}>
                    {dogru ? <Check className="w-3.5 h-3.5" aria-hidden /> : yanlis ? <X className="w-3.5 h-3.5" aria-hidden /> : HARF[i]}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{s}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {sonuc && (
          <div role="status" className={cx('rounded-xl px-3.5 py-3 text-sm', sonuc.dogru ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg')}>
            <p className="font-semibold">{sonuc.dogru ? `Doğru! +${sonuc.kazanilan} puan` : secim === null ? 'Süre doldu.' : 'Yanlış.'}</p>
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
            {bitenOzet ? 'Sonucu gör' : 'Sıradaki soru'}
          </Button>
        </div>
      )}
    </div>
  );
};
