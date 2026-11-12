// ============================================================================
// Aşama 242: AKADEMİK TAKVİM — veritabanı işlemleri (sql/242_akademik_takvim.sql)
// Kurum bazlı bölüm: yalnız genel yöneticinin "Kurum bölümleri"nden açtığı kurumda çalışır.
// Okuma: kurumun öğretmen / idare hesapları · Yazma: yalnız kurum yöneticisi (Müdür, Müdür Yrd.), yalnız RPC ile.
// Ekranlar her zaman sunucudaki kayıtları gösterir (yerel kopya yok); değişiklik anlık güncelleme ile yayılır.
// ============================================================================
import { supabase } from '../lib/supabase';
import { trBugun } from '../lib/trSaat';

export type AktKapsam = 'ogrenci' | 'veli';
export type AktYer = 'ic' | 'dis';

/** Veritabanındaki tek satır (her sınıf ayrı satırdır) */
export interface AktKayit {
  id: string;
  tarih: string; // YYYY-AA-GG
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
export const buyuk = (v: unknown): string => String(v ?? '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();

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

export const satirAnahtari = (s: Pick<AktKayit, 'tarih' | 'ad' | 'sinif'>) => `${s.tarih}|${buyuk(s.ad)}|${buyuk(s.sinif)}`;
const etkinlikAnahtari = (s: AktKayit) => `${s.tarih}|${buyuk(s.ad)}|${s.kapsam}|${s.yer}`;

/** Satırları ekrandaki etkinliklere toplar (tarihe göre sıralı) */
export function etkinlikler(list: AktKayit[]): AktEtkinlik[] {
  const m = new Map<string, AktEtkinlik>();
  for (const s of list) {
    const k = etkinlikAnahtari(s);
    let g = m.get(k);
    if (!g) {
      g = { key: k, tarih: s.tarih, ad: s.ad, kapsam: s.kapsam, yer: s.yer, birim: s.birim, zumre: s.zumre, salon: false, kontrol: true, siniflar: [], ids: [] };
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
export async function takvimListesi(kurumId: string, bas: string, bit: string): Promise<AktKayit[]> {
  const { data, error } = await supabase
    .from('akademik_takvim')
    .select('id,tarih,ad,sinif,birim,zumre,kapsam,yer,salon,kontrol')
    .eq('kurum_id', kurumId)
    .gte('tarih', bas)
    .lte('tarih', bit)
    .order('tarih')
    .limit(3000);
  if (error) throw hata(error);
  return (data || []).map(kayitCevir);
}

export async function takvimYukle(mod: 'ekle' | 'degistir', yil: number, satirlar: AktSatir[]) {
  const { bas, bit } = yilAraligi(yil);
  const r = await rpc<any>('akademik_takvim_yukle', { p_mod: mod, p_bas: bas, p_bit: bit, p_satirlar: satirlar });
  return { eklenen: Number(r?.eklenen) || 0, atlanan: Number(r?.atlanan) || 0, silinen: Number(r?.silinen) || 0 };
}

/** Etkinliği ekle / değiştir (eski satırlar silinip yenileri yazılır, tek işlemde) ya da sil (satirlar boş) */
export async function etkinlikKaydet(silinecek: string[], satirlar: AktSatir[]): Promise<void> {
  await rpc('akademik_takvim_kaydet', { p_sil: silinecek, p_satirlar: satirlar });
}

export async function kontrolIsaretle(ids: string[], kontrol: boolean): Promise<void> {
  await rpc('akademik_takvim_kontrol', { p_ids: ids, p_kontrol: kontrol });
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
  let kanal: ReturnType<typeof supabase.channel> | null = null;
  try {
    kanal = supabase
      .channel(`akademik-takvim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'akademik_takvim', filter: `kurum_id=eq.${kurumId}` }, () => tetik())
      .subscribe();
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
