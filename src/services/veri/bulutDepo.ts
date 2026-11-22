// ============================================================================
// Aşama 358: BULUT YAZMA VE YEREL DEPO: giden kutusu, geri alma, satır dönüşümleri, artımlı okuma, şifreli cihaz önbelleği
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → dataService
// ============================================================================
import {
  Student,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  Etut,
  AttendanceRecord,
  GradeRecord,
  StudentMessage,
  TeacherDocument,
  StudentNotification,
  SentEmailLog,
  StudentQuestionLog,
  EtutStudentAttendance,
} from '../../types';
import { supabase } from '../../lib/supabase';
import { cleanParents } from '../../lib/parents';
import { wipeSecureCache, resumeSecureCache, hasSecureKey, saveSecureCache, type SecurePayload } from '../../lib/secureCache';
import { STORAGE_KEYS, browserLocalStorage, saveData } from '../depo';
import { MAX_INLINE_FILE_CHARS, applyHomeworkRowExtras, homeworkTargets } from '../satirDonusumleri';
import { sameData, geriAlYalnizDokunulan } from '../listeBirlestirme';
import { isMissingTable } from '../hataMetinleri';
import { isMissingGenderColumn, isMissingBirthColumn } from '../hataMetinleri';
import { fetchAllRows } from '../bulutIslemleri';
import { agHatasiMi, baglantiNedeni } from '../../lib/baglanti';
import { KurumYetkiKatmani } from './kurumYetki';
import { cleanStudentEmail, type GeriAlmaListe, type GidenIs, type RawTable } from './ortak';

export abstract class BulutDepoKatmani extends KurumYetkiKatmani {

  public classes: ClassGroup[] = [];
  public homeworks: Homework[] = [];
  public submissions: HomeworkSubmission[] = [];
  public attendance: AttendanceRecord[] = [];
  public grades: GradeRecord[] = [];
  public messages: StudentMessage[] = [];
  public documents: TeacherDocument[] = [];
  public studentNotifications: StudentNotification[] = [];
  public sentEmails: SentEmailLog[] = [];
  public questionLogs: StudentQuestionLog[] = [];

  /** Sunucudaki etüt satırını uygulama nesnesine çevirir (tam okuma, artımlı okuma ve ortak takvim aynı yolu kullanır) */
  protected remoteRowToEtut(re: any): Etut {
    // Aşama 196: etuts tablosundan gelen satır (öğretmen: tam okuma, artımlı okuma, anlık kanal) yorum sütunlarını
    // taşır; onda yoklama yalnız etut_yoklama'dan, yorumlar yalnız sütunlardan okunur. Sunucu işlevlerinden gelen
    // satırlar (öğrenci, zümre, ortak takvim) bu sütunları taşımaz; onların notes'unu sunucu yeni yapıdan üretir (sql/178).
    const fromTable = !!re && Object.prototype.hasOwnProperty.call(re, 'user_notes');
    let parsedMeta: any = {};
    try {
      if (typeof re.notes === 'object' && re.notes !== null) {
        parsedMeta = re.notes;
      } else if (typeof re.notes === 'string' && re.notes.trim().startsWith('{')) {
        parsedMeta = JSON.parse(re.notes);
      }
    } catch (err) {}
    const studentAttendance = this.etutAttendanceOf(re.id, parsedMeta, fromTable);
    // eski düz metin not (JSON olmayan notes): yorum alanı değil, etüdün kendi notudur; 198 buna dokunmaz
    const plainNotes = typeof re.notes === 'string' && !re.notes.startsWith('{') ? re.notes : '';

    let incomingAssigned: 'all' | string[] = 'all';
    if (re.assigned_student_ids && Array.isArray(re.assigned_student_ids) && re.assigned_student_ids.length > 0) {
      incomingAssigned = re.assigned_student_ids;
    } else if (parsedMeta.assignedStudentIds && Array.isArray(parsedMeta.assignedStudentIds) && parsedMeta.assignedStudentIds.length > 0) {
      incomingAssigned = parsedMeta.assignedStudentIds;
    } else if (Object.keys(studentAttendance).length > 0) {
      incomingAssigned = Object.keys(studentAttendance);
    } else if (parsedMeta.assignedStudentIds === 'all' || !re.assigned_student_ids) {
      incomingAssigned = 'all';
    }

    return {
      id: re.id,
      subject: re.subject,
      topic: re.topic,
      date: re.date ? re.date.trim().split('T')[0] : '',
      time: re.time || '',
      duration: Number(re.duration) || parsedMeta.duration || 45,
      assignedStudentIds: incomingAssigned,
      location: re.location || '',
      // Aşama 179: yorumlar ayrı sütundan (sql/178); sütun yoksa (öğrenci / zümre / ortak takvim satırı) notes'tan
      // Aşama 196: tablo satırında notes içindeki eski yorum anahtarlarına bakılmaz
      notes: fromTable
        ? typeof re.user_notes === 'string'
          ? re.user_notes
          : plainNotes
        : parsedMeta.userNotes !== undefined
        ? parsedMeta.userNotes
        : plainNotes,
      teacherFeedback: fromTable
        ? typeof re.teacher_feedback === 'string'
          ? re.teacher_feedback
          : ''
        : parsedMeta.teacherFeedback || '',
      createdAt: re.created_at || new Date().toISOString(),
      teacherId: re.etut_teacher_id || parsedMeta.teacherId || 'teacher-1',
      teacherName: parsedMeta.teacherName || 'Öğretmen',
      teacherIds: BulutDepoKatmani.etutTeacherIdsOf(re.etut_teacher_ids, parsedMeta.teacherIds),
      teacherNames: Array.isArray(parsedMeta.teacherNames) ? parsedMeta.teacherNames.filter((x: any) => typeof x === 'string') : undefined,
      teacherBranch: parsedMeta.teacherBranch || '',
      lessonPeriod: parsedMeta.lessonPeriod || 'Ders',
      gradeLevel: parsedMeta.gradeLevel,
      schoolLevel: parsedMeta.schoolLevel,
      studentAttendance, // Aşama 196: tablo satırında yalnız etut_yoklama
      attendanceTakenBy:
        (fromTable
          ? re.attendance_taken_by && typeof re.attendance_taken_by === 'object'
            ? re.attendance_taken_by
            : undefined
          : parsedMeta.attendanceTakenBy) || undefined,
      createdById: parsedMeta.createdById || undefined,
      createdByName: parsedMeta.createdByName || undefined,
      recurrenceGroupId: parsedMeta.recurrenceGroupId || undefined,
      mailMode: parsedMeta.mailMode === 'scheduled' || parsedMeta.mailMode === 'off' ? parsedMeta.mailMode : undefined,
      privacyRedacted: parsedMeta.__redacted__ === true ? true : undefined,
    };
  }

