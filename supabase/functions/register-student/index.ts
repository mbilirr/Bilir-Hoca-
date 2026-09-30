import { createClient } from '@supabase/supabase-js';

// Safe placeholder key for initialisation when VITE_SUPABASE_ANON_KEY is not yet set in environment.
// This prevents @supabase/supabase-js from throwing fatal synchronous "Error: supabaseKey is required." during module startup.
const DEFAULT_FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder-anon-key';

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  'https://zzdchsxfjzedgciejuxd.supabase.co';

const rawAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(
  rawAnonKey &&
  rawAnonKey !== 'your_legacy_anon_jwt_key_here' &&
  rawAnonKey !== DEFAULT_FALLBACK_ANON_KEY
);

export const SUPABASE_ANON_KEY = isSupabaseConfigured
  ? (rawAnonKey as string)
  : DEFAULT_FALLBACK_ANON_KEY;

export const SUPABASE_CONFIG = {
  projectId: 'zzdchsxfjzedgciejuxd',
  url: SUPABASE_URL,
  anonKey: isSupabaseConfigured ? SUPABASE_ANON_KEY : '',
  restApi: `${SUPABASE_URL}/rest/v1/`,
};

// Şifre sıfırlama e-postasındaki bağlantıyla mı gelindi? Supabase adresi işleyip temizlemeden ÖNCE okunur.
const initialUrlIsRecovery =
  typeof window !== 'undefined' &&
  /type=recovery/.test(`${window.location.hash}${window.location.search}`);

// GÜVENLİK: Giriş oturumu (JWT) yalnızca bu sekme açıkken saklanır (sessionStorage).
// Sekme/tarayıcı kapanınca oturum da biter; uygulamanın kendi oturumuyla aynı ömre sahiptir.
// Böylece "uygulamadan çıkılmış ama arka planda geçerli oturum kalmış" (hayalet oturum) durumu oluşmaz.
function getSessionScopedStorage(): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const probe = '__sb_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// Önceki sürümlerden kalan kalıcı (localStorage) oturum anahtarlarını temizle
try {
  if (typeof window !== 'undefined') {
    Object.keys(window.localStorage)
      .filter((key) => /^sb-.*-auth-token/.test(key))
      .forEach((key) => window.localStorage.removeItem(key));
  }
} catch {
  // depolama erişilemiyor: yok say
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: getSessionScopedStorage(),
  },
});

// --- ŞİFRE SIFIRLAMA (PASSWORD RECOVERY) DURUMU ---
// Dinleyici istemci oluşturulur oluşturulmaz bağlanır; böylece Supabase'in açılışta yaydığı
// PASSWORD_RECOVERY olayı hiçbir zaman kaçırılmaz.
let passwordRecoveryActive = initialUrlIsRecovery;
const passwordRecoveryListeners = new Set<() => void>();

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    passwordRecoveryActive = true;
    passwordRecoveryListeners.forEach((listener) => listener());
  }
});

export function isPasswordRecoveryActive(): boolean {
  return passwordRecoveryActive;
}

export function clearPasswordRecovery(): void {
  passwordRecoveryActive = false;
}

export function onPasswordRecovery(listener: () => void): () => void {
  passwordRecoveryListeners.add(listener);
  return () => {
    passwordRecoveryListeners.delete(listener);
  };
}

// Helper to check connection health or Supabase readiness
export async function testSupabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }
  try {
    const { error } = await supabase.from('students').select('id').limit(1);
    // If the table exists or returns empty data without network crash, we're connected
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase ping notice:', error.message);
    }
    return true;
  } catch (err) {
    console.warn('Supabase offline or fallback active:', err);
    return false;
  }
}

export interface EdgeCreateUserPayload {
  action?: string;
  type?: 'student' | 'teacher';
  id?: string;
  identifier?: string;
  name?: string;
  password?: string;
  [key: string]: unknown;
}

export interface EdgeCreateUserResponse {
  success: boolean;
  type?: string;
  id?: string;
  auth_user_id?: string | null;
  email?: string;
  account?: boolean;
  created?: boolean;
  password_set?: boolean;
  results?: Array<{ ok: boolean; id: string; error?: string; auth_user_id?: string | null; deleted?: boolean }>;
  student?: Record<string, any>;
  status?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Bir Supabase sunucu fonksiyonunu (Edge Function) çağırır ve sunucunun döndürdüğü
 * Türkçe hata mesajını olduğu gibi fırlatır.
 * requireSession: true ise giriş yapmış kullanıcının oturum anahtarı zorunludur.
 */
export async function invokeEdgeFunction<T = any>(
  name: string,
  body: Record<string, unknown>,
  options: { requireSession?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.requireSession) {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData?.session?.access_token) {
      throw new Error('Oturumunuzun süresi dolmuş. Lütfen çıkış yapıp tekrar giriş yapınız.');
    }
    headers.Authorization = `Bearer ${sessionData.session.access_token}`;
  }

  let result: { data: any; error: any };
  try {
    result = await supabase.functions.invoke(name, { body, headers });
  } catch (err: any) {
    throw new Error(`Sunucuya ulaşılamadı: ${err?.message || 'bağlantı hatası'}`);
  }

  const { data, error } = result;
  if (error) {
    let detail = '';
    const ctx = (error as any).context;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json();
        detail = errBody?.error || errBody?.message || '';
      }
    } catch {
      // gövde okunamadı
    }
    if (ctx?.status === 404 && !detail) {
      detail = `Sunucu fonksiyonu (${name}) bulunamadı. Supabase panelinde Edge Functions bölümünde "${name}" adıyla kurulu olduğundan emin olunuz.`;
    }
    if (!detail && (error as any).name === 'FunctionsFetchError') {
      detail = `Sunucu fonksiyonuna (${name}) ulaşılamadı. İnternet bağlantınızı kontrol ediniz.`;
    }
    throw new Error(detail || error.message || 'Sunucu işlemi başarısız oldu.');
  }
  return data as T;
}

/**
 * 'create-user' sunucu fonksiyonu: giriş hesabı işlemleri (yönetici / öğretmen oturumu gerekir).
 */
export async function invokeCreateUserEdgeFunction(
  payload: EdgeCreateUserPayload
): Promise<EdgeCreateUserResponse> {
  return invokeEdgeFunction<EdgeCreateUserResponse>('create-user', payload, { requireSession: true });
}
