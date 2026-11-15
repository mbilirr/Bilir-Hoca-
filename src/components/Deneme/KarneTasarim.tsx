// ============================================================================
// Aşama 272: KARNE TASARIM DİLİ (ortak)
// 8. sınıf birleştirilmiş öğrenci karnesinin (Aşama 141, B tasarımı) yazı, kutu, tablo, sütun, renk ve
// grafik dili bütün karnelerde (5-6-7-8; öğrenci, veli, sınıf, branş, kurum) bu dosyadan gelir.
// Yalnız görünüm: hesaplar ve işleyiş lib/deneme altındadır.
// Grafikler satır içi SVG ile çizilir (grafik kütüphanesi yüklenmez); kurum logosunun rengi vurgu rengidir.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cx } from '../ui/kit';
import { InfoTip } from '../ui/Compact';
import { LEVEL_INFO, levelOf, type Level } from '../../lib/deneme/analiz';
import { getKurumBrand } from '../../lib/kurumBrand';
import { kurumRenkHazirla, kurumRenkOnbellek, seritRenk, type KurumRenk } from '../../lib/kurumRenk';
import { dersRengi } from '../../lib/deneme/tekSayfaKarne';

export type RGB = [number, number, number];
export const rgb = (c: RGB, a?: number) => (a === undefined ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`);
export const tint = (c: RGB, k: number): RGB => [Math.round(255 - (255 - c[0]) * k), Math.round(255 - (255 - c[1]) * k), Math.round(255 - (255 - c[2]) * k)];
export const lvRgb = (r: number) => LEVEL_INFO[levelOf(r)].rgb;
export const LV_TEXT: Record<Level, string> = { iyi: 'text-success-fg', tekrar: 'text-info-fg', etut: 'text-warning-fg', kritik: 'text-danger-fg' };
export const LV_CHIP: Record<Level, string> = { iyi: 'ui-chip ui-chip-success', tekrar: 'ui-chip ui-chip-info', etut: 'ui-chip ui-chip-warning', kritik: 'ui-chip ui-chip-danger' };
export const LV_ORDER: Level[] = ['iyi', 'tekrar', 'etut', 'kritik'];
export const LV_RANGE: Record<Level, string> = { iyi: '%70+', tekrar: '%50-69', etut: '%30-49', kritik: '%30 altı' };
/** Dersin karnedeki rengi (tek sayfa ve birleştirilmiş karneyle aynı) */
export const dersRgb = (key: string, i = 0): RGB => dersRengi(key, i);
/** Karşılaştırma çizgisi (sınıf / kurum ortalaması) ve hedef rengi */
export const GRI: RGB = [148, 163, 184];
export const YESIL: RGB = [22, 163, 74];
export const KIRMIZI: RGB = [220, 38, 38];
/** Kurum logosu yoksa vurgu (B tasarımıyla aynı) */
const VURGU_YOK: RGB = [79, 70, 229];

// =============================================================================== Kurum rengi
function useKurumRenk(): KurumRenk | null {
  const logo = getKurumBrand().logo;
  const [r, setR] = useState<KurumRenk | null>(() => kurumRenkOnbellek(logo) || null);
  useEffect(() => {
    let canli = true;
    kurumRenkHazirla(logo).then((x) => canli && setR(x));
    return () => {
      canli = false;
    };
  }, [logo]);
  return r;
}
/** Kurum logosunun ana rengi (PDF ile aynı); logo yoksa marka rengi */
export function useVurgu(): RGB {
  const r = useKurumRenk();
  return useMemo(() => (r ? seritRenk(r).zemin : VURGU_YOK), [r]);
}
/** SVG grafik kutunun gerçek genişliğinde çizilir; yazılar geniş ekranda büyümez */
export function useGenislik(varsayilan: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(varsayilan);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => {
      const g = Math.round(e[0].contentRect.width);
      if (g > 0) setW((o) => (Math.abs(o - g) > 2 ? g : o));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// =============================================================================== Başlık bandı
/** Karnenin üst bandı: kurum logosunun renkleriyle (logo yoksa marka mavisi), sağda puan dairesi ve küçük kutular */
export const KarneBant: React.FC<{
  ust: string;
  baslik: string;
  alt: React.ReactNode;
  cipler: React.ReactNode[];
  daire: { etiket: string; deger: string; alt?: string };
  yan: Array<[string, string]>;
}> = ({ ust, baslik, alt, cipler, daire, yan }) => {
  const kRenk = useKurumRenk();
  const renk = useMemo(() => (kRenk ? seritRenk(kRenk) : null), [kRenk]);
  const cip = renk ? { background: rgb(renk.cip) } : undefined;
  const kutu = renk ? { background: rgb(renk.kutu) } : undefined;
  return (
    <div
      className={cx('relative overflow-hidden rounded-3xl text-white shadow-lg', !renk && 'bg-gradient-to-br from-indigo-700 via-brand to-sky-600')}
      style={renk ? { background: `linear-gradient(120deg, ${rgb(renk.zemin)}, ${rgb(renk.zemin)} 55%, ${rgb(renk.zemin2)})` } : undefined}
    >
      {renk && <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: rgb(renk.cizgi) }} aria-hidden />}
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" aria-hidden />
      <div className="relative grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className={cx('text-[11px] font-bold uppercase tracking-[0.2em]', renk ? 'text-white' : 'text-white/70')}>{ust}</p>
          <h3 className="mt-1 truncate text-xl font-extrabold leading-tight sm:text-2xl">{baslik}</h3>
          <p className="text-sm text-white/85">{alt}</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {cipler.filter(Boolean).map((c, i) => (
              <span key={i} style={cip} className={cx('rounded-full bg-white/15 px-2.5 py-1', i === 0 && 'font-semibold')}>
                {c}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full bg-white text-brand-fg shadow-xl ring-4 ring-white/30">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{daire.etiket}</span>
            <span className="mt-0.5 text-2xl font-black leading-none tabular-nums" style={renk ? { color: rgb(renk.cip) } : undefined}>
              {daire.deger}
            </span>
            {daire.alt && <span className="mt-0.5 text-[10px] text-muted">{daire.alt}</span>}
          </div>
          <div className="grid gap-1.5 text-xs">
            {yan.map(([k, v]) => (
              <div key={k} className={cx('rounded-xl px-3 py-1.5', !renk && 'bg-white/15')} style={kutu}>
                <p className={cx('text-[10px] uppercase tracking-wider', renk ? 'text-white' : 'text-white/70')}>{k}</p>
                <p className="font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================== Bölüm
/**
 * Karne bölümü: kart, kalın başlık, altında açıklama. tablo: gövde kenardan kenara (tablo için),
 * başlık altta ince çizgiyle ayrılır.
 */
export const KBolum: React.FC<{
  baslik?: React.ReactNode;
  aciklama?: React.ReactNode;
  bilgi?: React.ReactNode;
  sag?: React.ReactNode;
  tablo?: boolean;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ baslik, aciklama, bilgi, sag, tablo, id, className, children }) => {
  const bas = (baslik || sag) && (
    <div className={cx('flex flex-wrap items-start justify-between gap-2', tablo && 'px-4 pb-3 pt-4 sm:px-5')}>
      <div className="min-w-0">
        {baslik && (
          <h3 className="flex items-center gap-1.5 text-base font-extrabold text-fg">
            {baslik}
            {bilgi && <InfoTip text={bilgi} />}
          </h3>
        )}
        {aciklama && <p className="mt-0.5 text-xs text-muted">{aciklama}</p>}
      </div>
      {sag && <div className="flex shrink-0 flex-wrap items-center gap-2">{sag}</div>}
    </div>
  );
  if (tablo)
    return (
      <section id={id} className={cx('ui-card overflow-hidden', className)}>
        {bas}
        <div className={cx('overflow-x-auto', !!bas && 'border-t border-line')}>{children}</div>
      </section>
    );
  return (
    <section id={id} className={cx('ui-card ui-card-pad space-y-3', className)}>
      {bas}
      {children}
    </section>
  );
};

/** Bölüm içindeki alt kart (ders kartı gibi): ince kenar, üstte ders rengiyle şerit */
export const KAltKart: React.FC<{ renk?: RGB; className?: string; children: React.ReactNode }> = ({ renk, className, children }) => (
  <div className={cx('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
    {renk && <div className="h-1" style={{ background: rgb(renk) }} />}
    {children}
  </div>
);

/** Açıklama satırı (renkli kutu yerine sade, küçük yazı) */
export const KNot: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cx('flex items-start gap-1.5 text-[11px] leading-relaxed text-muted', className)}>
    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
    <span>{children}</span>
  </p>
);

// =============================================================================== Özet kutusu
type Ton = 'success' | 'info' | 'warning' | 'danger' | 'muted';
const TON_KUTU: Record<Ton, string> = {
  success: 'border-success/30 bg-success-soft',
  info: 'border-info/30 bg-info-soft',
  warning: 'border-warning/30 bg-warning-soft',
  danger: 'border-danger/30 bg-danger-soft',
  muted: 'border-line bg-surface-2/50',
};
const TON_YAZI: Record<Ton, string> = { success: 'text-success-fg', info: 'text-info-fg', warning: 'text-warning-fg', danger: 'text-danger-fg', muted: 'text-fg' };

/** Özet kutusu: küçük üst başlık, büyük kalın sayı, altında açıklama. vurgu: kurum rengiyle (son puan gibi) */
export const KKutu: React.FC<{
  etiket: React.ReactNode;
  deger: React.ReactNode;
  alt?: React.ReactNode;
  ton?: Ton;
  vurgu?: boolean;
  className?: string;
  children?: React.ReactNode;
}> = ({ etiket, deger, alt, ton, vurgu, className, children }) => {
  const v = useVurgu();
  return (
    <div
      className={cx('rounded-2xl border p-3', vurgu ? 'border-line' : TON_KUTU[ton || 'muted'], className)}
      style={vurgu ? { background: rgb(v, 0.07) } : undefined}
    >
      <p className={cx('ui-eyebrow flex items-center gap-1', ton && ton !== 'muted' && TON_YAZI[ton])}>{etiket}</p>
      <p className={cx('text-2xl font-black leading-tight tabular-nums', !vurgu && TON_YAZI[ton || 'muted'])} style={vurgu ? { color: rgb(v) } : undefined}>
        {deger}
      </p>
      {children}
      {alt && <p className="text-[11px] text-muted">{alt}</p>}
    </div>
  );
};

// =============================================================================== Tablo
/** Karne tablolarının sınıfları (birleştirilmiş karnenin deneme tablosu) */
export const KT = {
  tablo: 'w-full text-left text-xs text-fg-2',
  bas: 'bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted',
  th: 'px-3 py-2 font-semibold',
  thc: 'px-2 py-2 text-center font-semibold',
  govde: 'divide-y divide-line',
  satir: 'hover:bg-surface-2/30',
  td: 'px-3 py-1.5',
  tdc: 'px-2 py-1.5 text-center tabular-nums',
  toplam: 'bg-surface-2/50 font-bold text-fg',
  /** kaydırmalı tablolarda yapışkan ilk sütun */
  yapisik: 'sticky left-0 z-10 bg-surface',
};
/** Tablonun ders sütun başlığı: ders renginde, altında küçük açıklama */
export const DersBaslik: React.FC<{ ad: string; renk: RGB; alt?: string; className?: string }> = ({ ad, renk, alt, className }) => (
  <th className={cx(KT.thc, className)} style={{ color: rgb(renk) }}>
    {ad}
    {alt && <span className="block text-[9px] font-normal normal-case tracking-normal text-muted">{alt}</span>}
  </th>
);
/** Ders adı (satır başı): ders renginde kalın */
export const DersAd: React.FC<{ ad: React.ReactNode; renk: RGB; className?: string }> = ({ ad, renk, className }) => (
  <span className={cx('font-bold', className)} style={{ color: rgb(renk) }}>
    {ad}
  </span>
);

// =============================================================================== Seviye (başarı yüzdesi)
/** Seviye açıklaması: renkli noktalar ve aralıklar */
export const SeviyeLejant: React.FC<{ kurum?: boolean; sorulmadi?: boolean; not?: React.ReactNode }> = ({ kurum, sorulmadi, not }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-2">
    {LV_ORDER.map((k) => (
      <span key={k} className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(LEVEL_INFO[k].rgb) }} />
        {LEVEL_INFO[k].label} {LV_RANGE[k]}
      </span>
    ))}
    {sorulmadi && (
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted" /> Sorulmadı
      </span>
    )}
    {not && <span className="text-muted">{not}</span>}
    {kurum && (
      <span className="inline-flex items-center gap-1 sm:ml-auto">
        <span className="h-3 w-0.5 rounded bg-fg" /> Kurum
      </span>
    )}
  </div>
);
/** Başarı yüzdesi: seviye renginde kalın yazı */
export const Yuzde: React.FC<{ v: number | null | undefined; className?: string }> = ({ v, className }) =>
  v === null || v === undefined ? <span className="text-subtle">—</span> : <span className={cx('font-extrabold tabular-nums', LV_TEXT[levelOf(v)], className)}>%{v}</span>;
/** Seviye noktası */
export const SeviyeNokta: React.FC<{ v: number; className?: string }> = ({ v, className }) => (
  <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: rgb(lvRgb(v)) }} title={LEVEL_INFO[levelOf(v)].label} />
);
/** Başarı çubuğu: seviye renginde; kurum verilirse siyah çizgi */
export const SeviyeCubuk: React.FC<{ v: number; kurum?: number | null; renk?: RGB; className?: string }> = ({ v, kurum, renk, className }) => (
  <div className={cx('relative', className)}>
    <div className="h-2.5 rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, v))}%`, background: rgb(renk || lvRgb(v)) }} />
    </div>
    {kurum !== null && kurum !== undefined && (
      <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-fg" style={{ left: `calc(${Math.max(0, Math.min(100, kurum))}% - 1px)` }} title={`Kurum %${kurum}`} />
    )}
  </div>
);
/** Isı tablosu hücresi: seviye renginde daire, içinde yüzde; boşsa kesikli boş daire (sorulmadı) */
export const IsiDaire: React.FC<{ v: number | null; title?: string; kucuk?: boolean }> = ({ v, title, kucuk }) =>
  v === null ? (
    <span className={cx('mx-auto block rounded-full border border-dashed border-line', kucuk ? 'h-3.5 w-3.5' : 'h-6 w-6')} title={title || 'Sorulmadı'} />
  ) : (
    <span
      className={cx('mx-auto flex items-center justify-center rounded-full font-extrabold text-white tabular-nums', kucuk ? 'h-3.5 w-3.5' : 'h-6 w-6 text-[9px]')}
      style={{ background: rgb(lvRgb(v)) }}
      title={title}
    >
      {kucuk ? '' : v}
    </span>
  );
