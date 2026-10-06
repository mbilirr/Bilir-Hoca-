// ============================================================================
// YEREL AVATAR (Aşama 17)
// Eskiden avatarlar api.dicebear.com adresinden çiziliyordu: her resimde öğrencinin adı dış bir
// servise gidiyor, internet yavaşken resimler geç geliyordu. Artık aynı "tohum" (ad) için her zaman
// aynı karikatür yüz tarayıcıda üretilir; dış servise hiçbir istek gitmez.
// Veritabanında kayıtlı eski dicebear adresleri de ekranda otomatik olarak yerel resme çevrilir.
// ============================================================================

const BG = ['#c7d2fe', '#bae6fd', '#bbf7d0', '#fde68a', '#fecaca', '#fbcfe8', '#ddd6fe', '#a5f3fc', '#fed7aa', '#d9f99d'];
const SKIN = ['#f8d5b8', '#f1c27d', '#e0ac69', '#c68642', '#ffdbac', '#eac4a0'];
const HAIR = ['#2d1b0e', '#4a2c17', '#8d5524', '#b5651d', '#e6be8a', '#1f2937', '#7c2d12', '#a16207'];
const SHIRT = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#2563eb'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cache = new Map<string, string>();

// Verilen ad/tohum için her seferinde aynı olan bir karikatür yüz (SVG data adresi)
export function localAvatarDataUri(seed: string): string {
  const key = (seed || 'avatar').trim() || 'avatar';
  const hit = cache.get(key);
  if (hit) return hit;

  const h = hash(key);
  const pick = <T,>(arr: T[], shift: number) => arr[(h >>> shift) % arr.length];
  const bg = pick(BG, 0);
  const skin = pick(SKIN, 4);
  const hair = pick(HAIR, 8);
  const shirt = pick(SHIRT, 12);
  const hairStyle = (h >>> 16) % 4;
  const mouthStyle = (h >>> 19) % 3;
  const eyeStyle = (h >>> 22) % 2;
  const cheeks = ((h >>> 25) & 1) === 1;

  const hairPath = [
    // kısa saç
    `<path d="M26 44c0-16 10-26 24-26s24 10 24 26c-4-8-12-12-24-12s-20 4-24 12z" fill="${hair}"/>`,
    // yana taranmış
    `<path d="M24 46c0-18 11-28 27-28 14 0 24 9 25 24-10-1-22-6-30-14-4 8-12 14-22 18z" fill="${hair}"/>`,
    // uzun saç
    `<path d="M22 70V46c0-17 12-28 28-28s28 11 28 28v24c-3 0-6-2-6-6V48c-6-6-14-10-22-10s-16 4-22 10v16c0 4-3 6-6 6z" fill="${hair}"/>`,
    // kıvırcık
    `<g fill="${hair}"><circle cx="32" cy="36" r="9"/><circle cx="44" cy="28" r="10"/><circle cx="57" cy="28" r="10"/><circle cx="68" cy="36" r="9"/><circle cx="27" cy="46" r="6"/><circle cx="73" cy="46" r="6"/></g>`,
  ][hairStyle];

  const eyes =
    eyeStyle === 0
      ? `<circle cx="41" cy="52" r="3.2" fill="#1f2937"/><circle cx="59" cy="52" r="3.2" fill="#1f2937"/><circle cx="42" cy="51" r="1" fill="#fff"/><circle cx="60" cy="51" r="1" fill="#fff"/>`
      : `<path d="M37 52q4-4 8 0M55 52q4-4 8 0" stroke="#1f2937" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;

  const mouth = [
    `<path d="M43 63q7 7 14 0" stroke="#7f1d1d" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M42 62q8 10 16 0z" fill="#7f1d1d"/><path d="M45 63h10" stroke="#fff" stroke-width="2"/>`,
    `<path d="M44 64h12" stroke="#7f1d1d" stroke-width="2.6" stroke-linecap="round"/>`,
  ][mouthStyle];

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    `<path d="M18 100c2-18 15-26 32-26s30 8 32 26z" fill="${shirt}"/>` +
    `<rect x="44" y="66" width="12" height="12" rx="4" fill="${skin}"/>` +
    `<ellipse cx="50" cy="52" rx="22" ry="24" fill="${skin}"/>` +
    hairPath +
    eyes +
    (cheeks ? `<circle cx="36" cy="60" r="3.5" fill="#f87171" opacity=".35"/><circle cx="64" cy="60" r="3.5" fill="#f87171" opacity=".35"/>` : '') +
    mouth +
    `</svg>`;

  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (cache.size > 2000) cache.clear();
  cache.set(key, uri);
  return uri;
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
