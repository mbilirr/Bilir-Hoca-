// ============================================================================
// Aşama 141: BİRLEŞTİRİLMİŞ KARNE — B TASARIMI (PDF çizimleri)
// 1) Konu ve kazanım analizi: iki sütunlu ders kartları (bu deneme + seçilen denemelerin toplamı, tek bölüm)
// 2) Deneme gelişimi panosu: puan grafiği, özet kutular, deneme kartları, ders neti küçük grafikleri, net tablosu
// 3) Konu ısı tablosu: renkli daireler, gidişat çizgisi
// karnePdf.ts çizim döngüsü bu işlevleri çağırır; y imleci bağlam nesnesinde taşınır.
// ============================================================================
import type { jsPDF } from 'jspdf';
import { LEVEL_INFO, levelOf, type Level } from './analiz';
import type { BirlesikDers, BirlesikSatir } from './kazanimBirlesik';

type RGB = [number, number, number];
export interface PdfCtx {
  doc: jsPDF;
  F: string;
  t: (s: unknown) => string;
  W: number;
  H: number;
  M: number;
  TOP: number;
  y: number;
  /** vurgu rengi: kurum logosunun ana rengi (logo yoksa turuncu) */
  vurgu: RGB;
}

export interface GelisimPanoData {
  denemeler: Array<{ ad: string; kisa: string; tarih: string; puan: number | null; sinifOrt: number | null; sinifSira: string; kurumSira: string; toplamNet: number | null; netler: Array<string> }>;
  hedef: number | null;
  ortalama: number | null;
  dersler: Array<{ ad: string; kisa: string; renk: RGB; soru: number; netler: Array<number | null>; sinifNetler: Array<number | null> }>;
}
export interface IsiNoktaData {
  denemeler: Array<{ no: number; tarih: string }>;
  dersler: Array<{ ad: string; renk: RGB; genelOran: number; satirlar: Array<{ ad: string; hucre: Array<number | null>; genel: number }>; genel: Array<number | null> }>;
}

const FG: RGB = [17, 24, 39];
const FG2: RGB = [55, 65, 81];
const MUTED: RGB = [107, 114, 128];
const SOFT: RGB = [156, 163, 175];
const LINE: RGB = [229, 231, 235];
const TRACK: RGB = [241, 242, 244];
const OK: RGB = [22, 163, 74];
const BAD: RGB = [220, 38, 38];
const SINIF: RGB = [148, 163, 184];
const LV_FILL: Record<Level, RGB> = { iyi: [220, 252, 231], tekrar: [219, 234, 254], etut: [254, 237, 213], kritik: [254, 226, 226] };
const LV_TEXT: Record<Level, RGB> = { iyi: [21, 128, 61], tekrar: [29, 78, 216], etut: [180, 83, 9], kritik: [185, 28, 28] };
const lvRgb = (r: number) => LEVEL_INFO[levelOf(r)].rgb;
const tint = (c: RGB, k: number): RGB => [Math.round(255 - (255 - c[0]) * k), Math.round(255 - (255 - c[1]) * k), Math.round(255 - (255 - c[2]) * k)];
const fmt1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : (Math.round(v * 10) / 10).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmt2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : (Math.round(v * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const LIMIT = 16; // sayfa altı payı (alt yazı)

function tools(c: PdfCtx) {
  const { doc, F, t } = c;
  const fill = (k: RGB) => doc.setFillColor(k[0], k[1], k[2]);
  const draw = (k: RGB) => doc.setDrawColor(k[0], k[1], k[2]);
  const ink = (k: RGB) => doc.setTextColor(k[0], k[1], k[2]);
  const font = (size: number, bold = false) => {
    doc.setFont(F, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const text = (s: string | string[], x: number, y: number, o?: { align?: 'left' | 'center' | 'right' }) => doc.text(Array.isArray(s) ? s.map(t) : t(s), x, y, o);
  const fit = (s: string, w: number) => {
    const v = t(s);
    if (doc.getTextWidth(v) <= w) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.getTextWidth(t(s.slice(0, mid)) + '…') <= w) lo = mid;
      else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + '…';
  };
  const lines = (s: string, w: number, max: number) => {
    const ls = doc.splitTextToSize(t(s), w) as string[];
    if (ls.length <= max) return ls;
    const out = ls.slice(0, max);
    out[max - 1] = fit(ls.slice(max - 1).join(' '), w);
    return out;
  };
  const newPage = () => {
    doc.addPage();
    c.y = c.TOP;
  };
  const ensure = (need: number) => {
    if (c.y + need > c.H - LIMIT) newPage();
  };
  /** yuvarlak uçlu yay (halka göstergesi) */
  const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 24)));
    let px = cx + r * Math.cos(from);
    let py = cy + r * Math.sin(from);
    for (let i = 1; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      doc.line(px, py, x, y);
      px = x;
      py = y;
    }
  };
  return { fill, draw, ink, font, text, fit, lines, ensure, newPage, arc };
}

