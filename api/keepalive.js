// Supabase ücretsiz planda proje 7 gün hiç kullanılmazsa duraklatılır (tatillerde olabilir).
// Vercel bu adresi her gün bir kez otomatik çağırır (vercel.json -> crons); veritabanına küçük,
// zararsız bir okuma isteği gider ve proje "kullanılıyor" sayılır. Hiçbir veri değişmez.
//
// Aşama 366: DIŞ İZLEME İÇİN SAĞLIK DENETİMİ — /api/keepalive?saglik=1
// Ücretsiz izleme hizmeti (ör. UptimeRobot) bu adresi birkaç dakikada bir çağırır; site ya da veritabanı çökerse
// size e-posta gelir. Yeni api dosyası açılmadı (Vercel Hobby işlev sayısı korunur).
//   - Veritabanı (REST) ve giriş servisi (Auth) ayrı ayrı denenir, her biri en çok 8 sn beklenir.
//   - İkisi de çalışıyorsa 200, biri bile çalışmıyorsa 503 döner (izleme hizmeti 503'ü "çöktü" sayar).
//   - Cevapta yalnız açık/kapalı ve süre vardır; hiçbir kayıt, anahtar ya da hata ayrıntısı verilmez.
//   - Aynı sunucu örneği sonucu 30 sn hatırlar: adres sık çağrılsa da veritabanına yük binmez.
const SAGLIK_ONBELLEK_MS = 30000;
let sonSaglik = null; // { t, kod, govde }

async function dene(url, headers) {
  const bas = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    return { ok: r.ok, ms: Date.now() - bas };
  } catch {
    return { ok: false, ms: Date.now() - bas };
  }
}

async function saglik(res, base, key) {
  res.setHeader('Cache-Control', 'no-store');
  if (sonSaglik && Date.now() - sonSaglik.t < SAGLIK_ONBELLEK_MS) {
    res.status(sonSaglik.kod).json(sonSaglik.govde);
    return;
  }
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const [db, auth] = await Promise.all([dene(`${base}/rest/v1/classes?select=id&limit=1`, h), dene(`${base}/auth/v1/health`, { apikey: key })]);
  const ok = db.ok && auth.ok;
  const govde = { ok, veritabani: db.ok ? 'calisiyor' : 'yanit yok', giris: auth.ok ? 'calisiyor' : 'yanit yok', sure_ms: Math.max(db.ms, auth.ms), at: new Date().toISOString() };
  sonSaglik = { t: Date.now(), kod: ok ? 200 : 503, govde };
  res.status(sonSaglik.kod).json(govde);
}

export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zzdchsxfjzedgciejuxd.supabase.co';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (req.query && req.query.saglik) {
    if (!key) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(503).json({ ok: false, veritabani: 'ayar eksik', giris: 'ayar eksik', at: new Date().toISOString() });
      return;
    }
    await saglik(res, url.replace(/\/+$/, ''), key);
    return;
  }
  if (!key) {
    res.status(500).json({ ok: false, error: 'VITE_SUPABASE_ANON_KEY ortam değişkeni bulunamadı' });
    return;
  }
  try {
    const r = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/classes?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
}
