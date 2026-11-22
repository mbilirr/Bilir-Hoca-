import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { callMailOnce, type MailResult } from '../lib/mailApi';
import { dataService } from './dataService';

// ============================================================================
// Aşama 367: VELİ GÖRÜNÜMÜ (okul tarafı)
// Velinin sayfası sunucuda hazırlanır (/v/<kod>, api/mail.js). Burası okul personelinin işleri:
//  - veli_durumum(): bölüm açık mı, ayarlar, oturumdaki kişi gönderebilir / ayarı değiştirebilir mi (veritabanı karar verir)
//  - durum / gönder / kopyala / iptal: sunucu (api/mail.js action 'veli'); bağlantı kodu yalnız sunucuda üretilir
// Bölüm kapalıyken (kurumlar.modules.veli) hiçbir istek atılmaz.
// ============================================================================

export type VeliKart = 'devam' | 'odev' | 'soru' | 'etut' | 'deneme';
export type VeliGonderen = 'yonetici' | 'rehberlik' | 'ogretmen';
export type VeliSure = '7' | '30' | 'donem';
export interface VeliAyar {
  goster: VeliKart[];
  gonderen: VeliGonderen[];
  sure: VeliSure;
}
export interface VeliDurumum {
  acik: boolean;
  ayar: VeliAyar;
  gonderebilir: boolean;
  duzenleyebilir: boolean;
}
export type VeliBaglantiDurum = 'acik' | 'iptal' | 'dolmus';
export interface VeliSatiri {
  sira: number;
  yakinlik: string;
  ad: string;
  tel: string;
  eposta: string;
  baglanti: {
    durum: VeliBaglantiDurum;
    bitis: string;
    acilma: number;
    sonAcilis: string | null;
    sonGonderim: string | null;
    sonKanal: 'sms' | 'eposta' | 'kopya' | null;
  } | null;
}
export interface VeliOgrenciDurumu {
  id: string;
  veliler: VeliSatiri[];
}
export interface VeliDurumYaniti {
  sure: VeliSure;
  yenileGun: number;
  smsHazir: boolean;
  ogrenciler: VeliOgrenciDurumu[];
}
export type VeliKanal = 'sms' | 'eposta';

export const VELI_KARTLAR: Array<{ key: VeliKart; title: string; modul: string }> = [
  { key: 'devam', title: 'Devam', modul: 'grades' },
  { key: 'odev', title: 'Ödevler', modul: 'homework' },
  { key: 'soru', title: 'Soru Çözümü', modul: 'questions' },
  { key: 'etut', title: 'Etütler', modul: 'etut' },
  { key: 'deneme', title: 'Son Deneme', modul: 'deneme' },
];
export const VELI_SURELER: Array<{ value: VeliSure; label: string }> = [
  { value: '7', label: '7 gün' },
  { value: '30', label: '30 gün' },
  { value: 'donem', label: 'Dönem sonu' },
];
/** sunucunun bir çağrıda işlediği en çok öğrenci (api/mail.js VELI_EN_COK_OGRENCI) */
export const VELI_PARCA = 60;
/** gönderimde bir çağrıdaki öğrenci (en çok 3 veli: 30 e-posta / SMS; Vercel süresine sığar) */
const GONDER_PARCA = 10;

const SQL_YOK = "Veli görünümü için Supabase SQL Editor'de 367_veli_gorunumu.sql dosyasını çalıştırın.";

// ---------------------------------------------------------------- veli_durumum (oturum başına bir okuma)
let durumum: VeliDurumum | null = null;
let durumumAnahtar = '';
let okunuyor: Promise<void> | null = null;
let surum = 0;
const dinleyiciler = new Set<() => void>();
const duyur = () => {
  surum++;
  dinleyiciler.forEach((d) => d());
};

function bolumAcik(): boolean {
  return dataService.getMyKurum().modules?.veli === true;
}
function anahtar(): string {
  const my = dataService.getMyKurum();
  return `${dataService.getAuthSession()?.user?.id || ''}|${my.kurumId || ''}|${bolumAcik() ? 1 : 0}`;
}

function temizAyar(v: any): VeliAyar {
  const goster = VELI_KARTLAR.map((k) => k.key).filter((k) => Array.isArray(v?.goster) && v.goster.includes(k));
  const gonderen = (['yonetici', 'rehberlik', 'ogretmen'] as VeliGonderen[]).filter((g) => g === 'yonetici' || (Array.isArray(v?.gonderen) && v.gonderen.includes(g)));
  const sure: VeliSure = v?.sure === '7' || v?.sure === 'donem' ? v.sure : '30';
  return { goster, gonderen, sure };
}

async function durumumOku(): Promise<void> {
  const k = anahtar();
  if (!bolumAcik()) {
    durumum = null;
    durumumAnahtar = k;
    duyur();
    return;
  }
  const { data, error } = await supabase.rpc('veli_durumum');
  if (anahtar() !== k) return; // bu arada oturum / kurum değişti
  durumumAnahtar = k;
  if (error || !data || typeof data !== 'object') {
    if (error) console.warn('[veli] veli_durumum', error.message || error);
    durumum = null;
  } else {
    const d: any = data;
    durumum = { acik: d.acik === true, ayar: temizAyar(d.ayar), gonderebilir: d.gonderebilir === true, duzenleyebilir: d.duzenleyebilir === true };
  }
  duyur();
}

