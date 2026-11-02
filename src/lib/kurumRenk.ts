// ============================================================================
// Aşama 135: KURUM RENKLERİ — karne başlık şeridi kurumun logosunun renkleriyle
// Logo (data:image/...) tarayıcıda 64×64 küçültülüp renkleri sayılır:
//   koyu   : logonun en koyu rengi (şeridin zemini)          — İsabet'te lacivert
//   vurgu  : en çok kullanılan iki canlı renkten doygun olanı (sıra kutuları) — İsabet'te turuncu
//   vurgu2 : diğeri (çipler ve alt çizgi)                                    — İsabet'te yeşil
// Vurgular canlı olsun diye doygunluk yükseltilir. Şerit KOYU renkle DEĞİL, canlı renklerle çizilir
// (Mustafa: "şerit mavi mor olmasın") — bkz. seritRenk. Logo yoksa ya da renksizse null döner
// ve karne eskisi gibi mavi çizilir. Sonuç logo başına bir kez hesaplanır (önbellek).
// ============================================================================
export type RGB = [number, number, number];
export interface KurumRenk {
  koyu: RGB;
  koyuAcik: RGB;
  vurgu: RGB;
  vurgu2: RGB;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** RGBA piksellerinden kurum renkleri (saf işlev; tarayıcı dışında da sınanabilir) */
export function renkleriSec(px: ArrayLike<number>): KurumRenk | null {
  type Kova = { n: number; h: number; s: number; l: number };
  const kovalar = new Map<number, Kova>();
  let renkli = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    if (s < 0.25 || l > 0.92 || l < 0.06) continue; // beyaz, gri, siyah sayılmaz
    renkli++;
    const k = Math.floor(h / 30) % 12;
    const kv = kovalar.get(k) || { n: 0, h: 0, s: 0, l: 0 };
    kv.n++;
    kv.h += h;
    kv.s += s;
    kv.l += l;
    kovalar.set(k, kv);
  }
  if (renkli < 20) return null;
  const list = [...kovalar.values()]
    .filter((k) => k.n >= renkli * 0.03)
    .map((k) => ({ n: k.n, h: k.h / k.n, s: k.s / k.n, l: k.l / k.n }))
    .sort((a, b) => b.n - a.n);
  if (!list.length) return null;
  // koyu: en koyu kova (yeterince koyuysa); değilse en çok kullanılan rengin koyu tonu
  const enKoyu = list.slice().sort((a, b) => a.l - b.l)[0];
  const koyuKaynak = enKoyu.l < 0.4 ? enKoyu : list[0];
  const koyuHsl: [number, number, number] = [koyuKaynak.h, clamp(Math.max(koyuKaynak.s, 0.45), 0, 0.8), clamp(koyuKaynak.l, 0.18, 0.28)];
  // en çok kullanılan iki canlı renk; doygunluğu yüksek olan ana vurgu olur (İsabet: turuncu, sonra yeşil)
  const vurgular = list.filter((k) => k !== koyuKaynak).slice(0, 2).sort((a, b) => b.s - a.s);
  const canli = (k: { h: number; s: number; l: number }) => hslToRgb(k.h, clamp(Math.max(k.s, 0.8), 0, 1), clamp(k.l, 0.42, 0.5));
  const v1 = vurgular[0] ? canli(vurgular[0]) : hslToRgb((koyuHsl[0] + 180) % 360, 0.9, 0.52);
  const v2 = vurgular[1] ? canli(vurgular[1]) : v1;
  return {
    koyu: hslToRgb(koyuHsl[0], koyuHsl[1], koyuHsl[2]),
    koyuAcik: hslToRgb(koyuHsl[0], koyuHsl[1], clamp(koyuHsl[2] + 0.1, 0, 0.4)),
    vurgu: v1,
    vurgu2: v2,
  };
}

/** Karne başlık şeridinin renkleri: zemin = logonun ana canlı rengi (İsabet'te turuncu),
 *  kutular ve alt çizgi = ikinci canlı renk (İsabet'te yeşil). Beyaz yazı okunsun diye tonlar biraz koyulaştırılır. */
export interface SeritRenk {
  zemin: RGB;
  zemin2: RGB;
  cip: RGB;
  kutu: RGB;
  cizgi: RGB;
}
export function seritRenk(r: KurumRenk): SeritRenk {
  const ton = (c: RGB, s: number, l: number) => {
    const [h, ss] = rgbToHsl(c[0], c[1], c[2]);
    return hslToRgb(h, clamp(Math.max(ss, s), 0, 1), l);
  };
  return {
    zemin: ton(r.vurgu, 0.85, 0.47),
    zemin2: ton(r.vurgu, 0.9, 0.53),
    cip: ton(r.vurgu, 0.85, 0.4),
    kutu: ton(r.vurgu2, 0.7, 0.32),
    cizgi: r.vurgu2,
  };
}

const ONBELLEK = new Map<string, KurumRenk | null>();

/** Önceden hesaplanmış sonuç (hesaplanmadıysa undefined) */
export function kurumRenkOnbellek(logo: string): KurumRenk | null | undefined {
  return logo ? ONBELLEK.get(logo) : null;
}
/** Sınama ve dışarıdan hesaplanmış renk için */
export function kurumRenkKaydet(logo: string, renk: KurumRenk | null): void {
  if (logo) ONBELLEK.set(logo, renk);
}

/** Logonun renkleri (tarayıcıda bir kez hesaplanır). Logo yoksa ya da okunamazsa null. */
export async function kurumRenkHazirla(logo: string): Promise<KurumRenk | null> {
  if (!logo) return null;
  const hazir = ONBELLEK.get(logo);
  if (hazir !== undefined) return hazir;
  let renk: KurumRenk | null = null;
  try {
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      const img = new Image();
      img.src = logo;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, 64, 64);
        renk = renkleriSec(ctx.getImageData(0, 0, 64, 64).data);
      }
    }
  } catch {
    renk = null;
  }
  ONBELLEK.set(logo, renk);
  return renk;
}
