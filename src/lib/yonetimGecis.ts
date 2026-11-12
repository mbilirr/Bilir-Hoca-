import { setQuickFocus } from './quickFocus';

// ============================================================================
// Aşama 245: ana sayfadan Yönetim sayfasının doğru yerini açmak
//  - kurumlar | bildirim | yedek | kendi  : genel yöneticinin üst bölümleri
//  - genel | ogretmen | ogrenci | roller | bolumler | dersler : kurumun alt sekmeleri
//  - ders: Yönetim › Ders programı içindeki adım (saatler | ogretmenler | program | izinler)
// Ders adımı, DersYonetimi açılırken okuduğu kayıttan seçilir (DERS_YONETIM_KEY tek yerde tanımlı).
// ============================================================================
export const DERS_YONETIM_KEY = 'edu_ders_yonetim_v1';
export type DersAdim = 'saatler' | 'ogretmenler' | 'program' | 'izinler';
export type YonetimHedef = 'kurumlar' | 'bildirim' | 'yedek' | 'kendi' | 'genel' | 'ogretmen' | 'ogrenci' | 'roller' | 'bolumler' | 'dersler';

/** Yönetim sekmesine geçmeden ÖNCE çağrılır; sayfa açılınca hedef bölüm seçili gelir */
export function yonetimHedefle(hedef: YonetimHedef, ders?: DersAdim): void {
  if (ders) {
    try {
      window.sessionStorage.setItem(DERS_YONETIM_KEY, ders);
    } catch {
      /* depolama kapalı: ilk adım açılır */
    }
  }
  setTimeout(() => setQuickFocus('yonetim', hedef, ''), 0);
}
