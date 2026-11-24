import React, { useEffect, useRef, useState } from 'react';
import { Brain, Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type HafizaKart, type HafizaTahta, type OyunEkrani, type OyunOzet } from './istek';

// Aşama 398: HAFIZA — kelime sorularından eşleştirme. Her kelimenin iki kartı var: ipucu ve kelime. Öğrenci iki kart
// açar; eşleşirse kartlar açık kalır (100 puan, o çiftte yapılan her yanlış 20 düşer). Kartın yazısı yalnız açılınca
// sunucudan gelir; eşleşme sunucuda denetlenir.
interface Olay {
  tur: 'ilk' | 'eslesti' | 'yanlis' | 'bitti';
  kart?: HafizaKart;
  kartlar?: HafizaKart[];
  kazanilan?: number;
}
interface Yanit {
  olay: Olay;
  puan: number;
  hafiza: HafizaTahta;
  bitti: boolean;
  ozet?: OyunOzet;
}
const YANLIS_MS = 1100;
/** uzun kelime kartı taşmasın, bölünmesin (15 harfe kadar) */
const kelimeBoy = (k: string) => {
  const n = Array.from(k).length;
  return n > 11 ? 'text-3xs sm:text-2xs' : n > 8 ? 'text-2xs sm:text-xs' : 'text-sm tracking-wider';
};

