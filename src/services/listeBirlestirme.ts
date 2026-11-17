// ============================================================================
// Aşama 318: VERİ SERVİSİNİ AYIRMA, 7. PARÇA — LİSTE BİRLEŞTİRME
// Buluttan / anlık kanaldan gelen kayıtların ekrandaki listeyle birleştirilmesi: aynı veriyi yeniden kullanma (Aşama 84),
// zamana göre sıralama (Aşama 88), anlık olay toplu işleme, artımlı eşitleme, etüt yoklaması birleştirme, başarısız yazmada
// yalnız dokunulan kaydı geri alma (Aşama 286). Hiçbiri uygulamanın o anki durumuna bakmaz.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi, "this." / "DataService." çağrıları
// doğrudan çağrı oldu); davranış aynı.
// ============================================================================
import type { StudentQuestionLog, EtutStudentAttendance } from '../types';

export function sameData(a: any, b: any, depth = 0): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return typeof a === 'number' && typeof b === 'number' && a !== a && b !== b; // NaN
  }
  if (depth > 8) return false; // çok derin: değişmiş say (güvenli taraf)
  const aa = Array.isArray(a);
  if (aa !== Array.isArray(b)) return false;
  if (aa) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameData(a[i], b[i], depth + 1)) return false;
    return true;
  }
  // Yalnızca düz nesneler karşılaştırılır (Date, Map gibi özel nesneler: değişmiş say — güvenli taraf)
  const pa = Object.getPrototypeOf(a);
  if ((pa !== Object.prototype && pa !== null) || Object.getPrototypeOf(b) !== pa) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !sameData(a[k], b[k], depth + 1)) return false;
  }
  return true;
}
/** Yeni listede öncekiyle aynı olan kayıtları eski nesneleriyle değiştirir; hiçbir şey değişmediyse eski listeyi döndürür */
export function adoptList<T>(prev: T[] | null | undefined, next: T[]): T[] {
  if (!prev || prev === next) return next;
  const byId = new Map<unknown, T>();
  for (const p of prev) {
    const id = p && typeof p === 'object' ? (p as any).id : undefined;
    if (id !== undefined && id !== null) byId.set(id, p);
  }
  let allSame = prev.length === next.length;
  const out = new Array<T>(next.length);
  for (let i = 0; i < next.length; i++) {
    const n = next[i];
    const id = n && typeof n === 'object' ? (n as any).id : undefined;
    const p = id !== undefined && id !== null ? byId.get(id) : prev[i];
    if (p !== undefined && sameData(p, n)) {
      out[i] = p;
      if (allSame && prev[i] !== p) allSame = false;
    } else {
      out[i] = n;
      allSame = false;
    }
  }
  return allSame ? prev : out;
}

// ============================================================================
// HIZ (Aşama 88): büyük listelerde zamana göre sıralama. Eskiden karşılaştırmanın her adımında tarih metni
// yeniden çözülüyordu (40.000 mesajda ~1,2 milyon tarih çözümü). Artık her kayıt için bir kez çözülür ve
// kayıt nesnesi değişmedikçe hatırlanır. Sıralama sonucu eskisiyle birebir aynıdır (kararlı sıralama).
// ============================================================================
export const timeKeyCache = new WeakMap<object, { s: string; t: number }>();
export function timeKeyOf(o: object, iso: string | undefined | null): number {
  const s = iso || '';
  const c = timeKeyCache.get(o);
  if (c && c.s === s) return c.t;
  const p = Date.parse(s);
  const t = Number.isNaN(p) ? 0 : p;
  timeKeyCache.set(o, { s, t });
  return t;
}
/** En yeni üstte; eşit zamanlıların sırası korunur */
export function sortByTimeDesc<T extends object>(list: T[], get: (x: T) => string | undefined | null): T[] {
  const keyed = list.map((x, i) => ({ x, i, t: timeKeyOf(x, get(x)) }));
  keyed.sort((a, b) => b.t - a.t || a.i - b.i);
  return keyed.map((k) => k.x);
}

