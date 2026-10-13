import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// "Görüldü" kayıtları (Aşama 29, Aşama 32'de eşitleme eklendi)
// Bir listedeki hangi kayıtların öğretmen tarafından görüldüğünü bu tarayıcıda hatırlar.
// Görülmemiş kayıtlar ana sayfada yan-sön (renkli yanıp sönme) ile gösterilir.
// Aynı anahtarı kullanan bütün ekranlar (ör. üst menüdeki Mesajlar sayacı ve Mesajlar sayfası) birlikte güncellenir.
// Tarayıcı kaydı kapalıysa yalnızca açık oturum boyunca hatırlanır.
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

export function useSeenIds(storageKey: string, limit = 400) {
  const [seen, setSeen] = useState<Set<string>>(() => read(storageKey));

  // Anahtar değişince (ör. başka öğretmen) ve başka bir ekran işaretleyince yeniden oku
  useEffect(() => {
    setSeen(read(storageKey));
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === storageKey) setSeen(read(storageKey));
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [storageKey]);

  const markSeen = useCallback(
    (ids: string[]) => {
      const prev = read(storageKey);
      if (ids.every((id) => prev.has(id))) return;
      ids.forEach((id) => prev.add(id));
      const arr = Array.from(prev).slice(-limit);
      memory.set(storageKey, arr);
      try {
        localStorage.setItem(storageKey, JSON.stringify(arr));
      } catch {
        /* tarayıcı kaydı kapalıysa yalnızca bu oturumda hatırlanır */
      }
      setSeen(new Set(arr));
      window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: storageKey }));
    },
    [storageKey, limit]
  );

  return [seen, markSeen] as const;
}
