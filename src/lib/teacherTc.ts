import { supabase } from './supabase';
import { hashTcs, validTc } from './tcApi';

// ============================================================================
// Aşama 254: ÖĞRETMEN TC — yalnız geri çevrilemez parmak izi (teacher_tc, sql/254).
// TC numarası tarayıcıda yalnız geçici olarak durur; kaydedilmez, gösterilmez.
// ============================================================================

const missingMsg = "Öğretmen TC tablosu bulunamadı. Supabase SQL Editor'de sql/254_ogretmen_tc.sql dosyasını çalıştırın.";
const isMissing = (e: { message?: string; code?: string } | null) =>
  !!e && (/teacher_tc|set_teacher_tc|schema cache|does not exist/i.test(e.message || '') || ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code || ''));

/** TC'nin parmak izi; geçersizse ya da servis hata verirse açıklamalı hata fırlatır. */
export async function teacherTcHash(tc: string): Promise<string> {
  const digits = validTc(tc);
  if (!digits) throw new Error('TC kimlik numarası geçersiz (11 hane, kontrol haneleri tutmalı).');
  const r = await hashTcs([digits]);
  if (!r.ok) throw new Error(r.error);
  const h = r.hashes[0];
  if (!h) throw new Error('TC kimlik numarası geçersiz.');
  return h;
}

/** Kurumda bu parmak iziyle kayıtlı öğretmen var mı? */
export async function teacherTcExists(hash: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('teacher_tc_var', { p_hash: hash });
  if (error) throw new Error(isMissing(error) ? missingMsg : error.message);
  return data === true;
}

export async function saveTeacherTc(teacherId: string, hash: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_teacher_tc', { p_teacher_id: teacherId, p_hash: hash });
  if (error) throw new Error(isMissing(error) ? missingMsg : error.message);
}
