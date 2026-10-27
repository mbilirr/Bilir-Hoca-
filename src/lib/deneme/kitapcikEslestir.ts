// ============================================================================
// DENEME ANALİZİ (Aşama 93) — A / B KİTAPÇIĞI SORU EŞLEŞTİRMESİ (SORU METNİNDEN, TAMAMEN TARAYICIDA)
// İki kitapçıkta sorular aynıdır, yalnızca sıraları farklıdır. Dijital (yazısı seçilebilen) kitapçık PDF'lerinden
// her sorunun metni çıkarılır ve aynı soru iki kitapçıkta bulunur:
//  1) Sayfa metni sütunlara ve satırlara ayrılır (iki sütunlu düzen; tek sütun da olur). Her sayfada tekrar eden
//     üst/alt bilgiler (yayınevi adı, sayfa no, "Diğer sayfaya geçiniz") atılır.
//  2) Satır başındaki "1." "2." … numaraları sırayla izlenir; numara 1'e dönünce yeni ders başlar. Sıralar
//     denemenin derslerine soru sayılarına göre yerleştirilir (sözel / sayısal / ikisi bir arada).
//  3) Her ders için A ve B sorularının metin benzerliği hesaplanır; en iyi bire bir eşleşme (Macar yöntemi)
//     bulunur. Cevap harfi de kontrol edilir: A'daki cevap, B'deki karşılığın cevabıyla aynı olmalı.
// Yapay zekâ kullanılmaz; öğrenci bilgisi kullanılmaz. Taranmış (resim) PDF'te yazı olmadığı için okunamaz.
// ============================================================================
import type { PdfTextItem } from './kitapcik';
import type { ExamQuestion, ExamSubject } from './lgs';

export interface BookletQuestions {
  /** ders → soru no → metin (normalleştirilmiş kelimeler) */
  bySubject: Record<string, Map<number, string[]>>;
  found: string[]; // bulunan dersler
  textless: boolean; // PDF'te okunabilir yazı yok (taranmış)
}

// ----------------------------------------------------------------------------- metin
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function words(s: string): string[] {
  const t = s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] || c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return t ? t.split(' ').filter((w) => w.length > 1 || /\d/.test(w)) : [];
}

/**
 * Bazı yayınevi PDF'lerinde (taranıp üzerine yazı katmanı eklenmiş) Latin harfler ters bayt sırasıyla gelir:
 * "s" yerine "猀" (U+7300). Bu karakterler düzeltilir; Türkçe harfler zaten doğru gelir.
 */
export function fixText(s: string): string {
  if (!/[\u2000-\u7fff]/.test(s)) return s;
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out += c > 0xff && (c & 0xff) === 0 && c >> 8 >= 0x20 && c >> 8 < 0x7f ? String.fromCharCode(c >> 8) : ch;
  }
  return out;
}

interface Line {
  x: number;
  y: number;
  text: string;
  key: string; // üst/alt bilgi karşılaştırması için ('' = sayfanın üst/alt kenarında değil)
}

