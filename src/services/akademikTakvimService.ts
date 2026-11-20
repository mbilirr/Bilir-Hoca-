// ============================================================================
// Aşama 242: AKADEMİK TAKVİM — veritabanı işlemleri (sql/242_akademik_takvim.sql)
// Kurum bazlı bölüm: yalnız genel yöneticinin "Kurum bölümleri"nden açtığı kurumda çalışır.
// Okuma: kurumun öğretmen / idare hesapları · Yazma: yalnız kurum yöneticisi (Müdür, Müdür Yrd.), yalnız RPC ile.
// Ekranlar her zaman sunucudaki kayıtları gösterir (yerel kopya yok); değişiklik anlık güncelleme ile yayılır.
// ============================================================================
import { supabase } from '../lib/supabase';
import { UZUN_AYRILIK_MS, donusteCalistir } from '../lib/donus';
import { trBugun } from '../lib/trSaat';

export type AktKapsam = 'ogrenci' | 'veli';
export type AktYer = 'ic' | 'dis';

/** Veritabanındaki tek satır (her sınıf ayrı satırdır) */
export interface AktKayit {
  id: string;
  tarih: string; // YYYY-AA-GG (ilk gün)
  bitis: string; // Aşama 327: birkaç gün süren etkinliğin son günü (YYYY-AA-GG); tek günlükte ''
  ayIcinde: boolean; // Aşama 327: günü belli değil, "o ay içinde" (tarih = ayın 1'i, bitis = ayın son günü)
  ad: string; // büyük harfle saklanır (Excel ile aynı)
  sinif: string; // "5.SINIF", "3 YAŞ" ya da boş (bütün sınıflar)
  birim: string;
  zumre: string;
  kapsam: AktKapsam;
  yer: AktYer;
  salon: boolean;
  kontrol: boolean;
}

/** Ekrandaki etkinlik: aynı gün, ad, kapsam ve yerdeki satırlar tek etkinlik ("5, 6, 7. sınıf") */
export interface AktEtkinlik {
  key: string;
  tarih: string;
  bitis: string; // Aşama 327: '' = tek gün
  ayIcinde: boolean;
  ad: string;
  kapsam: AktKapsam;
  yer: AktYer;
  birim: string;
  zumre: string;
  salon: boolean;
  kontrol: boolean;
  siniflar: string[];
  ids: string[];
}

/** Yüklenecek / kaydedilecek satır */
export type AktSatir = Omit<AktKayit, 'id'>;

export const SINIFLAR = ['3 YAŞ', '4 YAŞ', '5 YAŞ', '1.SINIF', '2.SINIF', '3.SINIF', '4.SINIF', '5.SINIF', '6.SINIF', '7.SINIF', '8.SINIF'] as const;
export const BIRIMLER = ['ANASINIFI', 'İLKOKUL', 'ORTAOKUL'] as const;
export const ZUMRELER = [
  '3 YAŞ', '4 YAŞ', '5 YAŞ', '1.SINIF ZÜMRESİ', '2.SINIF ZÜMRESİ', '3.SINIF ZÜMRESİ', '4.SINIF ZÜMRESİ', 'İLKOKUL İNGİLİZCE',
  'ANASINIFI İNGİLİZCE', 'ANASINIFI REHBERLİK', 'İLKOKUL REHBERLİK', 'BEDEN EĞİTİMİ', 'İLKOKUL DEĞERLER EĞİTİMİ',
  'ANASINIFI DEĞERLER EĞİTİMİ', 'İLKOKUL BRANŞ ZÜMRESİ', 'ANASINIFI BRANŞ ZÜMRESİ', 'TÜRKÇE ZÜMRESİ', 'MATEMATİK ZÜMRESİ',
  'FEN BİLİMLERİ ZÜMRESİ', 'SOSYAL BİLGİLER ZÜMRESİ', 'ORTAOKUL İNGİLİZCE ZÜMRESİ', 'ORTAOKUL REHBERLİK ZÜMRESİ',
  'ORTAOKUL DEĞERLER EĞİTİMİ ZÜMRESİ', 'ORTAOKUL BRANŞ ZÜMRESİ',
] as const;

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
export const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;
export const GUN_KISA_PAZAR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const;
export const GUN_TAM_PAZAR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;
/** Okul ayları sırası (Eylül → Haziran) */
export const OKUL_AYLARI = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6] as const;

