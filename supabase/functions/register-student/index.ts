// =============================================================================
// register-student — Aşama 108: ÖĞRENCİ KAYDI KAPALI.
// Öğrenci kendi kendine kayıt olamaz; öğrenciyi kurum (yönetici, Müdür, Müdür Yrd., izin verilmişse Rehberlik /
// Ölçme Değerlendirme) ekler. Bu fonksiyon eski kayıt bağlantılarından gelen her isteği reddeder; veritabanına
// dokunmaz, hesap açmaz. Daha önce gelmiş bekleyen başvurular create-user (approve/reject_application) ile sonuçlanır.
// Geri almak için Aşama 106 paketindeki register-student/index.ts yeniden yapıştırılır.
// =============================================================================

const ALLOWED_ORIGIN_PATTERN = /^https:\/\/((www\.)?biliredu\.com|(biliredu|pusulaedu)(-[a-z0-9-]+)?\.vercel\.app)$/;
const DEFAULT_ORIGIN = 'https://www.biliredu.com';

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGIN_PATTERN.test(origin) ? origin : DEFAULT_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

Deno.serve((req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: 'Öğrenci kaydı kapalıdır. Öğrenci kaydını okulunuz yapar; giriş bilgilerinizi okulunuzdan alınız.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
