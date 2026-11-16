import { supabase } from './supabase';

// ============================================================================
// HATA KAYDI (Aşama 293)
// Kullanıcının ekranında oluşan hata (çizim hatası, yakalanmamış hata / söz) kendi veritabanımıza yazılır;
// sistem sahibi Yönetim › Yedek ve bakım › Hata kayıtları'nda görür. Eskiden hata yalnız o kişinin tarayıcı
// konsolunda kalıyordu: sorun, biri haber verirse öğreniliyordu.
//  - Dış servis yok; veri sistemden çıkmaz.
//  - Kayıtta kişi adı, öğrenci verisi, ekran içeriği yok: hata metni, kod izi, sayfa bölümü, rol, tarayıcı.
//  - Bir oturumda aynı hata bir kez, toplam en çok 10 kayıt; sunucuda kişi başına saatte 20 sınırı.
//  - Giriş yapılmamışsa yazılmaz. Kayıt yazılamazsa sessizce geçilir (hata kaydı kendisi hata üretmez).
// ============================================================================

const OTURUM_SINIRI = 10;
const gorulen = new Set<string>();
let yazilan = 0;

// Kullanıcının bağlantısından ya da tarayıcı eklentisinden gelen, kodda düzeltilecek bir şey olmayan hatalar
const GURULTU = [
  /Failed to fetch/i,
  /NetworkError/i,
  /Load failed/i,
  /network request failed/i,
  /dynamically imported module/i, // yeni sürüm yayınlanmış, eski parça dosyası yok (güncelleme şeridi zaten uyarır)
  /Importing a module script failed/i,
  /ResizeObserver loop/i,
  /^Script error\.?$/i, // başka kaynaktan gelen betik (eklenti); ayrıntı tarayıcıca gizlenir
  /removeChild|insertBefore|not a child/i, // çeviri eklentisi DOM çakışması (ErrorBoundary kendisi toparlar)
  /AbortError|The operation was aborted|signal is aborted/i,
  /chrome-extension:|moz-extension:|safari-web-extension:/i,
];

const kirp = (s: unknown, n: number) => String(s ?? '').slice(0, n);

/** Adresin bölümü; kimlik ve arama içermez: "#/teacher/homework/abc-123" → "/teacher/homework" */
function sayfaBolumu(): string {
  try {
    const p = window.location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean).slice(0, 2);
    return '/' + p.join('/');
  } catch {
    return '';
  }
}

/** Sitenin bu cihazda çalışan yapı dosyası (index-XXXX.js): hata eski sürümde mi oldu sorusu için */
function surum(): string {
  try {
    for (const sc of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))) {
      const m = sc.src.match(/\/assets\/(index-[\w-]+)\.js/);
      if (m) return m[1];
    }
  } catch {}
  return '';
}

/** Kod izi: site adresi ve sorgu atılır, yalnız dosya:satır kalır */
function yiginTemiz(stack: unknown): string {
  return kirp(stack, 6000)
    .replace(/https?:\/\/[^/\s)]+/g, '')
    .replace(/\?[^:\s)]*/g, '')
    .split('\n')
    .slice(0, 14)
    .join('\n')
    .slice(0, 3000);
}

function imzaOf(mesaj: string, yigin: string): string {
  // Mesajdaki sayılar ve kimlikler atılır ki aynı hata tek satırda toplansın
  const m = mesaj.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '#').replace(/\d+/g, '#').slice(0, 160);
  const ilk = (yigin.split('\n').find((l) => /\.(js|tsx?):\d+/.test(l)) || '').trim().slice(0, 120);
  let h = 5381;
  const t = `${m}|${ilk}`;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${t.length.toString(36)}`;
}

/** Bir hatayı kaydeder. kaynak: 'ekran' (çizim hatası), 'pencere' (yakalanmamış hata), 'soz' (yakalanmamış söz) */
export function hataBildir(err: unknown, kaynak: 'ekran' | 'pencere' | 'soz', ek?: string): void {
  try {
    if (yazilan >= OTURUM_SINIRI) return;
    const e = err as { message?: unknown; stack?: unknown; name?: unknown } | null;
    const ham = e && typeof e === 'object' ? `${e.name && e.name !== 'Error' ? `${kirp(e.name, 40)}: ` : ''}${kirp(e.message, 400)}` : kirp(err, 400);
    const mesaj = (ek ? `[${kirp(ek, 60)}] ` : '') + ham.trim();
    if (!ham.trim()) return;
    const yigin = yiginTemiz(e && typeof e === 'object' ? e.stack : '');
    if (GURULTU.some((re) => re.test(ham) || re.test(yigin))) return;
    const imza = imzaOf(ham, yigin);
    if (gorulen.has(imza)) return;
    gorulen.add(imza);
    yazilan++;
    const sayfa = sayfaBolumu();
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        await supabase.rpc('hata_kaydet', {
          p_mesaj: mesaj,
          p_yigin: yigin,
          p_sayfa: sayfa,
          p_kaynak: kaynak,
          p_imza: imza,
          p_surum: surum(),
          p_tarayici: kirp(navigator.userAgent, 160),
          p_rol: sayfa.startsWith('/student') ? 'ogrenci' : 'ogretmen',
        });
      } catch {
        /* kayıt yazılamadı: sessiz */
      }
    })();
  } catch {
    /* hata kaydı kendisi hata üretmez */
  }
}

let kuruldu = false;
/** Yakalanmamış hata ve söz dinleyicileri (uygulama açılışında bir kez) */
export function installHataKaydi(): void {
  if (kuruldu || typeof window === 'undefined') return;
  kuruldu = true;
  window.addEventListener('error', (ev) => {
    // Resim / betik yükleme hataları (ev.error yok, hedef bir öğe) kod hatası değildir
    if (!ev.error && !ev.message) return;
    hataBildir(ev.error || ev.message, 'pencere');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    hataBildir(ev.reason, 'soz');
  });
}

// ----------------------------------------------------------------------------- Sistem sahibi ekranı
export interface HataOzetSatiri {
  imza: string;
  mesaj: string;
  yigin: string | null;
  kaynak: string | null;
  adet: number;
  kisi: number;
  kurum: number;
  ilk: string;
  son: string;
  sayfalar: string[] | null;
  roller: string[] | null;
  surumler: string[] | null;
  tarayici: string | null;
}

export async function hataOzeti(gun: number): Promise<HataOzetSatiri[]> {
  const { data, error } = await supabase.rpc('hata_ozeti', { p_gun: gun });
  if (error) {
    if (error.code === 'PGRST202' || /hata_ozeti/.test(error.message || '')) throw new Error('Hata kaydı kurulmamış: 293 numaralı SQL çalıştırılmalı.');
    throw new Error('Hata kayıtları okunamadı.');
  }
  return (data || []) as HataOzetSatiri[];
}

export async function hataSil(imza: string): Promise<void> {
  const { error } = await supabase.rpc('hata_sil', { p_imza: imza });
  if (error) throw new Error('Silinemedi.');
}
