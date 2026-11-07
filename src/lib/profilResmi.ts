// ============================================================================
// AŞAMA 171 — PROFİL RESMİ (tek kaynak)
// Ekranlarda kişinin resmi buradan alınır:
//   1) Kişinin yüklediği fotoğraf ya da seçtiği yeni çizim (/av/…svg) varsa o,
//   2) yoksa (ya da eski emoji / karikatür / hazır fotoğrafsa) cinsiyete ve role göre otomatik çizim,
//   3) cinsiyet boşsa baş harfler + rol rozeti.
// Çizimler public/av/ altında küçük statik SVG'lerdir (~2,5 KB, tarayıcı önbelleğinde kalır);
// veritabanına yalnız kısa yol yazılır. Baş harf resmi bellekte bir kez üretilir.
// ============================================================================

export type Cinsiyet = 'K' | 'E';
export type ProfilRol = 'student' | 'teacher' | 'mudur' | 'mudur_yardimcisi' | 'rehberlik' | 'admin';

export interface ProfilKisi {
  id?: string;
  name?: string;
  avatar?: string | null;
  gender?: Cinsiyet | null;
}

const AV = '/av/';
const seri = (on: string, n = 6) => Array.from({ length: n }, (_, i) => `${AV}${on}${i + 1}.svg`);

/** Seçim penceresindeki çizimler: öğrenci 6+6; öğretmen 6+6 ve yalnız KENDİ unvanının çizimi
 *  (rozet gerçek yetkiyi gösterir — öğretmen "Müdür" yıldızlı çizimi seçemez) */
export function cizimSecenekleri(kind: 'student' | 'teacher', rol: ProfilRol, g: Cinsiyet | 'all'): string[] {
  const gs: Cinsiyet[] = g === 'all' ? ['K', 'E'] : [g];
  const out: string[] = [];
  for (const x of gs) {
    const k = x.toLowerCase();
    if (kind === 'student') {
      out.push(...seri(`ogr-${k}`));
      continue;
    }
    if (rol !== 'student' && rol !== 'teacher') out.push(`${AV}${ROL_CIZIM[rol]}-${k}.svg`);
    out.push(...seri(`ogt-${k}`));
  }
  return out;
}

const ROL_CIZIM: Record<Exclude<ProfilRol, 'student' | 'teacher'>, string> = {
  mudur: 'mudur',
  mudur_yardimcisi: 'mudur-yrd',
  rehberlik: 'rehber',
  admin: 'yonetici',
};

