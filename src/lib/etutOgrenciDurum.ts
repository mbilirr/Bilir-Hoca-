// Aşama 214: öğrencinin bir etütteki yoklama durumu (ana sayfa ve Etütlerim kartlarında AYNI etiket ve renk)
import type { Etut } from '../types';
import { isEtutEnded } from './etutTiming';

export interface OgrenciEtutDurum {
  label: string;
  cls: string;
}

const DURUM: Record<string, OgrenciEtutDurum> = {
  present: { label: 'Geldi', cls: 'bg-success-soft text-success-fg' },
  absent: { label: 'Gelmedi', cls: 'bg-danger-soft text-danger-fg' },
  late: { label: 'Geç kaldı', cls: 'bg-warning-soft text-warning-fg' },
  excused: { label: 'İzinli', cls: 'bg-info-soft text-info-fg' },
};

/** Yoklama alınmışsa durum; etüt bittiyse ve yoklama yoksa "Yoklama bekleniyor"; başlamadıysa null */
export function ogrenciEtutDurum(e: Etut, studentId: string, now: Date = new Date()): OgrenciEtutDurum | null {
  const rec = e.studentAttendance?.[studentId];
  if (rec && DURUM[rec.status]) return DURUM[rec.status];
  if (isEtutEnded(e, now)) return { label: 'Yoklama bekleniyor', cls: 'bg-surface-3 text-muted' };
  return null;
}
