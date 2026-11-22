import { supabase } from './supabase';

// ============================================================================
// Aşama 350: YENİ EĞİTİM YILINA GEÇİŞ (veri)
// Bütün kurallar veritabanında (sql/350): tek işlem, yetki denetimi, geri alma engelleri, mezun girişi.
// RPC'ler: yil_devri_durum, yil_devri_uygula (deneme = önizleme), yil_devri_geri_al (deneme = engel sorgusu),
//          yil_arsivi, mezun_geri_al.
// ============================================================================

export type DevirHedef = 'ust' | 'ayni' | 'mezun';
export type DevirAtama = 'ogrenci' | 'ad' | 'bos';

export interface DevirOgrenci {
  id: string;
  ad: string;
  no: string;
}
export interface DevirSinif {
  id: string;
  ad: string;
  seviye: number;
  sube: string;
  yil: string;
  ogrenciler: DevirOgrenci[];
}
export interface DevirOzet {
  eskiYil: string;
  yeniYil: string;
  tasinan: number;
  mezun: number;
  kalan: number;
  yeniSinif: number;
  arsivSinif: number;
  atama: number;
  programKapanan: number;
  yeniSiniflar: string[];
}
export interface DevirKaydi {
  id: string;
  eskiYil: string;
  yeniYil: string;
  atama: DevirAtama;
  yapan: string | null;
  yapildi: string;
  geriAlindi: string | null;
  geriAlmaSon: string;
  ozet: DevirOzet;
}
export interface DevirDurum {
  kurumAd: string;
  eskiYil: string;
  yeniYil: string;
  siniflar: DevirSinif[];
  devirler: DevirKaydi[];
}
export interface DevirPlanSatiri {
  class_id: string;
  hedef: DevirHedef;
  kalan: string[];
}
export interface GeriAlmaDurumu {
  ok: boolean;
  engel: { ad: string; sayi: number }[];
  son: string;
}
export interface ArsivOgrenci {
  id: string;
  ad: string;
  no: string;
  gittigi: string;
  kaldi: boolean;
  mezunSimdi: boolean;
}
export interface ArsivSinif {
  id: string;
  ad: string;
  seviye: number;
  odev: number | null;
  yoklama: number | null;
  ogrenciler: ArsivOgrenci[];
}
export interface YilArsivi {
  id: string;
  eskiYil: string;
  yeniYil: string;
  yapildi: string;
  siniflar: ArsivSinif[];
}

const KURULUM = "Yıl devri için Supabase SQL Editor'de 350_yil_devri.sql dosyasını çalıştırın.";
const hata = (e: { message?: string; code?: string } | null): Error =>
  new Error(e && (e.code === 'PGRST202' || /yil_devri|yil_arsivi|mezun_geri_al|schema cache/i.test(e.message || '')) ? KURULUM : e?.message || 'İşlem yapılamadı.');

const sayi = (v: unknown) => Number(v) || 0;
const ozetOku = (o: any): DevirOzet => ({
  eskiYil: String(o?.eski_yil || ''),
  yeniYil: String(o?.yeni_yil || ''),
  tasinan: sayi(o?.tasinan),
  mezun: sayi(o?.mezun),
  kalan: sayi(o?.kalan),
  yeniSinif: sayi(o?.yeni_sinif),
  arsivSinif: sayi(o?.arsiv_sinif),
  atama: sayi(o?.atama),
  programKapanan: sayi(o?.program_kapanan),
  yeniSiniflar: Array.isArray(o?.yeni_siniflar) ? o.yeni_siniflar.map(String) : [],
});

export async function devirDurumu(): Promise<DevirDurum> {
  const { data, error } = await supabase.rpc('yil_devri_durum');
  if (error) throw hata(error);
  const d = (data || {}) as any;
  return {
    kurumAd: String(d.kurum_ad || ''),
    eskiYil: String(d.eski_yil || ''),
    yeniYil: String(d.yeni_yil || ''),
    siniflar: (Array.isArray(d.siniflar) ? d.siniflar : []).map((c: any) => ({
      id: String(c.id),
      ad: String(c.ad || ''),
      seviye: sayi(c.seviye),
      sube: String(c.sube || ''),
      yil: String(c.yil || ''),
      ogrenciler: (Array.isArray(c.ogrenciler) ? c.ogrenciler : []).map((s: any) => ({ id: String(s.id), ad: String(s.ad || ''), no: String(s.no || '') })),
    })),
    devirler: (Array.isArray(d.devirler) ? d.devirler : []).map((x: any) => ({
      id: String(x.id),
      eskiYil: String(x.eski_yil || ''),
      yeniYil: String(x.yeni_yil || ''),
      atama: (x.atama === 'ad' || x.atama === 'bos' ? x.atama : 'ogrenci') as DevirAtama,
      yapan: x.yapan || null,
      yapildi: String(x.yapildi || ''),
      geriAlindi: x.geri_alindi || null,
      geriAlmaSon: String(x.geri_alma_son || ''),
      ozet: ozetOku(x.ozet),
    })),
  };
}