/** Yön (artış / düşüş) yazısı: yeşil / kırmızı kalın */
export const Fark: React.FC<{ v: number | null | undefined; bicim: (n: number) => string; esik?: number; ok?: boolean; className?: string }> = ({ v, bicim, esik = 0.005, ok = true, className }) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-subtle">—</span>;
  if (Math.abs(v) < esik) return <span className={cx('text-muted tabular-nums', className)}>{ok ? 'sabit' : '0'}</span>;
  return (
    <span className={cx('font-bold tabular-nums', v > 0 ? 'text-success-fg' : 'text-danger-fg', className)}>
      {v > 0 ? '+' : '-'}
      {bicim(Math.abs(v))}
    </span>
  );
};

// =============================================================================== Küçük gidişat çizgisi
export const Gidis: React.FC<{ degerler: Array<number | null>; renk: RGB; min?: number; max?: number; genislik?: number }> = ({ degerler, renk, min, max, genislik = 60 }) => {
  const n = degerler.length;
  const v = degerler.filter((x): x is number => x !== null);
  if (v.length < 2) return <span className="text-subtle">—</span>;
  const lo = min ?? Math.min(...v);
  const hi = max ?? Math.max(...v);
  const span = Math.max(1e-6, hi - lo);
  const W = genislik;
  const pts = degerler
    .map((x, i) => (x === null ? null : ([n === 1 ? W / 2 : 2 + ((W - 4) * i) / (n - 1), 16 - ((x - lo) / span) * 13] as const)))
    .filter((p): p is readonly [number, number] => !!p);
  return (
    <svg viewBox={`0 0 ${W} 18`} className="mx-auto block h-[18px]" style={{ width: W }} aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={rgb(renk)} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill={rgb(renk)} />
    </svg>
  );
};

