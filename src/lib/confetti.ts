// Aşama 103: kutlama efekti (canvas-confetti) ana dosyada taşınmaz; ilk kullanıldığında indirilir
import type { Options } from 'canvas-confetti';

let mod: Promise<any> | null = null;

// Aşama 139: cihazda "hareketi azalt" açıksa efekt hiç çalışmaz (dosya da indirilmez)
const reduceMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export default function confetti(options?: Options): void {
  if (reduceMotion()) return;
  const p = mod || (mod = import('canvas-confetti'));
  p.then((m) => (m.default || m)(options)).catch(() => {
    mod = null; // efekt gösterilemedi: işleyişi etkilemez
  });
}
