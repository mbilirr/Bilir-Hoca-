import React, { Suspense, useRef, useState } from 'react';
import { CalendarDays, ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import { PageHeader, Segmented } from '../ui/kit';
import { lazyNamed } from '../../lib/lazyLoad';
import { useQuickFocus, setQuickFocus } from '../../lib/quickFocus';
import { AttendanceRecord, ClassGroup, GradeRecord, Student } from '../../types';
import { DersProgramim } from './DersProgramim';

// ============================================================================
// Aşama 220: DERSLER SAYFASI (eski "Not & Yoklama").
//  * Program: öğretmenin haftalık ders programı; derse tıklayınca ders saati yoklaması (217 veritabanı).
//  * Notlar: önceki Not & Devamsızlık ekranı aynen (GradeAttendance), yalnız ihtiyaç olunca yüklenir.
// ============================================================================

const GradeAttendance = lazyNamed(() => import('./GradeAttendance'), 'GradeAttendance');

type Bolum = 'program' | 'notlar';
const STORE_KEY = 'edu_dersler_bolum_v1';

const ilkBolum = (): Bolum => {
  try {
    return window.sessionStorage.getItem(STORE_KEY) === 'notlar' ? 'notlar' : 'program';
  } catch {
    return 'program';
  }
};

export const DerslerSayfasi: React.FC<{
  students: Student[];
  classes: ClassGroup[];
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
}> = ({ students, classes, grades, attendance }) => {
  const [bolum, setBolumState] = useState<Bolum>(ilkBolum);
  const setBolum = (b: Bolum) => {
    setBolumState(b);
    try {
      window.sessionStorage.setItem(STORE_KEY, b);
    } catch {
      /* depolama kapalı */
    }
  };

  // Gelen seçim ilgili bölümü açar ve o bölüme yeniden iletilir (bölüm açılınca bekleyen seçimi kendisi alır).
  //  * 'teacher': Kurum Özeti'nden öğretmenin çalışmaları → Notlar
  //  * 'ders': ana sayfadaki "yoklama bekliyor" satırı → Program (o dersin yoklaması açılır)
  // Yeniden iletme olayı eşzamanlıdır; iletiyor bayrağı kendi dinleyicimizin döngüye girmesini önler.
  const iletiyor = useRef(false);
  useQuickFocus(['teacher', 'ders'], (f) => {
    if (iletiyor.current) return;
    setBolum(f.type === 'ders' ? 'program' : 'notlar');
    iletiyor.current = true;
    try {
      setQuickFocus(f.type, f.id, f.label);
    } finally {
      iletiyor.current = false;
    }
  });

  return (
    <div className="space-y-4" id="dersler-sayfasi">
      <PageHeader
        icon={ClipboardCheck}
        tone="success"
        title="Dersler"
        description="Ders programı, ders yoklaması ve notlar"
        actions={
          <Segmented
            size="sm"
            value={bolum}
            onChange={setBolum}
            items={[
              { value: 'program', label: 'Program', icon: CalendarDays, id: 'dersler-tab-program' },
              { value: 'notlar', label: 'Notlar', icon: FileSpreadsheet, id: 'dersler-tab-notlar' },
            ]}
          />
        }
      />
      {bolum === 'program' ? (
        <DersProgramim />
      ) : (
        <Suspense fallback={<p className="text-xs text-muted">Yükleniyor…</p>}>
          <GradeAttendance students={students} classes={classes} grades={grades} attendance={attendance} />
        </Suspense>
      )}
    </div>
  );
};
