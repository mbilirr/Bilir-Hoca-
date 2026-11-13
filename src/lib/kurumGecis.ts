import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { dataService } from '../services/dataService';
import type { Teacher } from '../types';

// ============================================================================
// Aşama 97: KURUMLAR ARASI GEÇİŞ (yalnızca genel yönetici)
// Genel yönetici üst menüden bir kurum seçer; sunucu (api/kurum.js) o kurumun yöneticisi için bir oturum üretir ve bu
// sekme o oturumla yeniden açılır: genel yönetici kurumu, kurum yöneticisinin gözüyle görür ve düzenler.
// "Kendi panelime dön" ile bu sekme genel yöneticinin kendi oturumuna döner (şifre sorulmaz).
//   * Bilgiler yalnızca BU SEKMEDE tutulur (sessionStorage); sekme kapanınca ya da çıkış yapılınca silinir.
//   * Geçişte önceki hesabın verileri sekmeden silinir; yeni hesabın verisi sıfırdan iner (karışma olmaz).
//   * Diğer sekmeler etkilenmez.
// Aşama 252: KULLANICI GÖZÜYLE BAK. Genel yönetici herhangi bir kişinin (öğrenci, öğretmen, rehberlik, idare, ölçme)
// hesabıyla bu sekmeyi açar; şifre gerekmez. Ekranın üstünde şerit durur, "Çık" ile kendi paneline döner. Her bakış ve bakış sırasındaki her yazma işlemi veritabanında kayda geçer (sql/252).
// ============================================================================

const KEY = 'edu_sys_kurum_gecis'; // "edu_sys_" ile başlar: çıkışta kendiliğinden silinir
const AUTH_KEY = 'edu_sys_auth_session_v6';

export interface GecisKurum {
  id: string;
  name: string;
}
export interface GozuKisi {
  ad: string;
  tur: 'ogrenci' | 'ogretmen';
  kurumAd: string;
}
export interface GecisState {
  headRefresh: string; // genel yöneticinin bu sekmedeki oturumunu yenileme anahtarı
  headName: string;
  kurumlar: GecisKurum[];
  active: GecisKurum | null;
  /** Aşama 252: kullanıcı gözüyle bakılıyorsa kişi ve bakış oturumu (bakış yalnız kendi panelinden açılır; active = null) */
  gozu?: (GozuKisi & { sessionId: string }) | null;
}

export function readGecis(): GecisState | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GecisState;
    return s && s.headRefresh && (s.active || s.gozu) ? s : null;
  } catch {
    return null;
  }
}

function writeGecis(s: GecisState | null): void {
  try {
    if (s) window.sessionStorage.setItem(KEY, JSON.stringify(s));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* depolama kapalı */
  }
}

/** Genel yönetici kendi panelinde mi, bir kurumda mı? Seçici yalnızca bu durumlarda görünür (kullanıcı gözüyle bakarken görünmez). */
export function canUseKurumSecici(): boolean {
  const g = readGecis();
  if (g?.gozu) return false;
  return dataService.isHeadAdmin() || !!g;
}

/** Aşama 252: kullanıcı gözüyle bakılıyorsa kişi bilgisi */
export function readGozu(): GozuKisi | null {
  return readGecis()?.gozu || null;
}

