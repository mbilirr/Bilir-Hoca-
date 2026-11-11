// ============================================================================
// Aşama 217: DERS PROGRAMI + DERS SAATİ YOKLAMASI — veritabanı işlemleri
// Asıl kurallar ve kurum ayrımı veritabanında (sql/217). Bu dosya yalnız işlevleri çağırır;
// ekranlar her zaman sunucudaki gerçeği gösterir (yerel kopya / localStorage YOK).
// Canlı güncelleme: dersCanliDinle() yalnız açık ekran için, yalnız kendi kurumunun satırlarını dinler.
// ============================================================================
import { supabase } from '../lib/supabase';
export { trBugun, trSaat } from '../lib/trSaat'; // Aşama 234: Türkiye günü / saati (sunucuya göre)

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

export type VeliBildirim = 'gun_sonu' | 'ders_sonu' | 'ikisi'; // Aşama 231

export interface DersAyar {
  kayitli: boolean;
  dersSayisi: number;
  gunler: number[]; // 1 = Pazartesi … 7 = Pazar
  saatler: DersSaati[];
  gecikmeDk: number;
  uyariEpostalari: string[];
  veliBildirim: VeliBildirim; // Aşama 231: veliye devamsızlık bildiriminin zamanı
  devamsizlikSinir: number; // Aşama 232: özürsüz devamsızlık sınırı (gün, 0 = kapalı)
  devamsizlikKala: number; // Aşama 232: sınıra kaç gün kala uyarı
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
  vekilAd: string; // Aşama 232: o güne yazılmış vekil öğretmen ('' = yok)
  benimVekil: boolean; // Aşama 232: bu saate vekil olarak ben yazıldım
}

export interface Tatil {
  tarih: string;
  aciklama: string;
}

export interface HaftaVeri {
  ayar: DersAyar | null;
  hucreler: HaftaHucre[];
  tatiller: Tatil[]; // Aşama 231
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
  izin: 'izinli' | 'raporlu' | null; // Aşama 232: gün boyu izin
  bildirildi: boolean; // Aşama 232: veliye ders sonu bildirimi gitti
}

export interface YoklamaGecmis {
  at: string;
  ad: string;
  eski: YoklamaDurum | null;
  yeni: YoklamaDurum | null;
  kim: string;
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
  yonetici: boolean; // Aşama 232
  vekil: { id: string; ad: string } | null; // Aşama 232
  gecmis: YoklamaGecmis[]; // Aşama 232: değişiklik geçmişi (son 50)
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
    veliBildirim: a.veli_bildirim === 'ders_sonu' || a.veli_bildirim === 'ikisi' ? a.veli_bildirim : 'gun_sonu',
    devamsizlikSinir: Number.isFinite(Number(a.devamsizlik_sinir)) && a.devamsizlik_sinir != null ? Number(a.devamsizlik_sinir) : 10,
    devamsizlikKala: Number.isFinite(Number(a.devamsizlik_kala)) && a.devamsizlik_kala != null ? Number(a.devamsizlik_kala) : 2,
    bugun: String(a.bugun || ''),
    simdi: String(a.simdi || ''),
  };
}

const tatilCevir = (v: unknown): Tatil[] =>
  Array.isArray(v) ? v.map((t: any) => ({ tarih: String(t?.tarih || ''), aciklama: String(t?.aciklama || '') })).filter((t) => t.tarih) : [];

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
/**
 * Yürürlükteki (ileriye dönük) program: bitiş tarihi olmayan satırlar (yönetici düzenleme ekranı).
 * Aşama 231: başlamış bugünkü ders saati değişince yeni satır yarından başlar, eskisi bugün kapanır;
 * ekran bu yüzden kapanmamış satırları gösterir. bugun parametresi eski çağıranlar için duruyor.
 */
