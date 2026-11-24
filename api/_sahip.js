// ============================================================================
// Aşama 379: SİSTEM SAHİBİ E-POSTASI TEK YERDE (sunucu tarafı)
// api/kurum.js, api/mail.js ve api/push.js bu sabiti buradan alır; eskiden her dosyada ayrı yazılıydı.
// Adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz (işlev sayısı artmaz).
// İstemcideki karşılığı: src/services/veri/ortak.ts ADMIN_EMAIL. Veritabanında: is_head_admin().
// Supabase işlevi (supabase/functions/create-user) ayrı yayınlandığı için kendi kopyasını tutar.
// ============================================================================
export const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';
