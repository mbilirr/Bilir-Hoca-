import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { OyunHatasi, oyunCagri, type CarkTahta, type OyunEkrani, type OyunOzet } from './istek';

// Aşama 381: KELİME ÇARKI — ipucundan kelimeyi bul. Çark çevrilir, harf seçilir; kelimedeki her harf çarkın değeri kadar kazandırır.
// İFLAS dilimi o kelimede biriken puanı sıfırlar. 6 hak: yanlış harf 1, yanlış tahmin 2 hak götürür.
// Çarkı ve kelimeyi sunucu bilir; tarayıcıya yalnız açılmış harfler gelir.
const DILIMLER: Array<number | 'IFLAS'> = [100, 150, 200, 250, 300, 400, 500, 'IFLAS'];
const DILIM_ACI = 360 / DILIMLER.length;
const HARFLER = Array.from('ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ');
const SURE_MS = 2600;
const DOLGU = ['fill-brand-soft', 'fill-surface-2'];

interface Olay {
  tur: 'dilim' | 'iflas' | 'dogru' | 'yanlis' | 'yanlis-tahmin' | 'cozuldu' | 'kaybetti';
  dilim?: number | 'IFLAS';
  kaybedilen?: number;
  harf?: string;
  adet?: number;
  kazanilan?: number;
  cevap?: string;
  aciklama?: string;
}
interface Yanit {
  olay: Olay;
  puan: number;
  tahta: CarkTahta | null;
  bitti: boolean;
  ozet?: OyunOzet;
}

