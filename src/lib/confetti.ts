// Aşama 103: kutlama efekti (canvas-confetti) ana dosyada taşınmaz; ilk kullanıldığında indirilir
import type { Options } from 'canvas-confetti';

let mod: Promise<any> | null = null;

export default function confetti(options?: Options): void {
  const p = mod || (mod = import('canvas-confetti'));
  p.then((m) => (m.default || m)(options)).catch(() => {
    mod = null; // efekt gösterilemedi: işleyişi etkilemez
  });
}