/** Bir sayfanın satırları okuma sırasıyla (sol sütun, sonra sağ sütun) */
function pageLines(raw: PdfTextItem[]): Line[][] {
  if (!raw.length) return [];
  const items = raw.map((i) => ({ ...i, str: fixText(i.str) })).filter((i) => i.str.trim());
  if (!items.length) return [];
  const right = Math.max(...items.map((i) => i.x + i.w));
  const left = Math.min(...items.map((i) => i.x));
  const top = Math.max(...items.map((i) => i.y + i.h));
  const bottom = Math.min(...items.map((i) => i.y));
  const band = (top - bottom) * 0.05;
  const atEdge = (y: number) => y >= top - band || y <= bottom + band;
  // Sütun arası boşluk: sayfanın orta bölgesinde (%30-%70) en az yazının geçtiği dikey şerit. Öğeler kelime
  // ya da satır parçası olabilir; her öğenin kapladığı yatay aralık sayılır. Boşluk yoksa tek sütunlu sayfa.
  const W = right - left;
  const BIN = 3;
  const nb = Math.max(1, Math.ceil(W / BIN) + 1);
  const cover = new Array<number>(nb).fill(0);
  for (const it of items) {
    const a0 = Math.max(0, Math.floor((it.x - left) / BIN));
    const a1 = Math.min(nb - 1, Math.floor((it.x + Math.max(it.w, 1) - left) / BIN));
    for (let k = a0; k <= a1; k++) cover[k]++;
  }
  const lo = Math.floor((W * 0.3) / BIN);
  const hi = Math.ceil((W * 0.7) / BIN);
  let best = Infinity;
  for (let k = lo; k <= hi && k < nb; k++) best = Math.min(best, cover[k]);
  // En az kaplanan şeritlerin en uzun kesintisiz bölümünün ortası
  let runStart = -1;
  let bestRun: [number, number] = [-1, -1];
  for (let k = lo; k <= hi + 1; k++) {
    const ok = k <= hi && k < nb && cover[k] <= best + 1;
    if (ok && runStart < 0) runStart = k;
    if (!ok && runStart >= 0) {
      if (k - runStart > bestRun[1] - bestRun[0]) bestRun = [runStart, k];
      runStart = -1;
    }
  }
  const maxCover = Math.max(1, ...cover);
  const split = best <= Math.max(2, maxCover * 0.08) && bestRun[0] >= 0 ? left + ((bestRun[0] + bestRun[1]) / 2) * BIN : Infinity;
  const cols: PdfTextItem[][] = [[], []];
  for (const it of items) cols[it.x >= split ? 1 : 0].push(it);
  return cols
    .filter((c) => c.length)
    .map((c) => {
      const sorted = c.slice().sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: Array<{ y: number; h: number; parts: PdfTextItem[] }> = [];
      for (const it of sorted) {
        const ln = lines[lines.length - 1];
        if (ln && Math.abs(ln.y - it.y) <= Math.max(2, Math.min(ln.h, it.h) * 0.5)) ln.parts.push(it);
        else lines.push({ y: it.y, h: it.h, parts: [it] });
      }
      return lines.map((l) => {
        const ps = l.parts.sort((a, b) => a.x - b.x);
        const text = ps
          .map((p) => p.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        return { x: ps[0].x, y: l.y, text, key: atEdge(l.y) ? `${Math.round(l.y / 6)}|${words(text.replace(/\d+/g, ' ')).join(' ')}` : '' };
      });
    });
}

const NUM = /^(\d{1,2})\s*(?:[.)]\s*|\s+|$)/;
// "1. ve 2. soruları …", "1, 2 ve 3. sorular" gibi yönerge satırları soru başlangıcı değildir
const NOT_START = /^\s*(ve|veya|ile|,|-|–)\s/i;

interface Run {
  start: number; // runs dizisinde sıra
  qs: Array<{ no: number; lines: string[] }>;
}

/** Bir PDF dosyasından numaralı soru dizileri */
function runsOf(pages: PdfTextItem[][]): Run[] {
  const pl = pages.map(pageLines);
  // Üst / alt bilgi: sayfaların en az %30'unda geçen satırlar (en az 3 sayfa)
  const freq = new Map<string, number>();
  pl.forEach((cols) => {
    const seen = new Set<string>();
    for (const col of cols) for (const l of col) if (l.key && l.key.length < 80) seen.add(l.key);
    for (const k of seen) freq.set(k, (freq.get(k) || 0) + 1);
  });
  const minRep = Math.max(3, Math.ceil(pages.length * 0.3));
  const header = (l: Line) => !!l.key && (freq.get(l.key) || 0) >= minRep;

  const runs: Run[] = [];
  let cur: Run | null = null;
  let q: { no: number; lines: string[] } | null = null;
  for (const cols of pl) {
    for (const col of cols) {
      if (!col.length) continue;
      // Sütunun sol kenarı: satır başlarının küçüklerinden (girintili satırlar soru numarası sayılmaz)
      const xs = col.map((l) => l.x).sort((a, b) => a - b);
      const edge = xs[Math.floor(xs.length * 0.1)];
      for (const l of col) {
        if (header(l)) continue;
        const m = NUM.exec(l.text);
        const no = m ? Number(m[1]) : 0;
        const atEdge = l.x <= edge + 14;
        if (m && atEdge && no >= 1 && !NOT_START.test(l.text.slice(m[0].length - 1))) {
          const expect: number = q ? q.no + 1 : 1;
          // Bir numara okunamamışsa (resim) bir sonraki de kabul edilir
          if ((no === expect || no === expect + 1) && cur && no > 1) {
            q = { no, lines: [l.text.slice(m[0].length)] };
            cur.qs.push(q);
            continue;
          }
          if (no === 1) {
            cur = { start: runs.length, qs: [] };
            runs.push(cur);
            q = { no: 1, lines: [l.text.slice(m[0].length)] };
            cur.qs.push(q);
            continue;
          }
        }
        if (q) q.lines.push(l.text);
      }
    }
  }
  return runs.filter((r) => r.qs.length >= 3);
}

