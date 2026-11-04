// ============================================================================
// DENEME ANALİZİ (Aşama 48) — MEB KAZANIM BANKASI
// Kazanımlar bir kez yüklenir. Asıl yol: öğretim programı PDF'inden yapay zekâ ile (gradePages,
// chunkProgram, mergeProgramItems). İsteğe bağlı: kopyalanan metin ya da Excel/CSV dosyası.
//   Metin örneği:  "F.8.1. Mevsimler ve İklim"            (başlık: konu olarak kullanılır)
//                  "F.8.1.1.1. Mevsimlerin oluşumuna yönelik tahminlerde bulunur."   (kazanım)
//   Excel: "Kod | Kazanım | Konu (ya da Ünite) | Ders | Sınıf" başlıklı sütunlar (yerleri serbest).
// Kazanım bankasında kişisel bilgi yoktur.
// ============================================================================
import { foldTr, guessSubjectKey } from './optik';
import { LGS_SUBJECTS } from './lgs';
import { sheetSource } from '../importNormalize'; // Aşama 154

export interface BankKazanim {
  code: string;
  subject: string; // ders adı (LGS_SUBJECTS'teki adlardan biri)
  grade: string;
  text: string;
  konu: string;
  alt?: string[]; // Aşama 48g: açıklama maddeleri (a, b, c …) = alt kazanımlar
}

/** "1) …\n2) …" ya da "a) … | b) …" → maddeler (numara ve harfler atılır) */
export function splitAlt(v: string): string[] {
  return (v || '')
    .split(/\r?\n|\s\|\s/)
    .map((x) => x.replace(/^\s*(?:\d{1,2}|[a-zçğıöşü])\s*[).-]\s+/i, '').replace(/^[•·▪●⇨➪➢\-–*]\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 2);
}

/**
 * Aşama 58: Kazanım cümlesinde noktalı virgülle ayrılmış maddeler alt kazanım olur
 * ("İklim ile hava olayları arasındaki farkı açıklar; basınç alanlarını değerlendirir." → 2 alt kazanım).
 * Kazanımın kendisi (kod, metin, konu) değişmez. Parantez içindeki noktalı virgüller bölünmez
 * ("(etken, edilgen; geçişli, geçişsiz)"). Çok kısa parçalar varsa bölünmez.
 */
export function semicolonAlt(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text || '') {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const clean = parts.map((p) => p.replace(/\s+/g, ' ').trim().replace(/[;,.\s]+$/, '')).filter(Boolean);
  if (clean.length < 2 || clean.some((p) => p.length < 12)) return [];
  return clean.map((p) => `${p.charAt(0).toLocaleUpperCase('tr-TR')}${p.slice(1)}.`);
}

/** Alt kazanımı (açıklama maddesi) verilmemiş kazanımlarda noktalı virgüllü maddeler alt kazanım olur */
function withAutoAlt<T extends { text: string; alt?: string[] }>(rows: T[]): T[] {
  return rows.map((r) => {
    if (r.alt && r.alt.length) return r;
    const a = semicolonAlt(r.text);
    return a.length ? { ...r, alt: a } : r;
  });
}

/**
 * Aşama 58: birleşik kodların kapsadığı tek tek kodlar (karşılaştırma anahtarı olarak)
 *   "M.8.1.2.4-5"   → M.8.1.2.4-5, M.8.1.2.4, M.8.1.2.5
 *   "E8.4.L1 / SI1" → E8.4.L1/SI1, E8.4.L1, E8.4.SI1
 */
export function codeAliases(code: string): string[] {
  const base = codeKey(code);
  const out = new Set<string>(base ? [base] : []);
  const pieces = base.split('/').filter(Boolean);
  if (!pieces.length) return [...out];
  const first = pieces[0];
  const prefix = first.includes('.') ? first.slice(0, first.lastIndexOf('.') + 1) : '';
  const list = [first, ...pieces.slice(1).map((p) => (p.includes('.') ? p : prefix + p))];
  for (const c of list) {
    out.add(c);
    const m = /^(.*?)(\d+)-(\d+)$/.exec(c);
    if (m) {
      const a = Number(m[2]);
      const b = Number(m[3]);
      if (b > a && b - a <= 12) for (let n = a; n <= b; n++) out.add(`${m[1]}${n}`);
    }
  }
  return [...out];
}

export interface BankParseResult {
  rows: BankKazanim[];
  headers: number; // konu olarak kullanılan başlık sayısı
  warnings: string[];
}

// Kod: isteğe bağlı harf öneki (F., T., M., İTA., DKAB., E) + sınıf + nokta ile ayrılmış parçalar
const CODE_SRC = '(?:[A-Za-zÇĞİÖŞÜçğıöşü]{1,6}\\s?\\.?\\s?)?\\d{1,2}(?:\\s?\\.\\s?[A-Za-z]?\\d{1,3}){1,5}';
const CODE_LINE = new RegExp(`^(${CODE_SRC})\\s?\\.?\\s*[-–:)]?\\s+(.+)$`);
const CODE_ONLY = new RegExp(`^(${CODE_SRC})\\.?$`);

