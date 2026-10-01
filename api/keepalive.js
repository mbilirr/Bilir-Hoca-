// Supabase ücretsiz planda proje 7 gün hiç kullanılmazsa duraklatılır (tatillerde olabilir).
// Vercel bu adresi her gün bir kez otomatik çağırır (vercel.json -> crons); veritabanına küçük,
// zararsız bir okuma isteği gider ve proje "kullanılıyor" sayılır. Hiçbir veri değişmez.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zzdchsxfjzedgciejuxd.supabase.co';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
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
