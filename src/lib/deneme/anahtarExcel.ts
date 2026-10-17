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
  rawText?: string; // çözülemezse yapay zekâya verilecek tablo metni
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

export async function readKeyExcel(file: File, subjects?: ExamSubject[]): Promise<ExcelKeyResult> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const questions: ExamQuestions = {};
  const warnings: string[] = [];
  let examName = '';
  let examDate = '';

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    let current: string | null = null;
    let col = { no: 0, ans: 1, b: 2, code: -1, text: -1 };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const cells = row.map(cellText);
      const filled = cells.map((c, idx) => ({ c, idx })).filter((x) => x.c);
      if (!filled.length) continue;
      const first = foldTr(filled[0].c);

      // Sınav bilgileri
      if (/^sinav adi/.test(first) && filled[1]) examName = examName || filled[1].c;
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

      // Tablo başlığı: "Soru No | Cevap | B Karşılığı | … | Kazanım | Konu"
      const folded = cells.map(foldTr);
      const noIdx = folded.findIndex((c) => /^soru ?no/.test(c));
      if (noIdx >= 0 && current) {
        const find = (re: RegExp, fb: number) => {
          const k = folded.findIndex((c) => re.test(c));
          return k >= 0 ? k : fb;
        };
        col = {
          no: noIdx,
          ans: find(/^cevap/, noIdx + 1),
          b: find(/^b karsil|^b kitap/, -1),
          code: find(/kazanim/, -1),
          text: find(/^konu|aciklama|kazanim metni/, -1),
        };
        continue;
      }

      // Ders başlığı: tek dolu hücre, büyük harf, bilinen bir ders
      if (filled.length === 1 && filled[0].c.length < 60 && !/^\d/.test(filled[0].c) && filled[0].c === filled[0].c.toLocaleUpperCase('tr-TR')) {
        const key = guessSubjectKey(filled[0].c);
        if (key) {
          current = key;
          if (questions[key]?.length) warnings.push(`"${filled[0].c}" dersi Excel'de iki kez geçiyor; ikincisi kullanıldı.`);
          questions[key] = [];
          continue;
        }
      }

      // Soru satırı
      if (current) {
        const no = Number(row[col.no]);
        const ans = cellText(row[col.ans]).toUpperCase();
        if (Number.isInteger(no) && no > 0 && no <= 100 && /^[A-EX]$/.test(ans)) {
          const bVal = col.b >= 0 ? Number(row[col.b]) : NaN;
          const code = col.code >= 0 ? cellText(row[col.code]) : '';
          const text = col.text >= 0 ? cellText(row[col.text]) : '';
          const q: ExamQuestion = { no, answer: ans };
          if (Number.isInteger(bVal) && bVal > 0) q.bNo = bVal;
          // Aşama 48d: Excel'deki kazanım doğrudan KULLANILMAZ; yalnızca kazanım bankasındaki MEB
          // kazanımıyla eşleştirmek için saklanır (kazanım ve konu bankadan gelir)
          if (code) q.srcCode = code.slice(0, 60);
          if (text) q.srcText = text.slice(0, 600);
          questions[current].push(q);
        }
      }
    }
  }

  for (const k of Object.keys(questions)) if (!questions[k].length) delete questions[k];
  let found = Object.keys(questions);
  let method: ExcelKeyResult['method'] = found.length ? 'baslik' : '';

  // Aşama 48e: ders başlığı olmayan dosyalar (ör. "1-20, 1-10, … " diye alt alta sıralanmış cevaplar)
  if (!found.length && subjects && subjects.length) {
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
      const r = parseAnswerBlocks(rows, subjects);
      if (r) {
        Object.assign(questions, r.questions);
        warnings.push(...r.warnings);
        found = Object.keys(r.questions);
        method = 'sira';
        break;
      }
    }
  }

  // Yapay zekâ için tablo metni (yalnızca cevap anahtarı dosyasının hücreleri; kişisel bilgi yoktur)
  let rawText = '';
  if (!found.length) {
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
      const lines = rows.map((row) => (row || []).map(cellText).join(' | ').replace(/(\s*\|\s*)+$/, '')).filter((l) => l.replace(/[\s|]/g, ''));
      rawText += `### Sayfa: ${sheetName}\n${lines.slice(0, 400).join('\n')}\n`;
      if (rawText.length > 40000) break;
    }
    rawText = rawText.slice(0, 40000);
    warnings.push('Excel dosyasında cevap anahtarı tablosu bulunamadı.');
  }
  return { examName, examDate, questions, found, warnings, method, rawText };
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

  // Bloklar: numara 1'e dönünce (ya da küçülünce) yeni ders
  const blocks: Array<Array<{ no: number; ans: string; b: number }>> = [];
  let prev = 0;
  for (const c of cands) {
    const no = intOf(c.row[noCol]);
    const ans = ansOf(c.row[ansCol]);
    if (!no || !ans) continue;
    if (!blocks.length || no <= prev) blocks.push([]);
    blocks[blocks.length - 1].push({ no, ans, b: bCol >= 0 ? intOf(c.row[bCol]) : 0 });
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