/**
 * Aşama 286: başarısız yazmada yalnız o işlemin dokunduğu kayıtları eski hâline döndürür.
 *  simdi   : hata anındaki liste (yazma sürerken canlı kanaldan gelenler dahil)
 *  once    : işlem öncesi liste
 *  yazarken: yerel değişiklik uygulanmış liste (yazma başlarken)
 * Dokunulan kayıt = once ile yazarken arasında eklenen, silinen ya da içeriği değişen. Diğer kayıtlar `simdi`deki
 * güncel hâliyle kalır. Kimliği olmayan kayıt varsa null döner (çağıran eski davranışı korur).
 */
export function geriAlYalnizDokunulan<T extends { id?: string }>(simdi: T[], once: T[], yazarken: T[] | undefined): T[] | null {
  if (!Array.isArray(yazarken)) return null;
  const kimlikli = (l: T[]) => l.every((x) => x && typeof x.id === 'string' && x.id);
  if (!kimlikli(simdi) || !kimlikli(once) || !kimlikli(yazarken)) return null;
  const onceMap = new Map(once.map((x, i) => [x.id as string, { x, i }] as const));
  const yazMap = new Map(yazarken.map((x) => [x.id as string, x] as const));
  const ayni = (a: T, b: T) => {
    if (a === b) return true;
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  };
  const dokunulan = new Set<string>();
  onceMap.forEach(({ x }, id) => {
    const y = yazMap.get(id);
    if (!y || !ayni(x, y)) dokunulan.add(id); // silinmiş ya da değiştirilmiş
  });
  yazMap.forEach((_y, id) => { if (!onceMap.has(id)) dokunulan.add(id); }); // eklenmiş
  if (dokunulan.size === 0) return simdi;
  const sonuc: T[] = [];
  const var_ = new Set<string>();
  for (const x of simdi) {
    const id = x.id as string;
    if (!dokunulan.has(id)) { sonuc.push(x); var_.add(id); continue; }
    const eski = onceMap.get(id);
    if (eski) { sonuc.push(eski.x); var_.add(id); } // değiştirilmişti: eski hâli, aynı yerde
    // eklenmişti: atılır
  }
  // silinmişti (şimdi listede yok): işlem öncesindeki sırasına yakın yere geri konur
  const geriGelen = Array.from(dokunulan)
    .map((id) => onceMap.get(id))
    .filter((e): e is { x: T; i: number } => !!e && !var_.has(e.x.id as string))
    .sort((a, b) => a.i - b.i);
  for (const e of geriGelen) sonuc.splice(Math.min(e.i, sonuc.length), 0, e.x);
  return sonuc;
}

/**
 * Biriken olayları sırayla uygular (ekleme / güncelleme / silme). Eski davranışla aynı sonuç: güncellenen kayıt
 * yerinde kalır, yeni kayıt başa eklenir, sonra liste zamana göre (en yeni üstte) sıralanır.
 * Hiçbir şey değişmediyse null döner.
 */
export function applyRealtimeBatch<T extends { id: string }>(
  list: T[],
  payloads: any[],
  build: (row: any) => T,
  timeOf: (x: T) => string | undefined,
  tag: string
): T[] | null {
  const cur = new Map<string, T>();
  for (const x of list) cur.set(x.id, x);
  const fresh: string[] = [];
  let changed = false;
  let anyUpsert = false;
  for (const p of payloads) {
    try {
      if (p?.eventType === 'DELETE') {
        const id = p.old?.id;
        if (id && cur.delete(id)) changed = true;
        continue;
      }
      const row = p?.new;
      if (!row || !row.id) continue;
      const item = build(row);
      const prev = cur.get(row.id);
      if (prev !== undefined && sameData(prev, item)) continue; // aynısı zaten ekranda
      if (prev === undefined) fresh.push(row.id);
      cur.set(row.id, item);
      changed = true;
      anyUpsert = true;
    } catch (e) {
      console.warn(`[${tag}] Error:`, e);
    }
  }
  if (!changed) return null;
  const freshSet = new Set(fresh);
  const out: T[] = [];
  const seen = new Set<string>();
  for (let i = fresh.length - 1; i >= 0; i--) {
    const id = fresh[i];
    const x = cur.get(id);
    if (x !== undefined && !seen.has(id)) {
      seen.add(id);
      out.push(x);
    }
  }
  for (const x of list) {
    if (freshSet.has(x.id)) continue;
    const y = cur.get(x.id);
    if (y !== undefined) out.push(y);
  }
  // yalnız silme olduysa sıra zaten doğrudur
  return anyUpsert ? sortByTimeDesc(out, timeOf) : out;
}

