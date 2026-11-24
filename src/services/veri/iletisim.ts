// ============================================================================
// Aşama 360: YOKLAMA, NOT VE İLETİŞİM: yoklama, notlar, mesajlar, duyurular, belgeler, öğrenci bildirimleri
// dataService.ts'ten KELİMESİ KELİMESİNE taşındı; yalnız "private" → "protected" (alt katmanlar kullanabilsin diye) ve
// statik değerlerde "DataService." → tanımlandığı katmanın adı. Davranış aynı. Katman sırası: temel → kurumYetki → bulutDepo → esitleme → hesaplar → okulKayitlari → iletisim → odevEtut → soruTakibi → dataService
// ============================================================================
import {
  Student,
  Teacher,
  Homework,
  Etut,
  AttendanceRecord,
  AttendanceStatus,
  GradeRecord,
  StudentMessage,
  AnnouncementGroup,
  TeacherDocument,
  StudentNotification,
  SentEmailLog,
} from '../../types';
import { supabase } from '../../lib/supabase';
import { uploadFile, removeStoredFiles } from '../../lib/fileStorage';
import {
  odevAlicilari,
  etutAlicilari,
  odevBildirimleriHazirla,
  etutBildirimleriHazirla,
  type HazirBildirimler,
} from '../bildirimService';
import { sendBrowserNotification } from '../../lib/browserNotifications';
import { newId } from '../../lib/ids';
import { notifyPush } from '../../lib/push';
import { STORAGE_KEYS, saveData } from '../depo';
import { gradeToRow, attendanceToRow, messageToRow, rowToNotif, notifToRow } from '../satirDonusumleri';
import { yoklamaFarki } from '../listeBirlestirme';
import { isMissingNotifTable } from '../hataMetinleri';
import { deleteRowsVerified, hasCloudSession } from '../bulutIslemleri';
import { isTeacherAuthoredMessage, buildAnnouncementGroups } from '../kayitKurallari';
import { OkulKayitKatmani } from './okulKayitlari';

export abstract class IletisimKatmani extends OkulKayitKatmani {

  protected messageReplierColumnMissing = false; // Aşama 45: 35 numaralı SQL yoksa
  protected notifCloudDisabled = false; // Aşama 45: 37 numaralı SQL yoksa bildirimler yalnızca tarayıcıda
  protected notifLastSync = 0;

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
  protected async yoklamaBirlestir(
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
  protected yoklamaBirlestirYok = false;

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
  protected assertOwnedRecord(rec: { createdBy?: string } | null | undefined, what: 'not' | 'yoklama'): void {
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

  public getGrades(forTeacherId?: string): GradeRecord[] {
    return this.memoView('Grades:' + (forTeacherId || ''), [this.grades, this.teachers, this.classes, this.students], this.viewKey(forTeacherId || ''), () => this.computeGrades(forTeacherId));
  }
  protected computeGrades(forTeacherId?: string): GradeRecord[] {
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
  protected computeAttendance(forTeacherId?: string): AttendanceRecord[] {
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
  protected computeMessages(forTeacherId?: string): StudentMessage[] {
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

  // ==================== TEACHER DOCUMENTS ARCHIVE ====================
  public getTeacherDocuments(): TeacherDocument[] {
    return this.memoView('TeacherDocuments', [this.documents, this.teachers, this.classes, this.students], this.viewKey(), () => this.computeTeacherDocuments());
  }
  protected computeTeacherDocuments(): TeacherDocument[] {
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

  protected static readonly NOTIF_COLUMNS =
    'id,student_id,type,title,message,source_id,source_title,teacher_name,created_at,read_at,link_tab';

  /** Öğretmen: hazırlanan bildirimleri buluta yazar. Başarılıysa true (hata kullanıcıya gösterilmez). */
  protected async pushNotificationsToCloud(list: StudentNotification[]): Promise<boolean> {
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
      let q = supabase.from('student_notifications').select(IletisimKatmani.NOTIF_COLUMNS).order('created_at', { ascending: false });
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

  protected cloudNotifWrite(run: () => PromiseLike<{ error: any }>): void {
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

  protected hazirBildirimleriUygula(h: HazirBildirimler): number {
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
  protected pushVisibleStudentNotifs(list: StudentNotification[]): void {
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
}