function tazele(): void {
  if (okunuyor) return;
  okunuyor = durumumOku()
    .catch((e) => console.warn('[veli] durum okunamadı', e))
    .finally(() => {
      okunuyor = null;
    });
}

function abone(d: () => void) {
  dinleyiciler.add(d);
  return () => {
    dinleyiciler.delete(d);
  };
}
const anlik = () => surum;

/** Oturumdaki kişinin veli görünümü durumu; bölüm kapalıysa ya da 367 SQL'i yoksa null */
export function useVeliDurumum(): VeliDurumum | null {
  useSyncExternalStore(abone, anlik, anlik);
  const k = anahtar();
  useEffect(() => {
    if (durumumAnahtar !== k) tazele();
  }, [k]);
  // kurum bilgisi (bölüm anahtarı) sonradan değişirse yeniden okunur
  useEffect(
    () =>
      dataService.subscribe(() => {
        if (durumumAnahtar !== anahtar()) tazele();
      }),
    []
  );
  return durumumAnahtar === k && bolumAcik() ? durumum : null;
}

export async function veliAyarKaydet(ayar: VeliAyar): Promise<VeliAyar> {
  const { data, error } = await supabase.rpc('veli_ayar_kaydet', { p_ayar: ayar });
  if (error) {
    if (/veli_ayar_kaydet/i.test(error.message || '') && /(not find|does not exist|schema cache)/i.test(error.message || '')) throw new Error(SQL_YOK);
    throw new Error(error.message || 'Ayar kaydedilemedi.');
  }
  const yeni = temizAyar(data);
  if (durumum) durumum = { ...durumum, ayar: yeni };
  duyur();
  return yeni;
}

// ---------------------------------------------------------------- sunucu işleri
async function veliCagir(payload: Record<string, any>): Promise<MailResult> {
  const r = await callMailOnce('veli', payload);
  if (!r.ok) throw new Error(r.error || 'İşlem yapılamadı.');
  return r;
}

/** Öğrencilerin velileri ve bağlantı durumları (60'arlı parçalar, sırayla) */
export async function veliDurum(studentIds: string[]): Promise<VeliDurumYaniti> {
  const out: VeliDurumYaniti = { sure: '30', yenileGun: 7, smsHazir: false, ogrenciler: [] };
  for (let i = 0; i < studentIds.length; i += VELI_PARCA) {
    const r = await veliCagir({ op: 'durum', studentIds: studentIds.slice(i, i + VELI_PARCA) });
    out.sure = r.sure === '7' || r.sure === 'donem' ? r.sure : '30';
    out.yenileGun = Number(r.yenileGun) || 7;
    out.smsHazir = !!r.smsHazir;
    out.ogrenciler.push(...((r.ogrenciler as VeliOgrenciDurumu[]) || []));
  }
  return out;
}

export interface VeliGonderSonucu {
  sent: number;
  dry: number;
  failed: number;
  skipped: number;
  limited: number;
  atlandi: number;
  iletisimYok: number;
  remaining: number;
  notConfigured: boolean;
  authError: boolean;
  errors: string[];
}

/**
 * Gönderim. Öğrenciler 10'arlı parçalarla gider. Sunucu bir çağrıda hepsini gönderemezse (saatlik sınır, süre) kalanlar
 * "gönderilmedi" kalır; aynı parça yalnız eksikler için yeniden istenir (yenileme bir kez yapılır, giden bağlantı bozulmaz).
 */
export async function veliGonder(
  studentIds: string[],
  kanal: VeliKanal,
  secenek: { veliSira?: number[]; yalnizEksik?: boolean; yenile?: boolean } = {},
  ilerleme?: (bitti: number, toplam: number) => void
): Promise<VeliGonderSonucu> {
  const t: VeliGonderSonucu = { sent: 0, dry: 0, failed: 0, skipped: 0, limited: 0, atlandi: 0, iletisimYok: 0, remaining: 0, notConfigured: false, authError: false, errors: [] };
  for (let i = 0; i < studentIds.length; i += GONDER_PARCA) {
    const parca = studentIds.slice(i, i + GONDER_PARCA);
    let payload: Record<string, any> = { op: 'gonder', studentIds: parca, kanal, ...secenek };
    for (let tur = 0; tur < 4; tur++) {
      const r = await veliCagir(payload);
      t.sent += r.sent || 0;
      t.dry += r.dry || 0;
      t.failed += r.failed || 0;
      t.limited += r.limited || 0;
      if (tur === 0) {
        t.skipped += r.skipped || 0;
        t.atlandi += r.atlandi || 0;
        t.iletisimYok += r.iletisimYok || 0;
      }
      t.errors = [...t.errors, ...((r.errors as string[]) || [])].slice(0, 3);
      if (r.notConfigured) t.notConfigured = true;
      if (r.authError) t.authError = true;
      const kalan = Number(r.remaining) || 0;
      if (!kalan || r.notConfigured || r.authError || !(r.sent || 0)) {
        t.remaining += kalan;
        break;
      }
      payload = { ...payload, yenile: false, yalnizEksik: true };
    }
    if (t.notConfigured || t.authError) break;
    ilerleme?.(Math.min(studentIds.length, i + GONDER_PARCA), studentIds.length);
  }
  return t;
}

