// ============================================================================
// Aşama 103: ŞİFREYLE KİLİTLİ CİHAZ ÖNBELLEĞİ
// Büyük listeler (yoklama, mesaj / duyuru, not) cihazda ŞİFRELİ saklanır; böylece tekrar girişte sunucudan
// yalnızca değişenler indirilir. Anahtar öğretmenin giriş şifresinden üretilir (PBKDF2 + AES-GCM, tarayıcının
// yerleşik WebCrypto'su) ve kalıcı hiçbir yere yazılmaz: yalnızca bu sekmede (sessionStorage) durur, sekme
// kapanınca kaybolur. Şifre bilinmeden kayıt okunamaz.
// Silinme: çıkışta, kurum geçişinde, başka hesap / öğrenci girişinde, şifre değişince (çözülemez) ve 7 gün açılmazsa.
// Önbellek yalnızca okuma kopyasıdır; sunucuya hiçbir şey yazmaz. Hata olursa sessizce devre dışı kalır
// (uygulama her şeyi eskisi gibi sunucudan okur). Ağır işler secureCache.worker.ts'de yapılır.
// ============================================================================

const DB_NAME = 'biliredu_kilitli';
const STORE = 'kayit';
const REC_ID = 'veri';
const META_ID = 'bilgi'; // sahip / tuz / zamanlar (küçük; şifreli veri ana tarafa kopyalanmaz)
const KEY_SS = 'edu_sys_kilit_anahtar'; // edu_sys_ öneki: çıkışta sekme verileriyle birlikte silinir (_vN eki yok: eski anahtar temizliği silmesin)
const TTL_MS = 7 * 86400000;
const PART_ROWS = 1000; // listeler iş parçacıkları arasında parça parça taşınır (tek seferde uzun takılma olmaz)

export type SecureTable = 'attendance' | 'messages' | 'grades';
export interface SecurePayload {
  tables: Partial<Record<SecureTable, { mark: string; rows: any[] }>>;
}
interface StoredMeta {
  id: string;
  owner: string;
  salt: string;
  savedAt: number;
  openedAt: number;
}
interface SessionKey {
  uid: string;
  salt: string;
  key: string; // ham anahtar (yalnız bu sekmede)
}

function supported(): boolean {
  try {
    return (
      typeof indexedDB !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      !!(globalThis.crypto && crypto.subtle) &&
      typeof sessionStorage !== 'undefined'
    );
  } catch {
    return false;
  }
}

// --- IndexedDB (ana taraf yalnız küçük işler: süre denetimi, silme, sahip okuma) ---
function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const t = db.transaction(STORE, mode);
        const r = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(r ? (r.result as T) : undefined);
        };
        t.onerror = t.onabort = () => {
          db.close();
          reject(t.error);
        };
      } catch (e) {
        db.close();
        reject(e);
      }
    };
  });
}
const readMeta = async () => (await idb<StoredMeta>('readonly', (s) => s.get(META_ID))) || null;
const deleteRecord = () =>
  idb<void>('readwrite', (s) => {
    s.delete(REC_ID);
    s.delete(META_ID);
  });
const expired = (m: StoredMeta) => Date.now() - Math.max(m.openedAt || 0, m.savedAt || 0) > TTL_MS;

function readSessionKey(): SessionKey | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY_SS) || 'null');
    return v && typeof v.uid === 'string' && typeof v.key === 'string' && typeof v.salt === 'string' ? v : null;
  } catch {
    return null;
  }
}

// --- İş parçacığı ---
let worker: Worker | null = null;
let seq = 0;
const handlers = new Map<number, (m: any) => void>();
function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./secureCache.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => handlers.get(e.data?.id)?.(e.data);
    worker.onerror = () => {
      handlers.forEach((h, id) => h({ id, type: 'done', ok: false }));
      handlers.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}
function call(msg: any, onMessage: (m: any, finish: (v: any) => void) => void): Promise<any> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    const finish = (v: any) => {
      handlers.delete(id);
      resolve(v);
    };
    handlers.set(id, (m) => onMessage(m, finish));
    w.postMessage({ ...msg, id });
  });
}
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

async function loadWith(sk: SessionKey): Promise<SecurePayload | null> {
  const tables: SecurePayload['tables'] = {};
  const res = await call({ op: 'load', key: sk.key, uid: sk.uid, salt: sk.salt }, (m, finish) => {
    if (m.type === 'part') {
      const t = (tables[m.table as SecureTable] = tables[m.table as SecureTable] || { mark: '', rows: [] });
      const rows = m.rows as any[];
      for (let i = 0; i < rows.length; i++) t.rows.push(rows[i]);
    } else if (m.type === 'done') finish(m);
  });
  if (!res || !res.ok) return res && res.reason === 'cozulemedi' ? Promise.reject(new Error('cozulemedi')) : null;
  for (const name of Object.keys(tables) as SecureTable[]) tables[name]!.mark = String(res.marks?.[name] || '');
  return { tables };
}

