// ============================================================================
// DENEME ANALİZİ (Aşama 47) — OPTİK SATIRLARINI ÖĞRENCİLERLE EŞLEŞTİRME
// 1) Sözel ve sayısal TXT'lerdeki satırlar aynı öğrenci için birleştirilir.
// 2) Sıra: daha önce elle onaylanan eşleştirme → okul numarası → ad soyad; sınıf/şube kontrol edilir.
// 3) Emin olunamayan satırlar "kontrol" olarak işaretlenir; tahminle puan yazılmaz.
// Aşama 50: TC parmak izi tutan satır en güvenilir eşleşmedir (TC'nin kendisi kaydedilmez).
// Aşama 118: oturumlar önce TC ile birleştirilir (numara farklı olsa da); TC hatalıysa numara, o da tutmazsa
// birleşebilecek satırlar öğretmene "aynı öğrenci mi?" diye sorulur (findSessionPairs / mergeItems).
// ============================================================================
import type { ClassGroup, Student } from '../../types';
import { foldTr, type OptikRow } from './optik';
import { validTc } from '../tcApi';

export interface RowGroup {
  key: string;
  number: string;
  /** Aşama 50: optikteki TC (yalnızca bellekte; sonuçlara ve veritabanına yazılmaz) */
  tc?: string;
  name: string;
  grade: string;
  section: string;
  booklet: string;
  answers: Record<string, string>;
  sources: string[]; // "SAYISAL.txt 12. satır"
  warnings: string[];
  /** Aşama 118: öğretmen onayıyla birleştirilen satırların hafıza anahtarları (sonraki yüklemede kendiliğinden birleşir) */
  aliasKeys?: string[];
  /** Aşama 118: TC ile birleşen satırlarda kodlanmış bütün numaralar (öğrenci hangisiyle kayıtlıysa o kullanılır) */
  numbers?: string[];
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
  const byNumber = new Map<string, RowGroup[]>();
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
    const rt = validTc(r.tc); // Aşama 118: hatalı kodlanmış TC çelişki sayılmaz (yok sayılır)
    if (rt) {
      if (!g.tc) g.tc = rt;
      else if (g.tc !== rt && g.tc !== '-') {
        g.tc = '-'; // çelişki: TC ile eşleştirme yapılmaz
        g.warnings.push('TC iki satırda farklı kodlanmış; TC ile eşleştirme kullanılmadı.');
      }
    }
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
    ...(validTc(r.tc) ? { tc: validTc(r.tc) } : {}),
    name: r.name,
    grade: r.grade,
    section: r.section,
    booklet: r.booklet,
    answers: { ...r.answers },
    sources: [src(r)],
    warnings: [],
  });

  // Aşama 118: öncelik TC. Geçerli TC (ya da taslakta TC ile bulunmuş öğrenci) aynıysa numara farklı olsa da
  // aynı öğrencidir. TC hatalı / boşsa numaraya, o da yoksa ad soyada bakılır.
  const byId = new Map<string, RowGroup>();
  const idOf = (r: OptikRow) => {
    const t = validTc(r.tc);
    if (t) return `t:${t}`;
    const sid = (r as OptikRow & { sid?: string }).sid;
    return sid ? `s:${sid}` : '';
  };
  const addNumber = (g: RowGroup, n: string) => {
    if (!n) return;
    const list = byNumber.get(n);
    if (!list) byNumber.set(n, [g]);
    else if (!list.includes(g)) list.push(g);
  };
  const ids = rows.map(idOf);

  // 1) TC'li satırlar
  rows.forEach((r, i) => {
    const id = ids[i];
    if (!id) return;
    const n = normNumber(r.number);
    const g = byId.get(id);
    if (g && !overlaps(g, r)) {
      const before = normNumber(g.number);
      merge(g, r);
      if (n && before && n !== before) {
        g.warnings.push(`Oturumlarda farklı numara kodlanmış (${g.number} / ${r.number}); TC aynı olduğu için aynı öğrenci sayıldı.`);
        g.numbers = Array.from(new Set([...(g.numbers || [before]), n]));
      }
      addNumber(g, n);
    } else if (g) {
      const ng = fresh(r, `${id.slice(0, 2)}${n}:${groups.length}`);
      ng.warnings.push('Aynı TC birden fazla satırda var.');
      g.warnings.push('Aynı TC birden fazla satırda var.');
      groups.push(ng);
      addNumber(ng, n);
    } else {
      // Anahtar TC içermez (taslakta saklanır); eski taslaklarla uyum için ilk numaralı satır "n:<no>" olur
      const ng = fresh(r, n && !byNumber.has(n) ? `n:${n}` : `${id.slice(0, 2)}${n}:${groups.length}`);
      byId.set(id, ng);
      groups.push(ng);
      addNumber(ng, n);
    }
  });

  // 2) TC'siz (ya da TC'si hatalı) numaralı satırlar
  rows.forEach((r, i) => {
    if (ids[i]) return;
    const n = normNumber(r.number);
    if (!n) return;
    const list = byNumber.get(n) || [];
    const free = list.filter((g) => !overlaps(g, r));
    if (free.length === 1) merge(free[0], r);
    else if (list.length && !free.length) {
      // Aynı numara aynı derste iki kez: ayrı satır olarak bırakılır, kullanıcı karar verir
      const ng = fresh(r, `n:${n}:${groups.length}`);
      ng.warnings.push(`Aynı numara (${r.number}) birden fazla satırda var.`);
      list[0].warnings.push(`Aynı numara (${r.number}) birden fazla satırda var.`);
      groups.push(ng);
    } else {
      // Hiç yoksa yeni satır; birden fazla uygun satır varsa tahmin edilmez (öğretmen onayına düşer)
      const ng = fresh(r, list.length ? `n:${n}:${groups.length}` : `n:${n}`);
      if (list.length) ng.warnings.push(`Aynı numara (${r.number}) birden fazla öğrencide var.`);
      groups.push(ng);
      addNumber(ng, n);
    }
  });
  // 3) Numarasız ve TC'siz satırlar: aynı ada sahip ve dersleri çakışmayan bir satıra eklenir
  rows.forEach((r, i) => {
    if (ids[i] || normNumber(r.number)) return;
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
  });
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

