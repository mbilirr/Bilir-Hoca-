// ============================================================================
// Aşama 217: DERS PROGRAMI + DERS SAATİ YOKLAMASI — veritabanı işlemleri
// Asıl kurallar ve kurum ayrımı veritabanında (sql/217). Bu dosya yalnız işlevleri çağırır;
// ekranlar her zaman sunucudaki gerçeği gösterir (yerel kopya / localStorage YOK).
// Canlı güncelleme: dersCanliDinle() yalnız açık ekran için, yalnız kendi kurumunun satırlarını dinler.
// ============================================================================
import { supabase } from '../lib/supabase';

export const DERS_MAX = 10;
export const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;
export const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export type YoklamaDurum = 'present' | 'absent' | 'late' | 'excused';
export const YOKLAMA_ETIKET: Record<YoklamaDurum, string> = {
  present: 'Geldi',
  absent: 'Gelmedi',
  late: 'Geç',
  excused: 'İzinli',
};

export interface DersSaati {
  bas: string; // "08:30"
  bit: string; // "09:10"
}

export interface DersAyar {
  kayitli: boolean;
  dersSayisi: number;
  gunler: number[]; // 1 = Pazartesi … 7 = Pazar
  saatler: DersSaati[];
  gecikmeDk: number;
  uyariEpostalari: string[];
  bugun: string; // YYYY-AA-GG (Türkiye saati)
  simdi: string; // SS:DD (Türkiye saati)
}

export interface Sayilar {
  present?: number;
  absent?: number;
  late?: number;
  excused?: number;
}

export interface OturumOzet {
  id: string;
  alindiAt: string;
  alanAd: string;
  konu: string;
  sayilar: Sayilar;
}

export interface HaftaHucre {
  tarih: string;
  gun: number;
  sira: number;
  classId: string;
  classAd: string;
  ders: string;
  teacherIds: string[];
  teacherAdlari: string[];
  oturum: OturumOzet | null;
}

export interface HaftaVeri {
  ayar: DersAyar | null;
  hucreler: HaftaHucre[];
}

export interface SinifDersOgretmen {
  id: string;
  classId: string;
  ders: string;
  teacherId: string;
}

export interface ProgramSatiri {
  id: string;
  gun: number;
  sira: number;
  classId: string;
  ders: string;
  teacherId: string;
  gecerliBas: string;
  gecerliBit: string | null;
}

export interface YoklamaOgrenci {
  id: string;
  ad: string;
  no: string;
  status: YoklamaDurum | null;
  note: string;
}

export interface YoklamaAcik {
  classId: string;
  classAd: string;
  tarih: string;
  sira: number;
  ders: string;
  bas: string | null;
  bit: string | null;
  teacherAdlari: string[];
  oturum: OturumOzet | null;
  yazabilir: boolean;
  ogrenciler: YoklamaOgrenci[];
}

export interface Bekleyen {
  tarih: string;
  sira: number;
  classId: string;
  classAd: string;
  ders: string;
  bas: string | null;
}

// ---------------------------------------------------------------- hata dili
const SQL_EKSIK = "Ders programı veritabanında henüz kurulu değil. Supabase SQL Editor'de 217 numaralı SQL dosyasını çalıştırın.";

function hata(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message || 'İşlem yapılamadı.';
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || /could not find the function|does not exist|schema cache/i.test(m)) {
    return new Error(SQL_EKSIK);
  }
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.');
  return new Error(m);
}

async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw hata(error);
  return data as T;
}

// ---------------------------------------------------------------- dönüştürücüler
const sayiDizisi = (v: unknown): number[] => (Array.isArray(v) ? v.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : []);
const yaziDizisi = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? '')) : []);

function ayarCevir(a: any): DersAyar | null {
  if (!a || typeof a !== 'object') return null;
  return {
    kayitli: a.kayitli === true,
    dersSayisi: Number(a.ders_sayisi) || 8,
    gunler: sayiDizisi(a.gunler),
    saatler: Array.isArray(a.saatler) ? a.saatler.map((s: any) => ({ bas: String(s?.bas || ''), bit: String(s?.bit || '') })) : [],
    gecikmeDk: Number(a.gecikme_dk) || 40,
    uyariEpostalari: yaziDizisi(a.uyari_epostalari),
    bugun: String(a.bugun || ''),
    simdi: String(a.simdi || ''),
  };
}

function oturumCevir(o: any): OturumOzet | null {
  if (!o || typeof o !== 'object' || !o.id) return null;
  return {
    id: String(o.id),
    alindiAt: String(o.alindi_at || ''),
    alanAd: String(o.alan_ad || ''),
    konu: String(o.konu || ''),
    sayilar: (o.sayilar && typeof o.sayilar === 'object' ? o.sayilar : {}) as Sayilar,
  };
}

