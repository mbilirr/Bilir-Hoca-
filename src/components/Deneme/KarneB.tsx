// ============================================================================
// Aşama 141: BİRLEŞTİRİLMİŞ KARNE — B TASARIMI (ekran)
// PDF'teki karnePdfB.ts çizimlerinin ekran karşılığı; aynı veriyle (kazanimBirlesik, gelisimPanoData, isiNoktaData).
// Grafikler satır içi SVG ile çizilir (grafik kütüphanesi yüklenmez, sayfa hafif kalır).
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../ui/kit';
import { LEVEL_INFO, levelOf, type Level } from '../../lib/deneme/analiz';
import type { BirlesikDers } from '../../lib/deneme/kazanimBirlesik';
import type { GelisimPanoData, IsiNoktaData } from '../../lib/deneme/karnePdfB';
import { getKurumBrand } from '../../lib/kurumBrand';
import { kurumRenkHazirla, kurumRenkOnbellek, seritRenk } from '../../lib/kurumRenk';

type RGB = [number, number, number];
const rgb = (c: RGB, a?: number) => (a === undefined ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`);
const tint = (c: RGB, k: number): RGB => [Math.round(255 - (255 - c[0]) * k), Math.round(255 - (255 - c[1]) * k), Math.round(255 - (255 - c[2]) * k)];
const lvRgb = (r: number) => LEVEL_INFO[levelOf(r)].rgb;
const LV_TEXT: Record<Level, string> = { iyi: 'text-success-fg', tekrar: 'text-info-fg', etut: 'text-warning-fg', kritik: 'text-danger-fg' };
const LV_CHIP: Record<Level, string> = { iyi: 'ui-chip ui-chip-success', tekrar: 'ui-chip ui-chip-info', etut: 'ui-chip ui-chip-warning', kritik: 'ui-chip ui-chip-danger' };
const LV_ORDER: Level[] = ['iyi', 'tekrar', 'etut', 'kritik'];
const LV_RANGE: Record<Level, string> = { iyi: '%70+', tekrar: '%50-69', etut: '%30-49', kritik: '%30 altı' };
const fmt1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : (Math.round(v * 10) / 10).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmt2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : (Math.round(v * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const MARK_BG: Record<'D' | 'Y' | 'B', string> = { D: 'bg-success', Y: 'bg-danger', B: 'bg-slate-300' };

/** Kurum logosunun ana rengi (PDF ile aynı); logo yoksa marka rengi */
function useVurgu(): RGB {
  const logo = getKurumBrand().logo;
  const [r, setR] = useState(() => kurumRenkOnbellek(logo) || null);
  useEffect(() => {
    let canli = true;
    kurumRenkHazirla(logo).then((x) => canli && setR(x));
    return () => {
      canli = false;
    };
  }, [logo]);
  return useMemo(() => (r ? seritRenk(r).zemin : ([79, 70, 229] as RGB)), [r]);
}

const Legend: React.FC<{ kurum?: boolean }> = ({ kurum }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-2">
    {LV_ORDER.map((k) => (
      <span key={k} className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(LEVEL_INFO[k].rgb) }} />
        {LEVEL_INFO[k].label} {LV_RANGE[k]}
      </span>
    ))}
    {kurum && (
      <span className="inline-flex items-center gap-1 sm:ml-auto">
        <span className="h-3 w-0.5 rounded bg-fg" /> Kurum
      </span>
    )}
  </div>
);

// =============================================================================== 1) Kazanım kartları
const Ring: React.FC<{ v: number; c: RGB }> = ({ v, c }) => {
  const r = 15.5;
  const L = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-12 w-12 shrink-0" aria-label={`Başarı yüzde ${v}`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke={rgb(tint(c, 0.18))} strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={rgb(c)} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(L * Math.min(100, v)) / 100} ${L}`} transform="rotate(-90 20 20)" />
      <text x="20" y="23.5" textAnchor="middle" fontSize="10" fontWeight="800" className="fill-fg">
        %{v}
      </text>
    </svg>
  );
};

