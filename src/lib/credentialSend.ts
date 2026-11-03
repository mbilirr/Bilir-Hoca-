import { callMail } from './mailApi';

// ============================================================================
// Aşama 142: giriş bilgisi (öğrenci no + ilk şifre) SMS / e-posta ile öğrenciye ve/veya veliye.
// Sunucu: /api/mail action 'credentials-send'. Şifre verilmezse sunucu kayıtlı ilk şifreyi kullanır;
// yoksa kişi noPassword listesinde döner (hiçbir şey gönderilmez).
// İstek başına en çok 10 kişi (60 sn sunucu sınırı); parçalar sırayla gider, ilerleme bildirilir.
// Gövde biçimi Aşama 144'te öğretmen için de (type: 'teacher') kullanılacak.
// ============================================================================

export type CredentialTarget = { type: 'student' | 'teacher'; id: string; password?: string };
export type CredentialChannels = { sms: boolean; email: boolean };
export type CredentialAudience = { ogrenci: boolean; veli: boolean; veliYakinlik?: string[]; veliSira?: number[] };

export interface CredentialSendSummary {
  ok: boolean;
  error?: string;
  students: number; // gönderime giren (şifresi olan) kişi
  notAllowed: number; // yetki / kurum dışı / pasif
  noAccount: string[];
  noPassword: string[];
  noPhone: number;
  noEmail: number;
  noVeliMatch: number;
  sms: { available: boolean; live: boolean; recipients: number; sent: number; dry: number; failed: number; skipped: number; limited: number; errors: string[] } | null;
  mail: { recipients: number; sent: number; failed: number; skipped: number; remaining: number; notConfigured: boolean; errors: string[] } | null;
}

export const CREDENTIAL_CHUNK = 10;

