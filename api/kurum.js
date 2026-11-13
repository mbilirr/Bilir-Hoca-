// ============================================================================
// Aşama 97: KURUMLAR ARASI GEÇİŞ (yalnızca genel yönetici)
// Genel yönetici üst menüden bir kurum seçince bu adres, o kurumun yöneticisi için bu sekmede kullanılacak bir
// oturum üretir. Böylece genel yönetici kurumu, kurum yöneticisinin gözüyle görür ve düzenler; şifre gerekmez.
//   POST /api/kurum  { action: 'enter', kurumId }   (Authorization: Bearer <genel yöneticinin oturumu>)
// Güvenlik:
//   * Çağıran yalnızca genel yönetici (m.bilirr@gmail.com) olabilir; başka hesaba 403.
//   * Hedef yalnızca o kurumun ONAYLI kurum yöneticisi hesabıdır (öğretmen ya da öğrenci hesabına geçilemez).
//   * Üretilen oturum yalnızca yanıt olarak döner; e-posta gönderilmez.
//   * Aşama 98: oturumun KİMLİĞİ (anahtarı değil) kurum_gecis_oturumlari tablosuna yazılır. Veritabanı bu sayede
//     "genel yönetici kuruma geçti" durumunu tanır (rol anahtarı, Müdür rolü, bölüm izinleri yalnızca o kurumda açılır).
//     Kayıt 7 gün geçerlidir; eski kayıtlar her geçişte silinir.
// Aşama 252: KULLANICI GÖZÜYLE BAK (yalnız genel yönetici)
//   POST /api/kurum { action: 'kisiAra', q, kurumId }  → bütün kurumlarda (ya da kendi alanında) öğretmen/öğrenci arar
//   POST /api/kurum { action: 'gozuyle', authUserId }  → o kişinin hesabıyla bu sekmede kullanılacak oturum üretir
//   POST /api/kurum { action: 'gozuBitir', sessionId } → bakışın bitiş zamanını yazar
//   * Oturumun kimliği kullanici_gozu_oturumlari tablosuna yazılır (kurum_gecis_oturumlari'na YAZILMAZ: kişi kendi
//     yetkileriyle görür, genel yönetici yetkisi taşınmaz). Bu oturumla yapılan her yazma işlemi veritabanı tetiğiyle
//     kullanici_gozu_islemleri tablosuna düşer (sql/252).
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

// Oturum anahtarının içindeki oturum kimliği (imza denetimi gerekmez: anahtar az önce Supabase'den alındı)
function sessionIdOf(accessToken) {
  try {
    const part = String(accessToken).split('.')[1] || '';
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.session_id === 'string' ? json.session_id : '';
  } catch {
    return '';
  }
}

async function recordGecis(e, sessionId, authUserId, kurumId) {
  const old = new Date(Date.now() - 7 * 864e5).toISOString();
  const [ins] = await Promise.all([
    fetch(`${e.url}/rest/v1/kurum_gecis_oturumlari`, {
      method: 'POST',
      headers: { ...serviceHeaders(e), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ session_id: sessionId, auth_user_id: authUserId, kurum_id: kurumId }),
    }),
    fetch(`${e.url}/rest/v1/kurum_gecis_oturumlari?created_at=lt.${encodeURIComponent(old)}`, {
      method: 'DELETE',
      headers: { ...serviceHeaders(e), Prefer: 'return=minimal' },
    }).catch(() => null),
  ]);
  if (!ins.ok) throw new HttpError(502, 'Kuruma geçiş kaydedilemedi. Aşama 98 SQL dosyası çalıştırıldı mı?');
}

