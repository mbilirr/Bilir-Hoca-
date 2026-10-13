import { useCallback, useState } from 'react';

// ============================================================================
// "Görüldü" kayıtları (Aşama 29)
// Bir listedeki hangi kayıtların öğretmen tarafından görüldüğünü bu tarayıcıda hatırlar.
// Görülmemiş kayıtlar ana sayfada yan-sön (renkli yanıp sönme) ile gösterilir.
// Tarayıcı kaydı kapalıysa yalnızca açık oturum boyunca hatırlanır.
// ============================================================================

export function useSeenIds(storageKey: string, limit = 400) {
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      return new Set<string>();
    }
  });

  const markSeen = useCallback(
    (ids: string[]) =>
      setSeen((prev) => {
        if (ids.every((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        const arr = Array.from(next).slice(-limit);
        try {
          localStorage.setItem(storageKey, JSON.stringify(arr));
        } catch {
          /* tarayıcı kaydı kapalıysa yalnızca bu oturumda hatırlanır */
        }
        return new Set(arr);
      }),
    [storageKey, limit]
  );

  return [seen, markSeen] as const;
}
