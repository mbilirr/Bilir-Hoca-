// ============================================================================
// Aşama 221: Rapor tablolarını yazdırma (A4, siyah-beyaz). Yeni boş pencereye düz HTML yazılır,
// tarayıcının yazdırma penceresi açılır ("PDF olarak kaydet" de buradan). Komut dosyası çalıştırılmaz.
// ============================================================================

export interface YazdirTablo {
  baslik?: string;
  head: string[];
  rows: Array<Array<string | number>>;
  /** Bu sütundan itibaren sayılar sağa yaslı */
  sayiDan?: number;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function tabloYazdir(p: { kurum?: string; baslik: string; alt?: string; tablolar: YazdirTablo[]; yatay?: boolean }): boolean {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false; // açılır pencere engellendi
  const tablo = (t: YazdirTablo) => `
    ${t.baslik ? `<h2>${esc(t.baslik)}</h2>` : ''}
    <table>
      <thead><tr>${t.head.map((h, i) => `<th class="${t.sayiDan !== undefined && i >= t.sayiDan ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${
        t.rows.length
          ? t.rows
              .map((r) => `<tr>${r.map((c, i) => `<td class="${t.sayiDan !== undefined && i >= t.sayiDan ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`)
              .join('')
          : `<tr><td colspan="${t.head.length}">Kayıt yok</td></tr>`
      }</tbody>
    </table>`;
  const zaman = new Date().toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  w.document.open();
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(p.baslik)}</title>
<style>
  @page { size: A4 ${p.yatay ? 'landscape' : 'portrait'}; margin: 10mm; }
  body { font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif; color: #000; font-size: 9pt; margin: 0; }
  .head { border-bottom: 1.5pt solid #000; padding-bottom: 5pt; margin-bottom: 8pt; }
  .kurum { font-size: 9pt; }
  h1 { font-size: 14pt; margin: 2pt 0 0; }
  .alt { font-size: 10pt; margin-top: 2pt; }
  h2 { font-size: 10.5pt; margin: 10pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6pt; font-size: 8.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 0.5pt solid #666; padding: 2.5pt 4pt; text-align: left; vertical-align: top; }
  th { background: #e8e8e8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .foot { margin-top: 6mm; border-top: 0.5pt solid #888; padding-top: 3pt; font-size: 8pt; display: flex; justify-content: space-between; }
</style></head><body>
<div class="head">${p.kurum ? `<div class="kurum">${esc(p.kurum)}</div>` : ''}<h1>${esc(p.baslik)}</h1>${p.alt ? `<div class="alt">${esc(p.alt)}</div>` : ''}</div>
${p.tablolar.map(tablo).join('')}
<div class="foot"><span>biliredu</span><span>${esc(zaman)}</span></div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* kullanıcı pencereyi kapattı */
    }
  }, 250);
  return true;
}
