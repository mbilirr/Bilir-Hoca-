// ============================================================================
// Aşama 135: TEK SAYFA DENEME SONUÇ KARNESİ — PDF çizimi (A4 dikey, sabit yerleşim)
// karnePdf.ts 'tekSayfa' bloğunu buraya verir. Tablo kütüphanesi kullanılmaz; her şey doğrudan
// çizilir (öğrenci başına birkaç ms). Kazanım listesi soru sayısına göre satır yüksekliğini ayarlar,
// böylece karne her zaman tek sayfaya sığar.
// ============================================================================
import type { jsPDF } from 'jspdf';
import type { KurumBrand } from '../kurumBrand';
import type { KurumRenk } from '../kurumRenk';
import { TEK_KACAN_ORAN, type TekDers, type TekSayfaData } from './tekSayfaKarne';

type RGB = [number, number, number];
const FG: RGB = [15, 23, 42];
const FG2: RGB = [51, 65, 85];
const MUTED: RGB = [100, 116, 139];
const SUBTLE: RGB = [148, 163, 184];
const LINE: RGB = [227, 230, 238];
const BG2: RGB = [245, 246, 250];
const OK: RGB = [5, 150, 105];
const BAD: RGB = [220, 38, 38];
const WARN: RGB = [217, 119, 6];
const INFO: RGB = [37, 99, 235];
const EMPTY: RGB = [203, 213, 225];
const BAD_SOFT: RGB = [253, 236, 236];
const KURUM_GRI: RGB = [203, 213, 225];
const TREND: RGB = [15, 118, 110];

