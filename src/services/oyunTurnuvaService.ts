// ============================================================================
// Aşama 389: OYUN TURNUVASI — birkaç oyunun toplam puanıyla öğrenci ve sınıf sıralaması
// Turnuva = öğretmenin seçtiği 2–12 oyun (yalnız görebildiği oyunlar; veritabanı tetiği denetler).
// Sıralama veritabanındaki tek işlevden gelir (oyun_turnuva_sira): öğretmen ekranı ve öğrencinin ana sayfası aynı sırayı görür.
// Yalnız bitirilmiş oyunlar sayılır. Silinen oyun turnuvadan kendiliğinden düşer.
// ============================================================================
import { supabase } from '../lib/supabase';

/** Sunucudaki sınırla aynı (sql/389 otu389_oyun_chk) */
export const TURNUVA_OYUN = { en_az: 2, en_cok: 12 };
/** canlı sinyal tabloları (sql/389 + 386): liste turnuva değişince, sıralama oyun bitince tazelenir */
export const TURNUVA_LISTE_TABLOSU = ['oyun_turnuvalari'] as const;
export const TURNUVA_SIRA_TABLOSU = ['oyun_denemeleri', 'oyun_turnuvalari'] as const;

export interface Turnuva {
  id: string;
  ad: string;
  oyunIds: string[];
  olusturan: string;
  olusturanAd: string;
  createdAt: string;
}
export type { TurnuvaSatiri, SinifSatiri } from '../lib/turnuvaSira';
export { sinifSirasi, kisaAd } from '../lib/turnuvaSira';
import type { TurnuvaSatiri } from '../lib/turnuvaSira';

function hata(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message || 'İşlem yapılamadı.';
  if (e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01' || e?.code === 'PGRST205' || /could not find|does not exist|schema cache/i.test(m))
    return new Error("Turnuva veritabanında henüz kurulu değil. Supabase SQL Editor'de 389 numaralı SQL dosyasını çalıştırın.");
  if (/otu389_ad_chk/.test(m)) return new Error('Turnuva adı 2-80 karakter olmalı.');
  if (/otu389_oyun_chk/.test(m)) return new Error(`Turnuvaya ${TURNUVA_OYUN.en_az} ile ${TURNUVA_OYUN.en_cok} arasında oyun seçin.`);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return new Error('Bağlantı yok. İnternetinizi kontrol edip tekrar deneyin.');
  return new Error(m);
}

const cevir = (r: any): Turnuva => ({
  id: String(r.id),
  ad: String(r.ad || ''),
  oyunIds: Array.isArray(r.oyun_ids) ? r.oyun_ids.map(String) : [],
  olusturan: String(r.olusturan || ''),
  olusturanAd: String(r.olusturan_ad || ''),
  createdAt: String(r.created_at || ''),
});

export async function listTurnuvalar(): Promise<Turnuva[]> {
  const { data, error } = await supabase.from('oyun_turnuvalari').select('id,ad,oyun_ids,olusturan,olusturan_ad,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) throw hata(error);
  return (data || []).map(cevir);
}

const denetle = (ad: string, oyunIds: string[]) => {
  const temiz = ad.trim();
  if (temiz.length < 2 || temiz.length > 80) throw new Error('Turnuva adı 2-80 karakter olmalı.');
  const ids = [...new Set(oyunIds)];
  if (ids.length < TURNUVA_OYUN.en_az || ids.length > TURNUVA_OYUN.en_cok) throw new Error(`Turnuvaya ${TURNUVA_OYUN.en_az} ile ${TURNUVA_OYUN.en_cok} arasında oyun seçin.`);
  return { ad: temiz, oyun_ids: ids };
};

/** kurum, kuran kişi ve adı veritabanı tetiğinde belirlenir */
export async function olusturTurnuva(ad: string, oyunIds: string[]): Promise<Turnuva> {
  const { data, error } = await supabase.from('oyun_turnuvalari').insert(denetle(ad, oyunIds) as any).select('id,ad,oyun_ids,olusturan,olusturan_ad,created_at').single();
  if (error) throw hata(error);
  return cevir(data);
}
export async function guncelleTurnuva(id: string, ad: string, oyunIds: string[]): Promise<void> {
  const { error } = await supabase.from('oyun_turnuvalari').update(denetle(ad, oyunIds) as any).eq('id', id);
  if (error) throw hata(error);
}
export async function silTurnuva(id: string): Promise<void> {
  const { error } = await supabase.from('oyun_turnuvalari').delete().eq('id', id);
  if (error) throw hata(error);
}

export async function turnuvaSirasi(id: string): Promise<TurnuvaSatiri[]> {
  const { data, error } = await supabase.rpc('oyun_turnuva_sira', { p_turnuva: id });
  if (error) throw hata(error);
  return ((data as any[]) || []).map((r) => ({
    studentId: String(r.student_id),
    ad: String(r.ad || ''),
    classId: String(r.class_id || ''),
    classAd: String(r.class_ad || ''),
    puan: Number(r.puan) || 0,
    dogru: Number(r.dogru) || 0,
    toplam: Number(r.toplam) || 0,
    oyunSayisi: Number(r.oyun_sayisi) || 0,
    sira: Number(r.sira) || 0,
  }));
}
