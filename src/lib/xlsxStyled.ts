// ============================================================================
// Aşama 120: RENKLİ EXCEL (.xlsx) YAZICI — satır renkleri (zebra / grup rengi), kalın başlık, ince kenarlık.
// Sistemdeki xlsx kütüphanesinin ücretsiz sürümü hücre rengi yazamaz; bu küçük yazıcı aynı dosya biçimini
// doğrudan üretir ve zaten projede olan fflate ile sıkıştırır. Hız: ağır xlsx kütüphanesi (yüzlerce KB)
// indirilmez; fflate yalnız "Excel indir"e basınca iner. Dosya Excel, LibreOffice ve Google E-Tablolar'da açılır.
// ============================================================================

/** Hücre görünümü: title = büyük kalın başlık, head = tablo başlığı, bold = kalın, zebra = açık renk satır,
 *  plain = beyaz satır (kenarlıklı), g0..g7 = grup renkleri (kenarlıklı) */
export type CellStyle = 'title' | 'head' | 'bold' | 'zebra' | 'plain' | `g${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;
export type Cell = string | number | null | undefined | { v: string | number | null | undefined; s?: CellStyle };
export interface StyledSheet {
  name: string;
  rows: Cell[][];
  cols?: number[]; // sütun genişlikleri (karakter)
}

/** Grup renkleri: açık, yazıyı bozmayan tonlar (gül, turuncu, sarı, yeşil, camgöbeği, mavi, mor, pembe) */
export const GROUP_COLORS = ['FFE4E6', 'FFEDD5', 'FEF9C3', 'DCFCE7', 'CFFAFE', 'DBEAFE', 'EDE9FE', 'FAE8FF'];
export const groupStyle = (i: number): CellStyle => `g${(i % GROUP_COLORS.length) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;

const ZEBRA = 'EEF2FF'; // açık çivit (sistemin marka rengine yakın)
const HEAD = 'E2E8F0';
const STYLE_INDEX: Record<string, number> = { plainNoBorder: 0, title: 1, bold: 2, head: 3, plain: 4, zebra: 5 };
GROUP_COLORS.forEach((_, i) => (STYLE_INDEX[`g${i}`] = 6 + i));

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML'de izin verilmeyen denetim karakterleri atılır
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const colName = (i: number) => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function stylesXml(): string {
  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    fill(HEAD),
    fill(ZEBRA),
    ...GROUP_COLORS.map(fill),
  ];
  // xf: fontId, fillId, borderId
  const xf = (font: number, fillId: number, border: number) =>
    `<xf numFmtId="0" fontId="${font}" fillId="${fillId}" borderId="${border}" xfId="0"${font ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}><alignment vertical="center"/></xf>`;
  const xfs = [
    xf(0, 0, 0), // 0 düz
    xf(2, 0, 0), // 1 başlık (büyük kalın)
    xf(1, 0, 0), // 2 kalın
    xf(1, 2, 1), // 3 tablo başlığı
    xf(0, 0, 1), // 4 beyaz satır
    xf(0, 3, 1), // 5 zebra
    ...GROUP_COLORS.map((_, i) => xf(0, 4 + i, 1)), // 6.. grup renkleri
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>' +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function sheetXml(sh: StyledSheet): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
  if (sh.cols?.length) out.push(`<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  out.push('<sheetData>');
  sh.rows.forEach((row, ri) => {
    const r = ri + 1;
    const cells: string[] = [];
    row.forEach((cell, ci) => {
      const o = cell !== null && typeof cell === 'object' ? cell : { v: cell };
      const s = o.s ? STYLE_INDEX[o.s] || 0 : 0;
      const ref = `${colName(ci)}${r}`;
      const sAttr = s ? ` s="${s}"` : '';
      if (typeof o.v === 'number' && Number.isFinite(o.v)) cells.push(`<c r="${ref}"${sAttr}><v>${o.v}</v></c>`);
      else if (o.v === null || o.v === undefined || o.v === '') {
        if (s) cells.push(`<c r="${ref}"${sAttr}/>`); // boş ama renkli hücre (satır rengi kesintisiz)
      } else cells.push(`<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(o.v))}</t></is></c>`);
    });
    out.push(`<row r="${r}">${cells.join('')}</row>`);
  });
  out.push('</sheetData></worksheet>');
  return out.join('');
}

/** Excel sayfa adı: yasak karakterler atılır, 31 karakter, aynı ad tekrar edilmez */
export function safeSheetName(raw: string, used: Set<string>): string {
  const base = (raw || 'Liste').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 28) || 'Liste';
  let name = base;
  let i = 2;
  while (used.has(name.toLocaleLowerCase('tr-TR'))) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
}

/** Sayfaları .xlsx olarak indirir (sayfa adları çağıran tarafta safeSheetName ile hazırlanmalı) */
export async function downloadStyledXlsx(fileName: string, sheets: StyledSheet[]): Promise<void> {
  const { zipSync, strToU8 } = await import('fflate');
  const list = sheets.length ? sheets : [{ name: 'Liste', rows: [['Kayıt yok']] }];
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        list.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    ),
    'xl/styles.xml': strToU8(stylesXml()),
  };
  list.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  const data = zipSync(files, { level: 6 });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
