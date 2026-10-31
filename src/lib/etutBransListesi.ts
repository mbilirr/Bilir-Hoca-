// ============================================================================
// Aşama 115: ETÜT BRANŞ LİSTESİ — öğrencilerin ders ders (branş branş) etüt listesi, konu / kazanım süzgeci, Excel.
// Yalnız okur ve dosya üretir; etüt, öğrenci ya da sınıf kaydını değiştirmez.
// Yetki: Rehberlik, Müdür / Müdür Yrd. (idare), kurum yöneticisi ve genel yönetici tüm dersleri alır (her ders
// Excel'de ayrı sayfa); Öğretmen, Zümre Başkanı ve Etüt Öğretmeni yalnız kendi branşının derslerini alır.
// Hız: tek geçişte satır üretimi (Map ile öğrenci / sınıf bulma), konu / kazanım ayrıştırması önbellekli,
// xlsx kütüphanesi yalnız "Excel indir"e basılınca iner.
// ============================================================================
import type { ClassGroup, Etut, Student } from '../types';
import { dataService } from '../services/dataService';
import { normalizeSubject, subjectsForBranch, zumreOf } from './subjects';
import { addDaysYmd, classLabelOf, shortDate, todayYmd } from './etutScheduleExport';

export type BransDonem = 'week' | 'month' | 'last30' | 'year' | 'all' | 'custom';
export type BransDuzen = 'toplu' | 'sinif';

export const DONEM_LABEL: Record<BransDonem, string> = {
  week: 'Bu hafta',
  month: 'Bu ay',
  last30: 'Son 30 gün',
  year: 'Bu eğitim yılı',
  all: 'Tüm zamanlar',
  custom: 'Tarih aralığı',
};

const NO_KONU = 'Konu belirtilmemiş';
const NO_KAZANIM = '';
const NO_SUBJECT = 'Belirtilmemiş';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DERS_ONEK = /^(türkçe|matematik|fen bilimleri|yabancı dil|ingilizce|din kültürü ve ahlak bilgisi|din kültürü|t\.?c\.? inkılap tarihi ve atatürkçülük|t\.?c\.? inkılap tarihi|sosyal bilgiler)\s*:\s*/i;
const KOD_RE = /\b([A-ZÇĞİÖŞÜ]{1,4}\.\d+(?:\.\d+){2,4})\b/;
const PAREN_RE = /\(([^()]{3,})\)\s*$/;