export function matchGroups(
  groups: RowGroup[],
  students: Student[],
  classes: ClassGroup[],
  aliases: Record<string, string>,
  /** Aşama 50: TC parmak izi tutan satırlar (satır anahtarı → öğrenci kimliği) */
  tcMatch?: Map<string, string>
): MatchItem[] {
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
    // Aşama 50: TC parmak izi tuttu (en güvenilir). Ad çok farklıysa yine de kontrole düşer.
    const byTc = tcMatch?.get(g.key);
    if (byTc && byId.has(byTc)) {
      const s = byId.get(byTc)!;
      const sim = g.name ? nameSimilarity(g.name, s.name) : 1;
      if (sim >= 0.5) return { ...base, studentId: s.id, status: 'ok' as MatchStatus, method: 'TC', reason: '', candidates: [s.id] };
      return { ...base, studentId: s.id, status: 'check' as MatchStatus, method: 'TC', reason: 'TC tuttu ama ad soyad çok farklı', candidates: [s.id] };
    }
    let num = normNumber(g.number);
    // Aşama 118: TC ile birleşmiş satırda iki numara varsa, adı en iyi tutan öğrencinin numarası seçilir
    if (g.numbers && g.numbers.length > 1) {
      let best = -1;
      for (const n of g.numbers) {
        for (const s of nums.get(n) || []) {
          const sim = g.name ? nameSimilarity(g.name, s.name) : 0;
          if (sim > best) [best, num] = [sim, n];
        }
      }
    }
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

// ----------------------------------------------------------------------------- Aşama 118: oturum birleştirme onayı
export interface SessionPair {
  a: string; // satır anahtarı
  b: string;
  studentId: string | null; // önerilen öğrenci
  reason: string;
  auto: boolean; // öğretmen daha önce onayladı (hafıza) ya da ikisi de TC ile aynı öğrenci: sormadan birleşir
}

/** Satırın cevap verdiği oturumlar (sozel / sayisal) */
function sessionsOf(g: RowGroup, sessionOf: Map<string, string>): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(g.answers)) if (filled(v) && sessionOf.has(k)) out.add(sessionOf.get(k)!);
  return out;
}

