import { supabase } from './supabase';

// ============================================================================
// Otomatik e-posta (Aşama 9): sunucudaki /api/mail fonksiyonuyla konuşur.
// Tarayıcı yalnızca "ne oldu" bilgisini (ör. ödev kimliği) gönderir; alıcıları sunucu bulur.
// ============================================================================

export type MailAction =
  | 'status'
  | 'connect-gmail'
  | 'disconnect-gmail'
  | 'test'
  | 'homework-created'
  | 'etut-created'
  | 'etut-changed'
  | 'etut-cancelled'
  | 'question-target'
  | 'teacher-account'
  | 'reminders';

export interface MailResult {
  ok: boolean;
  error?: string;
  code?: string;
  sent?: number;
  failed?: number;
  skipped?: number;
  noEmail?: number;
  noEmailNames?: string[];
  remaining?: number;
  errors?: string[];
  via?: 'okul' | 'ogretmen' | null;
  notConfigured?: boolean;
  authError?: boolean;
  total?: number;
  teacher?: { status: 'queued' | 'self' | 'no-email' | 'none'; name?: string };
  unchanged?: boolean;
  teachers?: Array<{ status: 'queued' | 'self' | 'no-email'; name?: string }>;
  [key: string]: any;
}

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function postOnce(action: MailAction, payload: Record<string, any>): Promise<MailResult> {
  const token = await accessToken();
  if (!token) return { ok: false, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.' };
  let res: Response;
  try {
    res = await fetch('/api/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    return { ok: false, error: 'E-posta servisine ulaşılamadı (internet bağlantısını kontrol edin).' };
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      error:
        res.status === 404
          ? 'E-posta servisi bu sürümde bulunamadı (sunucu dosyası api/mail.js yüklenmemiş).'
          : `E-posta servisi beklenmeyen yanıt verdi (${res.status}).`,
    };
  }
  if (!res.ok) return { ok: false, ...data, error: data.error || `E-posta servisi hata verdi (${res.status}).` };
  return data as MailResult;
}

// Çok sayıda alıcı varsa sunucu bir çağrıda bir kısmını gönderir ("remaining"); bitene kadar tekrar çağrılır.
export async function callMail(action: MailAction, payload: Record<string, any> = {}): Promise<MailResult> {
  let total: MailResult | null = null;
  for (let round = 0; round < 8; round++) {
    const r = await postOnce(action, payload);
    if (!total) total = { ...r };
    else {
      // sonraki turlarda önceki turda gönderilenler "zaten gönderildi" (skipped) ve "e-postası yok" tekrar sayılır;
      // bu yüzden yalnızca yeni gönderilen/başarısız olanlar eklenir
      total.sent = (total.sent || 0) + (r.sent || 0);
      total.failed = (total.failed || 0) + (r.failed || 0);
      total.errors = [...(total.errors || []), ...(r.errors || [])].slice(0, 5);
      total.remaining = r.remaining;
      total.ok = total.ok && r.ok;
    }
    if (!r.ok || !r.remaining || r.notConfigured || r.authError || (r.sent || 0) === 0) break;
  }
  return total as MailResult;
}

// Sonucu öğretmene gösterilecek kısa Türkçe cümleye çevirir
export function describeMailResult(r: MailResult | null | undefined): { tone: 'success' | 'warning' | 'danger'; text: string } {
  if (!r) return { tone: 'warning', text: 'E-posta durumu bilinmiyor.' };
  if (!r.ok) return { tone: 'danger', text: `E-posta gönderilemedi: ${r.error || 'bilinmeyen hata'}` };
  if (r.notConfigured)
    return {
      tone: 'warning',
      text: 'E-posta gönderilmedi: e-posta hesabı ayarlanmamış. Profil menüsünden "E-posta Ayarları"na bakın.',
    };
  if (r.authError) return { tone: 'danger', text: `E-posta gönderilemedi: ${(r.errors && r.errors[0]) || 'Gmail girişi reddedildi.'}` };
  if (r.unchanged) return { tone: 'warning', text: 'Değişiklik olmadığı için e-posta gönderilmedi.' };
  if (r.teacher && r.teacher.status === 'self' && !r.sent) return { tone: 'warning', text: 'Kendi hesabınız olduğu için e-posta gönderilmedi.' };
  if (r.expired) return { tone: 'warning', text: 'Hedefin bitiş tarihi geçtiği için e-posta gönderilmedi.' };
  const parts: string[] = [];
  if (r.sent) parts.push(`${r.sent} kişiye e-posta gönderildi`);
  if (r.skipped) parts.push(`${r.skipped} kişiye daha önce gönderilmişti`);
  if (r.noEmail) parts.push(`${r.noEmail} öğrencinin e-postası kayıtlı değil`);
  const noEmailTeachers = Array.from(
    new Set([r.teacher, ...(r.teachers || [])].filter((t) => t && t.status === 'no-email').map((t) => (t && t.name) || 'Etüt öğretmeni'))
  );
  const noEmailTeacher = noEmailTeachers.length > 0;
  if (noEmailTeacher) parts.push(`${noEmailTeachers.join(', ')} için e-posta adresi yok`);
  if (r.failed) parts.push(`${r.failed} e-posta gönderilemedi${r.errors && r.errors[0] ? ` (${r.errors[0]})` : ''}`);
  if (r.remaining) parts.push(`${r.remaining} e-posta sırada kaldı`);
  if (parts.length === 0) return { tone: 'warning', text: 'E-posta gönderilecek kimse bulunamadı.' };
  const tone = r.failed || r.remaining ? 'danger' : r.noEmail || noEmailTeacher ? 'warning' : 'success';
  return { tone, text: parts.join(' · ') + '.' };
}
