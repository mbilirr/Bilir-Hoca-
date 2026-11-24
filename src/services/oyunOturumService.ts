// ============================================================================
// Aşama 381: OYUN OTURUMLARI — öğretmenin hazırladığı oyunlar, bağlantılar ve sonuçlar
// Oyun oluşturma / bağlantı üretme / kapatma sunucuda (api/mail.js action 'oyun') yapılır: bağlantı imzası ve
// oyunun soru kopyası orada kurulur. Liste ve sonuçlar RLS ile okunur: kendi oyunun; kurum yöneticisi / Müdür /
// Müdür Yrd. hepsini görür. Öğrenci bu tabloları okuyamaz.
// ============================================================================
import { supabase } from '../lib/supabase';
import { callMailOnce } from '../lib/mailApi';
import { notifyPush } from '../lib/push'; // Aşama 385

export type OyunMod = 'quiz' | 'cark' | 'bulmaca';
export type OyunKapsam = 'sinif' | 'kisisel';
export type OyunDurum = 'acik' | 'kapali' | 'doldu';

export const MOD_AD: Record<OyunMod, string> = { quiz: 'Soru yarışı', cark: 'Kelime çarkı', bulmaca: 'Bulmaca' };
/** soru yarışında "soru", kelime oyunlarında "kelime" */
export const birimAd = (mod: OyunMod) => (mod === 'quiz' ? 'soru' : 'kelime');
export const KAPSAM_AD: Record<OyunKapsam, string> = { sinif: 'Sınıf bağlantısı (QR)', kisisel: 'Kişisel bağlantılar' };
export const DURUM_AD: Record<OyunDurum, string> = { acik: 'Açık', kapali: 'Kapalı', doldu: 'Süresi doldu' };
export const GUN_SECENEKLERI = [
  { value: 1, label: '1 gün' },
  { value: 3, label: '3 gün' },
  { value: 7, label: '1 hafta' },
  { value: 14, label: '2 hafta' },
  { value: 30, label: '1 ay' },
];
/** Sunucudaki sınırlarla aynı (api/_oyun.js) */
export const QUIZ_SORU = { en_az: 3, en_cok: 30 };
export const CARK_KELIME = { en_az: 1, en_cok: 10 };
export const BULMACA_KELIME = { en_az: 2, en_cok: 12 };
export const SORU_SN = { en_az: 5, en_cok: 120, varsayilan: 20 };

export interface OyunKaydi {
  id: string;
  ad: string;
  mod: OyunMod;
  kapsam: OyunKapsam;
  classId: string;
  classAd: string;
  olusturan: string;
  olusturanAd: string;
  soruSn: number;
  soruSayisi: number;
  bitis: string;
  kapaliAt: string | null;
  createdAt: string;
  durum: OyunDurum;
}
export interface DenemeKaydi {
  studentId: string;
  ad: string;
  durum: 'suruyor' | 'bitti';
  puan: number;
  dogru: number;
  toplam: number;
  baslangic: string;
  bitisAt: string | null;
}
export interface KazanimSonucu {
  kod: string;
  dogru: number;
  toplam: number;
}
export interface OyunBaglantilari {
  sinif?: string;
  kisisel?: Array<{ id: string; ad: string; url: string }>;
}
export interface OyunGirdi {
  mod: OyunMod;
  kapsam: OyunKapsam;
  ad: string;
  classId: string;
  soruIds: string[];
  sureSn: number;
  gun: number;
  /** Aşama 385: öğrencilere "Yeni oyun" bildirimi (uygulama içi + telefon) */
  bildir: boolean;
}

const SQL_EKSIK = "Oyun oturumları veritabanında henüz kurulu değil. Supabase SQL Editor'de 381 numaralı SQL dosyasını çalıştırın.";
function hata(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message || 'İşlem yapılamadı.';
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || e?.code === 'PGRST205' || /could not find|does not exist|schema cache/i.test(m)) return new Error(SQL_EKSIK);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.');
  return new Error(m);
}

export const oyunDurumu = (o: { kapaliAt: string | null; bitis: string }, simdi = Date.now()): OyunDurum => (o.kapaliAt ? 'kapali' : Date.parse(o.bitis) <= simdi ? 'doldu' : 'acik');