/** Süresi dolmuş (7 gün açılmamış) kaydı anahtar gerekmeden siler. Uygulama açılışında çağrılır. */
export async function purgeExpiredSecureCache(): Promise<void> {
  if (!supported()) return;
  try {
    const m = await readMeta();
    if (m && expired(m)) await deleteRecord();
  } catch {
    /* depolama kapalı */
  }
}

/** Kayıt ve bu sekmedeki anahtar silinir (çıkış, kurum geçişi, öğrenci girişi). */
export async function wipeSecureCache(): Promise<void> {
  try {
    sessionStorage.removeItem(KEY_SS);
  } catch {}
  if (!supported()) return;
  try {
    await deleteRecord();
  } catch {
    /* yok say */
  }
}

/**
 * Şifreyle girişten hemen sonra: şifreden anahtar üretilir, sekmeye yazılır ve varsa aynı hesabın kaydı açılır.
 * Kayıt başka hesaba aitse, süresi dolmuşsa ya da çözülemiyorsa (şifre değişmiş) silinir.
 */
export async function unlockSecureCache(uid: string, password: string): Promise<SecurePayload | null> {
  if (!supported() || !uid || !password) return null;
  try {
    let meta = await readMeta();
    if (meta && (meta.owner !== uid || expired(meta))) {
      await deleteRecord();
      meta = null;
    }
    const salt = meta?.salt || btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const k = await call({ op: 'derive', uid, password, salt }, (m, finish) => finish(m));
    if (!k || !k.ok) return null;
    const sk: SessionKey = { uid, salt, key: k.key };
    try {
      sessionStorage.setItem(KEY_SS, JSON.stringify(sk));
    } catch {
      return null;
    }
    if (!meta) return null;
    try {
      return await loadWith(sk);
    } catch {
      // şifre değişmiş ya da kayıt bozuk: eski kayıt silinir, yeni anahtarla yeniden yazılacak
      await deleteRecord().catch(() => {});
      return null;
    }
  } catch {
    return null;
  }
}

/** Sayfa yenilendiğinde: sekmedeki anahtarla aynı hesabın kaydı açılır. */
export async function resumeSecureCache(uid: string): Promise<SecurePayload | null> {
  if (!supported() || !uid) return null;
  const sk = readSessionKey();
  if (!sk || sk.uid !== uid) return null;
  try {
    return await loadWith(sk);
  } catch {
    return null;
  }
}

/** Bu sekmede kilit anahtarı var mı (yalnız şifreyle giriş yapan öğretmende olur)? */
export function hasSecureKey(uid?: string | null): boolean {
  if (!supported()) return false;
  const sk = readSessionKey();
  return !!sk && (!uid || sk.uid === uid);
}

let saving: Promise<boolean> | null = null;
/** Güncel listeleri parça parça iş parçacığına gönderir; orada sıkıştırılıp şifrelenir ve tek kayıt olarak yazılır. */
export async function saveSecureCache(payload: SecurePayload): Promise<boolean> {
  if (saving) await saving.catch(() => false);
  const sk = readSessionKey();
  if (!sk || !supported() || !getWorker()) return false;
  saving = (async () => {
    const w = getWorker();
    if (!w) return false;
    w.postMessage({ op: 'reset' });
    const marks: Record<string, string> = {};
    for (const name of Object.keys(payload.tables) as SecureTable[]) {
      const t = payload.tables[name];
      if (!t) continue;
      marks[name] = t.mark;
      for (let i = 0; i < t.rows.length; i += PART_ROWS) {
        w.postMessage({ op: 'part', table: name, rows: t.rows.slice(i, i + PART_ROWS) });
        await yieldToMain();
      }
    }
    // bu arada çıkış yapıldıysa yazılmaz
    const now = readSessionKey();
    if (!now || now.uid !== sk.uid || now.key !== sk.key) {
      w.postMessage({ op: 'reset' });
      return false;
    }
    const r = await call({ op: 'commit', key: sk.key, uid: sk.uid, salt: sk.salt, marks }, (m, finish) => finish(m));
    // yazma sırasında çıkış yapıldıysa kayıt yine silinir
    if (!hasSecureKey(sk.uid)) await deleteRecord().catch(() => {});
    return !!(r && r.ok);
  })().finally(() => {
    saving = null;
  });
  return saving;
}