// ---------------------------------------------------------------- tarih yardımcıları (yerel takvim, UTC değil)
export function tarihYaz(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function tarihOku(s: string): Date {
  const [y, m, g] = s.split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, g || 1);
}
export function gunEkle(s: string, n: number): string {
  const d = tarihOku(s);
  d.setDate(d.getDate() + n);
  return tarihYaz(d);
}
/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar */
export function isoGun(s: string): number {
  const g = tarihOku(s).getDay();
  return g === 0 ? 7 : g;
}
export function haftaBasi(s: string): string {
  return gunEkle(s, 1 - isoGun(s));
}
export function tarihUzun(s: string): string {
  const d = tarihOku(s);
  return `${d.getDate()} ${['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][d.getMonth()]}`;
}

// ---------------------------------------------------------------- kurum ayarı (Aşama 217)
export async function dersAyarOku(): Promise<DersAyar | null> {
  return ayarCevir(await rpc('ders_ayar_oku'));
}

export async function dersAyarKaydet(p: {
  dersSayisi: number;
  gunler: number[];
  saatler: DersSaati[];
  gecikmeDk: number;
  epostalar: string[];
  temizle?: boolean;
}): Promise<{ ok: boolean; cakisan: number; kaldirilan: number }> {
  const r = await rpc<any>('ders_ayar_kaydet', {
    p_ders_sayisi: p.dersSayisi,
    p_gunler: p.gunler,
    p_saatler: p.saatler.slice(0, p.dersSayisi),
    p_gecikme_dk: p.gecikmeDk,
    p_epostalar: p.epostalar,
    p_temizle: p.temizle === true,
  });
  return { ok: r?.ok === true, cakisan: Number(r?.cakisan) || 0, kaldirilan: Number(r?.kaldirilan) || 0 };
}

/** İlk ders, süre ve teneffüse göre saat listesi üretir (öğle arası: verilen dersten sonra ek dakika) */
export function saatleriDoldur(ilk: string, sure: number, teneffus: number, adet: number, ogleSonra = 0, ogleDk = 0): DersSaati[] {
  const dk = (t: string) => {
    const [h, m] = t.split(':').map((x) => Number(x));
    return (h || 0) * 60 + (m || 0);
  };
  const yaz = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  const out: DersSaati[] = [];
  let t = dk(ilk);
  for (let i = 0; i < adet; i++) {
    const b = t;
    const e = b + sure;
    out.push({ bas: yaz(b), bit: yaz(e) });
    t = e + teneffus + (ogleSonra > 0 && i + 1 === ogleSonra ? ogleDk : 0);
  }
  return out;
}

// ---------------------------------------------------------------- sınıf ders öğretmenleri (Aşama 218)
export async function sinifDersOgretmenleri(kurumId: string): Promise<SinifDersOgretmen[]> {
  const { data, error } = await supabase
    .from('sinif_ders_ogretmen')
    .select('id,class_id,ders,teacher_id')
    .eq('kurum_id', kurumId)
    .order('ders');
  if (error) throw hata(error);
  return (data || []).map((r: any) => ({ id: String(r.id), classId: String(r.class_id), ders: String(r.ders), teacherId: String(r.teacher_id) }));
}

export async function sinifDersOgretmenEkle(classId: string, ders: string, teacherId: string): Promise<void> {
  await rpc('sinif_ders_ogretmen_ekle', { p_class_id: classId, p_ders: ders, p_teacher_id: teacherId });
}

/** teacherId verilmezse ders bütün öğretmenleriyle kaldırılır. Programdaki bugün ve sonraki saatler de kapanır. */
export async function sinifDersOgretmenCikar(classId: string, ders: string, teacherId?: string | null): Promise<number> {
  const r = await rpc<any>('sinif_ders_ogretmen_cikar', { p_class_id: classId, p_ders: ders, p_teacher_id: teacherId || null });
  return Number(r?.kapanan_saat) || 0;
}

// ---------------------------------------------------------------- program (Aşama 219)
/** Bugün ve sonrası için geçerli program satırları (yönetici düzenleme ekranı) */
export async function guncelProgram(kurumId: string, bugun: string): Promise<ProgramSatiri[]> {
  const { data, error } = await supabase
    .from('ders_programi')
    .select('id,gun,sira,class_id,ders,teacher_id,gecerli_bas,gecerli_bit')
    .eq('kurum_id', kurumId)
    .lte('gecerli_bas', bugun)
    .or(`gecerli_bit.is.null,gecerli_bit.gte.${bugun}`);
  if (error) throw hata(error);
  return (data || []).map((r: any) => ({
    id: String(r.id),
    gun: Number(r.gun),
    sira: Number(r.sira),
    classId: String(r.class_id),
    ders: String(r.ders),
    teacherId: String(r.teacher_id),
    gecerliBas: String(r.gecerli_bas),
    gecerliBit: r.gecerli_bit ? String(r.gecerli_bit) : null,
  }));
}

export async function programOgretmenAta(teacherId: string, gun: number, sira: number, classId: string | null, ders: string | null): Promise<void> {
  await rpc('ders_programi_ata', { p_teacher_id: teacherId, p_gun: gun, p_sira: sira, p_class_id: classId, p_ders: ders });
}

export async function programSinifAta(classId: string, gun: number, sira: number, ders: string | null, teacherIds: string[]): Promise<void> {
  await rpc('ders_programi_sinif_ata', { p_class_id: classId, p_gun: gun, p_sira: sira, p_ders: ders, p_teacher_ids: teacherIds });
}

