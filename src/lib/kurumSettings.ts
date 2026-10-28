import { supabase } from './supabase';

// ============================================================================
// KURUM AYARLARI (Aşama 82): rol yetkileri anahtarı, rol ayarları, kurum adı ve logosu.
// Veritabanı işlevleri: kurum_set_roles_enabled, kurum_set_role_settings, kurum_update_identity (sql/82).
// ============================================================================

export interface KurumRow {
  id: string;
  name: string;
  logo: string;
  rolesEnabled: boolean;
  rehberlikOgrenciEkle: boolean;
  /** Aşama 98: idare (kurum yöneticisi, Müdür, Müdür Yrd.) ödev / etüt verebilir mi */
  idareDersVerir: boolean;
}

const setupMsg = "Kurum ayarları bulunamadı. Supabase SQL Editor'de sql/82_rol_yetkileri_kurum_kimligi.sql dosyasını çalıştırın.";
const missing = (e: { message?: string; code?: string } | null) =>
  !!e && (/roles_enabled|role_settings|logo|kurum_set_|kurum_update_identity|schema cache|does not exist/i.test(e.message || '') || e.code === 'PGRST202' || e.code === '42703');

/** Genel yönetici: bütün kurumlar */
export async function fetchKurumRows(): Promise<KurumRow[]> {
  const { data, error } = await supabase.from('kurumlar').select('id,name,logo,roles_enabled,role_settings').order('name');
  if (error) throw new Error(missing(error) ? setupMsg : error.message);
  return (data || []).map((k: any) => ({
    id: String(k.id),
    name: k.name || '',
    logo: typeof k.logo === 'string' ? k.logo : '',
    rolesEnabled: k.roles_enabled === true,
    rehberlikOgrenciEkle: !!(k.role_settings && k.role_settings.rehberlik_ogrenci_ekle === true),
    idareDersVerir: !!(k.role_settings && k.role_settings.idare_ders_verir === true),
  }));
}

export async function setRolesEnabled(kurumId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('kurum_set_roles_enabled', { p_kurum_id: kurumId, p_on: on });
  if (error) throw new Error(missing(error) ? setupMsg : error.message);
}

export async function setRehberlikOgrenciEkle(kurumId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('kurum_set_role_settings', { p_kurum_id: kurumId, p_settings: { rehberlik_ogrenci_ekle: on } });
  if (error) throw new Error(missing(error) ? setupMsg : error.message);
}

const setup98 = "Bu ayar için Supabase SQL Editor'de Aşama 98 dosyasını (98_kurum_duzeltme_idare.sql) çalıştırın.";

/** Aşama 98: idare ödev / etüt verebilsin (kapalıyken idare yalnızca başka öğretmen adına etüt planlar) */
export async function setIdareDersVerir(kurumId: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('kurum_set_role_settings', { p_kurum_id: kurumId, p_settings: { idare_ders_verir: on } });
  if (error) throw new Error(missing(error) ? setup98 : error.message);
}

/** Aşama 98: kurum bölüm izinleri (genel yönetici; kuruma geçmişken de) */
export async function setKurumModules(kurumId: string, modules: Record<string, boolean>): Promise<void> {
  const { error } = await supabase.rpc('kurum_set_modules', { p_kurum_id: kurumId, p_modules: modules });
  if (error) throw new Error(missing(error) || /kurum_set_modules/.test(error.message || '') ? setup98 : error.message);
}

/** logo: undefined = değiştirme, '' = kaldır, data URL = yeni logo */
export async function updateKurumIdentity(kurumId: string, name: string, logo?: string): Promise<void> {
  const { error } = await supabase.rpc('kurum_update_identity', {
    p_kurum_id: kurumId,
    p_name: name,
    p_logo: logo ?? null,
    p_set_logo: logo !== undefined,
  });
  if (error) throw new Error(missing(error) ? setupMsg : error.message);
}

/**
 * Aşama 92: seçilen resmi yüksek kalitede logoya çevirir; data URL döner.
 *  - Çevresindeki boş (saydam ya da beyaz) kenarlar kırpılır: logo kutusunu doldurur, büyük görünür.
 *  - En uzun kenar 512 piksel (ekranda keskin görünür), adım adım yüksek kaliteli küçültme.
 *  - PNG (saydamlık korunur); veritabanı sınırını (400 KB) aşarsa 448 / 384 piksele, en son JPEG'e düşer.
 */
