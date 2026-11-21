// ============================================================================
// Aşama 307: İŞLEM GEÇMİŞİ — kim, neyi, ne zaman değiştirdi (not, günlük yoklama, ders yoklaması, öğrenci bilgisi)
// Kayıtları veritabanı tetikleri yazar (sql/307); burada yalnız okuma ve ekranda okunacak yazıya çevirme var.
// Okuma yalnız kurum yöneticisine (rol yetkileri açıkken müdür / müdür yrd.) ve yalnız kendi kurumuna açıktır.
// ============================================================================
import { supabase } from '../lib/supabase';
import { agHatasiMi, baglantiNedeni } from '../lib/baglanti';

// Aşama 345: 'sifre' = ilk giriş şifresi görüntülendi (islem 'gor'); kaydı sql/345 işlevleri yazar
export type GecmisTur = 'not' | 'yoklama' | 'ders_yoklama' | 'ogrenci' | 'sifre';
export type GecmisIslem = 'ekle' | 'degistir' | 'sil' | 'gor';

export interface GecmisSatir {
  zaman: string;
  /** sayfalama anahtarı: 1 = işlem geçmişi tablosu, 2 = ders yoklaması geçmişi; kid o tablodaki sıra numarası */
  kaynak: number;
  kid: number;
  tur: GecmisTur;
  islem: GecmisIslem;
  ogrenciId: string | null;
  ogrenciAd: string;
  sinifAd: string;
  kimAd: string;
  ayrinti: Record<string, any>;
}

export const GECMIS_SAYFA = 50;

