// ============================================================================
// Aşama 271: FMT'siz okuma. TXT'nin sütunları dosyanın kendisinden çözülür.
// FMT varsa sistem önce FMT ile okur; uyan format yoksa bu çözümleme önerilir.
//
//  1) Her sütunun istatistiği çıkarılır (rakam, A-E, diğer harf, boşluk, kaç farklı değer).
//  2) Baş kısım: sınıf (tek rakam, hemen arkasında şube harfi), şube, kitapçık (yalnız A/B), rakam öbekleri
//     (11 hane TC, diğeri öğrenci no; okul kodu ve oturum gibi her satırda aynı olan sütunlar atlanır), ad soyad.
//  3) Cevaplar: dersler soru sayılarıyla bilinen yerleşimlerle (eşit kutu 10/15/20/25/30/40 ya da soru sayısı
//     kadar, birkaç ders sırası, sözel/sayısal ayrı dosya) denenir; cevap harflerini en iyi açıklayan seçilir.
// Sonuç her zaman ÖNERİdir: ekranda "İlk satırda okunan" ile görülür, cevap anahtarı denetimi (oturum.ts)
// yanlış adlandırılmış dersi ayrıca yakalar.
// ============================================================================
import type { ExamSubject } from './lgs';
import { newFieldId, type FieldRole, type OptikField } from './optik';

export interface OtoOkuma {
  fields: OptikField[];
  /** cevap harflerinin ders kutularına düşen payı (0-1) */
  kapsama: number;
  guvenli: boolean;
  notlar: string[];
}

type Col = { fill: number; digit: number; ae: number; other: number; vals: Map<string, number> };

const isOther = (ch: string) => /[F-ZÇĞİÖŞÜa-zçğıöşü]/.test(ch);
const isAE = (ch: string) => /[A-E*]/.test(ch);

function colStats(lines: string[], len: number): Col[] {
  const cols: Col[] = [];
  for (let c = 0; c < len; c++) cols.push({ fill: 0, digit: 0, ae: 0, other: 0, vals: new Map() });
  for (const l of lines) {
    for (let c = 0; c < len; c++) {
      const ch = l[c] || ' ';
      if (ch === ' ') continue;
      const s = cols[c];
      s.fill++;
      if (/\d/.test(ch)) s.digit++;
      else if (isAE(ch.toLocaleUpperCase('tr-TR'))) s.ae++;
      else if (isOther(ch)) s.other++;
      if (s.vals.size < 40 || s.vals.has(ch)) s.vals.set(ch, (s.vals.get(ch) || 0) + 1);
    }
  }
  return cols;
}

const modeOf = (s: Col): [string, number] => {
  let best: [string, number] = ['', 0];
  for (const [k, v] of s.vals) if (v > best[1]) best = [k, v];
  return best;
};

/** Ders sıraları (kayıtlı FMT'lerde görülenler); ilk sıra LGS sırasıdır */
const SIRALAR = [
  ['tr', 'sos', 'din', 'ing', 'mat', 'fen'],
  ['tr', 'mat', 'fen', 'sos', 'ing', 'din'],
  ['tr', 'mat', 'fen', 'sos', 'din', 'ing'],
  ['mat', 'fen', 'tr', 'sos', 'din', 'ing'],
];
const SOZEL = new Set(['tr', 'sos', 'din', 'ing']);

/**
 * TXT metninden alan listesi önerir. subjects: denemenin dersleri (soru sayılarıyla).
 * Dosya boşsa ya da cevap bölümü bulunamazsa null döner.
 */