/** Soru dizilerini derslere yerleştirir (ders sırası korunur; kapak / yönerge listeleri atlanır) */
function assignRuns(runs: Run[], subjects: ExamSubject[]): Array<{ subject: ExamSubject; run: Run }> {
  let best: Array<{ subject: ExamSubject; run: Run }> = [];
  let bestScore = -1;
  for (let j = 0; j < subjects.length; j++) {
    const out: Array<{ subject: ExamSubject; run: Run }> = [];
    let k = j;
    let score = 0;
    for (const r of runs) {
      if (k >= subjects.length) break;
      const s = subjects[k];
      const n = r.qs.length;
      if (n <= s.count && n >= Math.ceil(s.count * 0.6)) {
        out.push({ subject: s, run: r });
        score += n;
        k++;
      }
    }
    if (score > bestScore) {
      best = out;
      bestScore = score;
    }
  }
  return best;
}

const MAX_WORDS = 600;

/** Kitapçık PDF'lerinden (her dosya ayrı: sözel, sayısal ya da birleşik) dersler ve sorular */
export function bookletQuestions(files: PdfTextItem[][][], subjects: ExamSubject[]): BookletQuestions {
  const bySubject: Record<string, Map<number, string[]>> = {};
  let anyText = false;
  for (const pages of files) {
    if (pages.some((p) => p.length > 5)) anyText = true;
    for (const { subject, run } of assignRuns(runsOf(pages), subjects)) {
      if (bySubject[subject.key]) continue;
      const m = new Map<number, string[]>();
      for (const q of run.qs) m.set(q.no, words(q.lines.join(' ')).slice(0, MAX_WORDS));
      bySubject[subject.key] = m;
    }
  }
  return { bySubject, found: subjects.filter((s) => bySubject[s.key]).map((s) => s.key), textless: !anyText };
}

// ----------------------------------------------------------------------------- benzerlik ve eşleştirme
function grams(ws: string[]): Set<string> {
  const g = new Set<string>();
  for (let i = 0; i < ws.length; i++) {
    if (ws[i].length > 2) g.add(ws[i]);
    if (i + 1 < ws.length) g.add(`${ws[i]} ${ws[i + 1]}`);
  }
  return g;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  // Dice: okuma hatalarında (eksik / bozuk kelime) Jaccard'dan daha kararlı
  return (2 * inter) / (a.size + b.size);
}

/** En büyük toplam ağırlıklı bire bir eşleşme (Macar yöntemi, n ≤ 30). Dönen: satır i → sütun */
export function hungarian(w: number[][]): number[] {
  const n = w.length;
  const m = n ? w[0].length : 0;
  const N = Math.max(n, m);
  const INF = 1e9;
  const c = Array.from({ length: N + 1 }, (_, i) => Array.from({ length: N + 1 }, (_, j) => (i && j && i <= n && j <= m ? -w[i - 1][j - 1] : 0)));
  const u = new Array(N + 1).fill(0);
  const v = new Array(N + 1).fill(0);
  const p = new Array(N + 1).fill(0);
  const way = new Array(N + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(N + 1).fill(INF);
    const used = new Array(N + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= N; j++) {
        if (used[j]) continue;
        const cur = c[i0][j] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= N; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= N; j++) if (p[j] && p[j] <= n && j <= m) out[p[j] - 1] = j - 1;
  return out;
}

export type PairStatus = 'kesin' | 'kontrol' | 'harf' | 'yok';

export interface MatchPair {
  aNo: number;
  bNo: number | null;
  sim: number; // %
  status: PairStatus;
  oldBNo: number; // şu anki B numarası
}

export interface SubjectMatch {
  subject: ExamSubject;
  pairs: MatchPair[];
  sure: number; // kesin eşleşen
  changed: number; // şu ankinden farklı
  letterCheck: boolean; // B harfleriyle kontrol yapıldı mı
}

/**
 * Bir dersin A ve B sorularını eşleştirir. bLetters: B kitapçığının cevapları B sırasıyla (bilinmiyorsa null).
 * Harfi tutmayan eşleşmeye ağır ceza verilir (doğru eşleşmede A ve B cevabı aynıdır).
 */
export function matchSubject(subject: ExamSubject, list: ExamQuestion[], A: Map<number, string[]>, B: Map<number, string[]>, bLetters: string[] | null): SubjectMatch {
  const n = subject.count;
  const ga = Array.from({ length: n }, (_, i) => grams(A.get(i + 1) || []));
  const gb = Array.from({ length: n }, (_, j) => grams(B.get(j + 1) || []));
  const sim = ga.map((a) => gb.map((b) => similarity(a, b)));
  const letterOk = (i: number, j: number) => {
    if (!bLetters) return true;
    const a = (list[i]?.answer || '').toUpperCase();
    const b = (bLetters[j] || '').toUpperCase();
    return !a || !b || a === 'X' || b === 'X' || a === b;
  };
  const w = sim.map((row, i) => row.map((s, j) => s + (letterOk(i, j) ? 0.02 : -0.5)));
  const asg = hungarian(w);
  const pairs: MatchPair[] = [];
  let sure = 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const q = list[i];
    const oldBNo = q ? q.bNo || q.no : i + 1;
    const j = asg[i];
    if (j < 0 || !ga[i].size || !gb[j].size) {
      pairs.push({ aNo: i + 1, bNo: null, sim: 0, status: 'yok', oldBNo });
      continue;
    }
    const s = sim[i][j];
    const second = Math.max(0, ...sim[i].filter((_, k) => k !== j));
    const secondCol = Math.max(0, ...sim.map((row) => row[j]).filter((_, k) => k !== i));
    const rival = Math.max(second, secondCol);
    // Kesin: belirgin benzerlik, en yakın ikinci adaydan açık fark ve cevap harfi uyumu
    const status: PairStatus = !letterOk(i, j) ? 'harf' : s >= 0.35 && s - rival >= 0.12 && s >= rival * 1.8 ? 'kesin' : 'kontrol';
    if (status === 'kesin') sure++;
    if (j + 1 !== oldBNo) changed++;
    pairs.push({ aNo: i + 1, bNo: j + 1, sim: Math.round(s * 100), status, oldBNo });
  }
  return { subject, pairs, sure, changed, letterCheck: !!bLetters };
}

