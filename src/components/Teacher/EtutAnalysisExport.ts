import type { ReportTable } from './EtutAnalysisData';

// ============================================================================
// Etüt Analizi: Excel (.xlsx) çıktısı
// Her sayfa: üstte rapor bilgileri, ardından tablo. Başlıklar Türkçe.
// ============================================================================

export interface ExcelSheet {
  name: string; // en fazla 31 karakter
  table: ReportTable;
  meta?: Array<[string, string]>; // tablo üstünde gösterilecek bilgi satırları
}

export async function downloadExcel(fileName: string, sheets: ExcelSheet[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const aoa: Array<Array<string | number>> = [];
    if (sh.meta?.length) {
      sh.meta.forEach(([k, v]) => aoa.push([k, v]));
      aoa.push([]);
    }
    aoa.push(sh.table.head);
    if (sh.table.rows.length) aoa.push(...sh.table.rows);
    else aoa.push(['Kayıt yok']);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sh.table.head.map((h, i) => {
      const longest = Math.max(
        h.length,
        ...sh.table.rows.slice(0, 500).map((r) => String(r[i] ?? '').length),
        i === 0 && sh.meta ? Math.max(...sh.meta.map(([k]) => k.length)) : 0
      );
      return { wch: Math.min(Math.max(longest + 2, 6), 42) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}
