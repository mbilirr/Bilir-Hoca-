import { supabase } from './supabase';

// ============================================================================
// Aşama 339: Yönetim › Genel › Giriş güvenliği (veri)
// Kurum yöneticisi kendi kurumunu, sistem sahibi kendi alanını (kurumsuz hesaplar) görür; ayrımı veritabanı yapar.
// RPC'ler: giris_guvenlik_ayar_oku / _yaz, giris_hatalari_ozet, giris_kilit_ac (sql/339).
// ============================================================================

export interface GirisAyar {
  bildirim: boolean;
  sms: boolean;
}

export interface GirisHataSatiri {
  anahtar: string;
  kimlik: string;
  tur: 'ogretmen' | 'ogrenci';
  ad: string | null;
  son: string;
  sayi24: number;
  sayi7: number;
  kilitBitis: string | null;
}

const KURULUM = "Giriş güvenliği için Supabase SQL Editor'de 339_hatali_giris.sql dosyasını çalıştırın.";
const hata = (e: { message?: string; code?: string } | null): Error =>
  new Error(e && (e.code === 'PGRST202' || /giris_|schema cache|does not exist/i.test(e.message || '')) ? KURULUM : e?.message || 'İşlem yapılamadı.');

export async function girisAyarOku(): Promise<GirisAyar> {
  const { data, error } = await supabase.rpc('giris_guvenlik_ayar_oku');
  if (error) throw hata(error);
  return { bildirim: (data as any)?.bildirim !== false, sms: (data as any)?.sms !== false };
}

export async function girisAyarYaz(a: GirisAyar): Promise<void> {
  const { error } = await supabase.rpc('giris_guvenlik_ayar_yaz', { p_bildirim: a.bildirim, p_sms: a.sms });
  if (error) throw hata(error);
}

export async function girisHatalari(): Promise<GirisHataSatiri[]> {
  const { data, error } = await supabase.rpc('giris_hatalari_ozet');
  if (error) throw hata(error);
  return ((data as any[]) || []).map((r) => ({
    anahtar: String(r.anahtar),
    kimlik: String(r.kimlik || ''),
    tur: r.tur === 'ogrenci' ? 'ogrenci' : 'ogretmen',
    ad: r.ad || null,
    son: String(r.son || ''),
    sayi24: Number(r.sayi_24s) || 0,
    sayi7: Number(r.sayi_7g) || 0,
    kilitBitis: r.kilit_bitis || null,
  }));
}

export async function girisKilitAc(anahtar: string): Promise<void> {
  const { error } = await supabase.rpc('giris_kilit_ac', { p_anahtar: anahtar });
  if (error) throw hata(error);
}
