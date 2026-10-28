// ============================================================================
// DENEME ANALİZİ (Aşama 47) — VERİTABANI İŞLEMLERİ
// Yetki veritabanında (38 numaralı SQL) denetlenir: genel yönetici hepsini, kurum yöneticisi
// yalnızca kendi kurumunu görür; öğrenci yalnızca açılmış denemedeki kendi sonucunu okur.
// ============================================================================
import { supabase } from '../lib/supabase';
import { dataService } from './dataService';
import type { OptikField, OptikRow } from '../lib/deneme/optik';
import type { ExamQuestions, ExamSubject, ExamSummary, ResultStats, ScoringSettings } from '../lib/deneme/lgs';
import { newId } from '../lib/ids';

export interface DenemeExam {
  id: string;
  kurumId: string | null;
  name: string;
  publisher: string;
  examDate: string; // YYYY-AA-GG
  grade: string;
  examType: string;
  subjects: ExamSubject[];
  questions: ExamQuestions;
  scoring: ScoringSettings;
  summary: Partial<ExamSummary>;
  published: boolean;
  createdAt: string;
  /** Aşama 90: yarım kalmış (taslak) yeni deneme: hangi adımda bırakıldığı (listede gösterilir) */
  draftInfo?: { step: number; at: string };
  /** Aşama 90: taslağın optik verisi ve eşleştirme ilerlemesi (yalnızca getExam ile gelir) */
  draft?: DenemeDraft;
}

/** Aşama 90: taslakta saklanan optik dosyası (TC YOK; TC ile bulunan öğrenci yalnızca kimliğiyle tutulur) */
export interface DraftFile {
  name: string;
  fmtName: string;
  rows: Array<Omit<OptikRow, 'tc'> & { sid?: string }>;
}

export interface DenemeDraft {
  v: 1;
  step: number;
  files: DraftFile[];
  /** 3. adım ilerlemesi: satır anahtarı → seçim */
  match?: Array<{ k: string; s: string | null; st: 'ok' | 'check' | 'none'; sk: boolean; m: boolean; me: string }>;
}

/** Taslak deneme mi (sonuçları henüz kaydedilmemiş yeni deneme) */
export const isDraftExam = (e: Pick<DenemeExam, 'draftInfo'>) => !!e.draftInfo;

export interface DenemeResult {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string | null;
  booklet: string;
  answers: Record<string, string>;
  stats: ResultStats;
  totalNet: number | null;
  score: number | null;
  matchedBy: string;
  /** Aşama 94: kag = kâğıttaki (kitapçık) sırasıyla cevaplar; B eşleşmesi değişince sonuçlar bundan yeniden kurulur (TC YOK) */
  optik: { number?: string; name?: string; grade?: string; section?: string; kag?: Record<string, string> };
}

export interface DenemeFormat {
  id: string;
  kurumId: string | null;
  name: string;
  fmtText: string;
  fields: OptikField[];
}

const SETUP_MSG = 'Deneme Analizi için 38 numaralı SQL dosyasının Supabase\'te çalıştırılması gerekiyor.';

function fail(error: any, fallback: string): never {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(msg)) throw new Error(SETUP_MSG);
  if (code === '42501' || /row-level security|permission/i.test(msg)) throw new Error('Bu işlem için yetkiniz yok.');
  if (/fetch|network|Failed to/i.test(msg)) throw new Error('Bağlantı sorunu. İnternetinizi kontrol edip tekrar deneyin.');
  throw new Error(fallback);
}

export const isSetupError = (e: unknown) => e instanceof Error && e.message === SETUP_MSG;

/** Yeni kayıtların kurumu: genel yönetici için boş, kurum yöneticisi için kendi kurumu */
const myKurumId = () => (dataService.isHeadAdmin() ? null : dataService.getMyKurumId());