export async function veliKopya(studentId: string, veliSira: number): Promise<{ url: string; bitis: string }> {
  const r = await veliCagir({ op: 'kopya', studentId, veliSira });
  return { url: String(r.url || ''), bitis: String(r.bitis || '') };
}

export async function veliIptal(studentIds: string[], veliSira?: number): Promise<number> {
  let n = 0;
  for (let i = 0; i < studentIds.length; i += VELI_PARCA) {
    const parca = studentIds.slice(i, i + VELI_PARCA);
    const r = await veliCagir(parca.length === 1 && veliSira !== undefined ? { op: 'iptal', studentId: parca[0], veliSira } : { op: 'iptal', studentIds: parca });
    n += Number(r.revoked) || 0;
  }
  return n;
}

// ---------------------------------------------------------------- ekran yardımcıları
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
/** "20 Kas" / "bugün 09:12" / "dün 18:40" */
export function veliTarihYazi(iso: string | null | undefined, saatli = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const gun = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const fark = Math.round((gun(new Date()) - gun(d)) / 86400000);
  const saat = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (saatli && fark === 0) return `bugün ${saat}`;
  if (saatli && fark === 1) return `dün ${saat}`;
  return `${d.getDate()} ${AYLAR[d.getMonth()]}`;
}

/** Bağlantı açık ve gönderilmiş mi, kaç gün kaldı */
export function veliBaglantiOzeti(v: VeliSatiri, yenileGun: number): 'acik' | 'doluyor' | 'yok' {
  const b = v.baglanti;
  if (!b || b.durum !== 'acik' || !b.sonGonderim) return 'yok';
  return Date.parse(b.bitis) - Date.now() <= yenileGun * 86400000 ? 'doluyor' : 'acik';
}

/** Öğrencinin sınıf listesindeki durumu: velisi yok > eksik veli var > süresi doluyor > açık */
export function veliOgrenciOzeti(o: VeliOgrenciDurumu | undefined, yenileGun: number): 'kayitsiz' | 'gonderilmedi' | 'doluyor' | 'acik' {
  if (!o || !o.veliler.length) return 'kayitsiz';
  const d = o.veliler.map((v) => veliBaglantiOzeti(v, yenileGun));
  if (d.includes('yok')) return 'gonderilmedi';
  if (d.includes('doluyor')) return 'doluyor';
  return 'acik';
}

/** Gönderim sonucunu tek cümleye çevirir */
export function veliSonucYazi(r: VeliGonderSonucu, kanal: VeliKanal): { tur: 'basari' | 'uyari' | 'hata'; baslik: string; ayrinti?: string } {
  const ad = kanal === 'sms' ? 'SMS' : 'e-posta';
  if (r.notConfigured) return { tur: 'hata', baslik: 'E-posta gönderilmedi', ayrinti: 'Gönderim hesabı ayarlanmamış. Profil menüsünden "E-posta Ayarları"na bakın.' };
  if (r.authError) return { tur: 'hata', baslik: 'E-posta gönderilemedi', ayrinti: r.errors[0] || 'Gmail girişi reddedildi.' };
  const ek: string[] = [];
  if (r.atlandi) ek.push(`${r.atlandi} velinin açık bağlantısı zaten gönderilmişti`);
  if (r.iletisimYok) ek.push(`${r.iletisimYok} velinin ${kanal === 'sms' ? 'telefonu' : 'e-postası'} kayıtlı değil`);
  if (r.skipped) ek.push(`${r.skipped} ${ad} bugün zaten gitmişti`);
  if (r.limited) ek.push(`${r.limited} ${ad} günlük sınır yüzünden gitmedi`);
  if (r.remaining) ek.push(`${r.remaining} ${ad} saatlik sınır yüzünden bekliyor; biraz sonra "Eksiklere gönder" deyin`);
  if (r.failed) ek.push(`${r.failed} ${ad} gönderilemedi${r.errors[0] ? ` (${r.errors[0]})` : ''}`);
  const ayrinti = ek.length ? ek.join('; ') + '.' : undefined;
  if (r.dry && !r.sent) return { tur: 'uyari', baslik: `${r.dry} ${ad} deneme kipinde hazırlandı (gerçek gönderim kapalı)`, ayrinti };
  if (!r.sent) return { tur: r.failed ? 'hata' : 'uyari', baslik: `Hiç ${ad} gönderilmedi`, ayrinti };
  return { tur: r.failed || r.limited || r.remaining ? 'uyari' : 'basari', baslik: `${r.sent} veliye ${ad} gönderildi`, ayrinti };
}
