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
// Aşama 365: liste boyu sınırı (60.000 satır) kalktı. 5.000 satırdan uzun liste parça parça yazılır: her parça ayrı
// metne çevrilip şifrelenir, parçalar arasında tarayıcıya nefes aldırılır (telefon donmaz). Okurken yalnız bütün
// parçaları tamam olan en son yazım (nesil) kullanılır; yarım kalan yazım hiç okunmaz ve sonraki yazımda silinir.
// Bu dosya hiçbir şeyi içe almaz (depo.ts buna dayanır, döngü olmaz).
// ============================================================================

const DB_NAME = 'biliredu_sekme';
const STORE = 'liste';
const KEY_SS = 'edu_sys_sekme_anahtar'; // edu_sys_ öneki: çıkışta sekme verileriyle birlikte silinir (_vN eki yok)
const SAHIPSIZ_MS = 12 * 3600000;

interface Kayit {
  id: string; // tek kayıt `${oturum}:${ad}`, parça `${oturum}:${ad}#${nesil}:${parca}`
  oturum: string;
  ad: string;
  t: number; // son yazma
  iv: ArrayBuffer;
  veri: ArrayBuffer;
  // Aşama 365: parçalı yazım (yoksa tek kayıt)
  nesil?: string;
  parca?: number;
  toplam?: number;
}
/** Aşama 365: bir listenin bu kadar satırı tek parçada yazılır */
export const PARCA_SATIR = 5000;
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

/** Tarayıcı boşalınca (ya da en geç yarım saniyede) devam eder: uzun işler arasında ekran donmaz. */
const bosta = () =>
  new Promise<void>((r) => {
    const ric = (globalThis as any).requestIdleCallback;
    if (typeof ric === 'function') ric(() => r(), { timeout: 500 });
    else setTimeout(r, 0);
  });

async function sifrele(key: CryptoKey, veri: unknown): Promise<{ iv: ArrayBuffer; veri: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sifreli = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(veri)));
  return { iv: iv.buffer, veri: sifreli };
}

/**
 * Bir listenin depodaki kayıtlarını siler. birak.tek: tek kayıt kalır; birak.nesil: o yazımın parçaları kalır.
 * (Kimlik aralığı `${oturum}:${ad}` … `${oturum}:${ad}#…`; başka liste yanlışlıkla silinmesin diye ad ayrıca denetlenir.)
 */
function adKayitlariniSil(oturum: string, ad: string, birak: { tek?: boolean; nesil?: string } = {}): Promise<unknown> {
  return idb('readwrite', (s) => {
    const c = s.openCursor(IDBKeyRange.bound(`${oturum}:${ad}`, `${oturum}:${ad}#\uffff`));
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      const k = cur.value as Kayit;
      const kalir = k.ad !== ad || (birak.tek && !k.nesil) || (!!birak.nesil && k.nesil === birak.nesil);
      if (!kalir) cur.delete();
      cur.continue();
    };
  });
}

async function yazSimdi(ad: string, veri: unknown): Promise<void> {
  const sa = await anahtarAl(true);
  if (!sa || kapali) return;
  const key = await cryptoAnahtari(sa);
  // şifreleme sürerken çıkış yapıldıysa ya da anahtar değiştiyse yazılmaz
  const gecerli = () => {
    const simdi = anahtarOku();
    return !kapali && !!simdi && simdi.anahtar === sa.anahtar;
  };
  // yazma sırasında çıkış yapıldıysa bu listenin kayıtları yine silinir
  const cikildiysaSil = async () => {
    if (kapali || !anahtarOku()) {
      await adKayitlariniSil(sa.oturum, ad).catch(() => {});
      return true;
    }
    return false;
  };
  const toplam = Array.isArray(veri) && veri.length > PARCA_SATIR ? Math.ceil(veri.length / PARCA_SATIR) : 0;
  if (!toplam) {
    const sifreli = await sifrele(key, veri);
    if (!gecerli()) return;
    const k: Kayit = { id: `${sa.oturum}:${ad}`, oturum: sa.oturum, ad, t: Date.now(), ...sifreli };
    await idb('readwrite', (s) => s.put(k));
    if (await cikildiysaSil()) return;
    await adKayitlariniSil(sa.oturum, ad, { tek: true }); // önceki parçalı yazım
  } else {
    const liste = veri as unknown[];
    const nesil = b64(crypto.getRandomValues(new Uint8Array(6)).buffer);
    for (let i = 0; i < toplam; i++) {
      if (i) await bosta();
      // yazım baştan sona aynı anlık görüntüyü yazar; liste bu arada değişirse yeni hâli sıradaki yazımda gelir
      // (çıkış yapıldıysa bırakılır: yarım nesil hiç okunmaz, sahipsiz kayıt temizliği siler)
      if (!gecerli()) return;
      const sifreli = await sifrele(key, liste.slice(i * PARCA_SATIR, (i + 1) * PARCA_SATIR));
      if (!gecerli()) return;
      const k: Kayit = { id: `${sa.oturum}:${ad}#${nesil}:${i}`, oturum: sa.oturum, ad, t: Date.now(), ...sifreli, nesil, parca: i, toplam };
      await idb('readwrite', (s) => s.put(k));
      if (await cikildiysaSil()) return;
    }
    await adKayitlariniSil(sa.oturum, ad, { nesil }); // tek kayıt ve eski yazımlar
  }
  sonYazma.set(ad, Date.now());
}