export async function guncelProgram(kurumId: string, bugun?: string): Promise<ProgramSatiri[]> {
  const { data, error } = await supabase
    .from('ders_programi')
    .select('id,gun,sira,class_id,ders,teacher_id,gecerli_bas,gecerli_bit')
    .eq('kurum_id', kurumId)
    .is('gecerli_bit', null);
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

// Aşama 237: ekrandaki bütün program değişiklikleri tek Kaydet ile, tek işlemde (biri hata verirse hiçbiri yazılmaz)
export type ProgramIslem =
  | { tur: 'ogretmen'; teacherId: string; gun: number; sira: number; classId: string | null; ders: string | null }
  | { tur: 'sinif'; classId: string; gun: number; sira: number; ders: string | null; teacherIds: string[] };

const SQL_EKSIK_237 = "Toplu kayıt veritabanında henüz kurulu değil. Supabase SQL Editor'de 237 numaralı SQL dosyasını çalıştırın.";

export async function programTopluKaydet(islemler: ProgramIslem[]): Promise<void> {
  if (!islemler.length) return;
  const p_islemler = islemler.map((i) =>
    i.tur === 'ogretmen'
      ? { tur: 'ogretmen', teacher_id: i.teacherId, gun: i.gun, sira: i.sira, class_id: i.classId || '', ders: i.ders || '' }
      : { tur: 'sinif', class_id: i.classId, gun: i.gun, sira: i.sira, ders: i.ders || '', teacher_ids: i.teacherIds }
  );
  try {
    await rpc('ders_programi_toplu_kaydet', { p_islemler });
  } catch (e: any) {
    throw e?.message === SQL_EKSIK ? new Error(SQL_EKSIK_237) : e;
  }
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
        vekilAd: String(h.vekil_ad || ''),
        benimVekil: h.benim_vekil === true,
      }))
    : [];
  return { ayar: ayarCevir(r?.ayar), hucreler, tatiller: tatilCevir(r?.tatiller) };
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
          izin: o.izin === 'raporlu' ? 'raporlu' : o.izin === 'izinli' ? 'izinli' : null,
          bildirildi: o.bildirildi === true,
        }))
      : [],
    yonetici: r?.yonetici === true,
    vekil: r?.vekil && r.vekil.id ? { id: String(r.vekil.id), ad: String(r.vekil.ad || '') } : null,
    gecmis: Array.isArray(r?.gecmis)
      ? r.gecmis.map((g: any) => ({
          at: String(g.at || ''),
          ad: String(g.ad || ''),
          eski: (DURUMLAR.includes(g.eski) ? g.eski : null) as YoklamaDurum | null,
          yeni: (DURUMLAR.includes(g.yeni) ? g.yeni : null) as YoklamaDurum | null,
          kim: String(g.kim || ''),
        }))
      : [],
  };
}

const DURUMLAR = ['present', 'absent', 'late', 'excused'];

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
export type DersTablo = 'kurum_ders_ayar' | 'sinif_ders_ogretmen' | 'ders_programi' | 'ders_yoklama_oturum' | 'kurum_ders_tatil' | 'ders_vekil' | 'ders_gun_izin'; // 231: tatil · 232: vekil, gün boyu izin

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

// ============================================================================
// Aşama 221: YOKLAMA TAKİBİ ve KURUM RAPORU (yalnız idare; hepsi sunucuda, kendi kurumunda hesaplanır)
// ============================================================================
const SQL_EKSIK_221 = "Yoklama takibi veritabanında henüz kurulu değil. Supabase SQL Editor'de 221 numaralı SQL dosyasını çalıştırın.";

async function rpc221<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(fn, args);
  } catch (e: any) {
    if (e?.message === SQL_EKSIK) throw new Error(SQL_EKSIK_221);
    throw e;
  }
}

export type GunDurum = 'alindi' | 'geciken' | 'bekliyor' | 'sonra';

export interface GecikenDers {
  classId: string;
  classAd: string;
  sira: number;
  ders: string;
  bas: string;
  bit: string;
  teacherAdlari: string[];
}

export interface BugunOzet {
  kayitli: boolean;
  gecikmeDk: number;
  gecikenler: GecikenDers[];
  gelmeyen: number;
}

export interface GunHucre {
  classId: string;
  classAd: string;
  sira: number;
  ders: string;
  teacherAdlari: string[];
  durum: GunDurum;
  oturum: { alanAd: string; alindiAt: string; sayilar: Sayilar; gec: boolean } | null;
}

export interface DevamsizlikSatiri {
  studentId: string;
  ad: string;
  no: string;
  classAd: string;
  absent: number;
  late: number;
  excused: number;
  gun: number;
  toplam: number;
}

export interface OgretmenYoklamaSatiri {
  teacherId: string;
  ad: string;
  planli: number;
  alinan: number;
  alinmayan: number;
  gec: number;
}

