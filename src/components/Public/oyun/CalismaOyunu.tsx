import React, { useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type CalismaSoru, type OyunEkrani, type OyunOzet, yalnizHarf } from './istek';

// Aşama 396: ÇALIŞMA MODU — öğrencinin kendi başına oynadığı süresiz tur. Cevaptan sonra doğru şık ve açıklama
// gösterilir; yanlış soru turun sonunda bir kez daha sorulur. Doğru cevap yalnız cevap verildikten sonra sunucudan gelir.
interface Sonuc {
  dogru: boolean;
  dogruSik: number;
  aciklama: string;
  tekrarlanacak: boolean;
}
const HARF = ['A', 'B', 'C', 'D'];

export const CalismaOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { soru: CalismaSoru; dogru: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [soru, setSoru] = useState<CalismaSoru>(ilk.soru);
  const [dogruSayi, setDogruSayi] = useState(ilk.dogru);
  const [secim, setSecim] = useState<number | null>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [bitenOzet, setBitenOzet] = useState<OyunOzet | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kur = (s: CalismaSoru) => {
    setSoru(s);
    setSecim(null);
    setSonuc(null);
    setHata(null);
  };
  const sunucudakineDon = async () => {
    const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
    if (g.tur === 'calisma') {
      kur(g.soru);
      setDogruSayi(g.dogru);
    } else if (g.tur === 'bitti') onBitti(g.sonuc);
  };

  const cevapla = async (s: number | null) => {
    if (mesgul || sonuc) return;
    setSecim(s);
    setMesgul(true);
    setHata(null);
    try {
      const r = await oyunCagri<{ sonuc: Sonuc; dogru: number; bitti: boolean; ozet?: OyunOzet }>(token, 'cevap', { studentId, no: soru.no, secim: s });
      setSonuc(r.sonuc);
      setDogruSayi(r.dogru);
      if (r.bitti && r.ozet) setBitenOzet(r.ozet);
    } catch (e) {
      setSecim(null);
      if (e instanceof OyunHatasi && e.kod !== 'ag') {
        try {
          await sunucudakineDon();
          return;
        } catch {
          /* aşağıda hata gösterilir */
        }
      }
      setHata(e instanceof Error ? e.message : 'Cevap gönderilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const sonraki = async () => {
    if (bitenOzet) return onBitti(bitenOzet);
    setMesgul(true);
    setHata(null);
    try {
      await sunucudakineDon();
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Soru getirilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  const harfli = !!soru.gorsel && yalnizHarf(soru.siklar);
  const dogruMetin = sonuc ? (harfli ? HARF[sonuc.dogruSik] : `${HARF[sonuc.dogruSik]}) ${soru.siklar[sonuc.dogruSik]}`) : '';

  return (
    <div className="space-y-4" id="oyun-calisma">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span className="flex items-center gap-2">
          Soru {soru.no} / {soru.toplam}
          {soru.tekrar && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning-fg">
              <RotateCcw className="w-3 h-3" aria-hidden />
              Tekrar
            </span>
          )}
        </span>
        <span className="tabular-nums text-fg">{dogruSayi} doğru</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Soru ilerlemesi" aria-valuemin={0} aria-valuemax={soru.toplam} aria-valuenow={soru.no - 1}>
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${((soru.no - (sonuc ? 0 : 1)) / soru.toplam) * 100}%` }} />
      </div>

      <div className="ui-card p-5 space-y-4">
        {soru.gorsel ? (
          <figure className="overflow-hidden rounded-xl border border-line bg-white">
            <img src={soru.gorsel} alt={soru.metin} className="mx-auto block max-h-[60vh] w-auto max-w-full object-contain" />
          </figure>
        ) : (
          <p className="text-base font-semibold leading-snug text-fg">{soru.metin}</p>
        )}

        <ul className={cx('grid gap-2.5', harfli ? 'grid-cols-4' : 'grid-cols-1')}>
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

        {sonuc ? (
          <div role="status" className={cx('rounded-xl px-3.5 py-3 text-sm', sonuc.dogru ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-fg')}>
            <p className={cx('font-semibold', !sonuc.dogru && 'text-warning-fg')}>{sonuc.dogru ? 'Doğru!' : `Doğrusu: ${dogruMetin}`}</p>
            {sonuc.aciklama && <p className="mt-1 text-xs leading-relaxed">{sonuc.aciklama}</p>}
            {sonuc.tekrarlanacak && <p className="mt-1.5 text-2xs font-semibold text-muted">Bu soru turun sonunda bir kez daha sorulacak.</p>}
          </div>
        ) : (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => void cevapla(null)} disabled={mesgul}>
              Bilmiyorum, doğrusunu göster
            </Button>
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