/**
 * Aşama 365: okunacak kayıtları seçer (saf işlev, sınanır). Tek kayıt olduğu gibi; parçalı listede yalnız bütün
 * parçaları tamam olan en son yazım, parça sırasıyla. Bir liste için ikisi de varsa en son yazılan kazanır.
 * okunmayacaklar: seçilmeyen (yarım ya da eski) kayıtların kimlikleri.
 */
export function okunacakKayitlar<K extends { id: string; ad: string; t: number; nesil?: string; parca?: number; toplam?: number }>(
  kayitlar: K[]
): { secilen: Map<string, K[]>; okunmayacaklar: string[] } {
  const adlar = new Map<string, K[]>();
  for (const k of kayitlar) {
    const l = adlar.get(k.ad);
    if (l) l.push(k);
    else adlar.set(k.ad, [k]);
  }
  const secilen = new Map<string, K[]>();
  const okunmayacaklar: string[] = [];
  for (const [ad, l] of adlar) {
    const adaylar: { t: number; parcalar: K[] }[] = [];
    const nesiller = new Map<string, K[]>();
    for (const k of l) {
      if (!k.nesil) adaylar.push({ t: k.t, parcalar: [k] });
      else (nesiller.get(k.nesil) || nesiller.set(k.nesil, []).get(k.nesil)!).push(k);
    }
    for (const p of nesiller.values()) {
      const toplam = p[0].toplam || 0;
      const sirali = [...p].sort((a, b) => (a.parca || 0) - (b.parca || 0));
      const tamam = toplam > 0 && sirali.length === toplam && sirali.every((k, i) => k.parca === i && k.toplam === toplam);
      if (tamam) adaylar.push({ t: Math.max(...sirali.map((k) => k.t)), parcalar: sirali });
    }
    adaylar.sort((a, b) => b.t - a.t);
    const en = adaylar[0];
    if (en) secilen.set(ad, en.parcalar);
    const tutulan = new Set((en?.parcalar || []).map((k) => k.id));
    for (const k of l) if (!tutulan.has(k.id)) okunmayacaklar.push(k.id);
  }
  return { secilen, okunmayacaklar };
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
  adKayitlariniSil(sa.oturum, ad).catch(() => {}); // Aşama 365: parçalarıyla birlikte
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
    const coz = async (k: Kayit) => JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(k.iv) }, key, k.veri)));
    // Aşama 365: yarım ya da eski yazımlar okunmaz, boşta silinir
    const { secilen, okunmayacaklar } = okunacakKayitlar(kayitlar);
    if (okunmayacaklar.length) idb('readwrite', (s) => okunmayacaklar.forEach((id) => s.delete(id))).catch(() => {});
    for (const [ad, parcalar] of secilen) {
      depodakiler.add(ad);
      try {
        if (!parcalar[0].nesil) out.set(ad, await coz(parcalar[0]));
        else {
          const liste: unknown[] = [];
          for (let i = 0; i < parcalar.length; i++) {
            if (i) await bosta();
            const p = await coz(parcalar[i]);
            for (const x of p) liste.push(x);
          }
          out.set(ad, liste);
        }
      } catch {
        // çözülemeyen kayıt (bozuk): listenin bütün kayıtları silinir, liste buluttan okunur
        depodakiler.delete(ad);
        adKayitlariniSil(sa.oturum, ad).catch(() => {});
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