  // --- STUDENTS SUPABASE SYNC (CENTRAL DB IS SINGLE SOURCE OF TRUTH) ---
  // Öğrenci kaydının bulut satırındaki karşılığı (yalnızca tabloda bulunan sütunlar)
  protected studentToRow(s: Student, isNew = false) {
    const row: Record<string, unknown> = {
      name: s.name,
      student_number: s.studentNumber || '',
      class_id: s.classId || 'class-default',
      class_name: s.className || 'Atanmadı',
      email: s.email || null,
      phone: s.phone || null,
      avatar: s.avatar || null,
      // Aşama 171: cinsiyet (sütun yoksa hiç gönderilmez)
      ...(BulutDepoKatmani.genderMissing.students ? {} : { gender: s.gender || null }),
      // Aşama 324: doğum tarihi (veritabanı korumalı tabloya taşır; boş metin = sil). Sütun yoksa hiç gönderilmez.
      ...(BulutDepoKatmani.birthMissing || (isNew && !s.birthDate) ? {} : { birth_date: s.birthDate || (isNew ? null : '') }),
      // Aşama 69: veliler (en çok 3). Sütun yoksa patchStudentRow bunu çıkarıp tekrar dener.
      parents: cleanParents(s.parents),
    };
    // Aşama 85: iletişim bilgisi korumalı tablodaysa (sql/85)
    //  - bilgisini göremediğimiz öğrencide bu alanlar hiç gönderilmez (boş değerle ezilmez)
    //  - silinen e-posta / telefon boş metin olarak gönderilir (veritabanı "silindi" olarak anlar)
    if (BulutDepoKatmani.contactsMode === 'table') {
      if (!isNew && !this.contactKnown.has(s.id)) {
        delete row.email;
        delete row.phone;
        delete row.parents;
        delete row.birth_date; // Aşama 324: görülemeyen doğum tarihi boşla ezilmez
      } else if (!isNew) {
        row.email = s.email || '';
        row.phone = s.phone || '';
      }
    }
    return row;
  }

  // ===========================================================================
  // Aşama 85: VELİ / ÖĞRENCİ İLETİŞİM BİLGİSİ KORUMALI TABLODA (student_contacts, sql/85)
  // students tablosunun email / phone / parents sütunları uygulama kullanıcılarına kapalıdır; bilgi
  // student_contacts'tan, veritabanının izin verdiği kadar okunur. SQL çalıştırılmadıysa eski yol sürer.
  // ===========================================================================
  protected static readonly STUDENT_BASE_COLUMNS = 'id,name,student_number,class_id,class_name,avatar,registered_at,auth_user_id,status,kurum_id';
  // Aşama 171: cinsiyet sütunu (sql/171). SQL kurulmadan dosyalar yüklenirse sütun atlanır, site bozulmaz.
  protected static genderMissing = { students: false, teachers: false };
  protected static get STUDENT_SAFE_COLUMNS(): string {
    return BulutDepoKatmani.STUDENT_BASE_COLUMNS + (BulutDepoKatmani.genderMissing.students ? '' : ',gender');
  }
  // Aşama 324: doğum tarihi korumalı tabloda (sql/324). SQL kurulmadan dosyalar yüklenirse sütun atlanır, site bozulmaz.
  protected static birthMissing = false;
  protected static get CONTACT_COLUMNS(): string {
    return 'id,email,phone,parents' + (BulutDepoKatmani.birthMissing ? '' : ',birth_date');
  }
  protected static contactsMode: 'unknown' | 'table' | 'legacy' = 'unknown';
  /** İletişim bilgisi veritabanından okunabilen öğrenciler (yalnızca bunların bilgisi geri yazılır) */
  protected contactKnown = new Set<string>();
  /** Öğrenci satırlarını iletişim bilgisiyle birlikte okur (korumalı tablo varsa ondan) */
  protected async fetchStudentRowsWithContacts(isBackground = false): Promise<{ data: any[] | null; error: any }> {
    if (BulutDepoKatmani.contactsMode !== 'legacy') {
      // hız: iki okuma aynı anda yapılır. Aşama 193: ikisi de artımlı (yalnız değişen satırlar iner)
      const [contacts, rows] = await Promise.all([
        this.fetchRowsSmart('student_contacts', isBackground, BulutDepoKatmani.CONTACT_COLUMNS),
        this.fetchRowsSmart('students', isBackground, BulutDepoKatmani.STUDENT_SAFE_COLUMNS),
      ]);
      if (contacts.error && !BulutDepoKatmani.birthMissing && isMissingBirthColumn(contacts.error)) {
        BulutDepoKatmani.birthMissing = true; // Aşama 324: SQL henüz kurulmadı
        return this.fetchStudentRowsWithContacts(isBackground);
      }
      if (!contacts.error) {
        BulutDepoKatmani.contactsMode = 'table';
        if (rows.error && !BulutDepoKatmani.genderMissing.students && isMissingGenderColumn(rows.error)) {
          BulutDepoKatmani.genderMissing.students = true; // Aşama 171: SQL henüz kurulmadı
          return this.fetchStudentRowsWithContacts(isBackground);
        }
        if (rows.error) return rows;
        const byId = new Map<string, any>((contacts.data || []).map((c: any) => [String(c.id), c]));
        const known = new Set<string>();
        const merged = (rows.data || []).map((r: any) => {
          const c = byId.get(String(r.id));
          if (c) known.add(String(r.id));
          return { ...r, email: c ? c.email : null, phone: c ? c.phone : null, parents: c ? c.parents || [] : [], birth_date: c ? c.birth_date || null : null };
        });
        this.contactKnown = known;
        return { data: merged, error: null };
      }
      if (!isMissingTable(contacts.error)) return { data: null, error: contacts.error };
      BulutDepoKatmani.contactsMode = 'legacy'; // 85 numaralı SQL henüz çalıştırılmadı: eski yol
    }
    return fetchAllRows('students');
  }
  /** Tek öğrencinin iletişim bilgisini yeniler (anlık güncelleme sonrası; kısa bekleme ile toplu) */
  protected contactRefreshIds = new Set<string>();
  protected contactRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  protected scheduleContactRefresh(id: string): void {
    if (BulutDepoKatmani.contactsMode !== 'table' || !id) return;
    this.contactRefreshIds.add(id);
    if (this.contactRefreshTimer) return;
    this.contactRefreshTimer = setTimeout(async () => {
      this.contactRefreshTimer = null;
      const ids = Array.from(this.contactRefreshIds);
      this.contactRefreshIds.clear();
      try {
        const { data, error } = await supabase.from('student_contacts').select(BulutDepoKatmani.CONTACT_COLUMNS).in('id', ids);
        if (error && !BulutDepoKatmani.birthMissing && isMissingBirthColumn(error)) BulutDepoKatmani.birthMissing = true; // Aşama 324
        if (error || !Array.isArray(data)) return;
        const byId = new Map<string, any>(data.map((c: any) => [String(c.id), c]));
        let changed = false;
        const next = this.students.map((st) => {
          if (!ids.includes(st.id)) return st;
          const c = byId.get(st.id);
          if (!c) return st;
          this.contactKnown.add(st.id);
          const upd = { ...st, email: cleanStudentEmail(c.email) || '', phone: c.phone || '', parents: cleanParents(c.parents) };
          if (!BulutDepoKatmani.birthMissing) upd.birthDate = c.birth_date || undefined; // Aşama 324
          if (sameData(upd, st)) return st;
          changed = true;
          return upd;
        });
        if (changed) {
          this.students = next;
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          this.notify();
        }
      } catch {
        /* bir sonraki eşitlemede gelir */
      }
    }, 600);
  }

