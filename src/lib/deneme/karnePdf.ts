// ============================================================================
// DENEME ANALİZİ (Aşama 47) — KARNE PDF'İ
// Karne, bloklardan oluşan bir modelden çizilir: başlık, bilgi satırları, tablo, çizgi ve sütun grafiği, not.
// Türkçe karakterler için uygulamanın gömülü yazı tipi kullanılır.
// ============================================================================
import { getKurumBrand } from '../kurumBrand';
import type { TekSayfaData } from './tekSayfaKarne';
import type { BirlesikDers } from './kazanimBirlesik';
import { drawGelisimPano, drawIsiNokta, drawKazanimKart, type GelisimPanoData, type IsiNoktaData, type PdfCtx } from './karnePdfB'; // Aşama 141
import { kurumRenkHazirla, seritRenk } from '../kurumRenk';

export type PdfTone = 'success' | 'info' | 'warning' | 'danger' | 'muted';

export type PdfBlock =
  | { kind: 'title'; text: string; sub?: string }
  | { kind: 'kv'; rows: Array<[string, string]> }
  | { kind: 'heading'; text: string; sub?: string; minFollow?: number }
  // Aşama 53: renkli bilgi kutusu (açıklama / öneri). lines: her biri ayrı satır (gerekirse alt satıra kayar)
  | { kind: 'callout'; title: string; lines: Array<string | { label: string; text: string; tone?: PdfTone }>; tone?: PdfTone }
  | { kind: 'text'; text: string; tone?: PdfTone }
  | {
      kind: 'table';
      head: string[];
      rows: Array<Array<string | number>>;
      align?: Array<'left' | 'center' | 'right'>;
      rowTones?: Array<PdfTone | null>;
      widths?: Array<number | 'auto'>;
      fontSize?: number;
      /** Aşama 92: satırlar dönüşümlü renk (bir satır beyaz, bir satır bu renk) */
      stripe?: [number, number, number];
      /** Aşama 53: satır rengiyle yazılacak sütun (verilmezse son sütun) */
      toneColumn?: number;
      /** Aşama 54: hücre hücre renk (ısı tablosu, şık dağılımı). Satır rengini o hücrede ezer. */
      cellTones?: Array<Array<PdfTone | null | undefined>>;
      /** Aşama 135: ders tablosu — satır başına ders rengi (null = toplam satırı). Verilirse satırlar
       *  beyaz/açık gri, ders adı kendi renginde ve solda renkli işaret, başarı sütununda renkli çubuk,
       *  son sütun (+/-) yeşil/kırmızı yazılır; satır tonu (rowTones) kullanılmaz. */
      rowColors?: Array<[number, number, number] | null>;
      /** Aşama 135: rowColors ile — başarı (%) sütunu */
      rateColumn?: number;
    }
  // Aşama 54: yığılmış durum çubuğu (ör. ders ders kazanıldı / gelişiyor / eksik / sorulmadı)
  | {
      kind: 'stack';
      title?: string;
      // Aşama 56: rgb verilirse tonun rengi yerine o renk kullanılır (ör. LGS dilim dağılımı)
      items: Array<{ label: string; sub?: string; parts: Array<{ value: number; tone: PdfTone; rgb?: [number, number, number] }>; right?: string }>;
      legend?: Array<{ label: string; tone: PdfTone; rgb?: [number, number, number] }>;
    }
  | {
      kind: 'line';
      title: string;
      labels: string[];
      series: Array<{ name: string; values: Array<number | null> }>;
      yMin?: number;
      yMax?: number;
      /** Aşama 272: dizi başına renk (ör. ders renkleri); verilmezse ilk dizi kurum rengi, diğerleri gri */
      colors?: Array<[number, number, number]>;
    }
  | {
      kind: 'bar';
      title: string;
      labels: string[];
      series: Array<{ name: string; values: number[] }>;
      /** Aşama 135: 3 boyutlu sütunlar; ilk dizi (öğrenci) her etikette kendi renginde (ders rengi), diğerleri gri tonlarda */
      solid?: { colors: Array<[number, number, number]> };
    }
  | { kind: 'pagebreak' }
  // Aşama 50: tek deneme karnesi blokları
  | {
      kind: 'hero';
      eyebrow: string;
      title: string; // öğrenci adı
      sub: string; // sınıf
      chips: string[]; // deneme adı, tarih, yayınevi…
      score: string;
      scoreLabel: string;
      side: Array<[string, string]>; // sağdaki küçük kutular (Sınıf sırası, Kurum sırası…)
    }
  | { kind: 'tiles'; items: Array<{ label: string; value: string; sub?: string; tone?: PdfTone }> }
  | {
      kind: 'answers';
      rows: Array<{ title: string; cells: Array<{ no: number; given: string; key: string; mark: 'D' | 'Y' | 'B' }> }>;
    }
  | { kind: 'rates'; title?: string; items: Array<{ label: string; sub?: string; rate: number; marker?: number | null; tone: PdfTone; right?: string }> }
  // Aşama 135: tek sayfa deneme sonuç karnesi — kendi sayfasına sabit yerleşimle çizilir (kurum başlığı ve alt yazı kendi içinde)
  | { kind: 'tekSayfa'; data: TekSayfaData }
  // Aşama 141: birleştirilmiş karne B tasarımı (karnePdfB.ts çizer)
  | { kind: 'kazanimKart'; dersler: BirlesikDers[]; n: number }
  | { kind: 'gelisimPano'; data: GelisimPanoData }
  | { kind: 'isiNokta'; data: IsiNoktaData };

// Aşama 272: bütün karneler birleştirilmiş karnenin (B) diliyle: koyu yazı, gri çizgi, kurum rengi vurgu
const B_FG: [number, number, number] = [17, 24, 39];
const B_FG2: [number, number, number] = [55, 65, 81];
const B_MUTED: [number, number, number] = [107, 114, 128];
const B_SOFT: [number, number, number] = [156, 163, 175];
const B_LINE: [number, number, number] = [229, 231, 235];
const B_TRACK: [number, number, number] = [241, 242, 244];
const B_SURFACE: [number, number, number] = [249, 250, 251];
/** Aşama 272: karşılaştırma dizileri (sınıf, kurum…) gri tonlarda; ilk dizi kurum renginde */
const tintB = (c: [number, number, number], k: number): [number, number, number] => [Math.round(255 - (255 - c[0]) * k), Math.round(255 - (255 - c[1]) * k), Math.round(255 - (255 - c[2]) * k)];
const B_GRI: Array<[number, number, number]> = [
  [148, 163, 184],
  [203, 213, 225],
  [100, 116, 139],
];
const TONE_TEXT: Record<PdfTone, [number, number, number]> = {
  success: [21, 128, 61],
  info: [29, 78, 216],
  warning: [180, 83, 9],
  danger: [185, 28, 28],
  muted: [100, 116, 139],
};

