// Aşama 188: giriş ekranında kurumun adı ve logosu.
// Herkes aynı adresten girdiği için giriş öncesi kurum iki yoldan bilinir:
//  1) Kuruma özel bağlantı: biliredu.com/?kurum=<kurum kimliği>. Ad ve logo, yalnız bu ikisini veren
//     kurum_public_brand() işleviyle okunur (sql/188_kurum_giris_markasi.sql).
//  2) Cihaz hatırlar: bu cihazda en son giriş yapan kişinin kurum adı ve logosu saklanır.
// İkisi de yoksa giriş ekranında "biliredu" yazar. Cihazda kişisel bilgi tutulmaz, yalnız kurum adı ve logo.
import { supabase } from './supabase';

export interface LoginBrand {
  name: string;
  logo: string;
  kurumId?: string;
}

const KEY = 'auth_login_brand';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LOGO = 400_000; // kurumlar_logo_chk ile aynı sınır

const clean = (b: any): LoginBrand | null => {
  const name = typeof b?.name === 'string' ? b.name.trim().slice(0, 120) : '';
  const logo = typeof b?.logo === 'string' && b.logo.startsWith('data:image/') && b.logo.length <= MAX_LOGO ? b.logo : '';
  const kurumId = typeof b?.kurumId === 'string' && UUID_RE.test(b.kurumId) ? b.kurumId : undefined;
  return name ? { name, logo, kurumId } : null;
};

export function readSavedLoginBrand(): LoginBrand | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clean(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLoginBrand(b: LoginBrand | null): void {
  try {
    const c = clean(b);
    if (!c) return;
    const prev = localStorage.getItem(KEY);
    const next = JSON.stringify(c);
    if (prev !== next) localStorage.setItem(KEY, next);
  } catch {
    /* tarayıcı izin vermiyorsa önemli değil */
  }
}

/** Adres çubuğundaki ?kurum=<kimlik> değeri (geçerli bir kimlikse) */
export function kurumIdFromUrl(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get('kurum') || '';
    return UUID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Kuruma özel bağlantıdaki kurumun adı ve logosu. SQL kurulu değilse ya da kurum yoksa null. */
export async function fetchLoginBrand(kurumId: string): Promise<LoginBrand | null> {
  if (!UUID_RE.test(kurumId)) return null;
  try {
    const { data, error } = await supabase.rpc('kurum_public_brand', { p_kurum_id: kurumId });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return clean({ name: row?.name, logo: row?.logo, kurumId });
  } catch {
    return null;
  }
}

/** Kurum Ayarları'ndaki "giriş bağlantısı" */
export function loginLinkFor(kurumId: string): string {
  const origin = /\.vercel\.app$/i.test(window.location.hostname) ? 'https://www.biliredu.com' : window.location.origin;
  return `${origin}/?kurum=${kurumId}`;
}
