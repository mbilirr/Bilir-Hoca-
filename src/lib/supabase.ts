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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
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
  type: 'student' | 'teacher';
  id: string;
  identifier: string;
  name?: string;
  password?: string;
}

export interface EdgeCreateUserResponse {
  success: boolean;
  type: string;
  id: string;
  auth_user_id: string;
  email: string;
  password?: string;
  name: string;
  createdBy?: string;
}

/**
 * Invokes the 'create-user' Supabase Edge Function securely.
 * Explicitly attaches the active Admin user's session JWT token in the Authorization header.
 */
export async function invokeCreateUserEdgeFunction(
  payload: EdgeCreateUserPayload
): Promise<EdgeCreateUserResponse> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionData?.session?.access_token) {
    throw new Error('Yetkilendirme hatası: Aktif yönetici oturumu bulunamadı. Lütfen tekrar giriş yapınız.');
  }

  const token = sessionData.session.access_token;

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: payload,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    // Sunucu fonksiyonunun döndürdüğü gerçek hata mesajını çıkar
    let detail = '';
    const ctx = (error as any).context;
    try {
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        detail = body?.error || body?.message || '';
      }
    } catch {
      // gövde okunamadı
    }
    if (ctx?.status === 404) {
      detail = 'Sunucu fonksiyonu (create-user) bulunamadı. Supabase panelinde Edge Functions bölümünde kurulu olduğundan emin olunuz.';
    }
    throw new Error(detail || error.message || 'Kullanıcı hesabı oluşturulamadı.');
  }

  return data as EdgeCreateUserResponse;
}

