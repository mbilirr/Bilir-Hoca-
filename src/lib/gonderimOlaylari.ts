// ============================================================================
// Aşama 377: gönderim kayıtlarındaki (mail_log, sms_log) olay adlarının Türkçesi ve süzgeç grubu.
// Yeni bir e-posta / SMS olayı eklenince buraya da yazılır; yazılmazsa kayıtta adı olduğu gibi görünür.
// ============================================================================
export type OlayGrubu = 'odev' | 'etut' | 'takvim' | 'ders' | 'deneme' | 'hesap' | 'diger';

const OLAY: Record<string, [string, OlayGrubu]> = {
  'homework-created': ['Yeni ödev', 'odev'],
  'homework-reminder': ['Ödev hatırlatma', 'odev'],
  'question-target': ['Soru hedefi', 'odev'],
  'plan-sent': ['Haftalık plan', 'odev'],
  'plan-report': ['Plan raporu', 'odev'],
  'etut-created': ['Yeni etüt', 'etut'],
  'etut-assigned': ['Etüt atandı', 'etut'],
  'etut-changed': ['Etüt değişti', 'etut'],
  'etut-cancelled': ['Etüt iptal', 'etut'],
  'etut-unassigned': ['Etüt başkasına verildi', 'etut'],
  'etut-attendance': ['Etüt yoklama bağlantısı', 'etut'],
  'etut-scheduled': ['Etüt hatırlatması', 'etut'],
  'etut-no-attendance': ['Yoklama alınmadı uyarısı', 'etut'],
  'akademik-takvim': ['Zümre etkinliği yaklaşıyor', 'takvim'],
  'akademik-durum-sor': ['Etkinlik yapıldı mı?', 'takvim'],
  'akademik-durum': ['Etkinlik durumu', 'takvim'],
  'ders-devamsizlik-ders': ['Derse gelmedi', 'ders'],
  'ders-devamsizlik-ozet': ['Günlük devamsızlık özeti', 'ders'],
  'ders-devamsizlik-sinir': ['Devamsızlık sınırı', 'ders'],
  'ders-devamsizlik-sinir-idare': ['Devamsızlık sınırı (idare)', 'ders'],
  'ders-yoklama-gecikme': ['Ders yoklaması alınmadı', 'ders'],
  'deneme-karne': ['Deneme karnesi', 'deneme'],
  'deneme-karne-link': ['Deneme karnesi bağlantısı', 'deneme'],
  'deneme-karne-veli': ['Deneme karnesi (veli)', 'deneme'],
  'parent-announce': ['Veli duyurusu', 'diger'],
  'veli-gorunum': ['Veli görünümü bağlantısı', 'diger'],
  'teacher-created': ['Öğretmen hesabı açıldı', 'hesap'],
  'teacher-account': ['Öğretmen giriş bilgisi', 'hesap'],
  'teacher-updated': ['Öğretmen bilgileri', 'hesap'],
  'teacher-access': ['Öğretmen yetkileri', 'hesap'],
  'teacher-role': ['Öğretmen rolü', 'hesap'],
  'teacher-status': ['Öğretmen hesap durumu', 'hesap'],
  'teacher-email-changed': ['E-posta değişikliği', 'hesap'],
  'sifre-sifirla': ['Şifre sıfırlama', 'hesap'],
  'giris-kilit': ['Giriş kilidi uyarısı', 'hesap'],
  'kurum-durum': ['Kurum durumu', 'hesap'],
  'sms-test': ['Sınama', 'diger'],
  test: ['Sınama', 'diger'],
};

export const olayAdi = (e: string): string => OLAY[e]?.[0] || e;
export const olayGrubu = (e: string): OlayGrubu => OLAY[e]?.[1] || 'diger';