/** Eşleşmeyi anahtara uygular (yalnızca bulunan sorular; bulunamayan sorunun B numarası olduğu gibi kalır) */
export function applyMatch(list: ExamQuestion[], m: SubjectMatch): ExamQuestion[] {
  const by = new Map(m.pairs.filter((p) => p.bNo).map((p) => [p.aNo, p.bNo!]));
  const next = list.map((q) => (by.has(q.no) ? { ...q, bNo: by.get(q.no)! } : q));
  // Bulunamayan sorular eski numarasını koruyunca çakışma olursa boşta kalan numaralar sırayla verilir
  const used = new Set<number>();
  const dup: number[] = [];
  next.forEach((q, i) => {
    const b = q.bNo || q.no;
    if (used.has(b)) dup.push(i);
    else used.add(b);
  });
  if (dup.length) {
    const free = Array.from({ length: list.length }, (_, i) => i + 1).filter((b) => !used.has(b));
    dup.forEach((i, k) => (next[i] = { ...next[i], bNo: free[k] ?? next[i].bNo }));
  }
  return next;
}

// ----------------------------------------------------------------------------- Aşama 94: yapay zekâ ile okunan sorular
/** Yazı katmanından ne kadar soru bulunduğu: en zayıf dersin oranı (0-1) ve toplam */
export function coverage(A: BookletQuestions, B: BookletQuestions, subjects: ExamSubject[]): { ratio: number; found: number; total: number } {
  let found = 0;
  let total = 0;
  let ratio = 1;
  for (const s of subjects) {
    const a = A.bySubject[s.key]?.size || 0;
    const b = B.bySubject[s.key]?.size || 0;
    const n = Math.min(a, b, s.count);
    found += n;
    total += s.count;
    ratio = Math.min(ratio, n / s.count);
  }
  return { ratio: subjects.length ? ratio : 0, found, total };
}

/** Yapay zekânın okuduğu sorulardan kitapçık (ders → soru no → kelimeler). Aynı soru iki kez gelirse uzun olan alınır. */
export function bookletFromAi(items: Array<{ ders: string; no: number; metin: string; siklar: string[] }>, subjects: ExamSubject[]): BookletQuestions {
  const bySubject: Record<string, Map<number, string[]>> = {};
  const count = new Map(subjects.map((s) => [s.key, s.count]));
  for (const it of items) {
    const n = count.get(it.ders);
    if (!n || it.no < 1 || it.no > n) continue;
    const ws = words(`${it.metin} ${(it.siklar || []).join(' ')}`).slice(0, MAX_WORDS);
    if (!ws.length) continue;
    const m = (bySubject[it.ders] = bySubject[it.ders] || new Map());
    const cur = m.get(it.no);
    if (!cur || ws.length > cur.length) m.set(it.no, ws);
  }
  return { bySubject, found: subjects.filter((s) => bySubject[s.key]).map((s) => s.key), textless: false };
}
