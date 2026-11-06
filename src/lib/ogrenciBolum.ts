import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// ============================================================================
// Aşama 165: ÖĞRENCİ BÖLÜM İZİNLERİ
// Kurum varsayılanı ('k:<kurum>', genel yönetici alanı 'k:-') + sınıfa özel ayar ('c:<sınıf>').
// Sınıf ayarı > alan varsayılanı > açık. Asıl denetim veritabanında (165 SQL tetikleri); burası ekrandaki birebir karşılığı.
//  - Öğretmen / yönetici: ogrenci_bolum_durum() satırlarını alır, seçicilerde kapalı sınıf/öğrenci seçilemez.
//  - Öğrenci: student_my_sections() geçerli bölümleri (kurum bölümü kapalıysa kapalı) alır.
// Okuma tam eşitlemede ve dakikalık hafif yoklamada bir küçük istek; değişmezse ekran yenilenmez.
// ============================================================================

export type OgrBolum = 'homework' | 'etut' | 'questions' | 'plan' | 'grades' | 'messages' | 'deneme';
export type OgrBolumAyar = Partial<Record<OgrBolum, boolean>>;

export const OGR_BOLUMLER: Array<{ key: OgrBolum; title: string; hint: string; kurumModule?: string }> = [
  { key: 'homework', title: 'Ödevler', hint: 'Ödevlerim; kapalıysa ödev verilemez', kurumModule: 'homework' },
  { key: 'etut', title: 'Etütler', hint: 'Etütlerim; kapalıysa etüte eklenemez', kurumModule: 'etut' },
  { key: 'questions', title: 'Soru Takibi', hint: 'Soru Sayısı ve soru hedefi; kapalıysa hedef verilemez', kurumModule: 'questions' },
  { key: 'plan', title: 'Haftalık Plan', hint: 'Ana sayfadaki plan görevleri; kapalıysa görev eklenemez' },
  { key: 'grades', title: 'Not-Devamsızlık', hint: 'Yalnız öğrenciden gizlenir; öğretmen girmeye devam eder', kurumModule: 'grades' },
  { key: 'messages', title: 'Soru Sor', hint: 'Öğretmene Soru Sor; kapalıysa öğrenci soru gönderemez', kurumModule: 'messages' },
  { key: 'deneme', title: 'Deneme', hint: 'Deneme Sonuçlarım; yalnız öğrenciden gizlenir', kurumModule: 'deneme' },
];

/** Seçicilerde kapalı sınıf / öğrenci yanında görünen kısa etiket */
export const OGR_KAPALI_ETIKET = 'öğrenciye kapalı';

const CACHE_KEY = 'edu_ogr_bolum_v1';
const SETUP_MSG = "Öğrenci bölümleri için Supabase SQL Editor'de 165_ogrenci_bolum_izinleri.sql dosyasını çalıştırın.";

let rows: Record<string, OgrBolumAyar> = {};
let mine: OgrBolumAyar | null = null;
let cacheUser = '';
let version = 0;
let rpcMissing = false;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function cleanAyar(v: any): OgrBolumAyar {
  const out: OgrBolumAyar = {};
  if (!v || typeof v !== 'object') return out;
  for (const b of OGR_BOLUMLER) if (typeof v[b.key] === 'boolean') out[b.key] = v[b.key];
  return out;
}

function persist() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ u: cacheUser, rows, mine }));
  } catch {}
}

/** Oturum açılınca bir kez: önceki okumayı (aynı kullanıcıysa) yükler, ilk çizimde düğmeler gidip gelmez */
export function loadOgrBolumCache(userId: string) {
  if (cacheUser === userId) return;
  cacheUser = userId;
  rows = {};
  mine = null;
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.u === userId) {
      if (c.rows && typeof c.rows === 'object') for (const k of Object.keys(c.rows)) rows[k] = cleanAyar(c.rows[k]);
      mine = c.mine ? cleanAyar(c.mine) : null;
    }
  } catch {}
  emit();
}

export function resetOgrBolum() {
  rows = {};
  mine = null;
  cacheUser = '';
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
  emit();
}

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /ogrenci_bolum|student_my_sections|schema cache/i.test(e.message || ''));