/** Seçicide gösterilecek kurumlar (genel yöneticide veritabanından, kurumdayken saklanan listeden) */
export async function gecisKurumlari(): Promise<GecisKurum[]> {
  const g = readGecis();
  if (g) return g.kurumlar;
  if (!dataService.isHeadAdmin()) return [];
  const list = await dataService.listKurumlar();
  return list.map((k) => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Oturumdaki hesabın öğretmen kaydından uygulama oturumu kurulur (önbelleğe yazmadan) */
async function teacherOfAuth(authUser: { id: string; created_at: string; app_metadata?: any; user_metadata?: any } | null | undefined): Promise<Teacher> {
  if (!authUser) throw new Error('Oturum açılamadı.');
  const { data: row, error } = await supabase.from('teachers').select('*').eq('auth_user_id', authUser.id).maybeSingle();
  if (error || !row) throw new Error('Hesabın öğretmen kaydı okunamadı.');
  const appRole = authUser.app_metadata?.role;
  return {
    id: row.id,
    auth_user_id: authUser.id,
    name: row.name || authUser.user_metadata?.name || 'Yönetici',
    username: row.username || '',
    email: row.email || '',
    branch: row.branch || 'Kurum Yöneticisi',
    avatar: row.avatar || undefined,
    createdAt: row.created_at || authUser.created_at,
    role: 'teacher',
    status: row.status || 'approved',
    isSuspended: row.status === 'suspended',
    isAdmin: appRole === 'admin' || authUser.app_metadata?.is_admin === true || !!row.is_admin,
    kurumId: row.kurum_id || undefined,
  } as Teacher;
}

/** Sekmeyi verilen oturuma geçirir ve sayfayı yeniler.
 *  Aşama 251: önce yeni oturum kurulur ve öğretmen kaydı okunur; sekmedeki veriler ancak bunlar başarılıysa, yenilemeden
 *  hemen önce silinir (hata olursa ekran boşalmaz). Kullanıcı bilgisi setSession'ın döndürdüğünden alınır (fazladan istek yok). */
async function switchTab(tokens: { access_token: string; refresh_token: string }, next: GecisState | null): Promise<never> {
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error) throw new Error(`Oturum değiştirilemedi: ${error.message}`);
  const authUser = data.session?.user || data.user;
  // Aşama 252: öğrenci hesabına bakılıyorsa öğrenci oturumu kurulur (şifre değiştirme ekranı açılmaz)
  const session =
    authUser && authUser.app_metadata?.role === 'student'
      ? { role: 'student', user: { ...(await dataService.ogrenciOturumu(authUser)), mustChangePassword: false } }
      : { role: 'teacher', user: await teacherOfAuth(authUser) };
  dataService.prepareAccountSwitch();
  try {
    window.sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } catch {
    /* depolama kapalı */
  }
  writeGecis(next);
  window.location.reload();
  return new Promise<never>(() => {});
}

/** Supabase giriş servisine doğrudan istek (sekmedeki oturuma dokunmaz) */
async function authFetch(path: string, init: { body?: unknown; token?: string }): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error((out && (out.error_description || out.msg || out.message)) || `Giriş servisi yanıt vermedi (${res.status}).`);
  return out;
}

/** Genel yöneticinin oturumunu geri alır (kurumdayken).
 *  Aşama 251: sekmedeki kurum oturumu kapatılmadan (ekran "çıkış" durumuna düşmeden) genel yöneticinin anahtarı
 *  doğrudan yenilenir; kurum oturumu da AYNI ANDA sunucuda kapatılır (iki istek sırayla değil, birlikte). */
async function restoreHead(g: GecisState): Promise<{ access_token: string; refresh_token: string }> {
  const { data: cur } = await supabase.auth.getSession();
  const kurumToken = cur.session?.access_token || '';
  const [head] = await Promise.all([
    authFetch('token?grant_type=refresh_token', { body: { refresh_token: g.headRefresh } }).catch(() => null),
    kurumToken ? authFetch('logout?scope=local', { token: kurumToken }).catch(() => null) : Promise.resolve(null),
  ]);
  if (!head?.access_token || !head?.refresh_token) throw new Error('Kendi oturumunuza dönülemedi; lütfen yeniden giriş yapın.');
  return { access_token: head.access_token, refresh_token: head.refresh_token };
}

/** Bir kuruma geçer (genel yöneticiden ya da başka bir kurumdan) */
export async function enterKurum(kurumId: string): Promise<never> {
  const g = readGecis();
  let head: { access_token: string; refresh_token: string };
  let headName: string;
  let kurumlar: GecisKurum[];
  if (g) {
    if (g.active?.id === kurumId && !g.gozu) throw new Error('Zaten bu kurumdasınız.');
    head = await restoreHead(g);
    headName = g.headName;
    kurumlar = g.kurumlar;
  } else {
    if (!dataService.isHeadAdmin()) throw new Error('Kurumlar arası geçişi yalnızca genel yönetici yapabilir.');
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
    head = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    headName = dataService.getAuthSession()?.user?.name || 'Genel Yönetici';
    kurumlar = await gecisKurumlari();
  }
  return kurumaGir(head, headName, kurumlar, kurumId, !!g);
}

