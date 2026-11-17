// ============================================================================
// Aşama 318: VERİ SERVİSİNİ AYIRMA, 8. PARÇA — HATA METİNLERİ VE TANIMA
// Supabase / Auth hatalarının Türkçe kullanıcı metnine çevrilmesi ve "tablo / sütun kurulu değil" hatalarının tanınması.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi); davranış aynı.
// ============================================================================
import { robotHatasiMi, ROBOT_RED } from '../lib/robotKoruma'; // Aşama 309
import type { ClassGroup } from '../types';

// Supabase Auth'taki en kısa şifre (DataService.MIN_PASSWORD_LENGTH bunu gösterir)
export const MIN_PASSWORD_LENGTH = 6;

// Supabase giriş hatalarını kullanıcıya anlaşılır mesaja çevirir.
// null: kullanıcı adı/şifre hatalı (çağıran genel mesaj gösterir)
export function loginErrorMessage(err: any, role: 'teacher' | 'student'): string | null {
  const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
  if (m.includes('banned')) {
    return role === 'student'
      ? 'Hesabınız şu anda kapalı: kayıt başvurunuz henüz onaylanmamış olabilir veya hesabınız askıya alınmıştır. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.'
      : 'Hesabınız askıya alınmıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyiniz.';
  }
  if (robotHatasiMi(err)) return ROBOT_RED; // Aşama 309
  if (m.includes('fetch') || m.includes('network')) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol ediniz.';
  }
  return null;
}

export function translatePasswordError(message?: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('at least')) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
  if (m.includes('different from the old')) return 'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.';
  if (m.includes('weak') || m.includes('pwned') || m.includes('leaked')) {
    return 'Bu şifre çok zayıf. Lütfen harf ve rakam içeren daha güçlü bir şifre seçiniz.';
  }
  if (m.includes('reauthentication') || m.includes('nonce')) {
    return 'Güvenlik nedeniyle yeniden giriş gerekiyor. Çıkış yapıp tekrar giriş yaptıktan sonra deneyiniz.';
  }
  if (m.includes('rate limit') || m.includes('security purposes')) {
    return 'Çok sık deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyiniz.';
  }
  return message || 'Şifre işlemi sırasında bir hata oluştu.';
}

// Veritabanı hatasını öğrenciye gösterilecek Türkçe bir mesaja çevirir (ham İngilizce hata gösterilmez)
export function questionLogDbError(error: any): any {
  if (!error) return null;
  const code = String(error?.code || '');
  if (code === '42501') return error; // yetki mesajı runCloudWrite içinde Türkçe veriliyor
  const raw = String(error?.message || '');
  let message = 'Sunucu kaydı kabul etmedi, lütfen tekrar dene';
  if (code === '22003') message = 'Girilen sayı çok büyük';
  else if (code === '23505') message = 'Bu tarih için zaten bir kayıt var, sayfayı yenileyip tekrar dene';
  else if (code === '23514' || code === '23502') message = 'Girilen değerler geçersiz';
  else if (code.startsWith('22')) message = 'Geçersiz tarih veya sayı';
  else if (/fetch|network|timeout|Failed to/i.test(raw)) message = 'Bağlantı sorunu';
  else if (/[çğıöşüÇĞİÖŞÜ]/.test(raw)) message = raw; // zaten Türkçe bir mesaj
  return { code, message };
}

export function teacherWriteErrorText(error: any): string {
  const m = `${error?.code || ''} ${error?.message || ''}`;
  if (/42501|row-level security|yetki/i.test(m)) return 'Bu işlem için yetkiniz yok; değişiklik kaydedilmedi.';
  if (/fetch|network|Failed/i.test(m)) return 'Sunucuya ulaşılamadı; değişiklik kaydedilmedi. İnternet bağlantınızı kontrol edin.';
  return `Değişiklik kaydedilmedi: ${error?.message || 'bilinmeyen hata'}`;
}

// Aşama 175: yalnız "student_contacts tablosu yok" hatası eski yola düşürür. Eskiden "does not exist" / "schema cache"
// geçen her hata (ör. bir kuralın içindeki işlev) oturum boyunca eski yola geçirip students için select('*')
// yaptırıyordu; kapalı sütunlar yüzünden o okuma da reddedilince öğrenci listesi boş kalıyordu.
export function isMissingTable(error: any): boolean {
  const code = String(error?.code || '');
  if (code === 'PGRST205' || code === '42P01') return true;
  const msg = String(error?.message || '');
  return /student_contacts/i.test(msg) && /Could not find the table|relation .* does not exist/i.test(msg);
}

/** Yalnız gerçek "etut_yoklama tablosu yok" hatası (175'teki ders: yetki ya da ağ hatası eski yola düşürmez) */
export function isEtutYoklamaMissing(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return /etut_yoklama/.test(msg) && (code === 'PGRST205' || code === '42P01' || /Could not find the table|does not exist/i.test(msg));
}

/** Yorum sütunu yok hatası (sql/178 kurulmamış) */
export function isEtutCommentColumnMissing(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return (/42703|PGRST204/.test(code) || /column|schema cache/i.test(msg)) && /teacher_feedback|user_notes|attendance_taken_by/.test(msg);
}

// Aşama 319: sütun / tablo kurulu değil hatalarının tanınması (dataService.ts'ten kelimesi kelimesine)
export function isMissingGenderColumn(error: any): boolean {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return /\bgender\b/i.test(msg) && /PGRST204|42703|column|schema cache|permission/i.test(msg);
}

/** Aşama 324: doğum tarihi sütunu yok (324 numaralı SQL henüz kurulmadı) */
export function isMissingBirthColumn(error: any): boolean {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return /\bbirth_date\b/i.test(msg) && /PGRST204|42703|column|schema cache/i.test(msg);
}

export function isMissingParentColumn(error: any): boolean {
  const msg = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return /\bparents\b/i.test(msg) && /PGRST204|42703|column|schema cache/i.test(msg);
}

export function isMissingDescriptionColumn(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (code === 'PGRST204' || code === '42703' || /column/i.test(msg)) && /description/i.test(msg);
}

// ---------------------------------------------------------------------------
// Aşama 45: Öğrenci bildirimlerinin bulut eşitlemesi (37 numaralı SQL; yoksa eskisi gibi yalnızca tarayıcı)
// ---------------------------------------------------------------------------
export function isMissingNotifTable(err: any): boolean {
  return /student_notifications|does not exist|schema cache|42P01|PGRST205/i.test(`${err?.code || ''} ${err?.message || ''}`);
}

export function duplicateClassMessage(existing: ClassGroup, year: string): string {
  return `"${existing.name}" sınıfı ${year || existing.academicYear} eğitim yılı için zaten kayıtlı. Aynı sınıf ikinci kez oluşturulamaz; mevcut sınıfı düzenleyebilir veya farklı bir şube seçebilirsiniz.`;
}