// Tek kullanımlık bağlantı kodu üretilir (e-posta GÖNDERİLMEZ) ve hemen oturuma çevrilir (Aşama 252: ortak)
async function magicSession(e, email, ad) {
  const gl = await fetch(`${e.url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: serviceHeaders(e),
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const link = await readJson(gl);
  const hashed = link && (link.hashed_token || (link.properties && link.properties.hashed_token));
  if (!gl.ok || !hashed) throw new HttpError(502, `${ad} oluşturulamadı.`);
  const vr = await fetch(`${e.url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: e.anon || e.service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  });
  const session = await readJson(vr);
  if (!vr.ok || !session || !session.access_token || !session.refresh_token) throw new HttpError(502, `${ad} doğrulanamadı.`);
  return session;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function actionEnter(e, body) {
  const kurumId = String(body.kurumId || '');
  if (!UUID.test(kurumId)) throw new HttpError(400, 'Geçersiz kurum.');
  // Aşama 251: kurum ve yöneticileri aynı anda okunur (sırayla değil)
  const [kurumlar, admins] = await Promise.all([
    rest(e, `kurumlar?select=id,name&id=eq.${kurumId}`),
    // Kurumun onaylı yöneticisi (birden çoksa en eskisi)
    rest(
      e,
      `teachers?select=id,name,status,auth_user_id,created_at&kurum_id=eq.${kurumId}&is_admin=is.true&auth_user_id=not.is.null&order=created_at.asc`
    ),
  ]);
  const kurum = kurumlar[0];
  if (!kurum) throw new HttpError(404, 'Kurum bulunamadı.');
  const target = admins.find((t) => !t.status || t.status === 'approved');
  if (!target) throw new HttpError(409, `"${kurum.name}" kurumunun onaylı bir yöneticisi yok. Önce kuruma yönetici atayın.`);

  // Hedef hesabın giriş adresi
  const ur = await fetch(`${e.url}/auth/v1/admin/users/${target.auth_user_id}`, { headers: serviceHeaders(e) });
  const authUser = await readJson(ur);
  if (!ur.ok || !authUser || !authUser.email) throw new HttpError(502, 'Kurum yöneticisinin giriş hesabı okunamadı.');
  if ((authUser.email || '').toLowerCase() === HEAD_ADMIN_EMAIL) throw new HttpError(400, 'Geçersiz hedef.');
  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) throw new HttpError(409, 'Kurum yöneticisinin hesabı askıya alınmış.');

  // Tek kullanımlık bağlantı kodu üretilir (e-posta GÖNDERİLMEZ) ve hemen oturuma çevrilir
  const session = await magicSession(e, authUser.email, 'Kuruma geçiş oturumu');

  const sid = sessionIdOf(session.access_token);
  if (!UUID.test(sid)) throw new HttpError(502, 'Kuruma geçiş oturumu tanınamadı.');
  await recordGecis(e, sid, target.auth_user_id, kurum.id);

  return {
    ok: true,
    kurum: { id: kurum.id, name: kurum.name },
    admin: { id: target.id, name: target.name },
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  };
}