  // ===========================================================================
  // HIZ (Aşama 88): ARTIMLI EŞİTLEME (mesajlar / duyurular, notlar, yoklama)
  // İlk açılışta ve elle yenilemede tablonun tamamı okunur (eskisi gibi). Arka plandaki yenilemelerde
  // (sekmeye dönüş, 5 dakikalık güvenlik kontrolü) sql/88 kuruluysa yalnızca son değişen satırlar okunur;
  // silinen ya da yeni görünür olan satırlar 10 dakikada bir yalnızca kimlik listesiyle bulunur.
  // Büyük kurumda bir yenileme ~47 MB yerine birkaç KB indirir. sql/88 yoksa her şey eskisi gibi tam okunur.
  // ===========================================================================
  protected deltaReady: Set<string> | null = null;
  protected deltaReadyAt = 0;
  protected deltaReadyPromise: Promise<Set<string>> | null = null;
  // Aşama 179: etüt yoklaması (sql/178 etut_yoklama) — etüt kimliği -> öğrenci -> kayıt
  protected etutYoklama = new Map<string, Record<string, EtutStudentAttendance>>();
  protected static readonly DELTA_RECONCILE_MS = 10 * 60000;

  // ===========================================================================
  // Aşama 103: ŞİFREYLE KİLİTLİ CİHAZ ÖNBELLEĞİ (src/lib/secureCache.ts)
  // Yoklama, mesaj / duyuru ve notlar şifreli saklanır; tekrar girişte bu listeler hemen gelir ve sunucudan
  // yalnızca değişenler (Aşama 88 artımlı okuma) indirilir. Yalnız şifreyle giren öğretmende çalışır.
  // ===========================================================================
  protected secureRestore: Promise<void> | null = null;
  protected secureDisabled = false;
  protected secureSaveTimer: ReturnType<typeof setTimeout> | null = null;
  protected secureSavedAt = 0;
  protected static readonly SECURE_SAVE_DELAY_MS = 5000;
  // büyük listeler sık değişse de (anlık kanal) en fazla dakikada bir yazılır; sekme arka plana geçerken hemen yazılır
  protected static readonly SECURE_SAVE_MIN_GAP_MS = 60000;