export async function imageFileToLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Logo PNG, JPG ya da WEBP resmi olmalıdır.');
  if (file.size > 8 * 1024 * 1024) throw new Error("Resim 8 MB'tan küçük olmalıdır.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Resim okunamadı.'));
      el.src = url;
    });
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    // 1) Kırpma için en çok 1024 piksellik çalışma kopyası
    const ws = Math.min(1, 1024 / Math.max(iw, ih));
    const work = document.createElement('canvas');
    work.width = Math.max(1, Math.round(iw * ws));
    work.height = Math.max(1, Math.round(ih * ws));
    const wc = work.getContext('2d', { willReadFrequently: true });
    if (!wc) throw new Error('Resim işlenemedi.');
    wc.imageSmoothingQuality = 'high';
    wc.drawImage(img, 0, 0, work.width, work.height);
    const px = wc.getImageData(0, 0, work.width, work.height).data;
    let x0 = work.width;
    let y0 = work.height;
    let x1 = -1;
    let y1 = -1;
    let alpha = false; // saydam piksel var mı (varsa PNG korunur)
    for (let y = 0; y < work.height; y++) {
      for (let x = 0; x < work.width; x++) {
        const i = (y * work.width + x) * 4;
        if (px[i + 3] < 250) alpha = true;
        const bg = px[i + 3] < 12 || (px[i] > 246 && px[i + 1] > 246 && px[i + 2] > 246);
        if (bg) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    // Tamamen boşsa kırpılmaz; kenarda küçük bir pay bırakılır
    let sx = 0;
    let sy = 0;
    let sw = iw;
    let sh = ih;
    if (x1 >= x0 && y1 >= y0) {
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
      sx = Math.max(0, (x0 - pad) / ws);
      sy = Math.max(0, (y0 - pad) / ws);
      sw = Math.min(iw - sx, (x1 - x0 + 1 + pad * 2) / ws);
      sh = Math.min(ih - sy, (y1 - y0 + 1 + pad * 2) / ws);
    }
    // 2) Yüksek kaliteli küçültme (her adımda en çok yarıya)
    const encode = (max: number, jpeg: boolean, q = 0.92) => {
      const sc = Math.min(1, max / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * sc));
      const h = Math.max(1, Math.round(sh * sc));
      let src: CanvasImageSource = img;
      let cx = sx;
      let cy = sy;
      let cw = sw;
      let ch = sh;
      while (cw / 2 > w) {
        const c = document.createElement('canvas');
        c.width = Math.round(cw / 2);
        c.height = Math.round(ch / 2);
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, cx, cy, cw, ch, 0, 0, c.width, c.height);
        src = c;
        cx = 0;
        cy = 0;
        cw = c.width;
        ch = c.height;
      }
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const o = out.getContext('2d');
      if (!o) throw new Error('Resim işlenemedi.');
      if (jpeg) {
        o.fillStyle = '#ffffff';
        o.fillRect(0, 0, w, h);
      }
      o.imageSmoothingQuality = 'high';
      o.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
      return jpeg ? out.toDataURL('image/jpeg', q) : out.toDataURL('image/png');
    };
    // Sayfa açılışını ağırlaştırmamak için hedef en çok ~200 KB; veritabanı sınırı 400 KB
    const SOFT = 200000;
    const LIMIT = 390000;
    const png = encode(512, false);
    if (png.length <= SOFT) return png;
    if (!alpha) {
      // Saydamlığı olmayan (fotoğraf benzeri) resim: JPEG aynı boyutta çok daha küçük
      for (const q of [0.92, 0.85]) {
        const jpg = encode(512, true, q);
        if (jpg.length <= SOFT) return jpg;
      }
    }
    for (const max of [448, 384, 320]) {
      const p2 = encode(max, false);
      if (p2.length <= SOFT) return p2;
    }
    if (png.length <= LIMIT) return png;
    for (const max of [512, 384]) {
      const jpg = encode(max, true);
      if (jpg.length <= LIMIT) return jpg;
    }
    throw new Error('Logo çok büyük; daha sade bir resim seçin.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
