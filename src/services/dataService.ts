import {
  Student,
  Teacher,
  Homework,
  HomeworkSubmission,
  HomeworkResource,
  HomeworkCheckStatus,
  Etut,
  AttendanceRecord,
  AttendanceStatus,
  GradeRecord,
  StudentMessage,
  AnnouncementGroup,
  TeacherDocument,
  StudentNotification,
  SentEmailLog,
  StudentQuestionLog,
  QuestionLogPlanPart,
  QuestionLogSubjectEntry,
  WeeklyQuestionTarget,
  EtutStudentAttendance,
} from '../types';
import { supabase } from '../lib/supabase';
import { uploadFile, removeStoredFiles, storedPathsOf } from '../lib/fileStorage';
// Aşama 286: e-posta şablonları yalnız bildirimService üzerinden kullanılır (generateStudentWelcomeEmail hiç kullanılmıyordu)
import {
  odevAlicilari,
  etutAlicilari,
  odevBildirimleriHazirla,
  etutBildirimleriHazirla,
  type HazirBildirimler,
} from './bildirimService';
import { sendBrowserNotification, playNotificationChime } from '../lib/browserNotifications';
import { getStudentQuestionSubjects } from '../constants/schoolConstants';
import {
  subjectsForBranch,
  normalizeSubject,
  targetSubjectList,
  targetSubjectMatcher,
  sameTargetSubjects,
  sameSubjectName,
} from '../lib/subjects';
import { newId } from '../lib/ids';
import { isPendingPlanTarget, isPlanTopicRecord } from '../utils/targetDays';
import { notifyPush } from '../lib/push';
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
import {
  assertInlineResourcesFit,
  homeworkTargets,
  homeworkToRow,
  questionLogToRow,
  questionLogFromRow,
  isClassQuestionTarget,
  questionTargetToRow,
  gradeToRow,
  attendanceToRow,
  messageToRow,
  rowToNotif,
  notifToRow,
} from './satirDonusumleri'; // Aşama 317 / 318
import { geriAlYalnizDokunulan, yoklamaFarki } from './listeBirlestirme'; // Aşama 318, 343
import { questionLogDbError, isEtutYoklamaMissing, isEtutCommentColumnMissing } from './hataMetinleri'; // Aşama 318
export { geriAlYalnizDokunulan }; // Aşama 318: eski içe aktarma yolu çalışmaya devam etsin
import { isMissingNotifTable } from './hataMetinleri'; // Aşama 319 · 350
import { purgeSavedPasswords } from './girisYardimci'; // Aşama 319, 332, 339
import { deleteRowsVerified, hasCloudSession, writeEtutComments } from './bulutIslemleri'; // Aşama 319
import {
  redactEtut,
  defaultCheckNote,
  isTeacherAuthoredMessage,
  buildAnnouncementGroups,
  newQuestionTargetId,
  questionTargetOwnerKey,
} from './kayitKurallari'; // Aşama 319
// Aşama 302: kurum bölümleri ve portal tanımları ayrı dosyada (ekranlar için buradan da dışa verilir; davranış aynı)
import { KURUM_MODULES, kurumModulListesi, PORTAL_ADI, type KurumTur, type PortalKod } from './kurumTanimlari';
export { KURUM_MODULES, kurumModulListesi, PORTAL_ADI };
export type { KurumTur, PortalKod };
// Bu modülde "localStorage" adı depodaki yönlendiriciyi ifade eder (eskisi gibi: veri anahtarları sekmede, ayarlar kalıcı)
const localStorage = appStorage;
export { PERMANENT_KEYS, freezeAppStorage };
import { EsitlemeKatmani } from './veri/esitleme';
import { OkulKayitKatmani } from './veri/okulKayitlari';
// Aşama 359: ortak türler ve yardımcılar veri/ortak.ts'te; ekranlar eskisi gibi buradan alır
export { INITIAL_CLASSES, INITIAL_STUDENTS, INITIAL_HOMEWORK, INITIAL_SUBMISSIONS, INITIAL_ETUTS, INITIAL_ATTENDANCE, INITIAL_GRADES, INITIAL_MESSAGES, INITIAL_TEACHERS, isAutoOrFakeEmail, cleanStudentEmail, ADMIN_EMAIL } from './veri/ortak';
export type { EtutTeacherOption, EtutTeacherRow, InitialCredentialInfo, RealtimeTableCfg, VeriKonusu, VeriDinleyici } from './veri/ortak';
import { INITIAL_TEACHERS, cleanStudentEmail, type EtutTeacherOption, type EtutTeacherRow } from './veri/ortak';
import { ETUT_COMMENT_KEYS, type EtutPushOpts } from './veri/ortak';

// Aşama 359: sınıf katmanlara bölündü (src/services/veri/): temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → dataService
class DataService extends OkulKayitKatmani {
  private static instance: DataService;
  private messageReplierColumnMissing = false; // Aşama 45: 35 numaralı SQL yoksa
  private notifCloudDisabled = false; // Aşama 45: 37 numaralı SQL yoksa bildirimler yalnızca tarayıcıda
  private notifLastSync = 0;
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
    this.teachers = resilientTeachers.length > 0 ? resilientTeachers : loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
      if (!this.teachers || this.teachers.length === 0) {
        this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      }
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

      // Sistem tarafından otomatik yüklenen demo/seed soru kayıtlarını ve soru sayısı 0 olan boş kayıtları temizle
      const prevLogsCount = this.questionLogs.length;
      this.questionLogs = this.questionLogs.filter((q) => {
        const isAutoSeeded =
          q.id.startsWith(`qlog-${q.studentId}-`) ||
          q.id.startsWith('qlog-seed-') ||
          q.notes === 'Hedef soru sayısı başarıyla aşıldı.' ||
          q.notes === 'Günlük soru hedefi tamamlandı.';
        const hasZeroQuestions = !q.totalQuestions || q.totalQuestions <= 0;
        return !isAutoSeeded && !hasZeroQuestions;
      });
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

      // Migration: Ensure students have createdTeacherId if missing (default to teacher-1)
      let studentsModified = false;
      this.students = this.students.map((s) => {
        if (!s.createdTeacherId) {
          studentsModified = true;
          return { ...s, createdTeacherId: 'teacher-1' };
        }
        return s;
      });
      if (studentsModified) {
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }

      // Migration: Ensure classes have createdTeacherId if missing
      let classesModified = false;
      this.classes = this.classes.map((c) => {
        if (!c.createdTeacherId) {
          classesModified = true;
          return { ...c, createdTeacherId: 'teacher-1' };
        }
        return c;
      });
      if (classesModified) {
        saveData(STORAGE_KEYS.CLASSES, this.classes);
      }

      saveData(STORAGE_KEYS.IS_SEEDED, 'true');

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

    if (this.studentNotifications.length === 0 && this.homeworks.length > 0) {
      this.seedInitialNotifications();
    }

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

  public async pushEtutToSupabase(etut: Etut, opts: EtutPushOpts = {}): Promise<boolean> {
    try {
      // 1. RLS Güvencesi: Yalnızca Supabase Auth ile doğrulanmış aktif bir oturum varsa buluta yaz
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user;
      if (!authUser) {
        // Oturum açılmamışsa (anon) RLS yazma işlemine izin vermez; sessizce yerel state korunur
        return false;
      }

      // Öğrenciler etüt ekleme veya güncelleme yetkisine sahip değildir
      const userRole = authUser.app_metadata?.role;
      if (userRole === 'student') {
        return false;
      }

      // Aşama 179: yoklama ve yorumlar ayrı yerde (sql/178).
      // Aşama 196: eski yol (yoklama ve yorumları notes içine yazmak) kaldırıldı. Yoklama yalnız etut_yoklama
      // tablosuna, yorumlar yalnız kendi sütunlarına yazılır; tablo / sütun yoksa yazma başarısız sayılır.
      if (opts.commentsOnly) {
        // yalnız yorum değişti: yalnız o sütun yazılır, etüt tanımı yeniden gönderilmez
        return (await writeEtutComments(etut, opts.comments || [])) === 'ok';
      }
      if (opts.attendanceOnly) {
        // yalnız yoklama değişti: yalnız değişen öğrencilerin satırı yazılır
        return (await this.writeEtutYoklama(etut.id, opts.attendance || {})) === 'ok';
      }

      const attendanceStudentIds = Object.keys(etut.studentAttendance || {});
      let finalAssigned: string[] = [];
      if (Array.isArray(etut.assignedStudentIds)) {
        finalAssigned = Array.from(new Set([...etut.assignedStudentIds, ...attendanceStudentIds]));
      } else if (attendanceStudentIds.length > 0) {
        finalAssigned = attendanceStudentIds;
      }

      // Aşama 179: notes yalnız etüt tanımını taşır; gönderilmeyen yoklama / yorum anahtarlarını sunucu korur
      // Aşama 196: yoklama ve yorum anahtarları notes'a hiç yazılmaz (eski yol kaldırıldı)
      const meta = JSON.stringify({
        __etut_meta__: true,
        teacherId: etut.teacherId,
        teacherName: etut.teacherName,
        teacherIds: etut.teacherIds && etut.teacherIds.length > 1 ? etut.teacherIds : undefined,
        teacherNames: etut.teacherIds && etut.teacherIds.length > 1 ? etut.teacherNames : undefined,
        teacherBranch: etut.teacherBranch || '',
        lessonPeriod: etut.lessonPeriod || 'Ders',
        duration: Number(etut.duration) || 45,
        gradeLevel: etut.gradeLevel,
        schoolLevel: etut.schoolLevel,
        assignedStudentIds: etut.assignedStudentIds,
        createdById: etut.createdById || null,
        createdByName: etut.createdByName || null,
        recurrenceGroupId: etut.recurrenceGroupId || null,
        mailMode: etut.mailMode || undefined,
      });

      const cleanDate = etut.date ? etut.date.trim().split('T')[0] : '';

      const row: Record<string, any> = {
        id: etut.id,
        subject: etut.subject,
        topic: etut.topic,
        date: cleanDate,
        time: etut.time,
        duration: Number(etut.duration) || 45,
        location: etut.location || '',
        assigned_student_ids: finalAssigned,
        notes: meta,
      };
      const c = opts.comments || [];
      if (c.includes('teacherFeedback')) row.teacher_feedback = etut.teacherFeedback || '';
      if (c.includes('notes')) row.user_notes = etut.notes || '';
      if (c.includes('attendanceTakenBy')) row.attendance_taken_by = etut.attendanceTakenBy || null;
      // Aşama 9: etüde atanan öğretmen ayrı sütunda (13 numaralı SQL). SQL henüz çalıştırılmadıysa sütunsuz kaydet.
      if (DataService.etutTeacherColumnAvailable) row.etut_teacher_id = etut.teacherId || null;
      // Aşama 14: birden çok öğretmen (15 numaralı SQL). Sütun yoksa yalnızca bu alan çıkarılır.
      if (DataService.etutTeacherIdsColumnAvailable && DataService.etutTeacherColumnAvailable)
        row.etut_teacher_ids = etut.teacherIds && etut.teacherIds.length ? etut.teacherIds : etut.teacherId ? [etut.teacherId] : null;
      let { error } = await supabase.from('etuts').upsert(row);
      for (let attempt = 0; attempt < 2 && error; attempt++) {
        const msg = error.message || '';
        // Aşama 116: yalnız gerçekten "sütun yok" hatasında (kod / şema mesajı) sütunsuz yola geçilir;
        // yetki ya da tetik hatası etüt öğretmenini oturum boyunca silmez
        const missingCol = /42703|PGRST204/.test(String(error.code || '')) || /column|schema cache/i.test(msg);
        if (!missingCol) break;
        if (isEtutCommentColumnMissing(error)) {
          // Aşama 196: sql/178 kurulmamış; eski yola düşülmez, kayıt başarısız sayılır
          console.warn('[EtutSync] Etüt yorum sütunları bulunamadı (sql/178 gerekli):', msg);
          return false;
        }
        if (row.etut_teacher_ids !== undefined && /etut_teacher_ids/.test(msg)) {
          DataService.etutTeacherIdsColumnAvailable = false;
          delete row.etut_teacher_ids;
        } else if (row.etut_teacher_id !== undefined && /etut_teacher_id/.test(msg)) {
          DataService.etutTeacherColumnAvailable = false;
          delete row.etut_teacher_id;
          delete row.etut_teacher_ids;
        } else break;
        ({ error } = await supabase.from('etuts').upsert(row));
      }

      if (error) {
        if (error.code === '42501' || error.message?.includes('violates row-level security policy')) {
          console.warn('[EtutSync] Etüt senkronizasyonu RLS yetki sınırına takıldı (bu kayıt için yetki yok):', error.message);
        } else {
          console.warn('[EtutSync] Etüt buluta yüklenemedi:', error.message);
        }
        return false;
      }
      // Aşama 179: etüt satırı yazıldıktan sonra (yeni öğrenci etüde eklenmiş olur) yoklama yazılır
      if (opts.attendance && Object.keys(opts.attendance).length) {
        if ((await this.writeEtutYoklama(etut.id, opts.attendance)) !== 'ok') return false;
      }
      return true;
    } catch (err: any) {
      console.warn('[EtutSync] Etüt senkronizasyon istisnası:', err?.message || err);
      return false;
    }
  } // Aşama 317: satirDonusumleri.ts'te
  public static etutTeacherColumnAvailable = true;
  private static readonly ETUT_STATUSES = new Set<string>(['present', 'absent', 'excused', 'late']);

  /** Yalnız verilen öğrencilerin yoklaması yazılır; başka öğrencinin kaydına dokunulmaz */
  private async writeEtutYoklama(etutId: string, entries: Record<string, EtutStudentAttendance>): Promise<'ok' | 'fail'> {
    const now = new Date().toISOString();
    const valid = Object.entries(entries || {}).filter(([, a]) => a && DataService.ETUT_STATUSES.has(a.status));
    if (!valid.length) return 'ok';
    const rows = valid.map(([sid, a]) => ({
      etut_id: etutId,
      student_id: sid,
      student_name: a.studentName || null,
      status: a.status,
      note: a.note || '',
      topic: a.topic || '',
      marked_by: a.markedBy || null,
      marked_at: a.markedAt || null,
      changed_at: a.updatedAt || a.markedAt || now,
    }));
    const { error } = await supabase.from('etut_yoklama').upsert(rows, { onConflict: 'etut_id,student_id' });
    if (error) {
      // Aşama 196: tablo yoksa eski yola (notes) düşülmez
      if (isEtutYoklamaMissing(error)) EsitlemeKatmani.etutYoklamaTable = 'no';
      console.warn('[EtutYoklama] Yoklama buluta yazılamadı:', error.message);
      return 'fail';
    }
    EsitlemeKatmani.etutYoklamaTable = 'yes';
    const cur = { ...(this.etutYoklama.get(etutId) || {}) };
    for (const [sid, a] of valid) cur[sid] = { ...a, updatedAt: a.updatedAt || a.markedAt || now };
    this.etutYoklama.set(etutId, cur);
    return 'ok';
  }

  public static etutTeacherIdsColumnAvailable = true;

  // Aşama 180: eski yerel yetki alanlarını kayıttan çıkarır (veritabanına hiç yazılmıyorlardı)
  private static withoutLegacyAccess(t: Teacher): Teacher {
    const legacy = t as Teacher & { assignedClassIds?: unknown; canViewAllStudentsAndClasses?: unknown };
    if (!('assignedClassIds' in legacy) && !('canViewAllStudentsAndClasses' in legacy)) return t;
    const copy: Record<string, unknown> = { ...legacy };
    delete copy.assignedClassIds;
    delete copy.canViewAllStudentsAndClasses;
    return copy as unknown as Teacher;
  }

