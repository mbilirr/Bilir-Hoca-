// Etüt durumu ve renkleri (Aşama 28)
// Takvim, liste ve açılan pencerede AYNI renkler kullanılsın diye tek yerde tutulur.
//   upcoming = Yaklaşan (henüz başlamadı)
//   live     = Devam ediyor (başladı, bitmedi)
//   done     = Yapıldı (bitti ve yoklaması alındı)
//   past     = Geçmiş (bitti, yoklama alınmadı / yoklama beklenmiyor)
import type { Etut } from '../types';
import { isEtutEnded, hasEtutAttendance } from './etutTiming';

export type EtutStatus = 'upcoming' | 'live' | 'done' | 'past';

// Etüdün başlangıç anı. Saat girilmemişse null (başladı/başlamadı bilinemez).
function etutStart(etut: Pick<Etut, 'date' | 'time'>): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(etut.date || '').trim());
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(etut.time || ''));
  if (!dm || !tm) return null;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0);
}

export function getEtutStatus(etut: Etut, now: Date = new Date()): EtutStatus {
  if (!isEtutEnded(etut, now)) {
    const start = etutStart(etut);
    return start && start.getTime() <= now.getTime() ? 'live' : 'upcoming';
  }
  return hasEtutAttendance(etut) ? 'done' : 'past';
}

export interface EtutStatusStyle {
  label: string;
  hint: string;
  /** Kart arka planı + çerçevesi */
  card: string;
  /** Sol kenar vurgusu (border-l-4 ile birlikte kullanılır) */
  accent: string;
  /** Küçük durum rozeti */
  chip: string;
  /** Renkli nokta (açıklama satırı için) */
  dot: string;
}

export const ETUT_STATUS_STYLE: Record<EtutStatus, EtutStatusStyle> = {
  upcoming: {
    label: 'Yaklaşan',
    hint: 'Henüz başlamadı',
    card: 'bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/30',
    accent: 'border-l-sky-500',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
    dot: 'bg-sky-500',
  },
  live: {
    label: 'Devam ediyor',
    hint: 'Şu an sürüyor',
    card: 'bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/40',
    accent: 'border-l-amber-500',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  done: {
    label: 'Yapıldı',
    hint: 'Bitti, yoklaması alındı',
    card: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    accent: 'border-l-emerald-500',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  past: {
    label: 'Geçmiş',
    hint: 'Bitti, yoklama alınmadı',
    card: 'bg-slate-100 border-slate-300 dark:bg-slate-500/10 dark:border-slate-500/30',
    accent: 'border-l-slate-400',
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
};

export const ETUT_STATUS_ORDER: EtutStatus[] = ['upcoming', 'live', 'done', 'past'];

// Ders adına göre küçük renkli nokta (kartı ders rengine boyamadan dersi ayırt etmek için)
const SUBJECT_DOTS = [
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-fuchsia-500',
  'bg-lime-600',
  'bg-rose-500',
  'bg-teal-500',
  'bg-violet-500',
  'bg-yellow-500',
  'bg-pink-500',
];
export function subjectDot(subject?: string): string {
  const s = String(subject || '').trim().toLocaleLowerCase('tr-TR');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SUBJECT_DOTS[h % SUBJECT_DOTS.length];
}

// Etüdü veren öğretmen ad(lar)ı (çoklu öğretmen desteği). Atanmamışsa boş liste.
export function etutTeacherNames(etut: Pick<Etut, 'teacherName' | 'teacherNames'>): string[] {
  const list = Array.isArray(etut.teacherNames) && etut.teacherNames.length ? etut.teacherNames : etut.teacherName ? [etut.teacherName] : [];
  return list.map((n) => String(n || '').trim()).filter(Boolean);
}
export const NO_TEACHER_LABEL = 'Öğretmen atanmadı';
