import { supabase } from './supabase';
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
// ============================================================================

const KEY = 'edu_sys_kurum_gecis'; // "edu_sys_" ile başlar: çıkışta kendiliğinden silinir
const AUTH_KEY = 'edu_sys_auth_session_v6';

export interface GecisKurum {
  id: string;
  name: string;
}
export interface GecisState {
  headRefresh: string; // genel yöneticinin bu sekmedeki oturumunu yenileme anahtarı
  headName: string;
  kurumlar: GecisKurum[];
  active: GecisKurum | null;
}

export function readGecis(): GecisState | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GecisState;
    return s && s.headRefresh && s.active ? s : null;
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

/** Genel yönetici kendi panelinde mi, bir kurumda mı? Seçici yalnızca bu durumlarda görünür. */
export function canUseKurumSecici(): boolean {
  return dataService.isHeadAdmin() || !!readGecis();
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
async function teacherOfCurrentAuth(): Promise<Teacher> {
  const { data: u } = await supabase.auth.getUser();
  const authUser = u?.user;
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
    assignedClassIds: [],
    kurumId: row.kurum_id || undefined,
  } as Teacher;
}

/** Sekmeyi verilen oturuma geçirir ve sayfayı yeniler */
async function switchTab(tokens: { access_token: string; refresh_token: string }, next: GecisState | null): Promise<never> {
  dataService.prepareAccountSwitch();
  const { error } = await supabase.auth.setSession(tokens);
  if (error) throw new Error(`Oturum değiştirilemedi: ${error.message}`);
  const teacher = await teacherOfCurrentAuth();
  try {
    window.sessionStorage.setItem(AUTH_KEY, JSON.stringify({ role: 'teacher', user: teacher }));
  } catch {
    /* depolama kapalı */
  }
  writeGecis(next);
  window.location.reload();
  return new Promise<never>(() => {});
}

/** Genel yöneticinin bu sekmedeki oturumunu geri alır (kurumdayken) */
async function restoreHead(g: GecisState): Promise<{ access_token: string; refresh_token: string }> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); // yalnızca bu sekmedeki kurum oturumu kapanır
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: g.headRefresh });
  if (error || !data.session) throw new Error('Kendi oturumunuza dönülemedi; lütfen yeniden giriş yapın.');
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

/** Bir kuruma geçer (genel yöneticiden ya da başka bir kurumdan) */
export async function enterKurum(kurumId: string): Promise<never> {
  const g = readGecis();
  let head: { access_token: string; refresh_token: string };
  let headName: string;
  let kurumlar: GecisKurum[];
  if (g) {
    if (g.active?.id === kurumId) throw new Error('Zaten bu kurumdasınız.');
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
  let res: Response;
  try {
    res = await fetch('/api/kurum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${head.access_token}` },
      body: JSON.stringify({ action: 'enter', kurumId }),
    });
  } catch {
    throw new Error('Sunucuya ulaşılamadı.');
  }
  const out = await res.json().catch(() => null);
  if (!res.ok || !out?.ok || !out.session) {
    // Kurumdayken hata olursa sekme genel yöneticinin oturumuna döner (yarım durum kalmaz)
    if (g) await switchTab(head, null);
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
    return await switchTab(head, null);
  } catch (e) {
    // Dönülemezse güvenli çıkış: giriş ekranına
    writeGecis(null);
    dataService.logout();
    window.location.reload();
    throw e;
  }
}
