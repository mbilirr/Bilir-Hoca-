import { PLAN_DAYS, dateOfDay, shortDayLabel, weekRangeLabel, type PlanItem } from '../services/studyPlanService';

// ============================================================================
// Haftalık çalışma planı: PDF ve Excel çıktısı (Aşama 19)
// ============================================================================

export interface PlanExportContext {
  studentName: string;
  className?: string;
  weekStart: string;
  items: PlanItem[];
  showStatus?: boolean; // öğrenciye gönderilmişse "Yapıldı / Bekliyor" sütunu
}

const safeName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'ogrenci';
const fileBase = (c: PlanExportContext) => `Haftalik-Plan_${safeName(c.studentName)}_${c.weekStart}`;

const byDay = (items: PlanItem[]) =>
  Array.from({ length: 7 }, (_, d) => items.filter((i) => i.day === d).sort((a, b) => a.position - b.position || a.subject.localeCompare(b.subject, 'tr')));

// ----------------------------------------------------------------------------- Excel
export async function downloadPlanExcel(c: PlanExportContext): Promise<void> {
  const XLSX = await import('xlsx');
  const head = ['Gün', 'Tarih', 'Ders', 'Kitap', 'Yapılacaklar', 'Veren öğretmen', ...(c.showStatus ? ['Durum'] : [])];
  const days = byDay(c.items);
  const rows: Array<Array<string>> = [];
  days.forEach((list, d) => {
    const date = shortDayLabel(dateOfDay(c.weekStart, d));
    if (!list.length) rows.push([PLAN_DAYS[d], date, '', '', '', '', ...(c.showStatus ? [''] : [])]);
    list.forEach((i, idx) =>
      rows.push([
        idx === 0 ? PLAN_DAYS[d] : '',
        idx === 0 ? date : '',
        i.subject,
        i.book,
        i.note,
        i.createdByName,
        ...(c.showStatus ? [i.doneAt ? 'Yapıldı' : 'Bekliyor'] : []),
      ])
    );
  });
  const aoa: Array<Array<string>> = [
    ['Öğrenci', c.studentName],
    ['Sınıf', c.className || ''],
    ['Hafta', weekRangeLabel(c.weekStart)],
    [],
    head,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = head.map((h, i) => ({ wch: Math.min(Math.max(h.length + 2, [12, 12, 18, 28, 50, 20, 12][i] || 12), 60) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Haftalık Plan');
  XLSX.writeFile(wb, `${fileBase(c)}.xlsx`);
}

// ----------------------------------------------------------------------------- PDF
export async function downloadPlanPdf(c: PlanExportContext): Promise<void> {
  const [{ jsPDF }, autoTableMod, fonts, analytics] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./pdfFonts'),
    import('../utils/questionAnalytics'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fontOk = fonts.registerTurkishPdfFont(doc);
  const F = fontOk ? fonts.PDF_FONT : 'helvetica';
  const t = (s: unknown) => (fontOk ? analytics.cleanForPdfFont(s) : String(s ?? '').replace(/[^\x20-\x7E]/g, ''));
  doc.setFont(F, 'normal');
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;

  doc.setFont(F, 'bold');
  doc.setFontSize(17);
  doc.setTextColor(30, 27, 75);
  doc.text(t('Haftalık Çalışma Planı'), M, 16);
  doc.setFont(F, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  doc.text(t(`Öğrenci: ${c.studentName}${c.className ? `   ·   Sınıf: ${c.className}` : ''}`), M, 23);
  doc.text(t(`Hafta: ${weekRangeLabel(c.weekStart)}`), M, 28.5);
  doc.setDrawColor(199, 210, 254);
  doc.line(M, 31.5, pageW - M, 31.5);

  const days = byDay(c.items);
  const body: any[] = [];
  days.forEach((list, d) => {
    const dayCell = { content: t(`${PLAN_DAYS[d]}\n${shortDayLabel(dateOfDay(c.weekStart, d))}`), rowSpan: Math.max(1, list.length), styles: { fontStyle: 'bold', fillColor: [238, 242, 255], valign: 'top' } };
    if (!list.length) {
      body.push([dayCell, { content: t('Görev yok'), colSpan: 5, styles: { textColor: [156, 163, 175] } }]);
      return;
    }
    list.forEach((i, idx) => {
      const row: any[] = [];
      if (idx === 0) row.push(dayCell);
      row.push(t(i.subject), t(i.book || '-'), t(i.note || '-'), t(i.createdByName || ''), c.showStatus ? t(i.doneAt ? 'Yapıldı' : '') : '');
      body.push(row);
    });
  });

  autoTable(doc, {
    startY: 35,
    margin: { left: M, right: M, top: 16, bottom: 16 },
    head: [[t('Gün'), t('Ders'), t('Kitap'), t('Yapılacaklar'), t('Veren'), t(c.showStatus ? 'Durum' : 'Yapıldı')]],
    body,
    theme: 'grid',
    styles: { font: F, fontSize: 8.6, cellPadding: 2, textColor: [55, 65, 81], lineColor: [209, 213, 219], lineWidth: 0.15, valign: 'middle' },
    headStyles: { font: F, fillColor: [67, 56, 202], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 28, fontStyle: 'bold' }, 2: { cellWidth: 36 }, 3: { cellWidth: 'auto' }, 4: { cellWidth: 24 }, 5: { cellWidth: 16, halign: 'center' } },
    // Öğrenci planı elle işaretleyebilsin diye boş kutu çizilir (gönderilmiş planda durum yazılıdır)
    didDrawCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 5 && !c.showStatus) {
        doc.setDrawColor(107, 114, 128);
        doc.rect(data.cell.x + data.cell.width / 2 - 2, data.cell.y + data.cell.height / 2 - 2, 4, 4);
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(F, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const h = doc.internal.pageSize.getHeight();
    doc.text(t(`${new Date().toLocaleDateString('tr-TR')} tarihinde hazırlandı`), M, h - 8);
    doc.text(t(`${p} / ${pages}`), pageW - M, h - 8, { align: 'right' });
  }
  doc.save(`${fileBase(c)}.pdf`);
}
