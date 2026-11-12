import type { ClassGroup, Homework, HomeworkSubmission, Student } from '../types';
import { dataService } from '../services/dataService';

// ============================================================================
// Aşama 246: ÖDEV TESLİM HESABI — tek yer.
// Kurum raporu (Ödevler bölümü) ve müdür ana sayfası (Haftanın nabzı) aynı hesabı kullanır:
// teslim tarihi aralıkta olan ödevlerde beklenen öğrenci sayısı ve zamanında / geç teslim edenler.
// ============================================================================

export interface OdevTeslimGrup {
  ad: string;
  odev: number;
  exp: number;
  done: number;
}

/**
 * by = 'sinif' | 'ogretmen': satırlar sınıfa ya da öğretmene göre toplanır.
 * by = 'gun': satırlar teslim gününe (YYYY-AA-GG) göre toplanır (ad = gün).
 */
export function odevTeslimGruplari(
  homeworks: Homework[],
  submissions: HomeworkSubmission[],
  students: Student[],
  classes: ClassGroup[],
  bas: string,
  bit: string,
  by: 'sinif' | 'ogretmen' | 'gun',
): Map<string, OdevTeslimGrup> {
  const classOf = new Map<string, string>();
  const size = new Map<string, number>();
  for (const s of students) {
    classOf.set(s.id, s.classId);
    size.set(s.classId, (size.get(s.classId) || 0) + 1);
  }
  const done = new Map<string, number>();
  for (const s of submissions) {
    if (s.status !== 'on_time' && s.status !== 'late') continue;
    const k = `${s.homeworkId}|${classOf.get(s.studentId) || ''}`;
    done.set(k, (done.get(k) || 0) + 1);
  }
  const grp = new Map<string, OdevTeslimGrup>();
  const cName = new Map(classes.map((c) => [c.id, c.name] as const));
  for (const h of homeworks) {
    const d = (h.dueDate || '').slice(0, 10);
    if (!d || d < bas || d > bit) continue;
    const expBy = new Map<string, number>();
    if (Array.isArray(h.assignedTo)) {
      for (const sid of h.assignedTo) {
        const c = classOf.get(sid);
        if (c) expBy.set(c, (expBy.get(c) || 0) + 1);
      }
    } else {
      const ids = h.targetClassIds && h.targetClassIds.length ? h.targetClassIds : h.classId ? [h.classId] : [];
      for (const c of new Set(ids)) if (size.get(c)) expBy.set(c, size.get(c)!);
    }
    if (!expBy.size) continue;
    const o = by === 'ogretmen' ? dataService.homeworkOwner(h) : null;
    expBy.forEach((exp, c) => {
      const key = by === 'sinif' ? c : by === 'ogretmen' ? o!.id : d;
      const ad = by === 'sinif' ? cName.get(c) || '' : by === 'ogretmen' ? o!.name : d;
      if (!ad) return;
      const g = grp.get(key) || { ad, odev: 0, exp: 0, done: 0 };
      g.odev++;
      g.exp += exp;
      g.done += Math.min(exp, done.get(`${h.id}|${c}`) || 0);
      grp.set(key, g);
    });
  }
  return grp;
}
