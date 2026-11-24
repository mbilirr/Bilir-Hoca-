// ============================================================================
// Aşama 72: BİLDİRİM İZİNLERİ (yönetici ayarı)
// Hangi bilgi (etüt, ödev, plan, soru, deneme …) kime (öğrenci, veli, öğretmen) hangi yolla
// (e-posta, telefon bildirimi, SMS, WhatsApp) gider. Ayar Supabase'de "notification_policy" tablosunda
// tek satırda tutulur; e-posta ve telefon bildirimi gönderen sunucu (api/mail.js, api/push.js) aynı ayarı okur.
// Sunucudaki kopya: api/_notifyPolicy.js — kategori / kanal listesi iki dosyada AYNI tutulmalıdır.
// ============================================================================

export type PolicyCategory = 'etut' | 'yoklama' | 'devamsizlik' | 'odev' | 'plan' | 'soru' | 'deneme' | 'mesaj' | 'tebrik' | 'takvim' | 'oyun'; // Aşama 223: devamsizlik · Aşama 328: takvim · Aşama 385: oyun
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
  hints?: Partial<Record<PolicyRecipient, string>>; // Aşama 391: alıcı sekmesine göre açıklama (yoksa hint)
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
    label: 'Yoklama hatırlatması', // Aşama 230 · Aşama 391: ders yoklaması hatırlatması "Ders yoklaması" satırına taşındı
    hint: 'Etüt yoklama bağlantısı ve "etüt yoklaması alınmadı" hatırlatması (öğretmene)',
    channels: { ogrenci: [], veli: [], ogretmen: ['email', 'push', 'sms', 'whatsapp'] },
  },
  // Aşama 223: ders yoklamasından veliye gün sonu tek özet (varsayılan kapalı) · Aşama 231: ders sonu bildirimi · Aşama 232: devamsızlık sınırı uyarısı
  // Aşama 391: ders programı yoklamasının bütün gönderimleri tek satırda (veli + öğretmen / idare)
  {
    id: 'devamsizlik',
    label: 'Ders yoklaması',
    hint: 'Ders programından alınan yoklama',
    hints: {
      veli: 'Derse gelmedi / geç kaldı bildirimi (ders sonu ya da gün sonu özeti) ve devamsızlık sınırı uyarısı; zamanı Yönetim › Ders programı › Ders saatleri altında',
      ogretmen: 'Öğretmene ders yoklaması hatırlatması, idareye "ders yoklaması alınmadı" özeti ve devamsızlık sınırı özeti; alıcılar Yönetim › Ders programı › Ders saatleri altında',
    },
    channels: { ogrenci: [], veli: ['email', 'sms'], ogretmen: ['email', 'push', 'sms'] },
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
  // Aşama 328: zümre etkinliği yaklaşınca zümre öğretmenlerine (okul dışı 12, okul içi 6 gün önce)
  {
    id: 'takvim',
    label: 'Akademik takvim',
    hint: 'Yaklaşan zümre etkinliği hatırlatması (okul dışı 12 gün, okul içi 6 gün önce), bitince "yapıldı mı?" sorusu ve işaretlenen durumun zümre başkanı + idareye bildirimi (SMS yalnız Ertelendi / İptal); üyeler Akademik takvim › Zümreler',
    channels: { ogrenci: [], veli: [], ogretmen: ['email', 'sms'] },
  },
  // Aşama 385: öğretmen yeni oyun hazırlayınca sınıfın öğrencilerine (uygulama içi bildirim her zaman yazılır)
  {
    id: 'oyun',
    label: 'Oyunlar',
    hint: 'Öğretmen sınıfa yeni oyun hazırlayınca öğrencinin telefonuna bildirim',
    channels: { ogrenci: ['push'], veli: [], ogretmen: [] },
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
        let v = src?.[c.id]?.[r.id]?.[ch];
        // Aşama 391: eski kayıtta ders yoklaması hatırlatması "Yoklama hatırlatması" izniyle gidiyordu; seçim korunur
        if (v === undefined && c.id === 'devamsizlik' && r.id === 'ogretmen' && ch === 'push') v = src?.yoklama?.ogretmen?.push;
        if (typeof v === 'boolean') base[c.id][r.id][ch] = v;
      }
    }
  }
  return base;
}
