// ============================================================================
// Aşama 72: BİLDİRİM İZİNLERİ — sunucu tarafı (api/mail.js ve api/push.js kullanır)
// Adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz; yalnızca içe aktarılır.
// Kategori / alıcı / kanal listesi src/lib/notificationPolicy.ts ile AYNI tutulmalıdır.
// Ayar okunamazsa (tablo yoksa, hata olursa) varsayılan kullanılır: bugüne kadar giden her şey gider,
// veliye hiçbir şey gitmez. Böylece ayar tablosu kurulmadan da sistem eskisi gibi çalışır.
// ============================================================================

const CHANNELS = {
  etut: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: ['email', 'push', 'sms', 'whatsapp'] },
  yoklama: { ogrenci: [], veli: [], ogretmen: ['email', 'push', 'sms', 'whatsapp'] },
  odev: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  plan: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: ['email', 'sms', 'whatsapp'] },
  soru: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  deneme: { ogrenci: ['email', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  mesaj: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: ['push', 'whatsapp'] },
  tebrik: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: [] },
};

/** E-posta olayı → kategori. Listede olmayanlar (hesap bilgisi, deneme e-postası) her zaman gönderilir. */
export const MAIL_EVENT_CATEGORY = {
  'homework-created': 'odev',
  'homework-reminder': 'odev',
  'etut-created': 'etut',
  'etut-scheduled': 'etut',
  'etut-changed': 'etut',
  'etut-cancelled': 'etut',
  'etut-attendance': 'yoklama',
  'etut-no-attendance': 'yoklama',
  'question-target': 'soru',
  'plan-sent': 'plan',
  'plan-report': 'plan',
  'deneme-karne': 'deneme',
};

function defaultValue(cat, rec, ch) {
  return rec !== 'veli' && (ch === 'email' || ch === 'push');
}

let cache = null; // { at, policy }
const CACHE_MS = 60 * 1000;

/**
 * Ayarı okur (60 sn önbellek). restFn: (path, { token: 'service' }) => satırlar.
 * Hata olursa null döner (varsayılan kullanılır).
 */
export async function loadPolicy(restFn) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.policy;
  let policy = null;
  try {
    const rows = await restFn('notification_policy?select=policy&id=eq.default', { token: 'service' });
    policy = rows && rows[0] && rows[0].policy && typeof rows[0].policy === 'object' ? rows[0].policy : null;
  } catch {
    policy = null;
  }
  cache = { at: Date.now(), policy };
  return policy;
}

/** Bu kategori bu alıcıya bu kanaldan gidebilir mi */
export function allowed(policy, cat, rec, ch) {
  if (!cat || !CHANNELS[cat]) return true; // kategorisiz bilgi: her zaman
  const list = CHANNELS[cat][rec] || [];
  // sistemde karşılığı yoksa eski davranış (e-posta / bildirim gider); SMS ve WhatsApp yalnızca açıkça izin verilirse
  if (!list.includes(ch)) return rec !== 'veli' && (ch === 'email' || ch === 'push');
  const v = policy && policy[cat] && policy[cat][rec] ? policy[cat][rec][ch] : undefined;
  return typeof v === 'boolean' ? v : defaultValue(cat, rec, ch);
}