const newSendId = () => `cred-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function emptySummary(ch: CredentialChannels): CredentialSendSummary {
  return {
    ok: true,
    students: 0,
    notAllowed: 0,
    noAccount: [],
    noPassword: [],
    noPhone: 0,
    noEmail: 0,
    noVeliMatch: 0,
    sms: ch.sms ? { available: true, live: false, recipients: 0, sent: 0, dry: 0, failed: 0, skipped: 0, limited: 0, errors: [] } : null,
    mail: ch.email ? { recipients: 0, sent: 0, failed: 0, skipped: 0, remaining: 0, notConfigured: false, errors: [] } : null,
  };
}

/** İki sonucu birleştirir (ikinci tur: yeni şifre verilenler) */
export function mergeCredentialSummary(acc: CredentialSendSummary, r: any): void {
  acc.students += Number(r.students) || 0;
  acc.notAllowed += Number(r.notAllowed) || 0;
  acc.noAccount.push(...(Array.isArray(r.noAccount) ? r.noAccount : []));
  acc.noPassword.push(...(Array.isArray(r.noPassword) ? r.noPassword : []));
  acc.noPhone += Number(r.noPhone) || 0;
  acc.noEmail += Number(r.noEmail) || 0;
  acc.noVeliMatch += Number(r.noVeliMatch) || 0;
  if (acc.sms && r.sms) {
    const s = acc.sms;
    s.available = s.available && r.sms.available !== false;
    s.live = s.live || !!r.sms.live;
    for (const k of ['recipients', 'sent', 'dry', 'failed', 'skipped', 'limited'] as const) s[k] += Number(r.sms[k]) || 0;
    for (const e of r.sms.errors || []) if (s.errors.length < 3 && !s.errors.includes(e)) s.errors.push(e);
  }
  if (acc.mail && r.mail) {
    const m = acc.mail;
    for (const k of ['recipients', 'sent', 'failed', 'skipped', 'remaining'] as const) m[k] += Number(r.mail[k]) || 0;
    m.notConfigured = m.notConfigured || !!r.mail.notConfigured;
    for (const e of r.mail.errors || []) if (m.errors.length < 3 && !m.errors.includes(e)) m.errors.push(e);
  }
}

/** Kişileri 10'arlı parçalarla gönderir. Ağ / yetki hatasında durur ve o ana kadarki sonucu döndürür. */
export async function sendCredentials(
  targets: CredentialTarget[],
  channels: CredentialChannels,
  audience: CredentialAudience,
  onProgress?: (done: number, total: number) => void
): Promise<CredentialSendSummary> {
  const acc = emptySummary(channels);
  const sendId = newSendId();
  const total = targets.length;
  for (let i = 0; i < total; i += CREDENTIAL_CHUNK) {
    const part = targets.slice(i, i + CREDENTIAL_CHUNK);
    const r = await callMail('credentials-send', { sendId, targets: part, channels, audience });
    if (!r.ok) {
      acc.ok = false;
      acc.error = r.error || 'Gönderim tamamlanamadı.';
      break;
    }
    mergeCredentialSummary(acc, r);
    onProgress?.(Math.min(i + part.length, total), total);
  }
  return acc;
}

/** Sonuç satırları (pencerede gösterilir). tone: başarı / uyarı / hata */
export function describeCredentialResult(r: CredentialSendSummary, extra: { newPasswords?: number; resetFailed?: number } = {}) {
  const lines: Array<{ tone: 'success' | 'warning' | 'danger'; text: string }> = [];
  if (!r.ok && r.error) lines.push({ tone: 'danger', text: r.error });
  if (extra.newPasswords) lines.push({ tone: 'success', text: `${extra.newPasswords} öğrenciye yeni ilk şifre verildi.` });
  if (extra.resetFailed) lines.push({ tone: 'danger', text: `${extra.resetFailed} öğrenciye yeni şifre verilemedi.` });
  if (r.sms) {
    const s = r.sms;
    if (!s.available) lines.push({ tone: 'danger', text: s.errors[0] || 'SMS gönderilemiyor.' });
    else if (s.dry && !s.live) lines.push({ tone: 'warning', text: `SMS deneme modunda: ${s.dry} SMS hazırlandı ama GÖNDERİLMEDİ (Vercel'de SMS_MODE=live gerekir).` });
    else if (s.sent) lines.push({ tone: 'success', text: `${s.sent} SMS gönderildi.` });
    if (s.failed) lines.push({ tone: 'danger', text: `${s.failed} SMS gönderilemedi${s.errors[0] ? `: ${s.errors[0]}` : '.'}` });
    if (s.limited) lines.push({ tone: 'warning', text: `Günlük SMS sınırı nedeniyle ${s.limited} SMS gönderilmedi.` });
    if (s.skipped) lines.push({ tone: 'warning', text: `${s.skipped} SMS daha önce gönderildiği için atlandı.` });
    if (r.noPhone) lines.push({ tone: 'warning', text: `${r.noPhone} öğrencide seçilen alıcının cep telefonu kayıtlı değil.` });
  }
  if (r.mail) {
    const m = r.mail;
    if (m.notConfigured) lines.push({ tone: 'danger', text: 'E-posta gönderim hesabı bağlı değil (Yönetim › e-posta ayarı).' });
    else if (m.sent) lines.push({ tone: 'success', text: `${m.sent} e-posta gönderildi.` });
    if (m.failed) lines.push({ tone: 'danger', text: `${m.failed} e-posta gönderilemedi${m.errors[0] ? `: ${m.errors[0]}` : '.'}` });
    if (m.remaining && !m.notConfigured) lines.push({ tone: 'warning', text: `${m.remaining} e-posta süre yetmediği için gönderilemedi; tekrar deneyin.` });
    if (r.noEmail) lines.push({ tone: 'warning', text: `${r.noEmail} öğrencide seçilen alıcının e-postası kayıtlı değil.` });
  }
  if (r.noVeliMatch) lines.push({ tone: 'warning', text: `${r.noVeliMatch} öğrencide seçilen yakınlıkta veli yok.` });
  if (r.noPassword.length) lines.push({ tone: 'warning', text: `${r.noPassword.length} öğrencinin ilk şifresi kayıtlı değil (şifresini değiştirmiş ya da hesabı yok); gönderilmedi.` });
  if (r.noAccount.length) lines.push({ tone: 'warning', text: `${r.noAccount.length} öğrencinin öğrenci numarası yok; gönderilmedi.` });
  if (r.notAllowed) lines.push({ tone: 'warning', text: `${r.notAllowed} öğrenci için yetkiniz yok (başka kurum ya da pasif kayıt).` });
  if (!lines.length) lines.push({ tone: 'warning', text: 'Gönderilecek alıcı bulunamadı.' });
  return lines;
}
