// ============================================================================
// Aşama 300: TARAYICI DEPOSU (veri servisinden ayrıldı, 286'nın 2. parçası)
// Anahtar adları (STORAGE_KEYS), sekme / kalıcı depo yönlendirmesi (appStorage), okuma (loadData), bekletilen ve
// boşta yapılan yazmalar (saveData), hesap geçişinde yazma kilidi (freezeAppStorage), çıkışta silme ve cihaz kimliği.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı; davranış aynıdır. Yalnız "her kayıtta haber ver" bağlantısı
// eskiden DataService'in doğrudan yazdığı bir değişkendi, artık depoDegisinceBildir ile kurulur.
// Bu dosya yalnız sekmeDeposu'nu içe alır (o da hiçbir şeyi almaz): veri servisi buna dayanır (döngü yok).
// ============================================================================
import { sekmeyeYaz, sekmedenSil, sekmedenOku, sekmeYazmalariniBitir, sekmeDeposunuKapat, sahipsizKayitlariSil } from '../lib/sekmeDeposu';

export const STORAGE_KEYS = {
  DEVICE_ID: 'edu_sys_device_id_v6',
  IS_SEEDED: 'edu_sys_seeded_v6',
  DELETED_TEACHERS: 'edu_sys_deleted_teachers_v6',
  DELETED_STUDENTS: 'edu_sys_deleted_students_v6',
  DELETED_CLASSES: 'edu_sys_deleted_classes_v6',
  DELETED_HOMEWORK: 'edu_sys_deleted_homework_v6',
  DELETED_ETUTS: 'edu_sys_deleted_etuts_v6',
  REMEMBER_ME: 'edu_sys_remember_me_v6',
  REMEMBER_ME_TEACHER: 'edu_sys_remember_me_teacher_v6',
  REMEMBER_ME_STUDENT: 'edu_sys_remember_me_student_v6',
  TEACHERS: 'edu_sys_teachers_v6',
  AUTH_SESSION: 'edu_sys_auth_session_v6',
  CLASSES: 'edu_sys_classes_v6',
  STUDENTS: 'edu_sys_students_v6',
  HOMEWORK: 'edu_sys_homework_v6',
  SUBMISSIONS: 'edu_sys_submissions_v6',
  ETUTS: 'edu_sys_etuts_v6',
  ATTENDANCE: 'edu_sys_attendance_v6',
  GRADES: 'edu_sys_grades_v6',
  MESSAGES: 'edu_sys_messages_v6',
  DOCUMENTS: 'edu_sys_documents_v6',
  STUDENT_NOTIFICATIONS: 'edu_sys_student_notifications_v6',
  SENT_EMAILS: 'edu_sys_sent_emails_v6',
  QUESTION_LOGS: 'edu_sys_question_logs_v6',
  DELETED_QUESTION_LOGS: 'edu_sys_deleted_question_logs_v6',
  WEEKLY_QUESTION_TARGETS: 'edu_sys_weekly_question_targets_v6',
};

// =========================================================================
// GİZLİLİK (Aşama 7): Kişisel veriler tarayıcıda kalıcı tutulmaz.
// Öğrenci, not, ödev, mesaj vb. önbellekler yalnızca açık sekmede (sessionStorage) tutulur;
// sekme kapanınca ya da çıkış yapılınca silinir. Ortak kullanılan okul bilgisayarlarında
// bir sonraki kişi önceki kullanıcının verilerini göremez. Asıl veriler her zaman buluttadır.
// Kalıcı (localStorage) yalnızca kişisel veri içermeyen birkaç ayar tutulur.
// Bu dosyadaki tüm "localStorage" kullanımları aşağıdaki yönlendiriciden geçer.
// =========================================================================
const BROWSER_PERSISTENT_KEYS = new Set<string>([
  STORAGE_KEYS.DEVICE_ID,
  STORAGE_KEYS.IS_SEEDED,
  STORAGE_KEYS.REMEMBER_ME,
  STORAGE_KEYS.REMEMBER_ME_TEACHER,
  STORAGE_KEYS.REMEMBER_ME_STUDENT,
  STORAGE_KEYS.AUTH_SESSION, // oturumun kendisi sessionStorage'dadır; buradaki yalnızca eski kalıntıyı silmek içindir
]);
const isAppDataKey = (key: string) => key.startsWith('edu_sys_') && !BROWSER_PERSISTENT_KEYS.has(key);
// Eski sürümün "kalıcı yedek" kopyaları artık yazılmaz (veriler zaten buluttadır)
const isObsoleteMasterKey = (key: string) => key.startsWith('edu_sys_master_');

