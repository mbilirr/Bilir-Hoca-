// ============================================================================
// Aşama 355: BÜYÜK LİSTELER İÇİN SEKME DEPOSU (IndexedDB, şifreli)
// Sekme önbelleği (sessionStorage) yaklaşık 5 MB'ta doluyor; büyük kurumda öğrenci, yoklama ve soru kaydı listeleri
// sığmadığı için hiç saklanmıyor, sayfa yenilenince ekran bu listeler buluttan inene kadar boş kalıyordu.
// Artık sığmayan listeler tarayıcının büyük deposuna (IndexedDB) yazılır. Gizlilik kuralı (Aşama 7) aynen korunur:
//   - Her sekme kendi rastgele anahtarını üretir (AES-GCM 256, tarayıcının yerleşik WebCrypto'su). Anahtar yalnız
//     bu sekmede (sessionStorage) durur; sekme kapanınca anahtar da gider ve kayıt okunamaz hâle gelir.
//   - Çıkışta ve kurum geçişinde anahtar ve bu sekmenin kayıtları hemen silinir.
//   - Sahipsiz kalmış eski kayıtlar (12 saattir dokunulmamış) her açılışta silinir.
// Depo yalnız okuma kopyasıdır: asıl veri her zaman buluttadır; hata olursa sessizce devre dışı kalır.
// Bu dosya hiçbir şeyi içe almaz (depo.ts buna dayanır, döngü olmaz).
// ============================================================================

const DB_NAME = 'biliredu_sekme';
const STORE = 'liste';
const KEY_SS = 'edu_sys_sekme_anahtar'; // edu_sys_ öneki: çıkışta sekme verileriyle birlikte silinir (_vN eki yok)
const SAHIPSIZ_MS = 12 * 3600000;

interface Kayit {
  id: string; // `${oturum}:${ad}`
  oturum: string;
  ad: string;
  t: number; // son yazma
  iv: ArrayBuffer;
  veri: ArrayBuffer;
}
interface SekmeAnahtari {
  oturum: string;
  anahtar: string; // ham AES anahtarı (base64)
}

export function sekmeDeposuVar(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && !!(globalThis.crypto && crypto.subtle) && typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const ham = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function anahtarOku(): SekmeAnahtari | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY_SS) || 'null');
    return v && typeof v.oturum === 'string' && typeof v.anahtar === 'string' ? v : null;
  } catch {
    return null;
  }
}

let anahtarOnbellek: { ham: string; key: CryptoKey } | null = null;
async function cryptoAnahtari(sa: SekmeAnahtari): Promise<CryptoKey> {
  if (anahtarOnbellek && anahtarOnbellek.ham === sa.anahtar) return anahtarOnbellek.key;
  const key = await crypto.subtle.importKey('raw', ham(sa.anahtar), 'AES-GCM', false, ['encrypt', 'decrypt']);
  anahtarOnbellek = { ham: sa.anahtar, key };
  return key;
}

/** Bu sekmenin anahtarı (yoksa üretilir). Sekme deposu yoksa null. */
async function anahtarAl(uret: boolean): Promise<SekmeAnahtari | null> {
  const var_ = anahtarOku();
  if (var_ || !uret) return var_;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const sa: SekmeAnahtari = {
    oturum: b64(crypto.getRandomValues(new Uint8Array(9)).buffer),
    anahtar: b64(await crypto.subtle.exportKey('raw', k)),
  };
  // aynı anda iki yazma anahtar üretmiş olabilir: önce yazan kazanır
  const once = anahtarOku();
  if (once) return once;
  try {
    sessionStorage.setItem(KEY_SS, JSON.stringify(sa));
  } catch {
    return null;
  }
  return sa;
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('oturum', 'oturum');
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

// ---------------------------------------------------------------------------
// Yazma: liste başına en son hâl tutulur; büyük liste sık değişse de (anlık kanal) en fazla dakikada bir
// şifrelenip yazılır. Sekme arka plana geçerken bekleyenler hemen yazılır.
// ---------------------------------------------------------------------------
const ILK_GECIKME_MS = 5000;
const EN_AZ_ARALIK_MS = 60000;
const bekleyen = new Map<string, unknown>();
const sonYazma = new Map<string, number>();
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
let kapali = false; // kurum geçişi: sayfa yenilenene kadar yazılmaz
let calisan: Promise<void> | null = null;

async function yazSimdi(ad: string, veri: unknown): Promise<void> {
  const sa = await anahtarAl(true);
  if (!sa || kapali) return;
  const key = await cryptoAnahtari(sa);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sifreli = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(veri)));
  // şifreleme sürerken çıkış yapıldıysa ya da anahtar değiştiyse yazılmaz
  const simdi = anahtarOku();
  if (kapali || !simdi || simdi.anahtar !== sa.anahtar) return;
  const k: Kayit = { id: `${sa.oturum}:${ad}`, oturum: sa.oturum, ad, t: Date.now(), iv: iv.buffer, veri: sifreli };
  await idb('readwrite', (s) => s.put(k));
  sonYazma.set(ad, Date.now());
  // yazma sırasında çıkış yapıldıysa kayıt yine silinir
  if (kapali || !anahtarOku()) await idb('readwrite', (s) => s.delete(k.id)).catch(() => {});
}

