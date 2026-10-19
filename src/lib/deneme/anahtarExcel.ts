// ============================================================================
// DENEME ANALİZİ (Aşama 47) — YAYINEVİ EXCEL ŞABLONUNDAN CEVAP ANAHTARI VE KAZANIMLAR
// "LGS Sınav Oluşturma Şablonu" (K12) biçimi: her ders için bir başlık satırı (TÜRKÇE, MATEMATİK…),
// altında "Soru No | Cevap | B Karşılığı | … | K12 KAZANIM | Konu" tablosu.
// Başlık ve sütun yerleri sabit kabul edilmez; satırlar taranarak bulunur.
// ============================================================================
import type { ExamQuestion, ExamQuestions, ExamSubject } from './lgs';
import { foldTr, guessSubjectKey } from './optik';

export interface ExcelKeyResult {
  examName: string;
  examDate: string; // YYYY-AA-GG ya da boş
  questions: ExamQuestions;
  found: string[]; // bulunan ders anahtarları
  warnings: string[];
  method?: 'baslik' | 'sira' | 'yz' | ''; // ders başlıklarından / soru sırasından / yapay zekâ ile
  rawText?: string; // yapay zekâya verilecek tablo metni (yalnızca anahtar dosyasının hücreleri)
  textCells?: number; // Aşama 49d: uzun metinli hücre sayısı (dosyada kazanım yazılı olabilir mi?)
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
    else if (/^cevap|^dogru cevap|^a kitap|^a kit|^anahtar|^a$|^a cevap|^cvp/.test(c)) take('ans');
    else if (/^b karsil|^b kitap|^b kit|^b$|^b no|^b soru/.test(c)) take('b');
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

const ansOfCell = (v: unknown): string => {
  const s = cellText(v).toLocaleUpperCase('tr-TR');
  if (/^[A-E]$/.test(s)) return s;
  if (/^(X|İPTAL|IPTAL|\*)$/.test(s)) return 'X';
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
    const lines = sh.rows.map((row) => (row || []).map(cellText).join(' | ').replace(/(\s*\|\s*)+$/, '')).filter((l) => l.replace(/[\s|]/g, ''));
    rawText += `### Sayfa: ${sh.name}\n${lines.slice(0, 400).join('\n')}\n`;
    if (rawText.length > 40000) break;
  }
  rawText = rawText.slice(0, 40000);
  if (!found.length) warnings.push('Excel dosyasında cevap anahtarı tablosu bulunamadı.');
  return { examName, examDate, questions, found, warnings, method, rawText, textCells };
}

export async function readKeyExcel(file: File, subjects?: ExamSubject[]): Promise<ExcelKeyResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
  return parseKeySheets(sheets, subjects);
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
