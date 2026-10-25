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

/** Seçilen resmi en çok 256 piksel kare PNG'ye (gerekirse JPEG'e) çevirir; data URL döner */
export async function imageFileToLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Logo PNG, JPG ya da WEBP resmi olmalıdır.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Resim 5 MB\'tan küçük olmalıdır.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Resim okunamadı.'));
      el.src = url;
    });
    const max = 256;
    const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Resim işlenemedi.');
    ctx.drawImage(img, 0, 0, w, h);
    let out = canvas.toDataURL('image/png');
    if (out.length > 380000) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      out = canvas.toDataURL('image/jpeg', 0.85);
    }
    if (out.length > 390000) throw new Error('Logo çok büyük; daha küçük bir resim seçin.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
