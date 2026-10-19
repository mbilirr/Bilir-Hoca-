// ============================================================================
// DENEME ANALİZİ (Aşama 47) — KARNE PDF'İ
// Karne, bloklardan oluşan bir modelden çizilir: başlık, bilgi satırları, tablo, çizgi ve sütun grafiği, not.
// Türkçe karakterler için uygulamanın gömülü yazı tipi kullanılır.
// ============================================================================

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
      /** Aşama 53: satır rengiyle yazılacak sütun (verilmezse son sütun) */
      toneColumn?: number;
      /** Aşama 54: hücre hücre renk (ısı tablosu, şık dağılımı). Satır rengini o hücrede ezer. */
      cellTones?: Array<Array<PdfTone | null | undefined>>;
    }
  // Aşama 54: yığılmış durum çubuğu (ör. ders ders kazanıldı / gelişiyor / eksik / sorulmadı)
  | {
      kind: 'stack';
      title?: string;
      items: Array<{ label: string; sub?: string; parts: Array<{ value: number; tone: PdfTone }>; right?: string }>;
      legend?: Array<{ label: string; tone: PdfTone }>;
    }
  | { kind: 'line'; title: string; labels: string[]; series: Array<{ name: string; values: Array<number | null> }>; yMin?: number; yMax?: number }
  | { kind: 'bar'; title: string; labels: string[]; series: Array<{ name: string; values: number[] }> }
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
  | { kind: 'rates'; title?: string; items: Array<{ label: string; sub?: string; rate: number; marker?: number | null; tone: PdfTone; right?: string }> };

const PALETTE: Array<[number, number, number]> = [
  [79, 70, 229],
  [16, 150, 105],
  [217, 119, 6],
  [220, 38, 38],
  [14, 165, 233],
  [139, 92, 246],
  [100, 116, 139],
];
const TONE_FILL: Record<PdfTone, [number, number, number]> = {
  success: [220, 252, 231],
  info: [219, 234, 254],
  warning: [254, 243, 199],
  danger: [254, 226, 226],
  muted: [241, 245, 249],
};
const TONE_TEXT: Record<PdfTone, [number, number, number]> = {
  success: [21, 128, 61],
  info: [29, 78, 216],
  warning: [180, 83, 9],
  danger: [185, 28, 28],
  muted: [100, 116, 139],
};