// =============================================================================== 1) Kazanım kartları
const LEGEND_LV: Level[] = ['iyi', 'tekrar', 'etut', 'kritik'];
const LV_RANGE: Record<Level, string> = { iyi: '%70+', tekrar: '%50-69', etut: '%30-49', kritik: '%30 altı' };

export function drawKazanimKart(c: PdfCtx, dersler: BirlesikDers[], n: number): void {
  const { doc } = c;
  const T = tools(c);
  const GAP = 3.4;
  const cw = (c.W - 2 * c.M - GAP) / 2;
  const PAD = 3;
  const PCT_W = 9;
  const BAR_W = 25;
  const labelW = cw - PAD * 2 - 3.2 - BAR_W - PCT_W - 4;
  const ikiSeri = dersler.some((d) => d.satirlar.some((s) => s.bu && s.toplam));
  const buVar = dersler.some((d) => d.satirlar.some((s) => s.bu));

  // ---- açıklama ve renk anahtarı
  T.font(7.2);
  const aciklama = ikiSeri
    ? `Her kazanımda kalın çubuk bu denemeyi, ince çubuk seçilen ${n} denemenin toplamını gösterir; siyah çizgi kurumun başarısıdır. Sağdaki büyük sayı bu deneme, küçük sayı ${n} denemedir. Kutular bu denemedeki soru numaralarıdır (yeşil doğru, kırmızı yanlış, gri boş).`
    : buVar
      ? 'Çubuk bu denemedeki başarıyı, siyah çizgi kurumun başarısını gösterir. Kutular bu denemedeki soru numaralarıdır (yeşil doğru, kırmızı yanlış, gri boş).'
      : `Çubuk seçilen ${n} denemedeki toplam başarıyı${dersler.some((d) => d.satirlar.some((s) => s.kurumRate !== null)) ? ', siyah çizgi kurumun başarısını' : ''} gösterir.`;
  const al = T.lines(aciklama, c.W - 2 * c.M, 3);
  T.ensure(al.length * 3.3 + 8 + 40);
  T.ink(MUTED);
  T.text(al, c.M, c.y + 2.6);
  c.y += al.length * 3.3 + 1.6;
  let lx = c.M;
  T.font(6.8);
  for (const k of LEGEND_LV) {
    T.fill(LEVEL_INFO[k].rgb);
    doc.circle(lx + 1.2, c.y + 1.6, 1.1, 'F');
    T.ink(FG2);
    const s = `${LEVEL_INFO[k].label} ${LV_RANGE[k]}`;
    T.text(s, lx + 3.2, c.y + 2.6);
    lx += 6 + doc.getTextWidth(c.t(s));
  }
  T.fill(FG);
  doc.rect(c.W - c.M - 14, c.y + 0.2, 0.5, 3, 'F');
  T.ink(FG2);
  T.text('Kurum', c.W - c.M, c.y + 2.6, { align: 'right' });
  c.y += 6;

  // ---- ölçüm
  const HEAD = 19;
  const rowH = (s: BirlesikSatir) => {
    T.font(6.9);
    const nl = T.lines(s.konu, labelW, 2).length;
    const alt = s.altlar.length ? 1 : 0;
    const q = s.bu && s.bu.sorular.length ? 1 : 0;
    return Math.max(6.6, 1.9 + nl * 2.75 + alt * 2.5 + q * 3.3 + 0.9);
  };

  const drawCard = (d: BirlesikDers, rows: BirlesikSatir[], devam: boolean, x: number, y0: number, h: number) => {
    // kart zemini ve ders şeridi
    T.fill([255, 255, 255]);
    T.draw(LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y0, cw, h, 2.2, 2.2, 'FD');
    T.fill(d.renk);
    doc.roundedRect(x, y0, cw, 2.2, 1.1, 1.1, 'F');
    T.fill([255, 255, 255]);
    doc.rect(x + 0.15, y0 + 1.2, cw - 0.3, 1.1, 'F');
    T.fill(d.renk);
    doc.rect(x + 1, y0, cw - 2, 1.1, 'F');
    // halka
    const ringV = d.bu ? d.bu.rate : (d.toplamRate ?? 0);
    const rcx = x + PAD + 6.2;
    const rcy = y0 + 2 + HEAD / 2 - 0.4;
    doc.setLineCap('round');
    doc.setLineWidth(1.5);
    T.draw(tint(d.renk, 0.18));
    doc.circle(rcx, rcy, 5.2, 'S');
    T.draw(d.renk);
    if (ringV > 0) T.arc(rcx, rcy, 5.2, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, ringV)) / 100);
    doc.setLineCap('butt');
    T.font(7.6, true);
    T.ink(FG);
    T.text(`%${ringV}`, rcx, rcy + 1.1, { align: 'center' });
    // ad ve özet
    const tx = x + PAD + 14.4;
    T.font(9.2, true);
    T.ink(d.renk);
    T.text(devam ? `${d.ad} (devam)` : d.ad, tx, y0 + 7.6);
    T.font(6.4);
    T.ink(MUTED);
    if (d.bu) T.text(`D ${d.bu.d} · Y ${d.bu.y} · B ${d.bu.b} · Net ${fmt2(d.bu.net)}`, tx, y0 + 11.4);
    if (d.toplamRate !== null) {
      const s = `${n} denemede `;
      T.text(s, tx, y0 + (d.bu ? 14.9 : 11.4));
      T.font(6.6, true);
      T.ink(FG);
      T.text(`%${d.toplamRate}`, tx + doc.getTextWidth(c.t(s)) + 0.3, y0 + (d.bu ? 14.9 : 11.4));
    }
    // durum çipleri (sağda, en çok iki satır)
    T.font(5.9, true);
    const chips = LEGEND_LV.filter((k) => d.sayilar[k]).map((k) => ({ k, s: `${d.sayilar[k]} ${LEVEL_INFO[k].label.toLocaleLowerCase('tr-TR')}` }));
    let cxr = x + cw - PAD;
    let cy = y0 + 5.2;
    let rowsUsed = 0;
    for (const ch of chips) {
      const w = doc.getTextWidth(c.t(ch.s)) + 3;
      if (cxr - w < x + cw - PAD - 31 && rowsUsed === 0) {
        cxr = x + cw - PAD;
        cy += 4;
        rowsUsed = 1;
      }
      T.fill(LV_FILL[ch.k]);
      doc.roundedRect(cxr - w, cy, w, 3.2, 1.6, 1.6, 'F');
      T.ink(LV_TEXT[ch.k]);
      T.text(ch.s, cxr - w / 2, cy + 2.3, { align: 'center' });
      cxr -= w + 1;
    }
    // satırlar
    let ry = y0 + 2 + HEAD;
    for (const s of rows) {
      const rh = rowH(s);
      T.draw(TRACK);
      doc.setLineWidth(0.15);
      doc.line(x + 0.6, ry, x + cw - 0.6, ry);
      const lx0 = x + PAD;
      T.fill(LEVEL_INFO[s.durum].rgb);
      doc.circle(lx0 + 0.9, ry + 2.3, 0.8, 'F');
      T.font(6.9);
      T.ink(FG2);
      const kl = T.lines(s.konu, labelW, 2);
      T.text(kl, lx0 + 3.2, ry + 3);
      let yy = ry + 3 + kl.length * 2.75;
      if (s.altlar.length) {
        T.font(5.6);
        T.ink(SOFT);
        T.text(T.fit(`Alt: ${s.altlar.map((a) => `${a.ad} %${a.rate}`).join(' · ')}`, labelW), lx0 + 3.2, yy - 0.3);
        yy += 2.6;
      }
      if (s.bu && s.bu.sorular.length) {
        let qx = lx0 + 3.2;
        T.font(4.6, true);
        for (const q of s.bu.sorular) {
          if (qx + 3.1 > lx0 + 3.2 + labelW) break;
          T.fill(q.mark === 'D' ? OK : q.mark === 'Y' ? BAD : [203, 213, 225]);
          doc.roundedRect(qx, yy - 2, 3.1, 2.7, 0.6, 0.6, 'F');
          T.ink([255, 255, 255]);
          T.text(String(q.no), qx + 1.55, yy + 0.05, { align: 'center' });
          qx += 3.5;
        }
      }
      // çubuklar
      const bx = x + cw - PAD - PCT_W - 2 - BAR_W;
      const mid = ry + rh / 2;
      const two = !!(s.bu && s.toplam);
      const ana = s.bu ? s.bu.rate : (s.toplam?.rate ?? 0);
      const by1 = two ? mid - 2 : mid - 1.1;
      const h1 = two ? 1.9 : 2.2;
      T.fill(TRACK);
      doc.roundedRect(bx, by1, BAR_W, h1, h1 / 2, h1 / 2, 'F');
      T.fill(lvRgb(ana));
      doc.roundedRect(bx, by1, Math.max(h1, (BAR_W * Math.min(100, ana)) / 100), h1, h1 / 2, h1 / 2, 'F');
      if (two) {
        const by2 = mid + 0.7;
        T.fill(TRACK);
        doc.roundedRect(bx, by2, BAR_W, 1.2, 0.6, 0.6, 'F');
        T.fill(tint(d.renk, 0.5));
        doc.roundedRect(bx, by2, Math.max(1.2, (BAR_W * Math.min(100, s.toplam!.rate)) / 100), 1.2, 0.6, 0.6, 'F');
      }
      if (s.kurumRate !== null) {
        const mx = bx + (BAR_W * Math.max(0, Math.min(100, s.kurumRate))) / 100;
        T.fill(FG);
        doc.rect(mx - 0.22, (two ? mid - 2 : mid - 1.1) - 0.8, 0.44, two ? 5.7 : 3.8, 'F');
      }
      // yüzdeler
      const px = x + cw - PAD;
      T.font(7.2, true);
      T.ink(LV_TEXT[levelOf(ana)]);
      T.text(`%${ana}`, px, two ? mid - 0.2 : mid + 1.2, { align: 'right' });
      if (two) {
        T.font(5.8);
        T.ink(SOFT);
        T.text(`%${s.toplam!.rate}`, px, mid + 2.6, { align: 'right' });
      }
      ry += rh;
    }
  };

  // ---- iki sütuna yerleşim (kart kısa olan sütuna; sığmazsa yeni sayfa; tam sayfaya da sığmıyorsa bölünür)
  const bottom = () => c.H - LIMIT;
  let colY = [c.y, c.y];
  let pageStart = c.y;
  for (const d of dersler) {
    let rest = d.satirlar.slice();
    let devam = false;
    while (rest.length) {
      const hs = rest.map(rowH);
      const full = 2 + HEAD + hs.reduce((a, b) => a + b, 0) + 1.5;
      let col = colY[0] <= colY[1] ? 0 : 1;
      if (colY[col] + full > bottom() && colY[1 - col] + full <= bottom()) col = 1 - col;
      if (colY[col] + full <= bottom()) {
        drawCard(d, rest, devam, c.M + col * (cw + GAP), colY[col], full);
        colY[col] += full + GAP;
        rest = [];
        continue;
      }
      // sığmıyor: sayfa boşsa (ya da kart tam sayfadan büyükse) kart bölünür, değilse yeni sayfaya geçilir
      const pageH = bottom() - c.TOP;
      const fresh = colY[col] <= pageStart + 0.01;
      if (full > pageH || fresh) {
        const avail = bottom() - colY[col] - 2 - HEAD - 1.5;
        let k = 0;
        let used = 0;
        while (k < hs.length && used + hs[k] <= avail) used += hs[k++];
        if (k >= 2 || (fresh && k >= 1)) {
          const h = 2 + HEAD + used + 1.5;
          drawCard(d, rest.slice(0, k), devam, c.M + col * (cw + GAP), colY[col], h);
          colY[col] += h + GAP;
          rest = rest.slice(k);
          devam = true;
          continue;
        }
      }
      T.newPage();
      colY = [c.TOP, c.TOP];
      pageStart = c.TOP;
    }
  }
  c.y = Math.max(colY[0], colY[1]) + 1;
}