export function otomatikAlanlar(text: string, subjects: ExamSubject[], grade = ''): OtoOkuma | null {
  const lines = (text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 400);
  if (lines.length < 2 || !subjects.length) return null;
  const n = lines.length;
  const len = Math.max(...lines.map((l) => l.length));
  const cols = colStats(lines, len);
  const notlar: string[] = [];
  const taken = new Array<FieldRole | null>(len).fill(null);
  const out: Array<{ role: FieldRole; start: number; width: number; label: string; subject?: string }> = [];
  const put = (role: FieldRole, c0: number, c1: number, label: string, subject?: string) => {
    for (let c = c0; c <= c1; c++) taken[c] = role;
    out.push({ role, start: c0 + 1, width: c1 - c0 + 1, label, subject });
  };

  // --- baş kısmın sonu: rakam ya da A-E dışı harf taşıyan son belirgin sütun (ad, numara, sınıf)
  let headEnd = -1;
  for (let c = 0; c < len; c++) if ((cols[c].digit + cols[c].other) / n >= 0.05) headEnd = c;
  if (headEnd < 0 || headEnd >= len - 5) return null;

  // --- sınıf: çoğu satırda aynı tek rakam (1-12), hemen arkasında harfli (şube) sütun
  const letterCol = (c: number) => c < len && cols[c].fill >= n * 0.5 && (cols[c].ae + cols[c].other) / Math.max(1, cols[c].fill) >= 0.9;
  let gradeCol = -1;
  let gradeScore = 0;
  for (let c = 0; c <= headEnd; c++) {
    const s = cols[c];
    const [m, k] = modeOf(s);
    if (!/^\d$/.test(m) || k < n * 0.6 || s.digit < s.fill * 0.9) continue;
    if (!(letterCol(c + 1) || letterCol(c + 2))) continue;
    const sc = k + (grade && m === String(parseInt(grade, 10)) ? n : 0);
    if (sc > gradeScore) {
      gradeScore = sc;
      gradeCol = c;
    }
  }
  if (gradeCol >= 0) {
    put('grade', gradeCol, gradeCol, 'Sınıf');
    // şube: arkadaki 1-2 harfli sütun (bazı formlarda şube iki sütuna bölünür: "A " / " B")
    let e = gradeCol;
    const harfli = (c: number) => c < len && cols[c].fill > 0 && cols[c].digit === 0 && (cols[c].ae + cols[c].other) / cols[c].fill >= 0.9;
    if (harfli(gradeCol + 1)) {
      e = gradeCol + 1;
      // ikinci sütun yalnız şube ikiye bölünmüşse alınır (iki sütun birlikte dolmaz; dolarsa ikincisi adın ilk harfidir)
      if (harfli(gradeCol + 2) && cols[gradeCol + 1].fill + cols[gradeCol + 2].fill <= n * 1.1) e = gradeCol + 2;
    }
    if (e > gradeCol) put('section', gradeCol + 1, e, 'Şube');
  } else notlar.push('Sınıf sütunu bulunamadı.');

  // --- kitapçık: yalnız A/B, çoğu satırda dolu
  let bookCol = -1;
  let bookFill = 0;
  for (let c = 0; c <= Math.min(headEnd + 2, len - 1); c++) {
    if (taken[c]) continue;
    const s = cols[c];
    const ab = (s.vals.get('A') || 0) + (s.vals.get('B') || 0);
    if (s.fill >= n * 0.7 && ab >= s.fill * 0.95 && s.vals.size >= 2 && s.fill > bookFill) {
      bookFill = s.fill;
      bookCol = c;
    }
  }
  if (bookCol >= 0) put('booklet', bookCol, bookCol, 'Kitapçık');

  // --- rakam öbekleri: sabit sütunlar (okul kodu, oturum) atlanır; sabit "0" arkasındaki değişen rakama bağlanır
  const digitCol = (c: number) => !taken[c] && cols[c].fill >= n * 0.5 && cols[c].digit >= cols[c].fill * 0.95;
  const segs: Array<[number, number]> = [];
  for (let c = 0; c <= headEnd; ) {
    if (!digitCol(c)) {
      c++;
      continue;
    }
    let e = c;
    while (e + 1 <= headEnd && digitCol(e + 1)) e++;
    // öbeği değişen bölümlere ayır
    let i = c;
    while (i <= e) {
      const varies = (x: number) => cols[x].vals.size > 1;
      if (varies(i)) {
        let j = i;
        while (j + 1 <= e && varies(j + 1)) j++;
        segs.push([i, j]);
        i = j + 1;
      } else if (modeOf(cols[i])[0] === '0') {
        let j = i;
        while (j + 1 <= e && !varies(j + 1) && modeOf(cols[j + 1])[0] === '0') j++;
        if (j + 1 <= e && varies(j + 1)) {
          let k = j + 1;
          while (k + 1 <= e && varies(k + 1)) k++;
          segs.push([i, k]); // baştaki sıfırlar numaranın parçası
          i = k + 1;
        } else i = j + 1;
      } else i++;
    }
    c = e + 1;
  }
  const tcSeg = segs.find(([a, b]) => b - a + 1 === 11);
  if (tcSeg) put('tc', tcSeg[0], tcSeg[1], 'TC');
  const noSeg = segs
    .filter((s) => s !== tcSeg && s[1] - s[0] + 1 <= 10)
    .sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
  if (noSeg) put('number', noSeg[0], noSeg[1], 'Öğrenci no');

  // --- ad soyad: en uzun harfli bölüm; sağa doğru bir sonraki alana kadar uzar (taşan harfler)
  const nameish = (c: number) => !taken[c] && cols[c].fill >= n * 0.15 && cols[c].digit <= cols[c].fill * 0.05 && cols[c].other >= cols[c].fill * 0.2;
  let best: [number, number] | null = null;
  for (let c = 0; c <= headEnd; c++) {
    if (!nameish(c)) continue;
    let e = c;
    while (e + 1 <= headEnd && !taken[e + 1] && (nameish(e + 1) || (e + 2 <= headEnd && nameish(e + 2)))) e++;
    if (!best || e - c > best[1] - best[0]) best = [c, e];
    c = e;
  }
  if (best) {
    let e = best[1];
    while (e + 1 < len && !taken[e + 1] && e + 1 <= headEnd && e - best[0] < 39) e++;
    put('fullname', best[0], e, 'Ad soyad');
  } else notlar.push('Ad soyad sütunu bulunamadı.');
  if (!noSeg && !best) return null;

  // --- cevaplar
  const areaStart = Math.max(headEnd, ...out.map((f) => f.start + f.width - 2)) + 1;
  const w = new Array<number>(len).fill(0); // cevap harfi sayısı
  const bad = new Array<number>(len).fill(0); // cevap alanında olmaması gereken işaret
  for (const l of lines)
    for (let c = areaStart; c < len; c++) {
      const ch = (l[c] || ' ').toLocaleUpperCase('tr-TR');
      if (ch === ' ') continue;
      if (isAE(ch)) w[c]++;
      else bad[c]++;
    }
  const total = w.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const byKey = new Map(subjects.map((s) => [s.key, s]));
  const lists: string[][] = [];
  for (const o of SIRALAR) {
    const full = o.filter((k) => byKey.has(k));
    for (const l of [full, full.filter((k) => SOZEL.has(k)), full.filter((k) => !SOZEL.has(k))]) {
      if (l.length && !lists.some((x) => x.join() === l.join())) lists.push(l);
    }
  }
  const maxCount = Math.max(...subjects.map((s) => s.count));
  type Cand = { score: number; used: number; blocks: Array<{ key: string; start: number; width: number }> };
  let win: Cand | null = null;
  for (const list of lists) {
    const counts = list.map((k) => byKey.get(k)!.count);
    const models: number[][] = [counts, ...[10, 15, 20, 25, 30, 40].filter((x) => x >= maxCount).map((x) => list.map(() => x))];
    for (const widths of models) {
      for (let s = areaStart; s + Math.min(...widths) <= len + 2; s++) {
        let used = 0;
        let pen = 0;
        const inSlot = new Uint8Array(len);
        let p = s;
        const blocks: Cand['blocks'] = [];
        list.forEach((k, i) => {
          const cnt = counts[i];
          // dolu bir dersin soru sütunlarında boşluk olmamalı (kayık yerleşim yarım dolu kutu üretir)
          let bmax = 0;
          for (let c = p; c < p + cnt && c < len; c++) bmax = Math.max(bmax, w[c]);
          if (bmax > 0) for (let c = p; c < p + cnt; c++) if (c >= len || w[c] < bmax * 0.25) pen += bmax * 0.5;
          for (let c = p; c < p + widths[i] && c < len; c++) {
            inSlot[c] = 1;
            if (c < p + cnt) {
              used += w[c];
              pen += bad[c] * 2;
            } else pen += w[c] * 0.5; // kutuda soru sayısından sonraki işaretler sayılmaz
          }
          blocks.push({ key: k, start: p, width: widths[i] });
          p += widths[i];
        });
        for (let c = areaStart; c < len; c++) if (!inSlot[c]) pen += w[c] * 2;
        const score = used - pen;
        if (!win || score > win.score + 1e-9) win = { score, used, blocks };
      }
    }
  }
  if (!win || win.used <= 0) return null;
  for (const b of win.blocks) {
    const sub = byKey.get(b.key)!;
    const c1 = Math.min(len, b.start + b.width) - 1;
    if (c1 >= b.start) put('answers', b.start, c1, sub.name, b.key);
  }
  const kapsama = win.used / total;
  const guvenli = kapsama >= 0.97 && !!(noSeg || best);
  if (!guvenli) notlar.push(`Cevap işaretlerinin %${Math.round(kapsama * 100)}'i ders kutularına düştü; dersleri ve soru sayılarını kontrol edin.`);

  // --- boşlukları "kullanılmaz" alanlarla doldur (format sıralı kalsın, satır uzunluğu tutsun)
  out.sort((a, b) => a.start - b.start);
  const fields: OptikField[] = [];
  let pos = 1;
  for (const f of out) {
    if (f.start > pos) fields.push({ id: newFieldId(), label: 'Boşluk', role: 'ignore', start: pos, width: f.start - pos });
    fields.push({ id: newFieldId(), label: f.label, role: f.role, subject: f.subject, start: f.start, width: f.width });
    pos = f.start + f.width;
  }
  if (pos <= len) fields.push({ id: newFieldId(), label: 'Boşluk', role: 'ignore', start: pos, width: len - pos + 1 });
  return { fields, kapsama, guvenli, notlar };
}