/** Konu / kazanım karşılaştırma anahtarı (büyük-küçük harf ve boşluk farkı yok sayılır) */
export const bransKey = (s: string) => (s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

// Aynı konu yazısı yüzlerce etütte tekrar eder: ayrıştırma bir kez yapılır
const topicCache = new Map<string, { konu: string; kazanim: string }>();
/**
 * Etüt konusundan konu başlığı ve kazanım. Deneme listesinden gelen "M.8.1.1.1 Kazanım metni (Konu başlığı)"
 * → konu = parantezdeki başlık, kazanım = kodlu metin. Kodsuz (elle yazılmış) konu → yalnız konu, kazanım boş.
 */
export function parseEtutTopic(topic: string): { konu: string; kazanim: string } {
  const src = String(topic || '');
  const hit = topicCache.get(src);
  if (hit) return hit;
  const raw = src.trim().replace(DERS_ONEK, '').trim();
  let out: { konu: string; kazanim: string };
  if (!raw) out = { konu: NO_KONU, kazanim: NO_KAZANIM };
  else if (KOD_RE.test(raw)) {
    const paren = PAREN_RE.exec(raw);
    const kazanim = (paren ? raw.slice(0, paren.index) : raw).trim();
    const konu = paren ? paren[1].trim() : kazanim.replace(KOD_RE, '').trim() || kazanim;
    out = { konu, kazanim };
  } else out = { konu: raw, kazanim: NO_KAZANIM };
  if (topicCache.size > 5000) topicCache.clear();
  topicCache.set(src, out);
  return out;
}

/** Ekranda / Excel'de dersin adı */
export const subjectOf = (e: Pick<Etut, 'subject'>) => normalizeSubject(e.subject) || NO_SUBJECT;

/**
 * Bu oturum hangi dersleri alabilir. null = tüm dersler (Rehberlik, idare, kurum yöneticisi, genel yönetici).
 * Öğretmen / Zümre Başkanı / Etüt Öğretmeni: kayıtlı branşının dersleri (zümre başkanında zümresinin dersleri).
 * Branşı kayıtlı değilse: yalnız kendi etütlerinin dersleri (boş dizi + ownOnly).
 */
export function bransScope(): { all: boolean; subjects: string[]; ownOnly: boolean } {
  if (dataService.seesAllEtuts()) return { all: true, subjects: [], ownOnly: false };
  const t = dataService.getCurrentTeacher();
  const list = new Set(subjectsForBranch(t?.branch));
  if (dataService.hasRole('zumre_baskani')) for (const s of Array.from(list)) zumreOf(s).subjects.forEach((x) => list.add(x));
  return { all: false, subjects: Array.from(list), ownOnly: list.size === 0 };
}

/** Bu etüt kapsamda mı (yetki: ders sınırı) */
export function etutInScope(e: Etut, scope: ReturnType<typeof bransScope>): boolean {
  if (e.privacyRedacted) return false;
  if (scope.all) return true;
  if (scope.ownOnly) return dataService.isMyEtut(e);
  return scope.subjects.includes(subjectOf(e));
}

/** Dönemin tarih aralığı (YYYY-AA-GG, iki uç dahil) */
export function donemRange(d: BransDonem, from: string, to: string): { from: string; to: string } {
  const today = todayYmd();
  if (d === 'all') return { from: '0000-01-01', to: '9999-12-31' };
  if (d === 'custom') return { from: from || '0000-01-01', to: to || '9999-12-31' };
  if (d === 'last30') return { from: addDaysYmd(today, -29), to: today };
  if (d === 'month') return { from: `${today.slice(0, 8)}01`, to: `${today.slice(0, 8)}31` };
  if (d === 'year') {
    const y = +today.slice(0, 4);
    const m = +today.slice(5, 7);
    const start = m >= 9 ? y : y - 1;
    return { from: `${start}-09-01`, to: `${start + 1}-08-31` };
  }
  // Bu hafta: pazartesi – pazar
  const dt = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const mon = addDaysYmd(today, -((dt.getDay() + 6) % 7));
  return { from: mon, to: addDaysYmd(mon, 6) };
}

const STATUS: Record<string, string> = { present: 'Geldi', late: 'Geç geldi', excused: 'İzinli', absent: 'Gelmedi' };

export interface BransRow {
  subject: string;
  classId: string;
  className: string;
  studentNo: string;
  student: string;
  konu: string;
  kazanim: string;
  date: string; // YYYY-AA-GG
  time: string;
  teacher: string;
  status: string;
}

export interface BransFilters {
  from: string;
  to: string;
  classId: string; // 'all' ya da sınıf kimliği
  subject: string; // 'all' ya da ders
  konu: string; // '' ya da bransKey(konu)
  kazanim: string; // '' ya da bransKey(kazanım)
}

/** Seçeneklerde gösterilecek konu ve kazanımlar (dönem + sınıf + ders süzgeciyle; kazanım konuya göre daralır) */
export interface BransOptions {
  subjects: string[];
  konular: Array<{ key: string; label: string }>;
  kazanimlar: Array<{ key: string; label: string }>;
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

/** Kapsamdaki etütler (yetki + dönem); sınıf / ders / konu süzgeci satır üretiminde uygulanır */
export function scopedEtuts(etuts: Etut[], scope: ReturnType<typeof bransScope>, from: string, to: string): Etut[] {
  const out: Etut[] = [];
  for (const e of etuts) {
    if (!e || String(e.id).startsWith('__')) continue;
    const d = String(e.date || '').slice(0, 10);
    if (!DATE_RE.test(d) || d < from || d > to) continue;
    if (!etutInScope(e, scope)) continue;
    out.push(e);
  }
  return out;
}

export function bransOptions(list: Etut[], subject: string, konu: string): BransOptions {
  const subs = new Set<string>();
  const ko = new Map<string, string>();
  const ka = new Map<string, string>();
  for (const e of list) {
    const s = subjectOf(e);
    subs.add(s);
    if (subject !== 'all' && s !== subject) continue;
    const p = parseEtutTopic(e.topic);
    const kk = bransKey(p.konu);
    if (!ko.has(kk)) ko.set(kk, p.konu);
    if (p.kazanim && (!konu || kk === konu)) {
      const zk = bransKey(p.kazanim);
      if (!ka.has(zk)) ka.set(zk, p.kazanim);
    }
  }
  const sortOpts = (m: Map<string, string>) =>
    Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => collator.compare(a.label, b.label));
  return { subjects: Array.from(subs).sort(collator.compare), konular: sortOpts(ko), kazanimlar: sortOpts(ka) };
}

/**
 * Ortak gezinme: süzgece uyan her (etüt × öğrenci) çifti için onPair çağrılır. Hem sayım hem satır üretimi bunu
 * kullanır; böylece ekrandaki sayı ile Excel'deki satır sayısı her zaman aynıdır (tam senkron).
 */
function walkBrans(
  list: Etut[],
  students: Student[],
  f: Pick<BransFilters, 'classId' | 'subject' | 'konu' | 'kazanim'>,
  onPair: (e: Etut, s: Student, subject: string, p: { konu: string; kazanim: string }) => void
): void {
  let byId: Map<string, Student> | null = null;
  for (const e of list) {
    const subject = subjectOf(e);
    if (f.subject !== 'all' && subject !== f.subject) continue;
    const p = parseEtutTopic(e.topic);
    if (f.konu && bransKey(p.konu) !== f.konu) continue;
    if (f.kazanim && bransKey(p.kazanim) !== f.kazanim) continue;
    if (e.assignedStudentIds === 'all') {
      for (const s of students) if (f.classId === 'all' || s.classId === f.classId) onPair(e, s, subject, p);
      continue;
    }
    if (!Array.isArray(e.assignedStudentIds) || !e.assignedStudentIds.length) continue;
    if (!byId) byId = new Map(students.map((s) => [s.id, s] as const)); // yalnız gerekirse, bir kez
    const seen = e.assignedStudentIds.length > 1 ? new Set<string>() : null;
    for (const id of e.assignedStudentIds) {
      if (seen) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      const s = byId.get(id);
      if (!s) continue; // görme yetkisi olmayan / silinmiş öğrenci listeye girmez
      if (f.classId !== 'all' && s.classId !== f.classId) continue;
      onPair(e, s, subject, p);
    }
  }
}

/** Ekrandaki özet: satır nesnesi kurmadan, sıralamadan sayar (süzgeç her değiştiğinde çalışır; hafif) */
export function countBrans(list: Etut[], students: Student[], f: Pick<BransFilters, 'classId' | 'subject' | 'konu' | 'kazanim'>) {
  const etutIds = new Set<string>();
  const studentIds = new Set<string>();
  const subjects = new Set<string>();
  let rows = 0;
  walkBrans(list, students, f, (e, s, subject) => {
    rows++;
    etutIds.add(e.id);
    studentIds.add(s.id);
    subjects.add(subject);
  });
  return { rows, etutCount: etutIds.size, studentCount: studentIds.size, subjectCount: subjects.size };
}

/** Excel satırları: yalnız "Excel indir"e basınca kurulur; ders → sınıf → öğrenci → tarih sırasıyla */
export function buildBransRows(list: Etut[], students: Student[], classes: ClassGroup[], f: Pick<BransFilters, 'classId' | 'subject' | 'konu' | 'kazanim'>): BransRow[] {
  const classLabel = new Map(classes.map((c) => [c.id, classLabelOf(c)] as const));
  const teacherOf = new Map<string, string>();
  const rows: BransRow[] = [];
  walkBrans(list, students, f, (e, s, subject, p) => {
    let teacher = teacherOf.get(e.id);
    if (teacher === undefined) {
      const names = e.teacherNames && e.teacherNames.length ? e.teacherNames : e.teacherName ? [e.teacherName] : [];
      teacher = Array.from(new Set(names.map((n) => String(n || '').trim()).filter(Boolean))).join(', ') || '-';
      teacherOf.set(e.id, teacher);
    }
    const att = e.studentAttendance?.[s.id];
    rows.push({
      subject,
      classId: s.classId || '',
      className: classLabel.get(s.classId) || s.className || '-',
      studentNo: String(s.studentNumber || '').trim(),
      student: String(s.name || '').trim() || '-',
      konu: p.konu,
      kazanim: p.kazanim,
      date: String(e.date || '').slice(0, 10),
      time: String(e.time || '').slice(0, 5),
      teacher,
      status: att?.status ? STATUS[att.status] || '' : '',
    });
  });
  rows.sort(
    (a, b) =>
      collator.compare(a.subject, b.subject) ||
      collator.compare(a.className, b.className) ||
      collator.compare(a.student, b.student) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
  );
  return rows;
}

// ----------------------------------------------------------------------------- Excel
const HEAD = ['Sıra', 'Sınıf', 'Öğrenci No', 'Öğrenci', 'Konu', 'Kazanım', 'Tarih', 'Saat', 'Öğretmen', 'Yoklama'];
const WIDTH = [6, 10, 11, 26, 34, 48, 11, 7, 22, 10];

/** Excel sayfa adı: yasak karakterler atılır, 31 karakter, aynı ad tekrar edilmez */
export function sheetNameOf(raw: string, used: Set<string>): string {
  const base = (raw || 'Liste').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 28) || 'Liste';
  let name = base;
  let i = 2;
  while (used.has(name.toLocaleLowerCase('tr-TR'))) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
}