/** Değişen satırları listeye uygular (aynı kalan kayıt eski nesnesiyle kalır). Değişiklik yoksa null. */
export function mergeDelta<T extends { id: string }>(list: T[], rows: T[], removed: Set<string> | null): T[] | null {
  if (!rows.length && !(removed && removed.size)) return null;
  const inc = new Map<string, T>();
  for (const r of rows) inc.set(r.id, r);
  let changed = false;
  const out: T[] = [];
  for (const x of list) {
    if (removed && removed.has(x.id)) {
      changed = true;
      continue;
    }
    const n = inc.get(x.id);
    if (n !== undefined) {
      inc.delete(x.id);
      if (sameData(x, n)) out.push(x);
      else {
        out.push(n);
        changed = true;
      }
    } else out.push(x);
  }
  for (const n of inc.values()) {
    if (removed && removed.has(n.id)) continue;
    out.push(n);
    changed = true;
  }
  return changed ? out : null;
}

export function sortLogsDesc(list: StudentQuestionLog[]): StudentQuestionLog[] {
  return list.sort((a, b) => {
    const x = a.date || a.createdAt || '';
    const y = b.date || b.createdAt || '';
    return x < y ? 1 : x > y ? -1 : 0;
  });
}

// Tam okumadaki sıralamayla aynı: tarih (yeni üstte). Kararlı sıralama: aynı tarihli kayıtların ekrandaki
// mevcut sırası korunur (yeni gelen aynı tarihli kayıt onların altına eklenir).
export function byDateDesc<T extends { date?: string }>(a: T, b: T): number {
  const x = a.date || '';
  const y = b.date || '';
  return x < y ? 1 : x > y ? -1 : 0;
}

/** Aşama 67: kaydın içerik imzası (ders, sayılar, plan payları; JSON anahtar sırasından bağımsız) */
export function questionLogSig(l: StudentQuestionLog): string {
  const entries = (Array.isArray(l.entries) ? l.entries : [])
    .map((e: any) => [
      String(e?.subject || ''),
      Number(e?.questionCount) || 0,
      Number(e?.correctCount) || 0,
      Number(e?.wrongCount) || 0,
      (Array.isArray(e?.planItems) ? e.planItems : [])
        .map((p: any) => `${p?.id}:${Number(p?.count) || 0}`)
        .sort()
        .join(','),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([l.date, entries, String(l.notes || '').trim()]);
}

// Aşama 16: yoklama birleştirme — her öğrenci için en son işaretlenen durum geçerlidir
// (başka cihazdan / e-postadaki yoklama bağlantısından gelen yeni yoklama eskisinin altında kalmaz)
export function mergeAttendance(
  incoming?: Record<string, EtutStudentAttendance>,
  local?: Record<string, EtutStudentAttendance>
): Record<string, EtutStudentAttendance> {
  const out: Record<string, EtutStudentAttendance> = { ...(local || {}) };
  for (const [id, inc] of Object.entries(incoming || {})) {
    const cur = out[id];
    if (!cur) {
      out[id] = inc;
      continue;
    }
    const ti = (inc && (inc.updatedAt || inc.markedAt)) || '';
    const tl = (cur && (cur.updatedAt || cur.markedAt)) || '';
    if (ti >= tl) out[id] = inc;
  }
  return out;
}