const DersKart: React.FC<{ d: BirlesikDers; n: number }> = ({ d, n }) => (
  <div className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
    <div className="h-1" style={{ background: rgb(d.renk) }} />
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Ring v={d.bu ? d.bu.rate : (d.toplamRate ?? 0)} c={d.renk} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold" style={{ color: rgb(d.renk) }}>
          {d.ad}
        </p>
        {d.bu && (
          <p className="text-[11px] text-muted tabular-nums">
            D {d.bu.d} · Y {d.bu.y} · B {d.bu.b} · Net {fmt2(d.bu.net)}
          </p>
        )}
        {d.toplamRate !== null && (
          <p className="text-[11px] text-muted">
            {n} denemede <b className="text-fg">%{d.toplamRate}</b>
          </p>
        )}
      </div>
      <div className="flex max-w-[45%] flex-wrap justify-end gap-1">
        {LV_ORDER.filter((k) => d.sayilar[k]).map((k) => (
          <span key={k} className={cx(LV_CHIP[k], 'text-[10px]')}>
            {d.sayilar[k]} {LEVEL_INFO[k].label.toLocaleLowerCase('tr-TR')}
          </span>
        ))}
      </div>
    </div>
    <ul className="divide-y divide-line border-t border-line">
      {d.satirlar.map((s) => {
        const two = !!(s.bu && s.toplam);
        const ana = s.bu ? s.bu.rate : (s.toplam?.rate ?? 0);
        return (
          <li key={s.konu} className="grid grid-cols-[1fr_6.5rem_2.75rem] items-center gap-2 px-3 py-1.5">
            <div className="min-w-0">
              <p className="flex items-start gap-1.5 text-xs leading-snug text-fg-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: rgb(LEVEL_INFO[s.durum].rgb) }} title={LEVEL_INFO[s.durum].label} />
                <span>{s.konu}</span>
              </p>
              {s.altlar.length > 0 && <p className="pl-3.5 text-[10px] text-muted truncate">Alt: {s.altlar.map((a) => `${a.ad} %${a.rate}`).join(' · ')}</p>}
              {s.bu && s.bu.sorular.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-0.5 pl-3.5">
                  {s.bu.sorular.map((q) => (
                    <span key={q.no} className={cx('inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-bold text-white tabular-nums', MARK_BG[q.mark])} title={`${q.no}. soru: ${q.mark === 'D' ? 'doğru' : q.mark === 'Y' ? 'yanlış' : 'boş'}`}>
                      {q.no}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <div className={cx('rounded-full bg-surface-2', two ? 'h-2' : 'h-2.5')}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, ana))}%`, background: rgb(lvRgb(ana)) }} />
              </div>
              {two && (
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.min(100, s.toplam!.rate))}%`, background: rgb(tint(d.renk, 0.5)) }} />
                </div>
              )}
              {s.kurumRate !== null && <span className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-fg" style={{ left: `calc(${Math.max(0, Math.min(100, s.kurumRate))}% - 1px)` }} title={`Kurum %${s.kurumRate}`} />}
            </div>
            <div className="text-right leading-tight tabular-nums">
              <p className={cx('text-xs font-extrabold', LV_TEXT[levelOf(ana)])}>%{ana}</p>
              {two && <p className="text-[10px] text-muted">%{s.toplam!.rate}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

export const KazanimKartlari: React.FC<{ dersler: BirlesikDers[]; n: number }> = ({ dersler, n }) => {
  if (!dersler.length) return null;
  const ikiSeri = dersler.some((d) => d.satirlar.some((s) => s.bu && s.toplam));
  const buVar = dersler.some((d) => d.satirlar.some((s) => s.bu));
  return (
    <section className="ui-card ui-card-pad space-y-3" id="karne-kazanim-analizi">
      <div>
        <h3 className="text-base font-extrabold text-fg">Konu ve kazanım analizi</h3>
        <p className="text-xs text-muted">
          {ikiSeri
            ? `Kalın çubuk bu denemeyi, ince çubuk seçilen ${n} denemenin toplamını gösterir; siyah çizgi kurumun başarısıdır. Sağdaki büyük sayı bu deneme, küçük sayı ${n} denemedir. Kutular bu denemedeki soru numaralarıdır.`
            : buVar
              ? 'Çubuk bu denemedeki başarıyı, siyah çizgi kurumun başarısını gösterir. Kutular bu denemedeki soru numaralarıdır.'
              : `Çubuk seçilen ${n} denemedeki toplam başarıyı gösterir.`}
        </p>
      </div>
      <Legend kurum={dersler.some((d) => d.satirlar.some((s) => s.kurumRate !== null))} />
      <div className="columns-1 gap-3 lg:columns-2">
        {dersler.map((d) => (
          <DersKart key={d.key} d={d} n={n} />
        ))}
      </div>
    </section>
  );
};

// =============================================================================== 2) Gelişim panosu
/** SVG grafik kutunun gerçek genişliğinde çizilir; yazılar geniş ekranda büyümez */
function useGenislik(varsayilan: number): [React.RefObject<HTMLDivElement | null>, number] {
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
const PuanGrafik: React.FC<{ g: GelisimPanoData; vurgu: RGB }> = ({ g, vurgu }) => {
  const D = g.denemeler;
  const n = D.length;
  const [kutu, gen] = useGenislik(520);
  const W = Math.max(280, gen);
  const H = 230;
  const L = 34;
  const R = 14;
  const T = 18;
  const B = 32;
  const all = [...D.map((d) => d.puan), ...D.map((d) => d.sinifOrt), g.hedef].filter((v): v is number => v !== null);
  if (n < 2 || !all.length) return <div ref={kutu} className="py-16 text-center text-xs text-muted">Gelişim için en az 2 deneme gerekir.</div>;
  let lo = Math.max(100, Math.floor((Math.min(...all) - 15) / 25) * 25);
  let hi = Math.min(500, Math.ceil((Math.max(...all) + 15) / 25) * 25);
  if (hi - lo < 50) hi = lo + 50;
  const step = hi - lo <= 125 ? 25 : hi - lo <= 250 ? 50 : 100;
  const X = (i: number) => L + ((W - L - R) * i) / (n - 1);
  const Y = (v: number) => H - B - ((v - lo) / (hi - lo)) * (H - B - T);
  const line = (vals: Array<number | null>) =>
    vals
      .map((v, i) => (v === null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const pts = D.map((d, i) => (d.puan === null ? null : ([X(i), Y(d.puan)] as const))).filter((p): p is readonly [number, number] => !!p);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const every = n > 8 ? Math.ceil(n / 8) : 1;
  return (
    <div ref={kutu}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Puan gelişimi grafiği">
      {pts.length >= 2 && <polygon points={`${pts[0][0]},${H - B} ${pts.map((p) => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${H - B}`} fill={rgb(vurgu, 0.12)} />}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="stroke-line" strokeWidth="0.8" />
          <text x={L - 5} y={Y(t) + 3.5} textAnchor="end" fontSize="10" className="fill-muted">
            {t}
          </text>
        </g>
      ))}
      {g.hedef !== null && g.hedef >= lo && g.hedef <= hi && (
        <g>
          <line x1={L} x2={W - R} y1={Y(g.hedef)} y2={Y(g.hedef)} stroke="rgb(22 163 74)" strokeWidth="1.2" strokeDasharray="5 4" />
          <text x={L + 4} y={Y(g.hedef) - 4} fontSize="10" fontWeight="700" fill="rgb(22 163 74)">
            Hedef {fmt1(g.hedef)}
          </text>
        </g>
      )}
      <polyline points={line(D.map((d) => d.sinifOrt))} fill="none" stroke="rgb(148 163 184)" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={line(D.map((d) => d.puan))} fill="none" stroke={rgb(vurgu)} strokeWidth="2.6" strokeLinejoin="round" />
      {D.map((d, i) =>
        d.puan === null ? null : (
          <g key={i}>
            <circle cx={X(i)} cy={Y(d.puan)} r="3.6" fill="white" stroke={rgb(vurgu)} strokeWidth="1.8" />
            {(n <= 8 || i === n - 1 || i === 0) && (
              <text x={X(i)} y={d.sinifOrt === null || d.puan >= d.sinifOrt ? Y(d.puan) - 8 : Y(d.puan) + 15} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={rgb(vurgu)}>
                {fmt1(d.puan)}
              </text>
            )}
          </g>
        )
      )}
      {D.map((d, i) =>
        i % every && i !== n - 1 ? null : (
          <g key={`l${i}`}>
            <text x={X(i)} y={H - B + 15} textAnchor="middle" fontSize="10" className="fill-fg-2">
              {d.kisa.length > 12 ? `${d.kisa.slice(0, 11)}…` : d.kisa}
            </text>
            <text x={X(i)} y={H - B + 27} textAnchor="middle" fontSize="9" className="fill-muted">
              {d.tarih}
            </text>
          </g>
        )
      )}
    </svg>
    </div>
  );
};

const NetMini: React.FC<{ d: GelisimPanoData['dersler'][number]; n: number }> = ({ d, n }) => {
  const [kutu, gen] = useGenislik(200);
  const W = Math.max(160, gen);
  const H = 96;
  const L = 18;
  const R = 6;
  const T = 6;
  const B = 14;
  const top = Math.max(1, d.soru);
  const X = (i: number) => (n === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (n - 1));
  const Y = (v: number) => H - B - (Math.max(0, Math.min(top, v)) / top) * (H - B - T);
  const line = (vals: Array<number | null>) =>
    vals
      .map((v, i) => (v === null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
  const nv = d.netler.filter((v): v is number => v !== null);
  const fark = nv.length >= 2 ? nv[nv.length - 1] - nv[0] : null;
  return (
    <div className="rounded-xl border border-line p-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <b style={{ color: rgb(d.renk) }}>{d.ad}</b>
        <span className="tabular-nums">
          <b className="text-fg">{fmt1(nv.length ? nv[nv.length - 1] : null)}</b>{' '}
          {fark !== null && <span className={cx('text-[10px] font-bold', Math.abs(fark) < 0.05 ? 'text-muted' : fark > 0 ? 'text-success-fg' : 'text-danger-fg')}>{Math.abs(fark) < 0.05 ? 'sabit' : `${fark > 0 ? '+' : '-'}${fmt1(Math.abs(fark))}`}</span>}
        </span>
      </div>
      <div ref={kutu}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" aria-hidden>
        {[0, Math.round(top / 2), top].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="stroke-line" strokeWidth="0.7" />
            <text x={L - 4} y={Y(v) + 3} textAnchor="end" fontSize="8" className="fill-muted">
              {v}
            </text>
          </g>
        ))}
        <polyline points={line(d.sinifNetler)} fill="none" stroke="rgb(203 213 225)" strokeWidth="1.3" />
        <polyline points={line(d.netler)} fill="none" stroke={rgb(d.renk)} strokeWidth="2" strokeLinejoin="round" />
        {d.netler.map((v, i) => (v === null ? null : <circle key={i} cx={X(i)} cy={Y(v)} r="2.6" fill={i === n - 1 ? rgb(d.renk) : 'white'} stroke={rgb(d.renk)} strokeWidth="1.3" />))}
        {n <= 8 &&
          d.netler.map((_, i) => (
            <text key={`x${i}`} x={X(i)} y={H - 2} textAnchor="middle" fontSize="8" className="fill-muted">
              {i + 1}
            </text>
          ))}
      </svg>
      </div>
    </div>
  );
};

export const GelisimPano: React.FC<{ data: GelisimPanoData }> = ({ data: g }) => {
  const vurgu = useVurgu();
  const D = g.denemeler;
  const n = D.length;
  if (!n) return null;
  const last = D[n - 1];
  const prev = n >= 2 ? D[n - 2] : null;
  const dlt = last.puan !== null && prev && prev.puan !== null ? last.puan - prev.puan : null;
  const first = D.find((d) => d.puan !== null);
  const deg = first && last.puan !== null && n >= 2 ? last.puan - first.puan! : null;
  const hedefP = g.hedef !== null && last.puan !== null ? Math.round((last.puan / g.hedef) * 100) : null;
  const kart = D.slice(-5);
  return (
    <div className="space-y-3" id="karne-gelisim">
      <div className="grid gap-3 lg:grid-cols-[1fr_13rem]">
        <section className="ui-card ui-card-pad">
          <p className="text-sm font-bold text-fg">
            Puan gelişimi <span className="text-[11px] font-normal text-muted">kalın çizgi öğrenci · kesik çizgi sınıf ortalaması{g.hedef !== null ? ' · yeşil kesik çizgi hedef' : ''}</span>
          </p>
          <PuanGrafik g={g} vurgu={vurgu} />
        </section>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-2xl border border-line p-3" style={{ background: rgb(vurgu, 0.07) }}>
            <p className="ui-eyebrow">Son puan</p>
            <p className="text-2xl font-black tabular-nums" style={{ color: rgb(vurgu) }}>
              {fmt1(last.puan)}
            </p>
            <p className="text-[11px] text-muted">{dlt === null ? last.ad : `Önceki denemeye göre ${dlt >= 0 ? '+' : '-'}${fmt1(Math.abs(dlt))}`}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
            <p className="ui-eyebrow">Ortalama puan</p>
            <p className="text-2xl font-black tabular-nums text-fg">{fmt1(g.ortalama)}</p>
            <p className="text-[11px] text-muted">{deg === null ? `${n} deneme` : `${n} denemede ${deg >= 0 ? '+' : '-'}${fmt1(Math.abs(deg))} değişim`}</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface-2/50 p-3">
            {hedefP !== null && g.hedef !== null && last.puan !== null ? (
              <>
                <p className="ui-eyebrow">Hedef {fmt1(g.hedef)}</p>
                <p className={cx('text-2xl font-black tabular-nums', last.puan >= g.hedef ? 'text-success-fg' : 'text-fg')}>%{Math.min(100, hedefP)}</p>
                <div className="my-1 h-1.5 rounded-full bg-line">
                  <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(100, hedefP)}%` }} />
                </div>
                <p className="text-[11px] text-muted">{g.hedef - last.puan > 0 ? `${fmt1(g.hedef - last.puan)} puan kaldı` : `Hedefin ${fmt1(last.puan - g.hedef)} puan üstünde`}</p>
              </>
            ) : (
              <>
                <p className="ui-eyebrow">Son toplam net</p>
                <p className="text-2xl font-black tabular-nums text-fg">{fmt2(last.toplamNet)}</p>
                <p className="text-[11px] text-muted">Sınıf sırası {last.sinifSira}</p>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kart.map((d, i) => {
          const on = i === kart.length - 1;
          return (
            <div key={`${d.ad}-${i}`} className="rounded-2xl border border-line p-2.5" style={on ? { borderColor: rgb(vurgu), background: rgb(vurgu, 0.07) } : undefined}>
              <p className="truncate text-[11px] text-muted">
                {d.kisa} · {d.tarih}
              </p>
              <p className="text-lg font-black tabular-nums" style={on ? { color: rgb(vurgu) } : undefined}>
                {fmt1(d.puan)}
              </p>
              <p className="text-[10px] leading-snug text-muted">
                Sınıf {d.sinifSira} · Kurum {d.kurumSira} · Net {fmt1(d.toplamNet)}
              </p>
            </div>
          );
        })}
      </div>
      <section className="ui-card ui-card-pad">
        <p className="mb-2 text-sm font-bold text-fg">
          Ders netlerinin gelişimi <span className="text-[11px] font-normal text-muted">renkli çizgi öğrenci · gri çizgi sınıf ortalaması · sağ üstte son net ve ilk denemeye göre fark</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {g.dersler.map((d) => (
            <NetMini key={d.ad} d={d} n={n} />
          ))}
        </div>
      </section>
      <section className="ui-card overflow-x-auto">
        <table className="w-full text-xs text-fg-2">
          <thead className="bg-surface-2/60 text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Deneme</th>
              {g.dersler.map((d) => (
                <th key={d.ad} className="px-2 py-2 text-center font-semibold" style={{ color: rgb(d.renk) }}>
                  {d.kisa}
                  <span className="block text-[9px] font-normal normal-case tracking-normal text-muted">D / Y / Net</span>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-semibold">Toplam net</th>
              <th className="px-2 py-2 text-center font-semibold">Puan</th>
              <th className="px-2 py-2 text-center font-semibold">Sınıf</th>
              <th className="px-2 py-2 text-center font-semibold">Kurum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {D.map((d, i) => (
              <tr key={`${d.ad}-${i}`} className="hover:bg-surface-2/30">
                <td className="px-3 py-1.5">
                  <p className="font-semibold text-fg">{d.ad}</p>
                  <p className="text-[10px] text-muted">{d.tarih}</p>
                </td>
                {d.netler.map((v, k) => (
                  <td key={k} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                    {v}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-bold tabular-nums text-fg">{fmt2(d.toplamNet)}</td>
                <td className="px-2 py-1.5 text-center font-bold tabular-nums" style={i === n - 1 ? { color: rgb(vurgu) } : undefined}>
                  {fmt2(d.puan)}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums">{d.sinifSira}</td>
                <td className="px-2 py-1.5 text-center tabular-nums">{d.kurumSira}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

// =============================================================================== 3) Konu ısı tablosu (daireler)
const Spark: React.FC<{ vals: Array<number | null>; c: RGB }> = ({ vals, c }) => {
  const n = vals.length;
  const pts = vals.map((v, i) => (v === null ? null : ([n === 1 ? 30 : 2 + (56 * i) / (n - 1), 16 - (v / 100) * 13] as const))).filter((p): p is readonly [number, number] => !!p);
  if (pts.length < 2) return <span className="text-muted">-</span>;
  return (
    <svg viewBox="0 0 60 18" className="mx-auto h-[18px] w-[60px]" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={rgb(c)} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.8" fill={rgb(c)} />
    </svg>
  );
};

export const IsiNokta: React.FC<{ data: IsiNoktaData; adlar: string[]; fazla?: number }> = ({ data, adlar, fazla }) => (
  <section className="ui-card ui-card-pad space-y-3" id="karne-isi-tablosu">
    <div>
      <h3 className="text-base font-extrabold text-fg">Konu ısı tablosu</h3>
      <p className="text-xs text-muted">Satırlar kazanımlar, sütunlar denemeler; her daire o denemedeki başarıdır (içindeki sayı yüzde). Kesikli boş daire o denemede sorulmadı demektir.</p>
      <p className="mt-1 text-[11px] text-muted">
        Sütunlar: {adlar.map((a, i) => `${i + 1}) ${a}`).join('  ')}
        {fazla ? ` (son ${adlar.length} deneme gösterilir)` : ''}
      </p>
    </div>
    <Legend />
    {data.dersler.map((d) => (
      <div key={d.ad} className="overflow-hidden rounded-2xl border border-line">
        <p className="flex items-center gap-2 px-3 pt-2.5 text-sm font-extrabold" style={{ color: rgb(d.renk) }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(d.renk) }} />
          {d.ad}
          <span className="text-[11px] font-normal text-muted">
            {d.satirlar.length} kazanım · {data.denemeler.length} denemede %{d.genelOran}
          </span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-fg-2">
            <thead className="text-[10px] text-muted">
              <tr>
                <th className="sticky left-0 bg-surface px-3 py-1.5 text-left font-semibold">Kazanım</th>
                {data.denemeler.map((e) => (
                  <th key={e.no} className="w-11 px-1 py-1.5 text-center font-semibold">
                    {e.no}
                    <span className="block font-normal">{e.tarih}</span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center font-semibold">Gidişat</th>
                <th className="px-3 py-1.5 text-right font-semibold">Genel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.satirlar.map((r) => (
                <tr key={r.ad}>
                  <td className="sticky left-0 min-w-44 bg-surface px-3 py-1">{r.ad}</td>
                  {r.hucre.map((v, i) => (
                    <td key={i} className="px-1 py-1 text-center">
                      {v === null ? (
                        <span className="mx-auto block h-6 w-6 rounded-full border border-dashed border-line" title="Sorulmadı" />
                      ) : (
                        <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold text-white tabular-nums" style={{ background: rgb(lvRgb(v)) }}>
                          {v}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <Spark vals={r.hucre} c={lvRgb(r.genel)} />
                  </td>
                  <td className={cx('px-3 py-1 text-right font-extrabold tabular-nums', LV_TEXT[levelOf(r.genel)])}>%{r.genel}</td>
                </tr>
              ))}
              <tr className="bg-surface-2/50 font-bold">
                <td className="sticky left-0 bg-surface-2 px-3 py-1.5 text-fg">Ders geneli</td>
                {d.genel.map((v, i) => (
                  <td key={i} className={cx('px-1 py-1.5 text-center tabular-nums', v === null ? 'text-muted' : LV_TEXT[levelOf(v)])}>
                    {v === null ? '-' : `%${v}`}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Spark vals={d.genel} c={d.renk} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg">%{d.genelOran}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    ))}
  </section>
);