/** Genel yöneticinin anahtarıyla kurum oturumu alınır ve sekme o kuruma geçer */
async function kurumaGir(
  head: { access_token: string; refresh_token: string },
  headName: string,
  kurumlar: GecisKurum[],
  kurumId: string,
  donusGerekir: boolean
): Promise<never> {
  let res: Response;
  try {
    res = await fetch('/api/kurum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${head.access_token}` },
      body: JSON.stringify({ action: 'enter', kurumId }),
    });
  } catch {
    if (donusGerekir) await switchTab(head, null);
    throw new Error('Sunucuya ulaşılamadı.');
  }
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok || !out.session) {
    // Kurumdayken hata olursa sekme genel yöneticinin oturumuna döner (yarım durum kalmaz)
    if (donusGerekir) await switchTab(head, null);
    throw new Error(out?.error || 'Kuruma geçilemedi.');
  }
  return switchTab(out.session, {
    headRefresh: head.refresh_token,
    headName,
    kurumlar: kurumlar.some((k) => k.id === out.kurum.id) ? kurumlar : [...kurumlar, out.kurum],
    active: { id: out.kurum.id, name: out.kurum.name },
  });
}

/** Kurumdan genel yöneticinin kendi paneline döner */
export async function exitKurum(): Promise<never> {
  const g = readGecis();
  if (!g) {
    window.location.reload();
    return new Promise<never>(() => {});
  }
  try {
    const head = await restoreHead(g);
    if (g.gozu) void gozuBitirBildir(head.access_token, g.gozu.sessionId);
    return await switchTab(head, null);
  } catch (e) {
    // Dönülemezse güvenli çıkış: giriş ekranına
    dataService.logout(); // geçiş işareti dururken: yalnız bu sekmedeki kurum oturumu kapanır
    writeGecis(null);
    window.location.reload();
    throw e;
  }
}

// ============================================================================
// Aşama 252: KULLANICI GÖZÜYLE BAK
// ============================================================================
export interface GozuAday {
  authUserId: string;
  ad: string;
  tur: 'ogrenci' | 'ogretmen';
  roller: string[];
  yonetici: boolean;
  ek: string;
  kurumId: string | null;
  kurumAd: string;
  askida: boolean;
}

async function kurumApi(token: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch('/api/kurum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e; // Aşama 252b: yeni harf yazıldı, eski arama iptal
    throw new Error('Sunucuya ulaşılamadı.');
  }
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok) throw new Error(out?.error || 'İşlem yapılamadı.');
  return out;
}

function gozuBitirBildir(headToken: string, sessionId: string): Promise<unknown> {
  return kurumApi(headToken, { action: 'gozuBitir', sessionId }).catch(() => null);
}

/** Kişi arar (yalnız genel yönetici, kendi panelinde). kurumId: '' = bütün kurumlar, 'kendi' = kendi alanı.
 *  Aşama 252b: signal ile iptal edilebilir; boş arama sunucuyu ısıtır (panel açılınca ilk arama beklemesin). */
export async function gozuKisiAra(q: string, kurumId: string, signal?: AbortSignal): Promise<GozuAday[]> {
  if (!dataService.isHeadAdmin() || readGecis()) throw new Error('Bu işlem yalnız sistem sahibinin kendi panelinde yapılır.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
  const out = await kurumApi(data.session.access_token, { action: 'kisiAra', q, kurumId }, signal);
  return (out.kisiler || []) as GozuAday[];
}

/** Kişinin gözüyle bakar: sekme o kişinin hesabıyla yeniden açılır (yalnız genel yönetici, kendi panelinden) */
export async function gozuyleBak(authUserId: string): Promise<never> {
  if (!dataService.isHeadAdmin() || readGecis()) throw new Error('Bu işlem yalnız sistem sahibinin kendi panelinde yapılır.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
  const head = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  const headName = dataService.getAuthSession()?.user?.name || 'Genel Yönetici';
  const out = await kurumApi(head.access_token, { action: 'gozuyle', authUserId });
  if (!out.session || !out.kisi) throw new Error('Kişinin oturumu açılamadı.');
  try {
    return await switchTab(out.session, {
      headRefresh: head.refresh_token,
      headName,
      kurumlar: [],
      active: null,
      gozu: { ad: out.kisi.ad, tur: out.kisi.tur, kurumAd: out.kisi.kurumAd, sessionId: out.sessionId },
    });
  } catch (e) {
    // Kişinin oturumu kurulamadıysa sekme sistem sahibinin oturumuna geri döner; bakış ve kişinin bu oturumu kapatılır
    void gozuBitirBildir(head.access_token, out.sessionId);
    void authFetch('logout?scope=local', { token: out.session.access_token }).catch(() => null);
    await switchTab(head, null);
    throw e;
  }
}
