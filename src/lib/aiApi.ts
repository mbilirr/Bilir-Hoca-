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
  sayfa?: number;
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
  exhausted?: string[]; // bugünkü hakkı biten Gemini modelleri
  retryAfter?: number; // dakikalık sınırda Google'ın söylediği bekleme (sn)
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
export function aiProgram(input: { provider: AiProvider; text: string; grade: string; subject?: string; avoid?: string[] }): Promise<AiResult> {
  return post({ action: 'program', ...input });
}

/** Kitapçık sayfalarının hangi derse ait olduğu ve görünen soru numaraları */
export function aiPages(input: { provider: AiProvider; images: AiImage[]; avoid?: string[] }): Promise<AiResult> {
  return post({ action: 'pages', ...input });
}

/** Kitapçığın bir ya da iki sayfası için kazanım önerileri (sayfalarda birden çok ders olabilir) */
export function aiClassifyPage(input: {
  provider: AiProvider;
  images: AiImage[];
  avoid?: string[];
  subjects: Array<{ key: string; name: string; count: number; kazanimlar: AiKazanimInput[]; hint?: string }>;
}): Promise<AiResult> {
  return post({ action: 'classify', ...input });
}

/** Yayınevinin kazanım/konu ifadelerini dersin MEB kazanımlarıyla eşleştirir (yalnızca metin gider) */
export function aiMatchKazanim(input: {
  provider: AiProvider;
  subject: { name: string };
  items: Array<{ no: number; text: string }>;
  kazanimlar: AiKazanimInput[];
  avoid?: string[];
}): Promise<AiResult> {
  return post({ action: 'match', ...input });
}

/** İşleri `concurrency` kadar paralel çalıştırır; `next()` boşalana kadar iş alır (iş sırasında kuyruğa eklenebilir) */
export async function runPool(concurrency: number, next: () => (() => Promise<void>) | null, stop: () => boolean): Promise<void> {
  const worker = async () => {
    while (!stop()) {
      const job = next();
      if (!job) return;
      await job();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
}

/** Aynı anda gönderilecek istek sayısı (ücretsiz planlara uygun) */
export const AI_CONCURRENCY = 3;

export const DAY_DONE_MSG =
  'Gemini\'nin bugünkü ücretsiz kullanım hakkı doldu (bütün modeller denendi). Hak her gün Türkiye saatiyle yaklaşık 10:00-11:00\'de yenilenir; bulunan sonuçlar kaybolmaz, kalan sayfaları o saatten sonra yeniden çalıştırabilirsiniz.';

const sleep = (ms: number, stop: () => boolean) =>
  new Promise<void>((resolve) => {
    const started = Date.now();
    function tick(): void {
      if (stop() || Date.now() - started >= ms) resolve();
      else window.setTimeout(tick, 250);
    }
    tick();
  });

export interface AiCallState {
  provider: AiProvider;
  fallback: boolean;
  keys: { gemini: boolean; mistral: boolean } | null;
  lastCall: number; // sıradaki isteğin en erken başlama zamanı (paralel işler ortak kullanır)
  gap?: number; // Gemini için istekler arası en kısa süre (ms); sınıra takılınca kendiliğinden uzar
  pauseUntil?: number; // kota dolunca bütün işler bu zamana kadar bekler
  avoid?: string[]; // bugünkü hakkı biten modeller (sunucu bunları atlayıp sıradaki modeli kullanır)
  dayDone?: boolean; // bütün modellerin bugünkü hakkı bitti
}

const AVOID_KEY = 'ai-gemini-avoid';
/** Hakkı biten modeller tarayıcıda o gün için hatırlanır (Google sınırları Türkiye saatiyle ~10:00-11:00'de yenilenir) */
function loadAvoid(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(AVOID_KEY) || 'null');
    if (raw && Array.isArray(raw.models) && typeof raw.until === 'number' && raw.until > Date.now()) return raw.models.filter((m: unknown) => typeof m === 'string');
  } catch {
    /* yok say */
  }
  return [];
}
function saveAvoid(models: string[]) {
  try {
    // Pasifik saatiyle gece yarısına kadar (yaklaşık: şimdiden sonraki 08:00 UTC)
    const d = new Date();
    const until = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0) + (d.getUTCHours() >= 8 ? 86400000 : 0);
    localStorage.setItem(AVOID_KEY, JSON.stringify({ models, until }));
  } catch {
    /* yok say */
  }
}
function mergeAvoid(state: AiCallState, list?: string[]) {
  if (!list || !list.length) return;
  const next = Array.from(new Set([...(state.avoid || []), ...list])).slice(0, 12);
  if (next.length !== (state.avoid || []).length) {
    state.avoid = next;
    saveAvoid(next);
  }
}