/** Kodları karşılaştırmak için: boşluksuz, sondaki nokta yok, büyük harf */
export const codeKey = (c: string) => (c || '').replace(/\s+/g, '').replace(/\.+$/, '').toLocaleUpperCase('tr-TR');

const normCode = (c: string) => (c || '').replace(/\s+/g, '').replace(/\.+$/, '');
const depthOf = (c: string) => (normCode(c).match(/\d+/g) || []).length;
const squash = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

/** "MEVSİMLER VE İKLİM" → "Mevsimler ve İklim" (tamamı büyük harfse) */
function niceTitle(s: string): string {
  let t = squash(s);
  // "1. ÜNİTE: …", "ÜNİTE 1: …", "Öğrenme alanı: …" önekleri atılır (Türkçe harfler için katlanmış metinde aranır)
  const f = foldTr(t);
  const pre = /^(\d+\s*\.?\s*(unite|ogrenme alani|tema)\s*[:.-]?\s*|(unite|ogrenme alani|tema)\s*\d*\s*[:.-]\s*)/.exec(f);
  if (pre && f.length === t.length) t = t.slice(pre[0].length);
  t = t.replace(/[:.]+$/, '').trim();
  if (!t || t !== t.toLocaleUpperCase('tr-TR')) return t;
  const small = new Set(['ve', 'ile', 'veya', 'de', 'da', 'ki', 'ya']);
  return t
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)))
    .join(' ');
}

/** Bankadaki ders adını LGS ders anahtarına çevirir (tr, mat, fen…) */
export function bankSubjectKey(subject: string): string | null {
  const exact = LGS_SUBJECTS.find((s) => s.name === subject || s.key === subject);
  return exact ? exact.key : guessSubjectKey(subject);
}

const explanationLine = (s: string) => /^([a-zçğıöşü]\)|[•·▪●\-–*]|\(?[ivx]+\)|not:|açıklama)/i.test(s);

/**
 * Kopyalanan kazanım metnini çözümler.
 * Kodlu satırlar arasında en derin kodlar kazanımdır; daha kısa kodlar ve kodsuz kısa satırlar başlıktır (konu).
 */
export function parseKazanimText(text: string, subject: string, grade = '8'): BankParseResult {
  type Entry = { code: string; text: string; depth: number; header?: string; alt?: string[] };
  const entries: Array<Entry | { header: string }> = [];
  const warnings: string[] = [];
  let skipped = 0;
  let last: Entry | null = null;

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, ' ').trim();
    if (!line) {
      last = null;
      continue;
    }
    // Excel'den yapıştırılan satırlar (sekme ile ayrılmış): kod | kazanım | konu
    if (line.includes('\t')) {
      const cells = line.split('\t').map(squash);
      if (CODE_ONLY.test(cells[0]) && cells[1]) {
        const e: Entry = { code: normCode(cells[0]), text: cells[1], depth: depthOf(cells[0]) };
        if (cells[2]) e.header = niceTitle(cells[2]);
        entries.push(e);
        last = e;
        continue;
      }
    }
    const m = CODE_LINE.exec(line);
    if (m && !/^\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4}/.test(line)) {
      const e: Entry = { code: normCode(m[1]), text: squash(m[2]), depth: depthOf(m[1]) };
      entries.push(e);
      last = e;
      continue;
    }
    if (explanationLine(line)) {
      // Aşama 48g: "a) …" açıklamaları son kazanımın alt kazanımı olur
      const lastCoded = [...entries].reverse().find((e): e is Entry => 'code' in e);
      const item = splitAlt(line)[0];
      if (lastCoded && item) (lastCoded.alt = lastCoded.alt || []).push(item);
      else skipped++;
      last = null;
      continue;
    }
    // Sayfa numarası ya da tek kelimelik artıklar
    if (/^\d+$/.test(line) || line.length < 3) continue;
    // Bir önceki kazanımın satır sonuna taşmış devamı
    if (last && !/[.!?]$/.test(last.text) && line.length > 0 && line.charAt(0) === line.charAt(0).toLocaleLowerCase('tr-TR')) {
      last.text = squash(`${last.text} ${line}`);
      continue;
    }
    if (last && !/[.!?]$/.test(last.text) && last.text.length > 30) {
      last.text = squash(`${last.text} ${line}`);
      continue;
    }
    // Kodsuz kısa satır: başlık
    if (line.length <= 90) {
      const h = niceTitle(line);
      if (h) entries.push({ header: h });
    }
    last = null;
  }

  const coded = entries.filter((e): e is Entry => 'code' in e);
  if (!coded.length) return { rows: [], headers: 0, warnings: ['Metinde kazanım kodu bulunamadı. Satırlar "F.8.1.1.1. Kazanım metni" biçiminde olmalı.'] };
  const maxDepth = Math.max(...coded.map((e) => e.depth));

  const rows: BankKazanim[] = [];
  let header = '';
  let headers = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    if (!('code' in e)) {
      header = e.header;
      continue;
    }
    if (e.depth < maxDepth) {
      const h = niceTitle(e.text);
      if (h) {
        header = h;
        headers++;
      }
      continue;
    }
    const key = codeKey(e.code);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      code: e.code.slice(0, 60),
      subject,
      grade,
      text: e.text.slice(0, 2000),
      konu: (e.header || header || '').slice(0, 300),
      alt: e.alt && e.alt.length ? e.alt : undefined,
    });
  }
  if (skipped) warnings.push(`${skipped} açıklama satırı kazanımla eşleştirilemediği için atlandı.`);
  if (!rows.some((r) => r.konu)) warnings.push('Konu başlığı bulunamadı; konuları yapay zekâ önerecek.');
  return { rows: withAutoAlt(rows), headers, warnings };
}

