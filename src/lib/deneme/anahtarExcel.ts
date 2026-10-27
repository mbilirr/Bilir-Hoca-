// ============================================================================
// DENEME ANALİZİ (Aşama 47) — YAYINEVİ EXCEL ŞABLONUNDAN CEVAP ANAHTARI VE KAZANIMLAR
// "LGS Sınav Oluşturma Şablonu" (K12) biçimi: her ders için bir başlık satırı (TÜRKÇE, MATEMATİK…),
// altında "Soru No | Cevap | B Karşılığı | … | K12 KAZANIM | Konu" tablosu.
// Başlık ve sütun yerleri sabit kabul edilmez; satırlar taranarak bulunur.
// ============================================================================
import type { ExamQuestion, ExamQuestions, ExamSubject } from './lgs';
import { foldTr, guessSubjectKey } from './optik';
// Aşama 89: ızgara / PDF okuyucusu yalnızca dosya seçilince yüklenir (deneme ekranının açılışı hafif kalır)
import type { BMode, LRow, LSheet } from './anahtarDuzen';
type Duzen = typeof import('./anahtarDuzen');

export interface ExcelKeyResult {
  examName: string;
  examDate: string; // YYYY-AA-GG ya da boş
  questions: ExamQuestions;
  found: string[]; // bulunan ders anahtarları
  warnings: string[];
  method?: 'baslik' | 'sira' | 'yz' | ''; // ders başlıklarından / soru sırasından / yapay zekâ ile
  rawText?: string; // yapay zekâya verilecek tablo metni (yalnızca anahtar dosyasının hücreleri)
  textCells?: number; // Aşama 49d: uzun metinli hücre sayısı (dosyada kazanım yazılı olabilir mi?)
  // Aşama 89: A / B kitapçıklı anahtarlar
  bKeys?: Record<string, string>; // B kitapçığının cevapları B sırasıyla (kontrol kutusuna da yazılır)
  bModes?: Record<string, BMode>; // B eşleşmesinin nasıl bulunduğu
  source?: 'excel' | 'pdf';
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

function toDateStr(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = cellText(v);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

// ----------------------------------------------------------------------------- Aşama 49d: esnek okuma
// Yayınevlerinin Excel'leri çok farklıdır. Sütunlar başlık kelimelerinden bulunur; ders adı başlık satırının
// bir hücresinde ("TÜRKÇE | A KİTAPÇIĞI | B | … | KAZANIM KONU | KAZANIM"), tek başına bir satırda ya da her
// satırdaki "Ders / Alt ders" sütununda olabilir. Kazanım kodu ayrı sütunda olmayabilir; metnin başındaki
// "T.8.3.5.1." gibi kod ayrılır. Hiçbiri bulunamazsa yapay zekâ devreye girer (AnahtarEditor).

type Cols = { no: number; ans: number; b: number; code: number; text: number; konu: number; ders: number };
const NO_COLS: Cols = { no: -1, ans: -1, b: -1, code: -1, text: -1, konu: -1, ders: -1 };

const hdr = (c: string) => foldTr(c).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Satır bir tablo başlığı mı? Öyleyse sütunlar ve (varsa) ders adı */
function headerOf(cells: string[]): { cols: Cols; subject: string | null; subjectCol: number } | null {
  const h = cells.map(hdr);
  const cols: Cols = { ...NO_COLS };
  let hits = 0;
  let strong = 0; // tek harf ("A", "B") olmayan başlık kelimeleri
  let subject: string | null = null;
  let subjectCol = -1;
  h.forEach((c, i) => {
    if (!c) return;
    const take = (k: keyof Cols) => {
      if (cols[k] < 0) {
        cols[k] = i;
        hits++;
        if (c.length > 2) strong++;
      }
    };
    if (/^soru ?no|^soru$|^no$|^sira ?no|^sira$|^s no$/.test(c)) take('no');
    else if (/^cevap|^dogru cevap|^a kitap|^a kit|^anahtar|^a$|^a cevap|^cvp|^a grub/.test(c)) take('ans');
    else if (/^b karsil|^b kitap|^b kit|^b$|^b no|^b soru|^b grub|^b cevap/.test(c)) take('b');
    else if (/kazanim kod|^kod$|^kod no|^kazanim no|kazanim numara/.test(c)) take('code');
    else if (/konu/.test(c)) take('konu');
    else if (/^alt ders|^ders$|^ders adi|^brans/.test(c)) take('ders');
    else if (/kazanim|ogrenme ciktisi|^cikti/.test(c) && !/\bid\b|kimlik|video|url/.test(c)) take('text');
    else if (subjectCol < 0 && c.length < 40) {
      const k = guessSubjectKey(cells[i]);
      if (k) {
        subject = k;
        subjectCol = i;
      }
    }
  });
  // En az cevap ya da soru no sütunu ve bir başlık daha (ya da ders adı) olmalı. Veri satırı (sayı içeren)
  // başlık sanılmasın: sayılı satırda en az 3 güçlü başlık kelimesi aranır.
  const numeric = cells.filter((x) => /^\d+([.,]\d+)?$/.test(x)).length;
  if ((cols.ans < 0 && cols.no < 0) || hits + (subject ? 1 : 0) < 2 || strong < 1) return null;
  if (numeric > 0 && strong < 3) return null;
  if (cols.no < 0 && subjectCol >= 0) cols.no = subjectCol; // "TÜRKÇE" sütununun altında soru numaraları
  return { cols, subject, subjectCol };
}

const CODE_RE = /^\s*((?:[A-Za-zÇĞİÖŞÜçğıöşü]{1,4}\s*\.\s*)?\d{1,2}(?:\s*\.\s*\d{1,2}){1,4})\.?\s*[-–:)]?\s*(.*)$/s;

/** Hücrelerden kazanım kodu, metni ve konusunu çıkarır */
export function splitKazanim(codeCell: string, textCell: string, konuCell: string): { code: string; text: string } {
  let code = '';
  let text = '';
  const c = cellText(codeCell);
  const t = cellText(textCell);
  if (c) {
    const m = CODE_RE.exec(c);
    if (m) {
      code = m[1].replace(/\s+/g, '');
      if (m[2] && m[2].length > 3) text = m[2];
    } else text = c; // kod sütununda metin yazılmış
  }
  if (t) {
    const m = CODE_RE.exec(t);
    if (m && m[2] && m[2].length > 3) {
      if (!code) code = m[1].replace(/\s+/g, '');
      text = m[2];
    } else if (!m) text = text ? `${text} ${t}` : t;
  }
  const konu = cellText(konuCell);
  if (konu && foldTr(konu) !== foldTr(text)) text = text ? `${text} (${konu})` : konu;
  return { code: code.slice(0, 60), text: text.slice(0, 600) };
}

// Aşama 89: tek harf "İ" de iptal sayılır (bazı yayınevleri böyle yazar)
const ansOfCell = (v: unknown): string => {
  const s = cellText(v).toLocaleUpperCase('tr-TR');
  if (/^[A-E]$/.test(s)) return s;
  if (/^(X|İ|I|İPTAL|IPTAL|\*)$/.test(s)) return 'X';
  return '';
};
const intOfCell = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(cellText(v));
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : 0;
};

