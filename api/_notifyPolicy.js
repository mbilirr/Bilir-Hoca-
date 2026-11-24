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
  devamsizlik: { ogrenci: [], veli: ['email', 'sms'], ogretmen: ['email', 'push', 'sms'] }, // Aşama 223: gün sonu özeti · Aşama 231: ders sonu bildirimi · Aşama 232: sınır uyarısı · Aşama 391: öğretmen / idare (Ders yoklaması)
  odev: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  plan: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: ['email', 'sms', 'whatsapp'] },
  soru: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  deneme: { ogrenci: ['email', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  mesaj: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: ['push', 'whatsapp'] },
  tebrik: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: [] },
  takvim: { ogrenci: [], veli: [], ogretmen: ['email', 'sms'] }, // Aşama 328: yaklaşan zümre etkinliği
  oyun: { ogrenci: ['push'], veli: [], ogretmen: [] }, // Aşama 385: yeni oyun
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
  'ders-devamsizlik-ozet': 'devamsizlik', // Aşama 223
  'ders-devamsizlik-ders': 'devamsizlik', // Aşama 231: ders sonu bildirimi
  'ders-devamsizlik-sinir': 'devamsizlik', // Aşama 232: devamsızlık sınırı uyarısı (veli)
  'ders-yoklama-gecikme': 'devamsizlik', // Aşama 391: idareye "ders yoklaması alınmadı" (eskiden izinsiz, her zaman giderdi)
  'ders-devamsizlik-sinir-idare': 'devamsizlik', // Aşama 391: idareye devamsızlık sınırı özeti
  'question-target': 'soru',
  'plan-sent': 'plan',
  'plan-report': 'plan',
  'deneme-karne': 'deneme',
  'akademik-takvim': 'takvim', // Aşama 328
  'akademik-durum-sor': 'takvim', // Aşama 375: etkinlik yapıldı mı?
  'akademik-durum': 'takvim', // Aşama 375: durum zümre başkanı + idareye
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
  let v = policy && policy[cat] && policy[cat][rec] ? policy[cat][rec][ch] : undefined;
  // Aşama 391: eski kayıtta ders yoklaması hatırlatması "yoklama" izniyle gidiyordu; yeni ayar kaydedilene kadar o seçim geçerli
  if (v === undefined && cat === 'devamsizlik' && rec === 'ogretmen' && ch === 'push' && policy && policy.yoklama && policy.yoklama.ogretmen) v = policy.yoklama.ogretmen.push;
  return typeof v === 'boolean' ? v : defaultValue(cat, rec, ch);
}
