import { sendCredentials, type CredentialSendSummary } from './credentialSend';

// ============================================================================
// Aşama 144: öğretmen giriş bilgisi (kullanıcı adı + ilk şifre) SMS / e-posta.
// Paket 142'nin 'credentials-send' yolu (type: 'teacher'); telefon sunucuda teacher_contacts'tan okunur.
// ============================================================================

export type TeacherSendItem = { id: string; password?: string };

export function sendTeacherCredentials(
  items: TeacherSendItem[],
  channels: { sms: boolean; email: boolean },
  onProgress?: (done: number, total: number) => void
): Promise<CredentialSendSummary> {
  return sendCredentials(
    items.map((i) => (i.password ? { type: 'teacher' as const, id: i.id, password: i.password } : { type: 'teacher' as const, id: i.id })),
    channels,
    { ogrenci: true, veli: false }, // öğretmende kullanılmaz; sunucu biçimi gereği gönderilir
    onProgress
  );
}

/** Sonuç satırları (öğretmen diliyle) */
export function describeTeacherCredentialResult(r: CredentialSendSummary, extra: { newPasswords?: number; resetFailed?: number } = {}) {
  const lines: Array<{ tone: 'success' | 'warning' | 'danger'; text: string }> = [];
  if (!r.ok && r.error) lines.push({ tone: 'danger', text: r.error });
  if (extra.newPasswords) lines.push({ tone: 'success', text: `${extra.newPasswords} öğretmene yeni ilk şifre verildi.` });
  if (extra.resetFailed) lines.push({ tone: 'danger', text: `${extra.resetFailed} öğretmene yeni şifre verilemedi.` });
  if (r.sms) {
    const s = r.sms;
    if (!s.available) lines.push({ tone: 'danger', text: s.errors[0] || 'SMS gönderilemiyor.' });
    else if (s.dry && !s.live) lines.push({ tone: 'warning', text: `SMS deneme modunda: ${s.dry} SMS hazırlandı ama GÖNDERİLMEDİ (Vercel'de SMS_MODE=live gerekir).` });
    else if (s.sent) lines.push({ tone: 'success', text: `${s.sent} SMS gönderildi.` });
    if (s.failed) lines.push({ tone: 'danger', text: `${s.failed} SMS gönderilemedi${s.errors[0] ? `: ${s.errors[0]}` : '.'}` });
    if (s.limited) lines.push({ tone: 'warning', text: `Günlük SMS sınırı nedeniyle ${s.limited} SMS gönderilmedi.` });
    if (s.skipped) lines.push({ tone: 'warning', text: `${s.skipped} SMS daha önce gönderildiği için atlandı.` });
    if (r.noPhone) lines.push({ tone: 'warning', text: `${r.noPhone} öğretmenin telefonu kayıtlı değil.` });
  }
  if (r.mail) {
    const m = r.mail;
    if (m.notConfigured) lines.push({ tone: 'danger', text: 'E-posta gönderim hesabı bağlı değil (Yönetim › e-posta ayarı).' });
    else if (m.sent) lines.push({ tone: 'success', text: `${m.sent} e-posta gönderildi.` });
    if (m.failed) lines.push({ tone: 'danger', text: `${m.failed} e-posta gönderilemedi${m.errors[0] ? `: ${m.errors[0]}` : '.'}` });
    if (m.remaining && !m.notConfigured) lines.push({ tone: 'warning', text: `${m.remaining} e-posta süre yetmediği için gönderilemedi; tekrar deneyin.` });
    if (r.noEmail) lines.push({ tone: 'warning', text: `${r.noEmail} öğretmenin e-postası kayıtlı değil.` });
  }
  if (r.noPassword.length) lines.push({ tone: 'warning', text: `${r.noPassword.length} öğretmen şifresini değiştirmiş (ilk şifre yok); gönderilmedi.` });
  if (r.noAccount.length) lines.push({ tone: 'warning', text: `${r.noAccount.length} öğretmenin kullanıcı adı yok; gönderilmedi.` });
  if (r.notAllowed) lines.push({ tone: 'warning', text: `${r.notAllowed} öğretmen için yetkiniz yok (başka kurum, yönetici ya da askıda).` });
  if (!lines.length) lines.push({ tone: 'warning', text: 'Gönderilecek alıcı bulunamadı.' });
  return lines;
}