// ---------------------------------------------------------------- öğretmen Dersler sayfası (Aşama 220)
export async function haftaOku(bas: string, opts?: { teacherId?: string | null; classId?: string | null }): Promise<HaftaVeri> {
  const r = await rpc<any>('ders_programi_hafta', {
    p_bas: bas,
    p_teacher_id: opts?.teacherId || null,
    p_class_id: opts?.classId || null,
  });
  const hucreler: HaftaHucre[] = Array.isArray(r?.hucreler)
    ? r.hucreler.map((h: any) => ({
        tarih: String(h.tarih),
        gun: Number(h.gun),
        sira: Number(h.sira),
        classId: String(h.class_id),
        classAd: String(h.class_ad || h.class_id),
        ders: String(h.ders || ''),
        teacherIds: yaziDizisi(h.teacher_ids),
        teacherAdlari: yaziDizisi(h.teacher_adlari),
        oturum: oturumCevir(h.oturum),
      }))
    : [];
  return { ayar: ayarCevir(r?.ayar), hucreler };
}

export async function bekleyenlerim(): Promise<Bekleyen[]> {
  const r = await rpc<any>('ders_bekleyenlerim');
  return Array.isArray(r)
    ? r.map((x: any) => ({
        tarih: String(x.tarih),
        sira: Number(x.sira),
        classId: String(x.class_id),
        classAd: String(x.class_ad || x.class_id),
        ders: String(x.ders || ''),
        bas: x.bas ? String(x.bas) : null,
      }))
    : [];
}

export async function yoklamaAc(classId: string, tarih: string, sira: number): Promise<YoklamaAcik> {
  const r = await rpc<any>('ders_yoklama_ac', { p_class_id: classId, p_tarih: tarih, p_sira: sira });
  return {
    classId: String(r?.class_id || classId),
    classAd: String(r?.class_ad || classId),
    tarih: String(r?.tarih || tarih),
    sira: Number(r?.sira) || sira,
    ders: String(r?.ders || ''),
    bas: r?.bas ? String(r.bas) : null,
    bit: r?.bit ? String(r.bit) : null,
    teacherAdlari: yaziDizisi(r?.teacher_adlari),
    oturum: oturumCevir(r?.oturum),
    yazabilir: r?.yazabilir === true,
    ogrenciler: Array.isArray(r?.ogrenciler)
      ? r.ogrenciler.map((o: any) => ({
          id: String(o.id),
          ad: String(o.ad || ''),
          no: String(o.no || ''),
          status: (['present', 'absent', 'late', 'excused'].includes(o.status) ? o.status : null) as YoklamaDurum | null,
          note: String(o.note || ''),
        }))
      : [],
  };
}

export async function yoklamaKaydet(p: {
  classId: string;
  tarih: string;
  sira: number;
  konu: string;
  kayitlar: Array<{ id: string; status: YoklamaDurum; note?: string }>;
}): Promise<{ sayilar: Sayilar; alanAd: string }> {
  const r = await rpc<any>('ders_yoklama_kaydet', {
    p_class_id: p.classId,
    p_tarih: p.tarih,
    p_sira: p.sira,
    p_konu: p.konu,
    p_kayitlar: p.kayitlar.map((k) => ({ id: k.id, status: k.status, note: k.note || '' })),
  });
  return { sayilar: (r?.sayilar || {}) as Sayilar, alanAd: String(r?.alan_ad || '') };
}

// ---------------------------------------------------------------- canlı güncelleme
export type DersTablo = 'kurum_ders_ayar' | 'sinif_ders_ogretmen' | 'ders_programi' | 'ders_yoklama_oturum';

/**
 * Açık ekran için kendi kurumunun ders tablolarını dinler. Değişiklik gelince (kısa beklemeyle tek sefer) onChange çağrılır.
 * Ekran sekmesi yeniden görünür olunca da çağrılır (arada kaçan olaylar için). Dönen işlev dinlemeyi kapatır.
 */
export function dersCanliDinle(kurumId: string | null | undefined, tablolar: DersTablo[], onChange: () => void): () => void {
  if (!kurumId) return () => {};
  let zaman: ReturnType<typeof setTimeout> | null = null;
  const tetik = () => {
    if (zaman) clearTimeout(zaman);
    zaman = setTimeout(() => {
      zaman = null;
      onChange();
    }, 300);
  };
  let kanal: ReturnType<typeof supabase.channel> | null = null;
  try {
    const ch = supabase.channel(`ders-${tablolar.join('-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    for (const t of tablolar) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `kurum_id=eq.${kurumId}` }, () => tetik());
    }
    ch.subscribe();
    kanal = ch;
  } catch {
    kanal = null;
  }
  const gorunur = () => {
    if (document.visibilityState === 'visible') tetik();
  };
  document.addEventListener('visibilitychange', gorunur);
  return () => {
    document.removeEventListener('visibilitychange', gorunur);
    if (zaman) clearTimeout(zaman);
    if (kanal) {
      try {
        supabase.removeChannel(kanal);
      } catch {
        /* kapanırken hata önemsiz */
      }
    }
  };
}
