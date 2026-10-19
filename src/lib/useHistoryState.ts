import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Aşama 52: SAYFA İÇİ GEZİNMEYİ TARAYICI GEÇMİŞİNE YAZAN ORTAK KANCA
//
// Sorun: bir bölümün içindeki sekme / alt sayfa / ayrıntı ekranı geçişleri (ör. Ödevler › Haftalık Plan,
// Deneme Analizi › Karneler, bir denemenin sonuçları, Soru Takibi › öğrenci) geçmişe yazılmadığı için
// tarayıcının ya da telefonun "Geri" tuşu bir önceki ekrana değil, bir önceki BÖLÜME (çoğu zaman ana sayfaya) dönüyordu.
//
// Çözüm: bu kanca useState gibi çalışır; değer kullanıcı tarafından değiştirildiğinde adres AYNI kalır ama
// geçmişe yeni bir kayıt eklenir ve değer o kaydın içinde (history.state.__ui[anahtar]) saklanır.
// "Geri" basılınca tarayıcı önceki kayda döner, kanca değeri oradan geri yükler. Bölüm yeniden açılırsa
// (ör. başka bölüme gidip geri gelince) son değer yine geçmiş kaydından okunur.
//
//  * Aynı olay içinde birden çok değer değişirse (ör. sınıf + öğrenci birlikte) TEK geçmiş kaydı oluşur.
//  * Değerler JSON'a çevrilebilir olmalıdır (metin, sayı, küçük nesne).
//  * Anahtarlar sitede benzersiz olmalıdır ("hw.tab", "deneme.view" gibi).
// ============================================================================

type UiMap = Record<string, unknown>;

const readUi = (): UiMap => {
  try {
    const s = window.history.state as { __ui?: UiMap } | null;
    return s && typeof s === 'object' && s.__ui && typeof s.__ui === 'object' ? s.__ui : {};
  } catch {
    return {};
  }
};

/** Bu geçmiş kaydında anahtar için değer yazılmış mı (yani bu görünüme sayfa içinden ileri gelinmiş mi) */
export const hasHistoryValue = (key: string): boolean => key in readUi();

let batchOpen = false;

function writeUi(key: string, value: unknown, replace: boolean) {
  try {
    const cur = window.history.state;
    const base = cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : {};
    const next = { ...base, __ui: { ...readUi(), [key]: value } };
    if (replace || batchOpen) {
      window.history.replaceState(next, '', window.location.href);
    } else {
      window.history.pushState(next, '', window.location.href);
      batchOpen = true;
      const close = () => {
        batchOpen = false;
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(close);
      else Promise.resolve().then(close);
    }
  } catch {
    /* geçmiş yazılamazsa (çok eski tarayıcı) yalnızca ekrandaki değer değişir */
  }
}

const same = (a: unknown, b: unknown) => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export interface HistorySetOptions {
  /** true: yeni geçmiş kaydı açma, mevcut kaydı güncelle (otomatik düzeltmeler için) */
  replace?: boolean;
}

export function useHistoryState<T>(
  key: string,
  initial: T | (() => T)
): [T, (next: T | ((prev: T) => T), opts?: HistorySetOptions) => void] {
  const initialRef = useRef<() => T>(typeof initial === 'function' ? (initial as () => T) : () => initial as T);
  const [value, setValue] = useState<T>(() => {
    const ui = readUi();
    return key in ui ? (ui[key] as T) : initialRef.current();
  });
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const onPop = () => {
      const ui = readUi();
      const v = key in ui ? (ui[key] as T) : initialRef.current();
      if (!same(v, valueRef.current)) setValue(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T), opts?: HistorySetOptions) => {
      const v = typeof next === 'function' ? (next as (p: T) => T)(valueRef.current) : next;
      if (same(v, valueRef.current)) return;
      valueRef.current = v;
      writeUi(key, v, !!opts?.replace);
      setValue(v);
    },
    [key]
  );

  return [value, set];
}