/** true = değişti (ekran yenilenmeli) */
export async function syncOgrBolum(role: 'teacher' | 'student' | string | undefined): Promise<boolean> {
  if (rpcMissing || (role !== 'teacher' && role !== 'student')) return false;
  try {
    if (role === 'student') {
      const { data, error } = await supabase.rpc('student_my_sections');
      if (error) {
        if (isMissing(error)) rpcMissing = true;
        return false;
      }
      const next = data && typeof data === 'object' && !Array.isArray(data) ? cleanAyar(data) : null;
      if (JSON.stringify(next) === JSON.stringify(mine)) return false;
      mine = next;
    } else {
      const { data, error } = await supabase.rpc('ogrenci_bolum_durum');
      if (error) {
        if (isMissing(error)) rpcMissing = true;
        return false;
      }
      const src = data && typeof data === 'object' && (data as any).rows && typeof (data as any).rows === 'object' ? (data as any).rows : {};
      const next: Record<string, OgrBolumAyar> = {};
      for (const k of Object.keys(src).sort()) next[k] = cleanAyar(src[k]);
      if (JSON.stringify(next) === JSON.stringify(rows)) return false;
      rows = next;
    }
    persist();
    emit();
    return true;
  } catch {
    return false; // bağlantı sorunu: bir sonraki yoklamada tekrar denenir
  }
}

// ------------------------------------------------------------------ öğretmen tarafı hesap
const areaKey = (kurumId?: string | null) => `k:${kurumId || '-'}`;

/** Sınıf için ayar satırı (yoksa undefined) */
export function ogrSinifAyari(classId: string): OgrBolumAyar | undefined {
  return rows[`c:${classId}`];
}
/** Alan (kurum) varsayılanı */
export function ogrVarsayilan(kurumId?: string | null): OgrBolumAyar | undefined {
  return rows[areaKey(kurumId)];
}

/** Bölüm açık mı: sınıf ayarı > alan varsayılanı > açık (veritabanındaki ogr_bolum_acik ile aynı) */
export function ogrBolumAcik(bolum: OgrBolum, classId?: string | null, kurumId?: string | null): boolean {
  const c = classId ? rows[`c:${classId}`]?.[bolum] : undefined;
  if (typeof c === 'boolean') return c;
  const k = rows[areaKey(kurumId)]?.[bolum];
  return typeof k === 'boolean' ? k : true;
}

/** Öğrenci için: sınıfı biliniyorsa sınıfın kurumu, sınıfsızsa öğrencinin kurumu (veritabanındaki ogr_bolum_ogrenci) */
export function ogrBolumOgrenciAcik(
  bolum: OgrBolum,
  st: { classId?: string | null; kurumId?: string | null },
  classKurum: (classId: string) => string | null | undefined
): boolean {
  if (st.classId) {
    const ck = classKurum(st.classId);
    if (ck !== undefined) return ogrBolumAcik(bolum, st.classId, ck);
  }
  return ogrBolumAcik(bolum, null, st.kurumId);
}

/** Hiç kapalı ayar yoksa seçicilerde hesap yapılmaz (hız) */
export function ogrBolumHicKapaliYok(bolum: OgrBolum): boolean {
  for (const k in rows) if (rows[k][bolum] === false) return false;
  return true;
}

// ------------------------------------------------------------------ öğrenci tarafı
/** Öğrencinin kendi bölümü açık mı (bilgi gelmediyse açık: eski davranış) */
export function myBolumAcik(bolum: OgrBolum): boolean {
  return mine?.[bolum] !== false;
}

// ------------------------------------------------------------------ yazma (genel yönetici / kurum yöneticisi)
/** sections null = "Varsayılana dön" (sınıf) / varsayılanı sil (alan) */
export async function saveOgrBolum(kurumId: string | null, classId: string | null, sections: OgrBolumAyar | null): Promise<void> {
  const { error } = await supabase.rpc('ogrenci_bolum_kaydet', { p_kurum_id: kurumId || '', p_class_id: classId || '', p_sections: sections });
  if (error) throw new Error(isMissing(error) ? SETUP_MSG : error.message);
  // TAM SENKRON: yazılan satır hemen ekranda; ardından sunucudan yeniden okunur
  const id = classId ? `c:${classId}` : areaKey(kurumId);
  const next = { ...rows };
  if (sections) next[id] = cleanAyar(sections);
  else delete next[id];
  rows = next;
  persist();
  emit();
  rpcMissing = false;
  void syncOgrBolum('teacher');
}

/** Veritabanının "bölüm kapalı" hatası mı (seçici eski bilgiyle kaldıysa kullanıcıya açıklama) */
export function isOgrBolumKapaliError(e: unknown): boolean {
  const m = String((e as any)?.message || e || '');
  return /bölümü bu öğrencilere kapalı|bölümü sınıfınıza kapalı|ogrenci_bolum_kapali/.test(m);
}

// ------------------------------------------------------------------ React
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;
/** Bölüm ayarı değişince bileşeni yeniden çizer; dönen sayı useMemo bağımlılığı olarak kullanılabilir */
export function useOgrBolumSurum(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