const oyunCevir = (r: any): OyunKaydi => {
  const o = {
    id: String(r.id),
    ad: String(r.ad || ''),
    mod: (r.mod === 'cark' || r.mod === 'bulmaca' ? r.mod : 'quiz') as OyunMod,
    kapsam: (r.kapsam === 'kisisel' ? 'kisisel' : 'sinif') as OyunKapsam,
    classId: String(r.class_id || ''),
    classAd: String(r.class_ad || ''),
    olusturan: String(r.olusturan || ''),
    olusturanAd: String(r.olusturan_ad || ''),
    soruSn: Number(r.soru_sn) || SORU_SN.varsayilan,
    soruSayisi: Array.isArray(r.sorular) ? r.sorular.length : 0,
    bitis: String(r.bitis || ''),
    kapaliAt: r.kapali_at ? String(r.kapali_at) : null,
    createdAt: String(r.created_at || ''),
  };
  return { ...o, durum: oyunDurumu(o) };
};

export async function listOyunlar(): Promise<OyunKaydi[]> {
  const { data, error } = await supabase
    .from('oyun_oyunlari')
    .select('id,ad,mod,kapsam,class_id,class_ad,olusturan,olusturan_ad,soru_sn,sorular,bitis,kapali_at,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw hata(error);
  return (data || []).map(oyunCevir);
}

export async function listDenemeler(oyunId: string): Promise<DenemeKaydi[]> {
  const { data, error } = await supabase
    .from('oyun_denemeleri')
    .select('student_id,ogrenci_ad,durum,puan,dogru,toplam,baslangic,bitis_at')
    .eq('oyun_id', oyunId)
    .order('puan', { ascending: false })
    .limit(1000);
  if (error) throw hata(error);
  return (data || []).map((r: any) => ({
    studentId: String(r.student_id),
    ad: String(r.ogrenci_ad || ''),
    durum: r.durum === 'bitti' ? 'bitti' : 'suruyor',
    puan: Number(r.puan) || 0,
    dogru: Number(r.dogru) || 0,
    toplam: Number(r.toplam) || 0,
    baslangic: String(r.baslangic || ''),
    bitisAt: r.bitis_at ? String(r.bitis_at) : null,
  }));
}

/** Kazanım başına sınıfın doğru oranı (yalnız kazanımı olan sorular) */
export async function listKazanimSonuclari(oyunId: string): Promise<KazanimSonucu[]> {
  const harita = new Map<string, KazanimSonucu>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('oyun_cevaplari').select('id,kazanim_kodu,dogru').eq('oyun_id', oyunId).not('kazanim_kodu', 'is', null).order('id').range(from, from + 999);
    if (error) throw hata(error);
    for (const r of data || []) {
      const kod = String((r as any).kazanim_kodu);
      const k = harita.get(kod) || { kod, dogru: 0, toplam: 0 };
      k.toplam += 1;
      if ((r as any).dogru) k.dogru += 1;
      harita.set(kod, k);
    }
    if (!data || data.length < 1000) break;
  }
  return [...harita.values()].sort((a, b) => a.dogru / a.toplam - b.dogru / b.toplam || a.kod.localeCompare(b.kod, 'tr'));
}

async function sunucu(op: string, ek: Record<string, unknown>): Promise<Record<string, any>> {
  const r = await callMailOnce('oyun', { op, ...ek });
  if (!r.ok) throw new Error(r.error || 'İşlem yapılamadı.');
  return r;
}

export async function olusturOyun(g: OyunGirdi): Promise<{ id: string; baglantilar: OyunBaglantilari }> {
  const r = await sunucu('olustur', { ...g });
  const id = String(r.oyun.id);
  // Aşama 385: telefon bildirimi ayrı sunucuda (api/push.js); gitmese de oyun kurulmuştur
  if (g.bildir) notifyPush('oyun-yeni', { oyunId: id });
  return { id, baglantilar: { sinif: r.sinif, kisisel: r.kisisel } };
}
export async function oyunBaglantilari(oyunId: string): Promise<OyunBaglantilari> {
  const r = await sunucu('baglantilar', { oyunId });
  return { sinif: r.sinif, kisisel: r.kisisel };
}
export const kapatOyun = (oyunId: string) => sunucu('kapat', { oyunId }).then(() => undefined);
export const acOyun = (oyunId: string) => sunucu('ac', { oyunId }).then(() => undefined);
export const uzatOyun = (oyunId: string, gun: number) => sunucu('uzat', { oyunId, gun }).then((r) => String(r.bitis));
export const silOyun = (oyunId: string) => sunucu('sil', { oyunId }).then(() => undefined);
export const sifirlaDeneme = (oyunId: string, studentId: string) => sunucu('sifirla', { oyunId, studentId }).then(() => undefined);