// Aşama 90: taslak verisi "questions" sütununda "_taslak" anahtarında durur (liste sorgusu bu sütunu okumaz;
// liste hafif kalır). Uygulamanın geri kalanı bu anahtarı görmez: burada ayrılır.
const DRAFT_KEY = '_taslak';
const examFromRow = (r: any): DenemeExam => {
  const q = r.questions && typeof r.questions === 'object' ? { ...r.questions } : {};
  const draft = q[DRAFT_KEY] && typeof q[DRAFT_KEY] === 'object' ? (q[DRAFT_KEY] as DenemeDraft) : undefined;
  delete q[DRAFT_KEY];
  const t = r.summary && typeof r.summary === 'object' ? r.summary.taslak : null;
  const e = examFromRowBase({ ...r, questions: q });
  if (t && typeof t === 'object') e.draftInfo = { step: Number(t.step) || 1, at: String(t.at || '') };
  if (draft && e.draftInfo) e.draft = draft;
  return e;
};

const examFromRowBase = (r: any): DenemeExam => ({
  id: r.id,
  kurumId: r.kurum_id ?? null,
  name: r.name || '',
  publisher: r.publisher || '',
  examDate: r.exam_date || '',
  grade: r.grade || '8',
  examType: r.exam_type || 'LGS',
  subjects: Array.isArray(r.subjects) ? r.subjects : [],
  questions: r.questions && typeof r.questions === 'object' ? r.questions : {},
  scoring: r.scoring && typeof r.scoring === 'object' ? r.scoring : ({} as ScoringSettings),
  summary: r.summary && typeof r.summary === 'object' ? r.summary : {},
  published: !!r.published,
  createdAt: r.created_at || '',
});

const resultFromRow = (r: any): DenemeResult => ({
  id: r.id,
  examId: r.exam_id,
  studentId: r.student_id,
  studentName: r.student_name || '',
  classId: r.class_id ?? null,
  className: r.class_name ?? null,
  booklet: r.booklet || '',
  answers: r.answers && typeof r.answers === 'object' ? r.answers : {},
  stats: r.stats && typeof r.stats === 'object' ? r.stats : { subjects: {}, weighted: 0 },
  totalNet: r.total_net === null || r.total_net === undefined ? null : Number(r.total_net),
  score: r.score === null || r.score === undefined ? null : Number(r.score),
  matchedBy: r.matched_by || '',
  optik: r.optik && typeof r.optik === 'object' ? r.optik : {},
});