/** Excel sayfalarının satırlarından cevap anahtarı (dosya okuma dışındaki her şey; test edilebilir) */
export function parseKeySheets(sheets: Array<{ name: string; rows: unknown[][] }>, subjects?: ExamSubject[]): ExcelKeyResult {
  const questions: ExamQuestions = {};
  const warnings: string[] = [];
  let examName = '';
  let examDate = '';
  const seenTwice = new Set<string>();
  // Aşama 89: "Soru | A | B" tablolarında B sütunu numara değil B kitapçığının cevabıysa
  const bLetters = new Map<string, Map<number, string>>();

  for (const sh of sheets) {
    const rows = sh.rows;
    let current: string | null = null;
    let col: Cols | null = null;
    const startSubject = (key: string, label: string) => {
      current = key;
      if (questions[key]?.length && !seenTwice.has(key)) {
        seenTwice.add(key);
        warnings.push(`"${label}" dersi Excel'de iki kez geçiyor; ikincisi kullanıldı.`);
      }
      questions[key] = [];
    };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const cells = row.map(cellText);
      const filled = cells.map((c, idx) => ({ c, idx })).filter((x) => x.c);
      if (!filled.length) continue;
      const first = foldTr(filled[0].c);

      // Sınav bilgileri
      if (/^sinav adi/.test(first)) {
        const right = filled[1] && !/^sinav|:$/.test(foldTr(filled[1].c)) ? filled[1].c : '';
        const nm = right || cellText(rows[i + 1]?.[filled[0].idx]);
        if (nm && !/^sinav/.test(foldTr(nm))) examName = examName || nm;
      }
      if (/tarih/.test(cells.map(foldTr).join(' '))) {
        const dIdx = cells.findIndex((c) => /tarih/.test(foldTr(c)));
        for (let j = dIdx + 1; j < row.length; j++) {
          const d = toDateStr(row[j]);
          if (d) {
            examDate = examDate || d;
            break;
          }
        }
      }

      // Tablo başlığı (ders adı içinde olabilir)
      const h = headerOf(cells);
      if (h) {
        col = h.cols;
        if (h.subject) startSubject(h.subject, cells[h.subjectCol]);
        continue;
      }

      // Ders başlığı: tek dolu hücre, büyük harf, bilinen bir ders
      if (filled.length === 1 && filled[0].c.length < 60 && !/^\d/.test(filled[0].c) && filled[0].c === filled[0].c.toLocaleUpperCase('tr-TR')) {
        const key = guessSubjectKey(filled[0].c);
        if (key) {
          startSubject(key, filled[0].c);
          continue;
        }
      }

      // Soru satırı
      const c = col || { ...NO_COLS, no: 0, ans: 1, b: 2 };
      let subj: string | null = current;
      if (c.ders >= 0 && cells[c.ders]) {
        const k = guessSubjectKey(cells[c.ders]);
        if (k) {
          subj = k;
          if (!questions[k]) questions[k] = [];
        }
      }
      if (!subj) continue;
      const no = c.no >= 0 ? intOfCell(row[c.no]) : intOfCell(row[filled[0].idx]);
      let ans = c.ans >= 0 ? ansOfCell(row[c.ans]) : '';
      if (!ans && c.ans < 0) {
        const f = row.findIndex((v, k) => k !== c.no && !!ansOfCell(v));
        ans = f >= 0 ? ansOfCell(row[f]) : '';
      }
      if (!no || !ans) continue;
      const list = (questions[subj] = questions[subj] || []);
      if (list.some((q) => q.no === no)) continue;
      const q: ExamQuestion = { no, answer: ans };
      const bVal = c.b >= 0 ? intOfCell(row[c.b]) : 0;
      if (bVal) q.bNo = bVal;
      else if (c.b >= 0) {
        const bl = ansOfCell(row[c.b]);
        if (bl) bLetters.set(subj, (bLetters.get(subj) || new Map<number, string>()).set(no, bl));
      }
      // Aşama 48d: Excel'deki kazanım doğrudan KULLANILMAZ; yalnızca bankadaki MEB kazanımını bulmak için saklanır
      const kz = splitKazanim(c.code >= 0 ? cells[c.code] : '', c.text >= 0 ? cells[c.text] : '', c.konu >= 0 ? cells[c.konu] : '');
      if (kz.code) q.srcCode = kz.code;
      if (kz.text) q.srcText = kz.text;
      list.push(q);
    }
  }

  for (const k of Object.keys(questions)) {
    if (!questions[k].length) delete questions[k];
    else questions[k].sort((a, b) => a.no - b.no);
  }
  let found = Object.keys(questions);
  let method: ExcelKeyResult['method'] = found.length ? 'baslik' : '';
  const bKeys: Record<string, string> = {};
  for (const [k, m] of bLetters) {
    if (!questions[k] || questions[k].some((q) => q.bNo)) continue;
    const n = subjects?.find((s) => s.key === k)?.count || Math.max(...m.keys());
    bKeys[k] = Array.from({ length: n }, (_, i) => m.get(i + 1) || ' ').join('');
  }

  // Aşama 48e: ders başlığı olmayan dosyalar (ör. "1-20, 1-10, … " diye alt alta sıralanmış cevaplar)
  if (!found.length && subjects && subjects.length) {
    for (const sh of sheets) {
      const r = parseAnswerBlocks(sh.rows, subjects);
      if (r) {
        Object.assign(questions, r.questions);
        warnings.push(...r.warnings);
        found = Object.keys(r.questions);
        method = 'sira';
        break;
      }
    }
  }

  // Yapay zekâ için tablo metni (yalnızca cevap anahtarı dosyasının hücreleri; kişisel bilgi yoktur).
  // Cevaplar bulunsa da hazırlanır: kazanımlar okunamadıysa yapay zekâ yalnızca kazanımları tamamlar.
  let rawText = '';
  let textCells = 0;
  for (const sh of sheets) {
    for (const row of sh.rows) for (const v of row || []) if (/[a-zçğıöşü]{3}/i.test(cellText(v)) && cellText(v).length >= 25) textCells++;
    // Aşama 89: sondaki boş hücreler dizi üzerinde atılır (eski düzenli ifade, arada çok boş hücre olan satırlarda donuyordu)
    const lines = sh.rows
      .map((row) => {
        const cs = (row || []).map(cellText);
        let end = cs.length;
        while (end > 0 && !cs[end - 1]) end--;
        return cs.slice(0, end).join(' | ');
      })
      .filter((l) => l.replace(/[\s|]/g, ''));
    rawText += `### Sayfa: ${sh.name}\n${lines.slice(0, 400).join('\n')}\n`;
    if (rawText.length > 40000) break;
  }
  rawText = rawText.slice(0, 40000);
  if (!found.length) warnings.push('Excel dosyasında cevap anahtarı tablosu bulunamadı.');
  return { examName, examDate, questions, found, warnings, method, rawText, textCells, bKeys: Object.keys(bKeys).length ? bKeys : undefined };
}