/** Yeni durum: Gemini'de istek başlangıçları arası 6 sn (dakikada ~10, ücretsiz sınır); sınıra takılınca uzar */
export const newAiState = (provider: AiProvider, fallback: boolean, keys: { gemini: boolean; mistral: boolean } | null): AiCallState => ({
  provider,
  fallback,
  keys,
  lastCall: 0,
  gap: 6000,
  avoid: loadAvoid(),
});

/**
 * Ücretsiz planlara uygun çağrı: paralel işler arasında istek başlangıçlarını aralıklı dağıtır,
 * kota dolunca hepsini bekletip tekrar dener, izin verildiyse diğer yapay zekâya geçer.
 */
export async function aiCall(
  state: AiCallState,
  call: (p: AiProvider, avoid: string[]) => Promise<AiResult>,
  opts: { stop: () => boolean; onWait?: (text: string | null) => void; onNote?: (text: string) => void }
): Promise<AiResult> {
  let r: AiResult = { ok: false, error: 'Durduruldu.' };
  for (let attempt = 0; attempt < 6 && !opts.stop(); attempt++) {
    if (state.dayDone && state.provider === 'gemini') return { ok: false, code: 'quota-day', error: DAY_DONE_MSG };
    // Ortak sıra: her istek bir başlama zamanı ayırır (JavaScript tek iş parçacıklı olduğu için çakışmaz)
    const gap = state.provider === 'gemini' ? state.gap || 6000 : 1200;
    const now = Date.now();
    const start = Math.max(now, state.lastCall + gap, state.pauseUntil || 0);
    state.lastCall = start;
    if (start > now) await sleep(start - now, opts.stop);
    if (opts.stop()) break;
    r = await call(state.provider, state.provider === 'gemini' ? state.avoid || [] : []);
    mergeAvoid(state, r.exhausted);
    if (r.ok) return r;
    const other: AiProvider = state.provider === 'gemini' ? 'mistral' : 'gemini';
    const canSwitch = state.fallback && !!state.keys && state.keys[other];
    if (r.code === 'quota-day') {
      // Bütün Gemini modellerinin bugünkü hakkı bitti: beklemenin anlamı yok
      if (state.provider === 'gemini') state.dayDone = true;
      if (canSwitch) {
        opts.onNote?.(`${r.error} ${other === 'mistral' ? 'Mistral' : 'Gemini'} ile devam edildi.`);
        state.provider = other;
        continue;
      }
      return { ...r, error: DAY_DONE_MSG };
    }
    if ((r.code === 'no-key' || r.code === 'model' || r.code === 'provider') && canSwitch) {
      if (state.provider !== other) {
        opts.onNote?.(`${state.provider === 'gemini' ? 'Gemini' : 'Mistral'}: ${r.error} ${other === 'mistral' ? 'Mistral' : 'Gemini'} ile devam edildi.`);
        state.provider = other;
      }
      continue;
    }
    if (r.code === 'quota' || r.code === 'rate') {
      // Dakikalık sınır: Google'ın söylediği süre kadar bütün işler birlikte bekler, istek aralığı biraz uzar
      const waitMs = Math.max(3, Math.min(90, r.retryAfter || 20)) * 1000 + 500;
      if ((state.pauseUntil || 0) < Date.now()) {
        // aynı anda gelen birden çok sınır uyarısı aralığı yalnızca bir kez uzatsın
        state.gap = Math.min(15000, Math.round((state.gap || 6000) * 1.25));
        state.pauseUntil = Date.now() + waitMs;
      }
      while (!opts.stop() && Date.now() < (state.pauseUntil || 0)) {
        opts.onWait?.(
          `Dakikalık kullanım sınırı${r.model ? ` (${r.model})` : ''}: ${Math.ceil(((state.pauseUntil || 0) - Date.now()) / 1000)} sn bekleniyor, sonra kendiliğinden devam edecek…`
        );
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
