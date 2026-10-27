// ============================================================================
// DENEME ANALİZİ (Aşama 89) — A / B KİTAPÇIKLI "IZGARA" CEVAP ANAHTARLARI (Excel ve PDF ortak)
// Yayınevlerinin çoğu cevap anahtarını şöyle verir: üstte "(A GRUBU)" / "A KİTAPÇIĞI" başlığı, altında yan yana
// ders sütunları (TÜRKÇE | İNKILAP | DİN | İNGİLİZCE | MATEMATİK | FEN), her dersin altında "soru no + cevap".
// A ve B kitapçığı alt alta, yan yana, ayrı sayfada ya da ayrı dosya sayfasında olabilir.
// Hücreler yalnızca konumlarıyla (satır sırası + yatay konum) okunur; bu yüzden aynı kod hem Excel hücrelerini
// hem PDF metnini çözer. Sabit sütun / satır yeri kabul edilmez.
//
// B kitapçığının soru sırası dosyada yoksa (yalnızca B'nin cevapları verilmişse) eşleşme harflerden kurulur:
//  * B, A ile aynı sıradaysa ya da A'nın tersiyse kesin eşleşme bulunur.
//  * Sıra karışıksa her A sorusu, aynı cevaplı bir B sorusuyla eşlenir. Bu durumda B kitapçıklı öğrencilerin
//    doğru / yanlış sayıları, netleri ve puanları KESİN doğru olur (her öğrenci B anahtarına göre puanlanmış
//    gibi); yalnızca soru bazlı analizde aynı cevaplı sorular yer değiştirmiş olabilir ("tahmini" işaretlenir).
// ============================================================================
import type { ExamQuestion, ExamQuestions, ExamSubject } from './lgs';
import { foldTr, guessSubjectKey } from './optik';

/** Konumlu hücre: t = metin, x = yatay orta nokta (Excel: sütun no, PDF: nokta) */
export interface LCell {
  t: string;
  x: number;
}
export type LRow = LCell[];
export interface LSheet {
  name: string;
  rows: LRow[];
}

export type BMode = 'same' | 'reverse' | 'harf' | 'uyumsuz';

export interface GridKeyResult {
  examName: string;
  questions: ExamQuestions; // A cevapları (A sırasıyla)
  bKeys: Record<string, string>; // B kitapçığının cevapları B sırasıyla (X = iptal)
  found: string[];
  warnings: string[];
}

const clean = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

/** Cevap harfi: A-E; İ / X / İPTAL / * = iptal (X) */
export function keyLetter(v: string): string {
  const s = clean(v).toLocaleUpperCase('tr-TR');
  if (/^[A-E]$/.test(s)) return s;
  if (/^(X|İ|I|İPTAL|IPTAL|\*)$/.test(s)) return 'X';
  return '';
}

const PAIR_RE = /^(\d{1,3})\s*[-.):=]?\s*([A-Ea-eİX*]|İPTAL|IPTAL)$/;
const INT_RE = /^\d{1,3}$/;

/** Ders başlığı → deneme dersinin anahtarı (yalnızca bu denemede olan dersler) */
function subjectOfLabel(t: string, subjects: ExamSubject[]): string | null {
  // birleşik noktalı harfler ("i̇") sadeleştirilir
  const s = clean(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!s || s.length > 40 || /\d/.test(s) || keyLetter(s)) return null;
  const f = foldTr(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!f) return null;
  // Önce denemenin kendi ders adları / kısaltmaları (özel dersli denemeler için)
  for (const sub of subjects) if (f === foldTr(sub.name).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim() || f === foldTr(sub.short)) return sub.key;
  let k = guessSubjectKey(s);
  // "TC. İnk. Tarh", "İnk. Tar.", "T.C. İnkılap" gibi kısaltmalar
  if (!k && /\bink|\btarh?\b|\bt c\b/.test(f)) k = 'sos';
  return k && subjects.some((x) => x.key === k) ? k : null;
}