/**
 * Tek oturumu olan ve birbirini tamamlayan (biri sözel, biri sayısal) satır çiftleri.
 *  - Aynı öğrenciye eşleşmişlerse (numara / ad / elle) → öneri (ikisi de hafıza ya da TC ise kendiliğinden).
 *  - Değilse ad soyad çok benziyor, sınıf/şube çelişmiyor ve en az biri onaylanmamışsa → öneri.
 * Hız: yalnızca tek oturumlu satırlar taranır; ad karşılaştırması onay bekleyen satır sayısıyla sınırlıdır.
 */
export function findSessionPairs(items: MatchItem[], subjects: Array<{ key: string; session: string }>): SessionPair[] {
  const sessionOf = new Map(subjects.map((s) => [s.key, s.session]));
  if (new Set(sessionOf.values()).size < 2) return [];
  const single = items
    .filter((m) => !m.skip)
    .map((m) => ({ m, ss: sessionsOf(m.group, sessionOf) }))
    .filter((x) => x.ss.size === 1)
    .map((x) => {
      const n = normName(x.m.group.name);
      // Hızlı ön süzgeç için ad / soyadların ilk iki harfi
      return { m: x.m, s: Array.from(x.ss)[0], n, heads: new Set(n.split(' ').filter((t) => t.length >= 2).map((t) => t.slice(0, 2))) };
    });
  if (single.length < 2) return [];
  const cands: Array<{ a: (typeof single)[number]; b: (typeof single)[number]; score: number; same: boolean }> = [];
  // 1) Aynı öğrenciye düşenler (harita ile; hızlı)
  const byStudent = new Map<string, typeof single>();
  for (const x of single) if (x.m.studentId) byStudent.set(x.m.studentId, [...(byStudent.get(x.m.studentId) || []), x]);
  for (const list of byStudent.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) if (list[i].s !== list[j].s) cands.push({ a: list[i], b: list[j], score: 2, same: true });
  }
  // 2) Ad soyad benzerliği (en az bir taraf onay bekliyorsa)
  const open = single.filter((x) => x.m.status !== 'ok' || !x.m.studentId);
  if (open.length <= 200) {
    const openIdx = new Map(open.map((x, i) => [x, i]));
    for (const x of open) {
      for (const y of single) {
        if (x === y || x.s === y.s || !x.n || !y.n) continue;
        const iy = openIdx.get(y);
        if (iy !== undefined && iy < openIdx.get(x)!) continue; // iki taraf da açıksa bir kez
        const gx = x.m.group;
        const gy = y.m.group;
        if (gx.grade && gy.grade && gx.grade !== gy.grade) continue;
        if (gx.section && gy.section && foldTr(gx.section) !== foldTr(gy.section)) continue;
        if (Math.abs(x.n.length - y.n.length) > Math.max(x.n.length, y.n.length) * 0.4) continue;
        if (![...x.heads].some((h) => y.heads.has(h))) continue;
        const sim = nameSimilarity(gx.name, gy.name);
        if (sim >= 0.85) cands.push({ a: x, b: y, score: sim, same: false });
      }
    }
  }
  cands.sort((p, q) => q.score - p.score);
  const used = new Set<string>();
  const out: SessionPair[] = [];
  for (const c of cands) {
    const ka = c.a.m.group.key;
    const kb = c.b.m.group.key;
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    // Önerilecek öğrenci: onaylı taraf, yoksa ilk seçili olan
    const sure = [c.a.m, c.b.m].find((m) => m.status === 'ok' && m.studentId) || [c.a.m, c.b.m].find((m) => m.studentId);
    const strong = (m: MatchItem) => m.method === 'hafıza' || m.method === 'TC';
    const numA = c.a.m.group.number || '—';
    const numB = c.b.m.group.number || '—';
    out.push({
      a: ka,
      b: kb,
      studentId: sure?.studentId || null,
      auto: c.same && strong(c.a.m) && strong(c.b.m),
      reason: c.same
        ? `İki oturum aynı öğrenciyle eşleşti ama numaralar farklı (${numA} / ${numB}).`
        : `Ad soyad aynı görünüyor, numara tutmadı (${numA} / ${numB}).`,
    });
  }
  return out;
}