// ----------------------------------------------------------------------------- Denemeler
/** Denemeler. Aşama 90: taslaklar (sonuçları kaydedilmemiş yeni denemeler) yalnızca istenirse gelir */
export async function listExams(opt: { drafts?: boolean } = {}): Promise<DenemeExam[]> {
  let q = supabase
    .from('deneme_exams')
    .select('id,kurum_id,name,publisher,exam_date,grade,exam_type,subjects,scoring,summary,published,created_at');
  // Aşama 97: genel yöneticinin panelinde yalnızca kendi denemeleri (kurumların denemeleri kuruma geçince görünür)
  if (dataService.isHeadAdmin()) q = q.is('kurum_id', null);
  const { data, error } = await q
    .order('exam_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) fail(error, 'Denemeler yüklenemedi.');
  const list = (data || []).map((r: any) => examFromRow({ ...r, questions: {} }));
  return opt.drafts ? list : list.filter((e) => !e.draftInfo);
}

/** Aşama 98: Kurum Özeti için son sonuçlu denemenin özeti (yalnızca birkaç alan okunur; soru oranları gelmez) */
export async function lastExamBrief(): Promise<{ id: string; name: string; examDate: string; count: number; avgScore: number | null; avgTotalNet: number | null } | null> {
  const { data, error } = await supabase
    .from('deneme_exams')
    .select('id,name,exam_date,count:summary->count,avg:summary->avgScore,net:summary->avgTotalNet,taslak:summary->taslak')
    .order('exam_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return null;
  const r = (data || []).find((x: any) => !x.taslak && Number(x.count) > 0) as any;
  if (!r) return null;
  const num = (v: any) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  return { id: r.id, name: r.name || 'Deneme', examDate: r.exam_date || '', count: Number(r.count) || 0, avgScore: num(r.avg), avgTotalNet: num(r.net) };
}

export async function getExam(id: string): Promise<DenemeExam> {
  const { data, error } = await supabase.from('deneme_exams').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Deneme yüklenemedi.');
  if (!data) throw new Error('Deneme bulunamadı ya da görme yetkiniz yok.');
  return examFromRow(data);
}

const stripDraftInfo = (sm: any) => {
  if (!sm || typeof sm !== 'object' || !('taslak' in sm)) return sm || {};
  const { taslak: _t, ...rest } = sm;
  return rest;
};

export async function saveExam(exam: Omit<DenemeExam, 'createdAt' | 'kurumId'> & { kurumId?: string | null }): Promise<DenemeExam> {
  const row = {
    id: exam.id || newId('dnm'),
    kurum_id: exam.kurumId !== undefined ? exam.kurumId : myKurumId(),
    name: exam.name.trim().slice(0, 200),
    publisher: (exam.publisher || '').trim().slice(0, 120) || null,
    exam_date: exam.examDate || null,
    grade: exam.grade || '8',
    exam_type: exam.examType || 'LGS',
    subjects: exam.subjects,
    // Aşama 90: taslak varsa sorularla birlikte saklanır; taslaksız kayıt (sonuçlar kaydedilince) taslağı siler
    questions: exam.draftInfo && exam.draft ? { ...exam.questions, [DRAFT_KEY]: exam.draft } : exam.questions,
    scoring: exam.scoring,
    summary: exam.draftInfo ? { ...(exam.summary || {}), taslak: exam.draftInfo } : stripDraftInfo(exam.summary),
    published: exam.draftInfo ? false : !!exam.published,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('deneme_exams').upsert(row, { onConflict: 'id' }).select('*').maybeSingle();
  if (error) fail(error, 'Deneme kaydedilemedi.');
  if (!data) throw new Error('Deneme kaydedilemedi (yetki).');
  return examFromRow(data);
}

/** Aşama 50: denemenin genel bilgilerini günceller (ad, yayınevi, tarih). Cevap anahtarı ve sonuçlar değişmez. */
export async function updateExamInfo(id: string, info: { name: string; publisher: string; examDate: string }): Promise<void> {
  const name = info.name.trim().slice(0, 200);
  if (!name) throw new Error('Deneme adı boş olamaz.');
  const { data, error } = await supabase
    .from('deneme_exams')
    .update({
      name,
      publisher: (info.publisher || '').trim().slice(0, 120) || null,
      exam_date: info.examDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error) fail(error, 'Deneme bilgileri kaydedilemedi.');
  if (!data?.length) throw new Error('Deneme bilgileri kaydedilemedi (yetki).');
}

export async function setExamPublished(id: string, published: boolean): Promise<void> {
  const { data, error } = await supabase.from('deneme_exams').update({ published, updated_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) fail(error, 'Değişiklik kaydedilemedi.');
  if (!data?.length) throw new Error('Değişiklik kaydedilemedi (yetki).');
}

export async function deleteExam(id: string): Promise<void> {
  const { data, error } = await supabase.from('deneme_exams').delete().eq('id', id).select('id');
  if (error) fail(error, 'Deneme silinemedi.');
  if (!data?.length) throw new Error('Deneme silinemedi (yetki).');
}

// ----------------------------------------------------------------------------- Sonuçlar
export async function listResults(examId: string): Promise<DenemeResult[]> {
  const out: DenemeResult[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('deneme_results').select('*').eq('exam_id', examId).order('id').range(from, from + 999);
    if (error) fail(error, 'Sonuçlar yüklenemedi.');
    out.push(...(data || []).map(resultFromRow));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const resultToRow = (r: DenemeResult) => ({
  id: r.id || `${r.examId}:${r.studentId}`.slice(0, 120),
  exam_id: r.examId,
  student_id: r.studentId,
  student_name: (r.studentName || '').slice(0, 160),
  class_id: r.classId,
  class_name: r.className ? r.className.slice(0, 120) : null,
  booklet: r.booklet || null,
  answers: r.answers,
  stats: r.stats,
  total_net: r.totalNet,
  score: r.score,
  matched_by: (r.matchedBy || '').slice(0, 40) || null,
  optik: r.optik || {},
  updated_at: new Date().toISOString(),
});

/** Denemenin sonuçlarını yazar; `replaceAll` ise listede olmayan eski sonuçlar silinir */
export async function saveResults(examId: string, results: DenemeResult[], replaceAll: boolean, onProgress?: (done: number, total: number) => void): Promise<void> {
  const rows = results.map(resultToRow);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('deneme_results').upsert(rows.slice(i, i + 200), { onConflict: 'exam_id,student_id' });
    if (error) fail(error, 'Sonuçlar kaydedilemedi.');
    onProgress?.(Math.min(rows.length, i + 200), rows.length);
  }
  if (replaceAll) {
    const keep = new Set(results.map((r) => r.studentId));
    const existing = await listResults(examId);
    const stale = existing.filter((r) => !keep.has(r.studentId)).map((r) => r.id);
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await supabase.from('deneme_results').delete().in('id', stale.slice(i, i + 100));
      if (error) fail(error, 'Eski sonuçlar silinemedi.');
    }
  }
}

export async function deleteResult(id: string): Promise<void> {
  const { data, error } = await supabase.from('deneme_results').delete().eq('id', id).select('id');
  if (error) fail(error, 'Sonuç silinemedi.');
  if (!data?.length) throw new Error('Sonuç silinemedi (yetki).');
}

// ----------------------------------------------------------------------------- Optik formatları
export async function listFormats(): Promise<DenemeFormat[]> {
  const { data, error } = await supabase.from('deneme_formats').select('*').order('name');
  if (error) fail(error, 'Optik formatları yüklenemedi.');
  return (data || []).map((r: any) => ({
    id: r.id,
    kurumId: r.kurum_id ?? null,
    name: r.name || '',
    fmtText: r.fmt_text || '',
    fields: Array.isArray(r.fields) ? r.fields : [],
  }));
}

export async function saveFormat(f: { id?: string; name: string; fmtText: string; fields: OptikField[] }): Promise<DenemeFormat> {
  const row = {
    id: f.id || newId('fmt'),
    kurum_id: myKurumId(),
    name: f.name.trim().slice(0, 120) || 'Optik formatı',
    fmt_text: (f.fmtText || '').slice(0, 20000) || null,
    fields: f.fields,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('deneme_formats').upsert(row, { onConflict: 'id' }).select('*').maybeSingle();
  if (error) fail(error, 'Format kaydedilemedi.');
  if (!data) throw new Error('Format kaydedilemedi (yetki).');
  return { id: data.id, kurumId: data.kurum_id ?? null, name: data.name, fmtText: data.fmt_text || '', fields: data.fields || [] };
}

export async function deleteFormat(id: string): Promise<void> {
  const { data, error } = await supabase.from('deneme_formats').delete().eq('id', id).select('id');
  if (error) fail(error, 'Format silinemedi.');
  if (!data?.length) throw new Error('Bu formatı silme yetkiniz yok (genel yöneticinin formatı olabilir).');
}

// ----------------------------------------------------------------------------- Eşleştirme hafızası
export async function loadAliases(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('deneme_aliases').select('alias_key,student_id');
  if (error) fail(error, 'Eşleştirme hafızası yüklenemedi.');
  const out: Record<string, string> = {};
  for (const r of data || []) out[(r as any).alias_key] = (r as any).student_id;
  return out;
}

export async function saveAliases(list: Array<{ aliasKey: string; studentId: string }>): Promise<void> {
  if (!list.length) return;
  const kurum = myKurumId();
  const rows = list.map((a) => ({
    id: `${kurum || 'genel'}|${a.aliasKey}`.slice(0, 200),
    kurum_id: kurum,
    alias_key: a.aliasKey,
    student_id: a.studentId,
  }));
  const { error } = await supabase.from('deneme_aliases').upsert(rows, { onConflict: 'id' });
  if (error) fail(error, 'Eşleştirme hafızası kaydedilemedi.');
}

// ----------------------------------------------------------------------------- Karneler için toplu okuma
/** Aşama 51: grafik ve karnelerde denemeler YÜKLENİŞ sırasıyla (eskiden yeniye) dizilir */
export const byUploadOrder = (a: { createdAt: string; examDate?: string }, b: { createdAt: string; examDate?: string }) =>
  (a.createdAt || '').localeCompare(b.createdAt || '') || (a.examDate || '').localeCompare(b.examDate || '');

/** Seçilen denemelerin tamamı (cevap anahtarı ve kazanımlarla) */
export async function getExamsFull(ids: string[]): Promise<DenemeExam[]> {
  if (!ids.length) return [];
  const out: DenemeExam[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase.from('deneme_exams').select('*').in('id', ids.slice(i, i + 50));
    if (error) fail(error, 'Denemeler yüklenemedi.');
    out.push(...(data || []).map(examFromRow));
  }
  return out.sort(byUploadOrder);
}

/** Denemelerin sonuçları; öğrenci ya da sınıfla süzülebilir (öğrenci oturumunda yalnızca kendi sonuçları gelir) */
export async function listResultsFor(opts: { examIds?: string[]; studentId?: string; classId?: string }): Promise<DenemeResult[]> {
  const out: DenemeResult[] = [];
  const ids = opts.examIds;
  if (ids && !ids.length) return out;
  const chunks = ids ? Array.from({ length: Math.ceil(ids.length / 40) }, (_, i) => ids.slice(i * 40, i * 40 + 40)) : [null];
  for (const part of chunks) {
    for (let from = 0; from < 50000; from += 1000) {
      let q: any = supabase.from('deneme_results').select('*');
      if (part) q = q.in('exam_id', part);
      if (opts.studentId) q = q.eq('student_id', opts.studentId);
      if (opts.classId) q = q.eq('class_id', opts.classId);
      const { data, error } = await q.order('id').range(from, from + 999);
      if (error) fail(error, 'Sonuçlar yüklenemedi.');
      out.push(...(data || []).map(resultFromRow));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

/** Öğrenci oturumu: açılmış denemelerdeki kendi sonuçları ve o denemeler */
export async function loadMyDenemeler(): Promise<{ exams: DenemeExam[]; results: DenemeResult[] }> {
  const results = await listResultsFor({});
  const exams = await getExamsFull(Array.from(new Set(results.map((r) => r.examId))));
  const visible = new Set(exams.map((e) => e.id));
  return { exams, results: results.filter((r) => visible.has(r.examId)) };
}

// ----------------------------------------------------------------------------- Aşama 50: TC parmak izi
// Veritabanında TC'nin kendisi değil, sunucuda gizli anahtarla üretilen geri çevrilemez parmak izi durur.
const TC_SETUP_MSG = "TC eşleştirmesi için 51 numaralı SQL dosyasının (51_ogrenci_tc_parmakizi.sql) Supabase'te çalıştırılması gerekiyor.";

/** Parmak izi kayıtlı öğrenciler: öğrenci kimliği → parmak izi */
export async function listStudentTcHashes(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from('students').select('id,tc_hash').not('tc_hash', 'is', null).order('id').range(from, from + 999);
    if (error) {
      if (/tc_hash/.test(String(error.message || '')) || String(error.code || '') === '42703') throw new Error(TC_SETUP_MSG);
      fail(error, 'TC bilgileri okunamadı.');
    }
    for (const r of data || []) if ((r as any).tc_hash) out.set((r as any).id, (r as any).tc_hash);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Tek öğrencinin parmak izi kayıtlı mı? (parmak izinin kendisi de döner; TC değildir) */
export async function getStudentTcHash(studentId: string): Promise<string | null> {
  const { data, error } = await supabase.from('students').select('tc_hash').eq('id', studentId).maybeSingle();
  if (error) {
    if (/tc_hash/.test(String(error.message || '')) || String(error.code || '') === '42703') throw new Error(TC_SETUP_MSG);
    fail(error, 'TC bilgisi okunamadı.');
  }
  return (data as any)?.tc_hash || null;
}

/** Öğrencilerin parmak izlerini yazar (null = siler). Yalnızca yetkili olunan öğrenciler güncellenir. */
export async function setStudentTcHashes(list: Array<{ id: string; hash: string | null }>, onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const { data, error } = await supabase.from('students').update({ tc_hash: it.hash }).eq('id', it.id).select('id');
    if (error) {
      if (/tc_hash/.test(String(error.message || '')) || String(error.code || '') === '42703') throw new Error(TC_SETUP_MSG);
      failed++;
    } else if (!data?.length) failed++;
    else ok++;
    onProgress?.(i + 1, list.length);
  }
  return { ok, failed };
}

// ----------------------------------------------------------------------------- Hedef puan
export async function getTarget(studentId: string): Promise<number | null> {
  const { data, error } = await supabase.from('deneme_targets').select('target_score').eq('student_id', studentId).maybeSingle();
  if (error) fail(error, 'Hedef puan okunamadı.');
  return data && data.target_score !== null && data.target_score !== undefined ? Number(data.target_score) : null;
}

export async function setTarget(studentId: string, score: number | null): Promise<void> {
  if (score === null) {
    const { error } = await supabase.from('deneme_targets').delete().eq('student_id', studentId);
    if (error) fail(error, 'Hedef silinemedi.');
    return;
  }
  const { error } = await supabase
    .from('deneme_targets')
    .upsert({ student_id: studentId, target_score: Math.max(0, Math.min(500, score)), updated_at: new Date().toISOString() }, { onConflict: 'student_id' });
  if (error) fail(error, 'Hedef kaydedilemedi.');
}

// ----------------------------------------------------------------------------- Kazanım bankası
export async function upsertKazanimlar(list: Array<{ code: string; subject: string; grade: string; text: string; konu?: string }>): Promise<void> {
  const map = new Map<string, any>();
  for (const k of list) {
    const code = (k.code || '').trim();
    if (!code || !k.text) continue;
    map.set(code, { code: code.slice(0, 60), subject: k.subject.slice(0, 80), grade: k.grade || null, text: k.text.slice(0, 2000), konu: k.konu ? k.konu.slice(0, 300) : null, updated_at: new Date().toISOString() });
  }
  const rows = Array.from(map.values());
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('deneme_kazanimlar').upsert(rows.slice(i, i + 200), { onConflict: 'code', ignoreDuplicates: true });
    if (error) fail(error, 'Kazanım bankası güncellenemedi.');
  }
}

// ----------------------------------------------------------------------------- Kazanım bankası yönetimi (Aşama 48)
export interface BankRow {
  code: string;
  subject: string;
  grade: string;
  text: string;
  konu: string;
  updatedAt?: string; // Aşama 48d: yükleme zamanı (yüklemeleri topluca silebilmek için)
  alt?: string[]; // Aşama 48g: kazanımın açıklama maddeleri (a, b, c …) = alt kazanımlar
}

/** Bankadaki bütün kazanımlar (MEB kazanımları; kişisel bilgi yok) */
export async function listKazanimlar(): Promise<BankRow[]> {
  const out: BankRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('deneme_kazanimlar').select('code,subject,grade,text,konu,alt,updated_at').order('code').range(from, from + 999);
    if (error) fail(error, 'Kazanım bankası yüklenemedi.');
    for (const r of data || [])
      out.push({
        code: r.code,
        subject: r.subject || '',
        grade: r.grade || '',
        text: r.text || '',
        konu: r.konu || '',
        updatedAt: r.updated_at || '',
        alt: Array.isArray(r.alt) ? (r.alt as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()) : [],
      });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Kazanımları bankaya yazar; aynı kodlu kazanımın metni ve konusu güncellenir.
 *  Aşama 96: ortak bankadaki var olan kazanımı yalnızca genel yönetici değiştirir; kurumlar yalnızca YENİ kazanım ekler. */
export async function saveKazanimBank(list: BankRow[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const map = new Map<string, any>();
  const stamp = new Date().toISOString(); // bir yüklemenin bütün satırları aynı zamanı taşır
  for (const k of list) {
    const code = (k.code || '').trim();
    if (!code || !k.text || !k.subject) continue;
    map.set(code, {
      code: code.slice(0, 60),
      subject: k.subject.slice(0, 80),
      grade: (k.grade || '').slice(0, 10) || null,
      text: k.text.slice(0, 2000),
      konu: k.konu ? k.konu.slice(0, 300) : null,
      alt: (k.alt || []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 20).map((x) => x.trim().slice(0, 600)),
      updated_at: stamp,
    });
  }
  const rows = Array.from(map.values());
  const head = dataService.isHeadAdmin();
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('deneme_kazanimlar').upsert(rows.slice(i, i + 200), { onConflict: 'code', ignoreDuplicates: !head });
    if (error) fail(error, 'Kazanım bankası kaydedilemedi.');
    onProgress?.(Math.min(rows.length, i + 200), rows.length);
  }
  return rows.length;
}

/** Aşama 48g: yalnızca konu alanını günceller (kazanım metni ve yükleme zamanı değişmez) */
export async function updateKazanimKonular(changes: Map<string, string>, onProgress?: (done: number, total: number) => void): Promise<number> {
  const byKonu = new Map<string, string[]>();
  for (const [code, konu] of changes) {
    const k = konu.slice(0, 300);
    byKonu.set(k, [...(byKonu.get(k) || []), code]);
  }
  let done = 0;
  for (const [konu, codes] of byKonu) {
    for (let i = 0; i < codes.length; i += 100) {
      const part = codes.slice(i, i + 100);
      const { error } = await supabase.from('deneme_kazanimlar').update({ konu }).in('code', part);
      if (error) fail(error, 'Konular kaydedilemedi.');
      done += part.length;
      onProgress?.(done, changes.size);
    }
  }
  return done;
}

/**
 * Aşama 48g: kayıtlı denemelerdeki soruların konu ve kazanım metnini bankadaki son hâliyle günceller.
 * Puanlar ve sonuçlar değişmez (konu analizi bankaya göre yeniden gruplanır).
 */
export async function applyBankToSavedExams(bank: BankRow[], onProgress?: (done: number, total: number) => void): Promise<{ exams: number; questions: number }> {
  const key = (c: string) => (c || '').replace(/\s+/g, '').replace(/\.+$/, '').toLocaleUpperCase('tr-TR');
  const byCode = new Map(bank.map((r) => [key(r.code), r]));
  const list = await listExams();
  const full = await getExamsFull(list.map((e) => e.id));
  let exams = 0;
  let questions = 0;
  for (let i = 0; i < full.length; i++) {
    const ex = full[i];
    let changed = 0;
    const qs: ExamQuestions = {};
    for (const k of Object.keys(ex.questions || {})) {
      qs[k] = (ex.questions[k] || []).map((q) => {
        const b = q.kazanimCode ? byCode.get(key(q.kazanimCode)) : undefined;
        if (!b) return q;
        const konu = b.konu || q.konu;
        // Alt kazanım yalnızca bankadaki açıklama maddelerinden biriyse korunur
        const alt = q.alt && (b.alt || []).includes(q.alt) ? q.alt : undefined;
        if (q.konu === konu && q.kazanim === b.text && q.alt === alt) return q;
        changed++;
        return { ...q, konu: konu || undefined, kazanim: b.text, alt };
      });
    }
    if (changed) {
      await saveExam({ ...ex, questions: qs });
      exams++;
      questions += changed;
    }
    onProgress?.(i + 1, full.length);
  }
  return { exams, questions };
}

/** Verilen kodlardaki kazanımları bankadan siler */
export async function deleteKazanimlar(codes: string[]): Promise<void> {
  for (let i = 0; i < codes.length; i += 100) {
    const { error } = await supabase.from('deneme_kazanimlar').delete().in('code', codes.slice(i, i + 100));
    if (error) fail(error, 'Kazanımlar silinemedi.');
  }
}