/** "(A GRUBU)", "A KİTAPÇIĞI", "KİTAPÇIK: B", "B Grubu Cevap Anahtarı" → 'A' | 'B' */
function bookletOf(t: string): 'A' | 'B' | null {
  const f = foldTr(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const m =
    /(?:^| )([ab]) (?:grubu|grup|kitapcigi|kitapcik|kitapcik turu|kitap|booklet)(?: |$)/.exec(f) ||
    /(?:grubu|grup|kitapcigi|kitapcik|kitapcik turu|booklet) ([ab])(?: |$)/.exec(f);
  return m ? (m[1].toUpperCase() as 'A' | 'B') : null;
}

const stripBooklet = (t: string) =>
  clean(
    t
      .replace(/\(\s*[AB]\s*(GRUBU|GRUP|K[İIi]TAP\S*)[^)]*\)/gi, ' ')
      .replace(/(^|\s)[AB]\s+(GRUBU|GRUP|K[İIi]TAP\S*)(?=\s|$)/gi, ' ')
      .replace(/CEVAP\s+ANAHTAR\S*/gi, ' ')
  );

interface Band {
  subject: string;
  booklet: 'A' | 'B';
  x: number;
}

/**
 * Konumlu satırlardan A / B cevap anahtarı. Ders başlıklı ızgara bulunamazsa null döner
 * (o zaman eski okuyucular denenir).
 */