/** Aşama 89: B kitapçığı cevapları varsa eşleşmeyi kurar (dosyada B numarası yoksa) */
function finishKey(D: Duzen, r: ExcelKeyResult, subjects?: ExamSubject[]): ExcelKeyResult {
  if (!r.bKeys || !subjects?.length || !r.found.length) return r;
  const a = D.applyBKeys(subjects, r.questions, r.bKeys);
  return { ...r, questions: a.questions, bModes: a.modes, warnings: [...r.warnings, ...a.warnings] };
}

/** Izgara (A / B yan yana ders sütunları) okuması eski okumadan iyiyse onu kullanır */
function pickGrid(D: Duzen, base: ExcelKeyResult, layout: LSheet[], subjects?: ExamSubject[]): ExcelKeyResult {
  if (!subjects?.length) return base;
  const g = D.parseGridKey(layout, subjects);
  if (!g || g.found.length < 2 || g.found.length < base.found.length) return base;
  return {
    ...base,
    examName: g.examName || base.examName,
    questions: g.questions,
    found: g.found,
    warnings: g.warnings,
    method: 'baslik',
    bKeys: Object.keys(g.bKeys).length ? g.bKeys : undefined,
  };
}

export async function readKeyExcel(file: File, subjects?: ExamSubject[]): Promise<ExcelKeyResult> {
  const mod: any = await import('xlsx');
  const XLSX: typeof import('xlsx') = mod && mod.read ? mod : mod.default;
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name: string) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
  // Aşama 89: hücreler konumlarıyla da okunur (birleştirilmiş başlık hücresinin ortası = ders sütunu)
  const layout: LSheet[] = wb.SheetNames.map((name: string) => {
    const ws: any = wb.Sheets[name];
    const span = new Map<string, number>();
    for (const m of (ws['!merges'] || []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>) span.set(`${m.s.r},${m.s.c}`, m.e.c - m.s.c);
    const rows: LRow[] = [];
    if (ws['!ref']) {
      const rg = XLSX.utils.decode_range(ws['!ref']);
      for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 2000); r++) {
        const row: LRow = [];
        for (let c = rg.s.c; c <= Math.min(rg.e.c, rg.s.c + 60); c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          const t = cell ? cellText(cell.v instanceof Date ? cell.w : cell.v) : '';
          if (t) row.push({ t, x: c + (span.get(`${r},${c}`) || 0) / 2 });
        }
        if (row.length) rows.push(row);
      }
    }
    return { name, rows };
  });
  const D = await import('./anahtarDuzen');
  return finishKey(D, { ...pickGrid(D, parseKeySheets(sheets, subjects), layout, subjects), source: 'excel' }, subjects);
}

