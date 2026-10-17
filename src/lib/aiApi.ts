import { supabase } from './supabase';

// ============================================================================
// Yapay zekâ (Aşama 48): sunucudaki /api/ai fonksiyonuyla konuşur.
// Tarayıcı yalnızca öğretim programı metnini, kitapçık sayfası resimlerini, ders adlarını ve
// kazanım listesini gönderir. Öğrenci bilgisi bu servise hiçbir zaman gönderilmez.
// API anahtarları yalnızca sunucuda durur.
// ============================================================================

export type AiProvider = 'gemini' | 'mistral';

export const AI_PROVIDERS: Array<{ value: AiProvider; label: string; hint: string }> = [
  { value: 'gemini', label: 'Gemini', hint: 'Ana seçenek (ücretsiz)' },
  { value: 'mistral', label: 'Mistral', hint: 'Yedek (ücretsiz)' },
];

export interface AiImage {
  mime: 'image/jpeg' | 'image/png';
  data: string; // base64
  page?: number;
}

export interface AiKazanimInput {
  code: string;
  konu?: string;
  text: string;
}

export interface AiSuggestion {
  ders: string;
  no: number;
  kod: string;
  kod2: string;
  konu: string;
  alt: string;
  guven: number;
}

export interface AiProgramItem {
  ders: string;
  kod: string;
  kazanim: string;
  konu: string;
}

export interface AiPageInfo {
  page: number;
  dersler: Array<{ ders: string; sorular: number[] }>;
}

export interface AiResult {
  ok: boolean;
  error?: string;
  code?: string; // quota | rate | no-key | timeout | network | parse | long | model | provider | empty | size
  provider?: AiProvider;
  model?: string;
  items?: any[];
  pages?: AiPageInfo[];
  gemini?: boolean;
  mistral?: boolean;
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function post(payload: Record<string, unknown>): Promise<AiResult> {
  const token = await accessToken();
  if (!token) return { ok: false, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' };
  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, code: 'network', error: 'Yapay zekâ servisine ulaşılamadı (internet bağlantısını kontrol edin).' };
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      code: res.status === 413 ? 'size' : res.status === 504 ? 'timeout' : 'provider',
      error:
        res.status === 404
          ? 'Yapay zekâ servisi bu sürümde bulunamadı (sunucu dosyası api/ai.js yüklenmemiş).'
          : res.status === 413
            ? 'Gönderilen içerik sunucu için çok büyük.'
            : res.status === 504
              ? 'Yapay zekâ zamanında yanıt vermedi.'
              : `Yapay zekâ servisi beklenmeyen yanıt verdi (${res.status}).`,
    };
  }
  if (!res.ok) return { ok: false, ...data, error: data.error || `Yapay zekâ servisi hata verdi (${res.status}).` };
  return data as AiResult;
}

/** Hangi yapay zekâ anahtarlarının sunucuda tanımlı olduğunu söyler (anahtarın kendisi gelmez) */
export function aiStatus(): Promise<AiResult> {
  return post({ action: 'status' });
}

/** Öğretim programı metninin bir bölümünden kazanımlar */
export function aiProgram(input: { provider: AiProvider; text: string; grade: string; subject?: string }): Promise<AiResult> {
  return post({ action: 'program', ...input });
}

/** Kitapçık sayfalarının hangi derse ait olduğu ve görünen soru numaraları */
export function aiPages(input: { provider: AiProvider; images: AiImage[] }): Promise<AiResult> {
  return post({ action: 'pages', ...input });
}

/** Kitapçığın tek bir sayfası için kazanım önerileri (sayfada birden çok ders olabilir) */
export function aiClassifyPage(input: {
  provider: AiProvider;
  image: AiImage;
  subjects: Array<{ key: string; name: string; count: number; kazanimlar: AiKazanimInput[]; hint?: string }>;
}): Promise<AiResult> {
  return post({ action: 'classify', ...input });
}

const sleep = (ms: number, stop: () => boolean) =>
  new Promise<void>((resolve) => {
    const started = Date.now();
    function tick(): void {
      if (stop() || Date.now() - started >= ms) resolve();
      else window.setTimeout(tick, 250);
    }
    tick();
  });

/**
 * Ücretsiz planlara uygun çağrı: istekler arasında bekler, kota dolunca bekleyip tekrar dener,
 * izin verildiyse diğer yapay zekâya geçer. `state.provider` geçişte güncellenir.
 */
export async function aiCall(
  state: { provider: AiProvider; fallback: boolean; keys: { gemini: boolean; mistral: boolean } | null; lastCall: number },
  call: (p: AiProvider) => Promise<AiResult>,
  opts: { stop: () => boolean; onWait?: (text: string | null) => void; onNote?: (text: string) => void }
): Promise<AiResult> {
  let r: AiResult = { ok: false, error: 'Durduruldu.' };
  for (let attempt = 0; attempt < 5 && !opts.stop(); attempt++) {
    const gap = state.provider === 'gemini' ? 6500 : 1500; // Gemini ücretsiz: dakikada ~10 istek
    const since = Date.now() - state.lastCall;
    if (since < gap) await sleep(gap - since, opts.stop);
    if (opts.stop()) break;
    state.lastCall = Date.now();
    r = await call(state.provider);
    if (r.ok) return r;
    const other: AiProvider = state.provider === 'gemini' ? 'mistral' : 'gemini';
    const canSwitch = state.fallback && !!state.keys && state.keys[other];
    if ((r.code === 'quota' || r.code === 'no-key' || r.code === 'model' || r.code === 'provider') && canSwitch) {
      opts.onNote?.(`${state.provider === 'gemini' ? 'Gemini' : 'Mistral'}: ${r.error} ${other === 'mistral' ? 'Mistral' : 'Gemini'} ile devam edildi.`);
      state.provider = other;
      continue;
    }
    if (r.code === 'quota' || r.code === 'rate') {
      for (let sec = 30; sec > 0 && !opts.stop(); sec--) {
        opts.onWait?.(`Kullanım sınırı: ${sec} sn bekleniyor…`);
        await sleep(1000, opts.stop);
      }
      opts.onWait?.(null);
      continue;
    }
    if (r.code === 'no-key' || r.code === 'size' || r.code === 'long') return r;
    if (r.code === 'timeout' && attempt >= 1) return r; // iki kez zaman aşımı: çağıran işi küçültsün
    await sleep(2500, opts.stop); // geçici hata: tekrar dene
  }
  return r;
}
