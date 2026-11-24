import { Teacher, TeacherDocument } from '../types';
import { playNotificationChime } from '../lib/browserNotifications';
import { purgeExpiredSecureCache, hasSecureKey } from '../lib/secureCache';
// Aşama 310: açılışta yerel kayıtları dayanıklı okuma ayrı dosyada; davranış aynı
import {
  loadStudentsWithResilience,
  loadClassesWithResilience,
  loadTeachersWithResilience,
  loadEtutsWithResilience,
  loadGradesWithResilience,
  loadHomeworkWithResilience,
  loadAttendanceWithResilience,
  loadQuestionLogsWithResilience,
} from './yerelYukleyici';
// Aşama 300: tarayıcı deposu (anahtarlar, okuma / yazma, yazma kilidi) ayrı dosyada; davranış aynı
import {
  STORAGE_KEYS,
  PERMANENT_KEYS,
  appStorage,
  purgePersistentPersonalData,
  cleanUpLegacyKeys,
  loadDataWithLegacyFallback,
  saveData,
  freezeAppStorage,
  depoDegisinceBildir,
  buyukListeleriGeriYukle,
} from './depo';
import { geriAlYalnizDokunulan } from './listeBirlestirme'; // Aşama 318, 343
export { geriAlYalnizDokunulan };import { purgeSavedPasswords } from './girisYardimci'; // Aşama 319, 332, 339
// Aşama 302: kurum bölümleri ve portal tanımları ayrı dosyada (ekranlar için buradan da dışa verilir; davranış aynı)
import { KURUM_MODULES, kurumModulListesi, PORTAL_ADI, type KurumTur, type PortalKod } from './kurumTanimlari';
export { KURUM_MODULES, kurumModulListesi, PORTAL_ADI };
export type { KurumTur, PortalKod };
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (eskisi gibi: veri anahtarları sekmede, ayarlar kalıcı)
const localStorage = appStorage;
export { PERMANENT_KEYS, freezeAppStorage };
import { SoruTakibiKatmani } from './veri/soruTakibi';
// Aşama 360: ortak türler ve yardımcılar veri/ortak.ts'te; ekranlar eskisi gibi buradan alır
// Aşama 379: boş 'başlangıç örnek verisi' dizileri (INITIAL_*) kaldırıldı; veri yalnız buluttan gelir
export { isAutoOrFakeEmail, cleanStudentEmail, ADMIN_EMAIL } from './veri/ortak';
export type { EtutTeacherOption, EtutTeacherRow, InitialCredentialInfo, RealtimeTableCfg, VeriKonusu, VeriDinleyici } from './veri/ortak';
import { cleanStudentEmail } from './veri/ortak';

// Aşama 360: sınıf katmanlara bölündü (src/services/veri/): temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → iletisim → odevEtut → soruTakibi → dataService
class DataService extends SoruTakibiKatmani {
  private static instance: DataService;
  private classSyncInterval: number | null = null;