const fmt2 = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? '-' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (v: number) => {
  const s = v.toFixed(v < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
};
const dateTr = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const mix = (c: RGB, w: number): RGB => [Math.round(c[0] + (255 - c[0]) * w), Math.round(c[1] + (255 - c[1]) * w), Math.round(c[2] + (255 - c[2]) * w)];
const rateColor = (r: number): RGB => (r >= 70 ? OK : r >= 50 ? INFO : r >= 30 ? WARN : BAD);

export function drawTekSayfa(doc: jsPDF, F: string, t: (s: unknown) => string, d: TekSayfaData, brand: KurumBrand, footer: string, kRenk: KurumRenk | null = null): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 7.5;
  const CW = W - 2 * M;
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (size: number, bold = false) => {
    doc.setFont(F, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const text = (s: string, x: number, y: number, opt?: { align?: 'left' | 'center' | 'right' }) => doc.text(t(s), x, y, opt);
  /** Sığmayan yazıyı "…" ile kısaltır (yazı tipi ve boyutu önceden seçilmiş olmalı) */
  const fit = (s: string, maxW: number) => {
    const v = t(s);
    if (doc.getTextWidth(v) <= maxW) return v;
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (doc.getTextWidth(`${v.slice(0, mid)}…`) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return `${v.slice(0, lo).trimEnd()}…`;
  };
  const card = (x: number, y: number, w: number, h: number, title?: string, right?: string) => {
    doc.setLineWidth(0.2);
    draw(LINE);
    fill([255, 255, 255]);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    if (!title) return y;
    fill(BG2);
    doc.roundedRect(x + 0.1, y + 0.1, w - 0.2, 6, 2, 2, 'F');
    doc.rect(x + 0.1, y + 3, w - 0.2, 3.1, 'F');
    draw(LINE);
    doc.line(x, y + 6.1, x + w, y + 6.1);
    font(7.2, true);
    ink(FG);
    text(title, x + 2.6, y + 4.2);
    if (right) {
      font(5.8);
      ink(MUTED);
      text(right, x + w - 2.6, y + 4.1, { align: 'right' });
    }
    return y + 6.1;
  };
  // Aşama 135: logo varsa üst şerit logonun canlı renkleri (mavi/mor değil); yoksa ders renkleri
  const colors: RGB[] = kRenk ? (kRenk.vurgu2.join() === kRenk.vurgu.join() ? [kRenk.vurgu] : [kRenk.vurgu, kRenk.vurgu2]) : d.dersler.map((x) => x.color);

  // ------------------------------------------------------------------ 1. Başlık
  let y = 7;
  const hh = 25;
  card(M, y, CW, hh);
  const sw = (CW - 4) / Math.max(1, colors.length);
  colors.forEach((c, i) => {
    fill(c);
    doc.rect(M + 2 + i * sw, y, sw + 0.05, 1.3, 'F');
  });
  const lx = M + 3.5;
  const ly = y + 4.2;
  let logoOk = false;
  if (brand.logo) {
    try {
      const pr = doc.getImageProperties(brand.logo);
      const ratio = pr && pr.height ? pr.width / pr.height : 1;
      let lw = 17;
      let lh = 17 / ratio;
      if (lh > 17) {
        lh = 17;
        lw = 17 * ratio;
      }
      doc.addImage(brand.logo, brand.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', lx + (17 - lw) / 2, ly + (17 - lh) / 2, lw, lh, 'kurum-logo', 'FAST');
      logoOk = true;
    } catch {
      logoOk = false;
    }
  }
  if (!logoOk) {
    fill(BG2);
    draw(LINE);
    doc.roundedRect(lx, ly, 17, 17, 2.2, 2.2, 'FD');
    const ini = (brand.name || 'Karne')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
      .join('');
    font(10, true);
    ink(MUTED);
    text(ini, lx + 8.5, ly + 10.3, { align: 'center' });
  }
  const tx = lx + 21;
  const stuW = 58;
  const titleMax = CW - (tx - M) - stuW - 8;
  if (brand.name) {
    font(7, true);
    ink(MUTED);
    doc.text(fit(brand.name.toLocaleUpperCase('tr-TR'), titleMax), tx, y + 7.8);
  }
  font(13.5, true);
  ink(FG);
  doc.text(fit(d.title, titleMax), tx, y + 14); // Aşama 135: ör. "Hız Denemesi Karnesi"
  // çipler
  font(6.2, true);
  let cx = tx;
  for (const c of [d.examName, d.publisher, dateTr(d.examDate), d.booklet ? `${d.booklet} kitapçığı` : ''].filter(Boolean)) {
    const label = fit(c, 60);
    const cw = doc.getTextWidth(label) + 4.4;
    if (cx + cw > tx + titleMax) break;
    fill(BG2);
    draw(LINE);
    doc.roundedRect(cx, y + 16.6, cw, 4.6, 2.3, 2.3, 'FD');
    ink(FG2);
    doc.text(label, cx + 2.2, y + 19.75);
    cx += cw + 1.4;
  }
  // öğrenci kutusu
  const sx = M + CW - stuW - 3.5;
  fill(BG2);
  draw(LINE);
  doc.roundedRect(sx, ly, stuW, 17, 2, 2, 'FD');
  font(5.6, true);
  ink(MUTED);
  text('ÖĞRENCİ', sx + 3, ly + 4.2);
  font(10.5, true);
  ink(FG);
  doc.text(fit(d.studentName, stuW - 6), sx + 3, ly + 9.6);
  font(6.6);
  ink(FG2);
  const meta = [d.className ? `Sınıf ${d.className}` : '', d.studentNo ? `No ${d.studentNo}` : ''].filter(Boolean).join('   ');
  doc.text(fit(meta, stuW - 6), sx + 3, ly + 14);
  y += hh + 2.5;

  // ------------------------------------------------------------------ 2. Bilgi kutuları
  const kh = 18;
  const ratios = [1.25, 1, 1.35, 1, 1];
  const gap = 2;
  const unit = (CW - gap * (ratios.length - 1)) / ratios.reduce((a, b) => a + b, 0);
  let kx = M;
  const kpi = (i: number, label: string, drawValue: (x: number, yy: number, w: number) => void, sub: string, subTone?: RGB, subPrefix?: string) => {
    const w = ratios[i] * unit;
    card(kx, y, w, kh);
    font(5.8, true);
    ink(MUTED);
    text(label.toLocaleUpperCase('tr-TR'), kx + 2.6, y + 4.3);
    drawValue(kx + 2.6, y + 11.6, w);
    font(5.9);
    ink(FG2);
    if (subPrefix) {
      text(subPrefix, kx + 2.6, y + 15.6);
      const pw = doc.getTextWidth(t(subPrefix));
      font(5.9, true);
      ink(subTone || FG2);
      text(sub, kx + 2.6 + pw + 0.8, y + 15.6);
    } else doc.text(fit(sub, w - 5), kx + 2.6, y + 15.6);
    kx += w + gap;
  };
  const big = (v: string, size: number, c: RGB, suffix?: string) => (x: number, yy: number) => {
    font(size, true);
    ink(c);
    text(v, x, yy);
    if (suffix) {
      const vw = doc.getTextWidth(t(v));
      font(8, true);
      ink(MUTED);
      text(suffix, x + vw + 0.8, yy);
    }
  };
  const dlt = d.score !== null && d.prevScore !== null ? Math.round((d.score - d.prevScore) * 100) / 100 : null;
  kpi(
    0,
    'LGS puanı',
    big(fmt2(d.score), 16, FG),
    dlt === null ? 'İlk deneme' : `${dlt >= 0 ? '+' : '-'}${fmt2(Math.abs(dlt))}`,
    dlt === null ? FG2 : dlt >= 0 ? OK : BAD,
    dlt === null ? undefined : 'Önceki denemeye göre'
  );
  kpi(1, 'Toplam net', big(fmt2(d.totalNet), 14, FG), `Kurum ort. ${fmt2(d.kurumTotalNet)}`);
  kpi(
    2,
    'Doğru · Yanlış · Boş',
    (x, yy) => {
      let xx = x;
      for (const [v, c, l] of [
        [d.totals.d, OK, 'D'],
        [d.totals.y, BAD, 'Y'],
        [d.totals.b, MUTED, 'B'],
      ] as Array<[number, RGB, string]>) {
        font(13, true);
        ink(c);
        text(String(v), xx, yy);
        const w = doc.getTextWidth(String(v));
        font(5.6, true);
        text(l, xx + w + 0.4, yy);
        xx += w + 6.5;
      }
    },
    '3 yanlış 1 doğruyu götürür'
  );
  kpi(1 + 2, 'Sınıf sırası', big(d.rank ? String(d.rank.cls) : '-', 14, FG, d.rank ? `/ ${d.rank.clsCount}` : undefined), `Sınıf ort. puan ${fmt2(d.clsAvgScore)}`);
  kpi(4, 'Kurum sırası', big(d.rank ? String(d.rank.overall) : '-', 14, FG, d.rank ? `/ ${d.rank.overallCount}` : undefined), `Kurum ort. puan ${fmt2(d.kurumAvgScore)}`);
  y += kh + 2.5;

  // ------------------------------------------------------------------ 3. Ders tablosu + yüzdelik
  const hasYz = d.yuzdelik.length > 0;
  const yzW = hasYz ? 66 : 0;
  const tW = hasYz ? CW - yzW - 2.4 : CW;
  const rowH = 5.3;
  const tH = 6.1 + 5.2 + (d.dersler.length + 1) * rowH + 0.6;
  let ty = card(M, y, tW, tH, 'Ders sonuçları', 'Sınıf ve kurum ortalaması net olarak');
  // sütunlar: Ders | Soru D Y B Net | Başarı | Sınıf Kurum Fark
  const cols = [
    { k: 'Soru', w: 9 },
    { k: 'D', w: 7 },
    { k: 'Y', w: 7 },
    { k: 'B', w: 7 },
    { k: 'Net', w: 11 },
    { k: 'Başarı', w: 23 },
    { k: 'Sınıf ort.', w: 14 },
    { k: 'Kurum ort.', w: 15 },
    { k: 'Fark', w: 11 },
  ];
  const fixedW = cols.reduce((a, c) => a + c.w, 0);
  const nameW = tW - fixedW - 3;
  const colX: number[] = [];
  let ccx = M + 2.6 + nameW;
  for (const c of cols) {
    colX.push(ccx + c.w / 2);
    ccx += c.w;
  }
  font(5.6, true);
  ink(MUTED);
  text('DERS', M + 2.6, ty + 3.6);
  cols.forEach((c, i) => text(c.k.toLocaleUpperCase('tr-TR'), colX[i], ty + 3.6, { align: 'center' }));
  ty += 5.2;
  draw(LINE);
  doc.line(M, ty, M + tW, ty);
  const rowFn = (r: { label: string; color?: RGB; count: number; d: number; y: number; b: number; net: number | null; rate: number; cls: number | null; kur: number | null }, total: boolean) => {
    if (total) {
      fill(BG2);
      doc.rect(M + 0.1, ty, tW - 0.2, rowH, 'F');
    }
    const by = ty + rowH / 2 + 1.1;
    if (r.color) {
      fill(r.color);
      doc.roundedRect(M + 2.6, ty + 1.2, 1.4, rowH - 2.4, 0.5, 0.5, 'F');
    }
    font(6.8, true);
    ink(FG);
    doc.text(fit(r.label, nameW - 4), M + (r.color ? 5.2 : 2.6), by);
    font(6.8, total);
    ink(FG2);
    text(String(r.count), colX[0], by, { align: 'center' });
    ink(OK);
    font(6.8, true);
    text(String(r.d), colX[1], by, { align: 'center' });
    ink(BAD);
    text(String(r.y), colX[2], by, { align: 'center' });
    ink(MUTED);
    font(6.8, total);
    text(String(r.b), colX[3], by, { align: 'center' });
    ink(FG);
    font(6.8, true);
    text(fmt2(r.net), colX[4], by, { align: 'center' });
    // başarı çubuğu
    const bx = colX[5] - cols[5].w / 2 + 1;
    if (!total) {
      fill(LINE);
      doc.roundedRect(bx, ty + rowH / 2 - 0.75, 11, 1.5, 0.7, 0.7, 'F');
      fill(rateColor(r.rate));
      if (r.rate > 0) doc.roundedRect(bx, ty + rowH / 2 - 0.75, Math.max(1.4, (11 * r.rate) / 100), 1.5, 0.7, 0.7, 'F');
      ink(FG2);
      text(`%${r.rate}`, bx + 20.5, by, { align: 'right' });
    } else {
      ink(FG);
      text(`%${r.rate}`, colX[5], by, { align: 'center' });
    }
    font(6.8, total);
    ink(FG2);
    text(fmt2(r.cls), colX[6], by, { align: 'center' });
    text(fmt2(r.kur), colX[7], by, { align: 'center' });
    if (r.net !== null && r.kur !== null) {
      const f = Math.round((r.net - r.kur) * 100) / 100;
      font(6.8, true);
      ink(f >= 0 ? OK : BAD);
      text(`${f >= 0 ? '+' : '-'}${fmt2(Math.abs(f))}`, colX[8], by, { align: 'center' });
    } else text('-', colX[8], by, { align: 'center' });
    ty += rowH;
    if (!total) {
      draw(LINE);
      doc.line(M, ty, M + tW, ty);
    }
  };
  d.dersler.forEach((x) => rowFn({ label: x.short, color: x.color, count: x.count, d: x.d, y: x.y, b: x.b, net: x.net, rate: x.rate, cls: x.clsAvgNet, kur: x.kurumAvgNet }, false));
  rowFn(
    {
      label: 'Toplam',
      count: d.totals.count,
      d: d.totals.d,
      y: d.totals.y,
      b: d.totals.b,
      net: d.totalNet,
      rate: d.totals.count ? Math.round((d.totals.d / d.totals.count) * 100) : 0,
      cls: d.clsTotalNet,
      kur: d.kurumTotalNet,
    },
    true
  );

  if (hasYz) {
    const yx = M + tW + 2.4;
    let yy = card(yx, y, yzW, tH, 'Son 3 yılda yüzdelik dilim', 'Türkiye geneli') + 3;
    const gx = yx + 14;
    const gw = yzW - 14 - 18;
    const span = Math.min(8.2, (tH - 6.1 - 3 - 15) / Math.max(1, d.yuzdelik.length));
    const pos = (v: number) => Math.min(1, Math.max(0, (Math.log10(Math.max(0.01, v)) + 2) / 4));
    const stops: RGB[] = [
      [5, 150, 105],
      [34, 197, 94],
      [132, 204, 22],
      [234, 179, 8],
      [249, 115, 22],
      [239, 68, 68],
    ];
    for (const p of d.yuzdelik) {
      font(7.6, true);
      ink(FG);
      text(String(p.year), yx + 2.6, yy + 3.3);
      // renk çubuğu (soldan iyi → sağa geride)
      const n = 40;
      for (let i = 0; i < n; i++) {
        const f = (i / (n - 1)) * (stops.length - 1);
        const a = stops[Math.floor(f)];
        const b = stops[Math.min(stops.length - 1, Math.floor(f) + 1)];
        const r = f - Math.floor(f);
        fill([Math.round(a[0] + (b[0] - a[0]) * r), Math.round(a[1] + (b[1] - a[1]) * r), Math.round(a[2] + (b[2] - a[2]) * r)]);
        doc.rect(gx + (gw * i) / n, yy + 1.4, gw / n + 0.05, 2.6, 'F');
      }
      const px = gx + gw * pos(p.value);
      fill([255, 255, 255]);
      draw(FG);
      doc.setLineWidth(0.4);
      doc.roundedRect(px - 1.1, yy + 0.4, 2.2, 4.6, 1, 1, 'FD');
      doc.setLineWidth(0.2);
      font(10.5, true);
      ink(FG);
      text(`${p.below ? '> ' : ''}%${fmtPct(p.value)}`, yx + yzW - 2.6, yy + 4.1, { align: 'right' });
      yy += span;
    }
    font(5, true);
    ink(MUTED);
    ['%0,01', '%0,1', '%1', '%10', '%100'].forEach((l, i) => text(l, gx + (gw * i) / 4, yy + 0.8, { align: i === 0 ? 'left' : i === 4 ? 'right' : 'center' }));
    yy += 2.4;
    draw([207, 213, 226]);
    doc.setLineDashPattern([0.8, 0.6], 0);
    doc.line(yx + 2.6, yy, yx + yzW - 2.6, yy);
    doc.setLineDashPattern([], 0);
    font(5.3);
    ink(MUTED);
    const note = doc.splitTextToSize(
      t('Bu puanın geçmiş LGS yıllarındaki Türkiye geneli yaklaşık karşılığıdır. MEB okul taban puanı–yüzdelik verilerinden hesaplanır. Küçük yüzde daha iyi dilimdir.'),
      yzW - 5.2
    ) as string[];
    doc.text(note.slice(0, 3), yx + 2.6, yy + 2.6, { lineHeightFactor: 1.3 });
  }
  y += tH + 2.5;

  // ------------------------------------------------------------------ 4. Grafikler + değerlendirme
  const gH = 37;
  const evW = 58;
  const chW = (CW - evW - 4.8) / 2;
  const legend = (x: number, yy: number, items: Array<[string, RGB | RGB[]]>) => {
    font(5.4, true);
    let lx2 = x;
    for (const [l, c] of items.slice().reverse()) {
      const w = doc.getTextWidth(t(l));
      lx2 -= w;
      ink(FG2);
      text(l, lx2, yy);
      lx2 -= 3;
      const cs = Array.isArray(c[0]) ? (c as RGB[]) : [c as RGB];
      cs.forEach((cc, i) => {
        fill(cc);
        doc.rect(lx2 + (2.2 * i) / cs.length, yy - 2, 2.2 / cs.length + 0.02, 2.2, 'F');
      });
      lx2 -= 2.6;
    }
  };
  // 4a. ders netleri
  {
    const x0 = M;
    const top = card(x0, y, chW, gH, 'Ders netleri');
    legend(x0 + chW - 2.6, y + 4.1, [
      ['Öğrenci', colors.slice(0, 3)],
      ['Sınıf', colors.slice(0, 3).map((c) => mix(c, 0.6))],
      ['Kurum', KURUM_GRI],
    ]);
    const pl = x0 + 7;
    const pr = x0 + chW - 2;
    const pt = top + 4;
    const pb = y + gH - 5;
    const maxV = Math.max(5, ...d.dersler.map((s) => Math.max(s.count, 0)));
    const step = maxV > 20 ? 10 : 5;
    const top2 = Math.ceil(maxV / step) * step;
    font(4.8);
    for (let v = 0; v <= top2; v += step) {
      const yy = pb - ((pb - pt) * v) / top2;
      draw([238, 240, 244]);
      doc.line(pl, yy, pr, yy);
      ink(SUBTLE);
      text(String(v), pl - 1, yy + 0.8, { align: 'right' });
    }
    const g = (pr - pl) / Math.max(1, d.dersler.length);
    d.dersler.forEach((s, i) => {
      const bw = (g * 0.72) / 3;
      const bx = pl + i * g + g * 0.14;
      const vals: Array<[number | null, RGB]> = [
        [s.net, s.color],
        [s.clsAvgNet, mix(s.color, 0.6)],
        [s.kurumAvgNet, KURUM_GRI],
      ];
      vals.forEach(([v, c], k) => {
        if (v === null) return;
        const h = ((pb - pt) * Math.max(0, v)) / top2;
        fill(c);
        doc.rect(bx + k * bw, pb - h, bw - 0.3, Math.max(0.2, h), 'F');
      });
      font(4.6, true);
      ink(s.color);
      text(fmt1(s.net), bx + bw / 2, pb - ((pb - pt) * Math.max(0, s.net)) / top2 - 0.8, { align: 'center' });
      font(4.9, true);
      ink(FG2);
      doc.text(fit(s.short.replace(' Tarihi', '').replace(' Bilimleri', '').replace(' Kültürü', ''), g - 1), pl + i * g + g / 2, pb + 3.3, { align: 'center' });
    });
  }
  // 4b. puan gelişimi
  {
    const x0 = M + chW + 2.4;
    const top = card(x0, y, chW, gH, 'Puan gelişimi');
    legend(x0 + chW - 2.6, y + 4.1, [
      ['Öğrenci', TREND],
      ['Kurum ort.', KURUM_GRI],
    ]);
    const pts = d.gelisim;
    const vals = pts.flatMap((p) => [p.score, p.kurum]).filter((v): v is number => v !== null);
    const pl = x0 + 10;
    const pr = x0 + chW - 6;
    const pt = top + 5;
    const pb = y + gH - 5;
    if (vals.length) {
      let mn = Math.floor((Math.min(...vals) - 10) / 10) * 10;
      let mx = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
      mn = Math.max(100, mn);
      mx = Math.min(500, Math.max(mx, mn + 20));
      const st = Math.max(10, Math.round((mx - mn) / 4 / 10) * 10);
      const Y = (v: number) => pb - ((pb - pt) * (v - mn)) / (mx - mn);
      const X = (i: number) => (pts.length === 1 ? (pl + pr) / 2 : pl + ((pr - pl) * i) / (pts.length - 1));
      font(4.8);
      for (let v = mn; v <= mx; v += st) {
        draw([238, 240, 244]);
        doc.line(pl, Y(v), pr + 3, Y(v));
        ink(SUBTLE);
        text(String(v), pl - 1.5, Y(v) + 0.8, { align: 'right' });
      }
      // kurum ortalaması (kesik çizgi)
      draw(KURUM_GRI);
      doc.setLineWidth(0.45);
      doc.setLineDashPattern([1, 0.7], 0);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1].kurum;
        const b = pts[i].kurum;
        if (a !== null && b !== null) doc.line(X(i - 1), Y(a), X(i), Y(b));
      }
      doc.setLineDashPattern([], 0);
      draw(TREND);
      doc.setLineWidth(0.6);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1].score;
        const b = pts[i].score;
        if (a !== null && b !== null) doc.line(X(i - 1), Y(a), X(i), Y(b));
      }
      doc.setLineWidth(0.2);
      pts.forEach((p, i) => {
        const last = i === pts.length - 1;
        if (p.score !== null) {
          fill(last ? TREND : [255, 255, 255]);
          draw(TREND);
          doc.setLineWidth(0.35);
          doc.circle(X(i), Y(p.score), last ? 0.95 : 0.7, 'FD');
          doc.setLineWidth(0.2);
          font(4.7, true);
          ink(TREND);
          text(fmt1(p.score), X(i), Y(p.score) - 1.6, { align: 'center' });
        }
        font(4.7, true);
        ink(FG2);
        doc.text(fit(p.name, (pr - pl) / Math.max(1, pts.length - 1) - 1), X(i), pb + 3.3, { align: 'center' });
      });
    }
  }
  // 4c. değerlendirme
  {
    const x0 = M + 2 * chW + 4.8;
    let yy = card(x0, y, evW, gH, 'Değerlendirme') + 3.6;
    const toneC: Record<string, RGB> = { success: OK, danger: BAD, warning: WARN, info: [51, 65, 85] };
    for (const it of d.degerlendirme.slice(0, 4)) {
      fill(toneC[it.tone]);
      doc.circle(x0 + 3.2, yy - 0.8, 0.7, 'F');
      font(5.9, true);
      ink(FG);
      const lw = doc.getTextWidth(t(it.label));
      const maxW = evW - 8;
      // ilk satır etiketin yanında, kalanı alt satırlarda
      font(5.9);
      const words = t(it.text).split(' ');
      const lines: string[] = [];
      let cur = '';
      let avail = maxW - lw - 1;
      for (const w of words) {
        const nx = cur ? `${cur} ${w}` : w;
        if (doc.getTextWidth(nx) > avail && cur) {
          lines.push(cur);
          cur = w;
          avail = maxW;
        } else cur = nx;
      }
      if (cur) lines.push(cur);
      font(5.9, true);
      ink(FG);
      text(it.label, x0 + 5, yy);
      font(5.9);
      ink(FG2);
      lines.slice(0, 3).forEach((l, i) => doc.text(l, x0 + 5 + (i === 0 ? lw + 1 : 0), yy + i * 2.6));
      yy += Math.min(3, lines.length) * 2.6 + 1.6;
      if (yy > y + gH - 2) break;
    }
  }
  y += gH + 2.5;

  // ------------------------------------------------------------------ 5. Soru-kazanım listesi (3 sütun)
  const footY = H - 5.5;
  const areaBottom = footY - 4;
  const colN = 3;
  const colGap = 2.4;
  const colW = (CW - colGap * (colN - 1)) / colN;
  const ORDER = ['tr', 'mat', 'fen', 'sos', 'din', 'ing'];
  const ordered = d.dersler.slice().sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const cols3: TekDers[][] = [[], [], []];
  const load = [0, 0, 0];
  for (const s of ordered) {
    const i = load.indexOf(Math.min(...load));
    cols3[i].push(s);
    load[i] += s.sorular.length;
  }
  const HEAD = 5.2;
  const SUBHEAD = 3.4;
  const SEC_GAP = 1.6;
  const need = cols3.map((c) => ({ rows: c.reduce((a, s) => a + s.sorular.length, 0), secs: c.length }));
  const avail = areaBottom - y;
  const qH = Math.max(1.6, Math.min(4.1, Math.min(...need.filter((n) => n.rows).map((n) => (avail - n.secs * (HEAD + SUBHEAD) - Math.max(0, n.secs - 1) * SEC_GAP - 0.4) / n.rows))));
  const fs = Math.max(3.6, Math.min(6.2, qH * 1.52));
  cols3.forEach((list, ci) => {
    const x0 = M + ci * (colW + colGap);
    let yy = y;
    for (const s of list) {
      const secH = HEAD + SUBHEAD + s.sorular.length * qH;
      fill([255, 255, 255]);
      draw(LINE);
      doc.roundedRect(x0, yy, colW, secH, 1.6, 1.6, 'FD');
      fill(s.color);
      doc.roundedRect(x0, yy, colW, HEAD, 1.6, 1.6, 'F');
      doc.rect(x0, yy + 2, colW, HEAD - 2, 'F');
      font(6.4, true);
      ink([255, 255, 255]);
      const right = `D ${s.d} · Y ${s.y} · B ${s.b} · Net ${fmt2(s.net)}`;
      font(5.4, true);
      const rw = doc.getTextWidth(t(right));
      text(right, x0 + colW - 2, yy + 3.55, { align: 'right' });
      font(6.4, true);
      doc.text(fit(s.short, colW - rw - 6), x0 + 2, yy + 3.6);
      yy += HEAD;
      fill(BG2);
      doc.rect(x0 + 0.1, yy, colW - 0.2, SUBHEAD, 'F');
      const cNo = x0 + 2.6;
      const cO = x0 + 6.4;
      const cC = x0 + 9.6;
      const cM = x0 + 13;
      const cK = x0 + 15.4;
      const cP = x0 + colW - 1.6;
      font(4.6, true);
      ink(MUTED);
      text('NO', cNo, yy + 2.4, { align: 'center' });
      text('Ö', cO, yy + 2.4, { align: 'center' });
      text('C', cC, yy + 2.4, { align: 'center' });
      text('KAZANIM', cK, yy + 2.4);
      text('K%', cP, yy + 2.4, { align: 'right' });
      yy += SUBHEAD;
      const kazW = cP - 6.5 - cK;
      for (const q of s.sorular) {
        if (q.mark === 'Y') {
          fill(BAD_SOFT);
          doc.rect(x0 + 0.1, yy, colW - 0.2, qH, 'F');
        } else if (q.mark === 'B') {
          fill([248, 250, 252]);
          doc.rect(x0 + 0.1, yy, colW - 0.2, qH, 'F');
        }
        const by = yy + qH / 2 + fs * 0.12;
        font(fs, true);
        ink(MUTED);
        text(String(q.no), cNo, by, { align: 'center' });
        ink(q.mark === 'Y' ? BAD : FG2);
        text(q.key === 'X' ? '-' : q.given || '·', cO, by, { align: 'center' });
        ink(FG2);
        text(q.key === 'X' ? 'İ' : q.key || '-', cC, by, { align: 'center' });
        // durum işareti
        const r = Math.min(1.25, qH * 0.36);
        const mx = cM;
        const my = yy + qH / 2;
        fill(q.mark === 'D' ? OK : q.mark === 'Y' ? BAD : EMPTY);
        doc.circle(mx, my, r, 'F');
        doc.setLineWidth(Math.max(0.18, r * 0.24));
        draw(q.mark === 'B' ? [71, 85, 105] : [255, 255, 255]);
        if (q.mark === 'D') {
          doc.line(mx - r * 0.5, my + r * 0.02, mx - r * 0.12, my + r * 0.42);
          doc.line(mx - r * 0.12, my + r * 0.42, mx + r * 0.55, my - r * 0.4);
        } else if (q.mark === 'Y') {
          doc.line(mx - r * 0.42, my - r * 0.42, mx + r * 0.42, my + r * 0.42);
          doc.line(mx - r * 0.42, my + r * 0.42, mx + r * 0.42, my - r * 0.42);
        } else doc.line(mx - r * 0.45, my, mx + r * 0.45, my);
        doc.setLineWidth(0.2);
        let kx2 = cK;
        if (q.kacan) {
          fill(WARN);
          doc.circle(kx2 + 0.6, my, 0.55, 'F');
          kx2 += 1.8;
        }
        font(fs);
        ink(q.kazanim === 'Kazanım eklenmemiş' ? SUBTLE : FG2);
        doc.text(fit(q.kazanim, kazW - (kx2 - cK)), kx2, by);
        ink(MUTED);
        text(q.kurumRate === null ? '-' : String(q.kurumRate), cP, by, { align: 'right' });
        yy += qH;
        draw([238, 240, 244]);
        doc.line(x0 + 0.3, yy, x0 + colW - 0.3, yy);
      }
      yy += SEC_GAP;
    }
  });

  // ------------------------------------------------------------------ 6. Alt bilgi
  draw(LINE);
  doc.line(M, footY - 2.6, M + CW, footY - 2.6);
  let fx = M;
  const legendMark = (c: RGB, label: string) => {
    fill(c);
    doc.circle(fx + 1.1, footY - 0.7, 1.05, 'F');
    font(5.5);
    ink(FG2);
    text(label, fx + 2.8, footY);
    fx += 2.8 + doc.getTextWidth(t(label)) + 2.6;
  };
  legendMark(OK, 'Doğru');
  legendMark(BAD, 'Yanlış');
  legendMark(EMPTY, 'Boş');
  legendMark(WARN, `Kurumun %${TEK_KACAN_ORAN}'ından fazlasının doğru yaptığı, kaçırılan soru`);
  font(5.5);
  ink(MUTED);
  text('Ö: öğrenci cevabı · C: doğru cevap · K%: kurumda doğru yapanlar', fx, footY);
  const today = new Date().toLocaleDateString('tr-TR');
  doc.text(fit(`${footer} · ${today}`, 48), M + CW, footY, { align: 'right' });
}