export const browserLocalStorage: Storage | null = (() => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
})();
const browserSessionStorage: Storage | null = (() => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
})();

export const appStorage = {
  getItem(key: string): string | null {
    if (isObsoleteMasterKey(key)) return null;
    const store = isAppDataKey(key) ? browserSessionStorage : browserLocalStorage;
    try { return store ? store.getItem(key) : null; } catch { return null; }
  },
  setItem(key: string, value: string): void {
    if (isObsoleteMasterKey(key)) return;
    const store = isAppDataKey(key) ? browserSessionStorage : browserLocalStorage;
    store?.setItem(key, value);
  },
  removeItem(key: string): void {
    try {
      if (isAppDataKey(key)) {
        // veri anahtarı: sekmeden ve (eski sürüm kalıntısı olarak) kalıcı alandan silinir
        browserSessionStorage?.removeItem(key);
        browserLocalStorage?.removeItem(key);
      } else {
        // kalıcı ayar anahtarı (ör. eski oturum kalıntısı): yalnız kalıcı alandan silinir
        browserLocalStorage?.removeItem(key);
      }
    } catch {}
  },
  // Anahtar listesi: sekme önbelleği (eski sürüm temizliği için)
  get length(): number {
    try { return browserSessionStorage ? browserSessionStorage.length : 0; } catch { return 0; }
  },
  key(index: number): string | null {
    try { return browserSessionStorage ? browserSessionStorage.key(index) : null; } catch { return null; }
  },
};
// Bu modülde "localStorage" adı yukarıdaki yönlendiriciyi ifade eder
const localStorage = appStorage;

// Eski sürümlerden tarayıcıda kalıcı olarak kalmış kişisel veri önbelleklerini siler
export function purgePersistentPersonalData(): number {
  if (!browserLocalStorage) return 0;
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < browserLocalStorage.length; i++) {
      const k = browserLocalStorage.key(i);
      if (k && k.startsWith('edu_sys_') && !BROWSER_PERSISTENT_KEYS.has(k)) keys.push(k);
    }
    keys.forEach((k) => {
      try { browserLocalStorage.removeItem(k); removed++; } catch {}
    });
  } catch {}
  return removed;
}

// Çıkışta sekmedeki tüm uygulama verilerini siler
export function clearSessionAppData(): void {
  cancelPendingSaves();
  sekmeDeposunuKapat(); // Aşama 355: büyük listelerin şifreli sekme deposu da silinir
  if (!browserSessionStorage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < browserSessionStorage.length; i++) {
      const k = browserSessionStorage.key(i);
      if (k && k.startsWith('edu_sys_')) keys.push(k);
    }
    keys.forEach((k) => {
      try { browserSessionStorage.removeItem(k); } catch {}
    });
  } catch {}
}

// Cihaz kimliği (Hardware / Browser Fingerprint ID)
// Başka bilgisayar veya telefondan açıldığında kullanıcıların otomatik çıkmasını önler
export function getLocalDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return 'volatile_device';
  }
}

const LEGACY_VERSIONS = ['_v5', '_v4', '_v3', '_v2', '_v1', ''];

export const PERMANENT_KEYS = {
  MASTER_STUDENTS: 'edu_sys_master_students_permanent',
  MASTER_CLASSES: 'edu_sys_master_classes_permanent',
  MASTER_TEACHERS: 'edu_sys_master_teachers_permanent',
  MASTER_ETUTS: 'edu_sys_master_etuts_permanent',
  MASTER_GRADES: 'edu_sys_master_grades_permanent',
  MASTER_HOMEWORK: 'edu_sys_master_homework_permanent',
  MASTER_ATTENDANCE: 'edu_sys_master_attendance_permanent',
  MASTER_SUBMISSIONS: 'edu_sys_master_submissions_permanent',
  MASTER_QUESTION_LOGS: 'edu_sys_master_question_logs_permanent',
  MASTER_DOCUMENTS: 'edu_sys_master_documents_permanent',
  DELETED_STUDENTS: 'edu_sys_master_deleted_students_permanent',
  DELETED_CLASSES: 'edu_sys_master_deleted_classes_permanent',
  DELETED_QUESTION_LOGS: 'edu_sys_master_deleted_question_logs_permanent',
};

