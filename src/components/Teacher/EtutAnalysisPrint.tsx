import React, { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import type { ReportTable } from './EtutAnalysisData';

// ============================================================================
// Etüt Analizi: yazdırma görünümü
// Ekranda gizlidir; yazdırırken (Ctrl+P veya "Yazdır / PDF") sayfadaki diğer her
// şey gizlenir ve yalnızca bu rapor A4 üzerine siyah-beyaz basılır. Tarayıcının
// "PDF olarak kaydet" seçeneği Türkçe karakterleri sorunsuz korur.
// ============================================================================

export const REPORT_INSTITUTION = 'Eğitim & Öğrenci Takip Sistemi';

const PRINT_CSS = `
.etut-print-area { display: none; }
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 10mm 14mm 10mm;
    @bottom-right { content: "Sayfa " counter(page) " / " counter(pages); font-size: 8pt; color: #444; }
  }
  html, body {
    background: #fff !important;
    overflow: visible !important;
    height: auto !important;
  }
  body > *:not(.etut-print-area) { display: none !important; }
  .etut-print-area {
    display: block !important;
    color: #000;
    background: #fff;
    font-family: "Inter", "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  .etut-print-area * { color: #000; box-shadow: none !important; }
  .etut-print-area .ep-head { border-bottom: 1.5pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; }
  .etut-print-area .ep-inst { font-size: 9pt; letter-spacing: .02em; }
  .etut-print-area h1 { font-size: 15pt; font-weight: 700; margin: 2pt 0 0; }
  .etut-print-area .ep-sub { font-size: 11pt; font-weight: 600; margin-top: 2pt; }
  .etut-print-area h2 { font-size: 11pt; font-weight: 700; margin: 12pt 0 4pt; break-after: avoid; page-break-after: avoid; }
  .etut-print-area .ep-meta { display: grid; grid-template-columns: max-content 1fr; gap: 1pt 10pt; margin: 6pt 0 0; font-size: 9pt; }
  .etut-print-area .ep-meta dt { font-weight: 600; }
  .etut-print-area .ep-meta dd { margin: 0; }
  .etut-print-area .ep-kpis { display: flex; flex-wrap: wrap; gap: 6pt; margin: 8pt 0 2pt; }
  .etut-print-area .ep-kpi { border: 0.75pt solid #555; border-radius: 3pt; padding: 4pt 8pt; min-width: 32mm; }
  .etut-print-area .ep-kpi b { display: block; font-size: 13pt; }
  .etut-print-area .ep-kpi span { font-size: 8pt; }
  .etut-print-area .ep-counts { font-size: 9pt; margin: 4pt 0 0; }
  .etut-print-area .ep-note { font-size: 8.5pt; font-style: italic; margin: 4pt 0 0; }
  .etut-print-area table { width: 100%; border-collapse: collapse; margin: 2pt 0 6pt; font-size: 8.5pt; }
  .etut-print-area thead { display: table-header-group; }
  .etut-print-area tr { break-inside: avoid; page-break-inside: avoid; }
  .etut-print-area th, .etut-print-area td { border: 0.5pt solid #666; padding: 2.5pt 4pt; text-align: left; vertical-align: top; }
  .etut-print-area th { background: #e8e8e8 !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .etut-print-area td.n, .etut-print-area th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .etut-print-area .ep-sign { display: flex; justify-content: space-between; gap: 20mm; margin-top: 18mm; break-inside: avoid; page-break-inside: avoid; font-size: 9pt; }
  .etut-print-area .ep-sign div { flex: 1; border-top: 0.75pt solid #000; padding-top: 3pt; text-align: center; }
  .etut-print-area .ep-foot { margin-top: 8mm; border-top: 0.5pt solid #888; padding-top: 3pt; font-size: 8pt; display: flex; justify-content: space-between; }
}
`;

export interface PrintReportProps {
  title: string;
  subtitle: string;
  meta: Array<[string, string]>;
  kpis: Array<[string, string]>;
  countsLine: string;
  notes: string[];
  tables: ReportTable[];
}

const nowText = () => new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });

export const EtutAnalysisPrint: React.FC<PrintReportProps> = ({ title, subtitle, meta, kpis, countsLine, notes, tables }) => {
  // Yazdırma anındaki saat (pencere uzun süre açık kalsa da doğru görünsün)
  const [printedAt, setPrintedAt] = useState(nowText);
  useEffect(() => {
    const onBefore = () => flushSync(() => setPrintedAt(nowText()));
    window.addEventListener('beforeprint', onBefore);
    return () => window.removeEventListener('beforeprint', onBefore);
  }, []);
  return createPortal(
    <div className="etut-print-area" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <header className="ep-head">
        <div className="ep-inst">{REPORT_INSTITUTION}</div>
        <h1>{title}</h1>
        <div className="ep-sub">{subtitle}</div>
        <dl className="ep-meta">
          {meta.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </header>

      <div className="ep-kpis">
        {kpis.map(([k, v]) => (
          <div className="ep-kpi" key={k}>
            <b>{v}</b>
            <span>{k}</span>
          </div>
        ))}
      </div>
      <p className="ep-counts">{countsLine}</p>
      {notes.map((n) => (
        <p className="ep-note" key={n}>
          {n}
        </p>
      ))}

      {tables.map((t) => (
        <section key={t.title}>
          <h2>{t.title}</h2>
          <table>
            <thead>
              <tr>
                {t.head.map((h, i) => (
                  <th key={i} className={t.numericFrom != null && i >= t.numericFrom ? 'n' : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.length === 0 ? (
                <tr>
                  <td colSpan={t.head.length}>Kayıt yok.</td>
                </tr>
              ) : (
                t.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className={t.numericFrom != null && ci >= t.numericFrom ? 'n' : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ))}

      <div className="ep-sign">
        <div>Etüt sorumlusu</div>
        <div>Okul yönetimi</div>
      </div>
      <footer className="ep-foot">
        <span>{REPORT_INSTITUTION}</span>
        <span>Yazdırılma: {printedAt}</span>
      </footer>
    </div>,
    document.body
  );
};