/**
 * Aşama 89: PDF cevap anahtarı (yazısı seçilebilen PDF). Metin konumlarıyla satırlara ayrılır; önce A / B ızgarası,
 * olmazsa Excel'deki tablo okuyucuları denenir. Taranmış (yalnızca resim) PDF'te yazı olmadığı için okunamaz.
 */
export async function readKeyPdf(file: File, subjects?: ExamSubject[]): Promise<ExcelKeyResult> {
  const [{ extractPdfItems }, D] = await Promise.all([import('./kitapcik'), import('./anahtarDuzen')]);
  return keyFromPdfItems(D, await extractPdfItems(file), subjects);
}

/** PDF metin parçalarından cevap anahtarı (dosya okuma dışındaki her şey; test edilebilir) */
export function keyFromPdfItems(D: Duzen, pages: Array<Array<{ str: string; x: number; y: number; w: number; h: number }>>, subjects?: ExamSubject[]): ExcelKeyResult {
  const chars = pages.reduce((n, p) => n + p.reduce((m, it) => m + it.str.trim().length, 0), 0);
  if (chars < 20) {
    return {
      examName: '',
      examDate: '',
      questions: {},
      found: [],
      warnings: ["PDF'te okunabilir yazı yok (taranmış ya da resim olarak kaydedilmiş). Yayınevinden Excel'ini ya da yazısı seçilebilen PDF'ini isteyin; ya da cevapları elle yazın."],
      method: '',
      rawText: '',
      source: 'pdf',
    };
  }
  const layout: LSheet[] = pages.map((items, pi) => {
    // Üstten alta satırlar: aynı yükseklikteki (yazı boyunun yarısı kadar yakın) parçalar bir satırdır
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: Array<{ y: number; h: number; items: typeof items }> = [];
    for (const it of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - it.y) <= Math.max(2, Math.min(last.h, it.h) * 0.5)) last.items.push(it);
      else rows.push({ y: it.y, h: it.h || 10, items: [it] });
    }
    return {
      name: `Sayfa ${pi + 1}`,
      rows: rows.map((r) => {
        const its = r.items.sort((a, b) => a.x - b.x);
        // Kelimenin ortasından bölünmüş parçalar birleştirilir (aradaki boşluk çok küçükse)
        const merged: Array<{ str: string; x: number; w: number; h: number }> = [];
        for (const it of its) {
          const m = merged[merged.length - 1];
          if (m && it.x - (m.x + m.w) < Math.min(m.h, it.h) * 0.15 && !/\s$/.test(m.str) && !/^\s/.test(it.str)) {
            m.str += it.str;
            m.w = it.x + it.w - m.x;
          } else merged.push({ str: it.str, x: it.x, w: it.w, h: it.h });
        }
        return merged.map((m) => ({ t: cellText(m.str), x: m.x + m.w / 2 })).filter((c) => c.t);
      }),
    };
  });
  const sheets = layout.map((l) => ({ name: l.name, rows: D.layoutToGrid(l.rows, 6) as unknown[][] }));
  const base = parseKeySheets(sheets, subjects);
  base.warnings = base.warnings.map((w) => w.replace('Excel dosyasında', "PDF'te"));
  return finishKey(D, { ...pickGrid(D, base, layout, subjects), source: 'pdf' }, subjects);
}