/** İdare ana sayfası: bugün geciken dersler + bugün (derste) gelmeyen öğrenci sayısı. İdare değilse null. */
export async function ozetBugun(): Promise<BugunOzet | null> {
  const r = await rpc221<any>('ders_ozet_bugun');
  if (!r || typeof r !== 'object') return null;
  return {
    kayitli: r.kayitli === true,
    gecikmeDk: Number(r.gecikme_dk) || 40,
    gelmeyen: Number(r.gelmeyen) || 0,
    gecikenler: Array.isArray(r.gecikenler)
      ? r.gecikenler.map((g: any) => ({
          classId: String(g.class_id),
          classAd: String(g.class_ad || g.class_id),
          sira: Number(g.sira),
          ders: String(g.ders || ''),
          bas: String(g.bas || ''),
          bit: String(g.bit || ''),
          teacherAdlari: yaziDizisi(g.teacher_adlari),
        }))
      : [],
  };
}

export async function gunTablosu(tarih: string): Promise<{ ayar: DersAyar | null; hucreler: GunHucre[] }> {
  const r = await rpc221<any>('ders_gun_tablosu', { p_tarih: tarih });
  const hucreler: GunHucre[] = Array.isArray(r?.hucreler)
    ? r.hucreler.map((h: any) => ({
        classId: String(h.class_id),
        classAd: String(h.class_ad || h.class_id),
        sira: Number(h.sira),
        ders: String(h.ders || ''),
        teacherAdlari: yaziDizisi(h.teacher_adlari),
        durum: (['alindi', 'geciken', 'bekliyor', 'sonra'].includes(h.durum) ? h.durum : 'sonra') as GunDurum,
        oturum: h.oturum
          ? {
              alanAd: String(h.oturum.alan_ad || ''),
              alindiAt: String(h.oturum.alindi_at || ''),
              sayilar: (h.oturum.sayilar && typeof h.oturum.sayilar === 'object' ? h.oturum.sayilar : {}) as Sayilar,
              gec: h.oturum.gec === true,
            }
          : null,
      }))
    : [];
  return { ayar: ayarCevir(r?.ayar), hucreler };
}

export async function devamsizlikRapor(bas: string, bit: string): Promise<DevamsizlikSatiri[]> {
  const r = await rpc221<any>('ders_devamsizlik_rapor', { p_bas: bas, p_bit: bit });
  return Array.isArray(r?.ogrenciler)
    ? r.ogrenciler.map((x: any) => ({
        studentId: String(x.student_id),
        ad: String(x.ad || ''),
        no: String(x.no || ''),
        classAd: String(x.class_ad || ''),
        absent: Number(x.absent) || 0,
        late: Number(x.late) || 0,
        excused: Number(x.excused) || 0,
        gun: Number(x.gun) || 0,
        toplam: Number(x.toplam) || 0,
      }))
    : [];
}

export async function ogretmenYoklamaRapor(bas: string, bit: string): Promise<OgretmenYoklamaSatiri[]> {
  const r = await rpc221<any>('ders_ogretmen_rapor', { p_bas: bas, p_bit: bit });
  return Array.isArray(r?.ogretmenler)
    ? r.ogretmenler.map((x: any) => ({
        teacherId: String(x.teacher_id),
        ad: String(x.ad || ''),
        planli: Number(x.planli) || 0,
        alinan: Number(x.alinan) || 0,
        alinmayan: Number(x.alinmayan) || 0,
        gec: Number(x.gec) || 0,
      }))
    : [];
}

// ============================================================================
// Aşama 223: ÖĞRENCİNİN KENDİ DERS DEVAMSIZLIĞI (yalnız kendi kayıtları; varsayılan bu eğitim yılı)
// ============================================================================
export interface DevamsizligimKayit {
  tarih: string;
  sira: number;
  ders: string;
  bas: string;
  status: YoklamaDurum;
  note: string;
}
export interface Devamsizligim {
  bas: string;
  bit: string;
  sayilar: Sayilar;
  gun: number;
  kayitlar: DevamsizligimKayit[];
}

/** Ders programı kurulu değilse ya da öğrenci değilse null (ekran bölümü hiç çizilmez) */
export async function devamsizligim(): Promise<Devamsizligim | null> {
  let r: any;
  try {
    r = await rpc<any>('ders_devamsizligim');
  } catch (e: any) {
    if (e?.message === SQL_EKSIK) return null; // 217 / 223 kurulu değil
    throw e;
  }
  if (!r || typeof r !== 'object') return null;
  return {
    bas: String(r.bas || ''),
    bit: String(r.bit || ''),
    sayilar: (r.sayilar && typeof r.sayilar === 'object' ? r.sayilar : {}) as Sayilar,
    gun: Number(r.gun) || 0,
    kayitlar: Array.isArray(r.kayitlar)
      ? r.kayitlar.map((k: any) => ({
          tarih: String(k.tarih || ''),
          sira: Number(k.sira) || 0,
          ders: String(k.ders || ''),
          bas: String(k.bas || ''),
          status: (['present', 'absent', 'late', 'excused'].includes(k.status) ? k.status : 'absent') as YoklamaDurum,
          note: String(k.note || ''),
        }))
      : [],
  };
}

