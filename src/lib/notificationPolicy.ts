// ============================================================================
// Aşama 72: BİLDİRİM İZİNLERİ (yönetici ayarı)
// Hangi bilgi (etüt, ödev, plan, soru, deneme …) kime (öğrenci, veli, öğretmen) hangi yolla
// (e-posta, telefon bildirimi, SMS, WhatsApp) gider. Ayar Supabase'de "notification_policy" tablosunda
// tek satırda tutulur; e-posta ve telefon bildirimi gönderen sunucu (api/mail.js, api/push.js) aynı ayarı okur.
// Sunucudaki kopya: api/_notifyPolicy.js — kategori / kanal listesi iki dosyada AYNI tutulmalıdır.
// ============================================================================

export type PolicyCategory = 'etut' | 'yoklama' | 'odev' | 'plan' | 'soru' | 'deneme' | 'mesaj' | 'tebrik';
export type PolicyRecipient = 'ogrenci' | 'veli' | 'ogretmen';
export type PolicyChannel = 'email' | 'push' | 'sms' | 'whatsapp';

export type NotificationPolicy = Record<PolicyCategory, Record<PolicyRecipient, Partial<Record<PolicyChannel, boolean>>>>;

export const POLICY_RECIPIENTS: { id: PolicyRecipient; label: string }[] = [
  { id: 'ogrenci', label: 'Öğrenci' },
  { id: 'veli', label: 'Veli' },
  { id: 'ogretmen', label: 'Öğretmen / Yönetici' },
];

export const POLICY_CHANNELS: { id: PolicyChannel; label: string; short: string; live: boolean }[] = [
  { id: 'email', label: 'E-posta', short: 'E-posta', live: true },
  { id: 'push', label: 'Telefon bildirimi (uygulama)', short: 'Bildirim', live: true },
  { id: 'sms', label: 'SMS', short: 'SMS', live: true },
  { id: 'whatsapp', label: 'WhatsApp', short: 'WhatsApp', live: false },
];

/**
 * Her kategori için: açıklama ve hangi alıcıya hangi kanalların SİSTEMDE karşılığı olduğu.
 * Aşama 73: SMS, e-postası olan bilgiler için çalışır (mesaj ve tebrik yalnızca uygulama bildirimiyle gider).
 * WhatsApp seçimi saklanır; otomatik gönderim için ayrı hizmet gerekir.
 * Veliye telefon bildirimi yoktur (velinin uygulama hesabı yok).
 */
export const POLICY_CATEGORIES: {
  id: PolicyCategory;
  label: string;
  hint: string;
  channels: Record<PolicyRecipient, PolicyChannel[]>;
}[] = [
  {
    id: 'etut',
    label: 'Etüt',
    hint: 'Yeni etüt, değişiklik, iptal, etüt hatırlatması',
    channels: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: ['email', 'push', 'sms', 'whatsapp'] },
  },
  {
    id: 'yoklama',
    label: 'Etüt yoklaması',
    hint: 'Yoklama bağlantısı ve "yoklama alınmadı" uyarısı',
    channels: { ogrenci: [], veli: [], ogretmen: ['email', 'push', 'sms', 'whatsapp'] },
  },
  {
    id: 'odev',
    label: 'Ödev',
    hint: 'Yeni ödev ve teslim günü hatırlatması',
    channels: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  },
  {
    id: 'plan',
    label: 'Haftalık plan',
    hint: 'Gönderilen plan, günlük plan hatırlatması, öğretmene plan raporu',
    channels: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: ['email', 'sms', 'whatsapp'] },
  },
  {
    id: 'soru',
    label: 'Soru takibi',
    hint: 'Soru hedefi ve akşam "soru sayını gir" hatırlatması',
    channels: { ogrenci: ['email', 'push', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  },
  {
    id: 'deneme',
    label: 'Deneme sonucu',
    hint: 'Deneme karnesi',
    channels: { ogrenci: ['email', 'sms', 'whatsapp'], veli: ['email', 'sms', 'whatsapp'], ogretmen: [] },
  },
  {
    id: 'mesaj',
    label: 'Mesaj ve duyuru',
    hint: 'Duyuru, öğretmen notu, soru cevabı, öğrenciden gelen mesaj',
    channels: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: ['push', 'whatsapp'] },
  },
  {
    id: 'tebrik',
    label: 'Tebrik',
    hint: 'Öğretmenin tebrik mesajı',
    channels: { ogrenci: ['push', 'whatsapp'], veli: ['whatsapp'], ogretmen: [] },
  },
];

/** Varsayılan: bugüne kadar gönderilen her şey açık, veliye ve SMS / WhatsApp kapalı (davranış değişmez) */
export function defaultPolicy(): NotificationPolicy {
  const out = {} as NotificationPolicy;
  for (const c of POLICY_CATEGORIES) {
    out[c.id] = { ogrenci: {}, veli: {}, ogretmen: {} };
    for (const r of POLICY_RECIPIENTS) {
      for (const ch of c.channels[r.id]) {
        out[c.id][r.id][ch] = r.id !== 'veli' && (ch === 'email' || ch === 'push');
      }
    }
  }
  return out;
}

/** Kayıttan gelen (eksik / eski) ayarı tam ve geçerli hâle getirir */
export function normalizePolicy(raw: unknown): NotificationPolicy {
  const base = defaultPolicy();
  const src = raw && typeof raw === 'object' ? (raw as any) : {};
  for (const c of POLICY_CATEGORIES) {
    for (const r of POLICY_RECIPIENTS) {
      for (const ch of c.channels[r.id]) {
        const v = src?.[c.id]?.[r.id]?.[ch];
        if (typeof v === 'boolean') base[c.id][r.id][ch] = v;
      }
    }
  }
  return base;
}
