import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

// ============================================================================
// "Görüldü" kayıtları (Aşama 29, Aşama 32'de eşitleme, Aşama 42'de CİHAZLAR ARASI eşitleme)
// Bir listedeki hangi kayıtların görüldüğünü hatırlar (ana sayfa yan-sön uyarıları, Etüt Notları,
// yoklama uyarıları …). Aynı anahtarı kullanan bütün ekranlar birlikte güncellenir.
//
// Aşama 42: kayıtlar ayrıca veritabanındaki kişiye özel "user_seen" tablosuna yazılır ve oradan okunur;
// bilgisayarda görülen kayıt telefonda da görülmüş sayılır (33 numaralı SQL).
// Tablo yoksa (SQL çalıştırılmadıysa) ya da bağlantı yoksa eskisi gibi yalnızca bu tarayıcıda hatırlanır.
// ============================================================================

const EVENT = 'seen-ids-changed';
const memory = new Map<string, string[]>(); // tarayıcı kaydı kapalıysa ortak bellek

function read(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {
    /* tarayıcı kaydı kapalı */
  }
  return new Set<string>(memory.get(storageKey) || []);
}

function write(storageKey: string, ids: Set<string>, limit: number): string[] {
  const arr = Array.from(ids).slice(-limit);
  memory.set(storageKey, arr);
  try {
    localStorage.setItem(storageKey, JSON.stringify(arr));
  } catch {
    /* tarayıcı kaydı kapalıysa yalnızca bu oturumda hatırlanır */
  }
  return arr;
}

// ----------------------------------------------------------------------------- Bulut eşitlemesi
let cloudDisabled = false; // tablo yoksa bu oturumda bir daha denenmez
const lastPull = new Map<string, number>();
const pulling = new Map<string, Promise<void>>();
const PULL_EVERY_MS = 30000;

async function hasSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

const isMissingTable = (err: any) => /user_seen|does not exist|schema cache|42P01|PGRST205/i.test(`${err?.code || ''} ${err?.message || ''}`);

/** Buluttaki "görüldü" kayıtlarını yerel listeye ekler (birleştirir; hiçbir şey silinmez) */
function pullFromCloud(storageKey: string, limit: number, force = false): Promise<void> {
  if (cloudDisabled) return Promise.resolve();
  const now = Date.now();
  if (!force && now - (lastPull.get(storageKey) || 0) < PULL_EVERY_MS) return Promise.resolve();
  const running = pulling.get(storageKey);
  if (running) return running;
  lastPull.set(storageKey, now);
  const job = (async () => {
    try {
      if (!(await hasSession())) return;
      const { data, error } = await supabase
        .from('user_seen')
        .select('item_id')
        .eq('scope', storageKey)
        .order('seen_at', { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingTable(error)) cloudDisabled = true;
        return;
      }
      if (!Array.isArray(data) || !data.length) return;
      const local = read(storageKey);
      let added = false;
      for (const row of data as Array<{ item_id: string }>) {
        if (row && row.item_id && !local.has(row.item_id)) {
          local.add(row.item_id);
          added = true;
        }
      }
      if (added) {
        write(storageKey, local, limit);
        window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: storageKey }));
      }
    } catch {
      /* ağ hatası: yerel kayıtla devam */
    } finally {
      pulling.delete(storageKey);
    }
  })();
  pulling.set(storageKey, job);
  return job;
}

/** Yeni görülen kayıtları buluta yazar (hata kullanıcıya gösterilmez) */
async function pushToCloud(storageKey: string, ids: string[]): Promise<void> {
  if (cloudDisabled || !ids.length) return;
  try {
    if (!(await hasSession())) return;
    const rows = ids.slice(0, 500).map((item_id) => ({ scope: storageKey, item_id: String(item_id).slice(0, 300) }));
    const { error } = await supabase.from('user_seen').upsert(rows, { onConflict: 'user_id,scope,item_id', ignoreDuplicates: true });
    if (error && isMissingTable(error)) cloudDisabled = true;
  } catch {
    /* sessizce geç */
  }
}

export function useSeenIds(storageKey: string, limit = 400) {
  const [seen, setSeen] = useState<Set<string>>(() => read(storageKey));

  // Anahtar değişince (ör. başka öğretmen) ve başka bir ekran işaretleyince yeniden oku
  useEffect(() => {
    setSeen(read(storageKey));
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === storageKey) setSeen(read(storageKey));
    };
    window.addEventListener(EVENT, onChange);
    // Aşama 42: açılışta ve sayfaya her dönüşte diğer cihazlarda görülenler alınır
    void pullFromCloud(storageKey, limit);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullFromCloud(storageKey, limit, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.removeEventListener(EVENT, onChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [storageKey, limit]);

  const markSeen = useCallback(
    (ids: string[]) => {
      const prev = read(storageKey);
      const fresh = ids.filter((id) => !!id && !prev.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => prev.add(id));
      const arr = write(storageKey, prev, limit);
      setSeen(new Set(arr));
      window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: storageKey }));
      void pushToCloud(storageKey, fresh);
    },
    [storageKey, limit]
  );

  return [seen, markSeen] as const;
}
