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
  /** Aşama 256: sistem sahibinin bağlı (kendi) hesabındayız; liste logodaki seçim penceresi için saklanır */
  bagli?: BagliHesap | null;
  bagliListe?: BagliHesap[];
  /** Aşama 256: sistem sahibinin giriş kimliği ("seçimimi hatırla" bağlı hesaptayken de onun adına yazılır) */
  headId?: string;
  /** Aşama 263: giriş yapılan (ana) hesabın kartı; sistem sahibi değilse "<kurum> · Öğretmen" */
  sahip?: SahipKart;
}

/** Aşama 263: hesap seçiminde giriş yapılan (ana) hesabın kartı */
export interface SahipKart {
  head: boolean;
  baslik: string;
  aciklama: string;
}

/** Aşama 256: sistem sahibine bağlı (kendi) öğretmen hesabı */
export interface BagliHesap {
  authUserId: string;
  ad: string;
  kurumAd: string;
}

export function readGecis(): GecisState | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GecisState;
    return s && s.headRefresh && (s.active || s.gozu || s.bagli) ? s : null;
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
  if (g?.gozu || g?.bagli) return false;
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
  anaSayfadanAc();
  window.location.reload();
  return new Promise<never>(() => {});
}

// Aşama 264: hesap / kurum değişince sayfa her zaman ana sayfadan açılır (adresteki eski bölüm, ör. #/teacher/etuts, silinir)
function anaSayfadanAc(): void {
  try {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* yok say */
  }
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
    anaSayfadanAc();
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
    anaSayfadanAc();
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
 *  Aşama 252c: arama doğrudan veritabanından yapılır (gozu_kisi_ara_sahip, sql/252c; yetkiyi veritabanı denetler).
 *  Vercel sunucusu beklenmez. 252c SQL'i yoksa sunucu yolu kullanılır. 12 sn içinde yanıt yoksa açık bir hata verilir;
 *  signal ile iptal edilebilir (yeni harf yazılınca). */
export async function gozuKisiAra(q: string, kurumId: string, signal?: AbortSignal): Promise<GozuAday[]> {
  if (!dataService.isHeadAdmin() || readGecis()) throw new Error('Bu işlem yalnız sistem sahibinin kendi panelinde yapılır.');
  const ctrl = new AbortController();
  let zamanAsimi = false;
  const t = setTimeout(() => {
    zamanAsimi = true;
    ctrl.abort();
  }, 12_000);
  const disari = () => ctrl.abort();
  signal?.addEventListener('abort', disari);
  try {
    const { data, error } = await supabase.rpc('gozu_kisi_ara_sahip', { p_q: q, p_kurum: kurumId }).abortSignal(ctrl.signal);
    if (!error) {
      const out = (data || {}) as { ogretmen?: GozuAday[]; ogrenci?: GozuAday[] };
      return [...(out.ogretmen || []), ...(out.ogrenci || [])];
    }
    if (ctrl.signal.aborted) throw error;
    const yok = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '');
    if (!yok) throw new Error(error.message || 'Arama yapılamadı.');
    // 252c SQL'i çalıştırılmamış: sunucu yolu
    const { data: ses } = await supabase.auth.getSession();
    if (!ses.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
    const api = await kurumApi(ses.session.access_token, { action: 'kisiAra', q, kurumId }, ctrl.signal);
    return (api.kisiler || []) as GozuAday[];
  } catch (e: any) {
    if (zamanAsimi) throw new Error('Arama yanıt vermedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    if (signal?.aborted) {
      const err = new Error('İptal');
      err.name = 'AbortError';
      throw err;
    }
    throw e instanceof Error ? e : new Error('Arama yapılamadı.');
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', disari);
  }
}

/** Aşama 252c: "Bak" düğmesi beklemesin diye sunucu panel açılınca uyandırılır (sonucu kullanılmaz) */
export function gozuSunucuIsit(): void {
  supabase.auth
    .getSession()
    .then(({ data }) => (data.session ? kurumApi(data.session.access_token, { action: 'kisiAra', q: '', kurumId: '' }) : null))
    .catch(() => null);
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

// ============================================================================
// Aşama 256: BAĞLI HESAP (sistem sahibi ↔ başka kurumdaki kendi öğretmen hesabı)
//  Girişte ve kurum logosundan "Sistem sahibi / <kurum> · Öğretmen" seçimi. Bağlı hesaba geçince sekme o hesapla
//  açılır; sistem sahibinin oturum anahtarı bu sekmede saklanır, logodan tek tıkla geri dönülür (şifre sorulmaz).
// ============================================================================
const SECIM_TERCIH_KEY = 'edu_hesap_tercih_v1:'; // localStorage: "seçimimi hatırla" ('sahip' ya da bağlı hesap kimliği)
// sessionStorage: bu sekmede seçim yapıldı. "edu_sys_" ile BAŞLAMAZ: hesap geçişinde sekme verileri silinirken korunur;
// yeni girişte (handleAuthSuccess) hesapSecimiSifirla() ile silinir.
const SECIM_YAPILDI_KEY = 'edu_hesap_secildi_v1';

/** Bağlı hesaptaysak o hesap */
export function readBagli(): BagliHesap | null {
  return readGecis()?.bagli || null;
}

/** Aşama 263: bağlı hesap özelliği bu oturumda kullanılabilir mi (öğretmen oturumu; kurum geçişi / gözüyle bakış değil) */
export function bagliKullanilir(): boolean {
  const g = readGecis();
  if (g) return !!g.bagli;
  return dataService.getAuthSession()?.role === 'teacher';
}

/** Aşama 263: giriş yapılan (ana) hesabın kartı */
export function sahipKarti(): SahipKart {
  const g = readGecis();
  const HEAD: SahipKart = { head: true, baslik: 'Sistem sahibi', aciklama: 'Kurumlar, hesaplar, yedek ve sistem ayarları.' };
  if (g) return (g.bagli && g.sahip) || HEAD; // kurum geçişi / gözüyle bakış yalnız sistem sahibinde olur
  if (dataService.isHeadAdmin()) return HEAD;
  const ad = dataService.getAuthSession()?.user?.name || '';
  const kurum = dataService.getBrand().name || 'Kendi alanım';
  return { head: false, baslik: `${kurum} · Öğretmen`, aciklama: `${ad ? `${ad} olarak ` : ''}giriş yaptığınız hesap.` };
}

/** Aşama 267: sistem sahibi bir ÖĞRETMENİN gözüyle bakıyor; o kişinin bağlarını yönetebilir (bağla / kaldır, geçiş yok) */
export function gozuBagYonetimi(): boolean {
  const g = readGecis();
  return !!g && !g.bagli && !!g.gozu && g.gozu.tur === 'ogretmen';
}

/** Bağlı hesaplar (ana hesapta veritabanından; bağlı hesaptayken saklanan listeden). Aşama 263: her öğretmen.
 *  Aşama 267: yonetim = true ise gözüyle bakılan öğretmenin bağları da okunur (yalnız Bağlı hesaplar penceresi). */
export async function bagliHesaplar(yonetim = false): Promise<BagliHesap[]> {
  const g = readGecis();
  if (g?.bagli) return g.bagliListe || [g.bagli];
  if (!bagliKullanilir() && !(yonetim && gozuBagYonetimi())) return [];
  const { data, error } = await supabase.from('bagli_hesaplar').select('hedef_auth_id,hedef_ad,kurum_ad,olusturma').order('olusturma');
  if (error) {
    if (/bagli_hesaplar|PGRST205|42P01/i.test(`${error.code || ''} ${error.message || ''}`)) return []; // 256 SQL kurulmamış
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => ({ authUserId: String(r.hedef_auth_id), ad: r.hedef_ad || '', kurumAd: r.kurum_ad || '' }));
}

/** Kullanıcı adı (ya da e-posta) ve o hesabın şifresiyle hesap bağlar (giriş yapılan ana hesapta) */
export async function hesapBagla(kullanici: string, sifre: string): Promise<BagliHesap> {
  const gozu = gozuBagYonetimi(); // Aşama 267: gözüyle bakışta da şifreyle; sunucu ayrıca bakış kaydını doğrular
  if (!gozu && (!bagliKullanilir() || readGecis())) throw new Error('Hesap bağlama giriş yaptığınız ana hesapta yapılır.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
  const out = await kurumApi(data.session.access_token, { action: gozu ? 'gozuBagla' : 'bagla', kullanici, sifre });
  return out.hesap as BagliHesap;
}

/** Bağı kaldırır (hesap silinmez, yalnız bağ) */
export async function hesapBagKaldir(authUserId: string): Promise<void> {
  if (gozuBagYonetimi()) {
    // Aşama 267: gözüyle bakışta sunucu üzerinden (iki yön birlikte, bakış kaydına yazılır)
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
    await kurumApi(data.session.access_token, { action: 'gozuBagKaldir', authUserId });
    return;
  }
  const { error } = await supabase.from('bagli_hesaplar').delete().eq('hedef_auth_id', authUserId);
  if (error) throw new Error(error.message);
  hesapTercihYaz(null);
}

/** Bağlı hesaba geçer (sistem sahibinin panelinden, bir kurumdan ya da başka bir bağlı hesaptan) */
export async function bagliHesabaGec(authUserId: string): Promise<never> {
  const g = readGecis();
  let head: { access_token: string; refresh_token: string };
  let headName: string;
  let liste: BagliHesap[];
  let headId: string;
  let sahip: SahipKart;
  if (g) {
    if (g.bagli?.authUserId === authUserId) throw new Error('Zaten bu hesaptasınız.');
    liste = g.bagliListe || (g.bagli ? [g.bagli] : []);
    head = await restoreHead(g);
    headName = g.headName;
    headId = g.headId || '';
    sahip = sahipKarti();
    if (g.gozu) void gozuBitirBildir(head.access_token, g.gozu.sessionId);
  } else {
    if (!bagliKullanilir()) throw new Error('Bağlı hesaba bu oturumdan geçilemez.');
    sahip = sahipKarti();
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('Oturum bulunamadı; lütfen yeniden giriş yapın.');
    head = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    headName = dataService.getAuthSession()?.user?.name || sahip.baslik;
    headId = data.session.user.id;
    liste = await bagliHesaplar();
  }
  let out: any;
  try {
    out = await kurumApi(head.access_token, { action: 'bagliGir', authUserId });
  } catch (e) {
    if (g) await switchTab(head, null); // geçişteyken hata: sistem sahibinin paneline dönülür (yarım durum kalmaz)
    throw e;
  }
  hesapSecildi();
  return switchTab(out.session, { headRefresh: head.refresh_token, headName, kurumlar: [], active: null, gozu: null, bagli: out.hesap, bagliListe: liste, headId, sahip });
}

/** Giriş yapılan ana hesaba döner (bağlı hesaptan; sistem sahibinde kendi paneli) */
export function sistemSahibineDon(): Promise<never> {
  hesapSecildi();
  return exitKurum();
}

/** Girişte hesap seçimi bu oturumda yapıldı mı */
export function hesapSecimiYapildi(): boolean {
  try {
    return window.sessionStorage.getItem(SECIM_YAPILDI_KEY) === '1';
  } catch {
    return true;
  }
}
export function hesapSecimiSifirla(): void {
  try {
    window.sessionStorage.removeItem(SECIM_YAPILDI_KEY);
  } catch {
    /* depolama kapalı */
  }
}
export function hesapSecildi(): void {
  try {
    window.sessionStorage.setItem(SECIM_YAPILDI_KEY, '1');
  } catch {
    /* depolama kapalı */
  }
}

/** "Seçimimi hatırla" ('sahip' | bağlı hesap kimliği | null) */
const tercihSahibi = (): string => readGecis()?.headId || dataService.getAuthSession()?.user?.auth_user_id || '';
export function hesapTercihOku(): string | null {
  const id = tercihSahibi();
  try {
    return id ? window.localStorage.getItem(SECIM_TERCIH_KEY + id) : null;
  } catch {
    return null;
  }
}
export function hesapTercihYaz(v: string | null): void {
  const id = tercihSahibi();
  if (!id) return;
  try {
    if (v) window.localStorage.setItem(SECIM_TERCIH_KEY + id, v);
    else window.localStorage.removeItem(SECIM_TERCIH_KEY + id);
  } catch {
    /* depolama kapalı */
  }
}