export function parseGridKey(sheets: LSheet[], subjects: ExamSubject[]): GridKeyResult | null {
  const countOf = new Map(subjects.map((s) => [s.key, s.count]));
  // kitapçık → ders → (soru no → harf)
  const got: Record<'A' | 'B', Map<string, Map<number, string>>> = { A: new Map(), B: new Map() };
  const warnings: string[] = [];
  const nameParts: string[] = [];
  let headers = 0;
  let unnamedGrids = 0;
  const conflicts = new Set<string>();

  for (const sh of sheets) {
    let titles: Array<{ b: 'A' | 'B'; x: number }> = [];
    let titlesUsed = false;
    let bands: Band[] = [];
    for (const row of sh.rows) {
      const cells = row.filter((c) => clean(c.t));
      if (!cells.length) continue;

      // 1) Kitapçık başlıkları (aynı hücrede sınav adı da olabilir)
      const tRow: Array<{ b: 'A' | 'B'; x: number }> = [];
      for (const c of cells) {
        const b = bookletOf(c.t);
        if (b) tRow.push({ b, x: c.x });
        if (!headers && !subjectOfLabel(c.t, subjects) && !PAIR_RE.test(clean(c.t)) && !INT_RE.test(clean(c.t)) && !keyLetter(c.t)) {
          const n = stripBooklet(c.t);
          if (n.length >= 2 && !nameParts.includes(n)) nameParts.push(n);
        }
      }
      if (tRow.length) {
        if (titlesUsed) {
          titles = [];
          titlesUsed = false;
        }
        titles.push(...tRow);
      }

      // 2) Ders başlığı satırı: en az iki ders adı, hiç soru numarası yok
      const labels = cells.map((c) => ({ c, k: subjectOfLabel(c.t, subjects) })).filter((l) => l.k) as Array<{ c: LCell; k: string }>;
      const hasData = cells.some((c) => INT_RE.test(clean(c.t)) || PAIR_RE.test(clean(c.t)));
      if (labels.length >= 2 && !hasData) {
        headers++;
        // Soldan sağa: bir ders tekrar edince yeni grup başlar (yan yana A ve B kitapçığı)
        labels.sort((p, q) => p.c.x - q.c.x);
        const groups: Array<Array<{ c: LCell; k: string }>> = [];
        for (const l of labels) {
          const g = groups[groups.length - 1];
          if (!g || g.some((x) => x.k === l.k)) groups.push([l]);
          else g.push(l);
        }
        const ts = titles.slice().sort((p, q) => p.x - q.x);
        bands = groups.flatMap((g, gi) => {
          let booklet: 'A' | 'B';
          if (ts.length === groups.length) booklet = ts[gi].b; // grup sayısı kadar başlık: sırayla
          else if (ts.length) {
            // en yakın kitapçık başlığı (grubun ortasına göre)
            const mid = (g[0].c.x + g[g.length - 1].c.x) / 2;
            booklet = ts.reduce((best, t) => (Math.abs(t.x - mid) < Math.abs(best.x - mid) ? t : best)).b;
          } else booklet = gi > 0 ? 'B' : 'A';
          return g.map(({ c, k }) => ({ subject: k, booklet, x: c.x }));
        });
        if (!titles.length && !bands.some((b) => b.booklet === 'B')) {
          // başlıksız ızgara: ilk A, aynı derslerle gelen sonraki B sayılır
          unnamedGrids++;
          if (unnamedGrids > 1) bands = bands.map((b) => ({ ...b, booklet: 'B' as const }));
        }
        if (titles.length) titlesUsed = true;
        bands.sort((a, b) => a.x - b.x);
        continue;
      }
      if (!bands.length || !hasData) continue;

      // 3) Veri satırı: her hücre en yakın ders sütununa (eşitlikte soldakine) verilir
      const per = new Map<number, Array<{ x: number; no?: number; l?: string }>>();
      for (const c of cells) {
        const t = clean(c.t);
        let tok: { x: number; no?: number; l?: string } | null = null;
        const pm = PAIR_RE.exec(t);
        if (pm) tok = { x: c.x, no: Number(pm[1]), l: keyLetter(pm[2]) };
        else if (INT_RE.test(t)) tok = { x: c.x, no: Number(t) };
        else if (keyLetter(t)) tok = { x: c.x, l: keyLetter(t) };
        if (!tok) continue;
        let bi = 0;
        for (let i = 1; i < bands.length; i++) if (Math.abs(bands[i].x - c.x) < Math.abs(bands[bi].x - c.x)) bi = i;
        const arr = per.get(bi) || [];
        arr.push(tok);
        per.set(bi, arr);
      }
      for (const [bi, toks] of per) {
        const band = bands[bi];
        const max = countOf.get(band.subject) || 0;
        toks.sort((a, b) => a.x - b.x);
        let pendingNo = 0;
        for (const tk of toks) {
          let no = 0;
          let l = '';
          if (tk.no && tk.l) [no, l] = [tk.no, tk.l];
          else if (tk.no) {
            pendingNo = tk.no;
            continue;
          } else if (tk.l && pendingNo) [no, l] = [pendingNo, tk.l];
          pendingNo = 0;
          if (!no || !l || no > max) continue;
          const m = got[band.booklet].get(band.subject) || new Map<number, string>();
          const old = m.get(no);
          if (old && old !== l) conflicts.add(`${band.booklet} ${band.subject}`);
          if (!old) m.set(no, l);
          got[band.booklet].set(band.subject, m);
        }
      }
    }
  }

  if (!headers || !got.A.size) return null;

  const questions: ExamQuestions = {};
  const bKeys: Record<string, string> = {};
  const found: string[] = [];
  const nameOf = (k: string) => subjects.find((s) => s.key === k)?.name || k;
  for (const s of subjects) {
    const a = got.A.get(s.key);
    if (!a || !a.size) continue;
    found.push(s.key);
    questions[s.key] = Array.from(a.entries())
      .sort((x, y) => x[0] - y[0])
      .map(([no, answer]) => ({ no, answer }) as ExamQuestion);
    if (a.size < s.count) warnings.push(`${s.name} A kitapçığında ${a.size}/${s.count} cevap okundu.`);
    const b = got.B.get(s.key);
    if (b && b.size) {
      bKeys[s.key] = Array.from({ length: s.count }, (_, i) => b.get(i + 1) || ' ').join('');
      if (b.size < s.count) warnings.push(`${s.name} B kitapçığında ${b.size}/${s.count} cevap okundu.`);
    }
  }
  for (const k of got.B.keys()) if (!got.A.has(k)) warnings.push(`${nameOf(k)} için yalnızca B kitapçığı cevapları bulundu; A cevapları olmadan kullanılamaz.`);
  if (conflicts.size) warnings.push('Dosyada aynı soru için farklı cevaplar var (ilk okunan kullanıldı); lütfen kontrol edin.');
  if (unnamedGrids > 1) warnings.push('Kitapçık adı yazmadığı için ilk tablo A, sonraki B kitapçığı sayıldı.');
  return { examName: nameParts.join(' ').slice(0, 200), questions, bKeys, found, warnings };
}

// ----------------------------------------------------------------------------- B eşleşmesini harflerden kurma
/**
 * A ve B kitapçığının cevaplarından her A sorusunun B numarası.
 * Dönüş: bNos[i] = A'nın (i+1). sorusunun B'deki numarası; mode: hangi yolla bulunduğu.
 */