/** Aşama 101: toplu karnede bir öğrencinin bölümü (kendi blokları ve sayfa alt yazısı) */
export type KarnePart = { blocks: PdfBlock[]; footer: string };

export async function buildKarnePdf(blocks: PdfBlock[], footerLabel: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  return buildKarnePdfParts([{ blocks, footer: footerLabel }], orientation);
}

export async function buildKarnePdfParts(parts: KarnePart[], orientation: 'portrait' | 'landscape' = 'portrait') {
  // Aşama 135: tek sayfa karnenin çizicisi yalnız o tür istenince yüklenir
  const hasTek = parts.some((p) => p.blocks.some((b) => b.kind === 'tekSayfa'));
  // Aşama 135: karne şeritleri kurum logosunun CANLI renkleriyle (mavi/mor değil; logo yoksa eski mavi)
  const kRenk = await kurumRenkHazirla(getKurumBrand().logo);
  const renk = kRenk ? seritRenk(kRenk) : null;
  const zemin = renk ? renk.zemin : ([67, 56, 202] as [number, number, number]);
  const zemin2 = renk ? renk.zemin2 : ([79, 70, 229] as [number, number, number]);
  const cipRenk = renk ? renk.cip : ([99, 102, 241] as [number, number, number]);
  const kutuRenk = renk ? renk.kutu : ([99, 102, 241] as [number, number, number]);
  // Aşama 272: grafiklerde ve başlıklarda vurgu = kurum rengi (logo yoksa indigo)
  const vurgu: [number, number, number] = renk ? renk.zemin : [79, 70, 229];
  // 3'ten çok dizi (ör. sınıflar) kurum renginin koyudan açığa tonlarıyla ayrılır (ekrandaki gibi)
  const diziRenk = (i: number, n = 1, renkler?: Array<[number, number, number]>): [number, number, number] =>
    renkler?.[i] || (n > 3 ? tintB(vurgu, 1 - (0.7 * i) / Math.max(1, n - 1)) : i === 0 ? vurgu : B_GRI[(i - 1) % B_GRI.length]);
  const [{ jsPDF }, autoTableMod, fonts, analytics, tekMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('../pdfFonts'),
    import('../../utils/questionAnalytics'),
    hasTek ? import('./tekSayfaPdf') : Promise.resolve(null),
  ]);
  const autoTable = autoTableMod.default;
  // Aşama 135: tek sayfa karne yoğun çizim içerir; dosya küçük kalsın diye sıkıştırılır (diğer karneler eskisi gibi)
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: hasTek });
  const fontOk = fonts.registerTurkishPdfFont(doc);
  const F = fontOk ? fonts.PDF_FONT : 'helvetica';
  const t = (s: unknown) => (fontOk ? analytics.cleanForPdfFont(s) : String(s ?? '').replace(/[^\x20-\x7E]/g, ''));
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  // Aşama 99b: kurum tanımlıysa her sayfanın başında kurum başlığı (logo + ad); içerik başlığın altından başlar
  const brandTop = getKurumBrand();
  const hasBrand = !!(brandTop.name || brandTop.logo);
  const TOP = hasBrand ? 25 : 16;
  let y = hasBrand ? 24 : 14;

  const ensure = (need: number) => {
    if (y + need > H - 16) {
      doc.addPage();
      y = TOP;
    }
  };

  const drawLegend = (names: string[], x0: number, yy: number, renkler?: Array<[number, number, number]>) => {
    let x = x0;
    doc.setFontSize(7.5);
    names.forEach((n, i) => {
      // Aşama 272: B lejantı — yuvarlak işaret, ilk dizi kurum renginde
      const c = diziRenk(i, names.length, renkler);
      doc.setFillColor(c[0], c[1], c[2]);
      doc.circle(x + 1.2, yy - 1.1, 1.2, 'F');
      doc.setTextColor(B_FG2[0], B_FG2[1], B_FG2[2]);
      const label = t(n);
      doc.text(label, x + 4, yy);
      x += 8 + doc.getTextWidth(label);
    });
  };

  const chartFrame = (title: string, minV: number, maxV: number, h: number) => {
    ensure(h + 14);
    // Aşama 272: B grafik başlığı (koyu, kalın) ve açık gri kılavuz çizgileri
    doc.setFont(F, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]);
    doc.text(t(title), M, y + 4);
    doc.setFont(F, 'normal');
    const top = y + 8;
    const left = M + 10;
    const right = W - M;
    const bottom = top + h;
    doc.setLineWidth(0.15);
    doc.setFontSize(6.6);
    doc.setTextColor(B_SOFT[0], B_SOFT[1], B_SOFT[2]);
    for (let k = 0; k <= 4; k++) {
      const v = minV + ((maxV - minV) * k) / 4;
      const yy = bottom - (h * k) / 4;
      if (k === 0) doc.setDrawColor(B_LINE[0], B_LINE[1], B_LINE[2]);
      else doc.setDrawColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]);
      doc.line(left, yy, right, yy);
      doc.text(String(Math.round(v * 10) / 10).replace('.', ','), left - 1.5, yy + 1, { align: 'right' });
    }
    return { top, left, right, bottom };
  };

  // Aşama 101: birden çok öğrencinin karnesi tek dosyada — her öğrenci yeni sayfadan başlar
  const starts: number[] = [];
  /** Aşama 135: kendi başlığını ve alt yazısını çizen (tek sayfa karne) sayfalar */
  const ownPages = new Set<number>();
  for (let pi = 0; pi < parts.length; pi++) {
    if (pi > 0) {
      // öğrenciler arasında tarayıcıya sıra verilir: 30+ öğrencilik dosyada sayfa donmaz
      await new Promise<void>((r) => setTimeout(r, 0));
      doc.addPage();
      y = TOP;
    }
    starts.push(doc.getNumberOfPages());
    let fresh = true; // Aşama 135: sayfaya henüz bir şey çizilmedi
    for (const b of parts[pi].blocks) {
      const wasFresh = fresh;
      fresh = false;
      if (b.kind === 'pagebreak') {
        doc.addPage();
        y = TOP;
        fresh = true;
        continue;
      }
      // ------------------------------------------------------------------- Aşama 135: tek sayfa karne
      if (b.kind === 'tekSayfa') {
        if (!wasFresh) doc.addPage();
        if (tekMod) tekMod.drawTekSayfa(doc, F, t, b.data, getKurumBrand(), parts[pi].footer, kRenk);
        ownPages.add(doc.getNumberOfPages());
        y = H; // sonraki blok (varsa) yeni sayfadan başlar
        continue;
      }
      // ------------------------------------------------------------------- Aşama 141: B tasarımı blokları
      if (b.kind === 'kazanimKart' || b.kind === 'gelisimPano' || b.kind === 'isiNokta') {
        const ctx: PdfCtx = { doc, F, t, W, H, M, TOP, y, vurgu: renk ? renk.zemin : [79, 70, 229] };
        if (b.kind === 'kazanimKart') drawKazanimKart(ctx, b.dersler, b.n);
        else if (b.kind === 'gelisimPano') drawGelisimPano(ctx, b.data);
        else drawIsiNokta(ctx, b.data);
        y = ctx.y;
        doc.setFont(F, 'normal');
        doc.setLineWidth(0.2);
        continue;
      }
      // ------------------------------------------------------------------- Aşama 50: başlık bandı
      if (b.kind === 'hero') {
        ensure(42);
        const x0 = M;
        const w = W - 2 * M;
        const h = 34;
        doc.setFillColor(zemin[0], zemin[1], zemin[2]);
        doc.roundedRect(x0, y, w, h, 4, 4, 'F');
        doc.setFillColor(zemin2[0], zemin2[1], zemin2[2]);
        doc.roundedRect(x0 + w - 72, y, 72, h, 4, 4, 'F'); // sağ bölüm (puan ve sıralar) biraz açık ton
        if (renk) {
          // Aşama 135: altta kurumun ikinci rengiyle ince çizgi
          doc.setFillColor(renk.cizgi[0], renk.cizgi[1], renk.cizgi[2]);
          doc.rect(x0 + 4, y + h - 1.4, w - 8, 1.4, 'F');
        }
        if (renk) doc.setTextColor(255, 255, 255);
        else doc.setTextColor(199, 210, 254);
        doc.setFont(F, 'bold');
        doc.setFontSize(7.5);
        doc.text(t(b.eyebrow.toLocaleUpperCase('tr-TR')), x0 + 6, y + 7);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        doc.text(t(b.title), x0 + 6, y + 15, { maxWidth: w - 80 });
        doc.setFont(F, 'normal');
        doc.setFontSize(9.5);
        if (renk) doc.setTextColor(255, 255, 255);
        else doc.setTextColor(224, 231, 255);
        doc.text(t(b.sub), x0 + 6, y + 21, { maxWidth: w - 80 });
        // çipler
        doc.setFontSize(7.4);
        let cx0 = x0 + 6;
        for (const c of b.chips.filter(Boolean)) {
          const label = t(c);
          const cw = Math.min(70, doc.getTextWidth(label) + 5);
          if (cx0 + cw > x0 + w - 78) break;
          doc.setFillColor(cipRenk[0], cipRenk[1], cipRenk[2]);
          doc.roundedRect(cx0, y + 24.5, cw, 5.5, 2.5, 2.5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text(label, cx0 + 2.5, y + 28.3, { maxWidth: cw - 4 });
          cx0 += cw + 2;
        }
        // puan dairesi
        const scx = x0 + w - 52;
        const scy = y + h / 2;
        doc.setFillColor(255, 255, 255);
        doc.circle(scx, scy, 13, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFont(F, 'bold');
        doc.setFontSize(6);
        doc.text(t(b.scoreLabel.toLocaleUpperCase('tr-TR')), scx, scy - 5, { align: 'center' });
        doc.setTextColor(zemin[0], zemin[1], zemin[2]);
        doc.setFontSize(13);
        doc.text(t(b.score), scx, scy + 1.5, { align: 'center' });
        doc.setFont(F, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text('/ 500', scx, scy + 6, { align: 'center' });
        // sağ kutular
        const sx = x0 + w - 34;
        b.side.slice(0, 3).forEach(([k, v], i) => {
          const yy = y + 4 + i * 9.5;
          doc.setFillColor(kutuRenk[0], kutuRenk[1], kutuRenk[2]);
          doc.roundedRect(sx, yy, 30, 8.2, 2, 2, 'F');
          if (renk) doc.setTextColor(255, 255, 255);
          else doc.setTextColor(199, 210, 254);
          doc.setFontSize(5.8);
          doc.text(t(k.toLocaleUpperCase('tr-TR')), sx + 2.5, yy + 3);
          doc.setTextColor(255, 255, 255);
          doc.setFont(F, 'bold');
          doc.setFontSize(8.5);
          doc.text(t(v), sx + 2.5, yy + 7);
          doc.setFont(F, 'normal');
        });
        y += h + 5;
        continue;
      }
      // ------------------------------------------------------------------- Aşama 50: özet kutuları
      if (b.kind === 'tiles') {
        const n = Math.max(1, b.items.length);
        const gap = 2.5;
        const tw = (W - 2 * M - gap * (n - 1)) / n;
        const th = 17;
        ensure(th + 4);
        b.items.forEach((it, i) => {
          const x = M + i * (tw + gap);
          // Aşama 272: B kutusu — beyaz zemin, ince gri çerçeve, tonlu kutuda üstte renk şeridi ve renkli rakam
          const txt = it.tone ? TONE_TEXT[it.tone] : B_FG;
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(B_LINE[0], B_LINE[1], B_LINE[2]);
          doc.setLineWidth(0.2);
          doc.roundedRect(x, y, tw, th, 2.5, 2.5, 'FD');
          if (it.tone && it.tone !== 'muted') {
            doc.setFillColor(txt[0], txt[1], txt[2]);
            doc.roundedRect(x + 2.5, y, tw - 5, 0.8, 0.4, 0.4, 'F');
          }
          doc.setFont(F, 'bold');
          doc.setFontSize(6.4);
          doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
          doc.text(t(it.label.toLocaleUpperCase('tr-TR')), x + 2.5, y + 4.3, { maxWidth: tw - 4 });
          doc.setFontSize(13);
          doc.setTextColor(txt[0], txt[1], txt[2]);
          doc.text(t(it.value), x + 2.5, y + 11);
          if (it.sub) {
            doc.setFont(F, 'normal');
            doc.setFontSize(6.4);
            doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
            doc.text(t(it.sub), x + 2.5, y + 15, { maxWidth: tw - 4 });
          }
          doc.setFont(F, 'normal');
        });
        y += th + 5;
        continue;
      }
      // ------------------------------------------------------------------- Aşama 50: cevap çizelgesi
      if (b.kind === 'answers') {
        const cell = 6.6;
        const perRow = Math.max(1, Math.floor((W - 2 * M - 2) / (cell + 0.6)));
        for (const r of b.rows) {
          const lines = Math.ceil(r.cells.length / perRow) || 1;
          ensure(6 + lines * (cell + 7));
          doc.setFont(F, 'bold');
          doc.setFontSize(8.2);
          doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]); // Aşama 272
          doc.text(t(r.title), M, y + 3.5);
          y += 5.5;
          r.cells.forEach((c, i) => {
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const x = M + col * (cell + 0.6);
            const yy = y + row * (cell + 7);
            doc.setFont(F, 'normal');
            doc.setFontSize(5.4);
            doc.setTextColor(148, 163, 184);
            doc.text(String(c.no), x + cell / 2, yy + 1.8, { align: 'center' });
            // Aşama 272: B renkleri (birleştirilmiş karnedeki doğru / yanlış yeşil-kırmızısı)
            const fill: [number, number, number] = c.mark === 'D' ? [22, 163, 74] : c.mark === 'Y' ? [220, 38, 38] : B_TRACK;
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.setDrawColor(B_LINE[0], B_LINE[1], B_LINE[2]);
            doc.roundedRect(x, yy + 2.6, cell, cell, 1.3, 1.3, c.mark === 'B' ? 'FD' : 'F');
            doc.setFont(F, 'bold');
            doc.setFontSize(8);
            if (c.mark === 'B') doc.setTextColor(148, 163, 184);
            else doc.setTextColor(255, 255, 255);
            doc.text(t(c.key === 'X' ? '-' : c.given || '-'), x + cell / 2, yy + 2.6 + cell / 2 + 1.3, { align: 'center' });
            if (c.mark !== 'D') {
              doc.setFont(F, 'normal');
              doc.setFontSize(5.6);
              doc.setTextColor(71, 85, 105);
              doc.text(t(c.key === 'X' ? 'iptal' : c.key || '-'), x + cell / 2, yy + 2.6 + cell + 2.6, { align: 'center' });
            }
          });
          y += lines * (cell + 7) + 1.5;
        }
        doc.setFont(F, 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(t('Yeşil: doğru · Kırmızı: yanlış · Gri: boş. Kutudaki harf öğrencinin cevabı, altındaki harf doğru cevaptır.'), M, y + 2);
        y += 6;
        continue;
      }
      // ------------------------------------------------------------------- Aşama 50: başarı çubukları
      if (b.kind === 'rates') {
        if (b.title) {
          ensure(10);
          doc.setFont(F, 'bold');
          doc.setFontSize(9);
          doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]); // Aşama 272
          doc.text(t(b.title), M, y + 3.5);
          y += 5.5;
        }
        const labelW = 96;
        const barX = M + labelW + 3;
        const barW = W - M - barX - 26;
        for (const it of b.items) {
          doc.setFont(F, 'normal');
          doc.setFontSize(7.4);
          const lines = (doc.splitTextToSize(t(it.label), labelW) as string[]).slice(0, 2);
          const subLines = it.sub ? (doc.splitTextToSize(t(it.sub), labelW) as string[]).slice(0, 1) : [];
          const rh = Math.max(6, (lines.length + subLines.length) * 3.2 + 1.5);
          ensure(rh + 1);
          doc.setTextColor(30, 41, 59);
          doc.text(lines, M, y + 3);
          if (subLines.length) {
            doc.setFontSize(6.2);
            doc.setTextColor(100, 116, 139);
            doc.text(subLines, M, y + 3 + lines.length * 3.2);
          }
          const by = y + rh / 2 - 1.4;
          doc.setFillColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]); // Aşama 272
          doc.roundedRect(barX, by, barW, 2.8, 1.4, 1.4, 'F');
          const c = TONE_TEXT[it.tone];
          doc.setFillColor(c[0], c[1], c[2]);
          doc.roundedRect(barX, by, Math.max(1.2, (barW * Math.max(0, Math.min(100, it.rate))) / 100), 2.8, 1.4, 1.4, 'F');
          if (it.marker !== null && it.marker !== undefined) {
            const mx = barX + (barW * Math.max(0, Math.min(100, it.marker))) / 100;
            doc.setDrawColor(B_FG[0], B_FG[1], B_FG[2]);
            doc.setLineWidth(0.5);
            doc.line(mx, by - 1, mx, by + 3.8);
          }
          doc.setFont(F, 'bold');
          doc.setFontSize(7.6);
          doc.setTextColor(c[0], c[1], c[2]);
          doc.text(`%${it.rate}`, barX + barW + 2, by + 2.4);
          if (it.right) {
            doc.setFont(F, 'normal');
            doc.setFontSize(6.4);
            doc.setTextColor(100, 116, 139);
            doc.text(t(it.right), W - M, by + 2.4, { align: 'right' });
          }
          doc.setDrawColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]);
          doc.setLineWidth(0.15);
          doc.line(M, y + rh, W - M, y + rh);
          y += rh + 0.8;
        }
        y += 3;
        continue;
      }
      // ------------------------------------------------------------------- Aşama 54: yığılmış durum çubukları
      if (b.kind === 'stack') {
        const STACK_FILL: Record<PdfTone, [number, number, number]> = {
          success: [16, 150, 105],
          info: [37, 99, 235],
          warning: [217, 119, 6],
          danger: [220, 38, 38],
          muted: [203, 213, 225],
        };
        if (b.title) {
          ensure(12);
          doc.setFont(F, 'bold');
          doc.setFontSize(9);
          doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]); // Aşama 272
          doc.text(t(b.title), M, y + 3.5);
          y += 5.5;
        }
        const labelW = 52;
        const barX = M + labelW + 3;
        const rightW = 46;
        const barW = W - M - barX - rightW - 2;
        for (const it of b.items) {
          doc.setFont(F, 'bold');
          doc.setFontSize(7.8);
          const lines = (doc.splitTextToSize(t(it.label), labelW) as string[]).slice(0, 2);
          doc.setFont(F, 'normal');
          doc.setFontSize(6.3);
          const subLines = it.sub ? (doc.splitTextToSize(t(it.sub), labelW) as string[]).slice(0, 2) : [];
          const rh = Math.max(8, lines.length * 3.4 + subLines.length * 2.9 + 2);
          ensure(rh + 1);
          doc.setFont(F, 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(30, 41, 59);
          doc.text(lines, M, y + 3.2);
          if (subLines.length) {
            doc.setFont(F, 'normal');
            doc.setFontSize(6.3);
            doc.setTextColor(100, 116, 139);
            doc.text(subLines, M, y + 3.2 + lines.length * 3.4);
          }
          const total = it.parts.reduce((a, p) => a + Math.max(0, p.value), 0);
          const by = y + rh / 2 - 2;
          doc.setFillColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]); // Aşama 272
          doc.roundedRect(barX, by, barW, 4, 1.2, 1.2, 'F');
          if (total > 0) {
            let x = barX;
            for (const p of it.parts) {
              if (p.value <= 0) continue;
              const w = (barW * p.value) / total;
              const c = p.rgb || STACK_FILL[p.tone];
              doc.setFillColor(c[0], c[1], c[2]);
              doc.rect(x, by, w, 4, 'F');
              if (w >= 6) {
                doc.setFont(F, 'bold');
                doc.setFontSize(6.2);
                if (p.tone === 'muted') doc.setTextColor(71, 85, 105);
                else doc.setTextColor(255, 255, 255);
                doc.text(String(p.value), x + w / 2, by + 2.9, { align: 'center' });
              }
              x += w;
            }
          }
          if (it.right) {
            doc.setFont(F, 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(30, 41, 59);
            doc.text(doc.splitTextToSize(t(it.right), rightW) as string[], W - M - rightW, by + 2.9);
          }
          doc.setDrawColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]);
          doc.setLineWidth(0.15);
          doc.line(M, y + rh, W - M, y + rh);
          y += rh + 0.8;
        }
        if (b.legend?.length) {
          ensure(6);
          let x = M;
          doc.setFont(F, 'normal');
          doc.setFontSize(7);
          for (const l of b.legend) {
            const c = l.rgb || STACK_FILL[l.tone];
            doc.setFillColor(c[0], c[1], c[2]);
            doc.rect(x, y + 1.2, 3, 2.4, 'F');
            doc.setTextColor(55, 65, 81);
            const label = t(l.label);
            doc.text(label, x + 4, y + 3.4);
            x += 9 + doc.getTextWidth(label);
          }
          y += 6;
        }
        y += 3;
        continue;
      }
      if (b.kind === 'title') {
        // Aşama 53: uzun başlık / alt başlık sayfa dışına taşmaz, alt satıra geçer
        doc.setFont(F, 'bold');
        doc.setFontSize(16);
        const tl = doc.splitTextToSize(t(b.text), W - 2 * M) as string[];
        ensure(10 + tl.length * 6.5);
        doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]); // Aşama 272
        doc.text(tl, M, y + 4);
        y += 4 + tl.length * 6.5;
        if (b.sub) {
          doc.setFont(F, 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
          const sl = doc.splitTextToSize(t(b.sub), W - 2 * M) as string[];
          doc.text(sl, M, y + 1);
          y += sl.length * 4.2 + 1;
        }
        // Aşama 272: B ayracı — kısa kurum rengi, ardından ince gri çizgi
        doc.setFillColor(vurgu[0], vurgu[1], vurgu[2]);
        doc.rect(M, y + 0.6, 18, 0.8, 'F');
        doc.setFillColor(B_LINE[0], B_LINE[1], B_LINE[2]);
        doc.rect(M + 18, y + 0.85, W - 2 * M - 18, 0.3, 'F');
        y += 5;
        continue;
      }
      if (b.kind === 'kv') {
        // Aşama 53: değerler ölçülerek yazılır; uzun değer alt satırlara geçer ve satır yüksekliği ona göre büyür
        // (eskiden uzun değer bir sonraki satırın / başlığın üstüne biniyordu)
        doc.setFontSize(9);
        const colW = (W - 2 * M) / 2;
        const lineH = 4;
        for (let i = 0; i < b.rows.length; i += 2) {
          const pair = b.rows.slice(i, i + 2);
          doc.setFont(F, 'bold');
          const wrapped = pair.map(([, v]) => doc.splitTextToSize(t(v), colW - 32) as string[]);
          const rowH = Math.max(1, ...wrapped.map((l) => l.length)) * lineH + 1.5;
          ensure(rowH + 1);
          pair.forEach(([k], j) => {
            const x = M + j * colW;
            doc.setFont(F, 'normal');
            doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
            doc.text(t(`${k}:`), x, y + 3);
            doc.setFont(F, 'bold');
            doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]);
            doc.text(wrapped[j], x + 30, y + 3);
          });
          y += rowH;
        }
        y += 2;
        continue;
      }
      if (b.kind === 'heading') {
        // Aşama 53: uzun başlık (ör. kazanım metni) sayfa dışına taşmaz, alt satıra geçer.
        // Başlık sayfanın en altında tek başına kalmasın diye ardından gelecek içerik için de yer aranır.
        doc.setFont(F, 'bold');
        doc.setFontSize(11);
        const hl = doc.splitTextToSize(t(b.text), W - 2 * M - 2.6) as string[];
        doc.setFont(F, 'normal');
        doc.setFontSize(8.2);
        const sl = b.sub ? (doc.splitTextToSize(t(b.sub), W - 2 * M - 2.6) as string[]) : [];
        const h = 3 + hl.length * 4.8 + sl.length * 3.6 + 2;
        ensure(h + (b.minFollow ?? 18));
        // Aşama 272: B bölüm başlığı — koyu kalın yazı, solda kurum renginde kısa çizgi
        doc.setFont(F, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(B_FG[0], B_FG[1], B_FG[2]);
        doc.setFillColor(vurgu[0], vurgu[1], vurgu[2]);
        doc.roundedRect(M, y + 1.6, 1, 4, 0.5, 0.5, 'F');
        doc.text(hl, M + 2.6, y + 5);
        y += 3 + hl.length * 4.8;
        if (sl.length) {
          doc.setFont(F, 'normal');
          doc.setFontSize(8.2);
          doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
          doc.text(sl, M + 2.6, y + 2.6);
          y += sl.length * 3.6;
        }
        y += 2;
        continue;
      }
      if (b.kind === 'callout') {
        const tone = b.tone || 'info';
        const pad = 3;
        const innerW = W - 2 * M - 2 * pad;
        doc.setFontSize(7.8);
        const prepared = b.lines.map((ln) => {
          if (typeof ln === 'string') {
            doc.setFont(F, 'normal');
            return { label: '', labelW: 0, lines: doc.splitTextToSize(t(ln), innerW) as string[], tone: undefined as PdfTone | undefined };
          }
          doc.setFont(F, 'bold');
          const label = t(ln.label);
          const labelW = Math.min(40, doc.getTextWidth(label) + 3);
          doc.setFont(F, 'normal');
          return { label, labelW, lines: doc.splitTextToSize(t(ln.text), innerW - labelW) as string[], tone: ln.tone };
        });
        const bodyH = prepared.reduce((a, p) => a + p.lines.length * 3.5 + 0.8, 0);
        const h = pad + 5 + bodyH + pad - 1;
        ensure(h + 3);
        // Aşama 272: B not kutusu — açık zemin, ince gri çerçeve, solda tonun renginde şerit
        const txt = TONE_TEXT[tone];
        doc.setFillColor(B_SURFACE[0], B_SURFACE[1], B_SURFACE[2]);
        doc.setDrawColor(B_LINE[0], B_LINE[1], B_LINE[2]);
        doc.setLineWidth(0.2);
        doc.roundedRect(M, y, W - 2 * M, h, 2.5, 2.5, 'FD');
        doc.setFillColor(txt[0], txt[1], txt[2]);
        doc.roundedRect(M + 0.8, y + 2, 1, h - 4, 0.5, 0.5, 'F');
        doc.setFont(F, 'bold');
        doc.setFontSize(8.6);
        doc.setTextColor(txt[0], txt[1], txt[2]);
        doc.text(t(b.title), M + pad, y + pad + 3);
        let yy = y + pad + 7.5;
        doc.setFontSize(7.8);
        for (const p of prepared) {
          if (p.label) {
            const c = p.tone ? TONE_TEXT[p.tone] : txt;
            doc.setFont(F, 'bold');
            doc.setTextColor(c[0], c[1], c[2]);
            doc.text(p.label, M + pad, yy);
          }
          doc.setFont(F, 'normal');
          doc.setTextColor(B_FG2[0], B_FG2[1], B_FG2[2]);
          doc.text(p.lines, M + pad + p.labelW, yy);
          yy += p.lines.length * 3.5 + 0.8;
        }
        y += h + 4;
        continue;
      }
      if (b.kind === 'text') {
        doc.setFont(F, 'normal');
        doc.setFontSize(8.8);
        const c = b.tone ? TONE_TEXT[b.tone] : B_FG2; // Aşama 272
        doc.setTextColor(c[0], c[1], c[2]);
        const lines = doc.splitTextToSize(t(b.text), W - 2 * M) as string[];
        ensure(lines.length * 4 + 2);
        doc.text(lines, M, y + 3);
        y += lines.length * 4 + 2;
        continue;
      }
      if (b.kind === 'table') {
        ensure(16);
        const columnStyles: Record<number, any> = {};
        b.head.forEach((_, i) => {
          columnStyles[i] = { halign: b.align?.[i] || 'left' };
          const w = b.widths?.[i];
          if (w !== undefined) columnStyles[i].cellWidth = w;
        });
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M, top: TOP, bottom: 16 },
          head: [b.head.map(t)],
          body: b.rows.map((r) => r.map((c) => t(c))),
          // Aşama 53: uzun hücre metni alt satıra geçer (sayfa dışına taşmaz); başlık her sayfada tekrarlanır
          // Aşama 272: B tablosu — yalnız yatay ince çizgiler, açık gri başlık, gri küçük başlık yazısı
          theme: 'plain',
          styles: { font: F, fontSize: b.fontSize || 8.2, cellPadding: 1.6, textColor: B_FG2, lineColor: B_LINE, lineWidth: { bottom: 0.15, top: 0, left: 0, right: 0 }, valign: 'middle', overflow: 'linebreak' },
          headStyles: { font: F, fillColor: B_SURFACE, textColor: B_MUTED, fontStyle: 'bold', fontSize: Math.max(6.4, (b.fontSize || 8.2) - 1), lineColor: B_LINE, lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 } },
          showHead: 'everyPage',
          rowPageBreak: 'avoid',
          columnStyles,
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            if (b.stripe) data.cell.styles.fillColor = data.row.index % 2 ? b.stripe : [255, 255, 255];
            // Aşama 135: ders renkli tablo
            if (b.rowColors) {
              const rc = b.rowColors[data.row.index];
              data.cell.styles.fillColor = rc === null ? B_SURFACE : [255, 255, 255];
              data.cell.styles.minCellHeight = 6.4;
              if (rc === null) data.cell.styles.fontStyle = 'bold';
              const ci = data.column.index;
              if (ci === 0) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, left: 3.6, right: 1.6 };
                data.cell.styles.textColor = B_FG; // Aşama 272: ders adı koyu, rengi soldaki işarette
              } else if (ci === b.head.length - 1) {
                const v = String(data.cell.raw ?? '');
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = v.startsWith('+') ? [22, 163, 74] : v.startsWith('-') ? [220, 38, 38] : B_MUTED;
              } else if (ci === b.rateColumn) {
                data.cell.styles.halign = 'right';
              } else if (b.head[ci] === 'Net') {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = B_FG;
              } else if (b.head[ci] === 'D') data.cell.styles.textColor = [22, 163, 74];
              else if (b.head[ci] === 'Y') data.cell.styles.textColor = [220, 38, 38];
              return;
            }
            // Aşama 272: B — satır boyanmaz, yalnız durum sütunu renkli kalın yazılır
            const tone = b.rowTones?.[data.row.index];
            if (tone) {
              if (data.column.index === (b.toneColumn ?? b.head.length - 1)) {
                data.cell.styles.textColor = TONE_TEXT[tone];
                data.cell.styles.fontStyle = 'bold';
              }
            }
            // Aşama 54: hücre rengi
            const ct = b.cellTones?.[data.row.index]?.[data.column.index];
            if (ct) {
              // Aşama 272: hücre renkli kalın yazı + çok açık ton (ekrandaki renkli yazı gibi)
              data.cell.styles.fillColor = tintB(TONE_TEXT[ct], 0.08);
              data.cell.styles.textColor = TONE_TEXT[ct];
              data.cell.styles.fontStyle = 'bold';
            }
          },
          didDrawCell: b.rowColors
            ? (data: any) => {
                if (data.section !== 'body') return;
                const rc = b.rowColors![data.row.index];
                const c = data.cell;
                if (data.column.index === 0 && rc) {
                  // Aşama 272: ders rengi yuvarlak işaret (birleştirilmiş karnedeki gibi)
                  doc.setFillColor(rc[0], rc[1], rc[2]);
                  doc.circle(c.x + 1.9, c.y + c.height / 2, 0.9, 'F');
                }
                if (data.column.index === b.rateColumn) {
                  const m = /(\d+)/.exec(String(data.cell.raw ?? ''));
                  const rate = m ? Math.min(100, Number(m[1])) : 0;
                  const bw = Math.max(4, c.width - 13);
                  const bx = c.x + 1.8;
                  const by = c.y + c.height / 2 - 1;
                  const col = rc || [71, 85, 105];
                  doc.setFillColor(B_TRACK[0], B_TRACK[1], B_TRACK[2]);
                  doc.roundedRect(bx, by, bw, 2, 1, 1, 'F');
                  if (rate > 0) {
                    doc.setFillColor(col[0], col[1], col[2]);
                    doc.roundedRect(bx, by, Math.max(2, (bw * rate) / 100), 2, 1, 1, 'F');
                  }
                }
              }
            : undefined,
        });
        y = ((doc as any).lastAutoTable?.finalY || y) + 5;
        continue;
      }
      if (b.kind === 'line') {
        const vals = b.series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
        if (!vals.length || !b.labels.length) continue;
        let minV = b.yMin ?? Math.min(...vals);
        let maxV = b.yMax ?? Math.max(...vals);
        if (maxV - minV < 1) {
          minV -= 1;
          maxV += 1;
        }
        const h = 48;
        const f = chartFrame(b.title, minV, maxV, h);
        const n = b.labels.length;
        const xAt = (i: number) => (n === 1 ? (f.left + f.right) / 2 : f.left + 4 + ((f.right - f.left - 8) * i) / (n - 1));
        const yAt = (v: number) => f.bottom - ((v - minV) / (maxV - minV)) * h;
        doc.setFontSize(6.6);
        doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
        // Aşama 272: ilk ve son etiket kenara yaslanır (sayfa dışına taşmaz)
        b.labels.forEach((l, i) => {
          const al = n > 1 && i === 0 ? 'left' : n > 1 && i === n - 1 ? 'right' : 'center';
          const x = al === 'left' ? xAt(i) - 4 : al === 'right' ? xAt(i) + 4 : xAt(i);
          doc.text(t(l).slice(0, 18), x, f.bottom + 4, { align: al });
        });
        // Aşama 272: B çizgi grafiği — ilk dizi kalın kurum rengi (beyaz halkalı nokta), diğerleri ince gri;
        // gri diziler önce çizilir, ana dizi üstte kalır
        const sira = b.series.map((_, i) => i).reverse();
        sira.forEach((si) => {
          const s = b.series[si];
          const c = diziRenk(si, b.series.length, b.colors);
          // ders renkli / çok dizili grafikte bütün çizgiler eşit ve düz; aksi halde ilk dizi ana çizgi
          const ana = si === 0 || !!b.colors || b.series.length > 3;
          doc.setDrawColor(c[0], c[1], c[2]);
          doc.setFillColor(c[0], c[1], c[2]);
          doc.setLineWidth(ana ? 0.8 : 0.45);
          if (!ana) doc.setLineDashPattern([1.2, 0.9], 0);
          let prev: [number, number] | null = null;
          s.values.forEach((v, i) => {
            if (v === null || !Number.isFinite(v)) {
              prev = null;
              return;
            }
            const p: [number, number] = [xAt(i), yAt(v)];
            if (prev) doc.line(prev[0], prev[1], p[0], p[1]);
            prev = p;
          });
          doc.setLineDashPattern([], 0);
          s.values.forEach((v, i) => {
            if (v === null || !Number.isFinite(v)) return;
            if (ana) {
              doc.setFillColor(255, 255, 255);
              doc.circle(xAt(i), yAt(v), 1.25, 'F');
              doc.setFillColor(c[0], c[1], c[2]);
              doc.circle(xAt(i), yAt(v), 0.85, 'F');
            } else doc.circle(xAt(i), yAt(v), 0.6, 'F');
          });
        });
        y = f.bottom + 7;
        if (b.series.length > 1 || b.series[0]?.name) {
          drawLegend(b.series.map((s) => s.name), M + 10, y + 1, b.colors);
          y += 5;
        }
        y += 3;
        continue;
      }
      if (b.kind === 'bar') {
        const vals = b.series.flatMap((s) => s.values);
        if (!vals.length || !b.labels.length) continue;
        // Aşama 135: 3 boyutlu sütunlarda üstte değer yazısı için pay
        const maxV = Math.max(1, ...vals) * (b.solid ? 1.12 : 1);
        const minV = Math.min(0, ...vals);
        const h = 48;
        const f = chartFrame(b.title, minV, maxV, h);
        const groupW = (f.right - f.left) / b.labels.length;
        const barW = Math.min(8, (groupW * 0.8) / b.series.length);
        const yAt = (v: number) => f.bottom - ((v - minV) / (maxV - minV)) * h;
        if (b.solid) {
          // Aşama 272: B sütunları — düz, üstü yuvarlak; öğrenci sütunu ders renginde, karşılaştırmalar gri
          const GRI = B_GRI;
          const fillC = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
          const bw = barW * 0.82;
          b.labels.forEach((l, i) => {
            const gx = f.left + groupW * i + groupW / 2;
            doc.setFontSize(6.6);
            doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
            doc.text(t(l).slice(0, 14), gx, f.bottom + 4, { align: 'center' });
            b.series.forEach((s, si) => {
              const v = Math.max(0, s.values[i] ?? 0);
              const c = si === 0 ? b.solid!.colors[i] || B_FG2 : GRI[(si - 1) % GRI.length];
              const x = gx - (barW * b.series.length) / 2 + si * barW;
              const y0 = yAt(Math.max(0, minV));
              const y1 = Math.min(y0 - 0.3, yAt(v));
              const hh = y0 - y1;
              const rr = Math.min(0.9, bw / 2, hh / 2);
              fillC(c);
              doc.roundedRect(x, y1, bw, hh, rr, rr, 'F');
              if (hh > rr * 2) doc.rect(x, y0 - rr, bw, rr, 'F'); // alt köşeler düz
              if (si === 0) {
                doc.setFont(F, 'bold');
                doc.setFontSize(6.6);
                doc.setTextColor(c[0], c[1], c[2]);
                doc.text(v.toLocaleString("tr-TR", { maximumFractionDigits: 2 }), x + bw / 2, y1 - 1, { align: 'center' });
                doc.setFont(F, 'normal');
              }
            });
          });
          y = f.bottom + 7;
          // açıklama: öğrenci (ders renkleri) + gri diziler
          let lx = M + 10;
          doc.setFontSize(7.5);
          b.solid.colors.slice(0, 6).forEach((c, ci) => {
            fillC(c);
            doc.circle(lx + 0.9 + ci * 1.5, y - 0.1, 0.75, 'F');
          });
          lx += Math.min(6, b.solid.colors.length) * 1.5 + 1.5;
          doc.setTextColor(B_FG2[0], B_FG2[1], B_FG2[2]);
          doc.text(t(b.series[0]?.name || ''), lx, y + 1);
          lx += doc.getTextWidth(t(b.series[0]?.name || '')) + 6;
          b.series.slice(1).forEach((s, si) => {
            fillC(GRI[si % GRI.length]);
            doc.circle(lx + 1.2, y - 0.1, 1.2, 'F');
            doc.text(t(s.name), lx + 4, y + 1);
            lx += 9 + doc.getTextWidth(t(s.name));
          });
          y += 8;
          continue;
        }
        doc.setFontSize(6.8);
        b.labels.forEach((l, i) => {
          const gx = f.left + groupW * i + groupW / 2;
          doc.setTextColor(B_MUTED[0], B_MUTED[1], B_MUTED[2]);
          doc.text(t(l).slice(0, 14), gx, f.bottom + 4, { align: 'center' });
          b.series.forEach((s, si) => {
            // Aşama 272: B sütunları — ilk dizi kurum renginde, karşılaştırmalar gri, üstü yuvarlak
            const v = s.values[i] ?? 0;
            const c = diziRenk(si, b.series.length);
            doc.setFillColor(c[0], c[1], c[2]);
            const x = gx - (barW * b.series.length) / 2 + si * barW;
            const y0 = yAt(Math.max(0, minV));
            const y1 = yAt(v);
            const hh = Math.max(0.3, Math.abs(y0 - y1));
            const rr = Math.min(0.8, (barW * 0.82) / 2, hh / 2);
            doc.roundedRect(x, Math.min(y0, y1), barW * 0.82, hh, rr, rr, 'F');
          });
        });
        y = f.bottom + 7;
        if (b.series.length > 1) {
          drawLegend(b.series.map((s) => s.name), M + 10, y + 1);
          y += 5;
        }
        y += 3;
        continue;
      }
    }
  }

  const pages = doc.getNumberOfPages();
  // Aşama 99b: KURUM BAŞLIĞI — her sayfada solda logo (özgün renk ve oranıyla, kırpılmadan / esnetilmeden),
  // yanında kurum adı ve belgenin adı, sağda tarih; altında ince kurum çizgisi. Logo PDF'e bir kez gömülür.
  const brand = getKurumBrand();
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  let logo: { fmt: 'PNG' | 'JPEG'; w: number; h: number } | null = null;
  if (brand.logo) {
    try {
      const pr = doc.getImageProperties(brand.logo);
      const ratio = pr && pr.height ? pr.width / pr.height : 1;
      let lh = 15;
      let lw = lh * ratio;
      if (lw > 46) {
        lw = 46;
        lh = lw / ratio;
      }
      logo = { fmt: brand.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', w: lw, h: lh };
    } catch {
      logo = null; // logo okunamazsa yalnızca ad yazılır
    }
  }
  let part = 0;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    while (part + 1 < starts.length && starts[part + 1] <= p) part++;
    const footerLabel = parts[part]?.footer || '';
    const partEnd = part + 1 < starts.length ? starts[part + 1] - 1 : pages;
    const pageNo = p - (starts[part] ?? 1) + 1;
    const pageCount = partEnd - (starts[part] ?? 1) + 1;
    if (ownPages.has(p)) continue; // Aşama 135: tek sayfa karne başlığını ve alt yazısını kendisi çizer
    if (brand.name || logo) {
      let x = M;
      if (logo) {
        try {
          doc.addImage(brand.logo, logo.fmt, M, 3 + (15 - logo.h) / 2, logo.w, logo.h, 'kurum-logo', 'FAST');
          x = M + logo.w + 3.5;
          // logo ile yazı arasında ince ayraç
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.line(x - 1.75, 5, x - 1.75, 16.5);
        } catch {
          /* logo çizilemezse yalnızca ad */
        }
      }
      const maxW = W - M - x - 34;
      if (brand.name) {
        doc.setFont(F, 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 27, 75);
        const nm = doc.splitTextToSize(t(brand.name), maxW)[0] || '';
        doc.text(nm, x, 10);
      }
      doc.setFont(F, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const sub = doc.splitTextToSize(t(footerLabel.charAt(0).toLocaleUpperCase('tr-TR') + footerLabel.slice(1)), maxW)[0] || '';
      doc.text(sub, x, brand.name ? 14.5 : 11);
      doc.text(t(today), W - M, 10, { align: 'right' });
      // kurum çizgisi: koyu ve açık iki ton
      // Aşama 135: logo varsa başlık altı çizgisi logonun ana rengi (mor değil)
      if (renk) doc.setFillColor(renk.zemin[0], renk.zemin[1], renk.zemin[2]);
      else doc.setFillColor(79, 70, 229);
      doc.rect(M, 19.6, 34, 0.9, 'F');
      doc.setFillColor(224, 231, 255);
      doc.rect(M + 34, 19.9, W - 2 * M - 34, 0.35, 'F');
    }
    doc.setFont(F, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(t(`${footerLabel} · ${new Date().toLocaleDateString('tr-TR')} tarihinde hazırlandı`), M, H - 8);
    doc.text(t(`${pageNo} / ${pageCount}`), W - M, H - 8, { align: 'right' });
  }
  return doc;
}

export const safeFileName = (s: string) =>
  (s || 'karne')
    .replace(/ı/g, 'i') // Aşama 154: "ı" ayrışmaz, eskiden siliniyordu ("Yılmaz" -> "Ylmaz")
    .replace(/İ/g, 'I')
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'karne';

export async function downloadKarnePdf(blocks: PdfBlock[], footerLabel: string, fileName: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<void> {
  const doc = await buildKarnePdf(blocks, footerLabel, orientation);
  doc.save(`${safeFileName(fileName)}.pdf`);
}

export async function karnePdfBase64(blocks: PdfBlock[], footerLabel: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<string> {
  const doc = await buildKarnePdf(blocks, footerLabel, orientation);
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf(',') + 1);
}

export async function karnePartsBlob(parts: KarnePart[], orientation: 'portrait' | 'landscape' = 'portrait'): Promise<Blob> {
  const doc = await buildKarnePdfParts(parts, orientation);
  return doc.output('blob');
}

export async function karnePdfBlob(blocks: PdfBlock[], footerLabel: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<Blob> {
  const doc = await buildKarnePdf(blocks, footerLabel, orientation);
  return doc.output('blob');
}