/** Bir dersin sorularında Excel'den gelen kazanım bilgisi var mı? */
export function hasSourceKazanim(list: ExamQuestion[] | undefined): boolean {
  return !!list && list.some((q) => !!(q.srcCode || q.srcText));
}

// ----------------------------------------------------------------------------- Aşama 48e: başlıksız cevap listeleri
/**
 * Ders başlığı olmayan cevap anahtarlarını çözer: soru numarası, cevap ve (varsa) B kitapçığı numarası
 * sütunları kendiliğinden bulunur; numaranın 1'e döndüğü yerlerden dersler ayrılır ve soru sayılarına
 * göre (LGS: 20-10-10-10-20-20) denemenin ders sırasıyla eşleştirilir.
 */
export function parseAnswerBlocks(rows: unknown[][], subjects: ExamSubject[]): { questions: ExamQuestions; warnings: string[] } | null {
  const ansOf = (v: unknown): string => {
    const s = cellText(v).toLocaleUpperCase('tr-TR');
    if (/^[A-E]$/.test(s)) return s;
    if (/^(X|İPTAL|IPTAL|\*)$/.test(s)) return 'X';
    return '';
  };
  const intOf = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(cellText(v));
    return Number.isInteger(n) && n > 0 && n <= 100 ? n : 0;
  };
  // Aday satırlar: en az bir soru numarası ve bir cevap harfi
  type Cand = { row: unknown[]; ints: number[]; letters: number[] };
  const cands: Cand[] = [];
  for (const row of rows) {
    const r = row || [];
    const ints: number[] = [];
    const letters: number[] = [];
    r.forEach((v, i) => {
      if (intOf(v)) ints.push(i);
      else if (ansOf(v)) letters.push(i);
    });
    if (ints.length && letters.length) cands.push({ row: r, ints, letters });
  }
  if (cands.length < 5) return null;
  const vote = (xs: number[]) => {
    const m = new Map<number, number>();
    for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  };
  const noCol = vote(cands.map((c) => c.ints[0]));
  const ansCol = vote(cands.map((c) => c.letters[0]));
  const bCol = vote(cands.filter((c) => c.ints.length > 1).map((c) => c.ints[1]));

  // Aşama 49d: başlık yoksa kazanım sütunları içerikten bulunur (kod deseni, uzun metin, kısa konu)
  const width = Math.max(...cands.map((c) => c.row.length));
  const share = (test: (v: string) => boolean, j: number) => cands.filter((c) => test(cellText(c.row[j]))).length / cands.length;
  const pick = (test: (v: string) => boolean, skip: number[]) => {
    let best = -1;
    let bestShare = 0.3;
    for (let j = 0; j < width; j++) {
      if (skip.includes(j)) continue;
      const sh = share(test, j);
      if (sh > bestShare) [best, bestShare] = [j, sh];
    }
    return best;
  };
  const used = [noCol, ansCol, bCol];
  const codeCol = pick((v) => !!CODE_RE.exec(v) && /\d\s*\.\s*\d/.test(v), used);
  const textCol = pick((v) => v.length >= 20 && /[a-zçğıöşü]{3}/i.test(v), [...used, codeCol]);
  const konuCol = pick((v) => v.length >= 3 && v.length < 60 && /[a-zçğıöşü]{3}/i.test(v) && !guessSubjectKey(v), [...used, codeCol, textCol]);

  // Bloklar: numara 1'e dönünce (ya da küçülünce) yeni ders
  const blocks: Array<Array<{ no: number; ans: string; b: number; row: unknown[] }>> = [];
  let prev = 0;
  for (const c of cands) {
    const no = intOf(c.row[noCol]);
    const ans = ansOf(c.row[ansCol]);
    if (!no || !ans) continue;
    if (!blocks.length || no <= prev) blocks.push([]);
    blocks[blocks.length - 1].push({ no, ans, b: bCol >= 0 ? intOf(c.row[bCol]) : 0, row: c.row });
    prev = no;
  }
  const good = blocks.filter((bl) => bl.every((x, i) => x.no === i + 1));
  if (!good.length || good.length !== blocks.length) return null;

  // Blokları ders sırasına oturt (ör. yalnızca sayısal: 20-20 → Matematik, Fen)
  const lens = good.map((bl) => bl.length);
  const offsets: number[] = [];
  for (let k = 0; k + lens.length <= subjects.length; k++) {
    if (lens.every((n, i) => subjects[k + i].count === n)) offsets.push(k);
  }
  if (!offsets.length) return null;
  const k = offsets[0];
  const warnings: string[] = [];
  const questions: ExamQuestions = {};
  good.forEach((bl, i) => {
    const s = subjects[k + i];
    const bs = bl.map((x) => x.b);
    const bValid = bCol >= 0 && new Set(bs).size === bl.length && bs.every((b) => b >= 1 && b <= bl.length);
    questions[s.key] = bl.map((x) => {
      const q: ExamQuestion = { no: x.no, answer: x.ans };
      if (bValid) q.bNo = x.b;
      const kz = splitKazanim(codeCol >= 0 ? cellText(x.row[codeCol]) : '', textCol >= 0 ? cellText(x.row[textCol]) : '', konuCol >= 0 ? cellText(x.row[konuCol]) : '');
      if (kz.code) q.srcCode = kz.code;
      if (kz.text) q.srcText = kz.text;
      return q;
    });
  });
  const names = good.map((bl, i) => `${subjects[k + i].short} ${bl.length}`).join(', ');
  warnings.push(
    `Dosyada ders başlığı yoktu; cevaplar soru sayılarına ve sıraya göre derslere ayrıldı (${names}).` +
      (offsets.length > 1 ? ' Bu sıralama birden fazla şekilde olabilir; derslerin doğru olduğunu kontrol edin.' : ' Lütfen kontrol edin.')
  );
  return { questions, warnings };
}
