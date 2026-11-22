// ============================================================================
// Aşama 368: DONDURULMUŞ KURUM (sunucu tarafı ortak denetim)
// Giriş anahtarını veritabanındaki kanca keser (sql/368). Bu dosya sunucunun KENDİ işlerini durdurur:
//  * oturumlu istek: dondurulmuş kurumdaki kişinin isteği reddedilir (anahtarı süresi dolmadan kullanılsa da)
//  * otomatik e-posta / SMS / telefon bildirimi: dondurulmuş kurumun gönderimi atlanır
//  * girişsiz bağlantılar (veli, karne, yoklama, plan işaretleme): "geçici olarak kapalı"
// Hız: dondurulmuş kurumların listesi 30 sn önbellekte; hiç dondurulmuş kurum yoksa ek istek yapılmaz.
// Güvenli varsayılan: 368 SQL'i kurulu değilse ya da okuma hata verirse hiçbir şey durmaz (bugünkü davranış).
// oku(path): service anahtarıyla PostgREST okuyan, satır dizisi döndüren işlev (her api dosyası kendi yardımcısını verir).
// ============================================================================

export const DONDURMA_MESAJ = 'Kurumunuzun hesabı geçici olarak durduruldu. Bilgi için okulunuzla görüşün.';
export const DONDURMA_SAYFA_YAZI = 'Okulunuzun hesabı şu an geçici olarak kapalı. Açıldığında bu bağlantı yeniden çalışır.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURE = 30 * 1000;
let onbellek = { at: 0, set: new Set() };

/** Dondurulmuş kurum kimlikleri (Set) */
export async function dondurulmusKurumlar(oku) {
  if (Date.now() - onbellek.at < SURE) return onbellek.set;
  let set = new Set();
  try {
    const rows = await oku('kurum_durumlari?select=kurum_id&durum=eq.donduruldu');
    set = new Set((rows || []).map((r) => String(r.kurum_id)));
  } catch {
    set = new Set(); // 368 kurulu değil: hiçbir şey durmaz
  }
  onbellek = { at: Date.now(), set };
  return set;
}

export async function kurumDondurulmus(oku, kurumId) {
  if (!kurumId) return false;
  return (await dondurulmusKurumlar(oku)).has(String(kurumId));
}

const liste = (ids) => `(${ids.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',')})`;

/** Kişinin (auth kimliği) kurumu: önce öğretmen, sonra öğrenci kaydı */
async function kisininKurumu(oku, authId) {
  const [t, s] = await Promise.all([
    oku(`teachers?select=kurum_id&auth_user_id=eq.${authId}&kurum_id=not.is.null&limit=1`).catch(() => []),
    oku(`students?select=kurum_id&auth_user_id=eq.${authId}&kurum_id=not.is.null&limit=1`).catch(() => []),
  ]);
  return (t && t[0] && t[0].kurum_id) || (s && s[0] && s[0].kurum_id) || null;
}

/** Oturum anahtarındaki oturum kimliği (anahtar Supabase'de az önce doğrulandı; imza burada denetlenmez) */
export function oturumKimligi(accessToken) {
  try {
    const part = String(accessToken || '').split('.')[1] || '';
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.session_id === 'string' ? json.session_id : '';
  } catch {
    return '';
  }
}

/**
 * Oturumlu isteği yapan kişinin kurumu dondurulmuş mu.
 * Sistem sahibinin kuruma geçiş ve "gözüyle bak" oturumları muaftır (kanca ile aynı kural).
 */
export async function kisiDondurulmus(oku, authId, accessToken) {
  try {
    const set = await dondurulmusKurumlar(oku);
    if (!set.size || !authId || !UUID.test(String(authId))) return false;
    const kid = await kisininKurumu(oku, authId);
    if (!kid || !set.has(String(kid))) return false;
    const sid = oturumKimligi(accessToken);
    if (UUID.test(sid)) {
      const gozuSinir = encodeURIComponent(new Date(Date.now() - 12 * 3600_000).toISOString());
      const [g, z] = await Promise.all([
        oku(`kurum_gecis_oturumlari?select=session_id&session_id=eq.${sid}&auth_user_id=eq.${authId}`).catch(() => []),
        oku(`kullanici_gozu_oturumlari?select=session_id&session_id=eq.${sid}&hedef_auth_id=eq.${authId}&bitti=is.null&basladi=gt.${gozuSinir}`).catch(() => []),
      ]);
      if ((g && g.length) || (z && z.length)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Alıcı listesinden (auth kimlikleri) dondurulmuş kurumdakileri çıkarır */
export async function dondurulmusDisinda(oku, authIds) {
  const ids = (authIds || []).filter((x) => typeof x === 'string' && UUID.test(x));
  if (!ids.length) return authIds || [];
  try {
    const set = await dondurulmusKurumlar(oku);
    if (!set.size) return authIds;
    const kapali = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      const [t, s] = await Promise.all([
        oku(`teachers?select=auth_user_id,kurum_id&auth_user_id=in.${liste(part)}&kurum_id=not.is.null`),
        oku(`students?select=auth_user_id,kurum_id&auth_user_id=in.${liste(part)}&kurum_id=not.is.null`),
      ]);
      for (const r of [...(t || []), ...(s || [])]) if (set.has(String(r.kurum_id))) kapali.add(String(r.auth_user_id));
    }
    return kapali.size ? authIds.filter((x) => !kapali.has(String(x))) : authIds;
  } catch {
    return authIds;
  }
}

/** Öğrencinin (students.id) kurumu dondurulmuş mu (girişsiz bağlantılar için) */
export async function ogrenciDondurulmus(oku, studentId) {
  try {
    const set = await dondurulmusKurumlar(oku);
    if (!set.size || !studentId) return false;
    const r = await oku(`students?select=kurum_id&id=eq.${encodeURIComponent(String(studentId))}&limit=1`);
    return !!(r && r[0] && r[0].kurum_id && set.has(String(r[0].kurum_id)));
  } catch {
    return false;
  }
}

/** Öğretmenin (teachers.id) kurumu dondurulmuş mu */
export async function ogretmenDondurulmus(oku, teacherId) {
  try {
    const set = await dondurulmusKurumlar(oku);
    if (!set.size || !teacherId) return false;
    const r = await oku(`teachers?select=kurum_id&id=eq.${encodeURIComponent(String(teacherId))}&limit=1`);
    return !!(r && r[0] && r[0].kurum_id && set.has(String(r[0].kurum_id)));
  } catch {
    return false;
  }
}

/** Sistem sahibi kuruma geçmeden / gözüyle bakmadan hemen önce: 2 dakikalık giriş izni (kanca tanır) */
export async function gecisIzniVer(yaz, authId) {
  try {
    await yaz('dondurma_gecis_izni?on_conflict=auth_user_id', 'POST', { auth_user_id: authId, bitis: new Date(Date.now() + 120000).toISOString() }, 'resolution=merge-duplicates,return=minimal');
  } catch {
    // 368 kurulu değil: izin gerekmez
  }
}
export async function gecisIzniKaldir(yaz, authId) {
  try {
    await yaz(`dondurma_gecis_izni?auth_user_id=eq.${authId}`, 'DELETE', undefined, 'return=minimal');
  } catch {
    // süresi 2 dakikada kendiliğinden geçer
  }
}

/** Test için önbelleği sıfırlar */
export function _onbellekSifirla() {
  onbellek = { at: 0, set: new Set() };
}