/** Kişinin kendi seçtiği resim mi? (eski emoji, karikatür, hazır stok fotoğraf sayılmaz) */
export function kendiResmiMi(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith(AV)) return true;
  if (url.startsWith('data:image/svg+xml')) return !/Emoji/i.test(url); // Aşama 171: eski emoji resimleri kalktı
  if (url.startsWith('data:image/')) return true; // yüklenen fotoğraf (sıkıştırılmış)
  if (/^https?:\/\//i.test(url)) return !/api\.dicebear\.com|images\.unsplash\.com/i.test(url);
  return false; // düz emoji metni vb.
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Öğretmenin resim rolü: unvan (varsa) > branş (Rehberlik, Müdür…) > kurum yöneticisi > öğretmen */
export function ogretmenProfilRol(t: { branch?: string | null; isAdmin?: boolean }, unvanlar?: readonly string[]): ProfilRol {
  const r = unvanlar || [];
  if (r.includes('mudur')) return 'mudur';
  if (r.includes('mudur_yardimcisi')) return 'mudur_yardimcisi';
  if (r.includes('rehberlik')) return 'rehberlik';
  const b = (t.branch || '').toLocaleLowerCase('tr-TR');
  if (/müdür\s*y|müdür yrd/.test(b)) return 'mudur_yardimcisi';
  if (/müdür/.test(b)) return 'mudur';
  if (/rehber/.test(b)) return 'rehberlik';
  if (t.isAdmin || /kurum yönetici/.test(b)) return 'admin';
  return 'teacher';
}

// ----------------------------------------------------------------------------- baş harf resmi
const ROZET: Record<ProfilRol, string> = {
  student: '<path d="M-9-2l9-4.5 9 4.5-9 4.5z" fill="#fff"/><path d="M-5 .5v4c3 2 7 2 10 0v-4" fill="none" stroke="#fff" stroke-width="1.8"/>',
  teacher: '<path d="M-7-5v11c3-1.5 5-1.5 7 0 2-1.5 4-1.5 7 0v-11c-3-1.5-5-1.5-7 0-2-1.5-4-1.5-7 0zM0-5v11" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>',
  mudur: '<path d="M0-8l2.4 5 5.4.7-4 3.7 1 5.4L0 4.2-4.8 6.8l1-5.4-4-3.7 5.4-.7z" fill="#fff"/>',
  mudur_yardimcisi: '<path d="M0-8l7 2.6V-1c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9v-4.4z" fill="#fff"/>',
  rehberlik: '<path d="M0 6.5C-6-.5-8-3-6-5.8c1.8-2.3 4.6-1.8 6 .5 1.4-2.3 4.2-2.8 6-.5 2 2.8 0 5.3-6 12.3z" fill="#fff"/>',
  admin: '<circle r="3" fill="none" stroke="#fff" stroke-width="2"/><path d="M0-7.6v2.4M0 5.2v2.4M-7.6 0h2.4M5.2 0h2.4M-5.4-5.4l1.7 1.7M3.7 3.7l1.7 1.7M-5.4 5.4l1.7-1.7M3.7-3.7l1.7-1.7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
};
const ZEMIN: Record<ProfilRol, [string, string]> = {
  student: ['#2a8a74', '#145244'],
  teacher: ['#1f6f5c', '#0f3d33'],
  mudur: ['#2a4a42', '#0f201c'],
  mudur_yardimcisi: ['#2a4a42', '#0f201c'],
  rehberlik: ['#3a9c84', '#1b5a4c'],
  admin: ['#1f6f5c', '#0b2e27'],
};

export function basHarfler(name?: string): string {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  const s = p.length > 1 ? (p[0][0] || '') + (p[p.length - 1][0] || '') : (p[0] || '?').slice(0, 2);
  return s.toLocaleUpperCase('tr-TR') || '?';
}

const harfCache = new Map<string, string>();
/** rol = null: rozetsiz (rolü bilinmeyen eski adresler için) */
export function basHarfResmi(name: string | undefined, rol: ProfilRol | null): string {
  const ini = basHarfler(name);
  const key = `${rol}|${ini}`;
  const hit = harfCache.get(key);
  if (hit) return hit;
  const [a, b] = ZEMIN[rol || 'teacher'];
  const esc = ini.replace(/[<>&"]/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<defs><radialGradient id="z" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>` +
    `<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8B57A"/><stop offset="1" stop-color="#B87333"/></linearGradient></defs>` +
    `<rect width="120" height="120" fill="url(#z)"/>` +
    `<text x="60" y="61" text-anchor="middle" dominant-baseline="central" font-family="Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${esc.length > 1 ? 42 : 50}" font-weight="700" fill="#ECFDF5" letter-spacing="1">${esc}</text>` +
    (rol
      ? `<g transform="translate(87 88)"><circle r="14" fill="#0f3d33"/><circle r="12.2" fill="url(#r)"/><g transform="scale(.9)">${ROZET[rol]}</g></g>`
      : '') +
    `</svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (harfCache.size > 500) harfCache.clear();
  harfCache.set(key, uri);
  return uri;
}

/** Otomatik çizim (kendi resmi yoksa): cinsiyet + rol; aynı kişide hep aynı resim */
export function otomatikResim(k: ProfilKisi, rol: ProfilRol): string {
  const g = k.gender === 'K' || k.gender === 'E' ? k.gender : null;
  if (!g) return basHarfResmi(k.name, rol);
  if (rol !== 'student' && rol !== 'teacher') return `${AV}${ROL_CIZIM[rol]}-${g.toLowerCase()}.svg`;
  const n = (hash(k.id || k.name || '') % 6) + 1;
  return `${AV}${rol === 'student' ? 'ogr' : 'ogt'}-${g.toLowerCase()}${n}.svg`;
}

/** Ekranda gösterilecek resim adresi */
export function profilResmi(k: ProfilKisi | null | undefined, rol: ProfilRol = 'student'): string {
  if (!k) return basHarfResmi('', rol);
  return kendiResmiMi(k.avatar) ? (k.avatar as string) : otomatikResim(k, rol);
}
