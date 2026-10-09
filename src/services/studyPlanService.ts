import { supabase } from '../lib/supabase';
import { newId } from '../lib/ids';
import { callMail, type MailResult } from '../lib/mailApi';

// ============================================================================
// Haftalık çalışma planı (Aşama 19)
//  * student_books    : öğrencinin kitap listesi
//  * study_plans      : öğrencinin bir haftalık planı (gönderildi mi bilgisi burada)
//  * study_plan_items : planın görevleri (gün, ders, kitap, açıklama; öğrenci "yaptım" işaretler)
// Yetki kuralları (yönetici her dersten, öğretmen yalnız kendi branşından görev verir) veritabanında da
// denetlenir; bu dosya yalnızca okur/yazar ve hataları anlaşılır Türkçeye çevirir.
// ============================================================================

export const PLAN_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
// Esnek hafta başlangıcı: JS Date.getDay() düzeni (0 = Pazar, 1 = Pazartesi … 6 = Cumartesi)
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const DEFAULT_WEEK_START_DAY: WeekStartDay = 1; // Pazartesi (eski davranış)
const JS_DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;
// Açılır listede gösterim sırası: Pazartesi … Pazar
export const WEEK_START_DAY_OPTIONS: ReadonlyArray<{ value: WeekStartDay; label: string }> = [1, 2, 3, 4, 5, 6, 0].map((v) => ({
  value: v as WeekStartDay,
  label: JS_DAY_NAMES[v],
}));
export const normalizeWeekStartDay = (v: unknown): WeekStartDay => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? (n as WeekStartDay) : DEFAULT_WEEK_START_DAY;
};
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export interface PlanItem {
  id: string;
  planId: string;
  studentId: string;
  weekStart: string;
  // Planın başlangıç gününden itibaren gün sırası (0 = planın ilk günü … 6 = son günü).
  // Pazartesi başlayan (eski) planlarda 0 = Pazartesi … 6 = Pazar anlamına gelir.
  day: number;
  subject: string;
  book: string;
  note: string;
  position: number;
  createdByName: string;
  doneAt: string | null;
}
export interface PlanHeader {
  id: string;
  studentId: string;
  weekStart: string;
  sentAt: string | null;
  sentByName: string;
  mailedAt?: string | null; // Aşama 22: öğrenciye e-postayla gönderildiği an
  weekStartDay: WeekStartDay; // planın başladığı gün (kolon yoksa / boşsa week_start tarihinden çıkarılır)
}
export interface StudyPlan {
  header: PlanHeader | null;
  items: PlanItem[];
}
export interface StudentBook {
  id: string;
  studentId: string;
  title: string;
  subject: string; // boş = her ders
}
export interface PlanItemDraft {
  day: number;
  subject: string;
  book: string;
  note: string;
}