// ============================================================================
// Aşama 231: TATİL GÜNLERİ · VELİ BİLDİRİM ZAMANI · ÖĞRENCİ DERS PROGRAMI · EXCEL'DEN PROGRAM YÜKLEME
// ============================================================================
const SQL_EKSIK_231 = "Bu özellik veritabanında henüz kurulu değil. Supabase SQL Editor'de 231 numaralı SQL dosyasını çalıştırın.";

async function rpc231<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(fn, args);
  } catch (e: any) {
    if (e?.message === SQL_EKSIK) throw new Error(SQL_EKSIK_231);
    throw e;
  }
}

/** Kurumun tatil günleri (verilen tarihten sonrası; vars. bütün liste) */
export async function tatilListesi(kurumId: string, bas?: string): Promise<Tatil[]> {
  let q = supabase.from('kurum_ders_tatil').select('tarih,aciklama').eq('kurum_id', kurumId);
  if (bas) q = q.gte('tarih', bas);
  const { data, error } = await q.order('tarih');
  if (error) {
    const e = hata(error);
    throw e.message === SQL_EKSIK ? new Error(SQL_EKSIK_231) : e;
  }
  return tatilCevir(data);
}

export async function tatilEkle(bas: string, bit: string, aciklama: string): Promise<number> {
  const r = await rpc231<any>('ders_tatil_ekle', { p_bas: bas, p_bit: bit, p_aciklama: aciklama });
  return Number(r?.gun) || 0;
}

export async function tatilSil(bas: string, bit: string): Promise<number> {
  const r = await rpc231<any>('ders_tatil_sil', { p_bas: bas, p_bit: bit });
  return Number(r?.gun) || 0;
}

export async function veliBildirimKaydet(mod: VeliBildirim): Promise<void> {
  await rpc231('ders_veli_bildirim_kaydet', { p_mod: mod });
}

// ---------------------------------------------------------------- öğrenci
export interface OgrenciHucre {
  tarih: string;
  sira: number;
  ders: string;
  teacherAdlari: string[];
  durum: YoklamaDurum | null; // kendi yoklama durumu (alınmadıysa null)
}
export interface OgrenciProgram {
  ayar: DersAyar | null;
  classAd: string;
  hucreler: OgrenciHucre[];
  tatiller: Tatil[];
}

/** Öğrencinin kendi sınıfının haftası. 231 kurulu değilse ya da öğrenci değilse null (bölüm çizilmez). */
export async function ogrenciProgrami(bas: string): Promise<OgrenciProgram | null> {
  let r: any;
  try {
    r = await rpc<any>('ders_programim', { p_bas: bas });
  } catch (e: any) {
    if (e?.message === SQL_EKSIK) return null;
    throw e;
  }
  if (!r || typeof r !== 'object') return null;
  return {
    ayar: ayarCevir(r.ayar),
    classAd: String(r.class_ad || ''),
    hucreler: Array.isArray(r.hucreler)
      ? r.hucreler.map((h: any) => ({
          tarih: String(h.tarih),
          sira: Number(h.sira),
          ders: String(h.ders || ''),
          teacherAdlari: yaziDizisi(h.teacher_adlari).filter(Boolean),
          durum: (['present', 'absent', 'late', 'excused'].includes(h.durum) ? h.durum : null) as YoklamaDurum | null,
        }))
      : [],
    tatiller: tatilCevir(r.tatiller),
  };
}

// ---------------------------------------------------------------- Excel'den program
export interface TopluSatir {
  satir: number; // Excel satır numarası (hata mesajı için)
  classId: string;
  gun: number;
  sira: number;
  ders: string;
  teacherIds: string[];
}
export type TopluSonuc =
  | { ok: true; deneme: boolean; sinif: number; eklenen: number; kaldirilan: number; degismeyen: number; yeniEslesme: number }
  | { ok: false; hatalar: string[]; hataSayisi: number };