// ---------------------------------------------------------------------------
// Aşama 252: KULLANICI GÖZÜYLE BAK
// ---------------------------------------------------------------------------
// PostgREST süzgecini bozabilecek işaretler aramadan çıkarılır
const temizAra = (q) => String(q || '').replace(/[,()*%\\:"'.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// Aşama 252b: arama tek veritabanı çağrısıyla yapılır (sql/252b gozu_kisi_ara). Fonksiyon yoksa eski yol kullanılır.
async function actionKisiAra(e, body) {
  const q = temizAra(body.q);
  if (q.length < 2) return { ok: true, kisiler: [] }; // boş arama: sunucuyu ısıtmak için de kullanılır
  const kurumId = String(body.kurumId || '');
  if (kurumId && kurumId !== 'kendi' && !UUID.test(kurumId)) throw new HttpError(400, 'Geçersiz kurum.');
  const r = await fetch(`${e.url}/rest/v1/rpc/gozu_kisi_ara`, {
    method: 'POST',
    headers: serviceHeaders(e),
    body: JSON.stringify({ p_q: q, p_kurum: kurumId }),
  });
  if (r.ok) {
    const out = (await readJson(r)) || {};
    return { ok: true, kisiler: [...(out.ogretmen || []), ...(out.ogrenci || [])] };
  }
  await r.text().catch(() => null);
  return kisiAraEski(e, q, kurumId);
}

// 252b SQL'i çalıştırılmadıysa (eski yol: birkaç istek)
async function kisiAraEski(e, q, kurumId) {
  const kf = kurumId === 'kendi' ? '&kurum_id=is.null' : kurumId ? `&kurum_id=eq.${kurumId}` : '';
  const like = encodeURIComponent(`*${q}*`);
  const [ogretmen, ogrenci, kurumlar] = await Promise.all([
    rest(e, `teachers?select=id,name,username,branch,is_admin,kurum_id,auth_user_id,status&auth_user_id=not.is.null${kf}&or=(name.ilike.${like},username.ilike.${like})&order=name.asc&limit=15`),
    rest(e, `students?select=id,name,student_number,class_name,kurum_id,auth_user_id,status&auth_user_id=not.is.null${kf}&or=(name.ilike.${like},student_number.ilike.${like})&order=name.asc&limit=15`),
    rest(e, 'kurumlar?select=id,name'),
  ]);
  const ids = ogretmen.map((t) => t.id);
  const roller = ids.length
    ? await rest(e, `teacher_roles?select=teacher_id,role&teacher_id=in.(${ids.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',')})`)
    : [];
  const kurumAd = (id) => (id ? (kurumlar.find((k) => k.id === id) || {}).name || 'Kurum' : 'Kendi alanım');
  const kisiler = [
    ...ogretmen.map((t) => ({
      authUserId: t.auth_user_id,
      ad: t.name,
      tur: 'ogretmen',
      roller: roller.filter((r) => r.teacher_id === t.id).map((r) => r.role),
      yonetici: !!t.is_admin,
      ek: t.branch || '',
      kurumId: t.kurum_id || null,
      kurumAd: kurumAd(t.kurum_id),
      askida: t.status === 'suspended',
    })),
    ...ogrenci.map((s) => ({
      authUserId: s.auth_user_id,
      ad: s.name,
      tur: 'ogrenci',
      roller: [],
      yonetici: false,
      ek: [s.class_name, s.student_number].filter(Boolean).join(' · '),
      kurumId: s.kurum_id || null,
      kurumAd: kurumAd(s.kurum_id),
      askida: s.status === 'suspended',
    })),
  ];
  return { ok: true, kisiler };
}

async function actionGozuyle(e, body, owner) {
  const authUserId = String(body.authUserId || '');
  if (!UUID.test(authUserId)) throw new HttpError(400, 'Geçersiz kişi.');
  if (authUserId === owner.id) throw new HttpError(400, 'Kendi hesabınıza bakamazsınız.');
  const [tRows, sRows] = await Promise.all([
    rest(e, `teachers?select=id,name,kurum_id,status&auth_user_id=eq.${authUserId}`),
    rest(e, `students?select=id,name,kurum_id,status&auth_user_id=eq.${authUserId}`),
  ]);
  const kayit = tRows[0] || sRows[0];
  if (!kayit) throw new HttpError(404, 'Kişinin kaydı bulunamadı.');
  const tur = tRows[0] ? 'ogretmen' : 'ogrenci';
  const kurum = kayit.kurum_id ? (await rest(e, `kurumlar?select=id,name&id=eq.${kayit.kurum_id}`))[0] : null;

  const ur = await fetch(`${e.url}/auth/v1/admin/users/${authUserId}`, { headers: serviceHeaders(e) });
  const authUser = await readJson(ur);
  if (!ur.ok || !authUser || !authUser.email) throw new HttpError(502, 'Kişinin giriş hesabı okunamadı.');
  if ((authUser.email || '').toLowerCase() === HEAD_ADMIN_EMAIL) throw new HttpError(400, 'Geçersiz hedef.');
  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) throw new HttpError(409, 'Bu hesap askıya alınmış; giriş yapılamaz.');

  const session = await magicSession(e, authUser.email, 'Kişinin oturumu');
  const sid = sessionIdOf(session.access_token);
  if (!UUID.test(sid)) throw new HttpError(502, 'Kişinin oturumu tanınamadı.');
  const ins = await fetch(`${e.url}/rest/v1/kullanici_gozu_oturumlari`, {
    method: 'POST',
    headers: { ...serviceHeaders(e), Prefer: 'return=minimal' },
    body: JSON.stringify({
      session_id: sid,
      sahip_auth_id: owner.id,
      hedef_auth_id: authUserId,
      hedef_ad: kayit.name || '',
      hedef_tur: tur,
      kurum_id: kurum ? kurum.id : null,
      kurum_ad: kurum ? kurum.name : 'Kendi alanım',
    }),
  });
  if (!ins.ok) {
    // Kayıt yazılamadıysa oturum kullanılmaz ve kapatılır (kayıtsız bakış olmaz)
    await fetch(`${e.url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: e.anon || e.service, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => null);
    throw new HttpError(502, 'Bakış kaydedilemedi. Aşama 252 SQL dosyası çalıştırıldı mı?');
  }
  return {
    ok: true,
    kisi: { ad: kayit.name || '', tur, kurumAd: kurum ? kurum.name : 'Kendi alanım' },
    sessionId: sid,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  };
}

async function actionGozuBitir(e, body, owner) {
  const sid = String(body.sessionId || '');
  if (!UUID.test(sid)) return { ok: true };
  await fetch(`${e.url}/rest/v1/kullanici_gozu_oturumlari?session_id=eq.${sid}&sahip_auth_id=eq.${owner.id}&bitti=is.null`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(e), Prefer: 'return=minimal' },
    body: JSON.stringify({ bitti: new Date().toISOString() }),
  }).catch(() => null);
  return { ok: true };
}

// ============================================================================
// Aşama 256: BAĞLI HESAP — sistem sahibinin başka kurumdaki KENDİ öğretmen hesabı
//  bagla: kullanıcı adı (ya da e-posta) + o hesabın şifresi sunucuda doğrulanır, sonra bağ yazılır.
//  bagliGir: yalnız bağlanmış hesaba şifresiz oturum açılır (sekme o hesapla açılır; logodan geri dönülür).
// ============================================================================
const baglaDenemeleri = new Map();
function baglaSiniri(ownerId) {
  const now = Date.now();
  const list = (baglaDenemeleri.get(ownerId) || []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 8) throw new HttpError(429, 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.');
  list.push(now);
  baglaDenemeleri.set(ownerId, list);
}

async function actionBagla(e, body, owner) {
  const kim = String(body.kullanici || '').trim().toLowerCase();
  const sifre = String(body.sifre || '');
  if (kim.length < 3 || kim.length > 200) throw new HttpError(400, 'Kullanıcı adını yazın.');
  if (sifre.length < 6 || sifre.length > 200) throw new HttpError(400, 'O hesabın şifresini yazın.');
  baglaSiniri(owner.id);
  const alan = kim.includes('@') ? 'email' : 'username';
  const rows = await rest(e, `teachers?select=id,name,kurum_id,status,auth_user_id&${alan}=eq.${encodeURIComponent(kim)}&auth_user_id=not.is.null`);
  const t = rows[0];
  if (!t) throw new HttpError(404, 'Bu kullanıcı adıyla bir öğretmen hesabı bulunamadı.');
  if (t.auth_user_id === owner.id) throw new HttpError(400, 'Kendi hesabınızı bağlayamazsınız.');
  const ur = await fetch(`${e.url}/auth/v1/admin/users/${t.auth_user_id}`, { headers: serviceHeaders(e) });
  const authUser = await readJson(ur);
  if (!ur.ok || !authUser || !authUser.email) throw new HttpError(502, 'Hesabın giriş bilgisi okunamadı.');
  if (String(authUser.email).toLowerCase() === HEAD_ADMIN_EMAIL) throw new HttpError(400, 'Geçersiz hesap.');
  // Şifre doğrulaması: hesabın gerçekten size ait olduğunun kanıtı. Açılan sınama oturumu hemen kapatılır.
  const vr = await fetch(`${e.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: e.anon || e.service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: authUser.email, password: sifre }),
  });
  const ses = await readJson(vr);
  if (!vr.ok || !ses || !ses.access_token) throw new HttpError(401, 'Şifre doğrulanamadı. O hesabın güncel şifresini yazın.');
  await fetch(`${e.url}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: e.anon || e.service, Authorization: `Bearer ${ses.access_token}` },
  }).catch(() => null);
  const kurum = t.kurum_id ? (await rest(e, `kurumlar?select=id,name&id=eq.${t.kurum_id}`))[0] : null;
  const kayit = { sahip_auth_id: owner.id, hedef_auth_id: t.auth_user_id, hedef_ad: t.name || '', kurum_ad: kurum ? kurum.name : 'Kendi alanım' };
  const ins = await fetch(`${e.url}/rest/v1/bagli_hesaplar?on_conflict=sahip_auth_id,hedef_auth_id`, {
    method: 'POST',
    headers: { ...serviceHeaders(e), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(kayit),
  });
  if (!ins.ok) throw new HttpError(502, 'Bağ kaydedilemedi. Aşama 256 SQL dosyası çalıştırıldı mı?');
  return { ok: true, hesap: { authUserId: t.auth_user_id, ad: kayit.hedef_ad, kurumAd: kayit.kurum_ad } };
}

async function actionBagliGir(e, body, owner) {
  const hedef = String(body.authUserId || '');
  if (!UUID.test(hedef)) throw new HttpError(400, 'Geçersiz hesap.');
  const bag = await rest(e, `bagli_hesaplar?select=hedef_auth_id&sahip_auth_id=eq.${owner.id}&hedef_auth_id=eq.${hedef}`);
  if (!bag[0]) throw new HttpError(403, 'Bu hesap sizin hesabınıza bağlı değil.');
  const [tRows, ur] = await Promise.all([
    rest(e, `teachers?select=id,name,kurum_id,status&auth_user_id=eq.${hedef}`),
    fetch(`${e.url}/auth/v1/admin/users/${hedef}`, { headers: serviceHeaders(e) }),
  ]);
  const t = tRows[0];
  if (!t) throw new HttpError(404, 'Bağlı hesabın öğretmen kaydı bulunamadı.');
  const authUser = await readJson(ur);
  if (!ur.ok || !authUser || !authUser.email) throw new HttpError(502, 'Bağlı hesabın giriş bilgisi okunamadı.');
  if (String(authUser.email).toLowerCase() === HEAD_ADMIN_EMAIL) throw new HttpError(400, 'Geçersiz hesap.');
  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) throw new HttpError(409, 'Bu hesap askıya alınmış; giriş yapılamaz.');
  const kurum = t.kurum_id ? (await rest(e, `kurumlar?select=id,name&id=eq.${t.kurum_id}`))[0] : null;
  const session = await magicSession(e, authUser.email, 'Hesap oturumu');
  return {
    ok: true,
    hesap: { authUserId: hedef, ad: t.name || '', kurumAd: kurum ? kurum.name : 'Kendi alanım' },
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    // Aşama 252b: kişi araması yetki denetimiyle AYNI ANDA başlar (sırayla değil); sonuç yalnız denetim geçerse döner
    const arama = body.action === 'kisiAra' ? actionKisiAra(e, body).then((v) => ({ v }), (err) => ({ err })) : null;
    const user = await getAuthUser(e, token);
    if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
    if ((user.email || '').toLowerCase() !== HEAD_ADMIN_EMAIL) throw new HttpError(403, 'Bu işlemi yalnızca genel yönetici yapabilir.');
    if (body.action === 'enter') return res.status(200).json(await actionEnter(e, body));
    if (body.action === 'bagla') return res.status(200).json(await actionBagla(e, body, user)); // Aşama 256
    if (body.action === 'bagliGir') return res.status(200).json(await actionBagliGir(e, body, user)); // Aşama 256
    if (arama) {
      const sonuc = await arama;
      if (sonuc.err) throw sonuc.err;
      return res.status(200).json(sonuc.v);
    }
    if (body.action === 'gozuyle') return res.status(200).json(await actionGozuyle(e, body, user));
    if (body.action === 'gozuBitir') return res.status(200).json(await actionGozuBitir(e, body, user));
    throw new HttpError(400, 'Bilinmeyen işlem.');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[kurum]', err && err.stack ? err.stack : err);
    return res.status(status).json({ ok: false, error: err instanceof HttpError ? err.message : 'Beklenmeyen bir sunucu hatası oluştu.' });
  }
}
