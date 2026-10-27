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

interface Line {
  x: number;
  y: number;
  text: string;
  key: string; // üst/alt bilgi karşılaştırması için ('' = sayfanın üst/alt kenarında değil)
}

/** Bir sayfanın satırları okuma sırasıyla (sol sütun, sonra sağ sütun) */
function pageLines(items: PdfTextItem[]): Line[][] {
  if (!items.length) return [];
  const right = Math.max(...items.map((i) => i.x + i.w));
  const left = Math.min(...items.map((i) => i.x));
  const top = Math.max(...items.map((i) => i.y + i.h));
  const bottom = Math.min(...items.map((i) => i.y));
  const band = (top - bottom) * 0.05;
  const atEdge = (y: number) => y >= top - band || y <= bottom + band;
  // Sağ sütunun başlangıcı: sayfanın orta bölgesinde en çok satırın başladığı x (soru numarası biraz solda
  // olabileceği için bölme çizgisi 25 nokta solundan geçer). Yeterli satır yoksa tek sütunlu sayfa.
  const W = right - left;
  const freq = new Map<number, number>();
  for (const it of items) {
    if (it.x <= left + W * 0.35 || it.x >= left + W * 0.75) continue;
    const k = Math.round(it.x / 4) * 4;
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let bestX = 0;
  let bestN = 0;
  for (const [k, n] of freq) if (n > bestN || (n === bestN && k < bestX)) [bestX, bestN] = [k, n];
  const split = bestN >= Math.max(3, items.length * 0.08) ? bestX - 25 : Infinity;
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
  return inter / (a.size + b.size - inter);
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
    const status: PairStatus = !letterOk(i, j) ? 'harf' : s >= 0.35 && s - Math.max(second, secondCol) >= 0.1 ? 'kesin' : 'kontrol';
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
