// ============================================================================
// DENEME ANALİZİ (Aşama 47) — OPTİK SATIRLARINI ÖĞRENCİLERLE EŞLEŞTİRME
// 1) Sözel ve sayısal TXT'lerdeki satırlar aynı öğrenci için birleştirilir.
// 2) Sıra: daha önce elle onaylanan eşleştirme → okul numarası → ad soyad; sınıf/şube kontrol edilir.
// 3) Emin olunamayan satırlar "kontrol" olarak işaretlenir; tahminle puan yazılmaz.
// TC kimlik numarası kullanılmaz.
// ============================================================================
import type { ClassGroup, Student } from '../../types';
import { foldTr, type OptikRow } from './optik';

export interface RowGroup {
  key: string;
  number: string;
  name: string;
  grade: string;
  section: string;
  booklet: string;
  answers: Record<string, string>;
  sources: string[]; // "SAYISAL.txt 12. satır"
  warnings: string[];
}

export type MatchStatus = 'ok' | 'check' | 'none';

export interface MatchItem {
  group: RowGroup;
  studentId: string | null;
  status: MatchStatus;
  method: string; // hafıza | numara | ad soyad | elle
  reason: string;
  candidates: string[]; // önerilen öğrenci kimlikleri
  skip: boolean;
}

export const normNumber = (s: string) => (s || '').replace(/\D/g, '').replace(/^0+/, '');
export const normName = (s: string) =>
  foldTr(s || '')
    .replace(/�/g, '?')
    .replace(/[^a-z? ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const aliasKeyOf = (g: { number: string; name: string }) => `${normNumber(g.number)}|${normName(g.name)}`.slice(0, 160);

const filled = (s?: string) => !!s && /[A-E*]/.test(s);

// '?' (okunamayan harf) her harfle eşleşir
function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const same = a[i - 1] === b[j - 1] || a[i - 1] === '?' || b[j - 1] === '?';
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (same ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** İki ad soyad ne kadar benziyor (0-1). Sıra farkı (SOYAD AD / AD SOYAD) ve optikte kesilen ad tolere edilir. */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const sx = x.split(' ').sort().join(' ');
  const sy = y.split(' ').sort().join(' ');
  if (sx === sy) return 1;
  const ratio = (p: string, q: string) => 1 - lev(p, q) / Math.max(p.length, q.length);
  let best = Math.max(ratio(x, y), ratio(sx, sy));
  // Boşluklar yok sayılarak (optikte "KAYMA ZASYA" gibi kayan harfler)
  best = Math.max(best, ratio(x.replace(/ /g, ''), y.replace(/ /g, '')));
  const tx = x.split(' ');
  const ty = y.split(' ');
  best = Math.max(best, ratio([...tx].reverse().join(''), y.replace(/ /g, '')));
  best = Math.max(best, ratio([...ty].reverse().join(''), x.replace(/ /g, '')));
  // Optik alanı kısa olduğu için ad kesilmiş olabilir
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  if (short.length >= 10 && (long.startsWith(short) || long.split(' ').reverse().join(' ').startsWith(short))) best = Math.max(best, 0.95);
  return best;
}

/** Sözel ve sayısal dosyalardaki satırları öğrenci başına birleştirir */
export function groupRows(rows: OptikRow[]): RowGroup[] {
  const groups: RowGroup[] = [];
  const byNumber = new Map<string, RowGroup>();
  const src = (r: OptikRow) => `${r.file} ${r.line}. satır`;
  const overlaps = (g: RowGroup, r: OptikRow) => Object.keys(r.answers).some((k) => filled(r.answers[k]) && filled(g.answers[k]));
  const merge = (g: RowGroup, r: OptikRow) => {
    for (const k of Object.keys(r.answers)) {
      if (filled(r.answers[k])) {
        if (filled(g.answers[k]) && g.answers[k] !== r.answers[k]) g.warnings.push(`${k.toUpperCase()} cevapları iki satırda farklı (${src(r)}); ilk satır kullanıldı.`);
        else g.answers[k] = r.answers[k];
      } else if (g.answers[k] === undefined) g.answers[k] = r.answers[k];
    }
    if (!g.number && r.number) g.number = r.number;
    if (r.name.length > g.name.length) g.name = r.name;
    if (!g.grade && r.grade) g.grade = r.grade;
    if (!g.section && r.section) g.section = r.section;
    if (r.booklet) {
      if (g.booklet && g.booklet !== r.booklet) g.warnings.push(`Kitapçık türü dosyalarda farklı (${g.booklet} / ${r.booklet}).`);
      else g.booklet = r.booklet;
    }
    g.sources.push(src(r));
  };
  const fresh = (r: OptikRow, key: string): RowGroup => ({
    key,
    number: r.number,
    name: r.name,
    grade: r.grade,
    section: r.section,
    booklet: r.booklet,
    answers: { ...r.answers },
    sources: [src(r)],
    warnings: [],
  });

  // Önce numaralı satırlar
  for (const r of rows) {
    const n = normNumber(r.number);
    if (!n) continue;
    const g = byNumber.get(n);
    if (g && !overlaps(g, r)) merge(g, r);
    else if (g) {
      // Aynı numara aynı derste iki kez: ayrı satır olarak bırakılır, kullanıcı karar verir
      const ng = fresh(r, `n:${n}:${groups.length}`);
      ng.warnings.push(`Aynı numara (${r.number}) birden fazla satırda var.`);
      g.warnings.push(`Aynı numara (${r.number}) birden fazla satırda var.`);
      groups.push(ng);
    } else {
      const ng = fresh(r, `n:${n}`);
      byNumber.set(n, ng);
      groups.push(ng);
    }
  }
  // Numarasız satırlar: aynı ada sahip ve dersleri çakışmayan bir satıra eklenir
  for (const r of rows) {
    if (normNumber(r.number)) continue;
    let best: RowGroup | null = null;
    let bestSim = 0;
    for (const g of groups) {
      if (overlaps(g, r)) continue;
      const s = nameSimilarity(g.name, r.name);
      if (s > bestSim) {
        bestSim = s;
        best = g;
      }
    }
    if (best && bestSim >= 0.9) merge(best, r);
    else groups.push(fresh(r, `a:${normName(r.name)}:${groups.length}`));
  }
  return groups;
}

function studentNumber(s: Student): string {
  const n = normNumber(s.studentNumber || '');
  if (n) return n;
  return /^\d+$/.test(s.username || '') ? normNumber(s.username) : '';
}

/** Öğrencinin sınıfı optikteki sınıf/şubeyle uyuşuyor mu (bilgi yoksa null) */
export function classMatches(s: Student, classes: ClassGroup[], grade: string, section: string): boolean | null {
  if (!grade && !section) return null;
  const cls = classes.find((c) => c.id === s.classId);
  const name = foldTr(cls?.name || s.className || '');
  if (!name && !cls) return null;
  const g = (grade || '').replace(/\D/g, '');
  const sec = foldTr(section || '').replace(/[^a-z]/g, '');
  const gradeOk = !g || (cls?.gradeLevel || '').replace(/\D/g, '') === g || new RegExp(`(^|\\D)${g}(\\D|$)`).test(name);
  const branch = foldTr(cls?.branch || s.branch || '').replace(/[^a-z]/g, '');
  const secOk = !sec || branch === sec || new RegExp(`[^a-z]${sec}$`).test(name) || new RegExp(`sube ${sec}`).test(name);
  return gradeOk && secOk;
}

export function matchGroups(groups: RowGroup[], students: Student[], classes: ClassGroup[], aliases: Record<string, string>): MatchItem[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const nums = new Map<string, Student[]>();
  for (const s of students) {
    const n = studentNumber(s);
    if (!n) continue;
    if (!nums.has(n)) nums.set(n, []);
    nums.get(n)!.push(s);
  }
  const items: MatchItem[] = groups.map((g) => {
    const base = { group: g, skip: false, candidates: [] as string[] };
    const remembered = aliases[aliasKeyOf(g)];
    if (remembered && byId.has(remembered)) {
      return { ...base, studentId: remembered, status: 'ok' as MatchStatus, method: 'hafıza', reason: 'Daha önce onayladığınız eşleştirme', candidates: [remembered] };
    }
    const num = normNumber(g.number);
    if (num) {
      const list = nums.get(num) || [];
      if (list.length === 1) {
        const s = list[0];
        const sim = g.name ? nameSimilarity(g.name, s.name) : 1;
        const cm = classMatches(s, classes, g.grade, g.section);
        if (sim >= 0.6 && cm !== false) return { ...base, studentId: s.id, status: 'ok' as MatchStatus, method: 'numara', reason: '', candidates: [s.id] };
        return {
          ...base,
          studentId: s.id,
          status: 'check' as MatchStatus,
          method: 'numara',
          reason: sim < 0.6 ? 'Numara tuttu ama ad soyad farklı' : 'Numara tuttu ama sınıf/şube farklı',
          candidates: [s.id],
        };
      }
      if (list.length > 1) {
        const ranked = list.map((s) => ({ s, sim: nameSimilarity(g.name, s.name) })).sort((a, b) => b.sim - a.sim);
        const top = ranked[0];
        const clsOk = classMatches(top.s, classes, g.grade, g.section);
        if (top.sim >= 0.75 && (ranked.length < 2 || ranked[1].sim < top.sim - 0.1) && clsOk !== false) {
          return { ...base, studentId: top.s.id, status: 'ok' as MatchStatus, method: 'numara + ad', reason: '', candidates: ranked.map((x) => x.s.id) };
        }
        return { ...base, studentId: top.s.id, status: 'check' as MatchStatus, method: 'numara', reason: 'Bu numarada birden fazla öğrenci var', candidates: ranked.map((x) => x.s.id) };
      }
    }
    if (!g.name) return { ...base, studentId: null, status: 'none' as MatchStatus, method: '', reason: 'Numara ve ad yok' };
    const ranked = students
      .map((s) => ({ s, sim: nameSimilarity(g.name, s.name) }))
      .filter((x) => x.sim >= 0.55)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
    if (!ranked.length) return { ...base, studentId: null, status: 'none' as MatchStatus, method: '', reason: num ? 'Numara ve ad sistemde bulunamadı' : 'Ad sistemde bulunamadı' };
    const top = ranked[0];
    const second = ranked[1]?.sim ?? 0;
    const cm = classMatches(top.s, classes, g.grade, g.section);
    if (top.sim >= 0.88 && second < top.sim - 0.08 && cm !== false) {
      return { ...base, studentId: top.s.id, status: 'ok' as MatchStatus, method: 'ad soyad', reason: num ? 'Numara sistemde yok; ad soyadla bulundu' : '', candidates: ranked.map((x) => x.s.id) };
    }
    return {
      ...base,
      studentId: top.s.id,
      status: 'check' as MatchStatus,
      method: 'ad soyad',
      reason: cm === false ? 'Ad benziyor ama sınıf/şube farklı' : 'Ad tam eşleşmedi, lütfen kontrol edin',
      candidates: ranked.map((x) => x.s.id),
    };
  });

  // Aynı öğrenci birden fazla satıra eşleşmişse hepsi kontrole düşer
  const count = new Map<string, number>();
  for (const it of items) if (it.studentId) count.set(it.studentId, (count.get(it.studentId) || 0) + 1);
  for (const it of items) {
    if (it.studentId && (count.get(it.studentId) || 0) > 1) {
      it.status = 'check';
      it.reason = 'Aynı öğrenci birden fazla satırla eşleşti';
    }
  }
  return items;
}