// ----------------------------------------------------------------------------- Öğretim programı PDF'i (yapay zekâ ile)
/**
 * Programın hangi sayfalarında istenen sınıfın kazanımları var? (ör. F.8.1.1.1., T.8.3.5., E8.1.R1., 8.1.1.)
 * Kazanım kodu geçen sayfalar ve bir önceki sayfa (ünite başlığı için) seçilir.
 */
export function gradePages(pages: string[], grade = '8'): number[] {
  const g = grade.replace(/\D/g, '') || '8';
  const re = new RegExp(`(^|[^\\d.])(?:[A-Za-zÇĞİÖŞÜçğıöşü]{1,5}\\s?\\.?\\s?)?${g}\\s?\\.\\s?\\d{1,2}\\s?\\.\\s?[A-Za-z]?\\d{1,3}`);
  const heading = new RegExp(`(^|\\s)${g}\\s?\\.\\s?(sınıf|SINIF|Sınıf)`);
  const hit = new Set<number>();
  pages.forEach((t, i) => {
    if (re.test(t) || heading.test(t)) {
      hit.add(i);
      if (i > 0) hit.add(i - 1);
    }
  });
  return Array.from(hit).sort((a, b) => a - b);
}

/** Seçilen sayfaları yapay zekâya gönderilecek parçalara böler (parçalar bir sayfa üst üste biner) */
export function chunkProgram(pages: string[], indices: number[], maxChars = 18000): string[] {
  const chunks: string[] = [];
  let cur: number[] = [];
  let len = 0;
  const flush = () => {
    if (cur.length) chunks.push(cur.map((i) => `--- Sayfa ${i + 1} ---\n${pages[i].slice(0, maxChars)}`).join('\n'));
  };
  for (const i of indices) {
    const l = Math.min(maxChars, (pages[i] || '').length) + 20;
    if (cur.length && len + l > maxChars) {
      flush();
      const last = cur[cur.length - 1];
      // bir önceki parçanın son sayfası yeni parçanın başına (yalnızca ardışık sayfalarda)
      cur = last === i - 1 && (pages[last] || '').length + l <= maxChars ? [last] : [];
      len = cur.length ? (pages[last] || '').length + 20 : 0;
    }
    cur.push(i);
    len += l;
  }
  flush();
  return chunks;
}

/** Yapay zekânın çıkardığı kazanımları birleştirir (aynı kodda uzun metin kalır) */
export function mergeProgramItems(
  lists: Array<Array<{ ders: string; kod: string; kazanim: string; konu: string; aciklamalar?: string[] }>>,
  grade = '8'
): BankKazanim[] {
  const m = new Map<string, BankKazanim>();
  for (const list of lists) {
    for (const it of list) {
      const s = LGS_SUBJECTS.find((x) => x.key === it.ders);
      if (!s || !it.kod || !it.kazanim) continue;
      const k = codeKey(it.kod);
      const prev = m.get(k);
      const alt = (it.aciklamalar || []).map((x) => squash(x)).filter((x) => x.length > 2);
      const row: BankKazanim = {
        code: normCode(it.kod).slice(0, 60),
        subject: s.name,
        grade,
        text: squash(it.kazanim).slice(0, 2000),
        konu: niceTitle(it.konu || '').slice(0, 300),
        alt: alt.length ? alt : undefined,
      };
      if (!prev) m.set(k, row);
      else
        m.set(k, {
          ...prev,
          text: row.text.length > prev.text.length ? row.text : prev.text,
          konu: prev.konu || row.konu,
          alt: (row.alt?.length || 0) > (prev.alt?.length || 0) ? row.alt : prev.alt,
        });
    }
  }
  const order = (c: string) => (c.match(/\d+/g) || []).map((n) => n.padStart(4, '0')).join('.');
  return Array.from(m.values()).sort((a, b) => a.subject.localeCompare(b.subject, 'tr') || order(a.code).localeCompare(order(b.code)));
}

const cellRaw = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