const nokta = (aci: number, r: number) => {
  const a = (aci * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)] as const;
};
const dilimYolu = (i: number) => {
  const [x1, y1] = nokta(i * DILIM_ACI, 100);
  const [x2, y2] = nokta((i + 1) * DILIM_ACI, 100);
  return `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A100 100 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
};

const Cark: React.FC<{ donus: number; donuyor: boolean }> = ({ donus, donuyor }) => (
  <div className="relative mx-auto w-48 sm:w-56" aria-hidden>
    <svg viewBox="-104 -104 208 208" className="block w-full">
      <g style={{ transform: `rotate(${donus}deg)`, transition: donuyor ? `transform ${SURE_MS}ms cubic-bezier(.15,.7,.1,1)` : 'none' }} className="motion-reduce:!transition-none">
        {DILIMLER.map((d, i) => (
          <g key={i}>
            <path d={dilimYolu(i)} className={cx(d === 'IFLAS' ? 'fill-danger-soft' : DOLGU[i % 2], 'stroke-line')} strokeWidth="1" />
            <text
              transform={`rotate(${i * DILIM_ACI + DILIM_ACI / 2}) translate(0 -66)`}
              textAnchor="middle"
              dominantBaseline="middle"
              className={cx('font-bold', d === 'IFLAS' ? 'fill-danger-fg' : 'fill-fg')}
              style={{ fontSize: d === 'IFLAS' ? 12 : 15 }}
            >
              {d === 'IFLAS' ? 'İFLAS' : d}
            </text>
          </g>
        ))}
        <circle r="14" className="fill-surface stroke-line" strokeWidth="1" />
      </g>
      <path d="M-8 -104 L8 -104 L0 -86 Z" className="fill-fg" />
    </svg>
  </div>
);

export const CarkOyunu: React.FC<{
  token: string;
  studentId: string;
  ilk: { tahta: CarkTahta; puan: number };
  onBitti: (o: OyunOzet) => void;
}> = ({ token, studentId, ilk, onBitti }) => {
  const [tahta, setTahta] = useState<CarkTahta>(ilk.tahta);
  const [puan, setPuan] = useState(ilk.puan);
  const [olay, setOlay] = useState<Olay | null>(null);
  const [donus, setDonus] = useState(0);
  const [donuyor, setDonuyor] = useState(false);
  const [bekle, setBekle] = useState(false); // çark çevirme isteği + dönüş bitene kadar her şey kilitli
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [cozAcik, setCozAcik] = useState(false);
  const [tahmin, setTahmin] = useState('');
  // kelime bitince bir sonraki tahta burada bekler: öğrenci sonucu okuyup "Sıradaki kelime"ye basar
  const [ara, setAra] = useState<{ olay: Olay; sonraki: CarkTahta | null; ozet?: OyunOzet } | null>(null);
  const zaman = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(zaman.current), []);

  const cagri = async <T,>(op: string, ek: Record<string, unknown> = {}): Promise<T | null> => {
    setMesgul(true);
    setHata(null);
    try {
      return await oyunCagri<T>(token, op, { studentId, ...ek });
    } catch (e) {
      if (e instanceof OyunHatasi && e.kod !== 'ag') {
        // sıra karıştıysa sunucudaki duruma dön
        try {
          const g = await oyunCagri<OyunEkrani>(token, 'durum', { studentId });
          if (g.tur === 'cark') setTahta(g.tahta);
          else if (g.tur === 'bitti') onBitti(g.sonuc);
        } catch {
          /* hata aşağıda */
        }
      }
      setHata(e instanceof Error ? e.message : 'İşlem yapılamadı.');
      return null;
    } finally {
      setMesgul(false);
    }
  };

  const cevir = async () => {
    setBekle(true);
    const r = await cagri<Yanit>('cevir');
    if (!r) return setBekle(false);
    const dilim = r.olay.dilim as number | 'IFLAS';
    const idx = Math.max(0, DILIMLER.indexOf(dilim));
    const hedef = -(idx * DILIM_ACI + DILIM_ACI / 2);
    const tur = Math.ceil(donus / 360) * 360 + 360 * 4;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setDonuyor(!reduce);
    setDonus(tur + hedef);
    setOlay(null);
    zaman.current = window.setTimeout(
      () => {
        setDonuyor(false);
        setBekle(false);
        setOlay(r.olay);
        setPuan(r.puan);
        if (r.tahta) setTahta(r.tahta);
      },
      reduce ? 0 : SURE_MS + 150
    );
  };

  const yanitIsle = (r: Yanit) => {
    setPuan(r.puan);
    if (r.olay.tur === 'cozuldu' || r.olay.tur === 'kaybetti') {
      setAra({ olay: r.olay, sonraki: r.tahta, ozet: r.ozet });
      setOlay(null);
    } else {
      setOlay(r.olay);
      if (r.tahta) setTahta(r.tahta);
    }
  };
  const harfSec = async (h: string) => {
    const r = await cagri<Yanit>('harf', { harf: h });
    if (r) yanitIsle(r);
  };
  const coz = async () => {
    const t = tahmin.trim();
    if (!t) return;
    const r = await cagri<Yanit>('coz', { tahmin: t });
    if (r) {
      setTahmin('');
      setCozAcik(false);
      yanitIsle(r);
    }
  };
  const devam = () => {
    if (!ara) return;
    if (ara.ozet || !ara.sonraki) return onBitti(ara.ozet as OyunOzet);
    setTahta(ara.sonraki);
    setAra(null);
    setOlay(null);
  };

  const harfAktif = tahta.asama === 'harf' && !mesgul && !bekle && !ara;
  const mesaj = ((): { ton: 'ok' | 'kotu' | 'bilgi'; yazi: string } | null => {
    if (!olay) return null;
    switch (olay.tur) {
      case 'iflas':
        return { ton: 'kotu', yazi: `İFLAS! Bu kelimede biriken ${olay.kaybedilen ?? 0} puan sıfırlandı.` };
      case 'dilim':
        return { ton: 'bilgi', yazi: `Çark ${olay.dilim} dedi. Şimdi bir harf seç: kelimede kaç tane varsa o kadar ${olay.dilim} kazanırsın.` };
      case 'dogru':
        return { ton: 'ok', yazi: `"${olay.harf}" kelimede ${olay.adet} kez var! +${olay.kazanilan} puan` };
      case 'yanlis':
        return { ton: 'kotu', yazi: `"${olay.harf}" kelimede yok. 1 hak gitti.` };
      case 'yanlis-tahmin':
        return { ton: 'kotu', yazi: 'Yanlış tahmin. 2 hak gitti.' };
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-4" id="oyun-cark">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          Kelime {tahta.no} / {tahta.toplam}
        </span>
        <span className="tabular-nums text-fg">{puan} puan</span>
      </div>

      <div className="ui-card space-y-4 p-5">
        <p className="flex items-start gap-2 text-sm leading-snug text-fg">
          <Lightbulb className="mt-0.5 w-4 h-4 shrink-0 text-warning-fg" aria-hidden />
          <span>{tahta.ipucu}</span>
        </p>

        <ul className="flex flex-wrap justify-center gap-1.5" aria-label={`Kelime, ${tahta.acik.length} harfli`}>
          {tahta.acik.map((h, i) => (
            <li key={i} className={cx('flex h-10 w-8 items-center justify-center rounded-lg border text-base font-bold sm:h-11 sm:w-9', h ? 'border-brand bg-brand-soft text-brand-fg' : 'border-line bg-surface-2 text-transparent')}>
              {h || '·'}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-center gap-1" role="img" aria-label={`${tahta.hak - tahta.hata} hakkın kaldı`}>
          {Array.from({ length: tahta.hak }, (_, i) => (
            <span key={i} className={cx('h-2 w-6 rounded-full', i < tahta.hak - tahta.hata ? 'bg-brand' : 'bg-surface-2')} />
          ))}
        </div>
      </div>

      {ara ? (
        <div className={cx('ui-card space-y-3 p-5 text-center', ara.olay.tur === 'cozuldu' ? 'border-success' : 'border-danger')} role="status">
          <p className={cx('text-sm font-semibold', ara.olay.tur === 'cozuldu' ? 'text-success-fg' : 'text-danger-fg')}>{ara.olay.tur === 'cozuldu' ? `Bildin! +${ara.olay.kazanilan} puan` : 'Haklarının hepsi bitti.'}</p>
          <p className="text-2xl font-bold tracking-widest text-fg">{ara.olay.cevap}</p>
          {ara.olay.aciklama && <p className="text-xs leading-relaxed text-muted">{ara.olay.aciklama}</p>}
          <Button genislik="uzun" onClick={devam}>
            {ara.ozet ? 'Sonucu gör' : 'Sıradaki kelime'}
          </Button>
        </div>
      ) : (
        <div className="ui-card space-y-4 p-5">
          <Cark donus={donus} donuyor={donuyor} />
          {mesaj && (
            <p role="status" className={cx('rounded-xl px-3.5 py-2.5 text-center text-sm', mesaj.ton === 'ok' ? 'bg-success-soft text-success-fg' : mesaj.ton === 'kotu' ? 'bg-danger-soft text-danger-fg' : 'bg-surface-2 text-fg-2')}>
              {mesaj.yazi}
            </p>
          )}
          {tahta.asama === 'cevir' ? (
            <div className="flex justify-center">
              <Button genislik="uzun" onClick={() => void cevir()} disabled={mesgul || bekle}>
                Çarkı çevir
              </Button>
            </div>
          ) : (
            <p className="text-center text-xs font-semibold text-muted">Şimdi bir harf seç ({typeof tahta.deger === 'number' ? tahta.deger : 0} puan / harf)</p>
          )}
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-11" role="group" aria-label="Harfler">
            {HARFLER.map((h) => {
              const denendi = tahta.denenen.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  disabled={!harfAktif || denendi}
                  onClick={() => void harfSec(h)}
                  className={cx('ui-btn ui-btn-secondary w-full !px-0 font-semibold', denendi && 'line-through opacity-40', harfAktif && !denendi && 'hover:bg-brand-soft')}
                >
                  {h}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            {!cozAcik ? (
              <div className="flex justify-center">
                <Button variant="secondary" genislik="uzun" onClick={() => setCozAcik(true)} disabled={mesgul || bekle}>
                  Kelimeyi tahmin et
                </Button>
              </div>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void coz();
                }}
              >
                <input autoFocus value={tahmin} onChange={(e) => setTahmin(e.target.value)} aria-label="Kelime tahmini" placeholder="Kelimeyi yaz" maxLength={40} autoCapitalize="characters" className="ui-field min-w-0 flex-1 uppercase" />
                <Button type="submit" disabled={mesgul || bekle || !tahmin.trim()}>
                  Dene
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCozAcik(false)}>
                  Vazgeç
                </Button>
              </form>
            )}
            <p className="text-center text-2xs text-subtle">Yanlış tahmin 2 hak götürür; doğru bilirsen kapalı her harf için +50 bonus alırsın.</p>
          </div>
        </div>
      )}
      {hata && (
        <p role="alert" className="text-center text-xs text-danger-fg">
          {hata}
        </p>
      )}
    </div>
  );
};
