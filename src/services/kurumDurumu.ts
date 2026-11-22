// ============================================================================
// Aşama 368: KURUM / BİREYSEL HESAP DONDURMA (ekran tarafı)
//  - Sistem sahibi: dondurulmuş kurumların listesi (kart ve kurum ayrıntısı), dondur / etkinleştir
//  - Herkes: oturumdaki hesap durduruldu mu (hesap_durumum); durdurulduysa tam ekran perde açılır, oturum kapanır
// Kurallar veritabanında (sql/368): giriş kancası anahtar vermez, sunucu gönderimleri atlar. Bu dosya yalnız gösterir.
// ============================================================================
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type DondurmaNeden = 'odeme' | 'istek' | 'donem' | 'diger';
export const DONDURMA_NEDENLERI: Array<{ value: DondurmaNeden; label: string }> = [
  { value: 'odeme', label: 'Ödeme bekleniyor' },
  { value: 'istek', label: 'Kurum isteği' },
  { value: 'donem', label: 'Dönem arası' },
  { value: 'diger', label: 'Diğer' },
];
export const nedenYazi = (n?: string | null): string => DONDURMA_NEDENLERI.find((x) => x.value === n)?.label || '';

export interface KurumDurumu {
  kurumId: string;
  durum: 'etkin' | 'donduruldu';
  degisti: string | null;
  neden: DondurmaNeden | null;
  notu: string;
}

const KURULU_DEGIL = "Önce Supabase'de 368 numaralı SQL'i çalıştırın.";
const kurulumHatasi = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST202' || /kurum_dondur|kurum_etkinlestir|kurum_durumlari_oku|schema cache/i.test(e.message || ''));

const satir = (r: any): KurumDurumu => ({
  kurumId: String(r?.kurum_id || ''),
  durum: r?.durum === 'donduruldu' ? 'donduruldu' : 'etkin',
  degisti: r?.degisti || null,
  neden: (['odeme', 'istek', 'donem', 'diger'] as const).includes(r?.neden) ? r.neden : null,
  notu: typeof r?.notu === 'string' ? r.notu : '',
});

// ---------------------------------------------------------------------------- sistem sahibi: liste (modül önbelleği)
type Durum = { harita: Map<string, KurumDurumu>; kurulu: boolean; yuklendi: boolean };
let durum: Durum = { harita: new Map(), kurulu: true, yuklendi: false };
const dinleyiciler = new Set<() => void>();
const yay = () => dinleyiciler.forEach((f) => f());
let okuma: Promise<void> | null = null;

export function kurumDurumlariniOku(): Promise<void> {
  if (okuma) return okuma;
  okuma = (async () => {
    const { data, error } = await supabase.rpc('kurum_durumlari_oku');
    if (error) {
      durum = { harita: new Map(), kurulu: !kurulumHatasi(error), yuklendi: true };
    } else {
      const list = Array.isArray(data) ? data.map(satir).filter((x) => x.kurumId) : [];
      durum = { harita: new Map(list.map((x) => [x.kurumId, x])), kurulu: true, yuklendi: true };
    }
    yay();
  })().finally(() => {
    okuma = null;
  });
  return okuma;
}

/** Sistem sahibi: dondurulmuş kurumlar (etkin kurum haritada yer almaz). kurulu=false: 368 SQL'i yok */
export function useKurumDurumlari(): Durum {
  const [d, setD] = useState(durum);
  useEffect(() => {
    const f = () => setD(durum);
    dinleyiciler.add(f);
    if (!durum.yuklendi) void kurumDurumlariniOku();
    else f();
    return () => {
      dinleyiciler.delete(f);
    };
  }, []);
  return d;
}

const isle = (data: unknown) => {
  const x = satir(data);
  if (!x.kurumId) return;
  const h = new Map(durum.harita);
  if (x.durum === 'donduruldu') h.set(x.kurumId, x);
  else h.delete(x.kurumId);
  durum = { ...durum, harita: h, kurulu: true };
  yay();
};

export async function kurumDondur(kurumId: string, neden: DondurmaNeden, not: string): Promise<void> {
  const { data, error } = await supabase.rpc('kurum_dondur', { p_kurum_id: kurumId, p_neden: neden, p_not: not.trim().slice(0, 300) });
  if (error) throw new Error(kurulumHatasi(error) ? KURULU_DEGIL : error.message);
  isle(data);
}

export async function kurumEtkinlestir(kurumId: string): Promise<void> {
  const { data, error } = await supabase.rpc('kurum_etkinlestir', { p_kurum_id: kurumId });
  if (error) throw new Error(kurulumHatasi(error) ? KURULU_DEGIL : error.message);
  isle(data);
}

/** "22 Kas 2026 · Ödeme bekleniyor" (ek kullanılmaz: ay adlarında ses uyumu bozulmasın) */
export function dondurmaOzeti(d: KurumDurumu | undefined): string {
  if (!d) return '';
  const t = d.degisti ? new Date(d.degisti) : null;
  const tarih = t && !Number.isNaN(t.getTime()) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' }).format(t) : '';
  return [tarih, nedenYazi(d.neden)].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------- herkes: oturumdaki hesap durduruldu mu
let durduruldu = false;
const perdeDinleyici = new Set<(v: boolean) => void>();
let sonDenetim = 0;
let denetleniyor: Promise<void> | null = null;

/** Sunucuya sorar (canlı sinyalde, açılışta, sekmeye dönünce). zorla=false iken dakikada en çok bir kez. */
export function hesapDurumunuDenetle(zorla = false): Promise<void> {
  if (durduruldu) return Promise.resolve();
  if (!zorla && Date.now() - sonDenetim < 60_000) return Promise.resolve();
  if (denetleniyor) return denetleniyor;
  sonDenetim = Date.now();
  denetleniyor = (async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return;
    const { data, error } = await supabase.rpc('hesap_durumum');
    if (error || !data || (data as any).donduruldu !== true) return; // 368 kurulu değil ya da etkin
    durduruldu = true;
    perdeDinleyici.forEach((f) => f(true));
    // anahtar artık yenilenmez: bu sekmedeki oturum hemen kapatılır (arka plandaki istekler de durur)
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  })().finally(() => {
    denetleniyor = null;
  });
  return denetleniyor;
}

/** App: perde açık mı; açılışta, girişte ve sekmeye dönünce denetler */
export function useHesapDurduruldu(): boolean {
  const [v, setV] = useState(durduruldu);
  useEffect(() => {
    perdeDinleyici.add(setV);
    void hesapDurumunuDenetle(true);
    const { data: sub } = supabase.auth.onAuthStateChange((olay) => {
      // supabase-js: oturum olayının içinden auth çağrısı yapılmaz (kilitlenir); bir sonraki turda sorulur
      if (olay === 'SIGNED_IN' || olay === 'TOKEN_REFRESHED') setTimeout(() => void hesapDurumunuDenetle(olay === 'SIGNED_IN'), 0);
    });
    const gorunur = () => document.visibilityState === 'visible' && void hesapDurumunuDenetle();
    document.addEventListener('visibilitychange', gorunur);
    return () => {
      perdeDinleyici.delete(setV);
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', gorunur);
    };
  }, []);
  return v;
}
