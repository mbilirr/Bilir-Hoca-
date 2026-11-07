// ============================================================================
// YEREL AVATAR (Aşama 17, 171)
// Eskiden avatarlar api.dicebear.com adresinden çiziliyordu: her resimde öğrencinin adı dış bir
// servise gidiyor, internet yavaşken resimler geç geliyordu. Artık aynı "tohum" (ad) için her zaman
// aynı karikatür yüz tarayıcıda üretilir; dış servise hiçbir istek gitmez.
// Veritabanında kayıtlı eski dicebear adresleri de ekranda otomatik olarak yerel resme çevrilir.
// ============================================================================

import { basHarfResmi } from './profilResmi';

// Aşama 171: karikatür yüz kaldırıldı. Rolü bilinmeyen eski dicebear adresleri baş harf resmine çevrilir
// (ekranların çoğu artık lib/profilResmi.ts ile cinsiyet/role göre çizim gösterir; bu yalnız güvenlik ağı).
export function localAvatarDataUri(seed: string): string {
  return basHarfResmi((seed || '').trim(), null);
}

// Eski dicebear adresi mi? Öyleyse içindeki tohumla yerel resim üretir; değilse adresi aynen döndürür.
export function resolveAvatarUrl(url: string): string {
  if (typeof url !== 'string' || url.indexOf('api.dicebear.com') === -1) return url;
  let seed = '';
  try {
    seed = new URL(url).searchParams.get('seed') || '';
  } catch {
    const m = /[?&]seed=([^&]*)/.exec(url);
    if (m) {
      try {
        seed = decodeURIComponent(m[1].replace(/\+/g, ' '));
      } catch {
        seed = m[1];
      }
    }
  }
  return localAvatarDataUri(seed);
}

let installed = false;

// Tüm <img> etiketlerinde dicebear adreslerini yerel resme çevirir (bileşenleri tek tek değiştirmeden).
export function installAvatarGuard() {
  if (installed || typeof window === 'undefined' || typeof HTMLImageElement === 'undefined') return;
  installed = true;

  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (desc && desc.set && desc.get) {
      const set = desc.set;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(this: HTMLImageElement, value: string) {
          set.call(this, resolveAvatarUrl(value));
        },
      });
    }
  } catch {}

  try {
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (this instanceof HTMLImageElement && typeof name === 'string' && name.toLowerCase() === 'src') {
        return originalSetAttribute.call(this, name, resolveAvatarUrl(String(value)));
      }
      return originalSetAttribute.call(this, name, value);
    };
  } catch {}
}
