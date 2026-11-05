import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { dataService } from '../services/dataService';
import type { Student } from '../types';

// ============================================================================
// Aşama 161: AÇILAN SINIFLARDA SINIF DEĞİŞTİRME İZNİ (kurumlar.grant_move, yalnız genel yönetici değiştirir)
// Açıkken kurumdaki öğrenci düzenleyicileri (kurum yöneticisi, Müdür/Yrd., Rehberlik, Ölçme, "Öğrenci düzenleme"
// izni) genel yöneticinin kuruma açtığı sınıflardaki genel yönetici öğrencilerini yine açılan sınıflar arasında taşır.
// Sunucu (kurum_move_granted_student) aynı kuralı ayrıca uygular; buradaki yalnız sınıf kutusunun açılması içindir.
// TAM SENKRON: değer kurum bilgisiyle (my_kurum_state, dakikada bir / yetki sinyalinde) gelir; ilk açılışta henüz
// yoksa my_grant_move bir kez okunur. 161 SQL'i yoksa kapalı sayılır.
// ============================================================================

let cache: { kurumId: string | null; on: boolean } | null = null;
let pending: Promise<boolean> | null = null;

function liveGrantMove(): boolean | null {
  const v = dataService.getMyKurum().grantMove;
  return typeof v === 'boolean' ? v : null;
}

export function myGrantMoveCached(): boolean {
  if (dataService.isHeadAdmin()) return false;
  const live = liveGrantMove();
  if (live !== null) return live;
  const k = dataService.getMyKurumId();
  return !!cache && cache.kurumId === k && cache.on;
}

async function loadMyGrantMove(): Promise<boolean> {
  const kurumId = dataService.getMyKurumId();
  if (!kurumId || dataService.isHeadAdmin()) return false;
  const live = liveGrantMove();
  if (live !== null) return live;
  if (cache && cache.kurumId === kurumId) return cache.on;
  if (!pending) {
    pending = (async () => {
      let on = false;
      try {
        const { data, error } = await supabase.rpc('my_grant_move');
        on = !error && data === true;
      } catch {
        on = false;
      }
      cache = { kurumId, on };
      pending = null;
      return on;
    })();
  }
  return pending;
}

/** Bileşenlerde: anahtar açık mı. Açılan sınıf yoksa ya da kişi öğrenci düzenleyemiyorsa hiç sorgu yapılmaz. */
export function useMyGrantMove(): boolean {
  const [on, setOn] = useState(myGrantMoveCached);
  useEffect(() => {
    let alive = true;
    let asked = false;
    const tryLoad = () => {
      if (asked || liveGrantMove() !== null) return;
      if (!(dataService.getMyKurum().grantedClassIds || []).length || !dataService.canEditStudents()) return;
      asked = true;
      void loadMyGrantMove().then(() => alive && setOn(myGrantMoveCached()));
    };
    tryLoad();
    const off = dataService.subscribe(() => {
      if (!alive) return;
      if (liveGrantMove() !== null) setOn(liveGrantMove() === true);
      else tryLoad(); // kurum bilgisi sonradan geldiyse bir kez okunur
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return on;
}

/** Açılan sınıftaki genel yönetici öğrencisinin sınıfı bu kişi tarafından değiştirilebilir mi (ekran kuralı) */
export function canMoveGrantedStudent(s: Student | null | undefined, moveOn: boolean): boolean {
  if (!moveOn || !s || !s.classId || s.kurumId) return false;
  if (dataService.isHeadAdmin() || dataService.canManageStudent(s)) return false;
  return (dataService.getMyKurum().grantedClassIds || []).includes(s.classId) && dataService.canEditStudents();
}

// --- Genel yönetici: Yönetim > Kurum > Bölümler ve sınıflar ---

/** Tüm kurumların anahtar değerleri; 161 SQL'i yoksa null */
export async function loadKurumGrantMove(): Promise<Record<string, boolean> | null> {
  const { data, error } = await supabase.from('kurumlar').select('id,grant_move');
  if (error) return null;
  const out: Record<string, boolean> = {};
  for (const r of (data || []) as any[]) out[String(r.id)] = r.grant_move === true;
  return out;
}

export async function setKurumGrantMove(kurumId: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('kurum_set_grant_move', { p_kurum_id: kurumId, p_on: on });
  if (error) {
    if (/kurum_set_grant_move|PGRST202|schema cache/i.test(`${error.code || ''} ${error.message || ''}`)) {
      throw new Error('Sınıf değiştirme izni için 161 numaralı SQL dosyasını Supabase\'de çalıştırın.');
    }
    throw new Error(error.message);
  }
  return data === true;
}
