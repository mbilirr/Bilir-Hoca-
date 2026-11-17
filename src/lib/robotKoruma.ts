// ============================================================================
// Aşama 309: GİRİŞTE ROBOT KORUMASI (Cloudflare Turnstile + Supabase Auth CAPTCHA)
// Şifre sınayan her istek (giriş, şifre değiştirirken eski şifre, hesap bağlama, sistem sahibine geçiş) yanında
// tek kullanımlık bir doğrulama jetonu taşır. Jetonu Supabase sunucusu denetler: koruma Supabase'de açıldıktan
// sonra jetonsuz istek (sayfayı atlayıp doğrudan sunucuya gelen robot) reddedilir.
// - Site anahtarı (herkese açık) VITE_TURNSTILE_SITE_KEY ortam değişkeninden gelir. Yoksa koruma kapalıdır ve
//   giriş eskisi gibi çalışır. Gizli anahtar YALNIZ Supabase panelinde durur; kodda ve bu projede hiçbir yerde yok.
// - Görünmez çalışır; Cloudflare emin olamazsa ekranın altında küçük bir "robot değilim" kutusu çıkar.
// - Betik yalnız ilk jeton istendiğinde yüklenir (giriş ekranını yavaşlatmaz).
// ============================================================================

const SITE_KEY = ((import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();
const BETIK = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SURE_MS = 90_000; // kutu çıkarsa kişinin işaretlemesi için yeterli süre

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const robotKorumaAcik = (): boolean => !!SITE_KEY;

const HATA_YUKLEME = 'Robot doğrulaması yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.';
const HATA_GENEL = 'Robot doğrulaması tamamlanamadı. Lütfen tekrar deneyin.';

let betik: Promise<Turnstile> | null = null;
function betikYukle(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (betik) return betik;
  betik = new Promise<Turnstile>((ok, no) => {
    const s = document.createElement('script');
    s.src = BETIK;
    s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : no(new Error(HATA_YUKLEME)));
    s.onerror = () => {
      s.remove();
      no(new Error(HATA_YUKLEME));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    betik = null; // bir dahaki denemede yeniden yüklenir
    throw e;
  });
  return betik;
}

// Tek kutu, sayfanın altında; yalnız Cloudflare etkileşim isterse görünür (öbür zaman boş ve tıklanamaz)
let kutu: { id: string; dis: HTMLDivElement; kart: HTMLDivElement } | null = null;
let bekleyen: { ok: (t: string) => void; no: (e: Error) => void } | null = null;
let kullanildi = false;

const KART_GIZLI = 'pointer-events-none';
const KART_ACIK = 'pointer-events-auto rounded-2xl border border-line bg-surface shadow-pop p-3 space-y-2 text-center';

function bitir(hata: Error | null, jeton?: string) {
  const b = bekleyen;
  bekleyen = null;
  if (!b) return;
  if (hata) b.no(hata);
  else b.ok(jeton || '');
}

async function kutuHazirla(): Promise<{ t: Turnstile; id: string }> {
  const t = await betikYukle();
  if (kutu && document.body.contains(kutu.dis)) return { t, id: kutu.id };
  const dis = document.createElement('div');
  dis.id = 'robot-dogrulama';
  dis.className = 'fixed inset-x-0 bottom-4 z-[10000] flex justify-center px-4 pointer-events-none';
  const kart = document.createElement('div');
  kart.className = KART_GIZLI;
  const baslik = document.createElement('p');
  baslik.className = 'text-xs font-semibold text-fg hidden';
  baslik.textContent = 'Devam etmek için robot olmadığınızı doğrulayın';
  const yer = document.createElement('div');
  kart.append(baslik, yer);
  dis.appendChild(kart);
  document.body.appendChild(dis);
  const goster = (acik: boolean) => {
    kart.className = acik ? KART_ACIK : KART_GIZLI;
    baslik.classList.toggle('hidden', !acik);
  };
  const tema = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const id = t.render(yer, {
    sitekey: SITE_KEY,
    action: 'giris',
    appearance: 'interaction-only',
    execution: 'execute',
    language: 'tr',
    theme: tema,
    callback: (jeton: string) => {
      goster(false);
      bitir(null, jeton);
    },
    'error-callback': () => {
      goster(false);
      bitir(new Error(HATA_GENEL));
      return true; // Cloudflare'in kendi yeniden denemesi yerine kişi yeniden basar
    },
    'expired-callback': () => {
      kullanildi = true;
    },
    'timeout-callback': () => {
      goster(false);
      bitir(new Error(HATA_GENEL));
    },
    'before-interactive-callback': () => goster(true),
    'after-interactive-callback': () => goster(false),
  });
  kutu = { id, dis, kart };
  kullanildi = false;
  return { t, id };
}

let sira: Promise<unknown> = Promise.resolve();

/**
 * Şifre sınayan bir istek için TAZE jeton (her jeton bir kez kullanılır). Koruma kapalıysa undefined döner.
 * Aynı anda birden çok istek gelirse sırayla verilir.
 */
export function robotJetonu(): Promise<string | undefined> {
  if (!SITE_KEY) return Promise.resolve(undefined);
  const is = sira.then(async () => {
    const { t, id } = await kutuHazirla();
    return new Promise<string>((ok, no) => {
      const zaman = window.setTimeout(() => bitir(new Error(HATA_GENEL)), SURE_MS);
      bekleyen = {
        ok: (j) => {
          window.clearTimeout(zaman);
          ok(j);
        },
        no: (e) => {
          window.clearTimeout(zaman);
          no(e);
        },
      };
      try {
        if (kullanildi) t.reset(id);
        kullanildi = true;
        t.execute(id);
      } catch {
        bitir(new Error(HATA_GENEL));
      }
    });
  });
  sira = is.catch(() => undefined);
  return is;
}

/** Supabase'in robot doğrulaması reddi (jeton yok, geçersiz ya da süresi geçmiş) */
export function robotHatasiMi(err: unknown): boolean {
  const e = err as { code?: string; error_code?: string; message?: string; msg?: string } | null;
  const m = `${e?.code || ''} ${e?.error_code || ''} ${e?.message || ''} ${e?.msg || ''}`.toLowerCase();
  return m.includes('captcha');
}

export const ROBOT_RED = 'Robot doğrulaması geçilemedi. Sayfayı yenileyip tekrar deneyin.';