// ---------------------------------------------------------------- tarih ve yazı yardımcıları
export const tarihCoz = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const tarihYaz = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const gunEkle = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const pazartesi = (d: Date): Date => gunEkle(d, -((d.getDay() + 6) % 7));
export const bugun = (): Date => tarihCoz(trBugun());

/** Eğitim öğretim yılı: Eylül–Haziran. Temmuz ve sonrası yeni yıla sayılır (yaz tatilinde yeni takvim yüklenir). */
export function egitimYili(d: Date = bugun()): number {
  return d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}
export const yilAraligi = (y: number) => ({ bas: `${y}-09-01`, bit: `${y + 1}-06-30` });
export const yilAdi = (y: number) => `${y}–${y + 1}`;

/** Türkçe büyük harf (karşılaştırma ve saklama) */
// Aşama 329: NFC — Mac'te dosya adı ve yapıştırılan yazı 'İ'yi iki parça (I + nokta) getirebilir; karşılaştırma bozulmasın
export const buyuk = (v: unknown): string => String(v ?? '').normalize('NFC').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();

// Aşama 329: zümre adı bilinen zümreye çevrilir ("MATEMATİK" → "MATEMATİK ZÜMRESİ"; "İNGİLİZCE" + ORTAOKUL → "ORTAOKUL İNGİLİZCE ZÜMRESİ").
// Veritabanı da aynı kuralı uygular (akademik_zumre_ad, sql/329); bu kopya ekranda önizleme ve karşılaştırma içindir.
const ZUMRE_EK = new Set(['ZÜMRESİ', 'ZÜMRE', 'İLKOKUL', 'ORTAOKUL', 'ANASINIFI']);
const zumreKok = (z: string) =>
  buyuk(z)
    .split(' ')
    .filter((w) => w && !ZUMRE_EK.has(w))
    .join(' ');
export function zumreAdi(ham: unknown, birim: unknown = ''): string {
  const z = buyuk(ham);
  if (!z || (ZUMRELER as readonly string[]).includes(z)) return z;
  const kok = zumreKok(z);
  if (!kok) return z;
  const aday = ZUMRELER.filter((x) => zumreKok(x) === kok);
  if (aday.length === 1) return aday[0];
  const b = buyuk(birim);
  const birimli = b ? aday.filter((x) => x.includes(b)) : [];
  return birimli.length === 1 ? birimli[0] : z;
}

/**
 * Aşama 329: dosya adından zümre. Tam ad yazıyorsa o ("MATEMATİK ZÜMRESİ …"); yazmıyorsa zümrenin ana kelimesi aranır
 * ("… FEN BİLGİSİ.xlsx" → FEN BİLİMLERİ ZÜMRESİ; "… İNGİLİZCE.xlsx" → satırın birimine göre İlkokul / Ortaokul İngilizce).
 * Bulunamazsa ya da iki farklı zümreye uyuyorsa null (hücredeki zümre kullanılır).
 */
export function dosyaZumresi(dosyaAdi: string): ((birim: unknown) => string) | null {
  const ad = buyuk(String(dosyaAdi || '').replace(/\.xlsx?$/i, '').replace(/_+/g, ' '));
  const tam = [...ZUMRELER].sort((a, b) => b.length - a.length).find((z) => ad.includes(z));
  if (tam) return () => tam;
  const harf = /[^0-9A-ZÇĞİÖŞÜ]+/g;
  const kelime = new Set(ad.split(harf).filter(Boolean));
  const sik = ad.replace(harf, '');
  const koks = new Set<string>();
  for (const z of ZUMRELER) {
    const kok = zumreKok(z);
    const ilk = kok.split(' ')[0];
    if (/\d/.test(ilk) ? sik.includes(kok.replace(harf, '')) : kelime.has(ilk)) koks.add(kok);
  }
  if (koks.size !== 1) return null;
  const kok = [...koks][0];
  return (birim) => zumreAdi(kok, birim);
}