// ----------------------------------------------------------------------------- Tarih yardımcıları (yerel saat)
const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}
export function addDaysYmd(s: string, days: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
// Verilen günü içeren haftanın ilk günü. startDay: 0 = Pazar, 1 = Pazartesi (varsayılan) … 5 = Cuma, 6 = Cumartesi
export function weekStartOf(s: string | Date, startDay: number = DEFAULT_WEEK_START_DAY): string {
  const sd = normalizeWeekStartDay(startDay);
  const d = typeof s === 'string' ? parseYmd(s) : new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const back = (d.getDay() - sd + 7) % 7;
  d.setDate(d.getDate() - back);
  return ymd(d);
}
// Haftanın son günü (başlangıç + 6 gün)
export function weekEndOf(s: string | Date, startDay: number = DEFAULT_WEEK_START_DAY): string {
  return addDaysYmd(weekStartOf(s, startDay), 6);
}
// Bir planın başlangıç tarihinden başlangıç gününü bulur (0 = Pazar … 6 = Cumartesi)
export const weekStartDayOf = (weekStart: string): WeekStartDay => parseYmd(weekStart).getDay() as WeekStartDay;
// Pazartesi = 0 … Pazar = 6 (eski davranış). weekStart verilirse o planın kaçıncı günü olduğunu döndürür.
export function dayIndexOf(d: Date, weekStart?: string): number {
  if (!weekStart) return (d.getDay() + 6) % 7;
  const a = parseYmd(weekStart);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
export const dateOfDay = (weekStart: string, day: number) => addDaysYmd(weekStart, day);
// Planın d. gününün adı (gerçek tarihten hesaplanır: Cuma başlayan planda 0 → "Cuma")
export const planDayName = (weekStart: string, day: number): string => JS_DAY_NAMES[parseYmd(dateOfDay(weekStart, day)).getDay()];
export const dayNameOfDate = (dateStr: string): string => JS_DAY_NAMES[parseYmd(dateStr).getDay()];
export function shortDayLabel(dateStr: string): string {
  const d = parseYmd(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
}
// "5 – 11 Ekim 2026", "28 Eylül – 4 Ekim 2026"
export function weekRangeLabel(weekStart: string): string {
  const a = parseYmd(weekStart);
  const b = parseYmd(addDaysYmd(weekStart, 6));
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${TR_MONTHS[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${TR_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${TR_MONTHS[a.getMonth()]} – ${b.getDate()} ${TR_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} – ${b.getDate()} ${TR_MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}
export const planIdOf = (studentId: string, weekStart: string) => `plan-${studentId}-${weekStart}`;

// ----------------------------------------------------------------------------- Satır dönüşümleri
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNote = (v: unknown) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000);

function itemFromRow(r: any): PlanItem {
  return {
    id: String(r.id),
    planId: String(r.plan_id),
    studentId: String(r.student_id),
    weekStart: String(r.week_start),
    day: Number(r.day) || 0,
    subject: String(r.subject || ''),
    book: String(r.book || ''),
    note: String(r.note || ''),
    position: Number(r.position) || 0,
    createdByName: String(r.created_by_name || ''),
    doneAt: r.done_at || null,
  };
}
function headerFromRow(r: any): PlanHeader {
  return {
    id: String(r.id),
    studentId: String(r.student_id),
    weekStart: String(r.week_start),
    sentAt: r.sent_at || null,
    sentByName: String(r.sent_by_name || ''),
    mailedAt: r.mailed_at || null,
    weekStartDay:
      r.week_start_day === null || r.week_start_day === undefined ? weekStartDayOf(String(r.week_start)) : normalizeWeekStartDay(r.week_start_day),
  };
}

// week_start_day kolonu henüz eklenmemişse (migration çalıştırılmadıysa) bu hata gelir
const isMissingWeekStartDayColumn = (error: any) =>
  String(error?.code || '') === '42703' || String(error?.code || '') === 'PGRST204' || /week_start_day/i.test(String(error?.message || ''));
// study_plans'a satır ekler; week_start_day kolonu yoksa onsuz tekrar dener (geriye dönük uyumluluk)
async function insertPlanRows(rows: Array<{ id: string; student_id: string; week_start: string }>, returnRow: boolean) {
  const withDay = rows.map((r) => ({ ...r, week_start_day: weekStartDayOf(r.week_start) }));
  const run = (data: object[]) => (returnRow ? supabase.from('study_plans').insert(data).select('*').maybeSingle() : supabase.from('study_plans').insert(data));
  const first = await run(withDay);
  if (first.error && isMissingWeekStartDayColumn(first.error)) return run(rows);
  return first;
}
function bookFromRow(r: any): StudentBook {
  return { id: String(r.id), studentId: String(r.student_id), title: String(r.title || ''), subject: String(r.subject || '') };
}

// Veritabanı hatalarını anlaşılır Türkçeye çevirir
function fail(error: any, fallback: string): never {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === '42P01' || /does not exist|schema cache/i.test(msg)) {
    throw new Error('Haftalık plan için 18 numaralı SQL dosyasının Supabase\'te çalıştırılması gerekiyor.');
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    throw new Error('Bu işlem için yetkiniz yok. Öğretmenler yalnızca kendi branşlarındaki derslerden görev verebilir; kurumunuzun "Ödevler" bölümü kapalı da olabilir.');
  }
  if (code === '23505') throw new Error('Bu kayıt zaten var.');
  throw new Error(`${fallback}${msg ? ` (${msg.slice(0, 120)})` : ''}`);
}

// ----------------------------------------------------------------------------- Öğretmen: plan
export async function loadPlan(studentId: string, weekStart: string): Promise<StudyPlan> {
  const [h, i] = await Promise.all([
    supabase.from('study_plans').select('*').eq('student_id', studentId).eq('week_start', weekStart).maybeSingle(),
    supabase.from('study_plan_items').select('*').eq('student_id', studentId).eq('week_start', weekStart).order('day').order('position').order('created_at'),
  ]);
  if (h.error) fail(h.error, 'Plan okunamadı.');
  if (i.error) fail(i.error, 'Plan görevleri okunamadı.');
  return { header: h.data ? headerFromRow(h.data) : null, items: (i.data || []).map(itemFromRow) };
}

// Planın başlık satırını (yoksa) oluşturur
export async function ensurePlan(studentId: string, weekStart: string): Promise<PlanHeader> {
  const id = planIdOf(studentId, weekStart);
  const found = await supabase.from('study_plans').select('*').eq('id', id).maybeSingle();
  if (found.error) fail(found.error, 'Plan okunamadı.');
  if (found.data) return headerFromRow(found.data);
  const ins: any = await insertPlanRows([{ id, student_id: studentId, week_start: weekStart }], true);
  if (ins.error) {
    if (String(ins.error.code) === '23505') {
      const again = await supabase.from('study_plans').select('*').eq('id', id).maybeSingle();
      if (again.data) return headerFromRow(again.data);
    }
    fail(ins.error, 'Plan oluşturulamadı.');
  }
  return headerFromRow(ins.data);
}

export async function addPlanItem(studentId: string, weekStart: string, draft: PlanItemDraft, position: number, teacherName: string): Promise<PlanItem> {
  const subject = clean(draft.subject, 60);
  if (!subject) throw new Error('Ders seçilmedi.');
  if (!(draft.day >= 0 && draft.day <= 6)) throw new Error('Gün seçilmedi.');
  const plan = await ensurePlan(studentId, weekStart);
  const row = {
    id: newId('pi'),
    plan_id: plan.id,
    student_id: studentId,
    week_start: weekStart,
    day: draft.day,
    subject,
    book: clean(draft.book, 160) || null,
    note: cleanNote(draft.note) || null,
    position,
    created_by_name: clean(teacherName, 120) || null,
  };
  const res = await supabase.from('study_plan_items').insert(row).select('*').maybeSingle();
  if (res.error) fail(res.error, 'Görev kaydedilemedi.');
  return itemFromRow(res.data || row);
}

export async function updatePlanItem(id: string, draft: PlanItemDraft): Promise<PlanItem> {
  const subject = clean(draft.subject, 60);
  if (!subject) throw new Error('Ders seçilmedi.');
  const res = await supabase
    .from('study_plan_items')
    .update({ day: draft.day, subject, book: clean(draft.book, 160) || null, note: cleanNote(draft.note) || null })
    .eq('id', id)
    .select('*');
  if (res.error) fail(res.error, 'Görev güncellenemedi.');
  if (!res.data || res.data.length === 0) throw new Error('Bu görevi değiştirme yetkiniz yok (yalnızca kendi branşınızdaki görevleri değiştirebilirsiniz).');
  return itemFromRow(res.data[0]);
}

export async function deletePlanItem(id: string): Promise<void> {
  const res = await supabase.from('study_plan_items').delete().eq('id', id).select('id');
  if (res.error) fail(res.error, 'Görev silinemedi.');
  if (!res.data || res.data.length === 0) throw new Error('Bu görevi silme yetkiniz yok (yalnızca kendi branşınızdaki görevleri silebilirsiniz).');
}

export async function deletePlan(studentId: string, weekStart: string): Promise<void> {
  const res = await supabase.from('study_plans').delete().eq('id', planIdOf(studentId, weekStart)).select('id');
  if (res.error) fail(res.error, 'Plan silinemedi.');
  if (!res.data || res.data.length === 0) throw new Error('Plan silinemedi: başka branştan görev içeriyor olabilir (yalnızca yönetici silebilir).');
}

// Planı öğrenciye ödev olarak gönderir (öğrenci ana sayfasında "Bugün yapılması gerekenler" çıkar)
export async function sendPlan(studentId: string, weekStart: string, senderName: string): Promise<PlanHeader> {
  const plan = await ensurePlan(studentId, weekStart);
  const res = await supabase
    .from('study_plans')
    .update({ sent_at: new Date().toISOString(), sent_by_name: clean(senderName, 120) || null })
    .eq('id', plan.id)
    .select('*');
  if (res.error) fail(res.error, 'Plan gönderilemedi.');
  if (!res.data || res.data.length === 0) throw new Error('Plan gönderilemedi (yetki yok).');
  return headerFromRow(res.data[0]);
}
export async function unsendPlan(studentId: string, weekStart: string): Promise<PlanHeader> {
  const res = await supabase.from('study_plans').update({ sent_at: null }).eq('id', planIdOf(studentId, weekStart)).select('*');
  if (res.error) fail(res.error, 'Plan geri çekilemedi.');
  if (!res.data || res.data.length === 0) throw new Error('Plan geri çekilemedi (yetki yok).');
  return headerFromRow(res.data[0]);
}

// Seçili haftayla çakışan (farklı başlangıç günlü) kayıtlı planları bulur; öğretmen bunlara tek tıkla geçebilir
export async function findOverlappingPlans(studentIds: string[], weekStart: string): Promise<PlanHeader[]> {
  const ids = Array.from(new Set(studentIds));
  if (!ids.length) return [];
  const from = addDaysYmd(weekStart, -6);
  const to = addDaysYmd(weekStart, 6);
  const out: PlanHeader[] = [];
  for (const part of chunks(ids)) {
    const res = await supabase
      .from('study_plans')
      .select('*')
      .in('student_id', part)
      .gte('week_start', from)
      .lte('week_start', to)
      .neq('week_start', weekStart)
      .order('week_start');
    if (res.error) return []; // yardımcı bilgi; okunamazsa sessizce boş döner
    out.push(...(res.data || []).map(headerFromRow));
  }
  return out;
}

// ----------------------------------------------------------------------------- Öğretmen: kitaplar
export async function listBooks(studentId: string): Promise<StudentBook[]> {
  const res = await supabase.from('student_books').select('*').eq('student_id', studentId).order('title');
  if (res.error) fail(res.error, 'Kitaplar okunamadı.');
  return (res.data || []).map(bookFromRow);
}
const bookKey = (title: string, subject: string) => `${title.toLocaleLowerCase('tr-TR')}|${subject}`;
export async function addBook(studentId: string, title: string, subject: string, existing: StudentBook[] = []): Promise<StudentBook> {
  const t = clean(title, 160);
  if (!t) throw new Error('Kitap adı boş olamaz.');
  const s = clean(subject, 60);
  const dup = existing.find((b) => bookKey(b.title, b.subject) === bookKey(t, s));
  if (dup) return dup;
  const row = { id: newId('bk'), student_id: studentId, title: t, subject: s || null };
  const res = await supabase.from('student_books').insert(row).select('*').maybeSingle();
  if (res.error) {
    if (String(res.error.code) === '23505') {
      const all = await listBooks(studentId);
      const found = all.find((b) => bookKey(b.title, b.subject) === bookKey(t, s));
      if (found) return found;
    }
    fail(res.error, 'Kitap kaydedilemedi.');
  }
  return bookFromRow(res.data || row);
}
export async function deleteBook(id: string): Promise<void> {
  const res = await supabase.from('student_books').delete().eq('id', id).select('id');
  if (res.error) fail(res.error, 'Kitap silinemedi.');
}

// ----------------------------------------------------------------------------- Aşama 23: sınıf / çoklu öğrenci planı
// Sınıf görünümünde aynı görev (gün + ders + kitap + açıklama) birden çok öğrencide ayrı satır olarak
// tutulur; ekranda tek kart olarak birleştirilir, düzenleme / silme hepsine birlikte uygulanır.
const chunks = <T,>(arr: T[], n = 80): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
export const planGroupKey = (i: { day: number; subject: string; book: string; note: string }) => itemKey(i);

export async function loadPlansFor(studentIds: string[], weekStart: string): Promise<{ headers: Record<string, PlanHeader>; items: PlanItem[] }> {
  const ids = Array.from(new Set(studentIds));
  const headers: Record<string, PlanHeader> = {};
  const items: PlanItem[] = [];
  await Promise.all(
    chunks(ids).map(async (part) => {
      const [h, i] = await Promise.all([
        supabase.from('study_plans').select('*').in('student_id', part).eq('week_start', weekStart),
        supabase.from('study_plan_items').select('*').in('student_id', part).eq('week_start', weekStart).order('day').order('position').order('created_at'),
      ]);
      if (h.error) fail(h.error, 'Planlar okunamadı.');
      if (i.error) fail(i.error, 'Plan görevleri okunamadı.');
      for (const r of h.data || []) headers[String(r.student_id)] = headerFromRow(r);
      for (const r of i.data || []) items.push(itemFromRow(r));
    })
  );
  return { headers, items };
}

export async function listBooksFor(studentIds: string[]): Promise<StudentBook[]> {
  const out: StudentBook[] = [];
  await Promise.all(
    chunks(Array.from(new Set(studentIds))).map(async (part) => {
      const res = await supabase.from('student_books').select('*').in('student_id', part).order('title');
      if (res.error) fail(res.error, 'Kitaplar okunamadı.');
      for (const r of res.data || []) out.push(bookFromRow(r));
    })
  );
  return out.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

// Birden çok öğrencinin plan başlığını (yoksa) oluşturur
export async function ensurePlans(studentIds: string[], weekStart: string): Promise<void> {
  const ids = Array.from(new Set(studentIds));
  for (const part of chunks(ids)) {
    const found = await supabase.from('study_plans').select('id').in('id', part.map((s) => planIdOf(s, weekStart)));
    if (found.error) fail(found.error, 'Planlar okunamadı.');
    const have = new Set((found.data || []).map((r: any) => String(r.id)));
    const missing = part.filter((s) => !have.has(planIdOf(s, weekStart)));
    if (!missing.length) continue;
    const ins = await insertPlanRows(
      missing.map((s) => ({ id: planIdOf(s, weekStart), student_id: s, week_start: weekStart })),
      false
    );
    if (ins.error) {
      // Aynı anda başka biri oluşturduysa tek tek dene
      if (String(ins.error.code) === '23505') for (const s of missing) await ensurePlan(s, weekStart);
      else fail(ins.error, 'Plan oluşturulamadı.');
    }
  }
}

// Aynı görevi birden çok öğrencinin planına ekler (positions: öğrenci → o gündeki sıra)
export async function addPlanItemsBulk(
  studentIds: string[],
  weekStart: string,
  draft: PlanItemDraft,
  positions: Record<string, number>,
  teacherName: string
): Promise<PlanItem[]> {
  const subject = clean(draft.subject, 60);
  if (!subject) throw new Error('Ders seçilmedi.');
  if (!(draft.day >= 0 && draft.day <= 6)) throw new Error('Gün seçilmedi.');
  const ids = Array.from(new Set(studentIds));
  if (!ids.length) throw new Error('En az bir öğrenci seçin.');
  await ensurePlans(ids, weekStart);
  const out: PlanItem[] = [];
  for (const part of chunks(ids, 100)) {
    const rows = part.map((sid) => ({
      id: newId('pi'),
      plan_id: planIdOf(sid, weekStart),
      student_id: sid,
      week_start: weekStart,
      day: draft.day,
      subject,
      book: clean(draft.book, 160) || null,
      note: cleanNote(draft.note) || null,
      position: positions[sid] || 0,
      created_by_name: clean(teacherName, 120) || null,
    }));
    const res = await supabase.from('study_plan_items').insert(rows).select('*');
    if (res.error) fail(res.error, 'Görev kaydedilemedi.');
    out.push(...(res.data && res.data.length ? res.data : rows).map(itemFromRow));
  }
  return out;
}

// Birleştirilmiş görevin bütün satırlarını birlikte günceller / siler
export async function updatePlanItems(ids: string[], draft: PlanItemDraft): Promise<number> {
  const subject = clean(draft.subject, 60);
  if (!subject) throw new Error('Ders seçilmedi.');
  let n = 0;
  for (const part of chunks(ids, 100)) {
    const res = await supabase
      .from('study_plan_items')
      .update({ day: draft.day, subject, book: clean(draft.book, 160) || null, note: cleanNote(draft.note) || null })
      .in('id', part)
      .select('id');
    if (res.error) fail(res.error, 'Görev güncellenemedi.');
    n += (res.data || []).length;
  }
  if (ids.length && n === 0) throw new Error('Bu görevi değiştirme yetkiniz yok (yalnızca kendi branşınızdaki görevleri değiştirebilirsiniz).');
  return n;
}
export async function deletePlanItems(ids: string[]): Promise<number> {
  let n = 0;
  for (const part of chunks(ids, 100)) {
    const res = await supabase.from('study_plan_items').delete().in('id', part).select('id');
    if (res.error) fail(res.error, 'Görev silinemedi.');
    n += (res.data || []).length;
  }
  if (ids.length && n === 0) throw new Error('Bu görevi silme yetkiniz yok (yalnızca kendi branşınızdaki görevleri silebilirsiniz).');
  return n;
}
export async function unsendPlans(studentIds: string[], weekStart: string): Promise<number> {
  let n = 0;
  for (const part of chunks(Array.from(new Set(studentIds)), 100)) {
    const res = await supabase
      .from('study_plans')
      .update({ sent_at: null })
      .in('id', part.map((s) => planIdOf(s, weekStart)))
      .select('id');
    if (res.error) fail(res.error, 'Plan geri çekilemedi.');
    n += (res.data || []).length;
  }
  return n;
}

// Kitabı, listesinde olmayan öğrencilerin kitap listesine ekler; yeni eklenen kayıtları döndürür
export async function addBookForStudents(studentIds: string[], title: string, subject: string, existing: StudentBook[]): Promise<StudentBook[]> {
  const t = clean(title, 160);
  if (!t) return [];
  const s = clean(subject, 60);
  const has = (sid: string) =>
    existing.some(
      (b) => b.studentId === sid && (bookKey(b.title, b.subject) === bookKey(t, s) || (!b.subject && b.title.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR')))
    );
  const missing = Array.from(new Set(studentIds)).filter((sid) => !has(sid));
  const out: StudentBook[] = [];
  for (const part of chunks(missing, 100)) {
    const rows = part.map((sid) => ({ id: newId('bk'), student_id: sid, title: t, subject: s || null }));
    const res = await supabase.from('student_books').insert(rows).select('*');
    if (res.error) {
      if (String(res.error.code) !== '23505') fail(res.error, 'Kitap kaydedilemedi.');
      // Bazısında zaten varsa tek tek ekle
      for (const sid of part) {
        try {
          out.push(await addBook(sid, t, s, existing.filter((b) => b.studentId === sid)));
        } catch {
          /* bu öğrencide eklenemezse görev yine kaydedilir */
        }
      }
      continue;
    }
    out.push(...(res.data && res.data.length ? res.data : rows).map(bookFromRow));
  }
  return out;
}

// Birden çok kitap kaydını siler (sınıf görünümü: aynı kitap seçili öğrencilerin hepsinden kalkar)
export async function deleteBooks(ids: string[]): Promise<number> {
  let n = 0;
  for (const part of chunks(Array.from(new Set(ids)), 100)) {
    const res = await supabase.from('student_books').delete().in('id', part).select('id');
    if (res.error) fail(res.error, 'Kitap silinemedi.');
    n += (res.data || []).length;
  }
  return n;
}

// Kitap adını düzenler. rows: aynı kitabın (bir ya da birden çok öğrencideki) kayıtları.
//  * Öğrencide yeni adla aynı kitap zaten varsa eski kayıt silinir (iki kayıt birleşir).
//  * Önce doğrudan güncellenir; veritabanı güncellemeye izin vermiyorsa (RLS) eski kayıt silinip yeni adla eklenir.
//  * Plana daha önce eklenmiş görevlerdeki kitap adı değişmez (görevler adı metin olarak saklar).
export interface BookRenameResult {
  books: StudentBook[]; // yeni adla kayıtlar (güncellenen ya da yeniden eklenen)
  removedIds: string[]; // listeden çıkarılacak eski kayıtlar
}
const isPermissionError = (e: any) => String(e?.code || '') === '42501' || /row-level security|permission denied/i.test(String(e?.message || ''));
export async function renameBooks(rows: StudentBook[], newTitle: string, existing: StudentBook[] = []): Promise<BookRenameResult> {
  const t = clean(newTitle, 160);
  if (!t) throw new Error('Kitap adı boş olamaz.');
  const books: StudentBook[] = [];
  const removedIds: string[] = [];
  const merge: StudentBook[] = [];
  const change: StudentBook[] = [];
  for (const b of rows) {
    if (b.title === t) {
      books.push(b); // ad aynı, değişiklik yok
      continue;
    }
    const twin = existing.find((x) => x.id !== b.id && x.studentId === b.studentId && bookKey(x.title, x.subject) === bookKey(t, b.subject));
    (twin ? merge : change).push(b);
  }
  if (merge.length) {
    await deleteBooks(merge.map((b) => b.id));
    removedIds.push(...merge.map((b) => b.id));
  }

  // 1) Doğrudan güncelleme
  const pending: StudentBook[] = [];
  for (const part of chunks(change, 100)) {
    const res = await supabase.from('student_books').update({ title: t }).in('id', part.map((b) => b.id)).select('*');
    if (res.error) {
      if (!isPermissionError(res.error) && String(res.error.code) !== '23505') fail(res.error, 'Kitap adı güncellenemedi.');
      pending.push(...part);
      continue;
    }
    const got = new Map((res.data || []).map((r: any) => [String(r.id), bookFromRow(r)]));
    for (const b of part) {
      const u = got.get(b.id);
      if (u) books.push(u);
      else pending.push(b); // güncelleme izni yok (RLS satırı sessizce atladı)
    }
  }

  // 2) Güncelleme izni yoksa: önce eski kayıt silinir (silme izni yoksa hiçbir şey değişmez), sonra yeni adla eklenir.
  //    Ekleme başarısız olursa eski kayıt geri konur; böylece çift kayıt ya da kayıp oluşmaz.
  for (const b of pending) {
    const oldRow = { id: b.id, student_id: b.studentId, title: b.title, subject: b.subject || null };
    const row = { id: newId('bk'), student_id: b.studentId, title: t, subject: b.subject || null };
    const del = await supabase.from('student_books').delete().eq('id', b.id).select('id');
    if (del.error) fail(del.error, 'Kitap adı güncellenemedi.');
    if (!(del.data || []).length) throw new Error('Bu kitabın adını değiştirme yetkiniz yok.');
    const ins = await supabase.from('student_books').insert(row).select('*').maybeSingle();
    if (ins.error) {
      if (String(ins.error.code) === '23505') {
        // Yeni adla kayıt veritabanında zaten var: iki kayıt birleşir, var olan kayıt listeye alınır
        removedIds.push(b.id);
        const found = (await listBooks(b.studentId)).find((x) => bookKey(x.title, x.subject) === bookKey(t, b.subject));
        if (found) books.push(found);
        continue;
      }
      await supabase.from('student_books').insert(oldRow); // eski kaydı geri koy
      fail(ins.error, 'Kitap adı güncellenemedi.');
    }
    removedIds.push(b.id);
    books.push(bookFromRow(ins.data || row));
  }
  return { books, removedIds };
}

// ----------------------------------------------------------------------------- Öğretmen: planı başkalarına uygula
export interface ApplyResult {
  students: number;
  added: number;
  skipped: number;
  notAllowed: number;
  failed: Array<{ studentId: string; message: string }>;
}
const itemKey = (i: { day: number; subject: string; book: string; note: string }) =>
  `${i.day}|${i.subject}|${i.book.toLocaleLowerCase('tr-TR')}|${i.note.toLocaleLowerCase('tr-TR')}`;

// Kaynak görevleri hedef öğrencilerin hedef haftasına ekler (aynı görev ikinci kez eklenmez).
// canUseSubject: görevi veren kişi o dersten görev verebiliyor mu (öğretmen yalnız kendi branşı)
export async function applyPlan(opts: {
  items: PlanItem[];
  targetStudentIds: string[];
  targetWeek: string;
  send: boolean;
  senderName: string;
  canUseSubject: (subject: string) => boolean;
}): Promise<ApplyResult> {
  const out: ApplyResult = { students: 0, added: 0, skipped: 0, notAllowed: 0, failed: [] };
  const allowed = opts.items.filter((i) => opts.canUseSubject(i.subject));
  out.notAllowed = opts.items.length - allowed.length;
  for (const sid of opts.targetStudentIds) {
    try {
      const current = await loadPlan(sid, opts.targetWeek);
      const have = new Set(current.items.map(itemKey));
      const perDay = new Map<number, number>();
      current.items.forEach((i) => perDay.set(i.day, Math.max(perDay.get(i.day) || 0, i.position + 1)));
      const toAdd = allowed.filter((i) => {
        const k = itemKey(i);
        if (have.has(k)) {
          out.skipped++;
          return false;
        }
        have.add(k);
        return true;
      });
      if (toAdd.length) {
        const plan = await ensurePlan(sid, opts.targetWeek);
        const rows = toAdd.map((i) => {
          const pos = perDay.get(i.day) || 0;
          perDay.set(i.day, pos + 1);
          return {
            id: newId('pi'),
            plan_id: plan.id,
            student_id: sid,
            week_start: opts.targetWeek,
            day: i.day,
            subject: i.subject,
            book: i.book || null,
            note: i.note || null,
            position: pos,
            created_by_name: clean(opts.senderName, 120) || null,
          };
        });
        const res = await supabase.from('study_plan_items').insert(rows);
        if (res.error) fail(res.error, 'Görevler eklenemedi.');
        out.added += rows.length;
        // Kitap adları hedef öğrencinin listesine de eklenir (sonraki planlarda açılır listede çıksın)
        try {
          let books = await listBooks(sid);
          for (const i of toAdd) {
            if (!i.book) continue;
            if (books.some((b) => bookKey(b.title, b.subject) === bookKey(i.book, i.subject) || (b.title.toLocaleLowerCase('tr-TR') === i.book.toLocaleLowerCase('tr-TR') && !b.subject))) continue;
            books = [...books, await addBook(sid, i.book, i.subject, books)];
          }
        } catch {
          /* kitap listesi yazılamazsa görevler yine de eklenmiş olur */
        }
      }
      if (opts.send && (toAdd.length > 0 || current.items.length > 0)) await sendPlan(sid, opts.targetWeek, opts.senderName);
      out.students++;
    } catch (e: any) {
      out.failed.push({ studentId: sid, message: e?.message || 'Bilinmeyen hata' });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------- Öğrenci
// Öğrenci yalnızca kendisine GÖNDERİLMİŞ planı görebilir (veritabanı denetler)
export async function loadMyWeek(weekStart: string): Promise<{ items: PlanItem[]; sentByName: string }> {
  const [i, h] = await Promise.all([
    supabase.from('study_plan_items').select('*').eq('week_start', weekStart).order('day').order('position').order('created_at'),
    supabase.from('study_plans').select('*').eq('week_start', weekStart).maybeSingle(),
  ]);
  if (i.error) return { items: [], sentByName: '' };
  return { items: (i.data || []).map(itemFromRow), sentByName: h.data ? String(h.data.sent_by_name || '') : '' };
}
// Bugünü kapsayan, öğrenciye gönderilmiş planı bulur (plan hangi gün başlarsa başlasın).
// Bulunamazsa ya da sorgu başarısız olursa eski davranışa (Pazartesi başlayan hafta) döner.
export async function loadMyCurrentWeek(today: Date = new Date()): Promise<{ weekStart: string; items: PlanItem[]; sentByName: string }> {
  const todayStr = ymd(today);
  const fallback = weekStartOf(today);
  const h = await supabase
    .from('study_plans')
    .select('*')
    .gte('week_start', addDaysYmd(todayStr, -6))
    .lte('week_start', todayStr)
    .not('sent_at', 'is', null)
    .order('week_start', { ascending: false });
  if (!h.error && h.data && h.data.length) {
    // En son başlayan ve içinde görev olan planı seç
    for (const row of h.data) {
      const ws = String(row.week_start);
      const i = await supabase.from('study_plan_items').select('*').eq('week_start', ws).order('day').order('position').order('created_at');
      if (!i.error && i.data && i.data.length) return { weekStart: ws, items: i.data.map(itemFromRow), sentByName: String(row.sent_by_name || '') };
    }
  }
  const r = await loadMyWeek(fallback);
  return { weekStart: fallback, ...r };
}
export async function setTaskDone(itemId: string, done: boolean): Promise<void> {
  const res = await supabase.rpc('student_set_plan_task_done', { p_item_id: itemId, p_done: done });
  if (res.error) fail(res.error, 'İşaret kaydedilemedi.');
}

// ----------------------------------------------------------------------------- Aşama 22: e-posta / WhatsApp ile gönderim
export type PlanGroupKind = 'student' | 'students' | 'class';
export interface PlanGroupResult {
  groupId: string;
  kind: PlanGroupKind;
  label: string;
  links: Record<string, string>; // öğrenci → kişisel işaretleme bağlantısı
  students: Array<{ id: string; hasEmail: boolean }>;
}
// Gönderilmiş planlar için bir "gönderim grubu" açar (öğretmen raporu bu gruba göre hazırlanır)
export async function createPlanGroup(opts: {
  weekStart: string;
  studentIds: string[];
  kind: PlanGroupKind;
  classId?: string;
  mailStudents: boolean;
}): Promise<PlanGroupResult> {
  const r: MailResult = await callMail('plan-group', opts);
  if (!r.ok) {
    const msg = String(r.error || '');
    if (/study_plan_groups|schema cache|does not exist/i.test(msg)) throw new Error('E-posta ile gönderim için 21 numaralı SQL dosyasının Supabase\'te çalıştırılması gerekiyor.');
    throw new Error(msg || 'Gönderim hazırlanamadı.');
  }
  return { groupId: r.groupId, kind: r.kind, label: r.label, links: r.links || {}, students: r.students || [] };
}
// Bir öğrenciye planı e-postayla gönderir (PDF eki isteğe bağlı, base64)
export async function mailPlanToStudent(groupId: string, studentId: string, pdfBase64?: string): Promise<MailResult> {
  return callMail('plan-mail', { groupId, studentId, pdf: pdfBase64 || undefined });
}
// WhatsApp mesaj metni ve bağlantısı (tıklayınca WhatsApp açılır, öğretmen gönderir)
export function planWhatsappText(studentName: string, weekStart: string, items: PlanItem[], markUrl?: string): string {
  const lines: string[] = [`Merhaba ${studentName}, ${weekRangeLabel(weekStart)} haftası çalışma planın:`];
  PLAN_DAYS.forEach((_, d) => {
    const list = items.filter((i) => i.day === d).sort((a, b) => a.position - b.position);
    if (!list.length) return;
    lines.push('', `*${planDayName(weekStart, d)}*`);
    for (const i of list) lines.push(`- ${i.subject}${i.book ? ` (${i.book})` : ''}${i.note ? `: ${i.note}` : ''}`);
  });
  if (markUrl) lines.push('', `Görevlerini yaptıkça buradan işaretle: ${markUrl}`);
  return lines.join('\n');
}
export function whatsappUrl(phone: string | undefined, text: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  const intl = digits ? (digits.startsWith('90') ? digits : digits.startsWith('0') ? `9${digits}` : `90${digits}`) : '';
  return `https://api.whatsapp.com/send?${intl ? `phone=${intl}&` : ''}text=${encodeURIComponent(text)}`;
}