export function inferBMap(aKey: string, bKey: string): { mode: BMode; bNos: number[]; reason?: string } {
  const n = aKey.length;
  if (!n || bKey.length !== n) return { mode: 'uyumsuz', bNos: [], reason: 'soru sayısı farklı' };
  if (/[^A-EX]/.test(aKey) || /[^A-EX]/.test(bKey)) return { mode: 'uyumsuz', bNos: [], reason: 'eksik cevap var' };
  const count = (s: string) => {
    const m = new Map<string, number>();
    for (const ch of s) m.set(ch, (m.get(ch) || 0) + 1);
    return m;
  };
  const ca = count(aKey);
  const cb = count(bKey);
  if (ca.size !== cb.size || Array.from(ca).some(([k, v]) => cb.get(k) !== v)) return { mode: 'uyumsuz', bNos: [], reason: 'A ve B kitapçığında cevap harflerinin sayıları farklı' };
  if (aKey === bKey) return { mode: 'same', bNos: Array.from({ length: n }, (_, i) => i + 1) };
  if (aKey.split('').reverse().join('') === bKey) return { mode: 'reverse', bNos: Array.from({ length: n }, (_, i) => n - i) };
  // Karışık sıra: aynı cevaplı sorular sırayla eşlenir
  const queue = new Map<string, number[]>();
  for (let j = 0; j < n; j++) queue.set(bKey[j], [...(queue.get(bKey[j]) || []), j + 1]);
  const bNos = aKey.split('').map((ch) => queue.get(ch)!.shift()!);
  return { mode: 'harf', bNos };
}

/** B cevaplarını sorulara uygular: bNo yazılır; ders başına kullanılan yol döner */
export function applyBKeys(subjects: ExamSubject[], questions: ExamQuestions, bKeys: Record<string, string>): { questions: ExamQuestions; modes: Record<string, BMode>; warnings: string[] } {
  const out: ExamQuestions = { ...questions };
  const modes: Record<string, BMode> = {};
  const warnings: string[] = [];
  const harf: string[] = [];
  for (const s of subjects) {
    const bk = bKeys[s.key];
    const list = questions[s.key];
    if (!bk || !list) continue;
    // B numarası dosyada zaten verildiyse ona dokunulmaz
    if (list.some((q) => q.bNo)) continue;
    const aKey = Array.from({ length: s.count }, (_, i) => list.find((q) => q.no === i + 1)?.answer || ' ').join('');
    const r = inferBMap(aKey, bk);
    modes[s.key] = r.mode;
    if (r.mode === 'uyumsuz') {
      warnings.push(`${s.name}: B kitapçığı eşleştirilemedi (${r.reason}). B sırasını "Sorular" bölümünden girin.`);
      continue;
    }
    out[s.key] = Array.from({ length: s.count }, (_, i) => ({ ...(list.find((q) => q.no === i + 1) || { no: i + 1, answer: '' }), bNo: r.bNos[i] }));
    if (r.mode === 'harf') harf.push(s.short || s.name);
  }
  const exact = subjects.filter((s) => modes[s.key] === 'same' || modes[s.key] === 'reverse').map((s) => s.short || s.name);
  if (exact.length) warnings.push(`B kitapçığı eşleşmesi kesin bulundu: ${exact.join(', ')}.`);
  if (harf.length)
    warnings.push(
      `B kitapçığının soru sırası dosyada yok; ${harf.join(', ')} için eşleşme cevap harflerinden kuruldu (tahmini). Net ve puanlar kesin doğru hesaplanır; soru bazlı analizde aynı cevaplı B soruları yer değiştirmiş olabilir. Gerçek B sırası elinizdeyse "Sorular" bölümünden girin.`
    );
  return { questions: out, modes, warnings };
}

// ----------------------------------------------------------------------------- konumlu satırları sütunlu tabloya çevirme
/** PDF satırlarını eski (sütun numaralı) okuyuculara vermek için: yakın x konumları aynı sütun sayılır */
export function layoutToGrid(rows: LRow[], tolerance: number): string[][] {
  const xs = rows.flatMap((r) => r.map((c) => c.x)).sort((a, b) => a - b);
  const centers: number[] = [];
  for (const x of xs) {
    if (!centers.length || x - centers[centers.length - 1] > tolerance) centers.push(x);
  }
  const colOf = (x: number) => {
    let lo = 0;
    let hi = centers.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (centers[mid] + tolerance < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return rows.map((r) => {
    const out: string[] = [];
    for (const c of r) {
      const i = colOf(c.x);
      out[i] = out[i] ? `${out[i]} ${c.t}` : c.t;
    }
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
    return out;
  });
}
