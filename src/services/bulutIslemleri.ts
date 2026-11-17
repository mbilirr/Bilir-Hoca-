// ============================================================================
// Aşama 319: VERİ SERVİSİNİ AYIRMA, 10. PARÇA — BULUT OKUMA / SİLME YARDIMCILARI
// Uygulamanın o anki durumuna bakmayan veritabanı işleri: doğrulamalı silme, sayfa sayfa okuma, oturum denetimi,
// giriş hesabı silme, ilk şifre işareti, etüt yorumu yazma.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi, "this." / "DataService."
// çağrıları doğrudan çağrı oldu); davranış aynı.
// ============================================================================
import { supabase, invokeCreateUserEdgeFunction } from '../lib/supabase';
import type { Etut } from '../types';

// Aşama 179: etüt yazımında hangi yorum alanlarının yazılacağı (dataService de bunu kullanır)
export type EtutCommentKey = 'teacherFeedback' | 'notes' | 'attendanceTakenBy';

// RLS bir silmeyi engellerse Supabase hata DÖNDÜRMEZ, sadece 0 satır siler.
// Bu yüzden silmeden sonra kayıtların gerçekten gittiği doğrulanır.
export async function deleteRowsVerified(table: string, ids: string[]): Promise<{ error: any }> {
  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return { error: null };
  const { error } = await supabase.from(table).delete().in('id', cleanIds);
  if (error) return { error };
  const { data: remaining, error: checkError } = await supabase.from(table).select('id').in('id', cleanIds);
  if (checkError) return { error: null }; // doğrulama yapılamadı; silme hatasız tamamlandı
  if (remaining && remaining.length > 0) {
    return { error: { code: '42501', message: 'Kayıt silinemedi, bu işlem için yetkiniz yok' } };
  }
  return { error: null };
}

// Supabase bir istekte en fazla 1000 satır döndürür. Büyük tablolar sayfa sayfa (aynı anda 4 sayfa) okunur;
// yoksa 1000. satırdan sonrası sessizce eksik kalır.
export async function fetchAllRows(
  table: string,
  build?: (q: any) => any,
  opts: { columns?: string; order?: string; ascending?: boolean; max?: number } = {}
): Promise<{ data: any[] | null; error: any }> {
  const PAGE = 1000;
  const max = opts.max ?? 100000;
  const page = (from: number) => {
    let q: any = supabase.from(table).select(opts.columns || '*');
    if (build) q = build(q);
    if (opts.order && opts.order !== 'id') q = q.order(opts.order, { ascending: opts.ascending ?? true });
    return q.order('id', { ascending: true }).range(from, from + PAGE - 1);
  };
  const first = await page(0);
  if (first.error) return { data: null, error: first.error };
  const out: any[] = [...(first.data || [])];
  if (out.length < PAGE) return { data: out, error: null };
  let from = PAGE;
  while (from < max) {
    const batch = await Promise.all([0, 1, 2, 3].map((i) => page(from + i * PAGE)));
    let done = false;
    for (const r of batch) {
      if (r.error) return { data: null, error: r.error };
      out.push(...(r.data || []));
      if (!r.data || r.data.length < PAGE) done = true;
    }
    if (done) break;
    from += 4 * PAGE;
  }
  // sayfalar arasında eklenen satır yüzünden aynı kayıt iki kez gelebilir
  const seen = new Set<string>();
  return { data: out.filter((r) => (r && r.id ? (seen.has(r.id) ? false : (seen.add(r.id), true)) : true)), error: null };
}

// Supabase Auth oturumu (JWT) gerçekten var mı? Yoksa istekler 'anon' rolüyle gider.
export async function hasCloudSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  } catch {
    return false;
  }
}

// Kayıtlar silinmeden ÖNCE giriş hesaplarını siler. Sonuç kayıt bazında döner.
export async function deleteLoginAccounts(
  type: 'teacher' | 'student',
  ids: string[]
): Promise<{ okIds: string[]; failed: Array<{ id: string; error?: string }> }> {
  if (ids.length === 0) return { okIds: [], failed: [] };
  const okIds: string[] = [];
  const failed: Array<{ id: string; error?: string }> = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const res = await invokeCreateUserEdgeFunction({ action: 'delete_accounts', type, ids: chunk });
    const results = res?.results || [];
    for (const id of chunk) {
      const r = results.find((x) => x.id === id);
      if (r && r.ok === false) failed.push({ id, error: r.error });
      else okIds.push(id);
    }
  }
  return { okIds, failed };
}

// Aşama 25: Kullanıcı kendi şifresini belirleyince yöneticinin listesindeki ilk şifre silinir
export async function markMyInitialPasswordChanged(): Promise<void> {
  try {
    await supabase.rpc('mark_my_initial_password_changed');
  } catch {
    /* 09c numaralı SQL çalıştırılmadıysa önemli değil */
  }
}

/** Yalnız yorum sütunları yazılır (etüt tanımına ve yoklamaya dokunulmaz) */
export async function writeEtutComments(etut: Etut, keys: EtutCommentKey[]): Promise<'ok' | 'fail'> {
  const cols: Record<string, any> = {};
  if (keys.includes('teacherFeedback')) cols.teacher_feedback = etut.teacherFeedback || '';
  if (keys.includes('notes')) cols.user_notes = etut.notes || '';
  if (keys.includes('attendanceTakenBy')) cols.attendance_taken_by = etut.attendanceTakenBy || null;
  if (!Object.keys(cols).length) return 'ok';
  const { data, error } = await supabase.from('etuts').update(cols).eq('id', etut.id).select('id');
  if (error) {
    // Aşama 196: sütun yoksa eski yola (notes) düşülmez
    console.warn('[EtutSync] Etüt yorumu buluta yazılamadı:', error.message);
    return 'fail';
  }
  // satır dönmediyse yetki yok ya da etüt silinmiş: kaydedildi sayılmaz
  return Array.isArray(data) && data.length > 0 ? 'ok' : 'fail';
}
