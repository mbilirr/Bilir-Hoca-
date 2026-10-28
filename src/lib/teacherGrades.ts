import { supabase } from './supabase';
import type { ClassGroup } from '../types';

// ============================================================================
// Aşama 102: ÖĞRETMEN KADEME GÖRÜNÜRLÜĞÜ
// Öğretmene "Görebileceği kademeler" verilir; kademedeki bütün sınıflar (sonradan açılanlar dahil)
// veritabanında teacher_class_access'e "kademeden" (via_grade) yazılır — sql/102_ogretmen_kademe.sql
// ============================================================================

export interface TeacherGrades {
  grades: number[];
  all: boolean;
}

export const EMPTY_GRADES: TeacherGrades = { grades: [], all: false };

const missingMsg = 'Kademe tablosu bulunamadı. Supabase SQL Editor\'de sql/102_ogretmen_kademe.sql dosyasını çalıştırın.';
export const isGradesMissing = (e: { message?: string; code?: string } | null) =>
  !!e && (/teacher_grade_access|set_teacher_grades|via_grade|schema cache|does not exist/i.test(e.message || '') || e.code === '42P01' || e.code === '42703' || e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === 'PGRST204');

/** Sınıfın düzeyi (5, 8, 9 ...); "5. Sınıf" yazısından ya da sınıf adından okunur */
export function gradeOf(cls: Pick<ClassGroup, 'gradeLevel' | 'name'>): number | null {
  const m = /\d+/.exec(cls.gradeLevel || '') || /\d+/.exec(cls.name || '');
  const n = m ? parseInt(m[0], 10) : NaN;
  return n >= 1 && n <= 12 ? n : null;
}

/** Kurumda kayıtlı sınıflardan kademe seçenekleri (sıralı, tekrarsız) */
export function gradeOptionsFrom(classes: ClassGroup[]): number[] {
  const set = new Set<number>();
  for (const c of classes) {
    const g = gradeOf(c);
    if (g !== null) set.add(g);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/** Seçili kademelerin kapsadığı sınıf kimlikleri */
export function classesCoveredBy(classes: ClassGroup[], sel: TeacherGrades): Set<string> {
  const out = new Set<string>();
  if (!sel.all && sel.grades.length === 0) return out;
  const want = new Set(sel.grades);
  for (const c of classes) {
    if (sel.all) out.add(c.id);
    else {
      const g = gradeOf(c);
      if (g !== null && want.has(g)) out.add(c.id);
    }
  }
  return out;
}

export const gradesLabel = (sel: TeacherGrades) =>
  sel.all ? 'Tüm kademeler' : sel.grades.length ? sel.grades.map((g) => `${g}. Sınıf`).join(', ') : 'Kademe verilmedi';

/** Öğretmenin kademeleri (SQL 102 kurulmamışsa boş döner, pencere yine açılır) */
export async function fetchTeacherGrades(teacherAuthId: string): Promise<TeacherGrades & { missing?: boolean }> {
  const { data, error } = await supabase
    .from('teacher_grade_access')
    .select('grades,all_grades')
    .eq('teacher_auth_id', teacherAuthId)
    .maybeSingle();
  if (error) {
    if (isGradesMissing(error)) return { ...EMPTY_GRADES, missing: true };
    throw new Error(error.message);
  }
  if (!data) return { ...EMPTY_GRADES };
  return { grades: ((data as any).grades || []).map(Number), all: (data as any).all_grades === true };
}

export async function saveTeacherGrades(teacherAuthId: string, sel: TeacherGrades): Promise<TeacherGrades & { classes: number }> {
  const { data, error } = await supabase.rpc('set_teacher_grades', { p_teacher_auth_id: teacherAuthId, p_grades: sel.grades, p_all: sel.all });
  if (error) throw new Error(isGradesMissing(error) ? missingMsg : error.message);
  const d = (data || {}) as { grades?: number[]; all?: boolean; classes?: number };
  return { grades: Array.isArray(d.grades) ? d.grades : sel.grades, all: d.all === true, classes: Number(d.classes) || 0 };
}