  private constructor() {
    super(); // Aşama 358: katmanlı sınıf
    depoDegisinceBildir(() => {
      this.dataVersion++;
    });
    purgeSavedPasswords();
    // Aşama 103: 7 gün açılmamış kilitli önbellek silinir; sayfa yenilendiyse (sekmede anahtar varsa) kayıt açılır
    purgeExpiredSecureCache().catch(() => {});
    if (hasSecureKey()) this.secureRestore = this.resumeSecure();
    this.initData();
    // Aşama 355: sekme önbelleğine sığmayıp şifreli sekme deposuna yazılmış büyük listeler (sayfa yenilendiyse) açılır
    void buyukListeleriGeriYukle()
      .then((m) => this.buyukListeleriUygula(m))
      .catch(() => {});
    // Aşama 243: sayfa yenilenince seçili portal önbellekteki kurum bilgisine hemen uygulanır
    this.portalHesapla();
    this.myKurum = this.portalUygula(this.myKurumRaw);
    // Dosya açma/indirme hataları (görüntüleyici bileşenlerden) kullanıcıya gösterilir
    if (typeof window !== 'undefined') {
      window.addEventListener('app-file-error', (e: Event) => {
        const msg = (e as CustomEvent).detail;
        this.showFloatingErrorToast(`Hata: ${msg || 'Dosya açılamadı.'}`);
      });
    }
  }

  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  private initData() {
    // Eski sürümlerin tarayıcıda kalıcı bıraktığı kişisel veri önbelleklerini temizle (Aşama 7)
    purgePersistentPersonalData();

    this.deletedTeacherIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_TEACHERS, []));
    this.deletedStudentIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_STUDENTS, []));
    this.deletedClassIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_CLASSES, []));
    this.deletedHomeworkIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_HOMEWORK, []));
    this.deletedEtutIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_ETUTS, []));
    this.deletedQuestionLogIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_QUESTION_LOGS, []));

    // Load resiliently across all storage keys
    const resilientStudents = loadStudentsWithResilience();
    const resilientClasses = loadClassesWithResilience();
    const resilientTeachers = loadTeachersWithResilience();
    const resilientEtuts = loadEtutsWithResilience();
    const resilientGrades = loadGradesWithResilience();
    const resilientHomework = loadHomeworkWithResilience();
    const resilientAttendance = loadAttendanceWithResilience();
    const resilientQuestionLogs = loadQuestionLogsWithResilience();

    // Load strictly what is saved in storage or fetch from central DB; NEVER seed dummy demo students or classes
    this.teachers = resilientTeachers.length > 0 ? resilientTeachers : loadDataWithLegacyFallback<Teacher[]>(STORAGE_KEYS.TEACHERS, []);
      if (!Array.isArray(this.teachers)) this.teachers = [];
      this.classes = resilientClasses.length > 0 ? resilientClasses : loadDataWithLegacyFallback(STORAGE_KEYS.CLASSES, []);
      this.students = resilientStudents.length > 0 ? resilientStudents : loadDataWithLegacyFallback(STORAGE_KEYS.STUDENTS, []);
      this.homeworks = resilientHomework.length > 0 ? resilientHomework : loadDataWithLegacyFallback(STORAGE_KEYS.HOMEWORK, []);
      this.submissions = loadDataWithLegacyFallback(STORAGE_KEYS.SUBMISSIONS, []);
      this.etuts = resilientEtuts.length > 0 ? resilientEtuts : loadDataWithLegacyFallback(STORAGE_KEYS.ETUTS, []);
      this.attendance = resilientAttendance.length > 0 ? resilientAttendance : loadDataWithLegacyFallback(STORAGE_KEYS.ATTENDANCE, []);
      this.grades = resilientGrades.length > 0 ? resilientGrades : loadDataWithLegacyFallback(STORAGE_KEYS.GRADES, []);
      this.messages = loadDataWithLegacyFallback(STORAGE_KEYS.MESSAGES, []);
      // Eski sürümler belgeleri dosya içerikleriyle birlikte tarayıcıda saklıyordu; yalnız bilgiler tutulur
      const cachedDocs: TeacherDocument[] = loadDataWithLegacyFallback(STORAGE_KEYS.DOCUMENTS, []);
      this.documents = (Array.isArray(cachedDocs) ? cachedDocs : []).map(
        ({ fileData, htmlPreview, tableSheets, ...rest }) => rest as TeacherDocument
      );
      if (Array.isArray(cachedDocs) && cachedDocs.some((d) => d && (d.fileData || d.htmlPreview || d.tableSheets))) {
        try { saveData(STORAGE_KEYS.DOCUMENTS, this.documents); } catch {}
      }
      this.studentNotifications = loadDataWithLegacyFallback(STORAGE_KEYS.STUDENT_NOTIFICATIONS, []);
      this.sentEmails = loadDataWithLegacyFallback(STORAGE_KEYS.SENT_EMAILS, []);
      this.questionLogs = resilientQuestionLogs.length > 0 ? resilientQuestionLogs : loadDataWithLegacyFallback(STORAGE_KEYS.QUESTION_LOGS, []);
      this.weeklyQuestionTargets = loadDataWithLegacyFallback(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, []);

      // Soru sayısı 0 olan boş kayıtları temizle
      // Aşama 379: eski sürümün demo soru kayıtlarını ayıklayan kod kaldırıldı (canlı veritabanında böyle kayıt yok, 23 Kas)
      const prevLogsCount = this.questionLogs.length;
      this.questionLogs = this.questionLogs.filter((q) => !!q.totalQuestions && q.totalQuestions > 0);
      if (this.questionLogs.length !== prevLogsCount) {
        saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      }

      // Filter out any IDs recorded as deleted
      this.teachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      this.homeworks = this.homeworks.filter((h) => !this.deletedHomeworkIds.has(h.id));
      this.etuts = this.etuts.filter((e) => !this.deletedEtutIds.has(e.id));
      this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));

      // Apply any saved custom teacher profile overrides from dedicated local storage
      this.teachers = this.teachers.map((t) => {
        try {
          const specific = localStorage.getItem(`edu_sys_teacher_custom_profile_${t.id}`);
          if (specific) {
            const parsed = JSON.parse(specific);
            return { ...t, ...parsed };
          }
        } catch {
          // ignore
        }
        return t;
      });

      // Yönetici yetkisi yalnızca kayıttaki işaretten (is_admin / oturum rolü) ya da yönetici e-postasından gelir.
      // (Eskiden isme bakılıyordu; aynı isimde biri yönetici ekranlarını görebiliyordu.)
      // Aşama 180: eski sürümlerin yalnız bu cihazda tuttuğu yetki alanları (assignedClassIds,
      // canViewAllStudentsAndClasses) atılır. Görünürlüğün tek kaynağı veritabanındaki yetki tablolarıdır.
      this.teachers = this.teachers.map((t) => ({
        ...DataService.withoutLegacyAccess(t),
        isAdmin: this.isTeacherAdmin(t),
      }));

      saveData(STORAGE_KEYS.TEACHERS, this.teachers);

      // Aşama 379: eksik "oluşturan öğretmen" alanına uydurma 'teacher-1' yazan geçiş ve 'örnek veri yüklendi' işareti kaldırıldı

    // Migration: Önceden sistem tarafından rastgele atanmış sahte/otomatik mailleri temizle ve 54321 şifrelerini ilk girişte zorunlu güncellemeye al
    let studentsEmailCleaned = false;
    this.students = this.students.map((s) => {
      let updated = { ...s };
      let changed = false;
      const cleanedMail = cleanStudentEmail(s.email);
      if (s.email !== cleanedMail) {
        updated.email = cleanedMail;
        changed = true;
      }
      // Şifreler tarayıcıda tutulmaz (eski sürüm kalıntısı temizlenir)
      if (updated.password) {
        delete updated.password;
        changed = true;
      }
      if (changed) {
        studentsEmailCleaned = true;
        return updated;
      }
      return s;
    });
    if (studentsEmailCleaned) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);
    }

    // Clean up any old duplicate legacy version keys to keep storage lean and prevent quota limit errors
    cleanUpLegacyKeys();

    // Background sync with Supabase and Realtime setup
    this.setupAllRealtimeSync();
    this.revalidateAndSyncAll(true);

    // Cross-tab synchronization for teacher registrations and status changes
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEYS.TEACHERS) {
          const reloaded = loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, []);
          if (Array.isArray(reloaded) && reloaded.length > 0) {
            const oldPendingCount = this.teachers.filter((t) => t.status === 'pending').length;
            this.teachers = reloaded;
            const newPendingCount = this.teachers.filter((t) => t.status === 'pending').length;
            if (newPendingCount > oldPendingCount) {
              playNotificationChime();
            }
            this.notify();
          }
        }
      });

      // Telefon, tablet veya bilgisayarda ekran açıldığında ya da internet bağlantısı geldiğinde anında eşitle
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // Aşama 126: 30 sn'den uzun arka planda kalındıysa (telefon kilidi vb.) anlık bağlantı kopmuş
          // olabilir; eskisi gibi hemen tam eşitleme yapılır. Kısa geçişlerde anlık kanal yeterlidir.
          const longHidden = this.hiddenAt > 0 && Date.now() - this.hiddenAt >= DataService.LONG_HIDDEN_MS;
          this.hiddenAt = 0;
          this.donusteEsitle(longHidden);
        } else {
          this.hiddenAt = Date.now();
          this.flushSecureSave(); // Aşama 103
        }
      });
      window.addEventListener('online', () => {
        // İnternet geri geldi: kanallar onarılır ve veriler hemen yenilenir
        // (Aşama 343: revalidateAndSyncAll önce bekleyen kayıtları gönderir)
        this.ensureRealtime();
        this.revalidateAndSyncAll(false);
      });
      // Aşama 343: gönderilmeyi bekleyen kayıt varken sayfa kapatılır / yenilenirse tarayıcı uyarır
      window.addEventListener('beforeunload', (e) => {
        if (!this.gidenKutusu.length) return;
        e.preventDefault();
        e.returnValue = '';
      });
      window.addEventListener('offline', () => this.updateRealtimeHealth());
      window.addEventListener('focus', () => {
        this.donusteEsitle(false);
      });
    }
  }
  private static readonly LONG_HIDDEN_MS = 30 * 1000;
  private hiddenAt = 0;

  // Aşama 180: eski yerel yetki alanlarını kayıttan çıkarır (veritabanına hiç yazılmıyorlardı)
  private static withoutLegacyAccess(t: Teacher): Teacher {
    const legacy = t as Teacher & { assignedClassIds?: unknown; canViewAllStudentsAndClasses?: unknown };
    if (!('assignedClassIds' in legacy) && !('canViewAllStudentsAndClasses' in legacy)) return t;
    const copy: Record<string, unknown> = { ...legacy };
    delete copy.assignedClassIds;
    delete copy.canViewAllStudentsAndClasses;
    return copy as unknown as Teacher;
  }
}

export const dataService = DataService.getInstance();
