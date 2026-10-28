// ============================================================================
// Aşama 103: kilitli önbelleğin ağır işleri (anahtar üretme, sıkıştırma, şifreleme, çözme, JSON) bu ayrı iş
// parçacığında yapılır; ekran (ana iş parçacığı) takılmaz. Listeler ana tarafa parça parça gönderilir.
// ============================================================================

const DB_NAME = 'biliredu_kilitli';
const STORE = 'kayit';
const REC_ID = 'veri';
const META_ID = 'bilgi';
const VERSION = 2;
const PBKDF2_ROUNDS = 150000;

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

const canZip = typeof (self as any).CompressionStream === 'function' && typeof (self as any).DecompressionStream === 'function';
async function pipe(data: Uint8Array, stream: any): Promise<Uint8Array> {
  const out = await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}

async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

interface Header {
  v: number;
  z: boolean;
  tables: Record<string, { mark: string; parts: number[] }>;
}

// Kayıt çözülür ve parçalar ana tarafa tek tek gönderilir
async function load(id: number, keyRaw: string, uid: string, salt: string) {
  const rec: any = await idb('readonly', (s) => s.get(REC_ID));
  if (!rec || rec.owner !== uid || rec.salt !== salt || !rec.data || !rec.iv) return post({ id, type: 'done', ok: false, reason: 'yok' });
  let plain: Uint8Array;
  try {
    const key = await importKey(keyRaw);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, rec.data));
  } catch {
    return post({ id, type: 'done', ok: false, reason: 'cozulemedi' });
  }
  const nl = plain.indexOf(10);
  const header = JSON.parse(dec.decode(plain.subarray(0, nl))) as Header;
  if (!header || header.v !== VERSION) return post({ id, type: 'done', ok: false, reason: 'surum' });
  let body = plain.subarray(nl + 1);
  if (header.z) body = await pipe(body, new (self as any).DecompressionStream('gzip'));
  const text = dec.decode(body);
  let pos = 0;
  for (const name of Object.keys(header.tables)) {
    for (const len of header.tables[name].parts) {
      post({ id, type: 'part', table: name, rows: JSON.parse(text.slice(pos, pos + len)) });
      pos += len;
    }
  }
  idb('readwrite', (s) => {
    const g = s.get(META_ID);
    g.onsuccess = () => {
      if (g.result) s.put({ ...g.result, openedAt: Date.now() });
    };
  }).catch(() => {});
  const marks: Record<string, string> = {};
  for (const name of Object.keys(header.tables)) marks[name] = header.tables[name].mark;
  post({ id, type: 'done', ok: true, marks });
}

// Kaydedilecek parçalar ana taraftan gelir; commit'te sıkıştırılıp şifrelenir ve yazılır
let pending: Record<string, any[][]> = {};
async function commit(id: number, keyRaw: string, uid: string, salt: string, marks: Record<string, string>) {
  const parts = pending;
  pending = {};
  try {
    const header: Header = { v: VERSION, z: canZip, tables: {} };
    const chunks: string[] = [];
    for (const name of Object.keys(marks)) {
      const lens: number[] = [];
      for (const rows of parts[name] || [[]]) {
        const s = JSON.stringify(rows);
        lens.push(s.length);
        chunks.push(s);
      }
      header.tables[name] = { mark: marks[name], parts: lens };
    }
    let body = enc.encode(chunks.join(''));
    if (canZip) body = await pipe(body, new (self as any).CompressionStream('gzip'));
    const head = enc.encode(JSON.stringify(header) + '\n');
    const plain = new Uint8Array(head.length + body.length);
    plain.set(head, 0);
    plain.set(body, head.length);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyRaw), plain);
    const now = Date.now();
    await idb('readwrite', (s) => {
      s.put({ id: REC_ID, owner: uid, salt, iv: b64(iv), data });
      s.put({ id: META_ID, owner: uid, salt, savedAt: now, openedAt: now });
    });
    post({ id, type: 'saved', ok: true, bytes: data.byteLength });
  } catch {
    post({ id, type: 'saved', ok: false });
  }
}

async function derive(id: number, uid: string, password: string, salt: string) {
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`${uid}|${salt}`), iterations: PBKDF2_ROUNDS },
      base,
      256
    );
    post({ id, type: 'key', ok: true, key: b64(bits) });
  } catch {
    post({ id, type: 'key', ok: false });
  }
}

function post(m: any) {
  (self as any).postMessage(m);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data || {};
  const fail = () => post({ id: m.id, type: m.op === 'commit' ? 'saved' : m.op === 'derive' ? 'key' : 'done', ok: false });
  try {
    if (m.op === 'derive') derive(m.id, m.uid, m.password, m.salt).catch(fail);
    else if (m.op === 'load') load(m.id, m.key, m.uid, m.salt).catch(fail);
    else if (m.op === 'part') (pending[m.table] = pending[m.table] || []).push(m.rows);
    else if (m.op === 'reset') pending = {};
    else if (m.op === 'commit') commit(m.id, m.key, m.uid, m.salt, m.marks).catch(fail);
  } catch {
    fail();
  }
};
