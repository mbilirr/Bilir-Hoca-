// ============================================================================
// Aşama 97: KURUMLAR ARASI GEÇİŞ (yalnızca genel yönetici)
// Genel yönetici üst menüden bir kurum seçince bu adres, o kurumun yöneticisi için bu sekmede kullanılacak bir
// oturum üretir. Böylece genel yönetici kurumu, kurum yöneticisinin gözüyle görür ve düzenler; şifre gerekmez.
//   POST /api/kurum  { action: 'enter', kurumId }   (Authorization: Bearer <genel yöneticinin oturumu>)
// Güvenlik:
//   * Çağıran yalnızca genel yönetici (m.bilirr@gmail.com) olabilir; başka hesaba 403.
//   * Hedef yalnızca o kurumun ONAYLI kurum yöneticisi hesabıdır (öğretmen ya da öğrenci hesabına geçilemez).
//   * Üretilen oturum yalnızca yanıt olarak döner; hiçbir yere yazılmaz, e-posta gönderilmez.
// Vercel ortam değişkenleri (mevcut): SUPABASE_URL (ya da VITE_SUPABASE_URL), SUPABASE_ANON_KEY (ya da VITE_...),
// SUPABASE_SERVICE_ROLE_KEY. Yeni ayar gerekmez.
// ============================================================================

const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';
const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function env() {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

// Yeni tip "sb_secret_..." anahtarı JWT değildir: yalnızca apikey başlığında gönderilir
function serviceHeaders(e) {
  return {
    apikey: e.service,
    ...(e.service.startsWith('sb_') ? {} : { Authorization: `Bearer ${e.service}` }),
    'Content-Type': 'application/json',
  };
}

async function readJson(r) {
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function getAuthUser(e, token) {
  const r = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon || e.service, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return readJson(r);
}

async function rest(e, path) {
  const r = await fetch(`${e.url}/rest/v1/${path}`, { headers: serviceHeaders(e) });
  const data = await readJson(r);
  if (!r.ok) throw new HttpError(502, `Veritabanı okunamadı (${r.status}).`);
  return data || [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function actionEnter(e, body) {
  const kurumId = String(body.kurumId || '');
  if (!UUID.test(kurumId)) throw new HttpError(400, 'Geçersiz kurum.');
  const kurum = (await rest(e, `kurumlar?select=id,name&id=eq.${kurumId}`))[0];
  if (!kurum) throw new HttpError(404, 'Kurum bulunamadı.');
  // Kurumun onaylı yöneticisi (birden çoksa en eskisi)
  const admins = await rest(
    e,
    `teachers?select=id,name,status,auth_user_id,created_at&kurum_id=eq.${kurumId}&is_admin=is.true&auth_user_id=not.is.null&order=created_at.asc`
  );
  const target = admins.find((t) => !t.status || t.status === 'approved');
  if (!target) throw new HttpError(409, `"${kurum.name}" kurumunun onaylı bir yöneticisi yok. Önce kuruma yönetici atayın.`);

  // Hedef hesabın giriş adresi
  const ur = await fetch(`${e.url}/auth/v1/admin/users/${target.auth_user_id}`, { headers: serviceHeaders(e) });
  const authUser = await readJson(ur);
  if (!ur.ok || !authUser || !authUser.email) throw new HttpError(502, 'Kurum yöneticisinin giriş hesabı okunamadı.');
  if ((authUser.email || '').toLowerCase() === HEAD_ADMIN_EMAIL) throw new HttpError(400, 'Geçersiz hedef.');
  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) throw new HttpError(409, 'Kurum yöneticisinin hesabı askıya alınmış.');

  // Tek kullanımlık bağlantı kodu üretilir (e-posta GÖNDERİLMEZ) ve hemen oturuma çevrilir
  const gl = await fetch(`${e.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(e),
    body: JSON.stringify({ type: 'magiclink', email: authUser.email }),
  });
  const link = await readJson(gl);
  const hashed = link && (link.hashed_token || (link.properties && link.properties.hashed_token));
  if (!gl.ok || !hashed) throw new HttpError(502, 'Kuruma geçiş oturumu oluşturulamadı.');
  const vr = await fetch(`${e.url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: e.anon || e.service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  });
  const session = await readJson(vr);
  if (!vr.ok || !session || !session.access_token || !session.refresh_token) throw new HttpError(502, 'Kuruma geçiş oturumu doğrulanamadı.');

  return {
    ok: true,
    kurum: { id: kurum.id, name: kurum.name },
    admin: { id: target.id, name: target.name },
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Yalnızca POST.' });
  try {
    const e = env();
    if (!e.service) throw new HttpError(503, 'Sunucu ayarı eksik (SUPABASE_SERVICE_ROLE_KEY).');
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'Oturum bulunamadı. Lütfen yeniden giriş yapın.');
    const user = await getAuthUser(e, token);
    if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
    if ((user.email || '').toLowerCase() !== HEAD_ADMIN_EMAIL) throw new HttpError(403, 'Kurumlar arası geçişi yalnızca genel yönetici yapabilir.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action === 'enter') return res.status(200).json(await actionEnter(e, body));
    throw new HttpError(400, 'Bilinmeyen işlem.');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[kurum]', err && err.stack ? err.stack : err);
    return res.status(status).json({ ok: false, error: err instanceof HttpError ? err.message : 'Beklenmeyen bir sunucu hatası oluştu.' });
  }
}