/** `once`: bir önceki sayfanın son satırı (ondan eskiler okunur) */
export async function islemGecmisiOku(f: { tur?: GecmisTur | null; ogrenciId?: string | null; gun: number; once?: GecmisSatir | null }): Promise<GecmisSatir[]> {
  const { data, error } = await supabase.rpc('islem_gecmisi_oku', {
    p_tur: f.tur || null,
    p_ogrenci: f.ogrenciId || null,
    p_gun: f.gun,
    p_once: f.once?.zaman || null,
    p_once_kaynak: f.once ? f.once.kaynak : null,
    p_once_id: f.once ? f.once.kid : null,
    p_limit: GECMIS_SAYFA,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('İşlem geçmişi kurulmamış: 307 numaralı SQL çalıştırılmalı.');
    if (error.code === '42501') throw new Error(error.message || 'İşlem geçmişini yalnız kurum yöneticisi görür.');
    if (agHatasiMi(error)) throw new Error(baglantiNedeni());
    throw new Error('İşlem geçmişi okunamadı.');
  }
  return ((data || []) as any[]).map((r) => ({
    zaman: String(r.zaman || ''),
    kaynak: Number(r.kaynak) || 0,
    kid: Number(r.kid) || 0,
    tur: r.tur as GecmisTur,
    islem: r.islem as GecmisIslem,
    ogrenciId: r.ogrenci_id ? String(r.ogrenci_id) : null,
    ogrenciAd: String(r.ogrenci_ad || ''),
    sinifAd: String(r.sinif_ad || ''),
    kimAd: String(r.kim_ad || ''),
    ayrinti: r.ayrinti && typeof r.ayrinti === 'object' ? r.ayrinti : {},
  }));
}

// ---------------------------------------------------------------- ekranda okunacak yazı
const DURUM: Record<string, string> = { present: 'Geldi', absent: 'Gelmedi', late: 'Geç', excused: 'İzinli' };
const OGRENCI_DURUM: Record<string, string> = { active: 'Aktif', inactive: 'Pasif', suspended: 'Askıda' };
const CINSIYET: Record<string, string> = { K: 'Kız', E: 'Erkek' };
const GIZLI: Record<string, string> = { telefon: 'telefon', eposta: 'e-posta', veli: 'veli bilgisi', tc: 'TC' };
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "2026-11-17" → "17 Kas" */
export function kisaTarih(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${Number(m[3])} ${AY[Number(m[2]) - 1] || ''}`.trim() : String(v || '');
}
const sayi = (v: unknown) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
};
const durum = (v: unknown) => (v ? DURUM[String(v)] || String(v) : '—');
const ok = (a: string, b: string) => `${a} → ${b}`;
const ad = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Kaydın tek satırlık açıklaması (öğrenci adı ve kişi ayrı gösterilir) */
export function gecmisMetni(s: GecmisSatir): string {
  const a = s.ayrinti || {};
  if (s.tur === 'not') {
    const ne = [a.ders, a.tur].filter(Boolean).join(' · ');
    if (s.islem === 'ekle') return `Not girildi: ${ne} · ${sayi(a.puan)}`;
    if (s.islem === 'sil') return `Not silindi: ${ne} · ${sayi(a.puan)}`;
    const d = (a.degisen || {}) as Record<string, [unknown, unknown]>;
    const parca: string[] = [];
    if (d.puan) parca.push(ok(sayi(d.puan[0]), sayi(d.puan[1])));
    if (d.tavan) parca.push(`en yüksek puan ${ok(sayi(d.tavan[0]), sayi(d.tavan[1]))}`);
    if (d.ders) parca.push(`ders ${ok(ad(d.ders[0]), ad(d.ders[1]))}`);
    if (d.tur) parca.push(`tür ${ok(ad(d.tur[0]), ad(d.tur[1]))}`);
    if (d.tarih) parca.push(`tarih ${ok(kisaTarih(d.tarih[0]), kisaTarih(d.tarih[1]))}`);
    if (d.aciklama) parca.push('açıklama değişti');
    if (d.ogrenci) parca.push('başka öğrenciye aktarıldı');
    return `Not değişti: ${ne}${parca.length ? ` · ${parca.join(', ')}` : ''}`;
  }
  if (s.tur === 'yoklama') {
    const ne = [a.ders && a.ders !== 'Genel' ? a.ders : '', kisaTarih(a.tarih)].filter(Boolean).join(' · ');
    if (s.islem === 'ekle' || s.islem === 'sil') {
      const say = (a.sayilar || {}) as Record<string, number>;
      const ozet = ['present', 'absent', 'late', 'excused']
        .filter((k) => Number(say[k]) > 0)
        .map((k) => `${say[k]} ${DURUM[k].toLocaleLowerCase('tr-TR')}`)
        .join(', ');
      return s.islem === 'ekle' ? `Yoklama alındı: ${ne}${ozet ? ` · ${ozet}` : ''}` : `Yoklama silindi: ${ne}`;
    }
    if (!a.eski) return `Yoklamaya eklendi: ${durum(a.yeni)} (${ne})`;
    if (!a.yeni) return `Yoklamadan çıkarıldı: ${durum(a.eski)} idi (${ne})`;
    return `Yoklama değişti: ${ok(durum(a.eski), durum(a.yeni))} (${ne})`;
  }
  if (s.tur === 'sifre') {
    if (a.ne === 'liste') return `Giriş bilgileri listesi açıldı (${sayi(a.sayi)} kişinin ilk şifresi)`;
    return a.hesap === 'teacher' ? 'Öğretmenin ilk giriş şifresi görüntülendi' : 'İlk giriş şifresi görüntülendi';
  }
  if (s.tur === 'ders_yoklama') {
    const ne = [a.ders, a.sira ? `${a.sira}. ders` : '', kisaTarih(a.tarih)].filter(Boolean).join(' · ');
    return `Ders yoklaması değişti: ${ok(durum(a.eski), durum(a.yeni))} (${ne})`;
  }
  // öğrenci bilgisi
  const no = a.numara ? ` (no ${a.numara})` : '';
  if (s.islem === 'ekle') return `Öğrenci eklendi${no}`;
  if (s.islem === 'sil') return `Öğrenci silindi${no}`;
  const d = (a.degisen || {}) as Record<string, [unknown, unknown]>;
  const parca: string[] = [];
  if (d.ad) parca.push(`ad ${ok(ad(d.ad[0]), ad(d.ad[1]))}`);
  if (d.numara) parca.push(`okul no ${ok(ad(d.numara[0]), ad(d.numara[1]))}`);
  if (d.sinif) parca.push(`sınıf ${ok(ad(d.sinif[0]), ad(d.sinif[1]))}`);
  if (d.durum) parca.push(`durum ${ok(OGRENCI_DURUM[String(d.durum[0])] || ad(d.durum[0]), OGRENCI_DURUM[String(d.durum[1])] || ad(d.durum[1]))}`);
  if (d.cinsiyet) parca.push(`cinsiyet ${ok(CINSIYET[String(d.cinsiyet[0])] || '—', CINSIYET[String(d.cinsiyet[1])] || '—')}`);
  const gizli = (Array.isArray(a.gizli) ? a.gizli : []).map((k: string) => GIZLI[k] || k);
  if (gizli.length) {
    const vs = Array.isArray(a.veli_sayisi) && a.veli_sayisi[0] !== a.veli_sayisi[1] ? ` (${a.veli_sayisi[0]} → ${a.veli_sayisi[1]} veli)` : '';
    parca.push(`${gizli.join(', ')}${(a.gizli as string[]).includes('veli') ? vs : ''} değişti`);
  }
  return `Bilgileri değişti: ${parca.join(', ') || 'kayıt güncellendi'}`;
}