  protected async resumeSecure(): Promise<void> {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid || this.getAuthSession()?.role !== 'teacher') return;
      this.applySecurePayload(await resumeSecureCache(uid));
    } catch {
      /* önbellek açılamadı: tam okuma */
    }
  }

  /**
   * Aşama 355: sekme deposundan gelen büyük listeler belleğe alınır. Bu açılışta buluttan güncel hâli gelen liste
   * zaten süzülmüştür (depo.ts). Yoklama / mesaj / not kilitli önbellekten (Aşama 103, artımlı okuma işaretiyle)
   * açıldıysa ona dokunulmaz.
   */
  protected buyukListeleriUygula(m: Map<string, unknown>): void {
    if (!m.size) return;
    const K = STORAGE_KEYS;
    const alanlar: Array<[string, (v: any[]) => void, string?]> = [
      [K.TEACHERS, (v) => (this.teachers = v)],
      [K.CLASSES, (v) => (this.classes = v)],
      [K.STUDENTS, (v) => (this.students = v)],
      [K.HOMEWORK, (v) => (this.homeworks = v)],
      [K.SUBMISSIONS, (v) => (this.submissions = v)],
      [K.ETUTS, (v) => (this.etuts = v)],
      [K.ATTENDANCE, (v) => (this.attendance = v), 'attendance'],
      [K.GRADES, (v) => (this.grades = v), 'grades'],
      [K.MESSAGES, (v) => (this.messages = v), 'messages'],
      [K.DOCUMENTS, (v) => (this.documents = v)],
      [K.STUDENT_NOTIFICATIONS, (v) => (this.studentNotifications = v)],
      [K.SENT_EMAILS, (v) => (this.sentEmails = v)],
      [K.QUESTION_LOGS, (v) => (this.questionLogs = v)],
      [K.WEEKLY_QUESTION_TARGETS, (v) => (this.weeklyQuestionTargets = v)],
    ];
    let degisti = false;
    for (const [anahtar, ata, kilitliTablo] of alanlar) {
      const v = m.get(anahtar);
      if (!Array.isArray(v)) continue;
      if (kilitliTablo && this.deltaState.has(kilitliTablo)) continue;
      ata(v);
      degisti = true;
    }
    if (degisti) this.notify();
  }

  protected applySecurePayload(p: SecurePayload | null): void {
    // kayıt yoksa da bu noktadan sonra değişiklikler kilitli kayda yazılır
    this.secureSaveRefs = { attendance: null, messages: null, grades: null };
    if (!p || this.secureDisabled) {
      if (this.secureDisabled) this.secureSaveRefs = null;
      return;
    }
    const t = p.tables || {};
    let changed = false;
    const take = (name: 'attendance' | 'messages' | 'grades', apply: (rows: any[]) => void) => {
      const x = t[name];
      if (!x || !Array.isArray(x.rows) || typeof x.mark !== 'string' || !x.mark) return;
      apply(x.rows);
      this.deltaState.set(name, { mark: x.mark, idsAt: 0, restored: true });
      changed = true;
    };
    take('attendance', (rows) => {
      this.attendance = rows;
    });
    take('messages', (rows) => {
      this.messages = rows;
    });
    take('grades', (rows) => {
      this.grades = rows;
    });
    if (!changed) return;
    // açılan liste zaten kayıttakiyle aynı: hemen yeniden yazılmaz
    this.secureSaveRefs = { attendance: this.attendance, messages: this.messages, grades: this.grades };
    this.notify();
  }

  protected scheduleSecureSave(): void {
    const r = this.secureSaveRefs;
    if (!r || this.secureDisabled || this.secureSaveTimer) return;
    if (r.attendance === this.attendance && r.messages === this.messages && r.grades === this.grades) return;
    const wait = Math.max(BulutDepoKatmani.SECURE_SAVE_DELAY_MS, BulutDepoKatmani.SECURE_SAVE_MIN_GAP_MS - (Date.now() - this.secureSavedAt));
    this.secureSaveTimer = setTimeout(() => {
      this.secureSaveTimer = null;
      const run = () => {
        this.saveSecureNow().catch(() => {});
      };
      const ric = (window as any).requestIdleCallback;
      if (typeof ric === 'function') ric(run, { timeout: 4000 });
      else run();
    }, wait);
  }

  /** Sekme gizlenirken bekleyen kayıt hemen yazılır */
  protected flushSecureSave(): void {
    if (!this.secureSaveTimer) return;
    clearTimeout(this.secureSaveTimer);
    this.secureSaveTimer = null;
    this.saveSecureNow().catch(() => {});
  }

  protected async saveSecureNow(): Promise<void> {
    const r = this.secureSaveRefs;
    if (!r || this.secureDisabled || this.getAuthSession()?.role !== 'teacher' || !hasSecureKey()) return;
    const att = this.attendance;
    const msg = this.messages;
    const grd = this.grades;
    const tables: SecurePayload['tables'] = {};
    // yalnız sunucudan en az bir kez okunmuş (işareti olan) tablolar saklanır
    const a = this.deltaState.get('attendance');
    const m = this.deltaState.get('messages');
    const g = this.deltaState.get('grades');
    if (a?.mark) tables.attendance = { mark: a.mark, rows: att };
    if (m?.mark) tables.messages = { mark: m.mark, rows: msg };
    if (g?.mark) tables.grades = { mark: g.mark, rows: grd };
    if (!tables.attendance && !tables.messages && !tables.grades) return;
    this.secureSaveRefs = { attendance: att, messages: msg, grades: grd };
    this.secureSavedAt = Date.now();
    await saveSecureCache({ tables });
  }

  /** Çıkış, kurum geçişi, öğrenci girişi: önbellek kapanır, kayıt ve anahtar silinir */
  protected stopSecureCache(): void {
    this.secureDisabled = true;
    this.secureSaveRefs = null;
    this.secureRestore = null;
    if (this.secureSaveTimer) clearTimeout(this.secureSaveTimer);
    this.secureSaveTimer = null;
    wipeSecureCache().catch(() => {});
  }

  /** sql/88 ile "değişim zamanı" tutulan tablolar (yarım saatte bir yeniden sorulur) */
  // Aşama 298 (HIZ): artımlı okunabilen tabloların listesi (sync_delta_tables) kişiye değil veritabanının kurulumuna aittir
  // (hangi tabloda "son değişiklik" tetiği var). Eskiden her sayfa açılışında sınıf / öğrenci / öğretmen okumaları önce
  // bu listenin yanıtını bekliyordu (art arda iki istek). Artık liste bu cihazda saklanır: açılışta saklanan liste
  // BEKLEMEDEN kullanılır, güncel liste aynı anda arkada okunup bir sonraki yenileme için yerine yazılır.
  // Kişisel veri içermez (yalnız tablo adları). Saklanan liste yoksa / bozuksa eskisi gibi yanıt beklenir.
  protected static readonly DELTA_LISTE_KEY = 'bilir_delta_tablolar_v1';
  protected static readonly DELTA_LISTE_OMUR_MS = 7 * 86400000;
  protected static deltaListeOku(): Set<string> | null {
    try {
      const raw = browserLocalStorage?.getItem(BulutDepoKatmani.DELTA_LISTE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (!v || !Array.isArray(v.l) || typeof v.t !== 'number' || Date.now() - v.t > BulutDepoKatmani.DELTA_LISTE_OMUR_MS) return null;
      return new Set<string>(v.l.map((x: unknown) => String(x)));
    } catch {
      return null;
    }
  }
  protected static deltaListeYaz(set: Set<string>): void {
    try {
      browserLocalStorage?.setItem(BulutDepoKatmani.DELTA_LISTE_KEY, JSON.stringify({ t: Date.now(), l: Array.from(set).sort() }));
    } catch {
      /* depolama kapalı / dolu: liste her açılışta sorulur (eski davranış) */
    }
  }

  protected async deltaTables(): Promise<Set<string>> {
    if (this.deltaReady && Date.now() - this.deltaReadyAt < 30 * 60000) return this.deltaReady;
    if (!this.deltaReadyPromise) {
      this.deltaReadyPromise = (async () => {
        let set = new Set<string>();
        let okundu = false;
        try {
          const { data, error } = await supabase.rpc('sync_delta_tables');
          if (!error && Array.isArray(data)) {
            set = new Set(data.map((x: any) => String(x)));
            okundu = true;
          }
        } catch {
          /* işlev yoksa: tam okuma */
        }
        this.deltaReady = set;
        this.deltaReadyAt = Date.now();
        this.deltaReadyPromise = null;
        // Aşama 298: yalnız gerçekten okunan liste saklanır (bağlantı hatasında eldeki saklı liste bozulmaz)
        if (okundu) BulutDepoKatmani.deltaListeYaz(set);
        return set;
      })();
    }
    // Aşama 298: bu sayfa açılışında liste henüz okunmadıysa cihazda saklanan liste beklemeden kullanılır
    // (güncel liste yukarıda arkada okunuyor; gelince bellekteki ve saklanan liste yenilenir)
    if (!this.deltaReady) {
      const sakli = BulutDepoKatmani.deltaListeOku();
      if (sakli) return sakli;
    }
    return this.deltaReadyPromise;
  }

  protected async fetchTableSmart(
    table: 'messages' | 'grades' | 'attendance' | 'etuts' | 'etut_yoklama' | RawTable,
    isBackground: boolean,
    localIds: () => Iterable<string>,
    opts: { order?: string; ascending?: boolean; columns?: string },
    full: () => Promise<{ data: any[] | null; error: any }>
  ): Promise<{ mode: 'full'; data: any[] } | { mode: 'delta'; data: any[]; removed: Set<string> | null } | { mode: 'error'; error: any }> {
    const runFull = async () => {
      const r = await full();
      if (r.error || !Array.isArray(r.data)) return { mode: 'error' as const, error: r.error };
      // işaret, sunucunun saatine göre (cihaz saati yanlış olabilir): en son değişen satırın zamanı
      let mark = '';
      for (const row of r.data) if (row && typeof row.updated_at === 'string' && row.updated_at > mark) mark = row.updated_at;
      this.deltaState.set(table, { mark, idsAt: Date.now() });
      return { mode: 'full' as const, data: r.data };
    };
    const st = this.deltaState.get(table);
    // Aşama 103: kilitli önbellekten gelen tablo ilk okumada (ön planda da) yalnız değişenlerle tamamlanır;
    // idsAt = 0 olduğundan silinen / yeni görünür kayıtlar kimlik listesiyle hemen denetlenir
    const restored = !!st?.restored;
    if (st) st.restored = false;
    if ((!isBackground && !restored) || !st || !st.mark || this.getAuthSession()?.role === 'student') return runFull();
    if (!(await this.deltaTables()).has(table)) return runFull();
    const markMs = Date.parse(st.mark);
    if (Number.isNaN(markMs)) return runFull();
    // 1 dakika geriden başlanır: o sırada kaydı süren işlemler kaçmaz (aynı satırın tekrar gelmesi zararsızdır)
    const since = new Date(markMs - 60000).toISOString();
    const d = await fetchAllRows(table, (q: any) => q.gte('updated_at', since), opts);
    if (d.error || !Array.isArray(d.data)) return runFull();
    let rows: any[] = d.data;
    let removed: Set<string> | null = null;
    // Aşama 112: etüt başka öğretmene verilince eski öğretmene "değişti" olayı gelmez (satır artık ona görünmez);
    // etütlerde kimlik listesi her yenilemede sorulur (yalnız "id" sütunu; 111 öncesindeki tam okumadan çok küçük)
    // Aşama 193: öğrenci / öğretmen / sınıf / iletişim satırları da yetki değişince görünür ya da görünmez olur
    // (satırın kendisi değişmeden); bunlarda da kimlik listesi her yenilemede sorulur (yalnız "id" sütunu)
    if (table === 'etuts' || BulutDepoKatmani.IDS_EVERY_SYNC.has(table) || Date.now() - st.idsAt >= BulutDepoKatmani.DELTA_RECONCILE_MS) {
      const ids = await fetchAllRows(table, undefined, { columns: 'id' });
      if (!ids.error && Array.isArray(ids.data)) {
        const server = new Set<string>(ids.data.map((r: any) => String(r.id)));
        const local = new Set<string>(localIds());
        removed = new Set<string>();
        for (const id of local) if (!server.has(id)) removed.add(id);
        const got = new Set<string>(rows.map((r: any) => String(r.id)));
        const missing: string[] = [];
        for (const id of server) if (!local.has(id) && !got.has(id)) missing.push(id);
        let ok = true;
        for (let i = 0; i < missing.length && ok; i += 150) {
          const part = await fetchAllRows(table, (q: any) => q.in('id', missing.slice(i, i + 150)), opts);
          if (part.error || !Array.isArray(part.data)) ok = false;
          else rows = rows.concat(part.data);
        }
        if (!ok) return runFull();
        st.idsAt = Date.now();
      }
    }
    let mark = st.mark;
    for (const row of rows) if (row && typeof row.updated_at === 'string' && row.updated_at > mark) mark = row.updated_at;
    st.mark = mark;
    return { mode: 'delta', data: rows, removed };
  }

  // ===========================================================================
  // Aşama 193: ÖĞRENCİ / ÖĞRETMEN / SINIF / İLETİŞİM / SİLİNEN KAYIT LİSTELERİ DE ARTIMLI (sql/193)
  // Sunucudan gelen ham satırlar tablo başına bellekte tutulur; sonraki eşitlemelerde yalnız değişen satırlar
  // (ve kimlik listesi) indirilip bu listeye işlenir. Çağıran yine TAM satır listesini alır, böylece ekranlara
  // giden birleştirme kodu değişmez ve sonuç tam okumayla aynıdır. sql/193 kurulu değilse her şey eskisi gibi
  // tam okunur. Öğrenci rolü her zaman tam okur.
  // ===========================================================================
  protected rawRows = new Map<string, Map<string, any>>();
  protected static readonly IDS_EVERY_SYNC = new Set<string>(['students', 'student_contacts', 'teachers', 'classes']);

  protected async fetchRowsSmart(table: RawTable, isBackground: boolean, columns: string): Promise<{ data: any[] | null; error: any }> {
    const delta = this.getAuthSession()?.role !== 'student' && (await this.deltaTables()).has(table);
    const cols = delta && columns !== '*' && !columns.split(',').includes('updated_at') ? `${columns},updated_at` : columns;
    const full = () => fetchAllRows(table, undefined, { columns: cols });
    if (!delta) {
      this.rawRows.delete(table);
      this.deltaState.delete(table);
      return full();
    }
    const cache = this.rawRows.get(table);
    if (!cache) this.deltaState.delete(table); // bellekte liste yoksa ilk okuma tam yapılır
    const res = await this.fetchTableSmart(table, isBackground, () => (cache ? cache.keys() : []), { columns: cols }, full);
    if (res.mode === 'error') return { data: null, error: res.error };
    if (res.mode === 'full' || !cache) {
      const m = new Map<string, any>();
      for (const r of res.data) if (r && r.id != null) m.set(String(r.id), r);
      this.rawRows.set(table, m);
      return { data: res.data, error: null };
    }
    if (res.removed) for (const id of res.removed) cache.delete(id);
    for (const r of res.data) if (r && r.id != null) cache.set(String(r.id), r);
    return { data: Array.from(cache.values()), error: null };
  }

  // Tarayıcıya yalnızca belge bilgileri yazılır (dosya içerikleri değil)
  protected persistDocumentsLocal(): void {
    const light = this.documents.map(({ fileData, htmlPreview, tableSheets, ...rest }) => rest);
    saveData(STORAGE_KEYS.DOCUMENTS, light);
  }

  // =========================================================================
  // BULUT YAZMA YARDIMCILARI (Aşama 2)
  // =========================================================================

  // Bulut yazmasını bekler; hata olursa yerel değişikliği geri alır, kullanıcıya uyarı gösterir ve hata fırlatır.
  // `silent: true` ise uyarı göstermez ve hata fırlatmaz (yalnızca geri alır).
  protected async runCloudWrite(
    op: () => PromiseLike<{ error: any }>,
    rollback: () => void,
    userMessage: string,
    options?: { silent?: boolean; kuyruk?: boolean }
  ): Promise<boolean> {
    // Aşama 286: yazma başlarken listelerin o anki hâli (yalnız başvuru; kopya değil). Çağıranlar yerel değişikliği
    // yapıp hemen bu işlevi çağırır; yani bu an "yerel değişiklik uygulanmış" hâldir.
    const yazarken = this.geriAlmaGoruntusu();
    // Aşama 343: kutuda bekleyen kayıt varsa yenisi sıraya girer (sıra bozulmasın: önce ekleme, sonra düzeltme)
    if (options?.kuyruk && this.gidenKutusu.length > 0) {
      this.gidenKutusunaKoy({ op, rollback, userMessage, yazarken, deneme: 0 });
      return true;
    }
    let error: any = null;
    try {
      const res = await op();
      error = res?.error || null;
    } catch (e) {
      error = e;
    }
    if (!error) return true;

    // Aşama 343: bağlantı hatasında (yalnız tekrar gönderilmesi güvenli kayıtlarda) değişiklik silinmez, cihazda bekler
    if (options?.kuyruk && agHatasiMi(error)) {
      this.gidenKutusunaKoy({ op, rollback, userMessage, yazarken, deneme: 1 });
      return true;
    }

    const hataAninda = this.geriAlmaGoruntusu();
    rollback();
    this.geriAlmayiDaralt(yazarken, hataAninda);
    this.notify();
    // Aşama 304: bağlantı hatasında tarayıcının İngilizce teknik yazısı ("Failed to fetch") yerine ne olduğu yazılır
    const reason =
      error?.code === '42501'
        ? 'Bu işlem için yetkiniz yok'
        : agHatasiMi(error)
          ? baglantiNedeni()
          : error?.message || 'Bağlantı sorunu';
    console.warn(`[CloudWrite] ${userMessage}:`, error);
    if (options?.silent) return false;
    // Aşama 348: ne olduğu + ne yapılacağı (K4)
    this.showFloatingErrorToast(
      `${userMessage}.`,
      `${reason}. Ekrandaki değişiklik eski hâline döndü; ${agHatasiMi(error) ? 'bağlantı gelince' : 'biraz sonra'} bir daha deneyin.`
    );
    throw new Error(`${userMessage}: ${reason}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Aşama 343: GİDEN KUTUSU (bağlantı kopunca kayıt kaybolmaz)
  //  Sınıfta zayıf Wi-Fi'de alınan yoklama, not, ödev kontrolü, soru kaydı eskiden "geri alındı" diye siliniyordu.
  //  Artık bu kayıtlar (çağıran "kuyruk: true" der; yalnız tekrar gönderilmesi güvenli, yan etkisi olmayan yazmalar)
  //  ekranda kalır ve sırayla bekler; bağlantı gelince, sekmeye dönünce ya da artan aralıklarla yeniden gönderilir.
  //  - Sıra korunur; biri gitmeden arkadaki gönderilmez.
  //  - Sunucu kaydı REDDEDERSE (yetki, kural) yalnız o kayıt geri alınır ve kullanıcıya yazılır.
  //  - İlk denemede kayıt sunucuya ulaşıp yanıt kaybolduysa tekrar eklemede "zaten var" (23505) başarı sayılır.
  //  - Bekleyen kayıt varken sunucudan tam okuma yapılmaz (ekrandaki bekleyen değişikliği silerdi), sayfa kapatılırken
  //    ve çıkışta uyarı verilir, hareketsizlik çıkışı ertelenir. Kutu sekmede (bellekte) durur.
  // ---------------------------------------------------------------------------------------------------------------
  protected gidenKutusu: GidenIs[] = [];
  protected gidenGonderim: Promise<void> | null = null;
  protected gidenZamanlayici: ReturnType<typeof setTimeout> | null = null;
  protected gidenDinleyiciler = new Set<(n: number) => void>();

  /** Gönderilmeyi bekleyen kayıt sayısı (bağlantı şeridi, çıkış uyarısı) */
  public bekleyenKayitSayisi(): number {
    return this.gidenKutusu.length;
  }
  public bekleyenKayitDinle(fn: (n: number) => void): () => void {
    this.gidenDinleyiciler.add(fn);
    return () => {
      this.gidenDinleyiciler.delete(fn);
    };
  }
  protected gidenBildir(): void {
    const n = this.gidenKutusu.length;
    this.gidenDinleyiciler.forEach((fn) => {
      try {
        fn(n);
      } catch {
        /* dinleyici hatası kutuyu bozmaz */
      }
    });
  }
  protected gidenKutusunaKoy(is: GidenIs): void {
    this.gidenKutusu.push(is);
    this.gidenBildir();
    this.gidenZamanla();
  }
  protected gidenZamanla(): void {
    if (this.gidenZamanlayici || !this.gidenKutusu.length || typeof window === 'undefined') return;
    const deneme = this.gidenKutusu[0]?.deneme || 1;
    const bekle = Math.min(60_000, 5_000 * 2 ** Math.max(0, deneme - 1)); // 5, 10, 20, 40, 60 sn
    this.gidenZamanlayici = setTimeout(() => {
      this.gidenZamanlayici = null;
      void this.gidenKutusunuGonder();
    }, bekle);
  }

  /** Bekleyen kayıtları sırayla gönderir. Bağlantı yine yoksa durur, sonra yeniden dener. */
  public gidenKutusunuGonder(): Promise<void> {
    if (this.gidenGonderim) return this.gidenGonderim;
    if (!this.gidenKutusu.length) return Promise.resolve();
    if (this.gidenZamanlayici) {
      clearTimeout(this.gidenZamanlayici);
      this.gidenZamanlayici = null;
    }
    this.gidenGonderim = (async () => {
      while (this.gidenKutusu.length) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        const is = this.gidenKutusu[0];
        let error: any = null;
        try {
          const res = await is.op();
          error = res?.error || null;
        } catch (e) {
          error = e;
        }
        if (error && agHatasiMi(error)) {
          is.deneme++;
          break;
        }
        this.gidenKutusu.shift();
        if (error && !(is.deneme > 0 && error?.code === '23505')) {
          const hataAninda = this.geriAlmaGoruntusu();
          is.rollback();
          this.geriAlmayiDaralt(is.yazarken, hataAninda);
          this.notify();
          const reason = error?.code === '42501' ? 'Bu işlem için yetkiniz yok' : error?.message || 'Sunucu kaydı kabul etmedi';
          console.warn(`[GidenKutusu] ${is.userMessage}:`, error);
          this.showFloatingErrorToast(`${is.userMessage}.`, `${reason}. Bekleyen bu kayıt eski hâline döndü; bir daha girin.`);
        }
        this.gidenBildir();
      }
    })().finally(() => {
      this.gidenGonderim = null;
      this.gidenBildir();
      this.gidenZamanla();
    });
    return this.gidenGonderim;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Aşama 286: GERİ ALMA YALNIZ O KAYDI ETKİLER
  //  Eskiden başarısız yazmada listenin TAMAMI işlem öncesi hâline dönüyordu; yazma sürerken canlı kanaldan gelen başka
  //  kayıtlar (başka öğretmenin notu, yeni mesaj…) bir sonraki eşitlemeye kadar ekrandan kayboluyordu.
  //  Artık: geri alma işlevi listeyi eski hâline koyduktan sonra, bu işlemin DOKUNMADIĞI kayıtlar güncel hâlleriyle
  //  geri getirilir. "Bu işlemin dokunduğu kayıt" = işlem öncesi liste ile yazma başlarkenki liste arasında farklı olan.
  //  Kimliği olmayan kayıt içeren ya da geri almada değişmeyen listelere dokunulmaz (eski davranış aynen sürer).
  // ---------------------------------------------------------------------------------------------------------------
  protected static readonly GERI_ALMA_LISTELERI: Array<[GeriAlmaListe, string | null]> = [
    ['classes', STORAGE_KEYS.CLASSES],
    ['students', STORAGE_KEYS.STUDENTS],
    ['homeworks', STORAGE_KEYS.HOMEWORK],
    ['submissions', STORAGE_KEYS.SUBMISSIONS],
    ['etuts', STORAGE_KEYS.ETUTS],
    ['attendance', STORAGE_KEYS.ATTENDANCE],
    ['grades', STORAGE_KEYS.GRADES],
    ['messages', STORAGE_KEYS.MESSAGES],
    ['documents', null], // belgeler kendi yerel kayıt işleviyle yazılır (persistDocumentsLocal)
    ['questionLogs', STORAGE_KEYS.QUESTION_LOGS],
    ['weeklyQuestionTargets', STORAGE_KEYS.WEEKLY_QUESTION_TARGETS],
  ];

  protected geriAlmaGoruntusu(): Record<GeriAlmaListe, any[]> {
    const g = {} as Record<GeriAlmaListe, any[]>;
    for (const [ad] of BulutDepoKatmani.GERI_ALMA_LISTELERI) g[ad] = (this as any)[ad];
    return g;
  }

  protected geriAlmayiDaralt(yazarken: Record<GeriAlmaListe, any[]>, hataAninda: Record<GeriAlmaListe, any[]>): void {
    for (const [ad, anahtar] of BulutDepoKatmani.GERI_ALMA_LISTELERI) {
      try {
        const once: any[] = (this as any)[ad]; // geri alma işlevinin koyduğu "işlem öncesi" liste
        const simdi = hataAninda[ad];
        if (once === simdi || !Array.isArray(once) || !Array.isArray(simdi)) continue; // bu liste geri alınmadı
        const birlesik = geriAlYalnizDokunulan(simdi, once, yazarken[ad]);
        if (!birlesik) continue; // kimliksiz kayıt var: eski davranış
        (this as any)[ad] = birlesik;
        if (anahtar) saveData(anahtar, birlesik);
        else if (ad === 'documents') this.persistDocumentsLocal();
      } catch (e) {
        console.warn('[CloudWrite] geri alma daraltılamadı, liste işlem öncesi hâlinde bırakıldı:', ad, e);
      }
    }
  }

  // =========================================================================
  // ÖDEV / TESLİM / SORU KAYDI / HEDEF SATIR DÖNÜŞÜMLERİ (Aşama 4)
  // =========================================================================
  // Veritabanı satırına gömülebilecek en büyük dosya (≈1 MB). Daha büyükleri Aşama 5'te dosya deposuna taşınacak.
  public static readonly MAX_INLINE_FILE_CHARS = MAX_INLINE_FILE_CHARS;

  /**
   * Etüdün yoklaması. Aşama 196: etuts tablosu satırında yalnız etut_yoklama tablosu okunur; notes içindeki eski
   * kopyaya bakılmaz. Sunucu işlevinin ürettiği satırda (öğrenci, zümre, ortak takvim) sunucunun verdiği yoklama.
   */
  protected etutAttendanceOf(id: string, meta: any, fromTable: boolean): Record<string, EtutStudentAttendance> {
    if (fromTable && !(meta && meta.__redacted__ === true)) return { ...(this.etutYoklama.get(id) || {}) };
    return meta && meta.studentAttendance && typeof meta.studentAttendance === 'object' ? meta.studentAttendance : {};
  }

  // Aşama 17 (gizlilik): öğrenci etüt ve yoklama verisini tablodan değil, yalnız kendi kaydını
  // döndüren sunucu fonksiyonundan okur (16 numaralı SQL). Fonksiyon yoksa eski yola düşer.
  protected static studentRpcMissing = new Set<string>();
  protected async fetchStudentSafe(
    rpcName: 'student_my_etuts' | 'student_my_attendance',
    fallback: () => Promise<{ data: any[] | null; error: any }>
  ): Promise<{ data: any[] | null; error: any }> {
    if (this.getAuthSession()?.role !== 'student' || BulutDepoKatmani.studentRpcMissing.has(rpcName)) return fallback();
    const { data, error } = await supabase.rpc(rpcName);
    if (error) {
      const msg = `${error.code || ''} ${error.message || ''}`;
      if (/PGRST202|42883|Could not find the function|does not exist/i.test(msg)) {
        BulutDepoKatmani.studentRpcMissing.add(rpcName);
        return fallback();
      }
      return { data: null, error };
    }
    return { data: Array.isArray(data) ? data : [], error: null };
  }
  // Etüdün tüm öğretmenleri (sütun veya eski kayıtlarda notlar içindeki bilgi)
  public static etutTeacherIdsOf(col: any, meta: any): string[] | undefined {
    const src = Array.isArray(col) && col.length ? col : Array.isArray(meta) ? meta : null;
    if (!src) return undefined;
    const ids = Array.from(new Set(src.filter((x: any) => typeof x === 'string' && x)));
    return ids.length ? (ids as string[]) : undefined;
  }

  public isHomeworkForStudent(hw: Homework, student: { id: string; classId?: string }): boolean {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) return hw.assignedTo.includes(student.id);
    const { classIds } = homeworkTargets(hw);
    return !!student.classId && classIds.includes(student.classId);
  }

  protected homeworkFromRow(rh: any): Homework {
    const localHw = this.homeworks.find((h) => h.id === rh.id);
    const targetClassIds: string[] = Array.isArray(rh.target_class_ids) ? rh.target_class_ids.filter(Boolean) : [];
    const targetStudentIds: string[] = Array.isArray(rh.target_student_ids) ? rh.target_student_ids.filter(Boolean) : [];
    const base: Homework = {
      ...(localHw || {}),
      id: rh.id,
      title: rh.title || 'Ödev',
      description: rh.description || '',
      subject: rh.subject || 'Genel',
      learningOutcomes: Array.isArray(rh.learning_outcomes) ? rh.learning_outcomes : [],
      dueDate: rh.due_date || new Date().toISOString(),
      createdAt: rh.created_at || localHw?.createdAt || new Date().toISOString(),
      assignedDate: localHw?.assignedDate || rh.created_at || new Date().toISOString(),
      classId: targetClassIds[0] || rh.class_id || 'class-default',
      assignedTo: targetStudentIds.length > 0 ? targetStudentIds : 'all',
      teacherId: rh.teacher_id || localHw?.teacherId,
      teacherName: rh.teacher_name || localHw?.teacherName,
      teacherAuthId: rh.teacher_auth_id || undefined,
      updatedAt: rh.updated_at || undefined,
      submissions: undefined,
    };
    const withExtras = applyHomeworkRowExtras(rh, base);
    return {
      ...withExtras,
      targetClassIds: targetClassIds.length > 0 ? targetClassIds : withExtras.targetClassIds || [],
      assignedTo: base.assignedTo,
      isGlobalForNewStudents: false,
    };
  }

  protected submissionFromRow(r: any): HomeworkSubmission {
    return {
      id: r.id,
      homeworkId: r.homework_id,
      studentId: r.student_id,
      studentName: r.student_name || this.findStudentFast(r.student_id)?.name || 'Öğrenci',
      submittedAt: r.submitted_at || r.updated_at || new Date().toISOString(),
      status: r.status === 'late' || r.status === 'not_submitted' ? r.status : 'on_time',
      checkStatus: r.check_status || undefined,
      notes: r.notes || '',
      attachmentLink: r.attachment_link || undefined,
      resources: Array.isArray(r.resources) ? r.resources : [],
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      feedback: r.feedback || undefined,
    };
  }

  protected persistQuestionLogsLocal(): void {
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
  }

  // HIZ (Aşama 88): kimliğe göre öğrenci bulma. Eskiden her not / teslim satırı için öğrenci listesi baştan
  // taranıyordu (20.000 not × 2.000 öğrenci). Dizin, liste değişince kendiliğinden yeniden kurulur; yerinde
  // güncellenen öğrencinin her zaman güncel hâli döner.
  protected studentIndex: { src: Student[] | null; len: number; map: Map<string, number> } = { src: null, len: -1, map: new Map() };
  /** Aşama 171: ekranlar için hızlı öğrenci bulma (Map, döngü yok) */
  public studentById(id: string | null | undefined): Student | undefined {
    return this.findStudentFast(id);
  }
  protected findStudentFast(id: string | null | undefined): Student | undefined {
    if (!id) return undefined;
    const list = this.students;
    let ix = this.studentIndex;
    if (ix.src !== list || ix.len !== list.length) {
      const map = new Map<string, number>();
      for (let i = 0; i < list.length; i++) if (list[i] && !map.has(list[i].id)) map.set(list[i].id, i);
      ix = this.studentIndex = { src: list, len: list.length, map };
    }
    const i = ix.map.get(id);
    if (i !== undefined && list[i]?.id === id) return list[i];
    if (i === undefined) return undefined;
    // dizin eskimiş (liste yerinde değişmiş): bir kez yeniden kur
    this.studentIndex = { src: null, len: -1, map: new Map() };
    return list.find((s) => s.id === id);
  }

  protected gradeFromRow(rg: any): GradeRecord {
    const student = this.findStudentFast(rg.student_id);
    return {
      id: rg.id,
      studentId: rg.student_id,
      studentName: student?.name,
      classId: rg.class_id,
      subject: rg.subject,
      score: Number(rg.score),
      maxScore: rg.max_score !== null && rg.max_score !== undefined ? Number(rg.max_score) : undefined,
      examType: rg.exam_type || '1. Yazılı',
      date: rg.date,
      remarks: rg.remarks || undefined,
      createdBy: rg.created_by || undefined,
    };
  }
}
