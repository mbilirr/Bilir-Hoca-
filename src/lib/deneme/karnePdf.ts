// ============================================================================
// DENEME ANALİZİ (Aşama 47) — KARNE PDF'İ
// Karne, bloklardan oluşan bir modelden çizilir: başlık, bilgi satırları, tablo, çizgi ve sütun grafiği, not.
// Türkçe karakterler için uygulamanın gömülü yazı tipi kullanılır.
// ============================================================================

export type PdfTone = 'success' | 'info' | 'warning' | 'danger' | 'muted';

export type PdfBlock =
  | { kind: 'title'; text: string; sub?: string }
  | { kind: 'kv'; rows: Array<[string, string]> }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string; tone?: PdfTone }
  | {
      kind: 'table';
      head: string[];
      rows: Array<Array<string | number>>;
      align?: Array<'left' | 'center' | 'right'>;
      rowTones?: Array<PdfTone | null>;
      widths?: Array<number | 'auto'>;
      fontSize?: number;
    }
  | { kind: 'line'; title: string; labels: string[]; series: Array<{ name: string; values: Array<number | null> }>; yMin?: number; yMax?: number }
  | { kind: 'bar'; title: string; labels: string[]; series: Array<{ name: string; values: number[] }> }
  | { kind: 'pagebreak' };

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

export async function buildKarnePdf(blocks: PdfBlock[], footerLabel: string) {
  const [{ jsPDF }, autoTableMod, fonts, analytics] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('../pdfFonts'),
    import('../../utils/questionAnalytics'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
    if (b.kind === 'title') {
      ensure(18);
      doc.setFont(F, 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 27, 75);
      doc.text(t(b.text), M, y + 4);
      y += 8;
      if (b.sub) {
        doc.setFont(F, 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        doc.text(t(b.sub), M, y + 2);
        y += 5;
      }
      doc.setDrawColor(199, 210, 254);
      doc.setLineWidth(0.4);
      doc.line(M, y + 1, W - M, y + 1);
      y += 5;
      continue;
    }
    if (b.kind === 'kv') {
      doc.setFontSize(9);
      const colW = (W - 2 * M) / 2;
      b.rows.forEach(([k, v], i) => {
        if (i % 2 === 0) ensure(6);
        const x = M + (i % 2) * colW;
        doc.setFont(F, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(t(`${k}:`), x, y + 3);
        doc.setFont(F, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(t(v), x + 30, y + 3, { maxWidth: colW - 32 });
        if (i % 2 === 1 || i === b.rows.length - 1) y += 5.5;
      });
      y += 2;
      continue;
    }
    if (b.kind === 'heading') {
      ensure(12);
      doc.setFont(F, 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(67, 56, 202);
      doc.text(t(b.text), M, y + 5);
      y += 8;
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
      ensure(14);
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
        styles: { font: F, fontSize: b.fontSize || 8.2, cellPadding: 1.6, textColor: [55, 65, 81], lineColor: [226, 232, 240], lineWidth: 0.15, valign: 'middle' },
        headStyles: { font: F, fillColor: [67, 56, 202], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles,
        didParseCell: (data: any) => {
          if (data.section !== 'body' || !b.rowTones) return;
          const tone = b.rowTones[data.row.index];
          if (tone) {
            data.cell.styles.fillColor = TONE_FILL[tone];
            if (data.column.index === b.head.length - 1) data.cell.styles.textColor = TONE_TEXT[tone];
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

export async function downloadKarnePdf(blocks: PdfBlock[], footerLabel: string, fileName: string): Promise<void> {
  const doc = await buildKarnePdf(blocks, footerLabel);
  doc.save(`${safeFileName(fileName)}.pdf`);
}

export async function karnePdfBase64(blocks: PdfBlock[], footerLabel: string): Promise<string> {
  const doc = await buildKarnePdf(blocks, footerLabel);
  const uri = doc.output('datauristring');
  return uri.slice(uri.indexOf(',') + 1);
}

export async function karnePdfBlob(blocks: PdfBlock[], footerLabel: string): Promise<Blob> {
  const doc = await buildKarnePdf(blocks, footerLabel);
  return doc.output('blob');
}
