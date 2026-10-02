import { useEffect, useRef } from 'react';

// Hızlı arama (Ctrl+K) ile seçilen kaydı ilgili ekrana iletir.
// Örn. öğrenci seçilince "Öğrenciler" sayfası açılır ve o sayfa açılışta
// consumeQuickFocus('student') ile seçilen öğrenciyi alıp listeyi süzer.
// 'action': ana sayfadaki kısayollar (ör. id = 'homework-create' -> Ödev oluşturma penceresini aç)
export type QuickFocusType = 'student' | 'class' | 'homework' | 'etut' | 'action';

export interface QuickFocus {
  type: QuickFocusType;
  id: string;
  label: string; // aramada gösterilen ad (ör. öğrenci adı)
  at: number;
}

let pending: QuickFocus | null = null;

export const QUICK_FOCUS_EVENT = 'app-quick-focus';

export function setQuickFocus(type: QuickFocusType, id: string, label: string): void {
  pending = { type, id, label, at: Date.now() };
  // Sayfa zaten açıksa anında haber ver
  window.dispatchEvent(new CustomEvent(QUICK_FOCUS_EVENT, { detail: pending }));
}

// Bekleyen seçimi bir kez okur (10 saniyeden eskiyse yok sayar)
export function consumeQuickFocus(type: QuickFocusType): QuickFocus | null {
  if (!pending || pending.type !== type || Date.now() - pending.at > 10000) return null;
  const p = pending;
  pending = null;
  return p;
}

// Bir ekranda kullanılır: açılışta bekleyen seçimi alır, açıkken gelen yeni seçimleri de dinler
export function useQuickFocus(types: QuickFocusType[], handler: (f: QuickFocus) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  const key = types.join(',');
  useEffect(() => {
    const list = key.split(',') as QuickFocusType[];
    for (const t of list) {
      const p = consumeQuickFocus(t);
      if (p) {
        ref.current(p);
        break;
      }
    }
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<QuickFocus>).detail;
      if (d && list.includes(d.type)) {
        consumeQuickFocus(d.type);
        ref.current(d);
      }
    };
    window.addEventListener(QUICK_FOCUS_EVENT, onEvt);
    return () => window.removeEventListener(QUICK_FOCUS_EVENT, onEvt);
  }, [key]);
}