export async function buildKarnePdf(blocks: PdfBlock[], footerLabel: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  const [{ jsPDF }, autoTableMod, fonts, analytics] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('../pdfFonts'),
    import('../../utils/questionAnalytics'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const fontOk = fonts.registerTurkishPdfFont(doc);
  const F = fontOk ? fonts.PDF_FONT : 'helvetica';
  const t = (s: unknown) => (fontOk ? analytics.cleanForPdfFont(s) : String(s ?? '').replace(/[^\x20-\x7E]/g, ''));
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = 14;

  const ensure = (need: number) => {
    if (y + need > H - 16) {
      doc.addPage();
      y = 16;
    }
  };

  const drawLegend = (names: string[], x0: number, yy: number) => {
    let x = x0;
    doc.setFontSize(7.5);
    names.forEach((n, i) => {
      const c = PALETTE[i % PALETTE.length];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(x, yy - 2.2, 3, 2.2, 'F');
      doc.setTextColor(55, 65, 81);
      const label = t(n);
      doc.text(label, x + 4, yy);
      x += 8 + doc.getTextWidth(label);
    });
  };

  const chartFrame = (title: string, minV: number, maxV: number, h: number) => {
    ensure(h + 14);
    doc.setFont(F, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 27, 75);
    doc.text(t(title), M, y + 4);
    doc.setFont(F, 'normal');
    const top = y + 8;
    const left = M + 10;
    const right = W - M;
    const bottom = top + h;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    for (let k = 0; k <= 4; k++) {
      const v = minV + ((maxV - minV) * k) / 4;
      const yy = bottom - (h * k) / 4;
      doc.line(left, yy, right, yy);
      doc.text(String(Math.round(v * 10) / 10).replace('.', ','), left - 1.5, yy + 1, { align: 'right' });
    }
    return { top, left, right, bottom };
  };

  for (const b of blocks) {
    if (b.kind === 'pagebreak') {
      doc.addPage();
      y = 16;
      continue;
    }
    // ------------------------------------------------------------------- Aşama 50: başlık bandı
    if (b.kind === 'hero') {
      ensure(42);
      const x0 = M;
      const w = W - 2 * M;
      const h = 34;
      doc.setFillColor(67, 56, 202);
      doc.roundedRect(x0, y, w, h, 4, 4, 'F');
      doc.setFillColor(79, 70, 229);
      doc.roundedRect(x0 + w - 72, y, 72, h, 4, 4, 'F'); // sağ bölüm (puan ve sıralar) biraz açık ton
      doc.setTextColor(199, 210, 254);
      doc.setFont(F, 'bold');
      doc.setFontSize(7.5);
      doc.text(t(b.eyebrow.toLocaleUpperCase('tr-TR')), x0 + 6, y + 7);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text(t(b.title), x0 + 6, y + 15, { maxWidth: w - 80 });
      doc.setFont(F, 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(224, 231, 255);
      doc.text(t(b.sub), x0 + 6, y + 21, { maxWidth: w - 80 });
      // çipler
      doc.setFontSize(7.4);
      let cx0 = x0 + 6;
      for (const c of b.chips.filter(Boolean)) {
        const label = t(c);
        const cw = Math.min(70, doc.getTextWidth(label) + 5);
        if (cx0 + cw > x0 + w - 78) break;
        doc.setFillColor(99, 102, 241);
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
      doc.setTextColor(67, 56, 202);
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
        doc.setFillColor(99, 102, 241);
        doc.roundedRect(sx, yy, 30, 8.2, 2, 2, 'F');
        doc.setTextColor(199, 210, 254);
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
        const fill = it.tone ? TONE_FILL[it.tone] : ([248, 250, 252] as [number, number, number]);
        const txt = it.tone ? TONE_TEXT[it.tone] : ([15, 23, 42] as [number, number, number]);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.roundedRect(x, y, tw, th, 2.5, 2.5, 'FD');
        doc.setFont(F, 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(100, 116, 139);
        doc.text(t(it.label.toLocaleUpperCase('tr-TR')), x + 2.5, y + 4.3, { maxWidth: tw - 4 });
        doc.setFontSize(13);
        doc.setTextColor(txt[0], txt[1], txt[2]);
        doc.text(t(it.value), x + 2.5, y + 11);
        if (it.sub) {
          doc.setFont(F, 'normal');
          doc.setFontSize(6.4);
          doc.setTextColor(100, 116, 139);
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
        doc.setTextColor(30, 27, 75);
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
          const fill: [number, number, number] = c.mark === 'D' ? [16, 150, 105] : c.mark === 'Y' ? [220, 38, 38] : [241, 245, 249];
          doc.setFillColor(fill[0], fill[1], fill[2]);
          doc.setDrawColor(226, 232, 240);
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
        doc.setTextColor(30, 27, 75);
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
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(barX, by, barW, 2.8, 1.4, 1.4, 'F');
        const c = TONE_TEXT[it.tone];
        doc.setFillColor(c[0], c[1], c[2]);
        doc.roundedRect(barX, by, Math.max(1.2, (barW * Math.max(0, Math.min(100, it.rate))) / 100), 2.8, 1.4, 1.4, 'F');
        if (it.marker !== null && it.marker !== undefined) {
          const mx = barX + (barW * Math.max(0, Math.min(100, it.marker))) / 100;
          doc.setDrawColor(30, 41, 59);
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
        doc.setDrawColor(241, 245, 249);
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
        doc.setTextColor(30, 27, 75);
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
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(barX, by, barW, 4, 1.2, 1.2, 'F');
        if (total > 0) {
          let x = barX;
          for (const p of it.parts) {
            if (p.value <= 0) continue;
            const w = (barW * p.value) / total;
            const c = STACK_FILL[p.tone];
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
        doc.setDrawColor(241, 245, 249);
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
          const c = STACK_FILL[l.tone];
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
      doc.setTextColor(30, 27, 75);
      doc.text(tl, M, y + 4);
      y += 4 + tl.length * 6.5;
      if (b.sub) {
        doc.setFont(F, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        const sl = doc.splitTextToSize(t(b.sub), W - 2 * M) as string[];
        doc.text(sl, M, y + 1);
        y += sl.length * 4.2 + 1;
      }
      doc.setDrawColor(199, 210, 254);
      doc.setLineWidth(0.4);
      doc.line(M, y + 1, W - M, y + 1);
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
          doc.setTextColor(100, 116, 139);
          doc.text(t(`${k}:`), x, y + 3);
          doc.setFont(F, 'bold');
          doc.setTextColor(15, 23, 42);
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
      const hl = doc.splitTextToSize(t(b.text), W - 2 * M) as string[];
      doc.setFont(F, 'normal');
      doc.setFontSize(8.2);
      const sl = b.sub ? (doc.splitTextToSize(t(b.sub), W - 2 * M) as string[]) : [];
      const h = 3 + hl.length * 4.8 + sl.length * 3.6 + 2;
      ensure(h + (b.minFollow ?? 18));
      doc.setFont(F, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(67, 56, 202);
      doc.text(hl, M, y + 5);
      y += 3 + hl.length * 4.8;
      if (sl.length) {
        doc.setFont(F, 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(100, 116, 139);
        doc.text(sl, M, y + 2.6);
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
      const fill = TONE_FILL[tone];
      const txt = TONE_TEXT[tone];
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.setDrawColor(txt[0], txt[1], txt[2]);
      doc.setLineWidth(0.25);
      doc.roundedRect(M, y, W - 2 * M, h, 2.5, 2.5, 'FD');
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
        doc.setTextColor(51, 65, 85);
        doc.text(p.lines, M + pad + p.labelW, yy);
        yy += p.lines.length * 3.5 + 0.8;
      }
      y += h + 4;
      continue;
    }
    if (b.kind === 'text') {
      doc.setFont(F, 'normal');
      doc.setFontSize(8.8);
      const c = b.tone ? TONE_TEXT[b.tone] : ([55, 65, 81] as [number, number, number]);
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
        margin: { left: M, right: M, top: 16, bottom: 16 },
        head: [b.head.map(t)],
        body: b.rows.map((r) => r.map((c) => t(c))),
        theme: 'grid',
        // Aşama 53: uzun hücre metni alt satıra geçer (sayfa dışına taşmaz); başlık her sayfada tekrarlanır
        styles: { font: F, fontSize: b.fontSize || 8.2, cellPadding: 1.6, textColor: [55, 65, 81], lineColor: [226, 232, 240], lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
        headStyles: { font: F, fillColor: [67, 56, 202], textColor: [255, 255, 255], fontStyle: 'bold' },
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        columnStyles,
        didParseCell: (data: any) => {
          if (data.section !== 'body') return;
          const tone = b.rowTones?.[data.row.index];
          if (tone) {
            data.cell.styles.fillColor = TONE_FILL[tone];
            if (data.column.index === (b.toneColumn ?? b.head.length - 1)) {
              data.cell.styles.textColor = TONE_TEXT[tone];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Aşama 54: hücre rengi
          const ct = b.cellTones?.[data.row.index]?.[data.column.index];
          if (ct) {
            data.cell.styles.fillColor = TONE_FILL[ct];
            data.cell.styles.textColor = TONE_TEXT[ct];
            data.cell.styles.fontStyle = 'bold';
          }
        },
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
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      b.labels.forEach((l, i) => doc.text(t(l).slice(0, 18), xAt(i), f.bottom + 4, { align: 'center' }));
      b.series.forEach((s, si) => {
        const c = PALETTE[si % PALETTE.length];
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setFillColor(c[0], c[1], c[2]);
        doc.setLineWidth(0.6);
        let prev: [number, number] | null = null;
        s.values.forEach((v, i) => {
          if (v === null || !Number.isFinite(v)) {
            prev = null;
            return;
          }
          const p: [number, number] = [xAt(i), yAt(v)];
          if (prev) doc.line(prev[0], prev[1], p[0], p[1]);
          doc.circle(p[0], p[1], 0.9, 'F');
          prev = p;
        });
      });
      y = f.bottom + 7;
      if (b.series.length > 1 || b.series[0]?.name) {
        drawLegend(b.series.map((s) => s.name), M + 10, y + 1);
        y += 5;
      }
      y += 3;
      continue;
    }
    if (b.kind === 'bar') {
      const vals = b.series.flatMap((s) => s.values);
      if (!vals.length || !b.labels.length) continue;
      const maxV = Math.max(1, ...vals);
      const minV = Math.min(0, ...vals);
      const h = 48;
      const f = chartFrame(b.title, minV, maxV, h);
      const groupW = (f.right - f.left) / b.labels.length;
      const barW = Math.min(8, (groupW * 0.8) / b.series.length);
      const yAt = (v: number) => f.bottom - ((v - minV) / (maxV - minV)) * h;
      doc.setFontSize(6.8);
      b.labels.forEach((l, i) => {
        const gx = f.left + groupW * i + groupW / 2;
        doc.setTextColor(100, 116, 139);
        doc.text(t(l).slice(0, 14), gx, f.bottom + 4, { align: 'center' });
        b.series.forEach((s, si) => {
          const v = s.values[i] ?? 0;
          const c = PALETTE[si % PALETTE.length];
          doc.setFillColor(c[0], c[1], c[2]);
          const x = gx - (barW * b.series.length) / 2 + si * barW;
          const y0 = yAt(Math.max(0, minV));
          const y1 = yAt(v);
          doc.rect(x, Math.min(y0, y1), barW * 0.9, Math.max(0.3, Math.abs(y0 - y1)), 'F');
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

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(F, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(t(`${footerLabel} · ${new Date().toLocaleDateString('tr-TR')} tarihinde hazırlandı`), M, H - 8);
    doc.text(t(`${p} / ${pages}`), W - M, H - 8, { align: 'right' });
  }
  return doc;
}

export const safeFileName = (s: string) =>
  (s || 'karne')
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

export async function karnePdfBlob(blocks: PdfBlock[], footerLabel: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<Blob> {
  const doc = await buildKarnePdf(blocks, footerLabel, orientation);
  return doc.output('blob');
}