  // Etüt formu için öğretmen listesi (veritabanı yönetici olmayana yalnızca kendi branşını döndürür)
  public async getEtutTeacherOptions(): Promise<EtutTeacherOption[]> {
    const me = this.getCurrentTeacher();
    try {
      const { data, error } = await supabase.rpc('etut_teacher_options');
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
          id: String(r.option_id),
          name: String(r.name || ''),
          subjects: Array.isArray(r.subjects) ? r.subjects.map((x: any) => normalizeSubject(String(x))) : [],
          kind: r.kind === 'external' ? 'external' : 'system',
          hasEmail: !!r.has_email,
          rowId: r.row_id || null,
          isMe: !!r.is_me,
        }));
      }
    } catch {}
    // 13 numaralı SQL henüz çalıştırılmadıysa: yalnızca kendisi (ve yöneticiyse bildiği öğretmenler)
    const list: EtutTeacherOption[] = [];
    const seen = new Set<string>();
    const pushTeacher = (t: Teacher, isMe: boolean) => {
      if (!t?.id || seen.has(t.id) || t.status === 'pending' || t.status === 'rejected') return;
      seen.add(t.id);
      list.push({ id: t.id, name: t.name, subjects: subjectsForBranch(t.branch), kind: 'system', hasEmail: !!t.email, rowId: null, isMe });
    };
    if (me) pushTeacher(me, true);
    if (this.isCurrentUserAdmin()) this.teachers.forEach((t) => pushTeacher(t, false));
    return list;
  }

  // Yönetici: etüt öğretmenleri listesi (dış öğretmenler ve kayıtlı öğretmenlere ek dersler)
  public async listEtutTeacherRows(): Promise<EtutTeacherRow[]> {
    const { data, error } = await supabase.from('etut_teachers').select('*').order('name');
    if (error) throw new Error(error.message?.includes('etut_teachers') ? 'Etüt öğretmenleri tablosu bulunamadı (13 numaralı SQL çalıştırılmalı).' : error.message);
    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      subjects: Array.isArray(r.subjects) ? r.subjects : [],
      email: r.email || '',
      phone: r.phone || '',
      teacherId: r.teacher_id || null,
      active: r.active !== false,
    }));
  }

  public async saveEtutTeacherRow(row: Partial<EtutTeacherRow> & { name: string; subjects: string[] }): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const payload: Record<string, any> = {
      name: row.name.trim(),
      subjects: row.subjects,
      email: (row.email || '').trim() || null,
      phone: (row.phone || '').trim() || null,
      teacher_id: row.teacherId || null,
      active: row.active !== false,
    };
    const q = row.id
      ? supabase.from('etut_teachers').update(payload).eq('id', row.id)
      : supabase.from('etut_teachers').insert(payload);
    const { error } = await q;
    if (error) {
      if (error.code === '23505') throw new Error('Bu öğretmen için zaten bir kayıt var.');
      if (error.code === '23514') throw new Error('E-posta adresi geçersiz veya ad çok kısa.');
      throw new Error(error.message);
    }
  }

  public async deleteEtutTeacherRow(id: string): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const { error } = await supabase.from('etut_teachers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  // --- HOMEWORK ---
  // Ödev kimliği yeni ödev penceresi açılırken üretilir; böylece dosyalar kaydetmeden önce
  // doğru klasöre ("odev/<kimlik>") yüklenebilir.
  public newHomeworkId(): string {
    return `hw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  public async createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'> & { id?: string }): Promise<Homework> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const requestedId = typeof homeworkData.id === 'string' && /^hw-[\w-]{4,80}$/.test(homeworkData.id) ? homeworkData.id : null;
    const newHw: Homework = {
      ...homeworkData,
      id: requestedId && !this.homeworks.some((h) => h.id === requestedId) ? requestedId : this.newHomeworkId(),
      createdAt: nowIso,
      assignedDate: homeworkData.assignedDate || nowIso,
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      teacherName: homeworkData.teacherName || currentTeacher?.name,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
      isGlobalForNewStudents: false,
      submissions: undefined,
    };
    const { classIds, studentIds } = homeworkTargets(newHw);
    newHw.targetClassIds = classIds;
    newHw.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    newHw.classId = classIds[0] || newHw.classId;

    let row: ReturnType<typeof homeworkToRow>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = homeworkToRow(newHw);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    try {
      const { data: authData } = await supabase.auth.getSession();
      newHw.teacherAuthId = authData?.session?.user?.id;
    } catch {}

    const prevHomeworks = [...this.homeworks];
    this.homeworks = [newHw, ...this.homeworks];
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      () => supabase.from('homeworks').insert({ id: newHw.id, ...row }),
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev kaydedilemedi'
    );

    // Bildirimler yalnızca ödev gerçekten kaydedildikten sonra hazırlanır
    this.dispatchHomeworkNotificationsAndEmails(newHw);
    // Aşama 34: öğrencilerin telefonuna "Yeni ödev" bildirimi (alıcıları sunucu bulur)
    notifyPush('homework-created', { homeworkId: newHw.id });
    this.notify();
    return newHw;
  }

  public async updateHomework(id: string, updates: Partial<Homework>): Promise<void> {
    const existing = this.homeworks.find((h) => h.id === id);
    if (!existing) {
      const msg = 'Ödev bulunamadı (silinmiş olabilir). Sayfayı yenileyip tekrar deneyin.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(msg);
    }
    this.assertHomeworkEditable(existing);
    const merged: Homework = { ...existing, ...updates };
    const { classIds, studentIds } = homeworkTargets(merged);
    merged.targetClassIds = classIds;
    merged.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    merged.classId = classIds[0] || merged.classId;

    let row: ReturnType<typeof homeworkToRow>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = homeworkToRow(merged);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const prevHomeworks = [...this.homeworks];
    this.homeworks = this.homeworks.map((h) => (h.id === id ? merged : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase.from('homeworks').update(row).eq('id', id).select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Ödevi yalnızca oluşturan öğretmen veya yönetici değiştirebilir' } };
        }
        return { error: null };
      },
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev güncellenemedi'
    );

    // Ödevden çıkarılan depo dosyaları silinir (kayıt başarılı olduktan sonra)
    if (updates.resources !== undefined) {
      const kept = new Set(storedPathsOf(merged.resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
  }

  public async deleteHomework(id: string): Promise<void> {
    const target = this.homeworks.find((h) => h.id === id);
    if (target) this.assertHomeworkEditable(target);
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevDeletedHomeworkIds = new Set(this.deletedHomeworkIds);

    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Teslim dosyaları ödev kaydı silinmeden ÖNCE silinir (öğretmenin yetkisi ödev kaydı varken geçerlidir).
    // En güncel liste veritabanından okunur (başka cihazdan yapılmış güncellemeler dahil).
    const submissionFiles = new Set(
      (prevSubmissions as HomeworkSubmission[]).filter((sb) => sb.homeworkId === id).flatMap((sb) => storedPathsOf(sb.resources))
    );
    try {
      const { data: subRows } = await supabase.from('homework_submissions').select('resources').eq('homework_id', id);
      (subRows || []).forEach((r: any) => storedPathsOf(Array.isArray(r.resources) ? r.resources : []).forEach((p) => submissionFiles.add(p)));
    } catch {}
    if (submissionFiles.size > 0) await removeStoredFiles(Array.from(submissionFiles));

    try {
      const { error } = await deleteRowsVerified('homeworks', [id]);
      if (error) {
        throw error;
      }
      // Ödevin kendi dosyaları kayıt silindikten sonra temizlenir (en iyi çaba)
      const hwFiles = storedPathsOf(prevHomeworks.find((h: Homework) => h.id === id)?.resources);
      if (hwFiles.length > 0) removeStoredFiles(hwFiles);
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.homeworks = prevHomeworks;
      this.submissions = prevSubmissions;
      this.deletedHomeworkIds = prevDeletedHomeworkIds;
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Ödev silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Ödev bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteHomework] Ödev silinemedi: ${errMsg}`);
    }
  }

  // --- SUBMISSIONS ---
  // Öğrenci teslimi: varsa kendi satırını günceller, yoksa yeni satır açar.
  // Puan, geri bildirim ve öğretmen kontrol durumu öğrenci tarafından değiştirilemez (veritabanı kuralı).
  public async submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): Promise<HomeworkSubmission> {
    this.assertNotPreview(); // Aşama 107
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);
    try {
      assertInlineResourcesFit(resources);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const nowIso = new Date().toISOString();
    const isLate = homework ? Date.now() > new Date(homework.dueDate).getTime() : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';
    const studentName = student?.name || 'Öğrenci';

    const payload: Record<string, any> = {
      student_name: studentName,
      status,
      notes: notes || '',
      attachment_link: attachmentLink || null,
      submitted_at: nowIso,
    };
    if (resources !== undefined) payload.resources = resources;

    const existing = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const optimistic: HomeworkSubmission = {
      ...(existing || {}),
      id: existing?.id || newId('sub-local'),
      homeworkId,
      studentId,
      studentName,
      submittedAt: nowIso,
      status,
      notes: notes || '',
      attachmentLink: attachmentLink || undefined,
      resources: resources !== undefined ? resources : existing?.resources || [],
      score: existing?.score ?? null,
      feedback: existing?.feedback,
      checkStatus: existing?.checkStatus,
    };

    const prevSubmissions = [...this.submissions];
    this.submissions = [
      optimistic,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    let savedRow: any = null;
    const updateOwn = () =>
      supabase
        .from('homework_submissions')
        .update(payload)
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .select('*');

    await this.runCloudWrite(
      async () => {
        const upd = await updateOwn();
        if (upd.error) return { error: upd.error };
        if (upd.data && upd.data.length > 0) {
          savedRow = upd.data[0];
          return { error: null };
        }
        const ins = await supabase
          .from('homework_submissions')
          .insert({ homework_id: homeworkId, student_id: studentId, resources: [], ...payload })
          .select('*');
        if (ins.error?.code === '23505') {
          // Aynı anda başka cihazdan açılmış satır: güncelle
          const retry = await updateOwn();
          if (retry.error) return { error: retry.error };
          savedRow = retry.data?.[0] || null;
          return { error: null };
        }
        if (ins.error) return { error: ins.error };
        savedRow = ins.data?.[0] || null;
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev teslimi kaydedilemedi'
    );

    const saved = savedRow ? this.submissionFromRow(savedRow) : optimistic;
    this.submissions = [
      saved,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Öğrencinin yeni teslimde çıkardığı eski dosyalar depodan silinir
    if (resources !== undefined && existing) {
      const kept = new Set(storedPathsOf(resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
    return saved;
  }

  public async gradeSubmission(submissionId: string, score: number, feedback: string): Promise<void> {
    const prevSubmissions = [...this.submissions];
    this.submissions = this.submissions.map((s) => (s.id === submissionId ? { ...s, score, feedback } : s));
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase
          .from('homework_submissions')
          .update({ score, feedback })
          .eq('id', submissionId)
          .select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Teslim bulunamadı veya puanlama yetkiniz yok' } };
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Puan kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  // Öğretmenin "Yaptı / Yapmadı / Eksik / İzinli / Gelmedi" işaretleri — tek seferde, birden çok öğrenci için.
  // Öğrencinin kendi teslim notu ve dosyaları korunur; yalnızca kontrol durumu yazılır.
  public async saveHomeworkCheckStatuses(
    homeworkId: string,
    entries: { studentId: string; checkStatus: HomeworkCheckStatus }[]
  ): Promise<void> {
    const byStudent = new Map<string, HomeworkCheckStatus>();
    entries.forEach((e) => {
      if (e?.studentId && e.checkStatus) byStudent.set(e.studentId, e.checkStatus);
    });
    if (byStudent.size === 0) return;

    const prevSubmissions = [...this.submissions];
    const nowIso = new Date().toISOString();
    const updatedLocal = new Map<string, HomeworkSubmission>();
    this.submissions.forEach((s) => {
      if (s.homeworkId === homeworkId && byStudent.has(s.studentId)) {
        const checkStatus = byStudent.get(s.studentId)!;
        updatedLocal.set(s.studentId, {
          ...s,
          checkStatus,
          status: checkStatus === 'yapti' && s.status === 'not_submitted' ? 'on_time' : s.status,
        });
      }
    });
    byStudent.forEach((checkStatus, studentId) => {
      if (updatedLocal.has(studentId)) return;
      updatedLocal.set(studentId, {
        id: newId(`sub-local-${studentId}`),
        homeworkId,
        studentId,
        studentName: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
        submittedAt: nowIso,
        status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
        checkStatus,
        notes: defaultCheckNote(checkStatus),
      });
    });
    this.submissions = [
      ...Array.from(updatedLocal.values()),
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && byStudent.has(s.studentId))),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        // 1) Satırı olmayan öğrenciler için kayıt aç (var olan teslimlere dokunmaz)
        const baseRows = Array.from(byStudent.entries()).map(([studentId, checkStatus]) => ({
          homework_id: homeworkId,
          student_id: studentId,
          student_name: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
          status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
          notes: defaultCheckNote(checkStatus),
          check_status: checkStatus,
        }));
        const ins = await supabase
          .from('homework_submissions')
          .upsert(baseRows, { onConflict: 'homework_id,student_id', ignoreDuplicates: true });
        if (ins.error) return { error: ins.error };

        // 2) Kontrol durumlarını durum grubuna göre yaz
        const groups = new Map<HomeworkCheckStatus, string[]>();
        byStudent.forEach((checkStatus, studentId) => {
          groups.set(checkStatus, [...(groups.get(checkStatus) || []), studentId]);
        });
        for (const [checkStatus, ids] of groups) {
          const upd = await supabase
            .from('homework_submissions')
            .update({ check_status: checkStatus })
            .eq('homework_id', homeworkId)
            .in('student_id', ids)
            .select('student_id');
          if (upd.error) return { error: upd.error };
          if ((upd.data?.length || 0) < ids.length) {
            return { error: { code: '42501', message: 'Bazı öğrencilerin kontrol durumu kaydedilemedi' } };
          }
          if (checkStatus === 'yapti') {
            const st = await supabase
              .from('homework_submissions')
              .update({ status: 'on_time' })
              .eq('homework_id', homeworkId)
              .in('student_id', ids)
              .eq('status', 'not_submitted');
            if (st.error) return { error: st.error };
          }
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev kontrol durumu kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );

    // Aşama 343: kayıt cihazda bekliyorsa sunucudan okunmaz (okunan liste bekleyen işaretleri ekrandan silerdi)
    if (!this.gidenKutusu.length) await this.refreshSubmissionsForHomework(homeworkId);
  }

  public async updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus
  ): Promise<HomeworkSubmission | undefined> {
    await this.saveHomeworkCheckStatuses(homeworkId, [{ studentId, checkStatus }]);
    return this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
  }

  // --- ETUTS ---
  public async createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Promise<Etut> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowIso,
      createdById: etutData.createdById || currentTeacher?.id,
      createdByName: etutData.createdByName || currentTeacher?.name,
      lessonPeriod: etutData.lessonPeriod || 'Ders',
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
      teacherBranch: etutData.teacherBranch || currentTeacher?.branch || etutData.subject,
      duration: Number(etutData.duration) || 45,
    };
    // Rollback için önceki durumun yedeğini al
    const prevEtutsOnCreate = JSON.parse(JSON.stringify(this.etuts));

    this.etuts = [newEtut, ...this.etuts];
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Öğretmen ismini bu ders için kalıcı olarak kaydet
    if (newEtut.subject && newEtut.teacherName && newEtut.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(newEtut.subject, newEtut.teacherName);
      this.setLastTeacherForSubject(newEtut.subject, newEtut.teacherName);
    }

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);
    this.notify();

    // Supabase anında bulut senkronizasyonu ile sunucu yanıtını doğrula
    // Aşama 179: yeni etütte yorumlar ve (varsa) yoklama da yazılır
    const pushed = await this.pushEtutToSupabase(newEtut, {
      comments: ETUT_COMMENT_KEYS,
      attendance: newEtut.studentAttendance || undefined,
    });

    if (!pushed) {
      // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
      this.etuts = prevEtutsOnCreate;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt buluta kaydedilemedi (yetki veya bağlantı sorunu). Değişiklikler geri alındı.'
      );
      throw new Error('[createEtut] Etüt buluta kaydedilemedi.');
    }

    return newEtut;
  }

  public async updateEtut(id: string, updates: Partial<Etut>): Promise<void> {
    this.assertEtutEditable(id); // Aşama 40
    const prevEtutsOnUpdate = JSON.parse(JSON.stringify(this.etuts));
    const before = this.etuts.find((e) => e.id === id);

    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    const updated = this.etuts.find((e) => e.id === id);
    if (updated?.subject && updated?.teacherName && updated.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(updated.subject, updated.teacherName);
      this.setLastTeacherForSubject(updated.subject, updated.teacherName);
    }

    this.notify();

    // Push to Supabase with await + hata kontrolü
    if (updated) {
      // Aşama 179: yalnız gerçekten değişen yorum alanı ve değişen öğrencilerin yoklaması yazılır
      // (formdaki değişmemiş not başka cihazın yeni notunu ezmez)
      const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const comments = ETUT_COMMENT_KEYS.filter((k) => k in updates && !same((before as any)?.[k], (updated as any)[k]));
      let attendance: Record<string, EtutStudentAttendance> | undefined;
      if (updates.studentAttendance) {
        attendance = {};
        for (const [sid, a] of Object.entries(updated.studentAttendance || {}))
          if (!same(before?.studentAttendance?.[sid], a)) attendance[sid] = a;
      }
      const onlyComments = Object.keys(updates).every((k) => (ETUT_COMMENT_KEYS as string[]).includes(k));
      if (onlyComments && !comments.length) return; // değişen bir şey yok
      const pushed = await this.pushEtutToSupabase(updated, { comments, commentsOnly: onlyComments, attendance });
      if (!pushed) {
        // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
        this.etuts = prevEtutsOnUpdate;
        saveData(STORAGE_KEYS.ETUTS, this.etuts);
        this.notify();

        this.showFloatingErrorToast(
          'Hata: Etüt güncellemesi buluta kaydedilemedi. Değişiklikler geri alındı.'
        );
        throw new Error('[updateEtut] Etüt buluta güncellenemedi.');
      }
    }
  }

  public async updateEtutAttendance(
    etutId: string,
    attendanceData: Record<string, EtutStudentAttendance>
  ): Promise<void> {
    const etutIndex = this.etuts.findIndex((e) => e.id === etutId);
    if (etutIndex === -1) return;
    this.assertEtutEditable(etutId); // Aşama 40

    const prevEtutsOnAttendance = JSON.parse(JSON.stringify(this.etuts));
    const currentEtut = this.etuts[etutIndex];
    const updatedEtut: Etut = {
      ...currentEtut,
      studentAttendance: {
        ...(currentEtut.studentAttendance || {}),
        ...attendanceData,
      },
    };

    this.etuts = this.etuts.map((e, idx) => (idx === etutIndex ? updatedEtut : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Aşama 198: etüt yoklaması yalnız etut_yoklama tablosuna yazılır; eski "attendance" tablosuna "X (Etüt)" kopyası yazılmaz

    this.notify();

    // Supabase push with await + hata kontrolü
    // Aşama 179: yalnız bu işlemdeki öğrencilerin yoklaması yazılır (diğer öğrencilere ve yorumlara dokunulmaz).
    // Etüde yeni bir öğrenci eklendiyse önce etüt satırı yazılır (yoklama yalnız etüde atanmış öğrenciye yazılabilir).
    const assignedNow = Array.isArray(currentEtut.assignedStudentIds) ? currentEtut.assignedStudentIds : [];
    const needsAssign = Object.keys(attendanceData).some((sid) => !assignedNow.includes(sid));
    const pushed = await this.pushEtutToSupabase(updatedEtut, { attendance: attendanceData, attendanceOnly: !needsAssign });
    if (!pushed) {
      // ROLLBACK: Yoklama buluta kaydedilemediyse etüt state'ini eski haline döndür
      this.etuts = prevEtutsOnAttendance;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt yoklaması buluta kaydedilemedi. Değişiklikler geri alındı.'
      );
      throw new Error('[updateEtutAttendance] Yoklama buluta kaydedilemedi.');
    }
  }

  public async deleteEtut(id: string): Promise<void> {
    this.assertEtutEditable(id); // Aşama 40
    const prevEtutsOnDelete = JSON.parse(JSON.stringify(this.etuts));
    const prevDeletedEtutIds = new Set(this.deletedEtutIds);

    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();

    // Supabase delete with await + hata kontrolü
    try {
      const { error } = await deleteRowsVerified('etuts', [id]);
      if (error) throw error;
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.etuts = prevEtutsOnDelete;
      this.deletedEtutIds = prevDeletedEtutIds;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Etüt silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Etüt bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteEtut] Etüt buluttan silinemedi: ${errMsg}`);
    }
  }

  // --- ATTENDANCE ---
  public async recordAttendance(
    attData: Omit<AttendanceRecord, 'id'>,
    options?: { silent?: boolean }
  ): Promise<AttendanceRecord> {
    // Aşama 109: boş ders adı veritabanında 'Genel' yazıldığı için eşleşme aynı kurala göre yapılır (çift kayıt açılmaz)
    const subjKey = attData.subject || 'Genel';
    const existingIndex = this.attendance.findIndex(
      (a) => a.date === attData.date && a.classId === attData.classId && (a.subject || 'Genel') === subjKey
    );
    if (existingIndex >= 0) this.assertOwnedRecord(this.attendance[existingIndex], 'yoklama');
    // Aşama 343: yalnız bu cihazda DEĞİŞEN öğrenciler sunucuya gider; sunucu kendi kaydıyla birleştirir.
    // Böylece aynı yoklamayı başka cihaz (öğretmenin telefonu, müdür yrd.) az önce değiştirdiyse onun işaretleri silinmez.
    const oncekiKayit = existingIndex >= 0 ? this.attendance[existingIndex] : null;
    const { degisen, silinen } = yoklamaFarki(oncekiKayit?.records || [], attData.records || []);

    const record: AttendanceRecord = {
      ...attData,
      id: existingIndex >= 0 ? this.attendance[existingIndex].id : newId('att'),
      createdBy: existingIndex >= 0 ? this.attendance[existingIndex].createdBy : this.getCurrentTeacher()?.auth_user_id || undefined,
    };

    const prevAttendance = this.attendance;
    const next = existingIndex >= 0
      ? this.attendance.map((a, i) => (i === existingIndex ? record : a))
      : [record, ...this.attendance];
    this.attendance = next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    // Merkezi veritabanı tek doğruluk kaynağıdır: bulut onayı beklenir, hata varsa geri alınır
    // Aşama 343: bağlantı yoksa kayıt cihazda bekler (giden kutusu), bağlantı gelince gönderilir
    await this.runCloudWrite(
      async () => {
        const birlesik = await this.yoklamaBirlestir(record, degisen, silinen);
        if (birlesik !== 'yok') return birlesik;
        // SQL 343 kurulu değilse eski yol (bütün liste yazılır)
        const row = attendanceToRow(record);
        let res: { error: any } = await supabase.from('attendance').upsert(row);
        // Aşama 109: aynı sınıf / gün / ders için kayıt başka cihazda az önce açıldıysa (tekil kural) o kayıt güncellenir
        if (res.error?.code === '23505') {
          let q = supabase.from('attendance').select('id').eq('class_id', row.class_id).eq('date', row.date);
          q = row.subject === 'Genel' ? q.or('subject.is.null,subject.eq.Genel') : q.eq('subject', row.subject);
          const ex = await q.limit(1).maybeSingle();
          const exId = (ex.data as any)?.id;
          if (exId && exId !== row.id) {
            record.id = exId;
            res = await supabase.from('attendance').upsert({ ...row, id: exId });
          }
        }
        return res;
      },
      () => {
        this.attendance = prevAttendance;
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama buluta kaydedilemedi',
      { ...options, kuyruk: true }
    );

    return record;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Aşama 343: YOKLAMAYI SUNUCUDA BİRLEŞTİRME (sql/343 yoklama_birlestir)
  //  Eskiden yoklamanın bütün öğrenci listesi yazılıyordu: iki cihaz aynı yoklamayı değiştirince son yazan, öbürünün
  //  işaretlerini siliyordu. Şimdi yalnız değişen / çıkarılan öğrenciler gider; sunucu kilitleyerek birleştirir ve
  //  birleşmiş listeyi döndürür (ekran sunucudaki gerçek hâli gösterir). Tekrar gönderim güvenlidir (aynı sonuç).
  //  'yok' = SQL 343 kurulu değil (çağıran eski yolla yazar).
  // ---------------------------------------------------------------------------------------------------------------
  private async yoklamaBirlestir(
    kayit: AttendanceRecord,
    degisen: AttendanceRecord['records'],
    silinen: string[]
  ): Promise<{ error: any } | 'yok'> {
    if (this.yoklamaBirlestirYok) return 'yok';
    const { data, error } = await supabase.rpc('yoklama_birlestir', {
      p_id: kayit.id,
      p_class_id: kayit.classId,
      p_date: kayit.date,
      p_subject: kayit.subject || 'Genel',
      p_degisen: degisen,
      p_silinen: silinen,
    });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        this.yoklamaBirlestirYok = true;
        return 'yok';
      }
      return { error };
    }
    const d = data as { id?: unknown; records?: unknown } | null;
    if (d && typeof d.id === 'string' && Array.isArray(d.records)) {
      const sunucuId = d.id;
      const kayitlar = d.records as AttendanceRecord['records'];
      kayit.id = sunucuId;
      let degisti = false;
      this.attendance = this.attendance.map((a) => {
        if (a.id !== kayit.id && !(a.classId === kayit.classId && a.date === kayit.date && (a.subject || 'Genel') === (kayit.subject || 'Genel'))) return a;
        degisti = true;
        return { ...a, id: sunucuId, records: kayitlar };
      });
      if (degisti) {
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
        this.notify();
      }
    }
    return { error: null };
  }
  private yoklamaBirlestirYok = false;

  public async deleteAttendance(id: string): Promise<void> {
    this.assertOwnedRecord(this.attendance.find((a) => a.id === id), 'yoklama');
    const prevAttendance = this.attendance;
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    await this.runCloudWrite(
      () => deleteRowsVerified('attendance', [id]),
      () => {
        this.attendance = prevAttendance;
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama buluttan silinemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  public async deleteAttendanceForDate(date: string, classId: string, subject?: string): Promise<void> {
    const toDelete = this.attendance.filter(
      (a) => a.date === date && a.classId === classId && (!subject || a.subject === subject)
    );
    toDelete.forEach((a) => this.assertOwnedRecord(a, 'yoklama'));
    this.attendance = this.attendance.filter(
      (a) => !(a.date === date && a.classId === classId && (!subject || a.subject === subject))
    );
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    const prevAttendanceAll = [...this.attendance, ...toDelete];
    await this.runCloudWrite(
      () => deleteRowsVerified('attendance', toDelete.map((a) => a.id)),
      () => {
        this.attendance = prevAttendanceAll.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama kayıtları buluttan silinemedi'
    );
  }

  public async deleteAttendanceStudentRecord(attendanceId: string, studentId: string): Promise<void> {
    this.assertOwnedRecord(this.attendance.find((a) => a.id === attendanceId), 'yoklama');
    const prevAttendance = this.attendance;
    this.attendance = this.attendance.map((att) => {
      if (att.id === attendanceId) {
        return {
          ...att,
          records: att.records.filter((r) => r.studentId !== studentId),
        };
      }
      return att;
    });
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    const updated = this.attendance.find((a) => a.id === attendanceId);
    if (updated) {
      await this.runCloudWrite(
        async () => {
          // Aşama 343: yalnız bu öğrenci çıkarılır (başka cihazdaki işaretler korunur)
          const birlesik = await this.yoklamaBirlestir(updated, [], [studentId]);
          if (birlesik !== 'yok') return birlesik;
          return supabase.from('attendance').update({ records: updated.records || [] }).eq('id', attendanceId);
        },
        () => {
          this.attendance = prevAttendance;
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
        },
        'Yoklama güncellemesi buluta kaydedilemedi',
        { kuyruk: true }
      );
    }
  }

  // ===========================================================================
  // Aşama 83: NOT & YOKLAMA MAHREMİYETİ — rol yetkileri açıkken notu / yoklamayı yalnızca giren öğretmen ve
  // yönetici değiştirir (Rehberlik, Ölçme, zümre başkanı görür ama değiştiremez). Asıl denetim veritabanındadır.
  // ===========================================================================
  /** Bu not / yoklama kaydını değiştirebilir miyim */
  public canEditOwnedRecord(rec?: { createdBy?: string } | null): boolean {
    if (!rec || !rec.createdBy) return true;
    if (this.getAuthSession()?.role !== 'teacher' || !this.rolesActive() || this.isKurumAdmin()) return true;
    const me = this.getCurrentTeacher();
    return !!me?.auth_user_id && me.auth_user_id === rec.createdBy;
  }
  private assertOwnedRecord(rec: { createdBy?: string } | null | undefined, what: 'not' | 'yoklama'): void {
    if (this.canEditOwnedRecord(rec)) return;
    const msg =
      what === 'not'
        ? 'Bu notu başka bir öğretmen girmiş; yalnızca görüntüleyebilirsiniz. Değişikliği notu giren öğretmen yapabilir.'
        : 'Bu yoklamayı başka bir öğretmen almış; yalnızca görüntüleyebilirsiniz. Değişikliği yoklamayı alan öğretmen yapabilir.';
    this.showFloatingErrorToast(msg);
    throw new Error(msg);
  }

  // --- GRADES ---
  public async addGrade(gradeData: Omit<GradeRecord, 'id'>): Promise<GradeRecord> {
    const student = this.students.find((s) => s.id === gradeData.studentId);
    const newGrade: GradeRecord = {
      ...gradeData,
      id: newId('gr'),
      studentName: student?.name,
      createdBy: this.getCurrentTeacher()?.auth_user_id || undefined,
    };
    const prevGrades = this.grades;
    this.grades = [newGrade, ...this.grades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    await this.runCloudWrite(
      () => supabase.from('grades').insert(gradeToRow(newGrade)),
      () => {
        this.grades = prevGrades;
        saveData(STORAGE_KEYS.GRADES, this.grades);
      },
      'Not buluta kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );

    return newGrade;
  }

  public async updateGrade(id: string, updates: Partial<GradeRecord>): Promise<void> {
    this.assertOwnedRecord(this.grades.find((g) => g.id === id), 'not');
    const prevGrades = this.grades;
    this.grades = this.grades
      .map((g) => (g.id === id ? { ...g, ...updates } : g))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    const updated = this.grades.find((g) => g.id === id);
    if (updated) {
      const { id: _id, ...changes } = gradeToRow(updated);
      await this.runCloudWrite(
        () => supabase.from('grades').update(changes).eq('id', id),
        () => {
          this.grades = prevGrades;
          saveData(STORAGE_KEYS.GRADES, this.grades);
        },
        'Not güncellemesi buluta kaydedilemedi',
        { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
      );
    }
  }

  public async deleteGrade(id: string): Promise<void> {
    this.assertOwnedRecord(this.grades.find((g) => g.id === id), 'not');
    const prevGrades = this.grades;
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    await this.runCloudWrite(
      () => deleteRowsVerified('grades', [id]),
      () => {
        this.grades = prevGrades;
        saveData(STORAGE_KEYS.GRADES, this.grades);
      },
      'Not buluttan silinemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  // --- MESSAGES ---
  public async sendMessageToTeacher(
    studentId: string,
    subject: string,
    text: string,
    linkUrl?: string
  ): Promise<StudentMessage> {
    const student = this.students.find((s) => s.id === studentId);
    const newMsg: StudentMessage = {
      id: newId('msg'),
      studentId,
      studentName: student ? student.name : 'Öğrenci',
      studentClass: student ? student.className : 'Genel',
      studentAvatar: student?.avatar,
      subject,
      text,
      linkUrl,
      createdAt: new Date().toISOString(),
      read: false,
    };

    const prevMessages = this.messages;
    this.messages = [newMsg, ...this.messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // Yeni mesaj: "insert" kullanılır (upsert, öğrencide olmayan güncelleme iznini de gerektirir)
    await this.runCloudWrite(
      () => supabase.from('messages').insert(messageToRow(newMsg)),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj gönderilemedi'
    );
    // Aşama 34: öğretmenlerin telefonuna "Yeni öğrenci mesajı" bildirimi
    notifyPush('message-new', { messageId: newMsg.id });

    return newMsg;
  }

  /**
   * Aşama 45: öğrencinin "Kime" listesi — kendisine ders veren öğretmenler (yalnızca ad ve branş).
   * 35 numaralı SQL çalıştırılmadıysa boş döner (o zaman soru eskisi gibi bütün öğretmenlerine gider).
   */
  public async getMyTeachersAsStudent(): Promise<Array<{ id: string; name: string; branch: string }>> {
    const session = this.getAuthSession();
    if (session?.role !== 'student') return [];
    try {
      if (!(await hasCloudSession())) return [];
      const { data, error } = await supabase.rpc('student_my_teachers');
      if (error || !Array.isArray(data)) return [];
      return (data as any[])
        .filter((r) => r && r.id && r.name)
        .map((r) => ({ id: String(r.id), name: String(r.name), branch: String(r.branch || '') }));
    } catch {
      return [];
    }
  }

  /**
   * Aşama 113: mesaj bu öğretmene mi (alıcısı ben ya da alıcısız genel soru). Okundu işaretini yalnız alıcı koyar;
   * idarenin başka öğretmene gelen soruyu açması o öğretmenin "okunmadı" işaretini değiştirmez. Sayaçlar da bunu sayar.
   */
  public isMessageForMe(m: StudentMessage): boolean {
    const s = this.getAuthSession();
    if (s?.role !== 'teacher') return true;
    return !m.toTeacherId || m.toTeacherId === s.user.id;
  }

  public async markMessageAsRead(id: string): Promise<void> {
    const target = this.messages.find((m) => m.id === id);
    if (!target || target.read || !this.isMessageForMe(target)) return;
    const prevMessages = this.messages;
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, read: true } : m));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // "Okundu" işareti kritik değil: başarısız olursa sessizce geri alınır
    await this.runCloudWrite(
      () => supabase.from('messages').update({ read: true }).eq('id', id),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj okundu olarak işaretlenemedi',
      { silent: true, kuyruk: true } // Aşama 343
    );
  }

  public async replyToMessage(id: string, replyText: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const prevMessages = this.messages;
    // Aşama 45: cevaplayan öğretmen kaydedilir; cevaplandıktan sonra soru yalnızca onda görünür
    const session = this.getAuthSession();
    const me = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const prevMsg = this.messages.find((m) => m.id === id);
    // Daha önce başka biri cevapladıysa (yönetici düzeltiyorsa) cevaplayan değiştirilmez
    const repliedById = prevMsg?.repliedById || me?.id || undefined;
    const repliedByName = prevMsg?.repliedById ? prevMsg.repliedByName : me?.name || undefined;
    this.messages = this.messages.map((m) =>
      m.id === id
        ? {
            ...m,
            teacherReply: replyText,
            repliedAt: nowIso,
            read: true,
            ...(repliedById ? { repliedById, repliedByName } : {}),
          }
        : m
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const base = { teacher_reply: replyText, replied_at: nowIso, read: true };
        if (!repliedById || this.messageReplierColumnMissing) return supabase.from('messages').update(base).eq('id', id);
        const res = await supabase
          .from('messages')
          .update({ ...base, replied_by_id: repliedById, replied_by_name: repliedByName || null })
          .eq('id', id);
        // 35 numaralı SQL çalıştırılmadıysa sütun yoktur: cevap eskisi gibi kaydedilir
        if (res.error && /replied_by|42703|PGRST204/i.test(`${res.error.code || ''} ${res.error.message || ''}`)) {
          this.messageReplierColumnMissing = true;
          return supabase.from('messages').update(base).eq('id', id);
        }
        return res;
      },
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Cevap buluta kaydedilemedi'
    );
    // Aşama 34: öğrencinin telefonuna "Sorunuza cevap geldi" bildirimi
    notifyPush('message-reply', { messageId: id });
  }

  public async deleteMessage(id: string): Promise<void> {
    const prevMessages = this.messages;
    this.messages = this.messages.filter((m) => m.id !== id);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      () => deleteRowsVerified('messages', [id]),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj buluttan silinemedi'
    );
  }

  // --- HELPER QUERIES ---
  public getHomeworksForStudent(studentId: string): {
    homework: Homework;
    submission?: HomeworkSubmission;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
    isUrgent: boolean;
  }[] {
    const student = this.students.find((s) => s.id === studentId);
    const now = new Date().getTime();

    // Students can see homework if:
    // 1) assignedTo is 'all'
    // 2) assignedTo array includes studentId
    // 3) isGlobalForNewStudents is true (any student who registers later can see all prior homework)
    // 4) targetClassIds matches student class
    const eligibleHomeworks = this.homeworks.filter((hw) =>
      this.isHomeworkForStudent(hw, { id: studentId, classId: student?.classId })
    );

    return eligibleHomeworks.map((hw) => {
      const submission = this.submissions.find(
        (s) => s.homeworkId === hw.id && s.studentId === studentId
      );

      const dueTime = new Date(hw.dueDate).getTime();
      const hoursRemaining = (dueTime - now) / (1000 * 60 * 60);

      let status: 'on_time' | 'late' | 'not_submitted' | 'due_soon' = 'not_submitted';
      const isUrgent = !submission && hoursRemaining > 0 && hoursRemaining <= 48;

      if (submission) {
        status = submission.status;
      } else if (now > dueTime) {
        status = 'not_submitted'; // overdue
      } else if (hoursRemaining <= 48) {
        status = 'due_soon';
      }

      return {
        homework: hw,
        submission,
        status,
        isUrgent,
      };
    });
  }

  public getEtutsForStudent(studentId: string): Etut[] {
    const student = this.students.find((s) => s.id === studentId);
    const studentGrade = student?.className;

    return this.etuts.filter((etut) => {
      // 1. Genel herkese açık etütler
      if (etut.assignedStudentIds === 'all') return true;
      // 2. Bireysel seçilmiş öğrenci
      if (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.includes(studentId))
        return true;
      // 3. Yoklama listesinde kayıtlı öğrenci
      if (etut.studentAttendance && etut.studentAttendance[studentId])
        return true;
      // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
      if (!etut.assignedStudentIds || (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.length === 0)) {
        if (etut.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(etut.gradeLevel.split('.')[0].toLowerCase())) {
          return true;
        }
        return true; // Kademe genel etüdü
      }
      return false;
    });
  }

  public getGradesForStudent(studentId: string): GradeRecord[] {
    return this.grades.filter((g) => g.studentId === studentId);
  }

  public getAttendanceForStudent(studentId: string): {
    record: AttendanceRecord;
    status: AttendanceStatus;
    note?: string;
  }[] {
    const list: { record: AttendanceRecord; status: AttendanceStatus; note?: string }[] = [];
    this.attendance.forEach((att) => {
      const match = att.records.find((r) => r.studentId === studentId);
      if (match) {
        list.push({ record: att, status: match.status, note: match.note });
      }
    });
    return list;
  }

  public getMessagesForStudent(studentId: string): StudentMessage[] {
    return this.messages.filter((m) => m.studentId === studentId);
  }

  public getHomeworks(forTeacherId?: string): Homework[] {
    const k = this.myKurum;
    return this.memoView('Homeworks:' + (forTeacherId || ''), [this.homeworks, this.teachers, this.classes, this.students], this.viewKey(`${forTeacherId || ''}|${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}`), () => this.computeHomeworks(forTeacherId));
  }
  private computeHomeworks(forTeacherId?: string): Homework[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Aşama 40: genel yönetici tüm ödevleri görür; kurum yöneticisi kendi ödevlerini ve YALNIZCA kendi kurumuna
      // kayıtlı öğretmenlerin ödevlerini görür (genel yöneticinin öğretmenlerinin ödevleri görünmez)
      if (this.isTeacherAdmin(teacher)) {
        if (!forTeacherId && session?.role === 'teacher' && this.isKurumAdmin()) {
          return this.homeworks.filter((hw) => this.isMyHomework(hw, teacher) || this.ownersInMyKurum(this.homeworkOwnerIds(hw)));
        }
        return [...this.homeworks];
      }

      // Aşama 82: Rehberlik (tüm kurum) ve Zümre Başkanı (zümresi) — veritabanının açtığı ödevler (salt görüntüleme)
      if (!forTeacherId && session?.role === 'teacher' && this.roleSeesOthersWork()) {
        return [...this.homeworks];
      }

      // Normal öğretmen daha önce veya başka öğretmenlerin verdiği ödevleri GÖREMEZ. YALNIZCA KENDİ verdiği ödevleri görebilir.
      return this.homeworks.filter((hw) => {
        return (
          (!!teacher?.auth_user_id && hw.teacherAuthId === teacher.auth_user_id) ||
          hw.teacherId === teacherId ||
          (!!teacher?.name && hw.createdByName === teacher.name)
        );
      });
    }

    if (session?.role === 'student') {
      const sessionStudent = session.user as Student;
      const student = this.students.find((s) => s.id === sessionStudent.id) || sessionStudent;
      return this.homeworks.filter((hw) => this.isHomeworkForStudent(hw, student));
    }

    return [...this.homeworks];
  }

  public getEtuts(forTeacherId?: string): Etut[] {
    const k = this.myKurum;
    return this.memoView('Etuts:' + (forTeacherId || ''), [this.etuts, this.teachers, this.classes, this.students], this.viewKey(`${forTeacherId || ''}|${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}`), () => this.computeEtuts(forTeacherId));
  }
  /**
   * Aşama 111: EKRANLARDA gösterilecek etütler (tek kural, tüm ekranlar bunu kullanır).
   * Ortak takvim satırları (başka öğretmenin, ortak öğrencili etüdü) yalnız çakışma uyarısı içindir; hiçbir
   * listede / sayaçta görünmez. Gerisini veritabanı belirler: öğretmen kendi kaydettiği ve kendisine verilen
   * etütleri, Zümre Başkanı ek olarak zümresini, Rehberlik ve idare kurumun tamamını alır.
   */
  public getVisibleEtuts(): Etut[] {
    const all = this.getEtuts();
    return this.memoView('VisibleEtuts', [all, this.etuts], this.viewKey(), () => {
      // Yalnız sunucudan "ortak takvim" olarak gelen satırlar gizlenir. Ekranda ayrıntısı kapatılan (ör. dış etüt
      // öğretmeninin) ama veritabanının bu kişiye tam verdiği etüt listede kalır (bugünkü gibi ayrıntısız görünür).
      const shared = new Set<string>();
      for (const e of this.etuts) if (e.privacyRedacted) shared.add(e.id);
      if (!shared.size) return all;
      return all.filter((e) => !shared.has(e.id));
    });
  }
  /** Kurumun tüm etütlerini görür (Etütler › "Tüm okul", Takip görünümü): genel yönetici, idare, Rehberlik */
  public seesAllEtuts(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    return this.isHeadAdmin() || this.isCurrentUserAdmin() || this.isKurumAdmin() || this.hasRole('rehberlik');
  }
  /** Başka öğretmene etüt verebilir mi (veritabanı da denetler, sql/111): genel yönetici, idare, Rehberlik */
  public canAssignEtutToOthers(): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    if (this.isHeadAdmin() || this.isCurrentUserAdmin() || this.isKurumAdmin()) return true;
    // Aşama 143: kişiye özel "Başka öğretmen adına etüt" izni (etut_teacher_options ile aynı)
    return this.rolesActive() && this.permOr('etut_ata', () => this.hasRole('rehberlik'));
  }
  /** Ekranda düzenle / sil / yoklama düğmeleri açık mı (Rehberlik ve Zümre başkasınınkini yalnız görür) */
  public canEditEtutPublic(e: Etut): boolean {
    if (e.privacyRedacted) return false;
    return this.canEditEtut(e);
  }
  private computeEtuts(forTeacherId?: string): Etut[] {
    const session = this.getAuthSession();

    // Öğretmen ve Yönetici Görünümü:
    // Bilgisayar, tablet ve telefondan açılan tüm oturumlarda kurumdaki planlı etütlerin eksiksiz görünmesi sağlanır
    if (forTeacherId || session?.role === 'teacher') {
      // Aşama 40: başka öğretmenin etüdünde yalnızca gün / saat / öğretmen / sınıf bilgisi görünür
      if (session?.role === 'teacher' && !this.isHeadAdmin()) {
        // Aşama 82: Zümre Başkanı başkasının etüdünü görür ama öğrenci notlarını / anlatılan konuyu görmez (yetki tablosu)
        const stripNotes = this.hasRole('zumre_baskani') && !this.hasRole('rehberlik') && !this.isKurumAdmin();
        return this.etuts.map((e) => {
          if (e.privacyRedacted) return e;
          if (!this.canSeeEtutDetails(e)) return redactEtut(e);
          if (stripNotes && !this.isMyEtut(e) && e.studentAttendance) {
            const att: Record<string, any> = {};
            Object.entries(e.studentAttendance).forEach(([sid, rec]) => {
              att[sid] = rec ? { ...rec, note: '', topic: '' } : rec;
            });
            return { ...e, studentAttendance: att, teacherFeedback: '' };
          }
          return e;
        });
      }
      return [...this.etuts];
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      const student = this.students.find((s) => s.id === studentId);
      const studentGrade = student?.className;

      // Aşama 40: öğrenci başka öğrencilerin yoklama notlarını almaz (yalnızca kendi satırı)
      const ownOnly = (e: Etut): Etut =>
        e.studentAttendance
          ? { ...e, studentAttendance: e.studentAttendance[studentId] ? { [studentId]: e.studentAttendance[studentId] } : {} }
          : e;
      return this.etuts.map(ownOnly).filter((e) => {
        // 1. Genel herkese açık etütler
        if (e.assignedStudentIds === 'all') return true;
        // 2. Bireysel seçilmiş öğrenci
        if (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.includes(studentId))
          return true;
        // 3. Yoklama listesinde kayıtlı öğrenci
        if (e.studentAttendance && e.studentAttendance[studentId])
          return true;
        // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
        if (!e.assignedStudentIds || (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.length === 0)) {
          if (e.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(e.gradeLevel.split('.')[0].toLowerCase())) {
            return true;
          }
          return true;
        }
        return false;
      });
    }

    return [...this.etuts];
  }

  public getGrades(forTeacherId?: string): GradeRecord[] {
    return this.memoView('Grades:' + (forTeacherId || ''), [this.grades, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeGrades(forTeacherId));
  }
  private computeGrades(forTeacherId?: string): GradeRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (this.yoneticiKaydi(teacher)) return [...this.grades]; // Aşama 243: portal

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.grades.filter((g) => visibleStudents.has(g.studentId));
    }

    if (session?.role === 'student') {
      return this.grades.filter((g) => g.studentId === session.user.id);
    }

    return [...this.grades];
  }

  public getAttendance(forTeacherId?: string): AttendanceRecord[] {
    return this.memoView('Attendance:' + (forTeacherId || ''), [this.attendance, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeAttendance(forTeacherId));
  }
  private computeAttendance(forTeacherId?: string): AttendanceRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (this.yoneticiKaydi(teacher)) return [...this.attendance]; // Aşama 243: portal

      const visibleClasses = new Set(this.getClasses(teacherId).map((c) => c.id));
      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));

      return this.attendance
        .filter((a) => visibleClasses.has(a.classId))
        .map((a) => ({
          ...a,
          records: a.records.filter((r) => visibleStudents.has(r.studentId)),
        }));
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.attendance.filter((a) => a.records.some((r) => r.studentId === studentId));
    }

    return [...this.attendance];
  }

  public getMessages(forTeacherId?: string): StudentMessage[] {
    return this.memoView('Messages:' + (forTeacherId || ''), [this.messages, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeMessages(forTeacherId));
  }
  private computeMessages(forTeacherId?: string): StudentMessage[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      // Aşama 28: öğretmenin kendi gönderdiği duyuru/notlar gelen kutusuna karışmaz (Gönderilenler'de görünür)
      if (this.yoneticiKaydi(teacher)) return this.messages.filter((m) => !isTeacherAuthoredMessage(m)); // Aşama 243

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      // Aşama 113: idare (Müdür / Müdür Yrd. rolüyle de) kurumdaki öğretmenlere gelen soruları veritabanından alır
      // (message_teacher_can_see → priv_teacher_ok); ekran da aynısını gösterir. Rehberlik'e veritabanı vermez.
      const idare = teacherId === session?.user.id && this.isKurumAdmin();
      // Aşama 45: başka öğretmene yazılmış ya da başka öğretmenin cevapladığı soru görünmez (veritabanı da denetler)
      return this.messages.filter(
        (m) =>
          visibleStudents.has(m.studentId) &&
          !isTeacherAuthoredMessage(m) &&
          (idare || ((!m.toTeacherId || m.toTeacherId === teacherId) && (!m.repliedById || m.repliedById === teacherId)))
      );
    }

    if (session?.role === 'student') {
      return this.messages.filter((m) => m.studentId === session.user.id);
    }

    return [...this.messages];
  }

  // ---------------------------------------------------------------------------
  // DUYURU / NOT (Aşama 28)
  // Öğretmen, Mesajlar sayfasından seçtiği öğrencilere duyuru ya da kısa not gönderir.
  // Her alıcı için `messages` tablosunda bir satır (kind = 'announcement' | 'note') açılır;
  // öğrenci bunu ana sayfadaki Duyurular bölümünde görür.
  // ---------------------------------------------------------------------------
  public async sendAnnouncement(input: {
    kind: 'announcement' | 'note';
    title: string;
    text: string;
    studentIds: string[];
  }): Promise<AnnouncementGroup> {
    const session = this.getAuthSession();
    if (!session || session.role !== 'teacher') throw new Error('Duyuru yalnızca öğretmen hesabıyla gönderilebilir.');
    const sender = session.user as Teacher;

    const title = String(input.title || '').trim();
    const text = String(input.text || '').trim();
    if (!title) throw new Error('Başlık boş olamaz.');
    if (title.length > 80) throw new Error('Başlık en fazla 80 karakter olabilir.');
    if (!text) throw new Error('Mesaj metni boş olamaz.');
    if (text.length > 1500) throw new Error('Mesaj en fazla 1500 karakter olabilir.');

    // Yalnızca öğretmenin erişebildiği öğrencilere gönderilir
    const allowed = new Map(this.getStudents().map((s) => [s.id, s] as const));
    const targets = Array.from(new Set(input.studentIds || []))
      .map((id) => allowed.get(id))
      .filter((s): s is Student => !!s);
    if (targets.length === 0) throw new Error('En az bir öğrenci seçmelisin.');
    if (targets.length > 600) throw new Error('Tek seferde en fazla 600 öğrenciye gönderilebilir.');

    const groupId = newId('ann');
    const createdAt = new Date().toISOString();
    const rows: StudentMessage[] = targets.map((s) => ({
      id: newId('msg'),
      studentId: s.id,
      studentName: s.name,
      studentClass: s.className || 'Genel',
      // Profil resmi (büyük olabilir) her satıra yazılmaz
      subject: title,
      text,
      createdAt,
      read: false,
      kind: input.kind,
      senderId: sender.id,
      senderName: sender.name,
      groupId,
    }));

    const prevMessages = this.messages;
    this.messages = [...rows, ...this.messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const dbRows = rows.map((r) => messageToRow(r));
        for (let i = 0; i < dbRows.length; i += 100) {
          const res = await supabase.from('messages').insert(dbRows.slice(i, i + 100));
          if (res.error) {
            // Yarım kalan gönderim varsa temizlenir (hata olursa kimse yarım duyuru görmesin)
            try {
              await supabase.from('messages').delete().eq('group_id', groupId);
            } catch {
              /* temizlik başarısızsa sonraki eşitlemede görünür */
            }
            return res;
          }
        }
        return { error: null };
      },
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Duyuru gönderilemedi'
    );
    // Aşama 34: öğrencilerin telefonuna duyuru / özel mesaj bildirimi
    notifyPush('announcement', { groupId });

    return buildAnnouncementGroups(rows)[0];
  }

  // Öğretmenin gönderdiği duyuru/notlar (yönetici hepsini görür)
  public getSentAnnouncements(): AnnouncementGroup[] {
    const session = this.getAuthSession();
    if (!session || session.role !== 'teacher') return [];
    const me = session.user as Teacher;
    const isAdmin = this.yoneticiKaydi(this.teachers.find((t) => t.id === me.id) || (me as Teacher)); // Aşama 243: portal
    const visible = new Set(this.getStudents().map((s) => s.id));
    return buildAnnouncementGroups(
      this.messages.filter((m) => isTeacherAuthoredMessage(m) && visible.has(m.studentId) && (isAdmin || m.senderId === me.id))
    );
  }

  public async deleteAnnouncementGroup(groupId: string): Promise<void> {
    const ids = this.messages.filter((m) => isTeacherAuthoredMessage(m) && (m.groupId || m.id) === groupId).map((m) => m.id);
    if (ids.length === 0) return;
    const prevMessages = this.messages;
    const gone = new Set(ids);
    this.messages = this.messages.filter((m) => !gone.has(m.id));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      async () => {
        for (let i = 0; i < ids.length; i += 50) {
          const res = await deleteRowsVerified('messages', ids.slice(i, i + 50));
          if (res.error) return res;
        }
        return { error: null };
      },
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Duyuru buluttan silinemedi'
    );
  }

  // Öğrencinin ana sayfasında gösterilecek duyuru ve notlar (en yeni önce)
  public getAnnouncementsForStudent(studentId: string): StudentMessage[] {
    return this.messages
      .filter((m) => m.studentId === studentId && isTeacherAuthoredMessage(m))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    return this.memoView('Submissions:' + (forTeacherId || ''), [this.submissions, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeSubmissions(forTeacherId));
  }
  private computeSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (this.yoneticiKaydi(teacher)) return [...this.submissions]; // Aşama 243: portal

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.submissions.filter((sub) => visibleStudents.has(sub.studentId));
    }

    if (session?.role === 'student') {
      return this.submissions.filter((sub) => sub.studentId === session.user.id);
    }

    return [...this.submissions];
  }

  public async sendMessage(msgData: Omit<StudentMessage, 'id' | 'createdAt' | 'read'>): Promise<StudentMessage> {
    this.assertNotPreview(); // Aşama 107
    const newMsg: StudentMessage = {
      ...msgData,
      id: newId('msg'),
      createdAt: new Date().toISOString(),
      read: false,
    };
    const prevMessages = this.messages;
    this.messages = [newMsg, ...this.messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // Yeni mesaj: "insert" kullanılır (upsert, öğrencide olmayan güncelleme iznini de gerektirir)
    await this.runCloudWrite(
      () => supabase.from('messages').insert(messageToRow(newMsg)),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj gönderilemedi'
    );
    // Aşama 34: öğrencinin öğretmene yazdığı mesaj -> öğretmenlerin telefonuna bildirim
    if (newMsg.kind !== 'announcement' && newMsg.kind !== 'note') notifyPush('message-new', { messageId: newMsg.id });

    return newMsg;
  }

  public getStudentHomeworkStatus(homeworkId: string, studentId: string): {
    label: string;
    emoji: string;
    badgeClass: string;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
  } {
    const hw = this.homeworks.find((h) => h.id === homeworkId);
    const sub = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const now = new Date().getTime();

    if (sub) {
      if (sub.status === 'on_time') {
        return {
          label: 'Zamanında Teslim Edildi',
          emoji: '🌟',
          badgeClass: 'bg-success-soft text-success-fg border-success/30', // Aşama 288: Odak tokenları (eski sınıflar koyu zemine göreydi; açık temada yazı okunmuyordu)
          status: 'on_time',
        };
      } else {
        return {
          label: 'Gecikmeli Teslim',
          emoji: '⚠️',
          badgeClass: 'bg-warning-soft text-warning-fg border-warning/30',
          status: 'late',
        };
      }
    }

    if (hw) {
      const dueTime = new Date(hw.dueDate).getTime();
      const diffHours = (dueTime - now) / (1000 * 60 * 60);

      if (now > dueTime) {
        return {
          label: 'Teslim Edilmedi (Gecikti)',
          emoji: '🚨',
          badgeClass: 'bg-danger-soft text-danger-fg border-danger/30',
          status: 'not_submitted',
        };
      } else if (diffHours <= 48) {
        return {
          label: 'Yaklaşıyor (Son 48s)',
          emoji: '⏳',
          badgeClass: 'bg-warning-soft text-warning-fg border-warning/30',
          status: 'due_soon',
        };
      }
    }

    return {
      label: 'Bekliyor',
      emoji: '📝',
      badgeClass: 'bg-surface-2 text-fg-2 border-line-strong',
      status: 'not_submitted',
    };
  }

  // ==================== TEACHER DOCUMENTS ARCHIVE ====================
  public getTeacherDocuments(): TeacherDocument[] {
    return this.memoView('TeacherDocuments', [this.documents, this.teachers, this.classes, this.students], this.viewKey(), () => this.computeTeacherDocuments());
  }
  private computeTeacherDocuments(): TeacherDocument[] {
    return [...this.documents];
  }

  // Giriş yapan öğretmen bu belgeyi silebilir/düzenleyebilir mi? (yükleyen veya yönetici)
  public canManageDocument(doc: TeacherDocument): boolean {
    if (this.isCurrentUserAdmin()) return true;
    return !!doc.ownerAuthId && !!this.currentAuthUid && doc.ownerAuthId === this.currentAuthUid;
  }

  public async getTeacherDocumentDetail(doc: TeacherDocument): Promise<TeacherDocument> {
    if (doc.htmlPreview || doc.tableSheets || doc.fileData) return doc;
    const cached = this.documentDetailCache.get(doc.id);
    if (cached) return { ...doc, ...cached };
    const { data, error } = await supabase
      .from('teacher_documents')
      .select('html_preview,table_sheets,legacy_file_data')
      .eq('id', doc.id)
      .maybeSingle();
    if (error) throw new Error('Belge içeriği yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    const detail = {
      htmlPreview: data?.html_preview || undefined,
      tableSheets: Array.isArray(data?.table_sheets) ? data!.table_sheets : undefined,
      fileData: data?.legacy_file_data || undefined,
    };
    this.documentDetailCache.set(doc.id, detail);
    return { ...doc, ...detail };
  }

  // Yeni belge: dosya önce depoya yüklenir, sonra belge kaydı eklenir. Hata olursa yüklenen dosya silinir.
  public async addTeacherDocument(
    doc: Omit<TeacherDocument, 'id' | 'uploadedAt'>,
    file: File
  ): Promise<TeacherDocument> {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) {
      const msg = 'Oturumunuz bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(msg);
    }
    this.currentAuthUid = uid;
    const currentTeacher = this.getCurrentTeacher();

    const uploaded = await uploadFile(`belge/${uid}`, file); // hata mesajı Türkçe olarak fırlatılır
    const newDoc: TeacherDocument = {
      ...doc,
      fileData: undefined,
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentTeacher?.id || doc.uploadedBy || 'Öğretmen',
      authorName: doc.authorName || currentTeacher?.name || undefined,
      fileName: file.name,
      fileSize: uploaded.fileSize,
      storagePath: uploaded.path,
      ownerAuthId: uid,
    };
    const row = {
      id: newDoc.id,
      title: newDoc.title,
      description: newDoc.description || null,
      category: newDoc.category,
      file_format: newDoc.fileFormat,
      file_name: newDoc.fileName,
      file_size: newDoc.fileSize,
      storage_path: newDoc.storagePath,
      subject: newDoc.subject || 'Genel',
      school_type: newDoc.schoolType || null,
      grade_level: newDoc.gradeLevel || null,
      academic_year: newDoc.academicYear || null,
      tags: newDoc.tags || [],
      author_name: newDoc.authorName || null,
      uploaded_by: newDoc.uploadedBy || null,
      owner_auth_id: uid,
      html_preview: newDoc.htmlPreview || null,
      table_sheets: newDoc.tableSheets || null,
    };

    const prevDocs = [...this.documents];
    const { htmlPreview, tableSheets, ...lightDoc } = newDoc;
    this.documents = [lightDoc, ...this.documents];
    if (htmlPreview || tableSheets) this.documentDetailCache.set(newDoc.id, { htmlPreview, tableSheets });
    this.persistDocumentsLocal();
    this.notify();

    try {
      await this.runCloudWrite(
        () => supabase.from('teacher_documents').insert(row),
        () => {
          this.documents = prevDocs;
          this.persistDocumentsLocal();
        },
        'Belge arşive kaydedilemedi'
      );
    } catch (e) {
      removeStoredFiles([uploaded.path]);
      throw e;
    }
    return lightDoc;
  }

  public async deleteTeacherDocument(id: string): Promise<void> {
    const doc = this.documents.find((d) => d.id === id);
    const prevDocs = [...this.documents];
    this.documents = this.documents.filter((d) => d.id !== id);
    this.persistDocumentsLocal();
    this.notify();

    await this.runCloudWrite(
      () => deleteRowsVerified('teacher_documents', [id]),
      () => {
        this.documents = prevDocs;
        this.persistDocumentsLocal();
      },
      'Belge silinemedi (yalnızca yükleyen öğretmen veya yönetici silebilir)'
    );
    this.documentDetailCache.delete(id);
    if (doc?.storagePath) removeStoredFiles([doc.storagePath]);
  }

  // ==================== NOTIFICATIONS & EMAILS ====================
  public addStudentNotification(notification: Omit<StudentNotification, 'id' | 'createdAt' | 'read'> & { id?: string }): StudentNotification {
    const newNotif: StudentNotification = {
      id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      read: false,
      ...notification,
    };
    this.studentNotifications.unshift(newNotif);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    return newNotif;
  }

  public sendStudentPraise(
    studentId: string,
    data: {
      teacherName: string;
      message: string;
      date: string;
      questionCount: number;
      subjectDetails?: string;
    }
  ): StudentNotification {
    const title = `👏 Tebrikler! Öğretmeninizden Tebrik Mesajı`;
    const notif = this.addStudentNotification({
      studentId,
      type: 'praise',
      title,
      message: data.message,
      sourceId: data.date,
      sourceTitle: `${data.date} Tarihli Soru Çözümü (${data.questionCount} Soru)`,
      teacherName: data.teacherName,
      linkTab: 'questions',
    });
    // Aşama 45: tebrik artık öğrenciye GERÇEKTEN ulaşır (bulut + telefon bildirimi)
    void this.pushNotificationsToCloud([notif]).then((ok) => {
      if (!ok) return;
      this.studentNotifications = this.studentNotifications.map((n) => (n.id === notif.id ? { ...n, cloud: true } : n));
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
      notifyPush('praise', { notificationId: notif.id });
    });
    return notif;
  }

  private static readonly NOTIF_COLUMNS =
    'id,student_id,type,title,message,source_id,source_title,teacher_name,created_at,read_at,link_tab';

  /** Öğretmen: hazırlanan bildirimleri buluta yazar. Başarılıysa true (hata kullanıcıya gösterilmez). */
  private async pushNotificationsToCloud(list: StudentNotification[]): Promise<boolean> {
    if (this.notifCloudDisabled || !list.length) return false;
    try {
      if (!(await hasCloudSession())) return false;
      const rows = list.map((n) => notifToRow(n));
      let okAll = true;
      for (let i = 0; i < rows.length; i += 200) {
        const part = rows.slice(i, i + 200);
        const res = await supabase.from('student_notifications').insert(part);
        if (!res.error) continue;
        if (isMissingNotifTable(res.error)) {
          this.notifCloudDisabled = true;
          return false;
        }
        // Yetkisi olmayan öğrenci yüzünden bütün grup reddedildiyse küçük gruplar tek tek denenir
        okAll = false;
        if (part.length <= 60) {
          for (const row of part) await supabase.from('student_notifications').insert(row);
        }
      }
      return okAll;
    } catch {
      return false;
    }
  }

  /**
   * Buluttaki bildirimleri okur ve yerel listeyle birleştirir.
   *  * Öğrenci: kendi bildirimleri (okundu bilgisi dahil)
   *  * Öğretmen: kendi gönderdiği tebrikler (hangi güne tebrik gönderildiğini her cihazda görsün diye)
   */
  public async syncStudentNotifications(force = false): Promise<void> {
    if (this.notifCloudDisabled) return;
    const session = this.getAuthSession();
    if (!session || (session.role !== 'student' && session.role !== 'teacher')) return;
    if (!force && Date.now() - this.notifLastSync < 60000) return;
    this.notifLastSync = Date.now();
    try {
      if (!(await hasCloudSession())) return;
      // Aşama 181: yalnız ekranda kullanılan sütunlar (rowToNotif ile aynı)
      let q = supabase.from('student_notifications').select(DataService.NOTIF_COLUMNS).order('created_at', { ascending: false });
      if (session.role === 'student') q = q.eq('student_id', session.user.id).limit(150);
      else q = q.eq('type', 'praise').limit(500);
      const { data, error } = await q;
      if (error) {
        if (isMissingNotifTable(error)) this.notifCloudDisabled = true;
        return;
      }
      const remote = (Array.isArray(data) ? data : []).map((r) => rowToNotif(r));
      const remoteIds = new Set(remote.map((n) => n.id));
      const inScope = (n: StudentNotification) =>
        session.role === 'student' ? n.studentId === session.user.id : n.type === 'praise';
      const local = this.studentNotifications;
      const localById = new Map(local.map((n) => [n.id, n] as const));
      // Bulutta olmayan (başka cihazda silinmiş) bulut kayıtları çıkarılır; yerel e-posta ayrıntıları korunur
      const kept = local.filter((n) => !(n.cloud && inScope(n) && !remoteIds.has(n.id)) && !remoteIds.has(n.id));
      const merged = remote.map((r) => {
        const l = localById.get(r.id);
        return l ? { ...l, ...r, emailDetails: l.emailDetails, emailRecipient: l.emailRecipient } : r;
      });
      const next = [...merged, ...kept].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 400);
      const sig = (arr: StudentNotification[]) => arr.map((n) => `${n.id}:${n.read ? 1 : 0}`).join('|');
      if (sig(next) === sig(local)) return;
      this.studentNotifications = next;
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
      this.notify();
    } catch {
      /* ağ hatası: yerel liste kalır */
    }
  }

  private cloudNotifWrite(run: () => PromiseLike<{ error: any }>): void {
    if (this.notifCloudDisabled) return;
    void (async () => {
      try {
        if (!(await hasCloudSession())) return;
        const res = await run();
        if (res?.error && isMissingNotifTable(res.error)) this.notifCloudDisabled = true;
      } catch {
        /* sessizce geç */
      }
    })();
  }

  public getStudentNotifications(studentId?: string): StudentNotification[] {
    if (!studentId) return this.studentNotifications;
    return this.studentNotifications.filter((n) => n.studentId === studentId);
  }

  public getUnreadNotificationsCount(studentId: string): number {
    return this.studentNotifications.filter((n) => n.studentId === studentId && !n.read).length;
  }

  public markNotificationAsRead(id: string): void {
    if (this.isStudentPreview()) return; // Aşama 107: önizleme öğrencinin bildirimlerini okundu yapmaz
    const target = this.studentNotifications.find((n) => n.id === id);
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    // Aşama 45: okundu bilgisi bütün cihazlara (yalnızca öğrencinin kendi bildirimi)
    if (target?.cloud && !target.read && this.getAuthSession()?.role === 'student') {
      this.cloudNotifWrite(() => supabase.from('student_notifications').update({ read_at: new Date().toISOString() }).eq('id', id));
    }
  }

  public markAllNotificationsAsRead(studentId: string): void {
    if (this.isStudentPreview()) return; // Aşama 107
    const hadCloudUnread = this.studentNotifications.some((n) => n.studentId === studentId && n.cloud && !n.read);
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.studentId === studentId ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    if (hadCloudUnread && this.getAuthSession()?.role === 'student') {
      this.cloudNotifWrite(() =>
        supabase.from('student_notifications').update({ read_at: new Date().toISOString() }).eq('student_id', studentId).is('read_at', null)
      );
    }
  }

  public deleteNotification(id: string): void {
    const target = this.studentNotifications.find((n) => n.id === id);
    this.studentNotifications = this.studentNotifications.filter((n) => n.id !== id);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    if (target?.cloud && this.getAuthSession()?.role === 'student') {
      this.cloudNotifWrite(() => supabase.from('student_notifications').delete().eq('id', id));
    }
  }

  public clearStudentNotifications(studentId: string): void {
    const hadCloud = this.studentNotifications.some((n) => n.studentId === studentId && n.cloud);
    this.studentNotifications = this.studentNotifications.filter((n) => n.studentId !== studentId);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    if (hadCloud && this.getAuthSession()?.role === 'student') {
      this.cloudNotifWrite(() => supabase.from('student_notifications').delete().eq('student_id', studentId));
    }
  }

  public getSentEmails(studentId?: string): SentEmailLog[] {
    if (!studentId) return this.sentEmails;
    return this.sentEmails.filter((e) => e.studentId === studentId);
  }

  public deleteSentEmail(id: string): void {
    this.sentEmails = this.sentEmails.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
    this.notify();
  }

  // Aşama 286: bildirimlerin (ve içindeki e-posta önizlemesinin) HAZIRLANMASI bildirimService.ts'e taşındı;
  // burada yalnız sonuç uygulanır (listeye ekleme, buluta yazma, saklama, tarayıcı bildirimi). Davranış aynı.
  public dispatchHomeworkNotificationsAndEmails(hw: Homework): number {
    return this.hazirBildirimleriUygula(odevBildirimleriHazirla(hw, odevAlicilari(hw, this.students)));
  }

  public dispatchEtutNotificationsAndEmails(etut: Etut): number {
    return this.hazirBildirimleriUygula(etutBildirimleriHazirla(etut, etutAlicilari(etut, this.students)));
  }

  private hazirBildirimleriUygula(h: HazirBildirimler): number {
    // en yeni üstte: her bildirim sırayla en başa eklenir (eskiden döngüde unshift; sıra aynı)
    for (const n of h.bildirimler) this.studentNotifications.unshift(n);
    // Aşama 45: bildirim öğrencinin Bildirim Merkezi'ne de gider (yalnızca öğretmenin erişebildiği öğrenciler)
    this.pushVisibleStudentNotifs(h.bildirimler);

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

    // Tarayıcı bildirimi: yalnız oturumdaki öğrenci alıcılardan biriyse
    const session = this.getAuthSession();
    if (session?.role === 'student' && h.aliciIdleri.has(session.user.id)) {
      sendBrowserNotification(h.tarayici.baslik, h.tarayici.metin);
    }
    return h.bildirimler.length;
  }

  /** Öğretmen tarafı: erişebildiği öğrencilerin bildirimlerini buluta yazar ve yereldeki kayıtları "bulutta" işaretler */
  private pushVisibleStudentNotifs(list: StudentNotification[]): void {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher' || !list.length) return;
    const visible = new Set(this.getStudents().map((s) => s.id));
    const rows = list.filter((n) => visible.has(n.studentId));
    if (!rows.length) return;
    void this.pushNotificationsToCloud(rows).then((ok) => {
      if (!ok) return;
      const ids = new Set(rows.map((n) => n.id));
      this.studentNotifications = this.studentNotifications.map((n) => (ids.has(n.id) ? { ...n, cloud: true } : n));
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    });
  }

  private seedInitialNotifications(): void {
    // Otomatik/rastgele dummy bildirim ve e-posta yüklemesi devre dışı bırakıldı
    return;
  }

  // --- QUESTION LOGS (SORU SAYISI TAKİP) ---
  public getQuestionLogs(): StudentQuestionLog[] {
    return this.memoView('QuestionLogs', [this.questionLogs, this.teachers, this.classes, this.students], this.viewKey(), () => this.computeQuestionLogs());
  }
  private computeQuestionLogs(): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      return this.questionLogs.filter((q) => q.studentId === session.user.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.questionLogs];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      return this.questionLogs.filter((q) => visibleStudentIds.has(q.studentId));
    }
    return [...this.questionLogs];
  }

  public getQuestionLogsByStudent(studentId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student' && session.user.id !== studentId) {
      return [];
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        if (!visibleStudentIds.has(studentId)) {
          return [];
        }
      }
    }
    return this.questionLogs.filter((q) => q.studentId === studentId);
  }

  public getQuestionLogsByClass(classId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      const student = session.user as Student;
      if (student.classId !== classId) return [];
      return this.questionLogs.filter((q) => q.studentId === student.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleClassIds = new Set(this.getClasses(teacher?.id).map((c) => c.id));
        if (!visibleClassIds.has(classId)) {
          return [];
        }
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        return this.questionLogs.filter((q) => q.classId === classId && visibleStudentIds.has(q.studentId));
      }
    }
    return this.questionLogs.filter((q) => q.classId === classId);
  }

  public async saveQuestionLog(
    logData: Omit<StudentQuestionLog, 'id' | 'createdAt' | 'totalQuestions'> & {
      id?: string;
      totalQuestions?: number;
    }
  ): Promise<StudentQuestionLog> {
    this.assertNotPreview(); // Aşama 107
    // Girilen değerler doğrulanır; geçersiz kayıt hiç yazılmaz (Türkçe hata fırlatılır)
    const MAX_COUNT = 1000;
    const date = String(logData.date || '').trim();
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const dateObj = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : null;
    if (!dm || !dateObj || dateObj.getDate() !== +dm[3] || dateObj.getMonth() !== +dm[2] - 1) {
      throw new Error('Geçerli bir tarih seçmelisin.');
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date > todayStr) {
      throw new Error('İleri bir tarihe soru kaydı girilemez.');
    }
    const toCount = (v: unknown, label: string, subject: string): number => {
      if (v === undefined || v === null || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT || !/^\d+$/.test(String(v).trim())) {
        throw new Error(`${subject}: ${label} 0 ile ${MAX_COUNT} arasında bir tam sayı olmalı.`);
      }
      return n;
    };

    // Aynı ders birden fazla kez girildiyse sayılar toplanır
    const merged = new Map<
      string,
      { subject: string; questionCount: number; correctCount: number; wrongCount: number; topics: string[]; planParts: QuestionLogPlanPart[]; planGiven: boolean }
    >();
    for (const e of logData.entries || []) {
      const subject = String(e.subject || '').trim();
      if (!subject) throw new Error('Ders adı boş olamaz.');
      const qc = toCount(e.questionCount, 'soru sayısı', subject);
      const c = toCount(e.correctCount, 'doğru sayısı', subject);
      const w = toCount(e.wrongCount, 'yanlış sayısı', subject);
      if (c + w > qc) throw new Error(`${subject}: doğru + yanlış, soru sayısından fazla olamaz.`);
      if (qc === 0) continue;
      const cur = merged.get(subject) || { subject, questionCount: 0, correctCount: 0, wrongCount: 0, topics: [], planParts: [], planGiven: false };
      cur.questionCount += qc;
      cur.correctCount += c;
      cur.wrongCount += w;
      const topic = String(e.topic || '').trim();
      if (topic && !cur.topics.includes(topic)) cur.topics.push(topic);
      // Aşama 46: plan görevlerinden aktarılan pay (varsa) korunur
      if (Array.isArray(e.planItems)) {
        cur.planGiven = true;
        for (const p of e.planItems) {
          const pid = String(p?.id || '').trim();
          const n = Math.max(0, Math.round(Number(p?.count) || 0));
          if (!pid || n <= 0) continue;
          const ex = cur.planParts.find((x) => x.id === pid);
          if (ex) ex.count += n;
          else cur.planParts.push({ id: pid, count: n });
        }
      }
      merged.set(subject, cur);
    }
    // Aşama 46: Soru Kaydet formu plan payını bilmez; formdan gelen kayıtta o günün önceki kaydındaki
    // plan payları aynı derse taşınır. Pay, dersin soru sayısını hiçbir zaman aşmaz.
    const prevSameDay = logData.id
      ? this.questionLogs.find((q) => q.id === logData.id)
      : this.questionLogs.find((q) => q.studentId === logData.studentId && q.date === date);
    for (const m of merged.values()) {
      if (!m.planGiven && prevSameDay) {
        for (const pe of prevSameDay.entries || []) {
          if (!sameSubjectName(pe.subject, m.subject) || !Array.isArray(pe.planItems)) continue;
          for (const p of pe.planItems) {
            const n = Math.max(0, Math.round(Number(p?.count) || 0));
            if (p?.id && n > 0 && !m.planParts.some((x) => x.id === p.id)) m.planParts.push({ id: String(p.id), count: n });
          }
        }
      }
      let room = m.questionCount;
      m.planParts = m.planParts
        .map((p) => {
          const n = Math.min(p.count, room);
          room -= n;
          return { id: p.id, count: n };
        })
        .filter((p) => p.count > 0);
    }
    for (const m of merged.values()) {
      if (m.questionCount > MAX_COUNT) throw new Error(`${m.subject}: bir günde en fazla ${MAX_COUNT} soru girilebilir.`);
    }
    if (merged.size === 0) {
      throw new Error('En az bir ders için soru sayısı girmelisin.');
    }

    let calculatedTotal = 0;
    let calculatedCorrect = 0;
    let calculatedWrong = 0;
    let calculatedEmpty = 0;
    const cleanEntries = Array.from(merged.values()).map((m) => {
      const emp = Math.max(0, m.questionCount - m.correctCount - m.wrongCount);
      calculatedTotal += m.questionCount;
      calculatedCorrect += m.correctCount;
      calculatedWrong += m.wrongCount;
      calculatedEmpty += emp;
      return {
        subject: m.subject,
        questionCount: m.questionCount,
        correctCount: m.correctCount,
        wrongCount: m.wrongCount,
        emptyCount: emp,
        topic: m.topics.join(', ').slice(0, 200),
        ...(m.planParts.length ? { planItems: m.planParts } : {}),
      };
    });

    // Toplamlar her zaman derslerden hesaplanır (tutarsız toplam yazılmaz)
    const finalTotal = calculatedTotal;
    const finalCorrect = calculatedCorrect;
    const finalWrong = calculatedWrong;
    const finalEmpty = calculatedEmpty;
    const notes = String(logData.notes || '').trim().slice(0, 300);

    // Aynı öğrenci + aynı tarih için kayıt varsa o kayıt güncellenir (form o günün tüm derslerini içerir)
    const existingIdx = logData.id
      ? this.questionLogs.findIndex((q) => q.id === logData.id)
      : this.questionLogs.findIndex(
          (q) => q.studentId === logData.studentId && q.date === date
        );

    const prevLogs = [...this.questionLogs];
    let saved: StudentQuestionLog;
    if (existingIdx !== -1) {
      saved = {
        ...this.questionLogs[existingIdx],
        ...logData,
        date,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes,
      } as StudentQuestionLog;
      const target = saved;
      // Aynı gün için yerelde kalmış kopyalar (eski sürümler) çift sayılmasın
      this.questionLogs = this.questionLogs
        .map((q, i) => (i === existingIdx ? target : q))
        .filter((q) => q.id === target.id || !(q.studentId === target.studentId && q.date === target.date));
    } else {
      saved = {
        id: logData.id || `qlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId: logData.studentId,
        studentName: logData.studentName,
        classId: logData.classId,
        className: logData.className,
        date,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes,
        createdAt: new Date().toISOString(),
      };
      this.questionLogs = [saved, ...this.questionLogs];
    }
    this.persistQuestionLogsLocal();
    this.notify();

    await this.runCloudWrite(
      async () => {
        this.noteQuestionLogWrite(saved);
        let res = await supabase.from('question_logs').upsert(questionLogToRow(saved), { onConflict: 'id' });
        if (res.error?.code === '23505') {
          // Aynı gün için başka bir cihazdan açılmış kayıt var: o kayıt güncellenir
          const { data: other } = await supabase
            .from('question_logs')
            .select('id')
            .eq('student_id', saved.studentId)
            .eq('date', saved.date)
            .maybeSingle();
          if (other?.id) {
            const oldId = saved.id;
            saved = { ...saved, id: other.id };
            const merged = saved;
            this.questionLogs = this.questionLogs
              .filter((q) => q.id !== other.id)
              .map((q) => (q.id === oldId ? merged : q));
            this.noteQuestionLogWrite(saved);
            res = await supabase.from('question_logs').upsert(questionLogToRow(saved), { onConflict: 'id' });
          }
        }
        if (res.error) this.recentQuestionLogWrites.delete(saved.id);
        return { error: questionLogDbError(res.error) };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );

    this.persistQuestionLogsLocal();
    this.notify();
    return saved;
  }

  public async deleteQuestionLog(id: string): Promise<void> {
    this.assertNotPreview(); // Aşama 107
    const prevLogs = [...this.questionLogs];
    const wasTombstoned = this.deletedQuestionLogIds.has(id);
    this.deletedQuestionLogIds.add(id);
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    this.persistQuestionLogsLocal();

    // Eski sürüm yerel yedeklerde kalan kopyalar da temizlenir (geri dirilmesin)
    [
      'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4', 'edu_sys_question_logs_v3',
      'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1', 'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ].forEach((legacyKey) => {
      try {
        const val = localStorage.getItem(legacyKey);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            localStorage.setItem(legacyKey, JSON.stringify(parsed.filter((q: any) => q.id !== id)));
          }
        }
      } catch {}
    });
    this.notify();

    await this.runCloudWrite(
      async () => {
        const res = await deleteRowsVerified('question_logs', [id]);
        return { error: questionLogDbError(res.error) };
      },
      () => {
        this.questionLogs = prevLogs;
        if (!wasTombstoned) this.deletedQuestionLogIds.delete(id);
        saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı silinemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
  }

  // ---------------------------------------------------------------------------
  // Aşama 46: Günlük plan görevi "yaptım" işaretlenince görevin soru sayısı soru kaydına aktarılır.
  // Her görevin payı, o dersin kaydında görev kimliğiyle tutulur; böylece işaret kaldırılınca
  // yalnızca o pay geri alınır, öğrenci fazladan çözdüyse payı güncelleyebilir.
  // ---------------------------------------------------------------------------
  private planQuestionQueue: Promise<unknown> = Promise.resolve();

  /** Görevin soru kaydına aktarılmış payı (aktarılmamışsa null). Yalnızca öğrenci oturumunda. */
  public getPlanTaskQuestionShare(itemId: string): { date: string; subject: string; count: number } | null {
    const session = this.getAuthSession();
    if (session?.role !== 'student' || !itemId) return null;
    for (const log of this.questionLogs) {
      if (log.studentId !== session.user.id) continue;
      for (const e of log.entries || []) {
        const p = (e.planItems || []).find((x) => x.id === itemId);
        if (p) return { date: log.date, subject: e.subject, count: Number(p.count) || 0 };
      }
    }
    return null;
  }

  /**
   * Görevin soru kaydındaki payını `count` yapar (0 = payı kaldırır). Görev daha önce aktarıldıysa
   * aynı gün ve derste güncellenir; aktarılmadıysa görevin gününe (ileri tarihse bugüne) eklenir.
   * Çağrılar sırayla çalışır (art arda işaretlemede kayıtlar birbirini ezmez).
   */
  public setPlanTaskQuestions(opts: { itemId: string; subject: string; date: string; count: number }): Promise<{ date: string; subject: string; count: number; subjectTotal: number }> {
    if (this.isStudentPreview()) return Promise.reject(new Error('Önizleme: öğrenci adına işlem yapılamaz.')); // Aşama 107
    const run = this.planQuestionQueue.then(
      () => this.setPlanTaskQuestionsNow(opts),
      () => this.setPlanTaskQuestionsNow(opts)
    );
    this.planQuestionQueue = run.catch(() => undefined);
    return run;
  }

  private async setPlanTaskQuestionsNow(opts: { itemId: string; subject: string; date: string; count: number }): Promise<{ date: string; subject: string; count: number; subjectTotal: number }> {
    const session = this.getAuthSession();
    if (session?.role !== 'student') throw new Error('Soru kaydı yalnızca öğrenci hesabıyla güncellenebilir.');
    const student = session.user as Student;
    const itemId = String(opts.itemId || '').trim();
    if (!itemId) throw new Error('Görev bulunamadı.');
    const want = Number(opts.count);
    if (!Number.isInteger(want) || want < 0 || want > 1000) throw new Error('Soru sayısı 0 ile 1000 arasında bir tam sayı olmalı.');

    const pad = (n: number) => String(n).padStart(2, '0');
    const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const todayStr = dstr(now);

    // Buluttaki güncel kayıtlar okunur: başka cihazdan girilmiş sayılar eski yerel veriyle ezilmesin
    if (await hasCloudSession()) {
      const from = dstr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21));
      const { data, error } = await supabase.from('question_logs').select('*').eq('student_id', student.id).gte('date', from);
      if (error || !Array.isArray(data)) throw new Error('Soru kayıtların okunamadı. Bağlantını kontrol edip tekrar dene.');
      this.mergeQuestionLogs(
        data.map((r: any) => questionLogFromRow(r)),
        null
      );
    }

    const mine = this.questionLogs.filter((q) => q.studentId === student.id);
    const hasShare = (q: StudentQuestionLog) => (q.entries || []).some((e) => (e.planItems || []).some((p) => p.id === itemId));
    let log = mine.find(hasShare);
    let targetDate: string;
    if (log) {
      targetDate = log.date;
    } else {
      if (want === 0) return { date: '', subject: '', count: 0, subjectTotal: 0 }; // geri alınacak pay yok
      const d = String(opts.date || '').trim();
      targetDate = /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayStr ? d : todayStr;
      log = mine.find((q) => q.date === targetDate);
    }

    const entries: QuestionLogSubjectEntry[] = (log?.entries || []).map((e) => ({
      ...e,
      planItems: (e.planItems || []).map((p) => ({ id: p.id, count: Number(p.count) || 0 })),
    }));
    let idx = entries.findIndex((e) => (e.planItems || []).some((p) => p.id === itemId));
    if (idx >= 0) {
      const e = entries[idx];
      const old = (e.planItems || []).find((p) => p.id === itemId)?.count || 0;
      e.questionCount = Math.max(0, (Number(e.questionCount) || 0) - old);
      e.planItems = (e.planItems || []).filter((p) => p.id !== itemId);
    } else {
      idx = entries.findIndex((e) => sameSubjectName(e.subject, opts.subject));
      if (idx < 0) {
        const list = getStudentQuestionSubjects(student, this.classes);
        const name = list.find((s) => sameSubjectName(s, opts.subject)) || normalizeSubject(opts.subject).trim();
        if (!name) throw new Error('Görevin dersi bulunamadı.');
        entries.push({ subject: name, questionCount: 0, correctCount: 0, wrongCount: 0, planItems: [] });
        idx = entries.length - 1;
      }
    }
    const e = entries[idx];
    e.questionCount = (Number(e.questionCount) || 0) + want;
    if (want > 0) e.planItems = [...(e.planItems || []), { id: itemId, count: want }];
    if (e.questionCount > 1000) throw new Error(`${e.subject}: bir günde en fazla 1000 soru girilebilir.`);
    // Doğru + yanlış, soru sayısını aşamaz (soru azaldıysa önce yanlış, sonra doğru kırpılır)
    let c = Number(e.correctCount) || 0;
    let w = Number(e.wrongCount) || 0;
    if (c + w > e.questionCount) {
      w = Math.min(w, e.questionCount);
      c = Math.min(c, e.questionCount - w);
    }
    e.correctCount = c;
    e.wrongCount = w;
    delete e.emptyCount;

    const remaining = entries.filter((x) => (Number(x.questionCount) || 0) > 0);
    const result = { date: targetDate, subject: e.subject, count: want, subjectTotal: e.questionCount };
    if (remaining.length === 0) {
      // O günün kaydında başka soru kalmadı: kayıt kaldırılır
      if (log) await this.deleteQuestionLog(log.id);
      return result;
    }
    const cls = this.classes.find((x) => x.id === student.classId);
    await this.saveQuestionLog({
      id: log?.id,
      studentId: student.id,
      studentName: log?.studentName || student.name,
      classId: log?.classId || student.classId || '',
      className: log?.className || student.className || cls?.name || 'Belirtilmedi',
      date: targetDate,
      entries: remaining,
      notes: log?.notes || '',
    });
    return result;
  }

  public clearAutoSeededQuestionLogs(): void {
    const prevCount = this.questionLogs.length;
    this.questionLogs = this.questionLogs.filter((q) => {
      const isAutoSeeded =
        q.id.startsWith(`qlog-${q.studentId}-`) ||
        q.id.startsWith('qlog-seed-') ||
        q.notes === 'Hedef soru sayısı başarıyla aşıldı.' ||
        q.notes === 'Günlük soru hedefi tamamlandı.';
      return !isAutoSeeded;
    });
    if (this.questionLogs.length !== prevCount) {
      saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      this.notify();
    }
  }

  public async clearAllQuestionLogs(): Promise<void> {
    const prevLogs = [...this.questionLogs];
    const ids = this.questionLogs.map((q) => q.id);
    this.questionLogs = [];
    this.persistQuestionLogsLocal();
    this.notify();
    await this.runCloudWrite(
      async () => {
        for (let i = 0; i < ids.length; i += 100) {
          const res = await deleteRowsVerified('question_logs', ids.slice(i, i + 100));
          if (res.error) return res;
        }
        return { error: null };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kayıtları silinemedi'
    );
  }

  // --- SORU HEDEFLERİ (Aşama 10) ---
  // Her öğretmen kendi hedefini verir: aynı öğrenciye aynı dönemde farklı öğretmenlerin ayrı hedefleri olabilir.
  // Sınıf hedefi tek kayıttır; sınıftaki (sonradan eklenenler dahil) her öğrenci onu görür.
  // Bir öğretmenin aynı dönem için hem sınıf hem öğrenci hedefi varsa öğrenciye özel olan geçerlidir.

  // Hedefin bitiş günü (YYYY-MM-DD)
  public questionTargetEnd(t: WeeklyQuestionTarget): string {
    if (t.weekEndDate && /^\d{4}-\d{2}-\d{2}$/.test(t.weekEndDate)) return t.weekEndDate;
    const start = t.weekStartDate || '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (!m) return start;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + Math.max(1, t.targetDays || 7) - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private myQuestionTargetOwnerKeys(): Set<string> {
    const me = this.getCurrentTeacher();
    const keys = new Set<string>();
    if (me?.id) keys.add(me.id);
    if (me?.auth_user_id) keys.add(`auth:${me.auth_user_id}`);
    return keys;
  }

  public isMyQuestionTarget(t: WeeklyQuestionTarget): boolean {
    const me = this.getCurrentTeacher();
    if (!me) return false;
    if (t.assignedByTeacherId) return t.assignedByTeacherId === me.id;
    if (t.createdBy && me.auth_user_id) return t.createdBy === me.auth_user_id;
    return false;
  }

  // Düzenleme / silme izni: yönetici her hedefi, öğretmen yalnızca kendi hedefini (ve sahibi bilinmeyen eski kayıtları)
  public canEditQuestionTarget(t: WeeklyQuestionTarget): boolean {
    if (this.getAuthSession()?.role !== 'teacher') return false;
    if (this.isCurrentUserAdmin()) return true;
    if (!t.assignedByTeacherId && !t.createdBy) return true;
    return this.isMyQuestionTarget(t);
  }

  // Aşama 30: günlük plandan aktarılan KONU kayıtları (soru sayısı 0/1) hedef değildir; hiçbir hedef
  // listesinde, tabloda, grafikte ya da hesapta görünmez. Konular getPlanTopicsForStudentDay ile okunur.
  public getWeeklyQuestionTargets(): WeeklyQuestionTarget[] {
    // Aşama 84: aynı veriyle defalarca istendiğinde (aylık / haftalık hesaplar) her seferinde yeniden süzülmez
    const k = this.myKurum;
    return this.memoView(
      'WeeklyQuestionTargets',
      [this.weeklyQuestionTargets, this.teachers, this.classes, this.students],
      this.viewKey(`${k.head ? 1 : 0}${k.kurumAdmin ? 1 : 0}${k.kurumId || ''}${k.rolesEnabled ? 1 : 0}`),
      () => this.visibleQuestionTargetRecords().filter((t) => !isPendingPlanTarget(t))
    );
  }

  // Oturumdaki kullanıcının görebildiği TÜM kayıtlar (hedefler + plan konu kayıtları)
  private visibleQuestionTargetRecords(): WeeklyQuestionTarget[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      const myId = session.user.id;
      const myClassId = this.students.find((s) => s.id === myId)?.classId || (session.user as any).classId;
      return this.weeklyQuestionTargets.filter((t) =>
        isClassQuestionTarget(t) ? !!myClassId && t.classId === myClassId : t.studentId === myId
      );
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.weeklyQuestionTargets];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      const visibleClassIds = new Set(this.getClasses().map((c) => c.id));
      return this.weeklyQuestionTargets.filter((t) =>
        isClassQuestionTarget(t) ? !!t.classId && visibleClassIds.has(t.classId) : !!t.studentId && visibleStudentIds.has(t.studentId)
      );
    }
    return [...this.weeklyQuestionTargets];
  }

  /**
   * Aşama 30 (eksikti — öğrenci "Soru Sayısı" sayfası bu yüzden hata veriyordu):
   * Öğretmenin "Soru takibine aktar" ile gönderdiği konular: verilen gün için ders → konu listesi.
   * Hem plan konu kayıtlarından hem de konu eklenmiş gerçek hedeflerden okunur (öğrenci + sınıf kayıtları).
   */
  public getPlanTopicsForStudentDay(studentId: string, ymd: string): Array<{ subject: string; topic: string }> {
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return [];
    const classId = this.students.find((s) => s.id === studentId)?.classId;
    const bySubject = new Map<string, string[]>();
    for (const t of this.visibleQuestionTargetRecords()) {
      const mine = isClassQuestionTarget(t) ? !!classId && t.classId === classId : t.studentId === studentId;
      if (!mine) continue;
      const topic = String((t.dailyTopics || {})[ymd] || '').replace(/\s+/g, ' ').trim();
      if (!topic) continue;
      if ((t.weekStartDate || '') > ymd || this.questionTargetEnd(t) < ymd) continue;
      for (const subject of targetSubjectList(t.subject)) {
        const list = bySubject.get(subject) || [];
        if (!list.includes(topic)) list.push(topic);
        bySubject.set(subject, list);
      }
    }
    return Array.from(bySubject.entries()).map(([subject, list]) => ({ subject, topic: list.join(', ').slice(0, 120) }));
  }

  /**
   * Aşama 30 (eksikti — "Soru takibine aktar" düğmesi bu yüzden hata veriyordu):
   * Bu öğretmenin, öğrenci için verilen tarih aralığına denk gelen PLAN kayıtları (konu kayıtları ve Aşama 43 ile plandaki soru sayılarından oluşan hedefler).
   */
  public getMyPlanTopicRecords(studentId: string, rangeStart: string, rangeEnd: string): WeeklyQuestionTarget[] {
    const mine = this.myQuestionTargetOwnerKeys();
    return this.weeklyQuestionTargets.filter(
      (t) =>
        !isClassQuestionTarget(t) &&
        t.studentId === studentId &&
        isPlanTopicRecord(t) && // Aşama 43: konu kayıtları VE plandaki soru sayılarından oluşan hedefler
        mine.has(questionTargetOwnerKey(t)) &&
        this.questionTargetOverlaps(t, rangeStart, rangeEnd)
    );
  }

  /**
   * Aşama 53: öğrencinin (sınıf kayıtları hariç) verilen tarih aralığına denk gelen TÜM soru kayıtları:
   * öğretmen hedefleri, plandan gelen hedefler ve konu kayıtları — sahibi kim olursa olsun.
   * Plan → Soru Kaydet aktarımı aynı hafta/ders için birden çok kayıt (çift kayıt) kalmasın diye kullanır.
   */
  public getStudentQuestionRecordsInRange(studentId: string, rangeStart: string, rangeEnd: string): WeeklyQuestionTarget[] {
    if (!studentId) return [];
    return this.weeklyQuestionTargets.filter(
      (t) => !isClassQuestionTarget(t) && t.studentId === studentId && this.questionTargetOverlaps(t, rangeStart, rangeEnd)
    );
  }

  public getStudentQuestionTargets(): WeeklyQuestionTarget[] {
    return this.getWeeklyQuestionTargets().filter((t) => !isClassQuestionTarget(t) && !!t.studentId);
  }

  public getClassQuestionTargets(): WeeklyQuestionTarget[] {
    return this.getWeeklyQuestionTargets().filter((t) => isClassQuestionTarget(t) && !!t.classId);
  }

  private questionTargetOverlaps(t: WeeklyQuestionTarget, rangeStart: string, rangeEnd: string): boolean {
    const start = t.weekStartDate || '';
    if (!start) return false;
    return start <= rangeEnd && this.questionTargetEnd(t) >= rangeStart;
  }

  // Sıralama: önce benim hedefim, sonra başlangıç tarihi
  private sortQuestionTargets(list: WeeklyQuestionTarget[]): WeeklyQuestionTarget[] {
    return [...list].sort((a, b) => {
      const am = this.isMyQuestionTarget(a) ? 0 : 1;
      const bm = this.isMyQuestionTarget(b) ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.weekStartDate || '').localeCompare(b.weekStartDate || '');
    });
  }

  // Bir öğrencinin verilen tarih aralığına denk gelen geçerli hedefleri (öğrenci + sınıf hedefleri)
  public getQuestionTargetsForStudent(studentId: string, rangeStart: string, rangeEnd: string = rangeStart): WeeklyQuestionTarget[] {
    const student = this.students.find((s) => s.id === studentId);
    const classId = student?.classId;
    const visible = this.getWeeklyQuestionTargets().filter((t) => this.questionTargetOverlaps(t, rangeStart, rangeEnd));
    const own = visible.filter((t) => !isClassQuestionTarget(t) && t.studentId === studentId);
    const cls = classId ? visible.filter((t) => isClassQuestionTarget(t) && t.classId === classId) : [];
    const result = [...own];
    for (const c of cls) {
      // Aynı öğretmenin aynı ders için öğrenciye özel hedefi varsa sınıf hedefi gösterilmez
      const covered = own.some(
        (o) =>
          questionTargetOwnerKey(o) === questionTargetOwnerKey(c) &&
          normalizeSubject(o.subject || '') === normalizeSubject(c.subject || '') &&
          (o.weekStartDate || '') <= this.questionTargetEnd(c) &&
          this.questionTargetEnd(o) >= (c.weekStartDate || '')
      );
      if (!covered) result.push(c);
    }
    return this.sortQuestionTargets(result);
  }

  public getQuestionTargetsForClass(classId: string, rangeStart: string, rangeEnd: string = rangeStart): WeeklyQuestionTarget[] {
    return this.sortQuestionTargets(
      this.getClassQuestionTargets().filter((t) => t.classId === classId && this.questionTargetOverlaps(t, rangeStart, rangeEnd))
    );
  }

  // Eski kullanım için: haftaya denk gelen ilk (öncelikle benim) hedef. Başka haftanın hedefi ASLA döndürülmez.
  public getWeeklyQuestionTarget(studentId: string, weekStartDate?: string): WeeklyQuestionTarget | null {
    if (!weekStartDate) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartDate);
    if (!m) return null;
    const end = new Date(+m[1], +m[2] - 1, +m[3] + 6);
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return this.getQuestionTargetsForStudent(studentId, weekStartDate, endStr)[0] || null;
  }

  // Aynı öğretmenin aynı öğrenci/sınıf ve ders için çakışan başka hedefi (yeni kayıtta "güncellenecek" diye gösterilir)
  public findQuestionTargetConflict(draft: WeeklyQuestionTarget): WeeklyQuestionTarget | null {
    const isClass = isClassQuestionTarget(draft);
    const ownerKeys = draft.assignedByTeacherId ? new Set([draft.assignedByTeacherId]) : this.myQuestionTargetOwnerKeys();
    const start = draft.weekStartDate || '';
    const end = this.questionTargetEnd(draft);
    return (
      this.weeklyQuestionTargets.find(
        (t) =>
          t.id !== draft.id &&
          isClassQuestionTarget(t) === isClass &&
          (isClass ? t.classId === draft.classId : t.studentId === draft.studentId) &&
          ownerKeys.has(questionTargetOwnerKey(t)) &&
          sameTargetSubjects(t.subject, draft.subject) &&
          (t.weekStartDate || '') <= end &&
          this.questionTargetEnd(t) >= start
      ) || null
    );
  }

  // Eski sürümün sınıf hedefiyle birlikte öğrencilere kopyaladığı kayıtlar (aynı anda kaydedildikleri için
  // aynı sınıf, aynı başlangıç ve aynı atanma zamanına sahiptirler)
  private legacyClassTargetCopies(classTarget: WeeklyQuestionTarget): WeeklyQuestionTarget[] {
    if (!classTarget.assignedDate || classTarget.assignedByTeacherId) return [];
    return this.weeklyQuestionTargets.filter(
      (t) =>
        !isClassQuestionTarget(t) &&
        t.classId === classTarget.classId &&
        t.weekStartDate === classTarget.weekStartDate &&
        t.assignedDate === classTarget.assignedDate &&
        !t.assignedByTeacherId
    );
  }

  // Hedefi kaydeder (yeni ya da düzenleme). Kimlik verilirse o kayıt güncellenir.
  public async saveQuestionTarget(draft: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    const isClass = isClassQuestionTarget(draft);
    if (isClass ? !draft.classId : !draft.studentId) throw new Error(isClass ? 'Sınıf seçilmedi.' : 'Öğrenci seçilmedi.');
    if (!draft.weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.weekStartDate)) throw new Error('Başlangıç tarihi geçersiz.');
    const days = Math.max(1, Math.min(366, Math.round(draft.targetDays || 7)));
    // Gün gün farklı dağıtım: yalnızca hedefin tarihleri içindeki günler, 0..2000 arası tam sayılar tutulur
    const rangeEnd = this.questionTargetEnd({ ...draft, targetDays: days });
    let dailyTargets: Record<string, number> | undefined;
    if (draft.dailyTargets && typeof draft.dailyTargets === 'object') {
      const dt: Record<string, number> = {};
      for (const [k, v] of Object.entries(draft.dailyTargets)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k < (draft.weekStartDate || '') || k > rangeEnd) continue;
        dt[k] = Math.max(0, Math.min(2000, Math.round(Number(v) || 0)));
      }
      if (Object.keys(dt).length) dailyTargets = dt;
    }
    const total = dailyTargets
      ? Object.values(dailyTargets).reduce((a, b) => a + b, 0)
      : Math.round(Number(draft.targetQuestions ?? draft.weeklyTarget) || 0);
    // Aşama 30: günlük plandan gelen KONU kaydı soru sayısı taşımaz (0); hedef değildir, yalnızca konuları taşır
    const isTopicRecord = !!draft.fromPlan && !dailyTargets && total <= 0;
    if (total < 1 && !isTopicRecord) throw new Error('Toplam soru hedefi en az 1 olmalı.');
    const daily = isTopicRecord
      ? 0
      : dailyTargets
      ? Math.max(1, Math.round(total / days))
      : Math.max(1, Math.round(Number(draft.dailyTarget) || total / days));
    const me = this.getCurrentTeacher();
    const existing = draft.id ? this.weeklyQuestionTargets.find((t) => t.id === draft.id) : undefined;
    if (existing && !this.canEditQuestionTarget(existing)) throw new Error('Bu hedefi yalnızca hedefi veren öğretmen değiştirebilir.');

    const subjectTargets =
      draft.subjectTargets && !Array.isArray(draft.subjectTargets)
        ? Object.fromEntries(
            Object.entries(draft.subjectTargets)
              .map(([k, v]) => [normalizeSubject(k), Math.round(Number(v) || 0)] as [string, number])
              .filter(([k, v]) => k && v > 0)
          )
        : undefined;

    const saved: WeeklyQuestionTarget = {
      ...(existing || {}),
      ...draft,
      id: existing?.id || draft.id || newQuestionTargetId(),
      targetType: isClass ? 'class' : 'student',
      studentId: isClass ? undefined : draft.studentId,
      targetDays: days,
      targetPeriodLabel: days === 7 ? 'Haftalık (7 Gün)' : `${days} Günlük`,
      targetQuestions: total,
      weeklyTarget: total,
      dailyTarget: daily,
      dailyTargets,
      weekEndDate: rangeEnd,
      subject: targetSubjectList(draft.subject).join(', ') || undefined,
      subjectTargets: subjectTargets && Object.keys(subjectTargets).length ? subjectTargets : undefined,
      notes: (draft.notes || '').trim().slice(0, 400) || undefined,
      // Sahip değişmez: düzenlemede ilk veren öğretmen kalır
      assignedByTeacherId: existing?.assignedByTeacherId || draft.assignedByTeacherId || me?.id,
      assignedByTeacherName: existing?.assignedByTeacherName || draft.assignedByTeacherName || me?.name,
      assignedBy: existing?.assignedByTeacherName || draft.assignedByTeacherName || me?.name || 'Öğretmen',
      assignedDate: new Date().toISOString(),
    };
    if (!saved.assignedByTeacherId) delete saved.assignedByTeacherId;

    const prevTargets = [...this.weeklyQuestionTargets];
    // Eski sınıf hedefi düzenleniyorsa öğrencilere yapılmış eski kopyalar kaldırılır (artık sınıf kaydı geçerli)
    const legacyCopies = existing && isClass ? this.legacyClassTargetCopies(existing) : [];
    const legacyIds = new Set(legacyCopies.map((t) => t.id));
    this.weeklyQuestionTargets = [saved, ...this.weeklyQuestionTargets.filter((t) => t.id !== saved.id && !legacyIds.has(t.id))];
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    const rollback = () => {
      this.weeklyQuestionTargets = prevTargets;
      saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    };
    await this.runCloudWrite(
      () => supabase.from('question_targets').upsert([questionTargetToRow(saved)], { onConflict: 'id' }),
      rollback,
      'Soru hedefi kaydedilemedi',
      { kuyruk: true } // Aşama 343: bağlantı yoksa cihazda bekler
    );
    if (legacyCopies.length) {
      const ids = legacyCopies.map((t) => t.id).filter((id): id is string => !!id);
      await this.runCloudWrite(() => deleteRowsVerified('question_targets', ids), () => {}, 'Eski hedef kopyaları silinemedi', { silent: true });
    }
    return saved;
  }

  public async deleteQuestionTargetById(id: string): Promise<void> {
    const target = this.weeklyQuestionTargets.find((t) => t.id === id);
    if (!target) return;
    if (!this.canEditQuestionTarget(target)) throw new Error('Bu hedefi yalnızca hedefi veren öğretmen silebilir.');
    const extra = isClassQuestionTarget(target) ? this.legacyClassTargetCopies(target) : [];
    const removeIds = new Set([id, ...extra.map((t) => t.id)]);
    await this.removeQuestionTargets((t) => removeIds.has(t.id), 'Soru hedefi silinemedi');
  }

  // Eski çağrılar için (yeni ekranlar saveQuestionTarget kullanır)
  public async setWeeklyQuestionTarget(target: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    return this.saveQuestionTarget({ ...target, targetType: 'student' });
  }

  public async setClassQuestionTarget(
    classId: string,
    className: string,
    targetData: Partial<WeeklyQuestionTarget>
  ): Promise<WeeklyQuestionTarget> {
    return this.saveQuestionTarget({ ...targetData, targetType: 'class', classId, className, studentId: undefined });
  }

  private async removeQuestionTargets(
    shouldRemove: (t: WeeklyQuestionTarget) => boolean,
    userMessage: string
  ): Promise<void> {
    const prevTargets = [...this.weeklyQuestionTargets];
    const removed = this.weeklyQuestionTargets.filter(shouldRemove);
    if (removed.length === 0) return;
    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => !shouldRemove(t));
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    const ids = removed.map((t) => t.id).filter((id): id is string => !!id);
    await this.runCloudWrite(
      () => deleteRowsVerified('question_targets', ids),
      () => {
        this.weeklyQuestionTargets = prevTargets;
        saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
      },
      userMessage
    );
  }

  // Hedefin ilerlemesi: yalnızca hedefin kendi tarihleri (ve dersi seçildiyse o ders) sayılır
  public questionTargetProgress(
    t: WeeklyQuestionTarget,
    studentId: string,
    logs: StudentQuestionLog[]
  ): { solved: number; total: number; percent: number; done: boolean; remaining: number; bySubject: Record<string, number> } {
    const start = t.weekStartDate || '';
    const end = this.questionTargetEnd(t);
    const subj = t.subject ? normalizeSubject(t.subject) : '';
    const counts = targetSubjectMatcher(t.subject);
    const bySubject: Record<string, number> = {};
    let solved = 0;
    for (const l of logs) {
      if (l.studentId !== studentId || !l.date || l.date < start || l.date > end) continue;
      const entries = Array.isArray(l.entries) ? l.entries : [];
      if (entries.length) {
        for (const e of entries) {
          const name = normalizeSubject(e.subject || '');
          const n = Number(e.questionCount) || 0;
          bySubject[name] = (bySubject[name] || 0) + n;
          if (counts(name)) solved += n;
        }
      } else if (!subj) {
        solved += Number(l.totalQuestions) || 0;
      }
    }
    const total = Math.max(1, Number(t.targetQuestions || t.weeklyTarget) || 1);
    return {
      solved,
      total,
      percent: Math.min(100, Math.round((solved / total) * 100)),
      done: solved >= total,
      remaining: Math.max(0, total - solved),
      bySubject,
    };
  }

  // =========================================================================
  // DERS BAZLI AÇILIR MENÜ (DROPDOWN) ETÜT ÖĞRETMENLERİ YÖNETİMİ
  // =========================================================================
  private static readonly AUTO_SEEDED_TEACHER_NAMES = new Set([
    'Gülderen Akgün',
    'Gül Deniz',
    'Tunahan Çetin',
    'Kemal onarıcı',
    'Kemal Onarıcı',
    'Cihan Baysal',
    'Tuğçe Özsoy',
    'Elif Şahin',
    'Zeynep Kaya',
    'Ahmet Yılmaz',
    'Murat Demir',
    'John Miller',
    'Sarah Jenkins',
    'Ali Demir',
    'Mehmet Öztürk',
    'Ayşe Yılmaz',
    'Öğretmen',
    'Sistem Öğretmeni',
    'Etüt Öğretmeni',
  ]);

  public getSubjectTeachersMap(): Record<string, string[]> {
    // Otomatik eklenen sahte ve önceden atanmış etüt öğretmenleri tamamen temizlendi
    const cleanedMap: Record<string, string[]> = {};

    try {
      const stored = localStorage.getItem('etut_subject_teachers_map');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          let wasModified = false;
          for (const [subj, teachers] of Object.entries(parsed)) {
            if (Array.isArray(teachers)) {
              const filtered = teachers.filter(
                (name) =>
                  typeof name === 'string' &&
                  name.trim() !== '' &&
                  !DataService.AUTO_SEEDED_TEACHER_NAMES.has(name.trim())
              );
              if (filtered.length !== teachers.length) {
                wasModified = true;
              }
              if (filtered.length > 0) {
                cleanedMap[subj] = Array.from(new Set(filtered));
              }
            }
          }
          if (wasModified) {
            localStorage.setItem('etut_subject_teachers_map', JSON.stringify(cleanedMap));
          }
          return cleanedMap;
        }
      }
    } catch {
      // fallback
    }
    return cleanedMap;
  }

  public getTeachersForSubject(subject: string): string[] {
    const map = this.getSubjectTeachersMap();
    const trLc = (v: string) => v.toLocaleLowerCase('tr-TR'); // Aşama 154: "İNGİLİZCE" = "İngilizce"
    const cleanSub = trLc((subject || '').trim());
    const resultTeachers: string[] = [];

    // 1. Kullanıcının daha önce bu ders için kaydettiği öğretmenler
    if (map[subject] && Array.isArray(map[subject])) {
      resultTeachers.push(...map[subject]);
    }
    const foundKey = Object.keys(map).find(
      (k) =>
        trLc(k) === cleanSub ||
        cleanSub.includes(trLc(k)) ||
        trLc(k).includes(cleanSub)
    );
    if (foundKey && map[foundKey] && Array.isArray(map[foundKey])) {
      resultTeachers.push(...map[foundKey]);
    }

    // 2. Sistemde kayıtlı ve onaylanmış branş öğretmenleri
    if (this.teachers && this.teachers.length > 0) {
      this.teachers.forEach((t) => {
        if (!t.name || t.status === 'pending') return;
        const trimmed = t.name.trim();
        if (DataService.AUTO_SEEDED_TEACHER_NAMES.has(trimmed)) return;

        const tb = trLc(t.branch || '');
        if (!tb || tb === cleanSub || tb.includes(cleanSub) || cleanSub.includes(tb)) {
          resultTeachers.push(trimmed);
        }
      });
    }

    // 3. Oturum açmış olan öğretmen
    const session = this.getAuthSession();
    if (session?.role === 'teacher' && session.user?.name) {
      const tName = session.user.name.trim();
      if (!DataService.AUTO_SEEDED_TEACHER_NAMES.has(tName)) {
        resultTeachers.push(tName);
      }
    }

    // Tekilleştirme ve temizleme
    return Array.from(new Set(resultTeachers.filter((t) => t && !DataService.AUTO_SEEDED_TEACHER_NAMES.has(t))));
  }

  public getLastTeacherForSubject(subject: string): string {
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      const stored = localStorage.getItem(`etut_last_teacher_${cleanSub}`);
      if (stored && typeof stored === 'string') {
        const clean = stored.trim();
        if (clean && !DataService.AUTO_SEEDED_TEACHER_NAMES.has(clean)) {
          return clean;
        } else {
          localStorage.removeItem(`etut_last_teacher_${cleanSub}`);
        }
      }
    } catch {}
    const list = this.getTeachersForSubject(subject);
    return list.length > 0 ? list[0] : '';
  }

  public setLastTeacherForSubject(subject: string, teacherName: string): void {
    const clean = (teacherName || '').trim();
    if (!clean || DataService.AUTO_SEEDED_TEACHER_NAMES.has(clean)) return;
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      localStorage.setItem(`etut_last_teacher_${cleanSub}`, clean);
    } catch {}
  }

  public addTeacherToSubject(subject: string, teacherName: string): Record<string, string[]> {
    const cleanName = (teacherName || '').trim();
    if (!cleanName || DataService.AUTO_SEEDED_TEACHER_NAMES.has(cleanName)) {
      return this.getSubjectTeachersMap();
    }
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    const list = map[targetKey] ? [...map[targetKey]] : [];
    if (!list.includes(cleanName)) {
      list.push(cleanName);
      map[targetKey] = list;
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.setLastTeacherForSubject(targetKey, cleanName);
      this.notify();
    }
    return map;
  }

  public removeTeacherFromSubject(subject: string, teacherName: string): Record<string, string[]> {
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    if (map[targetKey]) {
      map[targetKey] = map[targetKey].filter((t) => t !== teacherName);
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.notify();
    }
    return map;
  }
}

export const dataService = DataService.getInstance();