// =============================================================================== 2) Deneme gelişimi panosu
export function drawGelisimPano(c: PdfCtx, g: GelisimPanoData): void {
  const { doc } = c;
  const T = tools(c);
  const CW = c.W - 2 * c.M;
  const D = g.denemeler;
  const n = D.length;
  const panel = (x: number, y: number, w: number, h: number, bg: RGB = [255, 255, 255]) => {
    T.fill(bg);
    T.draw(LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 2.2, 2.2, 'FD');
  };
  const scores = D.map((d) => d.puan);
  const valid = scores.filter((v): v is number => v !== null);
  const last = D[n - 1];
  const prev = n >= 2 ? D[n - 2] : null;

  // ---------------------------------------------------------- 1. satır: puan grafiği + özet kutular
  const R1 = 64;
  T.ensure(R1 + 4);
  const sideW = 45;
  const chW = CW - sideW - 3;
  const y0 = c.y;
  panel(c.M, y0, chW, R1);
  T.font(8.6, true);
  T.ink(FG);
  T.text('Puan gelişimi', c.M + 3, y0 + 5.4);
  const pgW = doc.getTextWidth(c.t('Puan gelişimi'));
  T.font(6.2);
  T.ink(MUTED);
  T.text(`kalın çizgi öğrenci · kesik çizgi sınıf ortalaması${g.hedef !== null ? ' · yeşil kesik çizgi hedef' : ''}`, c.M + 5 + pgW, y0 + 5.4);
  if (n >= 2 && valid.length) {
    const all = [...valid, ...D.map((d) => d.sinifOrt).filter((v): v is number => v !== null), ...(g.hedef !== null ? [g.hedef] : [])];
    let lo = Math.floor((Math.min(...all) - 15) / 25) * 25;
    let hi = Math.ceil((Math.max(...all) + 15) / 25) * 25;
    if (hi - lo < 50) hi = lo + 50;
    lo = Math.max(100, lo);
    hi = Math.min(500, hi);
    const L = c.M + 12;
    const Rr = c.M + chW - 8;
    const Tp = y0 + 11;
    const Bt = y0 + R1 - 9;
    const X = (i: number) => L + ((Rr - L) * i) / (n - 1);
    const Y = (v: number) => Bt - ((v - lo) / (hi - lo)) * (Bt - Tp);
    // alan dolgusu (öğrenci)
    const pts = D.map((d, i) => (d.puan === null ? null : ([X(i), Y(d.puan)] as [number, number]))).filter((p): p is [number, number] => !!p);
    if (pts.length >= 2) {
      T.fill(tint(c.vurgu, 0.12));
      const rel: number[][] = [];
      let px = pts[0][0];
      let py = Bt;
      for (const p of [...pts, [pts[pts.length - 1][0], Bt] as [number, number]]) {
        rel.push([p[0] - px, p[1] - py]);
        px = p[0];
        py = p[1];
      }
      doc.lines(rel, pts[0][0], Bt, [1, 1], 'F', true);
    }
    // ızgara
    const step = hi - lo <= 125 ? 25 : hi - lo <= 250 ? 50 : 100;
    T.font(5.8);
    for (let v = Math.ceil(lo / step) * step; v <= hi + 0.01; v += step) {
      T.draw([238, 240, 243]);
      doc.setLineWidth(0.15);
      doc.line(L, Y(v), Rr, Y(v));
      T.ink(SOFT);
      T.text(String(Math.round(v)), L - 1.5, Y(v) + 0.9, { align: 'right' });
    }
    // hedef
    if (g.hedef !== null && g.hedef >= lo && g.hedef <= hi) {
      T.draw(OK);
      doc.setLineWidth(0.35);
      doc.setLineDashPattern([1.2, 1], 0);
      doc.line(L, Y(g.hedef), Rr, Y(g.hedef));
      doc.setLineDashPattern([], 0);
      T.font(5.8, true);
      T.ink(OK);
      T.text(`Hedef ${fmt1(g.hedef)}`, L + 1, Y(g.hedef) - 1);
    }
    // sınıf ortalaması (kesik)
    doc.setLineWidth(0.4);
    T.draw(SINIF);
    doc.setLineDashPattern([1, 0.8], 0);
    for (let i = 1; i < n; i++) {
      const a = D[i - 1].sinifOrt;
      const b = D[i].sinifOrt;
      if (a !== null && b !== null) doc.line(X(i - 1), Y(a), X(i), Y(b));
    }
    doc.setLineDashPattern([], 0);
    // öğrenci
    doc.setLineWidth(0.8);
    T.draw(c.vurgu);
    for (let i = 1; i < n; i++) {
      const a = D[i - 1].puan;
      const b = D[i].puan;
      if (a !== null && b !== null) doc.line(X(i - 1), Y(a), X(i), Y(b));
    }
    T.font(6, true);
    D.forEach((d, i) => {
      if (d.puan === null) return;
      T.fill([255, 255, 255]);
      T.draw(c.vurgu);
      doc.setLineWidth(0.45);
      doc.circle(X(i), Y(d.puan), 0.95, 'FD');
      if (n <= 8 || i === n - 1 || i === 0) {
        T.ink(c.vurgu);
        const up = d.sinifOrt === null || d.puan >= d.sinifOrt;
        T.text(fmt1(d.puan), X(i), up ? Y(d.puan) - 2 : Y(d.puan) + 3.6, { align: 'center' });
      }
    });
    T.font(5.6);
    T.ink(MUTED);
    const every = n > 8 ? Math.ceil(n / 8) : 1;
    D.forEach((d, i) => {
      if (i % every && i !== n - 1) return;
      T.text(T.fit(d.kisa, ((Rr - L) / Math.max(1, n - 1)) * every - 1), X(i), Bt + 4, { align: 'center' });
      T.ink(SOFT);
      T.text(d.tarih, X(i), Bt + 6.6, { align: 'center' });
      T.ink(MUTED);
    });
  } else {
    T.font(7);
    T.ink(MUTED);
    T.text('Gelişim için en az 2 deneme gerekir.', c.M + chW / 2, y0 + R1 / 2, { align: 'center' });
  }
  // özet kutular
  const sx = c.M + chW + 3;
  const boxH = (R1 - 2 * 2.5) / 3;
  const stat = (i: number, label: string, value: string, vc: RGB, sub: string, bg: RGB, bar?: number) => {
    const by = y0 + i * (boxH + 2.5);
    panel(sx, by, sideW, boxH, bg);
    T.font(5.8, true);
    T.ink(MUTED);
    T.text(label.toLocaleUpperCase('tr-TR'), sx + 3, by + 4.6);
    T.font(13, true);
    T.ink(vc);
    T.text(value, sx + 3, by + 11.2);
    if (bar !== undefined) {
      T.fill(LINE);
      doc.roundedRect(sx + 3, by + 13, sideW - 6, 1.5, 0.75, 0.75, 'F');
      T.fill(OK);
      doc.roundedRect(sx + 3, by + 13, Math.max(1.5, ((sideW - 6) * Math.min(100, bar)) / 100), 1.5, 0.75, 0.75, 'F');
    }
    T.font(5.8);
    T.ink(MUTED);
    T.text(T.fit(sub, sideW - 6), sx + 3, by + boxH - 2.4);
  };
  const dlt = last.puan !== null && prev?.puan !== null && prev ? last.puan - prev.puan! : null;
  stat(0, 'Son puan', fmt1(last.puan), c.vurgu, dlt === null ? last.ad : `Önceki denemeye göre ${dlt >= 0 ? '+' : '-'}${fmt1(Math.abs(dlt))}`, tint(c.vurgu, 0.07));
  const first = D.find((d) => d.puan !== null);
  const deg = first && last.puan !== null && n >= 2 ? last.puan - first.puan! : null;
  stat(1, 'Ortalama puan', fmt1(g.ortalama), FG, deg === null ? `${n} deneme` : `${n} denemede ${deg >= 0 ? '+' : '-'}${fmt1(Math.abs(deg))} değişim`, [248, 250, 252]);
  if (g.hedef !== null && last.puan !== null) {
    const p = Math.round((last.puan / g.hedef) * 100);
    const kalan = g.hedef - last.puan;
    stat(2, `Hedef ${fmt1(g.hedef)}`, `%${Math.min(100, p)}`, kalan <= 0 ? OK : FG, kalan > 0 ? `${fmt1(kalan)} puan kaldı` : `Hedefin ${fmt1(-kalan)} puan üstünde`, [248, 250, 252], p);
  } else stat(2, 'Son toplam net', fmt2(last.toplamNet), FG, `Sınıf sırası ${last.sinifSira}`, [248, 250, 252]);
  c.y = y0 + R1 + 3;

  // ---------------------------------------------------------- 2. satır: son 5 denemenin kartları
  const kart = D.slice(-5);
  const kh = 15.5;
  T.ensure(kh + 3);
  const kw = (CW - (kart.length - 1) * 2.4) / Math.max(1, kart.length);
  kart.forEach((d, i) => {
    const x = c.M + i * (kw + 2.4);
    const on = i === kart.length - 1;
    T.fill(on ? tint(c.vurgu, 0.08) : [255, 255, 255]);
    T.draw(on ? c.vurgu : LINE);
    doc.setLineWidth(on ? 0.35 : 0.2);
    doc.roundedRect(x, c.y, kw, kh, 2, 2, 'FD');
    T.font(5.8);
    T.ink(MUTED);
    T.text(T.fit(`${d.kisa} · ${d.tarih}`, kw - 5), x + 2.5, c.y + 4);
    T.font(11, true);
    T.ink(on ? c.vurgu : FG);
    T.text(fmt1(d.puan), x + 2.5, c.y + 9.4);
    T.font(5.6);
    T.ink(MUTED);
    T.text(T.fit(`Sınıf ${d.sinifSira} · Kurum ${d.kurumSira} · Net ${fmt1(d.toplamNet)}`, kw - 5), x + 2.5, c.y + 13.2);
  });
  c.y += kh + 3;

  // ---------------------------------------------------------- 3. satır: ders neti küçük grafikleri (3 × 2)
  const cols = 3;
  const rowsN = Math.ceil(g.dersler.length / cols);
  const smH = 30;
  const ph = 8 + rowsN * (smH + 2.4) + 0.6;
  T.ensure(ph + 3);
  const py0 = c.y;
  panel(c.M, py0, CW, ph);
  T.font(8.6, true);
  T.ink(FG);
  T.text('Ders netlerinin gelişimi', c.M + 3, py0 + 5.4);
  const dnW = doc.getTextWidth(c.t('Ders netlerinin gelişimi'));
  T.font(6.2);
  T.ink(MUTED);
  T.text('renkli çizgi öğrenci · gri çizgi sınıf ortalaması · sağ üstte son net ve ilk denemeye göre fark', c.M + 5 + dnW, py0 + 5.4);
  const sw = (CW - 6 - (cols - 1) * 2.4) / cols;
  g.dersler.forEach((d, i) => {
    const x = c.M + 3 + (i % cols) * (sw + 2.4);
    const yy = py0 + 8 + Math.floor(i / cols) * (smH + 2.4);
    T.draw([238, 240, 243]);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, yy, sw, smH, 1.8, 1.8, 'S');
    T.font(7, true);
    T.ink(d.renk);
    T.text(d.ad, x + 2.4, yy + 4.4);
    const nv = d.netler.filter((v): v is number => v !== null);
    const lastN = nv.length ? nv[nv.length - 1] : null;
    const firstN = nv.length ? nv[0] : null;
    const fark = lastN !== null && firstN !== null && nv.length >= 2 ? lastN - firstN : null;
    let rx = x + sw - 2.4;
    if (fark !== null) {
      T.font(5.8, true);
      T.ink(Math.abs(fark) < 0.05 ? MUTED : fark > 0 ? OK : BAD);
      const fs = Math.abs(fark) < 0.05 ? 'sabit' : `${fark > 0 ? '+' : '-'}${fmt1(Math.abs(fark))}`;
      T.text(fs, rx, yy + 4.4, { align: 'right' });
      rx -= doc.getTextWidth(c.t(fs)) + 1.4;
    }
    T.font(7.4, true);
    T.ink(FG);
    T.text(fmt1(lastN), rx, yy + 4.4, { align: 'right' });
    // grafik
    const L = x + 6.5;
    const Rr = x + sw - 3;
    const Tp = yy + 7.5;
    const Bt = yy + smH - 5;
    const top = Math.max(1, d.soru);
    const Y = (v: number) => Bt - (Math.max(0, Math.min(top, v)) / top) * (Bt - Tp);
    const X = (k: number) => (n === 1 ? (L + Rr) / 2 : L + ((Rr - L) * k) / (n - 1));
    T.font(5);
    for (const v of [0, Math.round(top / 2), top]) {
      T.draw([243, 244, 246]);
      doc.setLineWidth(0.15);
      doc.line(L, Y(v), Rr, Y(v));
      T.ink(SOFT);
      T.text(String(v), L - 1.2, Y(v) + 0.8, { align: 'right' });
    }
    const seg = (vals: Array<number | null>, col: RGB, w: number) => {
      T.draw(col);
      doc.setLineWidth(w);
      for (let k = 1; k < n; k++) {
        const a = vals[k - 1];
        const b = vals[k];
        if (a !== null && b !== null) doc.line(X(k - 1), Y(a), X(k), Y(b));
      }
    };
    seg(d.sinifNetler, [203, 213, 225], 0.35);
    seg(d.netler, d.renk, 0.6);
    d.netler.forEach((v, k) => {
      if (v === null) return;
      T.fill(k === n - 1 ? d.renk : [255, 255, 255]);
      T.draw(d.renk);
      doc.setLineWidth(0.35);
      doc.circle(X(k), Y(v), 0.7, 'FD');
    });
    T.font(5);
    T.ink(SOFT);
    if (n <= 8) D.forEach((_, k) => T.text(String(k + 1), X(k), Bt + 3.2, { align: 'center' }));
    else T.text(`1 – ${n}`, (L + Rr) / 2, Bt + 3.2, { align: 'center' });
  });
  c.y = py0 + ph + 3;

  // ---------------------------------------------------------- 4. satır: deneme sonuçları tablosu
  const head = ['Deneme', ...g.dersler.map((d) => d.kisa), 'Toplam net', 'Puan', 'Sınıf', 'Kurum'];
  const nameW = 38;
  const restW = (CW - nameW) / (head.length - 1);
  const xs = head.map((_, i) => (i === 0 ? c.M + 3 : c.M + nameW + restW * (i - 1) + restW / 2));
  const drawHead = () => {
    T.fill([248, 250, 252]);
    doc.rect(c.M, c.y, CW, 6, 'F');
    T.font(5.8, true);
    head.forEach((h, i) => {
      T.ink(i >= 1 && i <= g.dersler.length ? g.dersler[i - 1].renk : MUTED);
      T.text(h, xs[i], c.y + 4, { align: i === 0 ? 'left' : 'center' });
    });
    T.font(5);
    T.ink(SOFT);
    if (g.dersler.length) T.text('D / Y / Net', xs[1], c.y + 7.6, { align: 'center' });
    c.y += 8.6;
  };
  T.ensure(8.6 + Math.min(n, 3) * 6 + 2);
  T.font(8.6, true);
  T.ink(FG);
  drawHead();
  D.forEach((d, i) => {
    if (c.y + 6 > c.H - LIMIT) {
      T.newPage();
      drawHead();
    }
    T.draw([243, 244, 246]);
    doc.setLineWidth(0.15);
    doc.line(c.M, c.y, c.M + CW, c.y);
    T.font(6.4, true);
    T.ink(FG);
    T.text(T.fit(d.ad, nameW - 14), xs[0], c.y + 3.9);
    T.font(5.6);
    T.ink(SOFT);
    T.text(d.tarih, c.M + nameW - 1.5, c.y + 3.9, { align: 'right' });
    T.font(6.2);
    T.ink(FG2);
    d.netler.forEach((v, k) => T.text(v, xs[k + 1], c.y + 3.9, { align: 'center' }));
    const j = g.dersler.length + 1;
    T.font(6.4, true);
    T.ink(FG);
    T.text(fmt2(d.toplamNet), xs[j], c.y + 3.9, { align: 'center' });
    T.ink(i === n - 1 ? c.vurgu : FG);
    T.text(fmt2(d.puan), xs[j + 1], c.y + 3.9, { align: 'center' });
    T.font(6.2);
    T.ink(FG2);
    T.text(d.sinifSira, xs[j + 2], c.y + 3.9, { align: 'center' });
    T.text(d.kurumSira, xs[j + 3], c.y + 3.9, { align: 'center' });
    c.y += 6;
  });
  c.y += 4;
}