// Safely clean up old versioned keys to free storage quota, but NEVER delete user data
export function cleanUpLegacyKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('_v1') || k.includes('_v2') || k.includes('_v3') || k.includes('_v4') || k.includes('_v5'))) {
        // CRITICAL: NEVER DELETE STUDENTS, CLASSES, TEACHERS, ETUTS, GRADES OR USER DATA KEYS
        if (
          k.includes('student') ||
          k.includes('class') ||
          k.includes('teacher') ||
          k.includes('homework') ||
          k.includes('submission') ||
          k.includes('etut') ||
          k.includes('grade') ||
          k.includes('not') ||
          k.includes('attendance') ||
          k.includes('document') ||
          k.includes('question') ||
          k.includes('master') ||
          k.includes('permanent') ||
          k.includes('backup')
        ) {
          continue;
        }
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch (e) {
    console.error('Error cleaning legacy storage keys:', e);
  }
}

// Safe storage getter and setter with multi-version fallback and auto-migration
export function loadData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null || item === undefined) return defaultValue;
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error loading key ${key}:`, e);
    return defaultValue;
  }
}

export function loadDataWithLegacyFallback<T>(key: string, defaultValue: T): T {
  try {
    const direct = localStorage.getItem(key);
    if (direct !== null && direct !== undefined) {
      return JSON.parse(direct);
    }
    for (const ver of LEGACY_VERSIONS) {
      if (!ver) continue;
      const legacyKey = key.replace(/_v\d+$/, ver);
      if (legacyKey === key) continue;
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal !== null && legacyVal !== undefined) {
        const parsed = JSON.parse(legacyVal);
        try {
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // ignore
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error(`Error loading key with legacy fallback ${key}:`, e);
  }
  return defaultValue;
}

// ============================================================================
// HIZ (Aşama 15): Büyük listeler sekme önbelleğine hemen değil, tarayıcı boşken toplu yazılır.
// Çok büyük listeler (ör. binlerce soru kaydı) önbelleğe hiç yazılmaz: yazmak telefonu dondurur,
// sekme önbelleğinin sınırını (yaklaşık 5 MB) aşar ve zaten her açılışta buluttan gelir.
// ============================================================================
const DEFERRED_SAVE_KEYS = new Set<string>([
  STORAGE_KEYS.STUDENTS,
  STORAGE_KEYS.CLASSES,
  STORAGE_KEYS.TEACHERS,
  STORAGE_KEYS.HOMEWORK,
  STORAGE_KEYS.SUBMISSIONS,
  STORAGE_KEYS.ETUTS,
  STORAGE_KEYS.ATTENDANCE,
  STORAGE_KEYS.GRADES,
  STORAGE_KEYS.MESSAGES,
  STORAGE_KEYS.DOCUMENTS,
  STORAGE_KEYS.QUESTION_LOGS,
  STORAGE_KEYS.WEEKLY_QUESTION_TARGETS,
  STORAGE_KEYS.STUDENT_NOTIFICATIONS,
  STORAGE_KEYS.SENT_EMAILS,
]);
const MAX_CACHED_ITEMS = 2500;
const pendingSaves = new Map<string, unknown>();
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let onDataChanged: (() => void) | null = null; // görünüm önbelleğini geçersiz kılar (DataService ayarlar)
/** Aşama 300: her kayıtta çağrılacak işlev (DataService kurulurken görünüm önbelleği sayacını bağlar) */
export function depoDegisinceBildir(fn: (() => void) | null): void {
  onDataChanged = fn;
}

// HIZ (Aşama 226): kayıt sayısı az ama kendisi çok büyük listeler (ör. her biri 30 öğrencilik yoklama kayıtları,
// 2.400 kayıt ≈ 3 MB) de önbelleğe yazılmaz. Boyut, ilk birkaç kaydın uzunluğundan tahmin edilir (tümü metne çevrilmez).
const MAX_CACHED_CHARS = 1_000_000;
function tooBigToCache(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  if (data.length > MAX_CACHED_ITEMS) return true;
  if (data.length < 200) return false;
  try {
    const n = Math.min(20, data.length);
    let len = 0;
    for (let i = 0; i < n; i++) len += JSON.stringify(data[Math.floor((i * data.length) / n)])?.length || 0;
    return (len / n) * data.length > MAX_CACHED_CHARS;
  } catch {
    return false;
  }
}
// Aşama 355: sekme önbelleğine sığmayan büyük liste artık atılmaz, şifreli sekme deposuna (IndexedDB) yazılır;
// sayfa yenilenince ekran bu listeyle hemen açılır (buluttan inmesi beklenmez). Liste yeniden sığarsa depodaki
// eski kopya silinir; böylece bir liste her zaman tek yerde durur.
const SEKME_DEPOSU_EN_COK = 60000; // bundan büyük listeler hiç saklanmaz (metne çevirmek telefonu dondurur)
function writeNow(key: string, data: unknown): void {
  if (storageFrozen) return;
  if (tooBigToCache(data) || !saveDataNow(key, data)) {
    try { localStorage.removeItem(key); } catch {}
    if (Array.isArray(data) && data.length > SEKME_DEPOSU_EN_COK) sekmedenSil(key);
    else sekmeyeYaz(key, data);
    return;
  }
  sekmedenSil(key);
}
// HIZ (Aşama 226): bekleyen yazmalar tek seferde değil, tarayıcı boşken birer birer yapılır
// (açılışta öğrenci + ödev + etüt listesi art arda yazılınca telefonda tek uzun donma oluyordu).
function flushPendingSaves(): void {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  const items = Array.from(pendingSaves.entries());
  pendingSaves.clear();
  for (const [k, v] of items) writeNow(k, v);
}
function flushPendingSavesIdle(deadline?: { timeRemaining?: () => number; didTimeout?: boolean }): void {
  pendingSaveTimer = null;
  const ric = (window as any).requestIdleCallback;
  // ilk kayıt her zaman yazılır; sonrakiler boş süre kaldıkça
  let first = true;
  while (pendingSaves.size) {
    if (!first && deadline && typeof deadline.timeRemaining === 'function' && !deadline.didTimeout && deadline.timeRemaining() < 8) break;
    if (!first && (!deadline || deadline.didTimeout)) break;
    first = false;
    const [k, v] = pendingSaves.entries().next().value as [string, unknown];
    pendingSaves.delete(k);
    writeNow(k, v);
  }
  if (pendingSaves.size && !pendingSaveTimer) {
    pendingSaveTimer = setTimeout(() => {
      if (typeof ric === 'function') ric(flushPendingSavesIdle, { timeout: 2000 });
      else flushPendingSavesIdle();
    }, 0);
  }
}
function cancelPendingSaves(): void {
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
  pendingSaveTimer = null;
  pendingSaves.clear();
}
if (typeof window !== 'undefined') {
  // Sekme arka plana geçerken / kapanırken bekleyen yazmalar tamamlanır
  window.addEventListener('pagehide', () => {
    flushPendingSaves();
    sekmeYazmalariniBitir();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSaves();
      sekmeYazmalariniBitir();
    }
  });
  // Aşama 355: kapanmış sekmelerden kalan (artık okunamayan) kayıtlar boşta silinir
  setTimeout(() => void sahipsizKayitlariSil(), 4000);
}

export function saveData<T>(key: string, data: T): void {
  if (onDataChanged) onDataChanged();
  yazilanlar.add(key);
  if (DEFERRED_SAVE_KEYS.has(key)) {
    pendingSaves.set(key, data);
    if (!pendingSaveTimer) {
      pendingSaveTimer = setTimeout(() => {
        const ric = (window as any).requestIdleCallback;
        if (typeof ric === 'function') ric(flushPendingSavesIdle, { timeout: 2000 });
        else flushPendingSavesIdle();
      }, 600);
    }
    return;
  }
  saveDataNow(key, data);
}

// Aşama 97: kurumlar arası geçişte sayfa yenilenene kadar tarayıcıya hiçbir veri yazılmaz (önceki hesabın verisi taşınmaz)
let storageFrozen = false;
export function freezeAppStorage(): void {
  storageFrozen = true;
  cancelPendingSaves();
  sekmeDeposunuKapat(true);
}

/** Sekme önbelleğine yazar; yazılamazsa (5 MB dolu) false döner. */
function saveDataNow<T>(key: string, data: T): boolean {
  if (storageFrozen) return true;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn(`Quota or write issue when saving ${key}. Freeing legacy storage and retrying...`, e);
    try {
      cleanUpLegacyKeys();
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (retryErr) {
      console.warn(`Sekme önbelleği dolu (${key}): liste sekme deposuna yazılacak.`, retryErr);
      return false;
    }
  }
}

// ============================================================================
// Aşama 355: açılışta sekme deposundaki büyük listeler
// ============================================================================
// Bu sayfa açılışından beri kaydedilen listeler (buluttan güncel hâli gelmiş demektir: depodaki eski kopya kullanılmaz)
const yazilanlar = new Set<string>();
/**
 * Sekme önbelleğinde olmayan (sığmadığı için sekme deposuna yazılmış) büyük listeleri verir. Bu açılışta
 * buluttan güncel hâli zaten gelmiş ya da sekme önbelleğinde kopyası bulunan liste verilmez.
 */
export async function buyukListeleriGeriYukle(): Promise<Map<string, unknown>> {
  const m = await sekmedenOku();
  for (const k of Array.from(m.keys())) {
    let sekmede = false;
    try { sekmede = localStorage.getItem(k) !== null; } catch {}
    if (yazilanlar.has(k) || sekmede || !Array.isArray(m.get(k))) m.delete(k);
  }
  return m;
}