/**
 * Her ders ayrı sayfa. Düzen "toplu": sayfada tek tablo (sınıf sütunu ile). "sinif": sayfada sınıf sınıf bloklar
 * (her sınıfın başlık satırı ve kendi sıra numarası).
 */
export async function downloadBransExcel(rows: BransRow[], duzen: BransDuzen, meta: Array<[string, string]>, fileBase: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const bySubject = new Map<string, BransRow[]>();
  for (const r of rows) {
    let l = bySubject.get(r.subject);
    if (!l) bySubject.set(r.subject, (l = []));
    l.push(r);
  }
  const line = (r: BransRow, i: number): Array<string | number> => [i, r.className, r.studentNo, r.student, r.konu, r.kazanim || '-', shortDate(r.date), r.time, r.teacher, r.status || '-'];
  bySubject.forEach((list, subject) => {
    const aoa: Array<Array<string | number>> = [[`${subject.toLocaleUpperCase('tr-TR')} DERSİ ETÜT LİSTESİ`], ...meta.map(([k, v]) => [k, v]), ['Satır', list.length], []];
    if (duzen === 'toplu') {
      aoa.push(HEAD);
      list.forEach((r, i) => aoa.push(line(r, i + 1)));
    } else {
      let cur = '';
      let n = 0;
      for (const r of list) {
        if (r.className !== cur) {
          if (cur) aoa.push([]);
          cur = r.className;
          n = 0;
          aoa.push([`Sınıf: ${cur}`]);
          aoa.push(HEAD);
        }
        aoa.push(line(r, ++n));
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = WIDTH.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sheetNameOf(subject, used));
  });
  if (!bySubject.size) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Kayıt yok']]), 'Liste');
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}