/**
 * Dosyadaki her sınıfın programını dosyadakiyle değiştirir (dosyada olmayan sınıflar değişmez).
 * deneme = true: hiçbir şey yazılmaz, yalnız ne olacağı döner. Tek işlem: ya hepsi yazılır ya hiçbiri.
 */
export async function programTopluYukle(satirlar: TopluSatir[], opts: { deneme: boolean; ogretmenEkle?: boolean }): Promise<TopluSonuc> {
  const r = await rpc231<any>('ders_programi_toplu_yukle', {
    p_satirlar: satirlar.map((x) => ({ satir: x.satir, class_id: x.classId, gun: x.gun, sira: x.sira, ders: x.ders, teacher_ids: x.teacherIds })),
    p_ogretmen_ekle: opts.ogretmenEkle !== false,
    p_deneme: opts.deneme,
  });
  if (r?.ok !== true) {
    return { ok: false, hatalar: yaziDizisi(r?.hatalar), hataSayisi: Number(r?.hata_sayisi) || yaziDizisi(r?.hatalar).length };
  }
  return {
    ok: true,
    deneme: r.deneme === true,
    sinif: Number(r.sinif) || 0,
    eklenen: Number(r.eklenen) || 0,
    kaldirilan: Number(r.kaldirilan) || 0,
    degismeyen: Number(r.degismeyen) || 0,
    yeniEslesme: Number(r.yeni_eslesme) || 0,
  };
}

// ============================================================================
// Aşama 232: VEKİL ÖĞRETMEN · GÜN BOYU İZİN · DEVAMSIZLIK SINIRI
// ============================================================================
const SQL_EKSIK_232 = "Bu özellik veritabanında henüz kurulu değil. Supabase SQL Editor'de 232 numaralı SQL dosyasını çalıştırın.";

async function rpc232<T = any>(fn: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(fn, args);
  } catch (e: any) {
    if (e?.message === SQL_EKSIK) throw new Error(SQL_EKSIK_232);
    throw e;
  }
}

/** O günün o saatine vekil yazar; teacherId null = vekili kaldırır (yalnız idare). */
export async function vekilAta(classId: string, tarih: string, sira: number, teacherId: string | null, aciklama = ''): Promise<void> {
  await rpc232('ders_vekil_ata', { p_class_id: classId, p_tarih: tarih, p_sira: sira, p_teacher_id: teacherId, p_aciklama: aciklama });
}

export type IzinTur = 'izinli' | 'raporlu';
export interface GunIzin {
  studentId: string;
  tarih: string;
  tur: IzinTur;
  aciklama: string;
}

/** Kurumun gün boyu izinleri (verilen tarihten sonrası) */
export async function izinListesi(kurumId: string, bas: string): Promise<GunIzin[]> {
  const { data, error } = await supabase
    .from('ders_gun_izin')
    .select('student_id,tarih,tur,aciklama')
    .eq('kurum_id', kurumId)
    .gte('tarih', bas)
    .order('tarih')
    .limit(2000);
  if (error) {
    const e = hata(error);
    throw e.message === SQL_EKSIK ? new Error(SQL_EKSIK_232) : e;
  }
  return (data || []).map((x: any) => ({
    studentId: String(x.student_id),
    tarih: String(x.tarih),
    tur: x.tur === 'raporlu' ? 'raporlu' : 'izinli',
    aciklama: String(x.aciklama || ''),
  }));
}

/** Seçili öğrencilere tarih aralığında gün boyu izin yazar; o günlerin "Gelmedi"leri "İzinli" olur. */
export async function izinEkle(studentIds: string[], bas: string, bit: string, tur: IzinTur, aciklama: string): Promise<{ gun: number; duzelen: number }> {
  const r = await rpc232<any>('ders_izin_ekle', { p_student_ids: studentIds, p_bas: bas, p_bit: bit, p_tur: tur, p_aciklama: aciklama });
  return { gun: Number(r?.gun) || 0, duzelen: Number(r?.duzelen) || 0 };
}

export async function izinSil(studentId: string, bas: string, bit: string): Promise<number> {
  const r = await rpc232<any>('ders_izin_sil', { p_student_id: studentId, p_bas: bas, p_bit: bit });
  return Number(r?.gun) || 0;
}

export async function sinirKaydet(sinir: number, kala: number): Promise<void> {
  await rpc232('ders_sinir_kaydet', { p_sinir: sinir, p_kala: kala });
}
