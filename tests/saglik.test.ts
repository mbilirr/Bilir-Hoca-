import { test } from 'node:test';
import assert from 'node:assert/strict';

// Aşama 366: dış izleme sağlık denetimi (/api/keepalive?saglik=1). Ağ çağrıları sahte; canlıya bağlanılmaz.
function sahteCevap() {
  const r: any = { kod: 0, govde: null, basliklar: {} as Record<string, string> };
  r.status = (k: number) => ((r.kod = k), r);
  r.json = (g: unknown) => ((r.govde = g), r);
  r.setHeader = (a: string, b: string) => (r.basliklar[a] = b);
  return r;
}
async function cagir(surum: string, fetchSahte: (url: string) => Promise<{ ok: boolean }>) {
  const eski = globalThis.fetch;
  const istenen: string[] = [];
  (globalThis as any).fetch = async (url: string) => (istenen.push(url), fetchSahte(url));
  process.env.VITE_SUPABASE_ANON_KEY = 'sahte-anahtar';
  try {
    const { default: handler } = await import(`../api/keepalive.js?${surum}`);
    const res = sahteCevap();
    await handler({ query: { saglik: '1' } }, res);
    return { res, istenen };
  } finally {
    globalThis.fetch = eski;
  }
}

test('veritabanı ve giriş çalışıyorsa 200, cevapta anahtar ya da kayıt yok', async () => {
  const { res, istenen } = await cagir('a', async () => ({ ok: true }));
  assert.equal(res.kod, 200);
  assert.equal(res.govde.ok, true);
  assert.equal(res.basliklar['Cache-Control'], 'no-store');
  assert.ok(istenen.some((u) => u.endsWith('/auth/v1/health')));
  assert.ok(!JSON.stringify(res.govde).includes('sahte-anahtar'));
});

test('giriş servisi yanıt vermezse 503 (izleme hizmeti çöktü sayar)', async () => {
  const { res } = await cagir('b', async (u) => {
    if (u.includes('/auth/')) throw new Error('zaman aşımı');
    return { ok: true };
  });
  assert.equal(res.kod, 503);
  assert.equal(res.govde.giris, 'yanit yok');
  assert.equal(res.govde.veritabani, 'calisiyor');
});
