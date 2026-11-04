import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { dataService } from '../services/dataService';
import type { Student } from '../types';

// ============================================================================
// Aşama 149: AÇILAN SINIFLARA GİRİŞ BİLGİSİ İZNİ (kurumlar.grant_cred, yalnız genel yönetici değiştirir)
// Açıkken kurumdaki öğrenci düzenleyicileri (kurum yöneticisi, Müdür/Yrd., Rehberlik, Ölçme, "Öğrenci düzenleme" izni)
// genel yöneticinin kuruma açtığı sınıfların öğrencilerine giriş bilgisi gönderir ve yeni ilk şifre verir.
// Sunucu (api/mail.js, create-user) aynı kuralı ayrıca uygular; buradaki yalnız düğmelerin görünmesi içindir.
// Aşama 158 (TAM SENKRON): değer kurum bilgisiyle (my_kurum_state, dakikada bir / yetki sinyalinde) gelir; genel
// yönetici anahtarı değiştirince ekran yeniden giriş beklemeden güncellenir ve ayrı sorgu gerekmez.
// Kurum bilgisi değeri henüz taşımıyorsa (158 SQL'i yok ya da ilk tam okuma) eski yol: my_grant_cred bir kez okunur.
// 149 SQL'i yoksa kapalı sayılır.
// ============================================================================

let cache: { kurumId: string | null; on: boolean } | null = null;
let pending: Promise<boolean> | null = null;

/** Aşama 158: kurum bilgisindeki güncel değer (bilinmiyorsa null) */
function liveGrantCred(): boolean | null {
  const v = dataService.getMyKurum().grantCred;
  return typeof v === 'boolean' ? v : null;
}

export function myGrantCredCached(): boolean {
  if (dataService.isHeadAdmin()) return false;
  const live = liveGrantCred();
  if (live !== null) return live;
  const k = dataService.getMyKurumId();
  return !!cache && cache.kurumId === k && cache.on;
}

export async function loadMyGrantCred(): Promise<boolean> {
  const kurumId = dataService.getMyKurumId();
  if (!kurumId || dataService.isHeadAdmin()) return false;
  const live = liveGrantCred();
  if (live !== null) return live;
  if (cache && cache.kurumId === kurumId) return cache.on;
  if (!pending) {
    pending = (async () => {
      let on = false;
      try {
        const { data, error } = await supabase.rpc('my_grant_cred');
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

/** Bileşenlerde: anahtar açık mı (ilk çizimde önbellekteki değer, sonra okunan) */
export function useMyGrantCred(): boolean {
  const [on, setOn] = useState(myGrantCredCached);
  useEffect(() => {
    let alive = true;
    void loadMyGrantCred().then(() => alive && setOn(myGrantCredCached()));
    // Aşama 158: kurum bilgisi yenilenince (anahtar açıldı / kapandı) düğmeler hemen güncellenir; değer aynıysa çizim olmaz
    const off = dataService.subscribe(() => {
      if (alive && liveGrantCred() !== null) setOn(liveGrantCred() === true);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return on;
}

/** Bu öğrenciye giriş bilgisi gönderilebilir / yeni ilk şifre verilebilir mi (ekran kuralı; sunucu ayrıca denetler) */
export function canSendCredentials(s: Student | null | undefined, grantOn: boolean): boolean {
  if (!s) return false;
  if (dataService.canManageStudent(s)) return true;
  if (!grantOn || !s.classId) return false;
  const k = dataService.getMyKurum();
  return (k.grantedClassIds || []).includes(s.classId) && dataService.canEditStudents();
}

// --- Genel yönetici: Yönetim > Kurum > Bölümler ve sınıflar ---

/** Tüm kurumların anahtar değerleri; 149 SQL'i yoksa null */
export async function loadKurumGrantCred(): Promise<Record<string, boolean> | null> {
  const { data, error } = await supabase.from('kurumlar').select('id,grant_cred');
  if (error) return null;
  const out: Record<string, boolean> = {};
  for (const r of (data || []) as any[]) out[String(r.id)] = r.grant_cred === true;
  return out;
}

export async function setKurumGrantCred(kurumId: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('kurum_set_grant_cred', { p_kurum_id: kurumId, p_on: on });
  if (error) {
    if (/kurum_set_grant_cred|PGRST202|schema cache/i.test(`${error.code || ''} ${error.message || ''}`)) {
      throw new Error('Açılan sınıflar izni için 149 numaralı SQL dosyasını Supabase\'de çalıştırın.');
    }
    throw new Error(error.message);
  }
  return data === true;
}
