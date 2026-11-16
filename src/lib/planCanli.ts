// Aşama 277: ÇALIŞMA PLANI ANLIK SİNYALİ
//  Veritabanında içeriksiz "değişti" işareti (plan_sinyal: öğrenci kimliği + zaman; sql/277). Plan başlığı ya da görevi
//  değişince (öğretmen görev ekler / gönderir, öğrenci "yaptım" işaretler) ilgili ekran plan verisini yeniden okur.
//  - Öğrenci yalnız kendi satırını, öğretmen kendi kurumunun satırlarını alır (RLS).
//  - Kanal yalnız plan ekranı açıkken kurulur; aynı ekranda birden çok dinleyici tek kanalı paylaşır.
//  - SQL kurulu değilse ya da kanal kopuksa hiçbir şey bozulmaz: sekmeye dönünce yenileme sürer, öğrencide ayrıca
//    90 sn'lik yedek okuma (yalnız sekme görünürken) devreye girer.
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type Dinleyici = { degisti: (studentId: string) => void; durum: (canli: boolean) => void };
type Kayit = { kanal: ReturnType<typeof supabase.channel> | null; dinleyiciler: Set<Dinleyici>; canli: boolean };
const kanallar = new Map<string, Kayit>();

/** Plan sinyalini dinler. studentId verilirse yalnız o öğrencinin satırı (öğrenci oturumu). Dönüş: dinlemeyi bırak. */
export function planCanliDinle(studentId: string | null, dinleyici: Dinleyici): () => void {
  const anahtar = studentId || '*';
  let kayit = kanallar.get(anahtar);
  if (!kayit) {
    const yeni: Kayit = { kanal: null, dinleyiciler: new Set(), canli: false };
    kayit = yeni;
    kanallar.set(anahtar, yeni);
    try {
      yeni.kanal = supabase
        .channel(`plan-sinyal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'plan_sinyal', ...(studentId ? { filter: `student_id=eq.${studentId}` } : {}) },
          (p: any) => {
            const id = String((p?.new && p.new.student_id) || (p?.old && p.old.student_id) || '');
            yeni.dinleyiciler.forEach((d) => {
              try {
                d.degisti(id);
              } catch {
                /* bir dinleyicinin hatası ötekileri durdurmaz */
              }
            });
          },
        )
        .subscribe((s: string) => {
          const canli = s === 'SUBSCRIBED';
          if (canli === yeni.canli) return;
          yeni.canli = canli;
          yeni.dinleyiciler.forEach((d) => d.durum(canli));
        });
    } catch {
      yeni.kanal = null;
    }
  }
  const k = kayit;
  k.dinleyiciler.add(dinleyici);
  if (k.canli) dinleyici.durum(true);
  return () => {
    k.dinleyiciler.delete(dinleyici);
    if (k.dinleyiciler.size > 0) return;
    kanallar.delete(anahtar);
    try {
      if (k.kanal) void supabase.removeChannel(k.kanal);
    } catch {
      /* kanal zaten kapalı */
    }
  };
}

const BEKLE_MS = 1000; // art arda gelen sinyaller (toplu gönderim) tek okumaya iner

/**
 * Plan ekranını anlık tutar: sinyal gelince `yenile` çağrılır (sekme görünürken; arka plandaysa dönüşte ekranın kendi
 * "sekmeye dönünce yenile" kuralı çalışır).
 *  - studentId: öğrenci oturumunda kendi kimliği; öğretmende null (kurumun bütün sinyalleri gelir, `ilgili` ile süzülür).
 *  - yedekMs: kanal canlı DEĞİLKEN ve sekme görünürken bu aralıkla okunur (öğrenci ekranları).
 */
export function usePlanCanli(
  aktif: boolean,
  yenile: () => void,
  secenek: { studentId?: string | null; ilgili?: (studentId: string) => boolean; yedekMs?: number } = {},
): void {
  const yenileRef = useRef(yenile);
  yenileRef.current = yenile;
  const ilgiliRef = useRef(secenek.ilgili);
  ilgiliRef.current = secenek.ilgili;
  const studentId = secenek.studentId || null;
  const yedekMs = secenek.yedekMs || 0;
  useEffect(() => {
    if (!aktif) return;
    let canli = false;
    let ilk = true; // ilk bağlanışta okuma yapılmaz (ekran zaten açılışta okur)
    let bekle: ReturnType<typeof setTimeout> | null = null;
    const birak = planCanliDinle(studentId, {
      degisti: (id) => {
        if (ilgiliRef.current && !ilgiliRef.current(id)) return;
        if (bekle) clearTimeout(bekle);
        bekle = setTimeout(() => {
          bekle = null;
          if (document.visibilityState === 'visible') yenileRef.current();
        }, BEKLE_MS);
      },
      durum: (c) => {
        // kanal yeniden bağlandıysa arada kaçan değişiklik için bir kez okunur
        if (c && !canli && !ilk && document.visibilityState === 'visible') yenileRef.current();
        if (c) ilk = false;
        canli = c;
      },
    });
    const yedek = yedekMs
      ? setInterval(() => {
          if (!canli && document.visibilityState === 'visible') yenileRef.current();
        }, yedekMs)
      : null;
    return () => {
      birak();
      if (bekle) clearTimeout(bekle);
      if (yedek) clearInterval(yedek);
    };
  }, [aktif, studentId, yedekMs]);
}