/** deneme: true → veritabanı her şeyi yapar, özeti verir ve geri alır (hiçbir şey değişmez) */
export async function devirUygula(
  plan: DevirPlanSatiri[],
  atama: DevirAtama,
  bosAc: boolean,
  onay: string,
  deneme: boolean
): Promise<DevirOzet & { id: string | null }> {
  const { data, error } = await supabase.rpc('yil_devri_uygula', { p_plan: plan, p_atama: atama, p_bos_ac: bosAc, p_onay: onay, p_deneme: deneme });
  if (error) throw hata(error);
  return { ...ozetOku(data), id: (data as any)?.id || null };
}

export async function geriAlmaDurumu(id: string): Promise<GeriAlmaDurumu> {
  const { data, error } = await supabase.rpc('yil_devri_geri_al', { p_id: id, p_deneme: true });
  if (error) throw hata(error);
  const d = (data || {}) as any;
  return {
    ok: !!d.ok,
    engel: (Array.isArray(d.engel) ? d.engel : []).map((e: any) => ({ ad: String(e.ad || ''), sayi: sayi(e.sayi) })),
    son: String(d.son || ''),
  };
}

export async function devriGeriAl(id: string): Promise<void> {
  const { error } = await supabase.rpc('yil_devri_geri_al', { p_id: id, p_deneme: false });
  if (error) throw hata(error);
}

export async function yilArsivi(id: string): Promise<YilArsivi> {
  const { data, error } = await supabase.rpc('yil_arsivi', { p_id: id });
  if (error) throw hata(error);
  const d = (data || {}) as any;
  return {
    id: String(d.id || id),
    eskiYil: String(d.eski_yil || ''),
    yeniYil: String(d.yeni_yil || ''),
    yapildi: String(d.yapildi || ''),
    siniflar: (Array.isArray(d.siniflar) ? d.siniflar : []).map((c: any) => ({
      id: String(c.id),
      ad: String(c.ad || ''),
      seviye: sayi(c.seviye),
      odev: c.odev == null ? null : sayi(c.odev),
      yoklama: c.yoklama == null ? null : sayi(c.yoklama),
      ogrenciler: (Array.isArray(c.ogrenciler) ? c.ogrenciler : []).map((s: any) => ({
        id: String(s.id),
        ad: String(s.ad || ''),
        no: String(s.no || ''),
        gittigi: String(s.gittigi || ''),
        kaldi: !!s.kaldi,
        mezunSimdi: !!s.mezun_simdi,
      })),
    })),
  };
}

export async function mezunuGeriAl(ogrenciId: string, sinifId: string): Promise<string> {
  const { data, error } = await supabase.rpc('mezun_geri_al', { p_student_id: ogrenciId, p_class_id: sinifId });
  if (error) throw hata(error);
  return String((data as any)?.sinif || '');
}

// ---------------------------------------------------------------- ekranın kendi hesabı (veritabanıyla aynı kural)
/** "5/A" → "6/A"; ad seviyeyle başlamıyorsa aynen kalır (sql: yil_devri_ust_ad) */
export function ustAd(ad: string, seviye: number): string {
  const m = new RegExp(`^\\s*${seviye}(\\D|$)`).exec(ad);
  return m ? ad.replace(new RegExp(`^\\s*${seviye}`), String(seviye + 1)) : ad;
}

/** Önerilen seçim: 12. sınıf ve son kademe (4/8, üstünde sınıf yoksa) mezun, diğerleri üst sınıfa */
export function onerilenHedef(sinif: DevirSinif, tum: DevirSinif[]): DevirHedef {
  if (sinif.seviye >= 12) return 'mezun';
  if ([4, 8].includes(sinif.seviye) && !tum.some((c) => c.seviye > sinif.seviye)) return 'mezun';
  return 'ust';
}

export interface DevirHesap {
  tasinan: number;
  mezun: number;
  kalan: number;
  yeniSiniflar: string[];
  bosSiniflar: string[];
}

/** Ekrandaki sayılar (asıl sayılar son adımda veritabanının deneme sonucundan gelir) */
export function devirHesapla(siniflar: DevirSinif[], hedef: Record<string, DevirHedef>, kalan: Record<string, string[]>, bosAc: boolean): DevirHesap {
  let tasinan = 0;
  let mezun = 0;
  let kalanSay = 0;
  const yeni: string[] = [];
  const ekle = (ad: string) => {
    if (!yeni.includes(ad)) yeni.push(ad);
  };
  for (const c of siniflar) {
    const h = hedef[c.id] || 'ust';
    const k = (kalan[c.id] || []).filter((id) => c.ogrenciler.some((s) => s.id === id));
    const n = c.ogrenciler.length - k.length;
    kalanSay += k.length;
    if (h === 'mezun') mezun += n;
    else {
      tasinan += n;
      ekle(h === 'ust' ? ustAd(c.ad, c.seviye) : c.ad);
    }
  }
  for (const c of siniflar) if ((kalan[c.id] || []).length) ekle(c.ad);
  const bos: string[] = [];
  if (bosAc) {
    const ustler = siniflar.filter((c) => (hedef[c.id] || 'ust') === 'ust');
    const min = ustler.length ? Math.min(...ustler.map((c) => c.seviye)) : null;
    for (const c of siniflar) if (c.seviye === min && !yeni.includes(c.ad)) bos.push(c.ad);
    bos.forEach(ekle);
  }
  return { tasinan, mezun, kalan: kalanSay, yeniSiniflar: yeni, bosSiniflar: bos };
}