export const HafizaOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { hafiza: HafizaTahta; puan: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [tahta, setTahta] = useState<HafizaTahta>(ilk.hafiza);
  const [puan, setPuan] = useState(ilk.puan);
  const [bekleyen, setBekleyen] = useState<number | null>(null); // sunucudan yanıt beklenen kart
  const [yanlis, setYanlis] = useState<HafizaKart[] | null>(null); // kısa süre açık kalan yanlış çift
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'kotu'; yazi: string } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bitirSor, setBitirSor] = useState(false);
  const [sonOzet, setSonOzet] = useState<OyunOzet | null>(null);
  const zamanlayici = useRef<number | null>(null);
  useEffect(() => () => void (zamanlayici.current && window.clearTimeout(zamanlayici.current)), []);

  const yanlisKapat = () => {
    if (zamanlayici.current) window.clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
    setYanlis(null);
  };

  const cagir = async (op: 'ac' | 'bitir', k?: number) => {
    setHata(null);
    setBekleyen(op === 'ac' ? (k ?? null) : -1);
    try {
      const r = await oyunCagri<Yanit>(token, op, { studentId, ...(op === 'ac' ? { k } : {}) });
      setTahta(r.hafiza);
      setPuan(r.puan);
      if (r.olay.tur === 'eslesti') setMesaj({ ton: 'ok', yazi: `Eşleşti! +${r.olay.kazanilan} puan` });
      else if (r.olay.tur === 'yanlis' && r.olay.kartlar) {
        setMesaj({ ton: 'kotu', yazi: 'Eşleşmedi. Kartların yerini aklında tut.' });
        setYanlis(r.olay.kartlar);
        zamanlayici.current = window.setTimeout(yanlisKapat, YANLIS_MS);
      } else if (r.olay.tur === 'ilk') setMesaj(null);
      if (r.bitti && r.ozet) setSonOzet(r.ozet);
    } catch (e) {
      // sıra karıştıysa (başka sekme / yenileme) sunucudaki duruma dönülür
      if (e instanceof OyunHatasi && e.kod !== 'ag') {
        try {
          const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
          if (g.tur === 'hafiza') setTahta(g.hafiza);
          else if (g.tur === 'bitti') return onBitti(g.sonuc);
        } catch {
          /* hata aşağıda */
        }
      }
      setHata(e instanceof Error ? e.message : 'İşlem yapılamadı.');
    } finally {
      setBekleyen(null);
    }
  };

  const tikla = (k: HafizaKart) => {
    if (bekleyen !== null || sonOzet || k.durum !== 'kapali') return;
    if (yanlis) yanlisKapat(); // yanlış çift açıkken yeni karta dokunmak onları hemen kapatır
    setBitirSor(false);
    void cagir('ac', k.k);
  };

  const yanlisMap = new Map((yanlis || []).map((x) => [x.k, x]));
  // kartta kısalan uzun ipucu: açık (eşleşmemiş) kartların tam yazısı tahtanın altında okunur
  const acikKartlar = yanlis || tahta.kartlar.filter((x) => x.durum === 'acik');
  const uzunAcik = acikKartlar.filter((x) => x.tur === 'ipucu' && (x.metin || '').length > 60);
  const sutun = tahta.kartlar.length <= 6 ? 'grid-cols-3' : tahta.kartlar.length <= 12 ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-4';

  return (
    <div className="space-y-4" id="oyun-hafiza">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span className="tabular-nums">
          Eşleşen {tahta.eslesen} / {tahta.cift} · {tahta.hamle} hamle
        </span>
        <span className="tabular-nums text-fg">{puan} puan</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Eşleşen çiftler" aria-valuemin={0} aria-valuemax={tahta.cift} aria-valuenow={tahta.eslesen}>
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(tahta.eslesen / Math.max(tahta.cift, 1)) * 100}%` }} />
      </div>

      <div className="ui-card space-y-4 p-4 sm:p-5">
        <ul className={cx('grid gap-2 sm:gap-2.5', sutun)} aria-label="Kartlar">
          {tahta.kartlar.map((kart) => {
            const gecici = yanlisMap.get(kart.k);
            const yuz = gecici || (kart.durum !== 'kapali' ? kart : null);
            const acik = !!yuz || bekleyen === kart.k;
            const ton = gecici ? 'yanlis' : kart.durum === 'eslesti' ? 'eslesti' : 'acik';
            return (
              <li key={kart.k} className="[perspective:800px]">
                <button
                  type="button"
                  onClick={() => tikla(kart)}
                  disabled={kart.durum !== 'kapali' || !!sonOzet}
                  aria-label={yuz ? `${yuz.tur === 'kelime' ? 'Kelime' : 'İpucu'}: ${yuz.metin}` : `Kart ${kart.k + 1}, kapalı`}
                  className="relative block h-24 w-full rounded-xl text-left transition-transform duration-300 [transform-style:preserve-3d] focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default motion-reduce:transition-none sm:h-28"
                  style={{ transform: acik ? 'rotateY(180deg)' : 'none' }}
                >
                  {/* arka yüz (kapalı) */}
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl border border-line bg-brand-soft text-brand-fg [backface-visibility:hidden] hover:border-brand">
                    <Brain className="w-6 h-6 opacity-60" aria-hidden />
                  </span>
                  {/* ön yüz (yazı) */}
                  <span
                    className={cx(
                      'absolute inset-0 flex flex-col justify-center gap-1 overflow-hidden rounded-xl border px-2 py-1.5 [backface-visibility:hidden] [transform:rotateY(180deg)]',
                      !yuz ? 'border-line bg-surface' : ton === 'eslesti' ? 'border-success bg-success-soft' : ton === 'yanlis' ? 'border-danger bg-danger-soft' : 'border-brand bg-surface'
                    )}
                  >
                    {yuz && (
                      <>
                        <span className={cx('flex items-center gap-1 text-3xs font-bold uppercase tracking-wider', ton === 'eslesti' ? 'text-success-fg' : ton === 'yanlis' ? 'text-danger-fg' : 'text-subtle')}>
                          {ton === 'eslesti' && <Check className="w-3 h-3" aria-hidden />}
                          {yuz.tur === 'kelime' ? 'Kelime' : 'İpucu'}
                        </span>
                        {yuz.tur === 'kelime' ? (
                          <b className={cx('block break-all font-bold text-fg', kelimeBoy(yuz.metin || ''))}>{yuz.metin}</b>
                        ) : (
                          <span className="line-clamp-4 text-2xs leading-snug text-fg sm:text-xs" title={yuz.metin}>
                            {yuz.metin}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {uzunAcik.length > 0 && (
          <div className="space-y-1.5" id="hafiza-acik-yazi">
            {uzunAcik.map((x) => (
              <p key={x.k} className={cx('rounded-xl px-3 py-2 text-xs leading-relaxed', yanlis ? 'bg-danger-soft text-danger-fg' : 'bg-brand-soft text-fg')}>
                <b className="mr-1 font-semibold">İpucu:</b>
                {x.metin}
              </p>
            ))}
          </div>
        )}
        <div className="min-h-5" aria-live="polite">
          {sonOzet ? (
            <p className="text-sm font-semibold text-success-fg">Bütün çiftleri buldun!</p>
          ) : mesaj ? (
            <p className={cx('text-sm font-semibold', mesaj.ton === 'ok' ? 'text-success-fg' : 'text-danger-fg')}>{mesaj.yazi}</p>
          ) : (
            <p className="text-xs text-muted">Bir ipucu kartıyla onun kelimesini eşleştir. Az hamlede bitirirsen puanın yüksek olur.</p>
          )}
          {hata && (
            <p role="alert" className="mt-1 text-xs text-danger-fg">
              {hata}
            </p>
          )}
        </div>
      </div>

      {sonOzet ? (
        <div className="flex justify-end">
          <Button genislik="uzun" onClick={() => onBitti(sonOzet)}>
            Sonucu gör
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          {bitirSor ? (
            <>
              <p className="text-center text-xs text-muted">Bulunmamış çiftler bilinmemiş sayılır ve oyun biter.</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setBitirSor(false)}>
                  Vazgeç
                </Button>
                <Button variant="danger-soft" onClick={() => void cagir('bitir')} disabled={bekleyen !== null}>
                  Evet, bitir
                </Button>
              </div>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setBitirSor(true)} disabled={bekleyen !== null}>
              Oyunu bitir
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
