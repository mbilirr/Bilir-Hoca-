import { supabase } from './supabase';

// ============================================================================
// Aşama 144: ÖĞRETMEN TELEFONU VE DOĞUM TARİHİ (korumalı tablo teacher_contacts, sql/144)
// Yalnızca öğretmenin kendisi ve kendi kurumunun yöneticisi okur; yazma set_teacher_contact işleviyle.
// SQL kurulmamışsa okuma boş döner, ekranlar eskisi gibi çalışır.
// ============================================================================

export interface TeacherContact {
  phone: string;
  /** YYYY-AA-GG ya da boş */
  birthDate: string;
}

const missingMsg = "Öğretmen iletişim tablosu bulunamadı. Supabase SQL Editor'de sql/144_ogretmen_iletisim.sql dosyasını çalıştırın.";
export const isContactsMissing = (e: { message?: string; code?: string } | null) =>
  !!e && (/teacher_contacts|set_teacher_contact|schema cache|does not exist/i.test(e.message || '') || ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code || ''));

// Kısa süreli bellek: aynı sekme açılışında tekrar tekrar okunmaz
let cache: { at: number; map: Map<string, TeacherContact> } | null = null;
const CACHE_MS = 60_000;

/** Kurumdaki öğretmenlerin iletişim bilgileri (öğretmen kimliği → bilgi); tek sorgu */
export async function fetchTeacherContacts(force = false): Promise<Map<string, TeacherContact>> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const { data, error } = await supabase.from('teacher_contacts').select('teacher_id,phone,birth_date');
  if (error) {
    if (isContactsMissing(error)) return new Map();
    throw new Error(error.message);
  }
  const map = new Map<string, TeacherContact>();
  for (const r of (data || []) as Array<{ teacher_id: string; phone: string | null; birth_date: string | null }>) {
    map.set(r.teacher_id, { phone: r.phone || '', birthDate: r.birth_date || '' });
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function saveTeacherContact(teacherId: string, c: TeacherContact): Promise<void> {
  const { error } = await supabase.rpc('set_teacher_contact', {
    p_teacher_id: teacherId,
    p_phone: c.phone || null,
    p_birth_date: c.birthDate || null,
  });
  if (error) throw new Error(isContactsMissing(error) ? missingMsg : error.message);
  if (cache) {
    const next = new Map(cache.map);
    if (c.phone || c.birthDate) next.set(teacherId, { phone: c.phone || '', birthDate: c.birthDate || '' });
    else next.delete(teacherId);
    cache = { at: cache.at, map: next };
  }
}

export const clearTeacherContactsCache = () => {
  cache = null;
};