/** İki satırı tek öğrencide birleştirir (sözel + sayısal). Öğrencinin kayıtlı numarası hangisiyse o numara kalır. */
export function mergeItems(a: MatchItem, b: MatchItem, studentId: string | null, studentNo?: string): MatchItem {
  const ga = a.group;
  const gb = b.group;
  const answers: Record<string, string> = { ...ga.answers };
  for (const [k, v] of Object.entries(gb.answers)) if (filled(v) || answers[k] === undefined) answers[k] = v;
  const sn = normNumber(studentNo || '');
  const number = sn && normNumber(gb.number) === sn && normNumber(ga.number) !== sn ? gb.number : ga.number || gb.number;
  const warnings = [...ga.warnings, ...gb.warnings];
  if (ga.booklet && gb.booklet && ga.booklet !== gb.booklet) warnings.push(`Kitapçık türü dosyalarda farklı (${ga.booklet} / ${gb.booklet}).`);
  warnings.push(`Oturumlarda farklı numara (${ga.number || '—'} / ${gb.number || '—'}); onayla birleştirildi.`);
  const group: RowGroup = {
    key: `${ga.key}+${gb.key}`,
    number,
    name: ga.name.length >= gb.name.length ? ga.name : gb.name,
    grade: ga.grade || gb.grade,
    section: ga.section || gb.section,
    booklet: ga.booklet || gb.booklet,
    answers,
    sources: [...ga.sources, ...gb.sources],
    warnings: Array.from(new Set(warnings)),
    aliasKeys: Array.from(new Set([...(ga.aliasKeys || [aliasKeyOf(ga)]), ...(gb.aliasKeys || [aliasKeyOf(gb)])])),
    numbers: Array.from(new Set([...codedNumbers(ga), ...codedNumbers(gb)])),
  };
  return { group, studentId, status: studentId ? 'ok' : 'none', method: 'birleştirme', reason: '', candidates: studentId ? [studentId] : [], skip: false };
}

/** Listede iki satırı birleşik satırla değiştirir (birleşik satır ilk satırın yerinde durur) */
export function applyMerge(list: MatchItem[], aKey: string, bKey: string, studentId: string | null, studentNo?: string): MatchItem[] {
  const a = list.find((m) => m.group.key === aKey);
  const b = list.find((m) => m.group.key === bKey);
  if (!a || !b) return list;
  const merged = mergeItems(a, b, studentId, studentNo);
  return list.filter((m) => m !== b).map((m) => (m === a ? merged : m));
}

/** Aşama 118: satırda kodlanmış bütün numaralar (normalize) */
export function codedNumbers(g: RowGroup): string[] {
  return Array.from(new Set([g.number, ...(g.numbers || [])].map(normNumber).filter(Boolean)));
}

/** Aşama 118: sonuca yazılacak numara: kodlananlar arasında öğrencinin kayıtlı numarası varsa o, yoksa ilk kodlanan */
export function resultNumber(g: RowGroup, studentNo?: string): string {
  const sn = normNumber(studentNo || '');
  const coded = codedNumbers(g);
  return sn && coded.includes(sn) ? sn : coded[0] || '';
}
