// Etüt zamanı ve yoklama yardımcıları (Aşama 24)
// Etüdün bitip bitmediği, yoklamasının alınıp alınmadığı ve yoklama beklenip beklenmediği burada hesaplanır.
import type { Etut } from '../types';

type TimingEtut = Pick<Etut, 'date' | 'time' | 'duration'>;

// Etüdün bitiş anı (cihazın saatine göre). Saat girilmemişse etüt günün sonunda bitmiş sayılır.
export function etutEndTime(etut: TimingEtut): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(etut.date || '').trim());
  if (!dm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]) - 1;
  const d = Number(dm[3]);
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(etut.time || ''));
  if (!tm) return new Date(y, mo, d, 23, 59, 59);
  const start = new Date(y, mo, d, Number(tm[1]), Number(tm[2]), 0);
  return new Date(start.getTime() + (Number(etut.duration) || 45) * 60000);
}

// Etüt saati geçti mi (bitti mi)?
export function isEtutEnded(etut: TimingEtut, now: Date = new Date()): boolean {
  const end = etutEndTime(etut);
  return !!end && end.getTime() <= now.getTime();
}

// En az bir öğrenci için yoklama kaydı var mı?
export function hasEtutAttendance(etut: Pick<Etut, 'studentAttendance'>): boolean {
  return !!etut.studentAttendance && Object.keys(etut.studentAttendance).length > 0;
}

// Yoklama beklenen etüt mü? (öğrencisi olmayan etütte yoklama alınamaz)
export function etutExpectsAttendance(etut: Pick<Etut, 'assignedStudentIds'>): boolean {
  const a = etut.assignedStudentIds;
  return a === 'all' || (Array.isArray(a) && a.length > 0);
}

// Bitmiş, yoklaması beklenen ve alınmamış etüt mü?
export function isEtutAttendanceMissing(etut: Etut, now: Date = new Date()): boolean {
  return isEtutEnded(etut, now) && etutExpectsAttendance(etut) && !hasEtutAttendance(etut);
}