// =============================================================================== 3) Konu ısı tablosu (daireler)
export function drawIsiNokta(c: PdfCtx, g: IsiNoktaData): void {
  const { doc } = c;
  const T = tools(c);
  const CW = c.W - 2 * c.M;
  const n = g.denemeler.length;
  const CELL = n > 6 ? 10 : 12;
  const SPARK = 17;
  const GEN = 12;
  const labelW = CW - 6 - n * CELL - SPARK - GEN;
  const R = 2.55;

  // renk anahtarı
  T.ensure(30);
  let lx = c.M;
  T.font(6.6);
  for (const k of LEGEND_LV) {
    T.fill(LEVEL_INFO[k].rgb);
    doc.circle(lx + 1.3, c.y + 1.6, 1.2, 'F');
    T.ink(FG2);
    T.text(LV_RANGE[k], lx + 3.4, c.y + 2.6);
    lx += 7 + doc.getTextWidth(c.t(LV_RANGE[k]));
  }
  T.draw(SOFT);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([0.6, 0.5], 0);
  doc.circle(lx + 1.3, c.y + 1.6, 1.2, 'S');
  doc.setLineDashPattern([], 0);
  T.ink(FG2);
  T.text('sorulmadı', lx + 3.4, c.y + 2.6);
  c.y += 6;

  const xCell = (i: number) => c.M + 3 + labelW + i * CELL + CELL / 2;
  const xSpark = c.M + 3 + labelW + n * CELL + 1.5;
  const xGen = c.M + CW - 3;

  for (const d of g.dersler) {
    let segTop = c.y;
    const header = (devam: boolean) => {
      segTop = c.y;
      T.fill(d.renk);
      doc.circle(c.M + 4.4, c.y + 4.4, 1.2, 'F');
      T.font(8.6, true);
      T.ink(d.renk);
      const nm = devam ? `${d.ad} (devam)` : d.ad;
      T.text(nm, c.M + 7, c.y + 5.4);
      const nmW = doc.getTextWidth(c.t(nm));
      T.font(6.2);
      T.ink(MUTED);
      T.text(`${d.satirlar.length} kazanım · ${n} denemede %${d.genelOran}`, c.M + 9 + nmW, c.y + 5.4);
      T.font(5.6, true);
      T.ink(MUTED);
      T.text('Kazanım', c.M + 3, c.y + 10.6);
      g.denemeler.forEach((e, i) => {
        T.font(5.8, true);
        T.ink(MUTED);
        T.text(String(e.no), xCell(i), c.y + 9.4, { align: 'center' });
        T.font(4.8);
        T.ink(SOFT);
        T.text(e.tarih, xCell(i), c.y + 11.6, { align: 'center' });
      });
      T.font(5.6, true);
      T.ink(MUTED);
      T.text('Gidişat', xSpark + SPARK / 2 - 1.5, c.y + 10.6, { align: 'center' });
      T.text('Genel', xGen, c.y + 10.6, { align: 'right' });
      c.y += 13;
    };
    const close = () => {
      T.draw(LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(c.M, segTop, CW, c.y - segTop + 1, 2.2, 2.2, 'S');
      c.y += 4;
    };
    T.ensure(13 + 3 * 7);
    header(false);
    const rows: Array<{ ad: string; hucre: Array<number | null>; genel: number; toplam?: boolean }> = [...d.satirlar, { ad: 'Ders geneli', hucre: d.genel, genel: d.genelOran, toplam: true }];
    for (const r of rows) {
      T.font(6.6, !!r.toplam);
      const ls = T.lines(r.ad, labelW - 2, 2);
      const rh = Math.max(6.4, ls.length * 2.8 + 2.2);
      if (c.y + rh > c.H - LIMIT) {
        close();
        T.newPage();
        header(true);
      }
      if (r.toplam) {
        T.fill([248, 250, 252]);
        doc.rect(c.M + 0.3, c.y, CW - 0.6, rh, 'F');
      }
      T.draw([243, 244, 246]);
      doc.setLineWidth(0.15);
      doc.line(c.M + 0.5, c.y, c.M + CW - 0.5, c.y);
      const mid = c.y + rh / 2;
      T.font(6.6, !!r.toplam);
      T.ink(r.toplam ? FG : FG2);
      T.text(ls, c.M + 3, mid + 1 - (ls.length - 1) * 1.4);
      r.hucre.forEach((v, i) => {
        const x = xCell(i);
        if (r.toplam) {
          T.font(6.2, true);
          T.ink(v === null ? SOFT : LV_TEXT[levelOf(v)]);
          T.text(v === null ? '-' : `%${v}`, x, mid + 1, { align: 'center' });
          return;
        }
        if (v === null) {
          T.draw([209, 213, 219]);
          doc.setLineWidth(0.2);
          doc.setLineDashPattern([0.6, 0.5], 0);
          doc.circle(x, mid, R, 'S');
          doc.setLineDashPattern([], 0);
          return;
        }
        T.fill(lvRgb(v));
        doc.circle(x, mid, R, 'F');
        T.font(v === 100 ? 4.4 : 5, true);
        T.ink([255, 255, 255]);
        T.text(String(v), x, mid + 0.85, { align: 'center' });
      });
      // gidişat
      const pts = r.hucre.map((v, i) => (v === null ? null : ([i, v] as [number, number]))).filter((p): p is [number, number] => !!p);
      if (pts.length >= 2) {
        const col = r.toplam ? d.renk : lvRgb(r.genel);
        T.draw(col);
        doc.setLineWidth(0.4);
        const X = (i: number) => xSpark + (SPARK - 3) * (n === 1 ? 0.5 : i / (n - 1));
        const Y = (v: number) => mid + 2 - (v / 100) * 4;
        for (let k = 1; k < pts.length; k++) doc.line(X(pts[k - 1][0]), Y(pts[k - 1][1]), X(pts[k][0]), Y(pts[k][1]));
        T.fill(col);
        const lp = pts[pts.length - 1];
        doc.circle(X(lp[0]), Y(lp[1]), 0.5, 'F');
      }
      T.font(6.8, true);
      T.ink(r.toplam ? FG : LV_TEXT[levelOf(r.genel)]);
      T.text(`%${r.genel}`, xGen, mid + 1, { align: 'right' });
      c.y += rh;
    }
    close();
  }
}