function bekleyenleriYaz(): Promise<void> {
  if (calisan) return calisan;
  calisan = (async () => {
    while (bekleyen.size && !kapali) {
      const [ad, veri] = bekleyen.entries().next().value as [string, unknown];
      bekleyen.delete(ad);
      try {
        await yazSimdi(ad, veri);
      } catch {
        /* depo dolu ya da kapalı: bu liste yine buluttan okunur */
      }
    }
  })().finally(() => {
    calisan = null;
  });
  return calisan;
}

function zamanla(): void {
  if (zamanlayici || !bekleyen.size || kapali) return;
  let bekle = ILK_GECIKME_MS;
  for (const ad of bekleyen.keys()) bekle = Math.max(bekle, EN_AZ_ARALIK_MS - (Date.now() - (sonYazma.get(ad) || 0)));
  zamanlayici = setTimeout(() => {
    zamanlayici = null;
    const ric = (globalThis as any).requestIdleCallback;
    if (typeof ric === 'function') ric(() => void bekleyenleriYaz(), { timeout: 4000 });
    else void bekleyenleriYaz();
  }, Math.min(bekle, EN_AZ_ARALIK_MS));
}

/** Sekme önbelleğine sığmayan listeyi sekme deposuna yazılmak üzere sıraya alır. */
export function sekmeyeYaz(ad: string, veri: unknown): void {
  if (kapali || !sekmeDeposuVar()) return;
  bekleyen.set(ad, veri);
  depodakiler.add(ad);
  zamanla();
}

/** Bekleyen yazmalar hemen yapılır (sekme arka plana geçerken). */
export function sekmeYazmalariniBitir(): void {
  if (!bekleyen.size) return;
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
  void bekleyenleriYaz();
}

// Bu sekmenin depoda kaydı olan listeleri (sekme önbelleğine geri sığınca depodaki eski kopya silinir)
const depodakiler = new Set<string>();

/** Liste yeniden sekme önbelleğine sığdı: depodaki eski (artık geride kalan) kopya silinir. */
export function sekmedenSil(ad: string): void {
  bekleyen.delete(ad);
  if (!depodakiler.has(ad)) return;
  depodakiler.delete(ad);
  const sa = anahtarOku();
  if (!sa || !sekmeDeposuVar()) return;
  idb('readwrite', (s) => s.delete(`${sa.oturum}:${ad}`)).catch(() => {});
}

/** Sayfa açılışında: bu sekmenin depodaki listeleri çözülüp verilir (yoksa boş). */
export async function sekmedenOku(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (!sekmeDeposuVar()) return out;
  const sa = anahtarOku();
  if (!sa) return out;
  try {
    const kayitlar = (await idb<Kayit[]>('readonly', (s) => s.index('oturum').getAll(sa.oturum))) || [];
    if (!kayitlar.length) return out;
    const key = await cryptoAnahtari(sa);
    for (const k of kayitlar) {
      try {
        const acik = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(k.iv) }, key, k.veri);
        out.set(k.ad, JSON.parse(new TextDecoder().decode(acik)));
        depodakiler.add(k.ad);
      } catch {
        // çözülemeyen kayıt (bozuk): silinir, liste buluttan okunur
        idb('readwrite', (s) => s.delete(k.id)).catch(() => {});
      }
    }
  } catch {
    /* depo kapalı */
  }
  return out;
}

/** Açılışta: 12 saattir dokunulmamış (sahibi kapanmış sekmelerin) kayıtları silinir. */
export async function sahipsizKayitlariSil(): Promise<void> {
  if (!sekmeDeposuVar()) return;
  try {
    const sinir = Date.now() - SAHIPSIZ_MS;
    await idb('readwrite', (s) => {
      const c = s.openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return;
        const k = cur.value as Kayit;
        if (!(k.t > sinir)) cur.delete();
        cur.continue();
      };
    });
  } catch {
    /* depo kapalı */
  }
}

/**
 * Çıkış / kurum geçişi: bu sekmenin anahtarı ve kayıtları silinir (anahtar silindiği anda kayıtlar okunamaz hâle
 * gelir; silme arkada tamamlanır). dondur = true ise sayfa yenilenene kadar yeni yazma da yapılmaz (kurum geçişi).
 * Çıkıştan sonra aynı sekmede yeni giriş yapılırsa ilk yazmada yeni anahtar üretilir.
 */
export function sekmeDeposunuKapat(dondur = false): void {
  if (dondur) kapali = true;
  bekleyen.clear();
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
  const sa = anahtarOku();
  try {
    sessionStorage.removeItem(KEY_SS);
  } catch {}
  anahtarOnbellek = null;
  depodakiler.clear();
  if (!sa || !sekmeDeposuVar()) return;
  idb('readwrite', (s) => {
    const c = s.index('oturum').openCursor(IDBKeyRange.only(sa.oturum));
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      cur.delete();
      cur.continue();
    };
  }).catch(() => {});
}