const KUCUK = new Set(['ve', 'ile', 'ya', 'da', 'de', 'için', 'veya', 'ki']);
/** "BİLİM MERKEZİ(GÜNEŞİN YAPISI)" → "Bilim Merkezi (Güneşin Yapısı)" */
export function baslik(s: string): string {
  return String(s || '')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr')
    .split(' ')
    .map((w, i) => (i && KUCUK.has(w) ? w : w.replace(/^(\(?)(\p{L})/u, (_m, p: string, c: string) => p + c.toLocaleUpperCase('tr'))))
    .join(' ');
}
/** Ana ad ve parantez içindeki konu: ["Butterfly World", "Hayvanlarda Üreme"] */
export function adParca(s: string): [string, string] {
  const t = baslik(s);
  const m = t.match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? [m[1], m[2]] : [t, ''];
}
export const sinifAdi = (s: string): string =>
  !s ? 'Bütün sınıflar' : /YAŞ/.test(s) ? s.replace(/\s*YAŞ/, ' yaş') : s.replace(/\.?\s*SINIF/, '. sınıf');
/** ["5.SINIF","6.SINIF","7.SINIF"] → "5, 6, 7. sınıf" */
export function siniflarYazi(list: string[]): string {
  const l = [...new Set(list)].sort((a, b) => SINIFLAR.indexOf(a as any) - SINIFLAR.indexOf(b as any));
  if (!l.length || l.some((x) => !x)) return 'Bütün sınıflar';
  if (l.every((x) => /SINIF/.test(x))) return l.map((x) => parseInt(x, 10)).join(', ') + '. sınıf';
  return l.map(sinifAdi).join(', ');
}

// ---------------------------------------------------------------- Aşama 327: birkaç gün süren etkinlik
/** Etkinliğin son günü (tek günlükte ilk gün) */
export const sonGun = (g: Pick<AktKayit, 'tarih' | 'bitis'>): string => g.bitis || g.tarih;
/** Etkinlik o gün sürüyor mu */
export const gundeMi = (g: Pick<AktKayit, 'tarih' | 'bitis'> & { ayIcinde?: boolean }, gun: string): boolean =>
  !g.ayIcinde && g.tarih <= gun && sonGun(g) >= gun; // "ay içinde" etkinlik hiçbir güne yazılmaz
/** Etkinlik [bas, bit] aralığına değiyor mu (hafta, ay) */
export const araliktaMi = (g: Pick<AktKayit, 'tarih' | 'bitis'>, bas: string, bit: string): boolean => g.tarih <= bit && sonGun(g) >= bas;
/** "15–19 Mart", "30 Mart – 2 Nisan" ya da tek gün "15 Mart" */
export function gunAraligiYazi(g: Pick<AktKayit, 'tarih' | 'bitis'> & { ayIcinde?: boolean }): string {
  const a = tarihCoz(g.tarih);
  if (g.ayIcinde) return `${AY_ADLARI[a.getMonth()]} içinde`;
  if (!g.bitis) return `${a.getDate()} ${AY_ADLARI[a.getMonth()]}`;
  const b = tarihCoz(g.bitis);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${AY_ADLARI[b.getMonth()]}`
    : `${a.getDate()} ${AY_ADLARI[a.getMonth()]} – ${b.getDate()} ${AY_ADLARI[b.getMonth()]}`;
}

export const satirAnahtari = (s: Pick<AktKayit, 'tarih' | 'ad' | 'sinif'>) => `${s.tarih}|${buyuk(s.ad)}|${buyuk(s.sinif)}`;
const etkinlikAnahtari = (s: AktKayit) => `${s.tarih}|${s.bitis}|${s.ayIcinde ? 'ay' : ''}|${buyuk(s.ad)}|${s.kapsam}|${s.yer}`;

/** Satırları ekrandaki etkinliklere toplar (tarihe göre sıralı) */
export function etkinlikler(list: AktKayit[]): AktEtkinlik[] {
  const m = new Map<string, AktEtkinlik>();
  for (const s of list) {
    const k = etkinlikAnahtari(s);
    let g = m.get(k);
    if (!g) {
      g = { key: k, tarih: s.tarih, bitis: s.bitis, ayIcinde: s.ayIcinde, ad: s.ad, kapsam: s.kapsam, yer: s.yer, birim: s.birim, zumre: s.zumre, salon: false, kontrol: true, siniflar: [], ids: [] };
      m.set(k, g);
    }
    g.siniflar.push(s.sinif);
    g.ids.push(s.id);
    g.salon = g.salon || s.salon;
    g.kontrol = g.kontrol && s.kontrol;
  }
  return [...m.values()].sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.ad.localeCompare(b.ad, 'tr')));
}

// ---------------------------------------------------------------- veritabanı
const SQL_EKSIK = "Akademik takvim veritabanında henüz kurulu değil. Supabase SQL Editor'de 242 numaralı SQL dosyasını çalıştırın.";
// Aşama 327: bitiş tarihi sütunu (sql/327) kurulmadıysa takvim eskisi gibi tek günlük okunur; birkaç günlük kayıt reddedilir
const BITIS_EKSIK = "Birkaç gün süren ya da \"ay içinde\" etkinlik için Supabase SQL Editor'de 327 numaralı SQL dosyasını çalıştırın.";
let bitisYok = false;
const bitisHatasi = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /bitis|ay_icinde/i.test(e.message || ''));

function hata(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message || 'İşlem yapılamadı.';
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || e?.code === 'PGRST205' || /could not find|does not exist|schema cache/i.test(m)) {
    return new Error(SQL_EKSIK);
  }
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.');
  return new Error(m);
}

async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw hata(error);
  return data as T;
}

const kayitCevir = (r: any): AktKayit => ({
  id: String(r.id),
  tarih: String(r.tarih || '').slice(0, 10),
  bitis: String(r.bitis || '').slice(0, 10),
  ayIcinde: r.ay_icinde === true,
  ad: String(r.ad || ''),
  sinif: String(r.sinif || ''),
  birim: String(r.birim || ''),
  zumre: String(r.zumre || ''),
  kapsam: r.kapsam === 'veli' ? 'veli' : 'ogrenci',
  yer: r.yer === 'dis' ? 'dis' : 'ic',
  salon: r.salon === true,
  kontrol: r.kontrol === true,
});

/** Kurumun takvimi (verilen tarih aralığında; RLS kendi kurumunu ve bölümün açık olmasını denetler) */
// Aşama 327: aralığa DEĞEN etkinlikler (önceki ayda başlayıp bu aralıkta süren de gelir)
export async function takvimListesi(kurumId: string, bas: string, bit: string): Promise<AktKayit[]> {
  const oku = (bitisli: boolean) => {
    const q = supabase
      .from('akademik_takvim')
      .select(bitisli ? 'id,tarih,bitis,ay_icinde,ad,sinif,birim,zumre,kapsam,yer,salon,kontrol' : 'id,tarih,ad,sinif,birim,zumre,kapsam,yer,salon,kontrol')
      .eq('kurum_id', kurumId)
      .lte('tarih', bit);
    return (bitisli ? q.or(`tarih.gte.${bas},bitis.gte.${bas}`) : q.gte('tarih', bas)).order('tarih').limit(3000);
  };
  let { data, error } = await oku(!bitisYok);
  if (error && !bitisYok && bitisHatasi(error)) {
    bitisYok = true;
    ({ data, error } = await oku(false));
  }
  if (error) throw hata(error);
  return (data || []).map(kayitCevir);
}
/** Gönderilecek satırlarda bitiş tarihi varken sütun kurulu değilse açık uyarı (sessizce tek güne inmez) */
function bitisDenetle(satirlar: AktSatir[]) {
  if (bitisYok && satirlar.some((s) => s.bitis || s.ayIcinde)) throw new Error(BITIS_EKSIK);
}

export type YuklemeSonucu = 'yeni' | 'guncel' | 'ayni' | 'yil_disi' | 'bos';

export async function takvimYukle(mod: 'ekle' | 'degistir', yil: number, satirlar: AktSatir[]) {
  const { bas, bit } = yilAraligi(yil);
  bitisDenetle(satirlar);
  const r = await rpc<any>('akademik_takvim_yukle', { p_mod: mod, p_bas: bas, p_bit: bit, p_satirlar: satirlar });
  // Aşama 329: satır satır sonuç (yeni | guncel | ayni | yil_disi | bos); 329 kurulu değilse yalnız sayılar gelir
  const sonuclar: YuklemeSonucu[] = Array.isArray(r?.sonuclar) ? r.sonuclar.map((x: unknown) => String(x) as YuklemeSonucu) : [];
  return {
    eklenen: Number(r?.eklenen) || 0,
    guncellenen: Number(r?.guncellenen) || 0,
    ayni: Number(r?.ayni) || 0,
    atlanan: Number(r?.atlanan) || 0,
    silinen: Number(r?.silinen) || 0,
    sonuclar,
  };
}

/** Etkinliği ekle / değiştir (eski satırlar silinip yenileri yazılır, tek işlemde) ya da sil (satirlar boş) */
export async function etkinlikKaydet(silinecek: string[], satirlar: AktSatir[]): Promise<void> {
  bitisDenetle(satirlar);
  await rpc('akademik_takvim_kaydet', { p_sil: silinecek, p_satirlar: satirlar });
}

/** Aşama 329: seçilen etkinliklerin bütün sınıf satırlarını tek işlemde siler */
export async function etkinlikleriSil(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const r = await rpc<any>('akademik_takvim_kaydet', { p_sil: ids, p_satirlar: [] });
  return Number(r?.silinen) || 0;
}

export async function kontrolIsaretle(ids: string[], kontrol: boolean): Promise<void> {
  await rpc('akademik_takvim_kontrol', { p_ids: ids, p_kontrol: kontrol });
}

// ---------------------------------------------------------------- Aşama 328: zümre üyeleri (hatırlatma alıcıları)
// Zümresi yazılı etkinlik yaklaşınca üyelere bir kez e-posta (izin verildiyse SMS) gider: okul dışı 12 gün, okul içi 6 gün önce,
// günü belli olmayan okul içi etkinlik ay başından 1 gün önce. Gönderimi sunucu yapar (api/mail.js, sql/328).
export interface ZumreUye {
  teacherId: string;
  baskan: boolean;
}
const ZUMRE_SQL_EKSIK = "Zümre hatırlatması için Supabase SQL Editor'de 328 numaralı SQL dosyasını çalıştırın.";
const hata328 = (e: { message?: string; code?: string } | null | undefined): Error => {
  const h = hata(e);
  return h.message === SQL_EKSIK ? new Error(ZUMRE_SQL_EKSIK) : h;
};

/** Kurumun zümre üyeleri (zümre adı → üyeler) ve Zümre Başkanı rolü olan öğretmenler (yalnız yönetici) */
export async function zumreListesi(): Promise<{ uyeler: Record<string, ZumreUye[]>; baskanlar: string[] }> {
  const { data, error } = await supabase.rpc('akademik_zumre_listesi');
  if (error) throw hata328(error);
  const uyeler: Record<string, ZumreUye[]> = {};
  for (const u of (data?.uyeler || []) as any[]) {
    const z = buyuk(u?.zumre);
    if (!z || !u?.teacher_id) continue;
    (uyeler[z] ||= []).push({ teacherId: String(u.teacher_id), baskan: u.baskan === true });
  }
  return { uyeler, baskanlar: ((data?.baskanlar || []) as unknown[]).map(String) };
}

/** Bir zümrenin üyelerini yazar (listede olmayan çıkar); kaç üye yazıldığını döner */
export async function zumreKaydet(zumre: string, uyeler: ZumreUye[]): Promise<number> {
  const { data, error } = await supabase.rpc('akademik_zumre_kaydet', {
    p_zumre: buyuk(zumre),
    p_uyeler: uyeler.map((u) => ({ teacher_id: u.teacherId, baskan: u.baskan })),
  });
  if (error) throw hata328(error);
  return Number(data) || 0;
}

const katla = (v: unknown) =>
  String(v ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
/**
 * Branşa göre öneri: "MATEMATİK ZÜMRESİ" → branşında matematik geçenler; "1.SINIF ZÜMRESİ" → sınıf öğretmenleri;
 * "3 YAŞ" → okul öncesi. "BRANŞ ZÜMRESİ" gibi branştan çıkmayan zümrede öneri yoktur (elle seçilir).
 */
export function zumreBransUyar(zumre: string, brans: string | undefined): boolean {
  const z = katla(zumre);
  const b = katla(brans);
  if (!b.trim() || z.includes('brans')) return false;
  if (/^\d\s*\.?\s*sinif/.test(z)) return b.includes('sinif ogretmen');
  if (/\d\s*yas/.test(z)) return b.includes('okul oncesi') || b.includes('anaokul') || b.includes('anasinif');
  const kelime = z
    .replace(/zumresi|zumre/g, ' ')
    .replace(/\b(ilkokul|ortaokul|anasinifi|lise)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!kelime) return false;
  if (kelime.includes('rehber')) return b.includes('rehber') || b.includes('pdr') || b.includes('psikolojik');
  if (kelime.includes('degerler')) return b.includes('din kultur') || b.includes('ahlak') || b.includes('degerler');
  if (kelime.includes('fen')) return /(^|[^a-z])fen([^a-z]|$)/.test(b);
  return b.includes(kelime.split(' ')[0]);
}

/** Açık ekran için kurumun takvim tablosunu dinler; değişince (kısa beklemeyle) onChange. Dönen işlev dinlemeyi kapatır. */
export function takvimCanliDinle(kurumId: string | null | undefined, onChange: () => void): () => void {
  if (!kurumId) return () => {};
  let zaman: ReturnType<typeof setTimeout> | null = null;
  const tetik = () => {
    if (zaman) clearTimeout(zaman);
    zaman = setTimeout(() => {
      zaman = null;
      onChange();
    }, 300);
  };
  // Aşama 303: kanal açıkken kısa ayrılıklarda değişiklik zaten kanaldan gelir; sekmeye dönüşte yalnız kanal kapalıysa
  // ya da uzun ayrılıktan (kanal kopmuş olabilir) sonra okunur. Kanal kopup yeniden bağlanınca arada kaçan için bir kez okunur.
  let canli = false;
  let koptu = false;
  const durum = (s: string) => {
    if (s === 'SUBSCRIBED') {
      if (koptu) tetik();
      canli = true;
      koptu = false;
    } else if (canli) {
      canli = false;
      koptu = true;
    }
  };
  let kanal: ReturnType<typeof supabase.channel> | null = null;
  try {
    kanal = supabase
      .channel(`akademik-takvim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'akademik_takvim', filter: `kurum_id=eq.${kurumId}` }, () => tetik())
      .subscribe(durum);
  } catch {
    kanal = null;
  }
  const donusBirak = donusteCalistir((uzakta) => {
    if (!canli || uzakta >= UZUN_AYRILIK_MS) tetik();
  });
  return () => {
    donusBirak();
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
