import React, { Suspense, useRef, useState } from 'react';
import { CalendarDays, ClipboardCheck, FileSpreadsheet, LayoutGrid } from 'lucide-react';
import { PageHeader, Segmented } from '../ui/kit';
import { lazyNamed } from '../../lib/lazyLoad';
import { useQuickFocus, setQuickFocus } from '../../lib/quickFocus';
import { AttendanceRecord, ClassGroup, GradeRecord, Student } from '../../types';
import { DersProgramim } from './DersProgramim';
import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 220: DERSLER SAYFASI (eski "Not & Yoklama").
//  * Program: öğretmenin haftalık ders programı; derse tıklayınca ders saati yoklaması (217 veritabanı).
//  * Notlar: önceki Not & Devamsızlık ekranı aynen (GradeAttendance), yalnız ihtiyaç olunca yüklenir.
// Aşama 234: sayfa ders programında dersi olan öğretmene not izninden bağımsız açılır; "Notlar" yalnız not izni
// olana görünür (izni olmayan yalnız Program'ı görür).
// Aşama 240: idare (Kurum Özeti'ni gören) için ilk bölüm "Okul geneli"; kendi programı "Programım".
// ============================================================================

const GradeAttendance = lazyNamed(() => import('./GradeAttendance'), 'GradeAttendance');
// Aşama 240: idare için "Okul geneli" (yoklama haritası, geciken yoklamalar, izinler) — yalnız açılınca yüklenir
const DersOkulGeneli = lazyNamed(() => import('./DersOkulGeneli'), 'DersOkulGeneli');

type Bolum = 'okul' | 'program' | 'notlar';
const STORE_KEY = 'edu_dersler_bolum_v1';

const ilkBolum = (idare: boolean): Bolum => {
  try {
    const v = window.sessionStorage.getItem(STORE_KEY);
    if (v === 'notlar' || v === 'program' || (v === 'okul' && idare)) return v;
  } catch {
    /* depolama kapalı */
  }
  return idare ? 'okul' : 'program';
};

export const DerslerSayfasi: React.FC<{
  students: Student[];
  classes: ClassGroup[];
  grades: GradeRecord[];
  attendance: AttendanceRecord[];
}> = ({ students, classes, grades, attendance }) => {
  const notlarAcik = dataService.canUseNotlar();
  const idare = dataService.showsKurumOzeti(); // Aşama 240
  const [bolumSecili, setBolumState] = useState<Bolum>(() => ilkBolum(idare));
  const bolum: Bolum = (bolumSecili === 'notlar' && !notlarAcik) || (bolumSecili === 'okul' && !idare) ? 'program' : bolumSecili;
  const bolumler = [
    ...(idare ? [{ value: 'okul' as Bolum, label: 'Okul geneli', icon: LayoutGrid, id: 'dersler-tab-okul' }] : []),
    { value: 'program' as Bolum, label: idare ? 'Programım' : 'Program', icon: CalendarDays, id: 'dersler-tab-program' },
    ...(notlarAcik ? [{ value: 'notlar' as Bolum, label: 'Notlar', icon: FileSpreadsheet, id: 'dersler-tab-notlar' }] : []),
  ];
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
    setBolum(f.type === 'ders' || !notlarAcik ? 'program' : 'notlar');
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
        description={
          idare
            ? 'Okulun ders yoklaması, kendi programınız' + (notlarAcik ? ' ve notlar' : '')
            : notlarAcik
              ? 'Ders programı, ders yoklaması ve notlar'
              : 'Ders programı ve ders yoklaması'
        }
        actions={bolumler.length > 1 && <Segmented size="sm" value={bolum} onChange={setBolum} items={bolumler} />}
      />
      {bolum === 'okul' ? (
        <Suspense fallback={<p className="text-xs text-muted">Yükleniyor…</p>}>
          <DersOkulGeneli students={students} classes={classes} />
        </Suspense>
      ) : bolum === 'program' ? (
        <DersProgramim />
      ) : (
        <Suspense fallback={<p className="text-xs text-muted">Yükleniyor…</p>}>
          <GradeAttendance students={students} classes={classes} grades={grades} attendance={attendance} />
        </Suspense>
      )}
    </div>
  );
};