// =============================================================================== Grafikler
export type Seri = {
  ad: string;
  degerler: Array<number | null>;
  /** ana: kalın vurgu çizgisi, alanı dolu, değerleri yazılı · karsi: gri kesik çizgi · ince: renkli ince çizgi */
  tur?: 'ana' | 'karsi' | 'ince';
  renk?: RGB;
};
const adimSec = (aralik: number) => {
  const ham = aralik / 5;
  const us = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, ham))));
  const k = ham / us;
  return (k <= 1 ? 1 : k <= 2 ? 2 : k <= 2.5 ? 2.5 : k <= 5 ? 5 : 10) * us;
};
const kisalt = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const sayi = (v: number) => (Math.round(v * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** Grafiğin altındaki seri açıklaması */
export const GrafikLejant: React.FC<{ ogeler: Array<{ ad: string; renk: RGB; kesik?: boolean }> }> = ({ ogeler }) => (
  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-2">
    {ogeler.map((o) => (
      <span key={o.ad} className="inline-flex items-center gap-1">
        <svg width="16" height="6" aria-hidden>
          <line x1="0" x2="16" y1="3" y2="3" stroke={rgb(o.renk)} strokeWidth="2.2" strokeDasharray={o.kesik ? '4 3' : undefined} />
        </svg>
        {o.ad}
      </span>
    ))}
  </div>
);

/** Çizgi grafiği (birleştirilmiş karnedeki puan gelişimi grafiğinin dili) */
export const KCizgi: React.FC<{
  etiketler: Array<{ ust: string; alt?: string }>;
  seriler: Seri[];
  hedef?: { deger: number; ad: string } | null;
  bicim?: (v: number) => string;
  min?: number;
  max?: number;
  yukseklik?: number;
  lejant?: boolean;
}> = ({ etiketler, seriler, hedef, bicim = sayi, min, max, yukseklik = 230, lejant }) => {
  const vurgu = useVurgu();
  const [kutu, gen] = useGenislik(520);
  const n = etiketler.length;
  const W = Math.max(260, gen);
  const H = yukseklik;
  const L = 36;
  const R = 14;
  const T = 18;
  const B = etiketler.some((e) => e.alt) ? 32 : 20;
  const renkOf = (s: Seri) => s.renk || (s.tur === 'karsi' ? GRI : vurgu);
  const hepsi = [...seriler.flatMap((s) => s.degerler), hedef ? hedef.deger : null].filter((v): v is number => v !== null && Number.isFinite(v));
  if (!n || !hepsi.length) return <div ref={kutu} className="py-16 text-center text-xs text-muted">Gösterilecek veri yok.</div>;
  let lo = min ?? Math.min(...hepsi);
  let hi = max ?? Math.max(...hepsi);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const adim = adimSec(hi - lo);
  if (min === undefined) lo = Math.floor(lo / adim) * adim;
  if (max === undefined) hi = Math.ceil(hi / adim) * adim;
  const X = (i: number) => (n === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (n - 1));
  const Y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - B - T);
  const cizgi = (vals: Array<number | null>) =>
    vals
      .map((v, i) => (v === null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const cizgiler: number[] = [];
  for (let v = lo; v <= hi + adim / 2; v += adim) cizgiler.push(Math.round(v * 1000) / 1000);
  const her = n > 8 ? Math.ceil(n / 8) : 1;
  const ana = seriler.find((s) => s.tur === 'ana');
  const karsi = seriler.find((s) => s.tur === 'karsi');
  /** ilk ve son etiket kutunun dışına taşmasın */
  const capa = (i: number) => (n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle');
  const capaX = (i: number) => X(i) + (n > 1 && i === 0 ? -4 : n > 1 && i === n - 1 ? 4 : 0);
  const anaPts = ana ? ana.degerler.map((v, i) => (v === null ? null : ([X(i), Y(v)] as const))).filter((p): p is readonly [number, number] => !!p) : [];
  return (
    <div ref={kutu}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={seriler.map((s) => s.ad).join(', ')}>
        {anaPts.length >= 2 && <polygon points={`${anaPts[0][0]},${H - B} ${anaPts.map((p) => p.join(',')).join(' ')} ${anaPts[anaPts.length - 1][0]},${H - B}`} fill={rgb(renkOf(ana!), 0.12)} />}
        {cizgiler.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="stroke-line" strokeWidth="0.8" />
            <text x={L - 5} y={Y(t) + 3.5} textAnchor="end" fontSize="10" className="fill-muted">
              {sayi(t)}
            </text>
          </g>
        ))}
        {hedef && hedef.deger >= lo && hedef.deger <= hi && (
          <g>
            <line x1={L} x2={W - R} y1={Y(hedef.deger)} y2={Y(hedef.deger)} stroke={rgb(YESIL)} strokeWidth="1.2" strokeDasharray="5 4" />
            <text x={L + 4} y={Y(hedef.deger) - 4} fontSize="10" fontWeight="700" fill={rgb(YESIL)}>
              {hedef.ad}
            </text>
          </g>
        )}
        {seriler
          .filter((s) => s.tur !== 'ana')
          .map((s) => (
            <g key={s.ad}>
              <polyline
                points={cizgi(s.degerler)}
                fill="none"
                stroke={rgb(renkOf(s))}
                strokeWidth={s.tur === 'karsi' ? 1.5 : 1.8}
                strokeDasharray={s.tur === 'karsi' ? '4 3' : undefined}
                strokeLinejoin="round"
              />
              {s.tur !== 'karsi' &&
                s.degerler.map((v, i) =>
                  v === null ? null : (
                    <circle key={i} cx={X(i)} cy={Y(v)} r="2.6" fill={i === n - 1 ? rgb(renkOf(s)) : 'white'} stroke={rgb(renkOf(s))} strokeWidth="1.3">
                      <title>{`${s.ad} · ${etiketler[i].ust}: ${bicim(v)}`}</title>
                    </circle>
                  )
                )}
            </g>
          ))}
        {ana && (
          <g>
            <polyline points={cizgi(ana.degerler)} fill="none" stroke={rgb(renkOf(ana))} strokeWidth="2.6" strokeLinejoin="round" />
            {ana.degerler.map((v, i) => {
              if (v === null) return null;
              const k = karsi?.degerler[i] ?? null;
              return (
                <g key={i}>
                  <circle cx={X(i)} cy={Y(v)} r="3.6" fill="white" stroke={rgb(renkOf(ana))} strokeWidth="1.8">
                    <title>{`${ana.ad} · ${etiketler[i].ust}: ${bicim(v)}`}</title>
                  </circle>
                  {(n <= 8 || i === n - 1 || i === 0) && (
                    <text x={capaX(i)} y={k === null || v >= k ? Y(v) - 8 : Y(v) + 15} textAnchor={capa(i)} fontSize="10.5" fontWeight="800" fill={rgb(renkOf(ana))}>
                      {bicim(v)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
        {etiketler.map((e, i) =>
          i % her && i !== n - 1 ? null : (
            <g key={`l${i}`}>
              <text x={capaX(i)} y={H - B + 15} textAnchor={capa(i)} fontSize="10" className="fill-fg-2">
                {kisalt(e.ust, 12)}
              </text>
              {e.alt && (
                <text x={capaX(i)} y={H - B + 27} textAnchor={capa(i)} fontSize="9" className="fill-muted">
                  {e.alt}
                </text>
              )}
            </g>
          )
        )}
      </svg>
      {lejant && <GrafikLejant ogeler={[...seriler.map((s) => ({ ad: s.ad, renk: renkOf(s), kesik: s.tur === 'karsi' })), ...(hedef ? [{ ad: 'Hedef', renk: YESIL, kesik: true }] : [])]} />}
    </div>
  );
};

/**
 * Sütun grafiği. Tek seri: her sütun kendi renginde (renkler) ya da vurgu renginde; eksi değerler sıfırın altına iner.
 * Çok seri: yan yana, seri renkleriyle (ilk seri vurgu, sonrakiler gri tonları ya da verilen renk).
 */
export const KSutun: React.FC<{
  etiketler: Array<{ ust: string; alt?: string }>;
  seriler: Array<{ ad: string; degerler: Array<number | null>; renk?: RGB; renkler?: Array<RGB | null> }>;
  bicim?: (v: number) => string;
  yukseklik?: number;
  lejant?: boolean;
  min?: number;
  max?: number;
}> = ({ etiketler, seriler, bicim = sayi, yukseklik = 230, lejant, min, max }) => {
  const vurgu = useVurgu();
  const [kutu, gen] = useGenislik(520);
  const n = etiketler.length;
  const W = Math.max(260, gen);
  const H = yukseklik;
  const L = 36;
  const R = 10;
  const T = 16;
  const B = etiketler.some((e) => e.alt) ? 32 : 20;
  const hepsi = seriler.flatMap((s) => s.degerler).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!n || !hepsi.length) return <div ref={kutu} className="py-16 text-center text-xs text-muted">Gösterilecek veri yok.</div>;
  let lo = Math.min(0, min ?? Math.min(...hepsi));
  let hi = Math.max(0, max ?? Math.max(...hepsi));
  if (hi - lo < 1e-6) hi = lo + 1;
  const adim = adimSec(hi - lo);
  lo = Math.floor(lo / adim) * adim;
  hi = Math.ceil(hi / adim) * adim;
  const Y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - B - T);
  const grup = (W - L - R) / n;
  const ns = seriler.length;
  const sw = Math.min(34, (grup * 0.7) / ns);
  const renkOf = (si: number, i: number): RGB => seriler[si].renkler?.[i] || seriler[si].renk || (si === 0 ? vurgu : tint(GRI, si === 1 ? 1 : 0.6));
  const cizgiler: number[] = [];
  for (let v = lo; v <= hi + adim / 2; v += adim) cizgiler.push(Math.round(v * 1000) / 1000);
  const yaz = ns === 1 || n * ns <= 12;
  return (
    <div ref={kutu}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={seriler.map((s) => s.ad).join(', ')}>
        {cizgiler.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className={t === 0 ? 'stroke-muted' : 'stroke-line'} strokeWidth={t === 0 ? 1 : 0.8} />
            <text x={L - 5} y={Y(t) + 3.5} textAnchor="end" fontSize="10" className="fill-muted">
              {sayi(t)}
            </text>
          </g>
        ))}
        {etiketler.map((e, i) => {
          const x0 = L + grup * i + (grup - sw * ns) / 2;
          return (
            <g key={i}>
              {seriler.map((s, si) => {
                const v = s.degerler[i];
                if (v === null || v === undefined) return null;
                const y1 = Y(Math.max(0, v));
                const y2 = Y(Math.min(0, v));
                const h = Math.max(1, y2 - y1);
                const x = x0 + sw * si;
                return (
                  <g key={si}>
                    <rect x={x + 1} y={y1} width={Math.max(2, sw - 2)} height={h} rx="4" fill={rgb(renkOf(si, i))}>
                      <title>{`${s.ad} · ${e.ust}: ${bicim(v)}`}</title>
                    </rect>
                    {yaz && (
                      <text x={x + sw / 2} y={v >= 0 ? y1 - 4 : y2 + 11} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={rgb(renkOf(si, i))}>
                        {bicim(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={L + grup * i + grup / 2} y={H - B + 15} textAnchor="middle" fontSize="10" className="fill-fg-2">
                {kisalt(e.ust, Math.max(6, Math.floor(grup / 6)))}
              </text>
              {e.alt && (
                <text x={L + grup * i + grup / 2} y={H - B + 27} textAnchor="middle" fontSize="9" className="fill-muted">
                  {e.alt}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {lejant && ns > 1 && <GrafikLejant ogeler={seriler.map((s, si) => ({ ad: s.ad, renk: renkOf(si, -1) }))} />}
    </div>
  );
};

/** Grafik kartı: kalın başlık, yanında küçük açıklama (birleştirilmiş karnedeki "Puan gelişimi" kartı) */
export const KGrafikKart: React.FC<{ baslik: string; aciklama?: string; className?: string; children: React.ReactNode }> = ({ baslik, aciklama, className, children }) => (
  <section className={cx('ui-card ui-card-pad', className)}>
    <p className="mb-1 text-sm font-bold text-fg">
      {baslik} {aciklama && <span className="text-[11px] font-normal text-muted">{aciklama}</span>}
    </p>
    {children}
  </section>
);