/** Excel / CSV dosyasından kazanımlar. Başlık satırı yoksa satırlar metin gibi çözümlenir. */
export async function readKazanimFile(file: File, defaultSubject: string, grade = '8'): Promise<BankParseResult> {
  const XLSX = await import('xlsx');
  const src = sheetSource(await file.arrayBuffer(), 'array'); // Aşama 154: CSV Türkçe harf
  const wb = XLSX.read(src.data, { type: src.type });
  const rows: BankKazanim[] = [];
  const warnings: string[] = [];
  const lines: string[] = [];
  const rawRows: string[][] = []; // Aşama 57: başlıksız dosyalar için hücre hücre satırlar
  let usedHeader = false;
  let otherSubjects = 0;
  let konuKodCol = -1; // Aşama 128: "Konu Kodu" sütunu (yalnız denetim için; konu kodu kazanım kodundan türetilir)
  let konuKodBad = 0;

  for (const name of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: null, blankrows: false });
    let col: { code: number; text: number; konu: number; subject: number; grade: number; alt: number } | null = null;
    for (const row of data) {
      const cells = (row || []).map(cellText);
      if (!cells.some(Boolean)) continue;
      const folded = cells.map(foldTr);
      if (!col) {
        // Aşama 57: başlık tanıma esnetildi. "Kod" / "Kazanım Kodu" sütunu ve kazanım metni sütunu aranır.
        // Metin sütunu: önce "Kazanım", "Kazanım Metni" gibi başlıklar; yoksa "Alt Kazanım Kazanım" gibi
        // "alt" ile başlayan bir kazanım sütunu, o da yoksa "Metin" / "Açıklama" / "Kazanım Adı".
        const code = folded.findIndex((c) => /^(kazanim )?kod/.test(c));
        const isText = (c: string, i: number) => i !== code && /kazanim/.test(c) && !/kod/.test(c);
        let text = folded.findIndex((c, i) => isText(c, i) && !/^alt/.test(c));
        if (text < 0) text = folded.findIndex((c, i) => isText(c, i));
        if (text < 0) text = folded.findIndex((c, i) => i !== code && /^(metin|aciklama|kazanim adi|hedef)/.test(c));
        if (code >= 0 && text >= 0) {
          const alt = folded.findIndex((c, i) => i !== text && /^alt kazanim|^aciklama/.test(c));
          // Aşama 128: "Konu Kodu" sütunu konu adı sayılmaz; önce tam "Konu" başlığı aranır
          const isKonu = (c: string, i: number) => i !== text && i !== code && !/kod/.test(c) && /^(konu|unite|ogrenme alani|alt ogrenme|tema)/.test(c);
          let konu = folded.findIndex((c, i) => isKonu(c, i) && /^konu( adi| basligi)?$/.test(c));
          if (konu < 0) konu = folded.findIndex((c, i) => isKonu(c, i));
          konuKodCol = folded.findIndex((c, i) => i !== code && /^(konu|unite) ?kod/.test(c));
          col = {
            code,
            text,
            konu,
            subject: folded.findIndex((c) => /^ders/.test(c)),
            grade: folded.findIndex((c) => /^sinif/.test(c)),
            alt,
          };
          usedHeader = true;
          continue;
        }
        lines.push(cells.filter(Boolean).join('\t'));
        rawRows.push(cells);
        continue;
      }
      const code = normCode(cells[col.code] || '');
      const txt = cells[col.text] || '';
      if (!code || !txt) continue;
      if (konuKodCol >= 0 && cells[konuKodCol] && digitsKey(cells[konuKodCol]) !== digitsKey(konuCodeOf(code))) konuKodBad++;
      let subject = defaultSubject;
      if (col.subject >= 0 && cells[col.subject]) {
        const k = bankSubjectKey(cells[col.subject]);
        const s = k ? LGS_SUBJECTS.find((x) => x.key === k) : null;
        if (s) subject = s.name;
        if (s && s.name !== defaultSubject) otherSubjects++;
      }
      rows.push({
        code: code.slice(0, 60),
        subject,
        grade: (col.grade >= 0 && cells[col.grade] ? cells[col.grade].replace(/\D+/g, '') : '') || grade,
        text: txt.slice(0, 2000),
        konu: col.konu >= 0 ? niceTitle(cells[col.konu] || '').slice(0, 300) : '',
        alt: col.alt >= 0 ? splitAlt(cellRaw(row[col.alt])) : undefined,
      });
    }
  }
  if (!usedHeader) {
    // Aşama 57: başlık yoksa önce hücrelere bakılır: bir hücre kazanım koduysa, satırdaki en uzun diğer hücre kazanım metnidir
    const byCells: BankKazanim[] = [];
    for (const cells of rawRows) {
      const ci = cells.findIndex((c) => CODE_ONLY.test(c.trim()));
      if (ci < 0) continue;
      let ti = -1;
      cells.forEach((c, i) => {
        if (i !== ci && c.length > 15 && (ti < 0 || c.length > cells[ti].length)) ti = i;
      });
      if (ti < 0) continue;
      const others = cells.filter((c, i) => i !== ci && i !== ti && c && c.length <= 120 && !/^\d+$/.test(c));
      let subject = defaultSubject;
      for (const c of others) {
        const k = bankSubjectKey(c);
        const sub = k ? LGS_SUBJECTS.find((x) => x.key === k) : null;
        if (sub && foldTr(c).length <= 30) {
          subject = sub.name;
          break;
        }
      }
      const konu = others.find((c) => !bankSubjectKey(c) || foldTr(c).length > 30) || '';
      byCells.push({ code: normCode(cells[ci]).slice(0, 60), subject, grade, text: cells[ti].slice(0, 2000), konu: niceTitle(konu).slice(0, 300) });
    }
    if (byCells.length) {
      const seen0 = new Set<string>();
      return {
        rows: withAutoAlt(byCells).filter((r) => {
          const k = codeKey(r.code);
          if (seen0.has(k)) return false;
          seen0.add(k);
          return true;
        }),
        headers: 0,
        warnings: ['Dosyada başlık satırı bulunamadı; kod ve metin sütunları satırlardan tahmin edildi. Önizlemeyi kontrol edin.'],
      };
    }
    return parseKazanimText(lines.join('\n'), defaultSubject, grade);
  }
  if (otherSubjects) warnings.push(`${otherSubjects} kazanım dosyadaki "Ders" sütununa göre başka derse yazıldı.`);
  if (konuKodBad) warnings.push(`${konuKodBad} satırda "Konu Kodu", kazanım kodunun üst basamağıyla uyuşmuyor (ör. F.8.1.1.1 → F.8.1.1). Sistem konu kodunu kazanım kodundan alır; tabloyu kontrol edin.`);
  if (!rows.length) warnings.push('Dosyada kazanım satırı bulunamadı.');
  const seen = new Set<string>();
  return {
    rows: withAutoAlt(rows).filter((r) => {
      const k = codeKey(r.code);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    headers: 0,
    warnings,
  };
}

// ----------------------------------------------------------------------------- Aşama 48d: Excel kazanımını bankaya eşleştirme
// Yayınevi Excel'indeki kazanım (kod ya da metin) doğrudan kullanılmaz; bankadaki MEB kazanımlarından
// en uygun olanı bulunur. Kazanım metni ve konu bankadan gelir.

export interface BankOption {
  code: string;
  text: string;
  konu: string;
  alt?: string[]; // Aşama 48g: alt kazanımlar (açıklama maddeleri)
}

export interface BankMatch {
  code: string;
  score: number; // 0-100
  by: 'kod' | 'metin';
}

const STOP = new Set(
  'bir ve ile icin gibi olan olarak veya ya da de da ki bu su o ilgili yonelik uygun eder eden yapar belirler aciklar kullanir'.split(' ')
);

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of foldTr(s || '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.slice(0, 5)); // kaba kök: Türkçe ekleri büyük ölçüde atılır
  }
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

export const digitsKey = (c: string) => ((c || '').match(/\d+/g) || []).join('.');

/**
 * Bir sorunun Excel'den gelen kazanım bilgisini bankadaki kazanımlarla eşleştirir.
 * 1) Kod aynıysa (ya da harf öneki farklı ama numaraları aynıysa) doğrudan eşleşir.
 * 2) Değilse metin benzerliğine bakılır; yeterince benzer ve tek bir aday öne çıkıyorsa eşleşir.
 */
export function matchToBank(src: { code?: string; text?: string }, options: BankOption[]): BankMatch | null {
  if (!options.length) return null;
  const code = (src.code || '').trim();
  if (code && /\d/.test(code)) {
    const k = codeKey(code);
    const exact = options.find((o) => codeKey(o.code) === k);
    if (exact) return { code: exact.code, score: 100, by: 'kod' };
    // Aşama 58: bankadaki birleşik kod bu kodu kapsıyor (M.8.1.2.4 ↔ M.8.1.2.4-5, E8.4.L1 ↔ E8.4.L1 / SI1)
    const covering = options.filter((o) => o.code && codeAliases(o.code).includes(k));
    if (covering.length === 1) return { code: covering[0].code, score: 96, by: 'kod' };
    // soru tarafındaki birleşik kodun ilk parçası bankada tek başına varsa
    for (const a of codeAliases(code).slice(1)) {
      const hit = options.find((o) => codeKey(o.code) === a);
      if (hit) return { code: hit.code, score: 90, by: 'kod' };
    }
    const dk = digitsKey(code);
    if (dk.split('.').length >= 3) {
      const same = options.filter((o) => digitsKey(o.code) === dk);
      if (same.length === 1) return { code: same[0].code, score: 92, by: 'kod' };
    }
    // Aşama 49d: kod bankadakinden bir basamak derin ya da sığ olabilir (T.8.3.5.1 ↔ T.8.3.5, F.8.1.1 ↔ F.8.1.1.1).
    // Üst kod bankada varsa o; alt kodlardan tek biri varsa o; birden çok alt kod varsa metne en yakın olanı.
    const parts = dk.split('.');
    for (let n = parts.length - 1; n >= 3; n--) {
      const up = parts.slice(0, n).join('.');
      const hit = options.filter((o) => digitsKey(o.code) === up);
      if (hit.length === 1) return { code: hit[0].code, score: 85, by: 'kod' };
    }
    if (parts.length >= 3) {
      const kids = options.filter((o) => digitsKey(o.code).startsWith(dk + '.'));
      if (kids.length === 1) return { code: kids[0].code, score: 85, by: 'kod' };
      if (kids.length > 1 && src.text) {
        const st0 = tokens(src.text);
        const ranked = kids.map((o) => ({ o, s: dice(st0, tokens(o.text)) })).sort((x, y) => y.s - x.s);
        if (ranked[0].s >= 0.35 && (ranked.length < 2 || ranked[0].s - ranked[1].s >= 0.05)) return { code: ranked[0].o.code, score: 80, by: 'kod' };
      }
    }
  }
  // Metin: Excel'de kod sütununda metin olabilir; ikisi birlikte değerlendirilir
  const srcText = [src.text, code && !/^\s*[A-Za-zÇĞİÖŞÜ.]{0,6}\s*\d/.test(code) ? code : ''].filter(Boolean).join(' ');
  const st = tokens(srcText);
  if (st.size < 2) return null;
  const scored = options
    .map((o) => ({ o, s: Math.max(dice(st, tokens(o.text)), dice(st, tokens(`${o.konu} ${o.text}`))) }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  const second = scored[1];
  const score = Math.round(best.s * 100);
  if (score >= 75 || (score >= 50 && (!second || best.s - second.s >= 0.08))) return { code: best.o.code, score, by: 'metin' };
  return null;
}

// ----------------------------------------------------------------------------- Aşama 128: konu kodu → kazanım kodu → ad → eşleme hafızası
// Yayınevi bilgisi bankaya HİÇ yazılmaz; yalnızca bankadaki karşılığı bulunur.
//   1) MEB biçimli kod (harf öneki, büyük/küçük harf, sondaki nokta önemsiz; rakamlar karşılaştırılır):
//      kazanım koduna denk → kazanım + konu;  konu koduna denk → yalnız konu (kazanım boş);
//      bankada olmayan daha derin kod (T.8.3.5.1, T.8.4.9) → üst basamaklara çıkılır.
//   2) Eşleme hafızası: öğretmenin daha önce elle seçtiği karşılık (yayınevi ifadesi → kod).
//   3) Ad: konu adı birebir aynıysa yalnız konu; kazanım cümlesi benziyorsa kazanım; konu adı benziyorsa yalnız konu.
// Noktasız yayınevi numaraları (2080501, 6004) kod sayılmaz.

/** "F.8.1.1.1" → "F.8.1.1" (yazımı korur) */
export function konuCodeOf(code: string): string {
  const c = normCode(code);
  const i = c.lastIndexOf('.');
  return i > 0 ? c.slice(0, i) : c;
}

/** Kodun harf öneki: "İTA.8.1.1" → "ITA", "8.1.1" → "" */
const prefixOf = (c: string) => foldTr((/^\s*([A-Za-zÇĞİÖŞÜçğıöşü]*)/.exec(c || '') || ['', ''])[1]).toUpperCase();

/** MEB biçimli kod mu? (en az iki sayı noktayla ayrılmış: 8.2.2.2, F.8.1.1.1, İTA.8.1.1) */
export const isMebCode = (c: string) => /\d\s*\.\s*\d/.test(c || '');

/** Ad karşılaştırması için sade biçim: "1. Kader ve Kaza İnancı" → "kader ve kaza inanci" */
export const nameKey = (s: string) =>
  foldTr(s || '')
    .replace(/^\s*\d{1,2}\s*[.)-]\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Eşleme hafızasının anahtarı: yayınevi ifadesi (yoksa yayınevi kodu) */
export function srcKeyOf(src: { code?: string; text?: string }): string {
  const t = nameKey(src.text || '');
  if (t.length >= 3) return t.slice(0, 200);
  const c = codeKey(src.code || '');
  return c ? `kod ${c}`.slice(0, 200) : '';
}

export interface KonuOption {
  code: string; // F.8.1.1
  konu: string; // Mevsimlerin Oluşumu
  kids: BankOption[];
}

export interface SubjectIndex {
  options: BankOption[];
  byDigits: Map<string, BankOption[]>;
  konular: Map<string, KonuOption>; // rakam anahtarı (8.1.1) → konu
  konuByName: Map<string, KonuOption[]>;
}

/** Bir dersin bankadaki kazanımlarından konu dizini (bir kez kurulur; eşleştirme bellekte yapılır) */
export function buildSubjectIndex(options: BankOption[]): SubjectIndex {
  const byDigits = new Map<string, BankOption[]>();
  const groups = new Map<string, { code: string; kids: BankOption[]; names: Map<string, number> }>();
  for (const o of options) {
    const dk = digitsKey(o.code);
    byDigits.set(dk, [...(byDigits.get(dk) || []), o]);
    const kc = konuCodeOf(o.code);
    const kk = digitsKey(kc);
    if (kk.split('.').length < 2) continue;
    const g = groups.get(kk) || { code: kc, kids: [], names: new Map<string, number>() };
    g.kids.push(o);
    if (!isBadKonu(o.konu, o.text)) g.names.set(o.konu, (g.names.get(o.konu) || 0) + 1);
    groups.set(kk, g);
  }
  const konular = new Map<string, KonuOption>();
  const konuByName = new Map<string, KonuOption[]>();
  for (const [kk, g] of groups) {
    const best = Array.from(g.names.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!best) continue; // konu adı olmayan grup konu sayılmaz
    const k: KonuOption = { code: g.code, konu: best[0], kids: g.kids };
    konular.set(kk, k);
    const nk = nameKey(k.konu);
    if (nk) konuByName.set(nk, [...(konuByName.get(nk) || []), k]);
  }
  return { options, byDigits, konular, konuByName };
}

export type QuestionMatch =
  | { kind: 'kazanim'; code: string; score: number; by: 'kod' | 'metin' | 'hafiza' }
  | { kind: 'konu'; konu: KonuOption; score: number; by: 'kod' | 'metin' | 'hafiza' };

/** Kazanım listesinde metne en yakın olan (yeterince benzer ve tek başına öne çıkıyorsa) */
function bestByText(text: string, list: BankOption[], min: number): BankOption | null {
  const st = tokens(text);
  if (st.size < 2 || !list.length) return null;
  const ranked = list.map((o) => ({ o, s: dice(st, tokens(o.text)) })).sort((a, b) => b.s - a.s);
  if (ranked[0].s >= min && (ranked.length < 2 || ranked[0].s - ranked[1].s >= 0.05)) return ranked[0].o;
  return null;
}

/** Hafızadaki ya da elle seçilen kodun bankadaki karşılığı */
export function resolveBankCode(code: string, idx: SubjectIndex): QuestionMatch | null {
  const k = codeKey(code);
  const kz = idx.options.find((o) => codeKey(o.code) === k);
  if (kz) return { kind: 'kazanim', code: kz.code, score: 100, by: 'hafiza' };
  const kn = idx.konular.get(digitsKey(code));
  if (kn && codeKey(kn.code) === k) return { kind: 'konu', konu: kn, score: 100, by: 'hafiza' };
  return null;
}

/** Bir sorunun yayınevi bilgisini bankadaki kazanıma ya da konuya bağlar */
export function matchQuestion(src: { code?: string; text?: string }, idx: SubjectIndex, memory?: Map<string, string>, nameIdx: SubjectIndex = idx): QuestionMatch | null {
  if (!idx.options.length) return null;
  const code = (src.code || '').trim();
  const text = (src.text || '').trim();

  // 1) Kod: önce kazanım kodu, değilse konu kodu; bankada yoksa üst basamaklar
  if (isMebCode(code)) {
    const k = codeKey(code);
    const exact = idx.options.find((o) => codeKey(o.code) === k);
    if (exact) return { kind: 'kazanim', code: exact.code, score: 100, by: 'kod' };
    // birleşik kodlar (M.8.1.2.4-5, E8.4.L1 / SI1)
    const covering = idx.options.filter((o) => o.code && codeAliases(o.code).includes(k));
    if (covering.length === 1) return { kind: 'kazanim', code: covering[0].code, score: 96, by: 'kod' };
    for (const a of codeAliases(code).slice(1)) {
      const hit = idx.options.find((o) => codeKey(o.code) === a);
      if (hit) return { kind: 'kazanim', code: hit.code, score: 90, by: 'kod' };
    }
    const parts = digitsKey(code).split('.');
    for (let n = parts.length; n >= 2; n--) {
      const key = parts.slice(0, n).join('.');
      const kz = idx.byDigits.get(key);
      // Aynı numaralı birden çok kazanım (ör. eski "8.1.1" ve yeni "D.8.1.1") varsa harf öneki aynı olan seçilir
      const same = kz && kz.length > 1 ? kz.filter((o) => prefixOf(o.code) === prefixOf(code)) : kz;
      // İngilizcede E8.1.L1 / E8.1.R1 gibi rakamları aynı birden çok kazanım olabilir: tek aday yoksa kazanım seçilmez (konuya geçilir)
      const pick = same && same.length === 1 ? same[0] : null;
      if (pick) return { kind: 'kazanim', code: pick.code, score: n === parts.length ? 95 : 85, by: 'kod' };
      const kn = idx.konular.get(key);
      if (kn) {
        // Bankada olmayan alt kod (ör. T.8.4.9): konunun kazanımlarından metni çok benzeyen varsa o, yoksa yalnız konu
        if (n < parts.length && text) {
          const b = bestByText(text, kn.kids, 0.6);
          if (b) return { kind: 'kazanim', code: b.code, score: 80, by: 'kod' };
        }
        return { kind: 'konu', konu: kn, score: n === parts.length ? 95 : 80, by: 'kod' };
      }
    }
  }

  // 2) Eşleme hafızası (öğretmenin daha önce elle seçtiği karşılık)
  if (memory && memory.size) {
    const key = srcKeyOf({ code, text });
    const hit = key ? memory.get(key) : undefined;
    if (hit) {
      const r = resolveBankCode(hit, idx);
      if (r) return r;
    }
  }

  // Aşama 129: ad / metin benzerliğinde yalnız yıllık plana göre işlenmiş kazanımlar aday olur (nameIdx)
  // 3) Ad: konu adı birebir → yalnız konu
  const names = new Set<string>();
  if (text) {
    names.add(nameKey(text));
    const m = /^(.*?)\s*\(([^()]{3,})\)\s*$/.exec(text);
    if (m) {
      names.add(nameKey(m[1]));
      names.add(nameKey(m[2]));
    }
  }
  if (code && !isMebCode(code) && !/^\s*\d+\s*$/.test(code)) names.add(nameKey(code)); // kod sütununda ad yazılmış
  names.delete('');
  for (const n of names) {
    const hit = nameIdx.konuByName.get(n);
    if (hit && hit.length === 1) return { kind: 'konu', konu: hit[0], score: 90, by: 'metin' };
  }

  // 4) Kazanım cümlesi benzerliği (eski kurallar)
  const srcText = [text, code && !isMebCode(code) && !/^\s*\d+\s*$/.test(code) ? code : ''].filter(Boolean).join(' ');
  const st = tokens(srcText);
  if (st.size >= 2 && nameIdx.options.length) {
    const scored = nameIdx.options
      .map((o) => ({ o, s: Math.max(dice(st, tokens(o.text)), dice(st, tokens(`${o.konu} ${o.text}`))) }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    const second = scored[1];
    const score = Math.round(best.s * 100);
    if (score >= 75 || (score >= 50 && (!second || best.s - second.s >= 0.08))) return { kind: 'kazanim', code: best.o.code, score, by: 'metin' };
  }

  // 5) Konu adı benzerliği → yalnız konu
  const nameTokens = Array.from(names, (n) => tokens(n)).filter((t) => t.size > 0);
  if (nameTokens.length) {
    const ranked = Array.from(nameIdx.konular.values())
      .map((k) => {
        const kt = tokens(k.konu);
        return { k, s: Math.max(...nameTokens.map((t) => dice(t, kt))) };
      })
      .sort((a, b) => b.s - a.s);
    const top = ranked[0];
    if (top && top.s >= 0.6 && (ranked.length < 2 || top.s - ranked[1].s >= 0.1)) return { kind: 'konu', konu: top.k, score: Math.round(top.s * 100), by: 'metin' };
  }
  return null;
}

// ----------------------------------------------------------------------------- Aşama 48g: konu / alt kazanım ayrımı
// MEB yapısı: ünite (F.8.1) → KONU (F.8.1.1 Mevsimlerin Oluşumu) → kazanım (F.8.1.1.1 …).
// Bankada "konu" = konu başlığı (parantez içinde gösterilir), "alt" = açıklama maddeleri (alt kazanımlar).
// Konu alanı boş kalmış ya da kazanım metniyle doldurulmuşsa aynı konu kodundaki kardeş kazanımların konusu kullanılır.

/** Kazanımın üst (konu) kodu: F.8.1.1.1 → F.8.1.1 */
export function parentCodeKey(code: string): string {
  const k = codeKey(code);
  const i = k.lastIndexOf('.');
  return i > 0 ? k.slice(0, i) : k;
}

/** Konu alanı gerçekten bir konu başlığı mı, yoksa boş / kazanım cümlesi mi? */
export function isBadKonu(konu: string, text: string): boolean {
  const k = squash(konu);
  if (!k) return true;
  // Konu, kazanım metninin aynısı ve bir cümleyse (kısa başlıklar, ör. "Paragrafta Anlam", konu sayılır)
  if (foldTr(k) === foldTr(squash(text)) && (k.length > 45 || /r\.?$/i.test(k))) return true;
  if (k.length > 70) return true;
  const words = k.split(' ').length;
  // "… tahminlerde bulunur", "… açıklar." gibi fiille biten uzun ifadeler kazanımdır
  if (words >= 5 && /r\.?$/i.test(k)) return true;
  if (/\.$/.test(k) && words >= 4) return true;
  return false;
}

/** Kural ile düzeltme: konusu kötü olan kazanıma aynı üst koddaki kardeşlerin en sık konusu verilir */
export function fixKonularByCode<T extends { code: string; text: string; konu: string; subject: string }>(rows: T[]): Map<string, string> {
  const good = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (isBadKonu(r.konu, r.text)) continue;
    const p = `${r.subject}|${parentCodeKey(r.code)}`;
    const m = good.get(p) || new Map<string, number>();
    m.set(r.konu, (m.get(r.konu) || 0) + 1);
    good.set(p, m);
  }
  const out = new Map<string, string>(); // code → yeni konu
  for (const r of rows) {
    if (!isBadKonu(r.konu, r.text)) continue;
    const m = good.get(`${r.subject}|${parentCodeKey(r.code)}`);
    if (!m) continue;
    const best = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
    if (best && best[0] !== r.konu) out.set(r.code, best[0]);
  }
  return out;
}

/** PDF metni bozuk mu? (özel yazı tipi kodlaması: "0dDUSDQODUYH.DWODU" gibi) */
export function textLooksGarbled(pages: string[]): boolean {
  const words = pages.join(' ').split(/[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+/).filter((w) => w.length >= 3);
  if (words.length < 40) return true;
  const ok = words.filter((w) => /^[A-ZÇĞİÖŞÜÂÎÛ]?[a-zçğıöşüâîû]+$/.test(w) || /^[A-ZÇĞİÖŞÜÂÎÛ]+$/.test(w)).length;
  return ok / words.length < 0.6;
}
